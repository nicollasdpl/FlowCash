import Link from "next/link";

export default function WeeklyPacingNoCategories({ className }: { className?: string }) {
  return <p className={className}>Defina um orçamento deste mês ou <Link href="/configuracoes/cota-semanal">escolha categorias variáveis</Link> para calcular a cota.</p>;
}
