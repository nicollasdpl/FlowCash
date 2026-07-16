"use client";
import {
  createContext, useContext, useReducer, useEffect,
  useState, useRef, ReactNode,
} from "react";
import type { User } from "firebase/auth";
import {
  onAuthStateChanged, signInWithPopup,
  GoogleAuthProvider, signOut as fbSignOut,
} from "firebase/auth";
import { doc, getDoc, onSnapshot, setDoc, serverTimestamp, Timestamp } from "firebase/firestore";
import { auth, db } from "@/lib/firebase";
import type {
  Account, Transaction, CreditCard, CardPurchase, CardInstallment,
  Goal, Category, Budget,
} from "@/types/financial";
import { SEED_INVOICE_PAYMENT_CATEGORY_ID, SEED_LOAN_INCOME_CATEGORY_ID, SEED_LOAN_EXPENSE_CATEGORY_ID } from "@/types/financial";
import { generateInstallments, generateSubscriptionInstallment, getCompetenceMonth } from "@/engine/invoiceEngine";
import { addMonths } from "@/engine/financialEngine";
import { DEFAULT_NOTIFICATION_PREFS } from "@/lib/notifications/types";

export type {
  Account, Transaction, CreditCard, CardPurchase, CardInstallment,
  Goal, Category, Budget,
};

// ─── STATE ────────────────────────────────────────────────────────────────────

export interface AppState {
  userName: string;
  notificationPrefs: import("@/lib/notifications/types").NotificationPrefs;
  accounts: Account[];
  transactions: Transaction[];
  cards: CreditCard[];
  purchases: CardPurchase[];
  installments: CardInstallment[];
  goals: Goal[];
  categories: Category[];
  budgets: Budget[];
  /** Aprendizado do import: estabelecimento normalizado → categoryId. */
  merchantCategoryCache: Record<string, string>;
}

type Action =
  | { type: "LOAD"; payload: AppState }
  | { type: "SET_USER_NAME"; payload: string }
  | { type: "SET_NOTIFICATION_PREFS"; payload: import("@/lib/notifications/types").NotificationPrefs }
  | { type: "ADD_ACCOUNT"; payload: Account }
  | { type: "UPD_ACCOUNT"; payload: Account }
  | { type: "DEL_ACCOUNT"; payload: string }
  | { type: "ADD_TX"; payload: Transaction }
  | { type: "UPD_TX"; payload: Transaction }
  | { type: "DEL_TX"; payload: string }
  | { type: "ADD_CARD"; payload: CreditCard }
  | { type: "UPD_CARD"; payload: CreditCard }
  | { type: "DEL_CARD"; payload: string }
  | { type: "ADD_PURCHASE"; payload: { purchase: CardPurchase; card: CreditCard } }
  | { type: "DEL_PURCHASE"; payload: string }
  | { type: "PAY_INSTALLMENT"; payload: { installmentId: string; paidAt: string } }
  | { type: "UNPAY_INSTALLMENT"; payload: string }
  | { type: "ADD_GOAL"; payload: Goal }
  | { type: "UPD_GOAL"; payload: Goal }
  | { type: "DEL_GOAL"; payload: string }
  | { type: "ADD_BUDGET"; payload: Budget }
  | { type: "UPD_BUDGET"; payload: Budget }
  | { type: "DEL_BUDGET"; payload: string }
  | { type: "ADD_CATEGORY"; payload: Category }
  | { type: "UPD_CATEGORY"; payload: Category }
  | { type: "DEL_CATEGORY"; payload: string }
  | { type: "BULK_ADD_TX"; payload: Transaction[] }
  | { type: "ADD_INSTALLMENTS"; payload: CardInstallment[] }
  | { type: "MERGE_MERCHANT_CACHE"; payload: Record<string, string> };

// ─── SEED ─────────────────────────────────────────────────────────────────────

