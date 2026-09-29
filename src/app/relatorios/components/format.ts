import { fmt } from "@/engine/financialEngine";

const MONTH_SHORT = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
const MONTH_FULL = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];

export function shortMonth(yyyymm: string): string {
  return MONTH_SHORT[Number(yyyymm.split("-")[1]) - 1] ?? yyyymm;
}

export function fullMonth(yyyymm: string): string {
  const [y, m] = yyyymm.split("-").map(Number);
  return `${MONTH_FULL[m - 1]} ${y}`;
}

export function monthOnly(yyyymm: string): string {
  return (MONTH_FULL[Number(yyyymm.split("-")[1]) - 1] ?? yyyymm).toLowerCase();
}

export function brl(v: number): string {
  return `R$ ${fmt(Math.abs(v))}`;
}

export function signedBrl(v: number): string {
  return `${v < 0 ? "−" : "+"}R$ ${fmt(Math.abs(v))}`;
}

/** Valor compacto para eixos e barras estreitas (ex.: 1,2k). */
export function compact(v: number): string {
  const abs = Math.abs(v);
  if (abs >= 1000) return `${(abs / 1000).toFixed(abs >= 10000 ? 0 : 1).replace(".", ",")}k`;
  return abs.toFixed(0);
}

export function pct(v: number): string {
  return `${Math.round(v * 100)}%`;
}
