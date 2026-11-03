import Link from "next/link";
import { ArrowLeft } from "lucide-react";

export default function RecalcularCotaPage() {
  return <div style={{ maxWidth: 680, margin: "0 auto", padding: "max(16px, var(--safe-top)) 16px calc(var(--bottom-nav-total) + 24px)" }}>
    <Link href="/configuracoes/cota-semanal" className="icon-btn ghost" aria-label="Voltar" style={{ width: 44, height: 44, marginBottom: 16, display: "grid", placeItems: "center" }}><ArrowLeft size={20} /></Link>
    <div className="soft-card" style={{ padding: 20 }}>
      <h1 className="page-title" style={{ fontSize: 20 }}>Atualização automática</h1>
      <p style={{ color: "var(--text-2)", fontSize: 13, lineHeight: 1.5, marginTop: 10 }}>O saldo livre e o valor por dia agora acompanham o saldo projetado. Não é preciso recalcular a semana manualmente.</p>
      <Link href="/" className="link-quiet" style={{ display: "inline-flex", alignItems: "center", minHeight: 44, marginTop: 16 }}>Voltar ao início</Link>
    </div>
  </div>;
}
