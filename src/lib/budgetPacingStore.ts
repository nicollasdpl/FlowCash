import {
  collection, deleteDoc, doc, getDocFromServer, getDocs, limit, orderBy, query, runTransaction,
  serverTimestamp, setDoc,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import type { AppState } from "@/context/AppContext";
import type { WeekBounds, WeekSnapshot } from "@/lib/budgetPacing";
import { closeWeek, collectWeekVariableSpend, previousWeekBounds, resolveWeekSnapshot, snapshotReadiness } from "@/lib/budgetPacing";

const stateRef = (uid: string) => doc(db, "users", uid, "app", "state");
const configRef = (uid: string) => doc(db, "users", uid, "budgetPacing", "config");
const weekRef = (uid: string, weekStart: string) => doc(db, "users", uid, "budgetPacingWeeks", weekStart);

/** A leitura obrigatória do servidor faz a guarda de hidratação sem depender do cache local. */
export interface ConfirmedAppState { hydrated: true; state: AppState }
export async function readConfirmedAppState(uid: string): Promise<ConfirmedAppState | null> {
  const snapshot = await getDocFromServer(stateRef(uid));
  return snapshot.exists() ? { hydrated: true, state: snapshot.data() as AppState } : null;
}

export async function readVariableCategoryConfig(uid: string): Promise<string[] | null> {
  const snapshot = await getDocFromServer(configRef(uid));
  if (!snapshot.exists()) return null;
  const ids = snapshot.data().variableCategoryIds;
  return Array.isArray(ids) ? ids.filter((id): id is string => typeof id === "string") : null;
}

export async function saveVariableCategoryConfig(uid: string, ids: readonly string[] | null): Promise<void> {
  await setDoc(configRef(uid), { variableCategoryIds: ids === null ? null : [...new Set(ids)], updatedAt: serverTimestamp() }, { merge: true });
}

export async function createWeekSnapshotOnce(uid: string, candidate: WeekSnapshot, confirmed: ConfirmedAppState): Promise<WeekSnapshot> {
  if (snapshotReadiness(confirmed.hydrated, confirmed.state, candidate.variableCategoryIds) !== "ready") {
    throw new Error("Snapshot bloqueado: hidratação remota ou dados financeiros incompletos.");
  }
  return runTransaction(db, async transaction => {
    const ref = weekRef(uid, candidate.semanaInicio);
    const existing = await transaction.get(ref);
    if (existing.exists()) return resolveWeekSnapshot(existing.data() as WeekSnapshot, candidate);
    transaction.set(ref, { ...candidate, createdAt: serverTimestamp() }, { merge: true });
    return candidate;
  });
}

export async function deleteCurrentWeekSnapshot(uid: string, weekStart: string): Promise<void> {
  await deleteDoc(weekRef(uid, weekStart));
}

export async function readWeekSnapshot(uid: string, weekStart: string): Promise<WeekSnapshot | null> {
  const snapshot = await getDocFromServer(weekRef(uid, weekStart));
  return snapshot.exists() ? snapshot.data() as WeekSnapshot : null;
}

export async function closePreviousWeekIfNeeded(uid: string, current: WeekBounds, state: AppState): Promise<void> {
  const previous = previousWeekBounds(current);
  await runTransaction(db, async transaction => {
    const ref = weekRef(uid, previous.semanaInicio);
    const docSnapshot = await transaction.get(ref);
    if (!docSnapshot.exists()) return;
    const snapshot = docSnapshot.data() as WeekSnapshot;
    if (snapshot.saldoSemana !== undefined) return;
    const spend = collectWeekVariableSpend({
      bounds: snapshot, throughDate: snapshot.semanaFim,
      variableCategoryIds: snapshot.variableCategoryIds, accounts: state.accounts,
      transactions: state.transactions, purchases: state.purchases,
      installments: state.installments, cards: state.cards,
    });
    const closed = closeWeek(snapshot, spend.gastoSemana);
    transaction.update(ref, {
      gastoSemana: closed.gastoSemana,
      cotaSemanal: closed.cotaSemanal,
      saldoSemana: closed.saldoSemana,
    });
  });
}

export async function readRecentWeekSnapshots(uid: string): Promise<WeekSnapshot[]> {
  const snapshot = await getDocs(query(collection(db, "users", uid, "budgetPacingWeeks"), orderBy("semanaInicio", "desc"), limit(8)));
  return snapshot.docs.map(item => item.data() as WeekSnapshot);
}
