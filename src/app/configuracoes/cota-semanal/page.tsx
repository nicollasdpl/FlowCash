"use client";

import { useRouter } from "next/navigation";
import { ArrowLeft, RotateCcw } from "lucide-react";

export default function CotaSemanalSettingsPage() {
  const router = useRouter();
  return <div style={{ maxWidth: 680, margin: "0 auto", padding: "max(16px, var(--safe-top)) 16px calc(var(--bottom-nav-total) + 24px)" }}>
    <button type="button" onClick={() => router.back()} className="icon-btn ghost" aria-label="Voltar" style={{ width: 44, height: 44, marginBottom: 16 }}><ArrowLeft size={20} /></button>
    <div className="soft-card" style={{ padding: 20 }}>
      <h1 className="page-title" style={{ fontSize: 20 }}>Cota semanal</h1>
      <p style={{ color: "var(--text-2)", fontSize: 13, lineHeight: 1.5, marginTop: 10 }}>Você não precisa criar orçamento nem escolher categorias. A cota considera automaticamente despesas pagas não recorrentes e compras próprias à vista no cartão. Parcelas, recorrências e pagamentos de fatura ficam fora do gasto semanal.</p>
      <p style={{ color: "var(--text-3)", fontSize: 12, lineHeight: 1.5, marginTop: 12 }}>Para refazer a cota desta semana com os lançamentos atuais, use o recálculo abaixo.</p>
      <button type="button" className="link-quiet" onClick={() => router.push("/configuracoes/cota-semanal/recalcular")} style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 20, minHeight: 44 }}><RotateCcw size={16} /> Recalcular esta semana</button>
    </div>
  </div>;
}
