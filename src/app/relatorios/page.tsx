export default function Relatorios() {
  const months = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun"];
  const income = [6200, 7100, 6800, 7400, 8200, 0];
  const expense = [4800, 5200, 4600, 5800, 5352, 0];
  const maxVal = Math.max(...income, ...expense);

  function fmt(v: number) {
    return v.toLocaleString("pt-BR", { minimumFractionDigits: 2 });
  }

  return (
    <div style={{ padding: "28px", maxWidth: "960px" }}>
      <div className="fade-up-1" style={{ marginBottom: "28px" }}>
        <h1 style={{ fontSize: "22px", fontWeight: 700, color: "var(--text-1)", letterSpacing: "-0.03em" }}>Relatórios</h1>
        <p style={{ fontSize: "13px", color: "var(--text-2)", marginTop: "3px" }}>Visão anual — 2026</p>
      </div>

      {/* Bar chart */}
      <div className="card fade-up-2" style={{ padding: "24px", marginBottom: "20px" }}>
        <h2 style={{ fontSize: "15px", fontWeight: 700, color: "var(--text-1)", marginBottom: "24px" }}>Receitas vs Despesas</h2>
        <div style={{ display: "flex", alignItems: "flex-end", gap: "20px", height: "160px" }}>
          {months.map((month, i) => (
            <div key={i} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: "6px" }}>
              <div style={{ display: "flex", gap: "4px", alignItems: "flex-end", width: "100%" }}>
                <div style={{
                  flex: 1, borderRadius: "6px 6px 0 0",
                  height: `${(income[i] / maxVal) * 140}px`,
                  background: income[i] > 0 ? "var(--green)" : "var(--border)",
                  boxShadow: income[i] > 0 ? "0 0 10px rgba(34,212,122,0.3)" : "none",
                  transition: "height 0.6s ease",
                }} />
                <div style={{
                  flex: 1, borderRadius: "6px 6px 0 0",
                  height: `${(expense[i] / maxVal) * 140}px`,
                  background: expense[i] > 0 ? "var(--red)" : "var(--border)",
                  boxShadow: expense[i] > 0 ? "0 0 10px rgba(255,77,106,0.3)" : "none",
                  transition: "height 0.6s ease",
                }} />
              </div>
              <span style={{ fontSize: "11px", color: "var(--text-3)", fontWeight: 600 }}>{month}</span>
            </div>
          ))}
        </div>

        <div style={{ display: "flex", gap: "20px", marginTop: "16px", paddingTop: "16px", borderTop: "1px solid var(--border)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
            <div style={{ width: "10px", height: "10px", borderRadius: "2px", background: "var(--green)" }} />
            <span style={{ fontSize: "12px", color: "var(--text-2)" }}>Receitas</span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
            <div style={{ width: "10px", height: "10px", borderRadius: "2px", background: "var(--red)" }} />
            <span style={{ fontSize: "12px", color: "var(--text-2)" }}>Despesas</span>
          </div>
        </div>
      </div>

      {/* Monthly summary */}
      <div className="card fade-up-3" style={{ overflow: "hidden" }}>
        <div style={{ padding: "16px 22px", borderBottom: "1px solid var(--border)" }}>
          <h2 style={{ fontSize: "15px", fontWeight: 700, color: "var(--text-1)" }}>Resumo Mensal</h2>
        </div>
        <div style={{
          display: "grid", gridTemplateColumns: "80px 1fr 1fr 1fr",
          padding: "10px 22px", fontSize: "10.5px", fontWeight: 700,
          color: "var(--text-3)", letterSpacing: "0.07em", textTransform: "uppercase",
          borderBottom: "1px solid var(--border)",
        }}>
          <span>Mês</span>
          <span style={{ textAlign: "right" }}>Receitas</span>
          <span style={{ textAlign: "right" }}>Despesas</span>
          <span style={{ textAlign: "right" }}>Saldo</span>
        </div>
        {months.filter((_, i) => income[i] > 0).map((month, i) => {
          const balance = income[i] - expense[i];
          return (
            <div key={i} style={{
              display: "grid", gridTemplateColumns: "80px 1fr 1fr 1fr",
              padding: "14px 22px", borderBottom: "1px solid var(--border)",
              alignItems: "center",
            }}>
              <span style={{ fontSize: "13px", fontWeight: 600, color: "var(--text-2)" }}>{month}</span>
              <span className="mono" style={{ fontSize: "13px", fontWeight: 700, color: "var(--green)", textAlign: "right" }}>
                R$ {fmt(income[i])}
              </span>
              <span className="mono" style={{ fontSize: "13px", fontWeight: 700, color: "var(--red)", textAlign: "right" }}>
                R$ {fmt(expense[i])}
              </span>
              <span className="mono" style={{ fontSize: "13px", fontWeight: 700, color: balance >= 0 ? "var(--accent)" : "var(--red)", textAlign: "right" }}>
                {balance >= 0 ? "+" : ""}R$ {fmt(balance)}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