const SEED_CATEGORIES: Category[] = [
  { id: "cat_alimentacao", name: "Alimentação",   type: "expense", color: "#FF8C42", icon: "UtensilsCrossed" },
  { id: "cat_transporte",  name: "Transporte",    type: "expense", color: "#4A9EFF", icon: "Car" },
  { id: "cat_lazer",       name: "Lazer",         type: "expense", color: "#A855F7", icon: "Gamepad2" },
  { id: "cat_saude",       name: "Saúde",         type: "expense", color: "#FF4D6A", icon: "Heart" },
  { id: "cat_moradia",     name: "Moradia",       type: "expense", color: "#FFB830", icon: "Home" },
  { id: "cat_educacao",    name: "Educação",      type: "expense", color: "#00BCD4", icon: "BookOpen" },
  { id: "cat_vestuario",   name: "Vestuário",     type: "expense", color: "#E91E63", icon: "ShoppingBag" },
  { id: "cat_eletronicos", name: "Viagem",        type: "expense", color: "#03A9F4", icon: "Plane" },
  { id: "cat_outros",      name: "Outros",        type: "expense", color: "#607D8B", icon: "Tag" },
  { id: "cat_salario",     name: "Salário",       type: "income",  color: "#00E5A0", icon: "Wallet" },
  { id: "cat_freelance",   name: "Pets",          type: "expense", color: "#8BC34A", icon: "PawPrint" },
  { id: "cat_investimento",name: "Investimentos", type: "income",  color: "#00E5A0", icon: "TrendingUp" },
  { id: SEED_INVOICE_PAYMENT_CATEGORY_ID, name: "Pagamento de Fatura", type: "expense", color: "#6B7280", icon: "CreditCard", isSystem: true },
  { id: SEED_LOAN_INCOME_CATEGORY_ID, name: "Empréstimo", type: "income", color: "#00E5A0", icon: "Landmark", excludeFromReports: true },
  { id: SEED_LOAN_EXPENSE_CATEGORY_ID, name: "Empréstimos", type: "expense", color: "#F59E0B", icon: "Landmark" },
];

export const SEED_CATEGORY_IDS = new Set(SEED_CATEGORIES.map(c => c.id));

const seed: AppState = {
  userName: "",
  notificationPrefs: DEFAULT_NOTIFICATION_PREFS,
  accounts: [],
  transactions: [],
  cards: [],
  purchases: [],
  installments: [],
  goals: [],
  categories: SEED_CATEGORIES,
  budgets: [],
  merchantCategoryCache: {},
};

// ─── SEED ICON MIGRATION ──────────────────────────────────────────────────────

function normalizeCatName(name: string): string {
  return name.toLowerCase().normalize("NFD").replace(/\p{M}/gu, "").trim();
}

const SEED_ICON_MAP: Record<string, { icon: string; color: string }> = {
  "alimentacao":   { icon: "UtensilsCrossed", color: "#FF8C42" },
  "transporte":    { icon: "Car",             color: "#4A9EFF" },
  "moradia":       { icon: "Home",            color: "#FFB830" },
  "saude":         { icon: "Heart",           color: "#FF4D6A" },
  "lazer":         { icon: "Gamepad2",        color: "#A855F7" },
  "educacao":      { icon: "BookOpen",        color: "#00BCD4" },
  "vestuario":     { icon: "ShoppingBag",     color: "#E91E63" },
  "viagem":        { icon: "Plane",           color: "#03A9F4" },
  "pets":          { icon: "PawPrint",        color: "#8BC34A" },
  "salario":       { icon: "Wallet",          color: "#00E5A0" },
  "investimentos": { icon: "TrendingUp",      color: "#00E5A0" },
  "freelance":     { icon: "Briefcase",       color: "#00E5A0" },
  "eletronicos":   { icon: "Zap",             color: "#4A9EFF" },
  "para mim":      { icon: "Star",            color: "#FFB830" },
  "outros":        { icon: "Tag",             color: "#607D8B" },
};

// ─── REDUCER ──────────────────────────────────────────────────────────────────

