"use client";
import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { useApp, newId } from "@/context/AppContext";
import type { CreditCard, CardPurchase } from "@/context/AppContext";

interface Props {
  card: CreditCard;
}

export default function PurchaseFormPage({ card }: Props) {
  const router = useRouter();
  const { state, dispatch } = useApp();
  const todayStr = new Date().toISOString().split("T")[0];

  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [categoryId, setCategoryId] = useState(state.categories.find(c => c.type === "expense")?.id ?? "");
  const [purchaseDate, setPurchaseDate] = useState(todayStr);
  const [totalInstallments, setTotalInstallments] = useState("1");
  const [error, setError] = useState("");

  const installmentPreview = useMemo(() => {
    const amt = parseFloat(amount.replace(",", "."));
    const n = parseInt(totalInstallments);
    if (!amt || !n || n < 1) return null;
    const per = (amt / n).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    return n === 1 ? `À vista — R$ ${per}` : `${n}x de R$ ${per}`;
  }, [amount, totalInstallments]);

  function handleSave() {
    if (!description.trim()) return setError("Informe a descrição.");
    const amt = parseFloat(amount.replace(",", "."));
    if (!amount || isNaN(amt) || amt <= 0) return setError("Informe um valor válido.");
    const inst = parseInt(totalInstallments);
    if (!inst || inst < 1 || inst > 60) return setError("Parcelas inválidas (1–60).");
    setError("");

    const purchase: CardPurchase = {
      id: newId(),
      cardId: card.id,
      amount: amt,
      description: description.trim(),
      categoryId,
      purchaseDate,
      totalInstallments: inst,
      createdAt: new Date().toISOString(),
    };

    dispatch({ type: "ADD_PURCHASE", payload: { purchase, card } });
    router.back();
  }

  const expenseCategories = state.categories.filter(c => c.type === "expense");

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
        <div style={{ flex: 1, minWidth: 0 }}>
          <span style={{ fontSize: "17px", fontWeight: 700, color: "var(--text-1)" }}>
            Nova compra
          </span>
          <span style={{ fontSize: "12px", color: "var(--text-3)", marginLeft: "8px" }}>
            {card.name}
          </span>
        </div>
      </div>

      {/* ── Form ── */}
      <div style={{ padding: "20px 16px 140px" }}>

        {/* Valor */}
        <div className="form-group">
          <label className="form-label">Valor total (R$)</label>
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

        {/* Parcelas */}
        <div className="form-group">
          <label className="form-label">Parcelas</label>
          <input
            className="form-input mono"
            type="text"
            inputMode="numeric"
            pattern="[0-9]*"
            placeholder="1"
            maxLength={2}
            value={totalInstallments}
            onChange={e => setTotalInstallments(e.target.value.replace(/\D/g, ""))}
            autoComplete="off"
          />
        </div>

        {/* Preview de parcela */}
        {installmentPreview && (
          <div style={{
            padding: "12px 16px", marginBottom: "16px",
            background: "var(--accent-10)", border: "1px solid var(--border-accent)",
            borderRadius: "var(--r-md)",
            fontSize: "15px", fontWeight: 700, color: "var(--accent)",
            fontFamily: "var(--font-space-mono, monospace)",
            textAlign: "center",
          }}>
            {installmentPreview}
          </div>
        )}

        {/* Descrição */}
        <div className="form-group">
          <label className="form-label">Descrição</label>
          <input
            className="form-input"
            type="text"
            placeholder="Ex: iPhone, Restaurante, Netflix..."
            value={description}
            onChange={e => setDescription(e.target.value)}
            autoComplete="off"
            autoCorrect="off"
          />
        </div>

        {/* Categoria */}
        <div className="form-group">
          <label className="form-label">Categoria</label>
          <select className="form-input" value={categoryId} onChange={e => setCategoryId(e.target.value)}>
            {expenseCategories.map(c => (
              <option key={c.id} value={c.id}>{c.icon} {c.name}</option>
            ))}
          </select>
        </div>

        {/* Data da compra */}
        <div className="form-group" style={{ marginBottom: 0 }}>
          <label className="form-label">Data da compra</label>
          <input
            className="form-input"
            type="date"
            value={purchaseDate}
            onChange={e => setPurchaseDate(e.target.value)}
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
          Adicionar compra
        </button>
      </div>
    </>
  );
}
