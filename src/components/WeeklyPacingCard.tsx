"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { AlertTriangle, Info } from "lucide-react";
import { doc, onSnapshot } from "firebase/firestore";
import { useApp, type AppState } from "@/context/AppContext";
import { getSpendingRoom } from "@/engine/reportInsightsEngine";
import { db } from "@/lib/firebase";
import {
  buildEvolutionSeries, buildWeekAnchor, buildWeekBarModel, collectWeekVariableSpend,
  getWeekBounds, snapshotReadiness, type WeekSnapshot,
} from "@/lib/budgetPacing";
import {
  closePreviousWeekIfNeeded, createWeekSnapshotOnce, readConfirmedAppState,
  readRecentWeekSnapshots, readWeekSnapshot,
} from "@/lib/budgetPacingStore";
import styles from "./WeeklyPacingCard.module.css";

const brl = (value: number) => `R$ ${Math.abs(value).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
function saoPauloToday(): string {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date());
  const part = (type: string) => parts.find(item => item.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}

export default function WeeklyPacingCard() {
  const { user, authLoading } = useApp();
  const [todayStr, setTodayStr] = useState(saoPauloToday);
  const [sourceState, setSourceState] = useState<AppState | null>(null);
  const [snapshot, setSnapshot] = useState<WeekSnapshot | null>(null);
  const [history, setHistory] = useState<WeekSnapshot[]>([]);
  const [status, setStatus] = useState<"loading" | "ready" | "no-account" | "error">("loading");

  useEffect(() => {
    const timer = window.setInterval(() => setTodayStr(saoPauloToday()), 60_000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!user) return;
    const uid = user.uid;
    let cancelled = false;
    let unsubscribe: (() => void) | undefined;
    void (async () => {
      try {
        const confirmed = await readConfirmedAppState(uid);
        if (cancelled) return;
        if (!confirmed) { setStatus("no-account"); return; }
        const remote = confirmed.state;
        setSourceState(remote);
        const bounds = getWeekBounds(todayStr);
        const existing = await readWeekSnapshot(uid, bounds.semanaInicio);
        if (cancelled) return;
        const dataReadiness = snapshotReadiness(confirmed.hydrated, remote);
        if (dataReadiness !== "ready") { setStatus(dataReadiness); return; }
        await closePreviousWeekIfNeeded(uid, bounds, remote);
        if (cancelled) return;
        const readiness = snapshotReadiness(confirmed.hydrated, remote);
        if (readiness !== "ready") { setStatus(readiness); return; }
        let current = existing;
        if (!current) {
          const spend = collectWeekVariableSpend({
            bounds, throughDate: todayStr, accounts: remote.accounts,
            transactions: remote.transactions, purchases: remote.purchases,
            installments: remote.installments, cards: remote.cards,
          });
          const room = getSpendingRoom(remote.accounts, remote.transactions, remote.cards, remote.installments, todayStr, remote.purchases);
          current = await createWeekSnapshotOnce(uid, buildWeekAnchor(room.free, bounds, spend), confirmed);
        }
        if (cancelled) return;
        setSnapshot(current);
        setHistory(await readRecentWeekSnapshots(uid));
        if (cancelled) return;
        setStatus("ready");
        unsubscribe = onSnapshot(doc(db, "users", uid, "app", "state"), latest => {
          if (latest.exists() && (!latest.metadata.fromCache || latest.metadata.hasPendingWrites)) {
            setSourceState(latest.data() as AppState);
          }
        });
      } catch {
        if (!cancelled) setStatus("error");
      }
    })();
    return () => { cancelled = true; unsubscribe?.(); };
  }, [user, todayStr]);

  const spend = useMemo(() => snapshot && sourceState ? collectWeekVariableSpend({
    bounds: snapshot, throughDate: todayStr,
    accounts: sourceState.accounts, transactions: sourceState.transactions,
    purchases: sourceState.purchases, installments: sourceState.installments, cards: sourceState.cards,
  }) : null, [snapshot, sourceState, todayStr]);
  const model = snapshot && spend ? buildWeekBarModel(snapshot, todayStr, spend) : null;
  const legacyCategorySnapshot = !!snapshot && Array.isArray((snapshot as WeekSnapshot & { variableCategoryIds?: string[] }).variableCategoryIds);
  const evolution = buildEvolutionSeries(history);
  const displayStatus = status === "ready" && snapshot?.semanaInicio !== getWeekBounds(todayStr).semanaInicio ? "loading" : status;

  if (!user && !authLoading) return null;
  return (
    <section className={`soft-card ${styles.card}`} aria-label="Cota semanal">
      <div className={styles.header}>
        <h2>{model?.tituloSemana ?? "Esta semana"}</h2>
        <Link href="/configuracoes/cota-semanal" aria-label="Como funciona a cota semanal" className={styles.settings}>
          <Info size={17} strokeWidth={1.7} />
        </Link>
      </div>
      {displayStatus === "loading" && <div className={styles.skeleton} aria-label="Carregando cota semanal" />}
      {displayStatus === "error" && <p className={styles.message}>Não foi possível carregar a cota semanal. Verifique a conexão e abra a tela novamente.</p>}
      {displayStatus === "no-account" && <p className={styles.message}>Cadastre uma conta ativa para calcular a cota semanal.</p>}
      {displayStatus === "ready" && model && (
        <>
          <p className={`${styles.hero} mono ${model.estado === "estourou" || model.estado === "mesNoVermelho" ? styles.red : ""}`}>
            {model.estado === "mesNoVermelho"
              ? `Mês no vermelho: ${brl(model.deficitMes)}`
              : model.disponivelHoje < 0
                ? `${brl(model.excedente)} acima do liberado`
                : `Pode gastar hoje: ${brl(model.disponivelHoje)}`}
          </p>
          <p className={styles.daily}>Cota diária <span className="mono">{brl(model.cotaDiaria)}</span> · semana <span className="mono">{brl(model.cotaSemanal)}</span></p>
          {legacyCategorySnapshot && <p className={styles.note}>Esta semana foi criada com o filtro antigo de categorias. <Link href="/configuracoes/cota-semanal/recalcular">Recalcular com todos os gastos</Link></p>}
          {model.estado === "mesNoVermelho" ? (
            <p className={styles.message}>{model.fraseExplicativa}</p>
          ) : (
            <>
              <div className={styles.bar} role="img" aria-label={`Gasto ${brl(model.gastoSemana)}, disponível ${brl(model.disponivelLegenda)}, a liberar ${brl(model.aLiberar)}`}>
                <div className={styles.activeTrack} style={{ left: `${model.pctSemanaLeft}%`, width: `${model.pctSemanaWidth}%` }}>
                  <div className={styles.released} style={{ width: `${model.pctLiberado}%` }} />
                  <div className={styles.spent} style={{ width: `${model.pctGastoBase}%` }} />
                  {model.disponivelHoje >= 0 && <div className={`${styles.available} ${model.estado === "atencao" ? styles.amber : ""}`} style={{ left: `${model.pctGasto}%`, width: `${model.pctDisponivel}%` }} />}
                  {model.excedente > 0 && <div className={styles.overflow} style={{ left: `${model.pctLiberado}%`, width: `${model.pctExcesso}%` }} />}
                  <div className={styles.todayMarker} style={{ left: `${model.pctLiberado}%` }} />
                </div>
                {Array.from({ length: 6 }, (_, index) => <span key={index} className={styles.tick} style={{ left: `${(index + 1) / 7 * 100}%` }} />)}
              </div>
              <div className={styles.dayLabels} aria-hidden="true">
                {model.tickDias.map((day, index) => <span key={index} className={`${day.active ? "" : styles.inactiveDay} ${day.today ? styles.todayDay : ""}`}>{day.label}</span>)}
              </div>
              {model.excedente > 0 && <p className={styles.excess}>Excesso até hoje: <span className="mono">{brl(model.excedente)}</span></p>}
              <p className={styles.explanation}>{model.fraseExplicativa}</p>
              <div className={styles.legend}>
                <div><span>Gasto</span><strong className="mono">{brl(model.gastoSemana)}</strong></div>
                <div><span>Disponível</span><strong className="mono">{brl(model.disponivelLegenda)}</strong></div>
                <div><span>A liberar</span><strong className="mono">{brl(model.aLiberar)}</strong></div>
              </div>
            </>
          )}
          {model.parceladoNaSemana > 0 && <p className={styles.note}>Parcelado na semana: <span className="mono">{brl(model.parceladoNaSemana)}</span> (fora da cota)</p>}
          {model.gastoCartaoForaDoMes > 0 && <p className={styles.note}><AlertTriangle size={14} /> <span><span className="mono">{brl(model.gastoCartaoForaDoMes)}</span> no cartão cai na fatura do mês seguinte e não será absorvido no recálculo semanal.</span></p>}
          {evolution.length > 0 && <details className={styles.history}>
            <summary>Histórico das semanas</summary>
            {evolution.slice(-5).reverse().map(week => <div key={week.semanaInicio} className={styles.historyRow}>
              <span>{Number(week.semanaInicio.slice(8, 10))}–{Number(week.semanaFim.slice(8, 10))}/{week.semanaFim.slice(5, 7)}</span>
              <div className={styles.miniBar}><i style={{ width: `${week.pctGasto}%` }} /></div>
              <strong className="mono" style={{ color: week.saldoSemana < 0 ? "var(--red)" : "var(--text-1)" }}>{week.saldoSemana < 0 ? "−" : "+"}{brl(week.saldoSemana)}</strong>
            </div>)}
          </details>}
        </>
      )}
    </section>
  );
}