function reducer(state: AppState, action: Action): AppState {
  switch (action.type) {
    case "LOAD": {
      const payloadCats = action.payload.categories;
      const baseCategories = Array.isArray(payloadCats) && payloadCats.length > 0
        ? payloadCats.map((cat: Category) => {
            // Já é um nome Lucide válido (PascalCase) → manter sem tocar
            if (/^[A-Z][A-Za-z0-9]+$/.test(cat.icon ?? "")) return cat;
            // Emoji / inválido → tentar mapear pelo nome da categoria
            const mapped = SEED_ICON_MAP[normalizeCatName(cat.name ?? "")];
            if (mapped) return { ...cat, icon: mapped.icon, color: mapped.color };
            // Categoria personalizada sem mapeamento → Tag, manter cor existente
            return { ...cat, icon: "Tag" };
          })
        : seed.categories;
      // Garante que categorias seed importantes sempre existam, inclusive em
      // estados já persistidos antes desta versão: "Pagamento de Fatura" e as
      // categorias de empréstimo (receita que não conta como renda + despesa).
      const ensuredSeedIds = [
        SEED_INVOICE_PAYMENT_CATEGORY_ID,
        SEED_LOAN_INCOME_CATEGORY_ID,
        SEED_LOAN_EXPENSE_CATEGORY_ID,
      ];
      const categories = ensuredSeedIds.reduce((cats, id) => {
        if (cats.some(c => c.id === id)) return cats;
        const seedCat = seed.categories.find(c => c.id === id);
        return seedCat ? [...cats, seedCat] : cats;
      }, baseCategories);
      return {
        ...seed,
        ...action.payload,
        categories,
        merchantCategoryCache: action.payload.merchantCategoryCache ?? {},
        notificationPrefs: {
          ...DEFAULT_NOTIFICATION_PREFS,
          ...(action.payload.notificationPrefs ?? {}),
        },
      };
    }
    case "SET_USER_NAME":
      return { ...state, userName: action.payload };
    case "SET_NOTIFICATION_PREFS":
      return { ...state, notificationPrefs: action.payload };

    case "ADD_ACCOUNT":
      return { ...state, accounts: [...state.accounts, action.payload] };
    case "UPD_ACCOUNT":
      return { ...state, accounts: state.accounts.map(a => a.id === action.payload.id ? action.payload : a) };
    case "DEL_ACCOUNT":
      return { ...state, accounts: state.accounts.filter(a => a.id !== action.payload) };

    case "BULK_ADD_TX":
      return { ...state, transactions: [...action.payload, ...state.transactions] };

    case "ADD_INSTALLMENTS":
      return { ...state, installments: [...state.installments, ...action.payload] };

    case "ADD_TX":
      return { ...state, transactions: [action.payload, ...state.transactions] };
    case "UPD_TX":
      return { ...state, transactions: state.transactions.map(t => t.id === action.payload.id ? action.payload : t) };
    case "DEL_TX":
      return { ...state, transactions: state.transactions.filter(t => t.id !== action.payload) };

    case "ADD_CARD":
      return { ...state, cards: [...state.cards, action.payload] };
    case "UPD_CARD":
      return { ...state, cards: state.cards.map(c => c.id === action.payload.id ? action.payload : c) };
    case "DEL_CARD": {
      const cardId = action.payload;
      const removedPurchaseIds = new Set(
        state.purchases.filter(p => p.cardId === cardId).map(p => p.id)
      );
      return {
        ...state,
        cards: state.cards.filter(c => c.id !== cardId),
        purchases: state.purchases.filter(p => p.cardId !== cardId),
        installments: state.installments.filter(
          i => i.cardId !== cardId && !removedPurchaseIds.has(i.purchaseId)
        ),
      };
    }

    case "ADD_PURCHASE": {
      const { purchase, card } = action.payload;
      let newInstallments: CardInstallment[];
      if (purchase.isSubscription) {
        const firstCm = getCompetenceMonth(purchase.purchaseDate, card.closingDay);
        newInstallments = Array.from({ length: 12 }, (_, i) =>
          generateSubscriptionInstallment(purchase, card, addMonths(firstCm, i))
        );
      } else {
        newInstallments = generateInstallments(purchase, card, state.installments);
      }
      return {
        ...state,
        purchases: [...state.purchases, purchase],
        installments: [...state.installments, ...newInstallments],
      };
    }
    case "DEL_PURCHASE": {
      const purchaseId = action.payload;
      const purchase = state.purchases.find(p => p.id === purchaseId);
      return {
        ...state,
        purchases: state.purchases.filter(p => p.id !== purchaseId),
        installments: state.installments.filter(i => {
          if (i.purchaseId !== purchaseId) return true;
          if (purchase?.isSubscription) return i.paid; // keep paid history
          return false;
        }),
      };
    }

    case "PAY_INSTALLMENT":
      return {
        ...state,
        installments: state.installments.map(i =>
          i.id === action.payload.installmentId
            ? { ...i, paid: true, paidAt: action.payload.paidAt }
            : i
        ),
      };
    case "UNPAY_INSTALLMENT":
      return {
        ...state,
        installments: state.installments.map(i =>
          i.id === action.payload ? { ...i, paid: false, paidAt: undefined } : i
        ),
      };

    case "ADD_GOAL":
      return { ...state, goals: [...state.goals, action.payload] };
    case "UPD_GOAL":
      return { ...state, goals: state.goals.map(g => g.id === action.payload.id ? action.payload : g) };
    case "DEL_GOAL":
      return { ...state, goals: state.goals.filter(g => g.id !== action.payload) };

    case "ADD_BUDGET":
      return { ...state, budgets: [...state.budgets, action.payload] };
    case "UPD_BUDGET":
      return { ...state, budgets: state.budgets.map(b => b.id === action.payload.id ? action.payload : b) };
    case "DEL_BUDGET":
      return { ...state, budgets: state.budgets.filter(b => b.id !== action.payload) };

    case "MERGE_MERCHANT_CACHE":
      return {
        ...state,
        merchantCategoryCache: { ...state.merchantCategoryCache, ...action.payload },
      };

    case "ADD_CATEGORY":
      return { ...state, categories: [...state.categories, action.payload] };
    case "UPD_CATEGORY":
      return { ...state, categories: state.categories.map(c => c.id === action.payload.id ? action.payload : c) };
    case "DEL_CATEGORY":
      return { ...state, categories: state.categories.filter(c => c.id !== action.payload) };

    default:
      return state;
  }
}

