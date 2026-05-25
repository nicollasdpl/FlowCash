"use client";
export default function Configuracoes() {
  return (
    <div style={{ padding: "28px", maxWidth: "700px" }}>
      <div className="fade-up-1" style={{ marginBottom: "28px" }}>
        <h1 style={{ fontSize: "22px", fontWeight: 700, color: "var(--text-1)", letterSpacing: "-0.03em" }}>Configurações</h1>
        <p style={{ fontSize: "13px", color: "var(--text-2)", marginTop: "3px" }}>Gerencie sua conta e preferências</p>
      </div>

      {[
        { section: "Perfil", items: ["Nome", "E-mail", "Senha", "Foto"] },
        { section: "Notificações", items: ["Contas a vencer", "Contas vencidas", "Meta atingida", "Resumo mensal"] },
        { section: "Integrações", items: ["WhatsApp Bot", "Google Sheets", "Open Finance"] },
      ].map((group, gi) => (
        <div key={gi} className={`card fade-up-${gi + 2}`} style={{ marginBottom: "16px", overflow: "hidden" }}>
          <div style={{ padding: "14px 22px", borderBottom: "1px solid var(--border)" }}>
            <h2 style={{ fontSize: "13px", fontWeight: 700, color: "var(--text-2)", letterSpacing: "0.05em", textTransform: "uppercase" }}>{group.section}</h2>
          </div>
          {group.items.map((item, ii) => (
            <div
              key={ii}
              style={{
                display: "flex", justifyContent: "space-between", alignItems: "center",
                padding: "15px 22px",
                borderBottom: ii < group.items.length - 1 ? "1px solid var(--border)" : "none",
                cursor: "pointer", transition: "background 0.15s ease",
              }}
              onMouseEnter={e => (e.currentTarget.style.background = "var(--bg-card-hover)")}
              onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
            >
              <span style={{ fontSize: "13.5px", color: "var(--text-1)", fontWeight: 500 }}>{item}</span>
              <span style={{ fontSize: "18px", color: "var(--text-3)" }}>›</span>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
