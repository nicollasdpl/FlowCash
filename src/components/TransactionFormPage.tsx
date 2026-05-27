"use client";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useApp, newId } from "@/context/AppContext";
import type { Transaction } from "@/context/AppContext";
import { iconLabel } from "@/components/CategoryIcon";

interface Props {
  transaction?: Transaction;
}

export default function TransactionFormPage({ transaction }: Props) {
  const router = useRouter();
  const { state, dispatch } = useApp();
  const todayStr = new Date().toISOString().split("T")[0];

  const expenseCategories = state.categories.filter(c => c.type === "expense");
  const incomeCategories  = state.categories.filter(c => c.type === "income");

  const [txType, setTxType]   = useState<"income" | "expense">(transaction?.type === "income" ? "income" : "expense");
  const [description, setDesc]  = useState(transaction?.description ?? "");
  const [amount, setAmount]     = useState(transaction ? String(transaction.amount) : "");
  const [accountId, setAccount] = useState(transaction?.accountId ?? (state.accounts[0]?.id ?? ""));
  const [categoryId, setCategory] = useState(transaction?.categoryId ?? expenseCategories[0]?.id ?? "");
  const [competenceDate, setCompetence] = useState(transaction?.competenceDate ?? todayStr);
  const [paymentDate, setPayment]       = useState(transaction?.paymentDate ?? todayStr);
  const [status, setStatus] = useState<Transaction["status"]>(transaction?.status ?? "paid");
  const [notes, setNotes]   = useState(transaction?.notes ?? "");
  const [error, setError]   = useState("");

  // Atualiza categoria quando o tipo muda (nova transação)
  useEffect(() => {
    if (transaction) return;
    const cats = txType === "income" ? incomeCategories : expenseCategories;
    setCategory(cats[0]?.id ?? "");
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [txType]);

  const currentCategories = txType === "income" ? incomeCategories : expenseCategories;

  function handleSave() {
    if (!description.trim()) return setError("Informe a descrição.");
    const amt = parseFloat(amount.replace(",", "."));
    if (!amount || isNaN(amt) || amt <= 0) return setError("Informe um valor válido.");
    if (!accountId) return setError("Selecione uma conta.");
    setError("");

    const tx: Transaction = {
      id: transaction?.id ?? newId(),
      accountId,
      type: txType,
      amount: amt,
      description: description.trim(),
      categoryId,
      competenceDate,
      paymentDate,
      status,
      isRecurring: transaction?.isRecurring ?? false,
      recurringRuleId: transaction?.recurringRuleId,
      origin: "manual",
      notes: notes.trim() || undefined,
      createdAt: transaction?.createdAt ?? new Date().toISOString(),
    };

    dispatch({ type: transaction ? "UPD_TX" : "ADD_TX", payload: tx });
    router.back();
  }

  function handleDelete() {
    if (!transaction) return;
    if (!confirm("Excluir esta transação?")) return;
    dispatch({ type: "DEL_TX", payload: transaction.id });
    router.back();
  }

  const isEdit = !!transaction;

  return (
    <>
      {/* ── Sticky header ── */}
      <div style={{
        position: "sticky",
        top: 0,
        zIndex: 10,
        background: "var(--bg)",
        borderBottom: "1px solid var(--border)",
        display: "flex",
        alignItems: "center",
        gap: "4px",
        padding: "0 8px 0 4px",
        height: "60px",
        flexShrink: 0,
      }}>
        <button
          onClick={() => router.back()}
          style={{
            background: "none", border: "none", color: "var(--text-2)",
            cursor: "pointer", fontSize: "24px",
            width: "48px", height: "48px", borderRadius: "12px",
            display: "flex", alignItems: "center", justifyContent: "center",
            flexShrink: 0, touchAction: "manipulation",
            WebkitTapHighlightColor: "transparent",
          }}
        >‹</button>
        <span style={{ fontSize: "17px", fontWeight: 700, color: "var(--text-1)", flex: 1 }}>
          {isEdit ? "Editar transação" : "Nova transação"}
        </span>
        {isEdit && (
          <button
            onClick={handleDelete}
            style={{
              background: "var(--red-10)", border: "1px solid var(--red-20)",
              borderRadius: "10px", color: "var(--red)",
              padding: "8px 14px", fontSize: "13px", fontWeight: 600,
              cursor: "pointer", fontFamily: "inherit", touchAction: "manipulation",
            }}
          >Excluir</button>
        )}
      </div>

      {/* ── Form ── */}
      <div style={{ padding: "20px 16px 140px" }}>

        {/* Tipo */}
        <div className="form-group">
          <label className="form-label">Tipo</label>
          <div className="type-toggle">
            <button
              className={`type-toggle-btn${txType === "expense" ? " active-expense" : ""}`}
              onClick={() => setTxType("expense")}
              style={{ touchAction: "manipulation" }}
            >↓ Despesa</button>
            <button
              className={`type-toggle-btn${txType === "income" ? " active-income" : ""}`}
              onClick={() => setTxType("income")}
              style={{ touchAction: "manipulation" }}
            >↑ Receita</button>
          </div>
        </div>

        {/* Valor */}
        <div className="form-group">
          <label className="form-label">Valor (R$)</label>
          <input
            className="form-input mono"
            type="text"
            inputMode="decimal"
            pattern="[0-9]*[.,]?[0-9]*"
            placeholder="0,00"
            value={amount}
            onChange={e => setAmount(e.target.value.replace(/[^0-9.,]/g, ""))}
            autoComplete="off"
            style={{ fontSize: "24px", letterSpacing: "0.02em" }}
          />
        </div>

        {/* Descrição */}
        <div className="form-group">
          <label className="form-label">Descrição</label>
          <input
            className="form-input"
            type="text"
            inputMode="text"
            placeholder="Ex: iFood, Salário, Aluguel..."
            value={description}
            onChange={e => setDesc(e.target.value)}
            autoComplete="off"
            autoCorrect="off"
          />
        </div>

        {/* Categoria */}
        <div className="form-group">
          <label className="form-label">Categoria</label>
          <select className="form-input" value={categoryId} onChange={e => setCategory(e.target.value)}>
            {currentCategories.map(c => (
              <option key={c.id} value={c.id}>{iconLabel(c.icon, c.name)}</option>
            ))}
          </select>
        </div>

        {/* Conta */}
        <div className="form-group">
          <label className="form-label">Conta</label>
          {state.accounts.filter(a => a.active).length === 0 ? (
            <p style={{ fontSize: "13px", color: "var(--red)", padding: "12px 0" }}>
              Nenhuma conta. <Link href="/contas" style={{ color: "var(--accent)" }}>Criar conta</Link>
            </p>
          ) : (
            <select className="form-input" value={accountId} onChange={e => setAccount(e.target.value)}>
              {state.accounts.filter(a => a.active).map(a => (
                <option key={a.id} value={a.id}>{a.icon} {a.name}</option>
              ))}
            </select>
          )}
        </div>

        {/* Datas */}
        <div className="form-row">
          <div className="form-group" style={{ margin: 0 }}>
            <label className="form-label">Competência</label>
            <input className="form-input" type="date" value={competenceDate} onChange={e => setCompetence(e.target.value)} />
          </div>
          <div className="form-group" style={{ margin: 0 }}>
            <label className="form-label">Pagamento</label>
            <input className="form-input" type="date" value={paymentDate} onChange={e => setPayment(e.target.value)} />
          </div>
        </div>

        {/* Status */}
        <div className="form-group" style={{ marginTop: "4px" }}>
          <label className="form-label">Status</label>
          <div style={{ display: "flex", gap: "8px" }}>
            {([
              { key: "paid" as const,    label: "Pago",     color: "var(--green)", bg: "var(--green-10)", border: "var(--green-20)" },
              { key: "pending" as const, label: "A pagar",  color: "var(--amber)", bg: "var(--amber-10)", border: "var(--amber-20)" },
              { key: "overdue" as const, label: "Vencido",  color: "var(--red)",   bg: "var(--red-10)",   border: "var(--red-20)"   },
            ]).map(opt => (
              <button
                key={opt.key}
                onClick={() => setStatus(opt.key)}
                style={{
                  flex: 1, padding: "12px 4px", borderRadius: "10px", cursor: "pointer",
                  fontSize: "12px", fontWeight: 700, fontFamily: "inherit",
                  background: status === opt.key ? opt.bg : "transparent",
                  color: status === opt.key ? opt.color : "var(--text-3)",
                  border: status === opt.key ? `1px solid ${opt.border}` : "1px solid var(--border)",
                  minHeight: "48px", touchAction: "manipulation",
                }}
              >{opt.label}</button>
            ))}
          </div>
        </div>

        {/* Observação */}
        <div className="form-group" style={{ marginBottom: 0 }}>
          <label className="form-label">Observação (opcional)</label>
          <input
            className="form-input"
            type="text"
            inputMode="text"
            placeholder="Notas adicionais..."
            value={notes}
            onChange={e => setNotes(e.target.value)}
            autoComplete="off"
          />
        </div>
      </div>

      {/* ── CTA fixo no fundo ── */}
      <div style={{
        position: "fixed",
        bottom: 0,
        left: 0,
        right: 0,
        zIndex: 50,
        background: "var(--bg)",
        borderTop: "1px solid var(--border)",
        padding: "12px 16px",
        paddingBottom: "calc(12px + env(safe-area-inset-bottom, 0px))",
        display: "flex",
        flexDirection: "column",
        gap: "8px",
      }}>
        {error && (
          <p style={{ color: "var(--red)", fontSize: "13px", fontWeight: 600, textAlign: "center" }}>{error}</p>
        )}
        <button
          className="btn-primary"
          onClick={handleSave}
          style={{ width: "100%", textAlign: "center", justifyContent: "center" }}
        >
          {isEdit ? "Salvar alterações" : "Adicionar transação"}
        </button>
      </div>
    </>
  );
}