// ─── CONTEXT ──────────────────────────────────────────────────────────────────

interface CtxType {
  state: AppState;
  dispatch: React.Dispatch<Action>;
  user: User | null;
  authLoading: boolean;
  signIn: () => Promise<void>;
  signOut: () => Promise<void>;
  syncNow: () => Promise<void>;
  syncState: "idle" | "syncing" | "synced" | "error";
  lastSyncedAt: number | null;
  lastSyncError: string | null;
}

const Ctx = createContext<CtxType | null>(null);

const FIRESTORE_DOC = (uid: string) => doc(db, "users", uid, "app", "state");
// Cache local por CONTA (uid). Evita que outra conta no mesmo navegador veja/
// herde os dados via localStorage. (A chave antiga compartilhada era "flowcash_v2".)
const LS_KEY = (uid: string) => `flowcash_v2_${uid}`;

// Formato persistido — AppState + campo de versionamento (nunca entra no reducer)
type PersistedState = AppState & { updatedAt?: number };

function isEmptyAppState(s: AppState): boolean {
  return (
    s.accounts.length === 0 &&
    s.transactions.length === 0 &&
    s.purchases.length === 0 &&
    s.cards.length === 0
  );
}

function remoteUpdatedAt(remote: AppState & { updatedAt?: unknown }): number {
  const ts = remote.updatedAt;
  return ts instanceof Timestamp ? ts.toMillis() : typeof ts === "number" ? ts : 0;
}

