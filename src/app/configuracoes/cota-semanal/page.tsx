"use client";

import { useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";

export default function CotaSemanalSettingsPage() {
  const router = useRouter();
  return <div style={{ maxWidth: 680, margin: "0 auto", padding: "max(16px, var(--safe-top)) 16px calc(var(--bottom-nav-total) + 24px)" }}>
    <button type="button" onClick={() => router.back()} className="icon-btn ghost" aria-label="Voltar" style={{ width: 44, height: 44, marginBottom: 16 }}><ArrowLeft size={20} /></button>
    <div className="soft-card" style={{ padding: 20 }}>
      <h1 className="page-title" style={{ fontSize: 20 }}>Saldo livre projetado</h1>
      <p style={{ color: "var(--text-2)", fontSize: 13, lineHeight: 1.5, marginTop: 10 }}>O valor da tela inicial é o mesmo saldo projetado livre dos Relatórios: o que resta até o fim do mês depois dos compromissos que entram na projeção.</p>
      <p style={{ color: "var(--text-2)", fontSize: 13, lineHeight: 1.5, marginTop: 10 }}>O valor por dia divide esse saldo pelos dias restantes, contando hoje. Ele é atualizado com os lançamentos: sem novos gastos, o valor pode subir quando restam menos dias; com novos gastos ou mudanças na projeção, pode diminuir.</p>
      <p style={{ color: "var(--text-3)", fontSize: 12, lineHeight: 1.5, marginTop: 12 }}>Na barra, cada dia soma ao acumulado a parcela calculada para ele. O que não foi gasto fica disponível nos dias seguintes. Os próximos dias são uma previsão sem novos gastos; compras no cartão que vencem no mês seguinte são avisadas à parte.</p>
    </div>
  </div>;
}
