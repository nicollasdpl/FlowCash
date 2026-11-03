"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { AlertTriangle, Info } from "lucide-react";
import { useApp } from "@/context/AppContext";
import { getSpendingRoom } from "@/engine/reportInsightsEngine";
import {
  buildLiveWeekBarModel, collectWeekVariableSpend, getWeekBounds,
} from "@/lib/budgetPacing";
import styles from "./WeeklyPacingCard.module.css";

const brl = (value: number) => `R$ ${Math.abs(value).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
function saoPauloToday(): string {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date());
  const part = (type: string) => parts.find(item => item.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}

export default function WeeklyPacingCard() {
  const { state, user, authLoading } = useApp();
  const [todayStr, setTodayStr] = useState(saoPauloToday);

  useEffect(() => {
    const timer = window.setInterval(() => setTodayStr(saoPauloToday()), 60_000);
    return () => window.clearInterval(timer);
  }, []);

  const bounds = useMemo(() => getWeekBounds(todayStr), [todayStr]);
  const spend = useMemo(() => collectWeekVariableSpend({
    bounds, throughDate: todayStr,
    accounts: state.accounts, transactions: state.transactions,
    purchases: state.purchases, installments: state.installments, cards: state.cards,
  }), [bounds, state.accounts, state.transactions, state.purchases, state.installments, state.cards, todayStr]);
  const room = useMemo(() => getSpendingRoom(
    state.accounts, state.transactions, state.cards,
    state.installments, todayStr, state.purchases,
  ), [state.accounts, state.transactions, state.cards, state.installments, state.purchases, todayStr]);
  const model = buildLiveWeekBarModel(room, bounds, todayStr, spend);
  const hasAccount = state.accounts.some(account => account.active && account.type !== "investment");

  if (!user && !authLoading) return null;
  return (
    <section className={`soft-card ${styles.card}`} aria-label="Saldo livre projetado">
      <div className={styles.header}>
        <h2>Saldo livre projetado</h2>
        <Link href="/configuracoes/cota-semanal" aria-label="Como funciona o saldo livre projetado" className={styles.settings}>
          <Info size={17} strokeWidth={1.7} />
        </Link>
      </div>
      {authLoading && <div className={styles.skeleton} aria-label="Carregando saldo projetado" />}
      {!authLoading && user && !hasAccount && <p className={styles.message}>Cadastre uma conta ativa para calcular o saldo livre projetado.</p>}
      {!authLoading && user && hasAccount && (
        <>
          <p className={styles.projectionLabel}>Saldo projetado livre até dia {Number(model.fimDoMes.slice(8, 10))}</p>
          <p className={`${styles.hero} mono ${model.estado === "mesNoVermelho" ? styles.red : ""}`}>
            {model.estado === "mesNoVermelho"
              ? model.saldoProjetado < 0 ? `Mês no vermelho: ${brl(model.deficitMes)}` : "Sem saldo livre projetado"
              : brl(model.saldoProjetado)}
          </p>
          <p className={styles.daily}><strong className="mono">{brl(model.porDia)}</strong> por dia nos {model.diasRestantes} dias restantes · acompanha o saldo projetado</p>
          {model.estado === "mesNoVermelho" ? (
            <p className={styles.message}>Não há saldo projetado livre para novos gastos neste mês.</p>
          ) : (
            <>
              <h3 className={styles.weekTitle}>{model.tituloSemana}</h3>
              <p className={styles.explanation}>O gasto da semana já está considerado no saldo projetado quando afeta este mês. O valor por dia é redistribuído a cada dia.</p>
              <div className={styles.bar} role="img" aria-label={`Gasto na semana ${brl(model.gastoSemana)}; planejado para os dias restantes até domingo ${brl(model.planejadoAteFimDaSemana)}`}>
                <div className={styles.spent} style={{ width: `${model.pctGasto}%` }} />
                <div className={styles.available} style={{ left: `${model.pctGasto}%`, width: `${model.pctPlanejado}%` }} />
              </div>
              <div className={`${styles.legend} ${styles.liveLegend}`}>
                <div><span>Gasto nesta semana</span><strong className="mono">{brl(model.gastoSemana)}</strong></div>
                <div><span>Planejado até domingo · {model.diasRestantesSemana} dias</span><strong className="mono">{brl(model.planejadoAteFimDaSemana)}</strong></div>
              </div>
            </>
          )}
          {model.parceladoNaSemana > 0 && <p className={styles.note}>Parcelado na semana: <span className="mono">{brl(model.parceladoNaSemana)}</span> (fora do gasto mostrado na barra)</p>}
          {model.gastoCartaoForaDoMes > 0 && <p className={styles.note}><AlertTriangle size={14} /> <span><span className="mono">{brl(model.gastoCartaoForaDoMes)}</span> no cartão cai na fatura do mês seguinte e não reduz o saldo projetado deste mês.</span></p>}
        </>
      )}
    </section>
  );
}