export function AppProvider({ children }: { children: ReactNode }) {
  const [state, rawDispatch] = useReducer(reducer, seed);
  const [user, setUser]   = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [isReady, setIsReady]         = useState(false);
  const [syncState, setSyncState]       = useState<"idle" | "syncing" | "synced" | "error">("idle");
  const [lastSyncedAt, setLastSyncedAt] = useState<number | null>(null);
  const [lastSyncError, setLastSyncError] = useState<string | null>(null);

  // Versão (ms do SERVIDOR) do dado que está no estado agora — base de comparação.
  const loadedAtRef  = useRef<number>(0);
  // True somente quando o usuário fez uma mudança real — evita salvar dados de localStorage no Firestore
  const needsFirestoreSyncRef = useRef<boolean>(false);

  // dispatch público: marca needsFirestoreSync em ações do usuário (não em LOADs de storage)
  const dispatch = (action: Action): void => {
    if (action.type !== "LOAD") needsFirestoreSyncRef.current = true;
    rawDispatch(action);
  };

  // ── Auth listener ─────────────────────────────────────────────────────────
  useEffect(() => {
    const unsubAuth = onAuthStateChanged(auth, (firebaseUser) => {
      setUser(firebaseUser);
      if (!firebaseUser) {
        dispatch({ type: "LOAD", payload: seed });
        loadedAtRef.current         = 0;
        needsFirestoreSyncRef.current = false;
        setAuthLoading(false);
        setIsReady(false);
      } else {
        setAuthLoading(false);
      }
    });
    return () => unsubAuth();
  }, []);

  // ── Load imediato do localStorage + listener em tempo real do Firestore ───
  useEffect(() => {
    if (!user) return;

    // Segurança/migração: remove o cache legado COMPARTILHADO entre contas
    // (vazava os dados de uma conta para outra no mesmo navegador).
    try { localStorage.removeItem("flowcash_v2"); } catch {}

    // 1. Exibe o cache DESTA conta imediatamente; sem cache, começa limpo (seed).
    //    O Firestore (por uid) restaura os dados na sequência.
    let shouldPullRemote = false;
    try {
      const raw = localStorage.getItem(LS_KEY(user.uid));
      if (raw) {
        const local = JSON.parse(raw) as PersistedState;
        if (isEmptyAppState(local)) {
          loadedAtRef.current = 0;
          shouldPullRemote = true;
        } else {
          loadedAtRef.current = local.updatedAt ?? 0;
        }
        dispatch({ type: "LOAD", payload: local });
      } else {
        loadedAtRef.current = 0;
        shouldPullRemote = true;
        dispatch({ type: "LOAD", payload: seed });
      }
    } catch {
      loadedAtRef.current = 0;
      shouldPullRemote = true;
      dispatch({ type: "LOAD", payload: seed });
    }

    setIsReady(true);

    // Cache vazio no localhost (ou só seed): puxa Firestore na hora — produção e dev
    // usam origens diferentes, então o cache local não vem da Vercel automaticamente.
    if (shouldPullRemote) {
      void (async () => {
        try {
          const snap = await getDoc(FIRESTORE_DOC(user.uid));
          if (!snap.exists()) return;
          const remote = snap.data() as AppState & { updatedAt?: unknown };
          const remoteMs = remoteUpdatedAt(remote);
          if (remoteMs <= loadedAtRef.current) return;
          loadedAtRef.current = remoteMs;
          const persisted: PersistedState = { ...(remote as AppState), updatedAt: remoteMs };
          try { localStorage.setItem(LS_KEY(user.uid), JSON.stringify(persisted)); } catch {}
          dispatch({ type: "LOAD", payload: persisted });
        } catch (err) {
          console.error("Firestore initial pull error:", err);
        }
      })();
    }

    // 2. Listener em tempo real — sincroniza outros dispositivos
    const unsubSnapshot = onSnapshot(
      FIRESTORE_DOC(user.uid),
      (snap) => {
        if (!snap.exists()) return;
        // Eco otimista do nosso próprio write (ainda não confirmado): ignora.
        if (snap.metadata.hasPendingWrites) return;
        // Mudança local ainda não enviada: não sobrescreve — o debounce vai empurrar.
        if (needsFirestoreSyncRef.current) return;

        const remote = snap.data() as AppState & { updatedAt?: unknown };
        const remoteMs = remoteUpdatedAt(remote);
        // Aplica só se o servidor for mais novo — não sobrescreve dados locais
        // ainda não enviados com um doc do servidor mais antigo.
        if (remoteMs <= loadedAtRef.current) return;
        loadedAtRef.current = remoteMs;
        const persisted: PersistedState = { ...(remote as AppState), updatedAt: remoteMs };
        try { localStorage.setItem(LS_KEY(user.uid), JSON.stringify(persisted)); } catch {}
        dispatch({ type: "LOAD", payload: persisted });
      },
      (err) => console.error("Firestore snapshot error:", err),
    );

    return () => unsubSnapshot();
  }, [user]);

  // ── Salva localStorage imediatamente a cada dispatch ──────────────────────
  // updatedAt = última versão conhecida do servidor (loadedAtRef), pra manter a
  // comparação de versão sempre no MESMO domínio de tempo (servidor).
  useEffect(() => {
    if (!user) return;
    const toSave: PersistedState = { ...state, updatedAt: loadedAtRef.current };
    try { localStorage.setItem(LS_KEY(user.uid), JSON.stringify(toSave)); } catch {}
  }, [state, user]);

  // ── Salva no Firestore com debounce de 1.5s (apenas mudanças do usuário) ──
  useEffect(() => {
    if (!isReady || !user) return;
    if (!needsFirestoreSyncRef.current) return; // não salvar carregamentos de storage
    const timer = setTimeout(async () => {
      // updatedAt = serverTimestamp(): ordenação por relógio do SERVIDOR, imune à
      // diferença de horário entre dispositivos. O eco local é ignorado no
      // onSnapshot via metadata.hasPendingWrites.
      try {
        await setDoc(FIRESTORE_DOC(user.uid), { ...state, updatedAt: serverTimestamp() });
        needsFirestoreSyncRef.current = false;
        setLastSyncError(null);
      } catch (err) {
        console.error("Firestore save error:", err);
        setSyncState("error");
        setLastSyncError(err instanceof Error ? err.message : String(err));
      }
    }, 1500);
    return () => clearTimeout(timer);
  }, [state, user, isReady]);

  // ── Auto-gerar parcelas de assinaturas para os próximos 12 meses ─────────
  useEffect(() => {
    if (!user || !isReady) return;
    const subscriptions = state.purchases.filter(p => p.isSubscription);
    if (subscriptions.length === 0) return;
    const todayDate = new Date().toISOString().split("T")[0];
    const toAdd: CardInstallment[] = [];
    for (const purchase of subscriptions) {
      const card = state.cards.find(c => c.id === purchase.cardId);
      if (!card) continue;
      const startCm = getCompetenceMonth(todayDate, card.closingDay);
      for (let i = 0; i < 12; i++) {
        const cm = addMonths(startCm, i);
        const instId = `${purchase.id}_sub_${cm}`;
        if (!state.installments.some(inst => inst.id === instId)) {
          toAdd.push(generateSubscriptionInstallment(purchase, card, cm));
        }
      }
    }
    if (toAdd.length > 0) {
      dispatch({ type: "ADD_INSTALLMENTS", payload: toAdd });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.purchases, state.cards, state.installments, user, isReady]);

  // ── Sincronização manual (botão) + ao voltar ao primeiro plano (PWA) ──────
  // Empurra mudança local pendente na hora e puxa o estado do servidor (getDoc),
  // sem depender do listener em tempo real — que o PWA suspende em segundo plano.
  async function syncNow() {
    if (!user) return;
    setSyncState("syncing");
    setLastSyncError(null);
    try {
      if (needsFirestoreSyncRef.current) {
        await setDoc(FIRESTORE_DOC(user.uid), { ...state, updatedAt: serverTimestamp() });
        needsFirestoreSyncRef.current = false;
      }
      // Puxa o servidor; aplica só se for mais novo (após empurrar a pendência
      // acima, se havia). Não sobrescreve dados locais mais novos que o servidor.
      const snap = await getDoc(FIRESTORE_DOC(user.uid));
      if (snap.exists()) {
        const remote = snap.data() as AppState & { updatedAt?: unknown };
        const remoteMs = remoteUpdatedAt(remote);
        if (remoteMs > loadedAtRef.current) {
          loadedAtRef.current = remoteMs;
          const persisted: PersistedState = { ...(remote as AppState), updatedAt: remoteMs };
          try { localStorage.setItem(LS_KEY(user.uid), JSON.stringify(persisted)); } catch {}
          dispatch({ type: "LOAD", payload: persisted });
        }
      }
      setLastSyncedAt(Date.now());
      setSyncState("synced");
    } catch (err) {
      console.error("Sync error:", err);
      setSyncState("error");
      setLastSyncError(err instanceof Error ? err.message : String(err));
    }
  }

  // Referência sempre atual do syncNow (evita re-subscrever o listener de foco).
  const syncNowRef = useRef(syncNow);
  useEffect(() => { syncNowRef.current = syncNow; });

  // Auto-sincroniza quando o app volta ao primeiro plano (PWA suspende o listener).
  useEffect(() => {
    if (!user) return;
    const onVis = () => { if (document.visibilityState === "visible") syncNowRef.current(); };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, [user]);

  // ── Auth actions ──────────────────────────────────────────────────────────
  function signIn(): Promise<void> {
    const provider = new GoogleAuthProvider();
    return signInWithPopup(auth, provider).then(() => undefined);
  }

  async function signOut() {
    await fbSignOut(auth);
    setIsReady(false);
    needsFirestoreSyncRef.current = false;
    dispatch({ type: "LOAD", payload: seed });
    // onAuthStateChanged dispara em seguida e reseta os refs
  }

  return (
    <Ctx.Provider value={{ state, dispatch, user, authLoading, signIn, signOut, syncNow, syncState, lastSyncedAt, lastSyncError }}>
      {children}
    </Ctx.Provider>
  );
}

export function useApp() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useApp outside AppProvider");
  return ctx;
}

export function newId(): string {
  return typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2) + Date.now().toString(36);
}

export const CARD_COLORS = [
  "#9B6DFF", "#8A05BE", "#6366F1", "#4B8BF5", "#0EA5E9", "#06B6D4",
  "#00E5C3", "#14B8A6", "#22D47A", "#84CC16", "#EAB308", "#F5A623",
  "#FF8C42", "#F97316", "#FF4D6A", "#EF4444", "#EC4899", "#A855F7",
  "#64748B", "#334155",
];
export const ACCOUNT_COLORS = ["#22D47A", "#4B8BF5", "#00E5C3", "#9B6DFF", "#F5A623", "#FF8C42"];
export const ACCOUNT_ICONS  = ["🏦", "💰", "👛", "📈", "💳", "🏧"];
