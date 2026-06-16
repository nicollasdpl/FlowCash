import type { LucideIcon } from "lucide-react";
import { Car, CreditCard, Fuel, Home, Utensils, Wallet } from "lucide-react";

export type QuickChip = { Icon: LucideIcon; label: string; text: string };

export const DEFAULT_QUICK_CHIPS: QuickChip[] = [
  { Icon: Utensils, label: "iFood", text: "gastei R$  no iFood hoje" },
  { Icon: Car, label: "Uber", text: "paguei Uber R$ " },
  { Icon: Wallet, label: "Salário", text: "recebi salário de R$ " },
  { Icon: CreditCard, label: "Cartão", text: "comprei no cartão " },
  { Icon: Fuel, label: "Gasolina", text: "abasteci R$  de gasolina" },
  { Icon: Home, label: "Moradia", text: "paguei aluguel R$ " },
];

export function getContextualChips(pathname: string): QuickChip[] {
  if (pathname.startsWith("/cartoes")) {
    return [
      { Icon: CreditCard, label: "Compra 3x", text: "comprei R$  em 3x no cartão " },
      { Icon: CreditCard, label: "À vista", text: "passei R$  no cartão hoje" },
      ...DEFAULT_QUICK_CHIPS.slice(0, 3),
    ];
  }
  if (pathname.startsWith("/orcamentos")) {
    return [
      { Icon: Wallet, label: "Gastos", text: "quanto gastei esse mês?" },
      { Icon: Home, label: "Orçamento", text: "falta quanto pro orçamento de alimentação?" },
      ...DEFAULT_QUICK_CHIPS.slice(0, 4),
    ];
  }
  if (pathname.startsWith("/metas")) {
    return [
      { Icon: Wallet, label: "Resumo", text: "resumo do mês" },
      { Icon: Wallet, label: "Saldo", text: "qual meu saldo?" },
      ...DEFAULT_QUICK_CHIPS.slice(0, 4),
    ];
  }
  return DEFAULT_QUICK_CHIPS;
}

export const EXAMPLE_PROMPTS = [
  "gastei 50 no iFood hoje",
  "100 de gasolina e paguei netflix 39,90",
  "comprei tênis 400 em 4x no cartão",
  "quanto gastei esse mês?",
  "falta quanto pro orçamento de alimentação?",
];
