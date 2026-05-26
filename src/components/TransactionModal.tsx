"use client";
import { useState, useEffect } from "react";
import Link from "next/link";
import { useApp, newId } from "@/context/AppContext";
import type { Transaction } from "@/context/AppContext";

interface Props {
  transaction?: Transaction;
  onClose: () => void;
}

export default function TransactionModal({ transaction, onClose }: Props) {
  const { state, dispatch } = useApp();
  const todayStr = new Date().toISOString().split("T")[0];

  const expenseCategories = state.categories.filter(c => c.type === "expense");
  const incomeCategories = state.categories.filter(c => c.type === "income");

  const [txType, setTxType] = useState<"income" | "expense">(
    transaction?.type === "income" ? "income" : "expense"
  );
  const [description, setDescription] = useState(transaction?.description ?? "");
  const [amount, setAmount] = useState(transaction ? String(transaction.amount) : "");
  const [accountId, setAccountId] = useState(
    transaction?.accountId ?? (state.accounts[0]?.id ?? "")
  );
  const [categoryId, setCategoryId] = useState(
    transaction?.categoryId ?? expenseCategories[0]?.id ?? ""
  );
  const [competenceDate, setCompetenceDate] = useState(transaction?.competenceDate ?? todayStr);
  const [paymentDate, setPaymentDate] = useState(transaction?.paymentDate ?? todayStr);
  const [status, setStatus] = useState<Transaction["status"]>(transaction?.status ?? "paid");
  const [notes, setNotes] = useState(transaction?.notes ?? "");
  const [error, setError] = useState("");

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [onClose]);

  useEffect(() => {
    if (transaction) return;
    const cats = txType === "income" ? incomeCategories : expenseCategories;
    setCategoryId(cats[0]?.id ?? "");
  }, [txType]);

  function handleAmountChange(val: string) {
    // Allow digits, comma, period
    const clean = val.replace(/[^0-9.,]/g, "");
    setAmount(clean);
  }

  function handleSave() {
    if (!description.trim()) return setError("Informe a descrição.");
    const normalized = amount.replace(",", ".");
    const amt = parseFloat(normalized);
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
    onClose();
  }

  const currentCategories = txType === "income" ? incomeCategories : expenseCategories;

  return (
    <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal">
        <div className="modal-header">
          <span style={{ fontSize: "16px", fontWeight: 700, color: "var(--text-1)" }}>
            {transaction ? "Editar transação" : "Nova transação"}
          </span>
          <button className="btn-secondary" onClick={onClose} style={{ padding: "6px 14px", fontSize: "18px", minHeight: "40px" }}>×</button>
        </div>

        <div className="modal-body">
          {/* Type toggle */}
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

          {/* Amount — FIRST on mobile for faster entry */}
          <div className="form-group">
            <label className="form-label">Valor (R$)</label>
            <input
              className="form-input mono"
              type="text"
              inputMode="decimal"
              pattern="[0-9]*[.,]?[0-9]*"
              placeholder="0,00"
              value={amount}
              onChange={e => handleAmountChange(e.target.value)}
              autoComplete="off"
              style={{ fontSize: "20px", letterSpacing: "0.02em" }}
            />
          </div>

          {/* Description */}
          <div className="form-group">
            <label className="form-label">Descrição</label>
            <input
              className="form-input"
              type="text"
              inputMode="text"
              placeholder="Ex: iFood, Salário, Aluguel..."
              value={description}
              onChange={e => setDescription(e.target.value)}
              autoComplete="off"
              autoCorrect="off"
            />
          </div>

          {/* Category */}
          <div className="form-group">
            <label className="form-label">Categoria</label>
            <select className="form-input" value={categoryId} onChange={e => setCategoryId(e.target.value)}>
              {currentCategories.map(c => (
                <option key={c.id} value={c.id}>{c.icon} {c.name}</option>
              ))}
            </select>
          </div>

          {/* Account */}
          <div className="form-group">
            <label className="form-label">Conta</label>
            {state.accounts.filter(a => a.active).length === 0 ? (
              <p style={{ fontSize: "13px", color: "var(--red)", padding: "12px 0" }}>
                Nenhuma conta cadastrada. <Link href="/contas" style={{ color: "var(--accent)" }}>Criar conta</Link>
              </p>
            ) : (
              <select className="form-input" value={accountId} onChange={e => setAccountId(e.target.value)}>
                {state.accounts.filter(a => a.active).map(a => (
                  <option key={a.id} value={a.id}>{a.icon} {a.name}</option>
                ))}
              </select>
            )}
          </div>

          {/* Dates */}
          <div className="form-row">
            <div className="form-group" style={{ margin: 0 }}>
              <label className="form-label">Competência</label>
              <input
                className="form-input"
                type="date"
                value={competenceDate}
                onChange={e => setCompetenceDate(e.target.value)}
              />
            </div>
            <div className="form-group" style={{ margin: 0 }}>
              <label className="form-label">Data pagamento</label>
              <input
                className="form-input"
                type="date"
                value={paymentDate}
                onChange={e => setPaymentDate(e.target.value)}
              />
            </div>
          </div>

          {/* Status */}
          <div className="form-group" style={{ marginTop: "16px", marginBottom: 0 }}>
            <label className="form-label">Status</label>
            <div style={{ display: "flex", gap: "8px" }}>
              {([
                { key: "pending" as const, label: "A pagar", color: "var(--amber)", bg: "var(--amber-10)", border: "var(--amber-20)" },
                { key: "paid" as const, label: "Pago", color: "var(--green)", bg: "var(--green-10)", border: "var(--green-20)" },
                { key: "overdue" as const, label: "Vencido", color: "var(--red)", bg: "var(--red-10)", border: "var(--red-20)" },
              ]).map(opt => (
                <button
                  key={opt.key}
                  onClick={() => setStatus(opt.key)}
                  style={{
                    flex: 1, padding: "10px 4px", borderRadius: "10px", cursor: "pointer",
                    fontSize: "12px", fontWeight: 700, fontFamily: "inherit",
                    background: status === opt.key ? opt.bg : "transparent",
                    color: status === opt.key ? opt.color : "var(--text-3)",
                    border: status === opt.key ? `1px solid ${opt.border}` : "1px solid var(--border)",
                    transition: "all 0.15s",
                    minHeight: "44px",
                  }}
                >{opt.label}</button>
              ))}
            </div>
          </div>

          {/* Notes */}
          <div className="form-group" style={{ marginTop: "16px", marginBottom: 0 }}>
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

          {error && <p style={{ color: "var(--red)", fontSize: "13px", marginTop: "14px", fontWeight: 600 }}>{error}</p>}
        </div>

        <div className="modal-footer">
          <button className="btn-secondary" onClick={onClose}>Cancelar</button>
          <button className="btn-primary" onClick={handleSave}>
            {transaction ? "Salvar" : "Adicionar"}
          </button>
        </div>
      </div>
    </div>
  );
}
