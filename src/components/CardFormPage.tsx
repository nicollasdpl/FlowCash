"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useApp, newId, CARD_COLORS } from "@/context/AppContext";
import type { CreditCard } from "@/context/AppContext";

interface Props {
  card?: CreditCard;
}

export default function CardFormPage({ card }: Props) {
  const router = useRouter();
  const { state, dispatch } = useApp();

  const [name, setName] = useState(card?.name ?? "");
  const [lastDigits, setLastDigits] = useState(card?.lastDigits ?? "");
  const [brand, setBrand] = useState(card?.brand ?? "Visa");
  const [totalLimit, setTotalLimit] = useState(card ? String(card.totalLimit) : "");
  const [closingDay, setClosingDay] = useState(card ? String(card.closingDay) : "");
  const [dueDay, setDueDay] = useState(card ? String(card.dueDay) : "");
  const [paymentAccountId, setPaymentAccountId] = useState(
    card?.paymentAccountId ?? (state.accounts[0]?.id ?? "")
  );
  const [color, setColor] = useState(card?.color ?? CARD_COLORS[0]);
  const [error, setError] = useState("");

  const isEdit = !!card;

  function handleSave() {
    if (!name.trim()) return setError("Informe o nome do cartão.");
    if (!totalLimit || parseFloat(totalLimit.replace(",", ".")) <= 0) return setError("Informe o limite.");
    const cd = parseInt(closingDay);
    const dd = parseInt(dueDay);
    if (!closingDay || cd < 1 || cd > 31) return setError("Dia de fechamento inválido (1–31).");
    if (!dueDay || dd < 1 || dd > 31) return setError("Dia de vencimento inválido (1–31).");
    setError("");

    const c: CreditCard = {
      id: card?.id ?? newId(),
      name: name.trim(),
      lastDigits: lastDigits.slice(-4).padStart(4, "0"),
      brand,
      totalLimit: parseFloat(totalLimit.replace(",", ".")),
      closingDay: cd,
      dueDay: dd,
      paymentAccountId,
      color,
      active: true,
    };
    dispatch({ type: isEdit ? "UPD_CARD" : "ADD_CARD", payload: c });
    router.back();
  }

  function handleDelete() {
    if (!card) return;
    if (!confirm(`Excluir o cartão "${card.name}"? Todas as compras serão removidas.`)) return;
    dispatch({ type: "DEL_CARD", payload: card.id });
    router.push("/cartoes");
  }

  return (
    <>
      <div style={{
        position: "sticky", top: 0, zIndex: 10,
        background: "var(--bg)", borderBottom: "1px solid var(--border)",
        display: "flex", alignItems: "center", gap: "4px",
        padding: "0 8px 0 4px", height: "60px", flexShrink: 0,
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
          {isEdit ? "Editar cartão" : "Novo cartão"}
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

      <div style={{ padding: "20px 16px 140px" }}>
        <div className="form-group">
          <label className="form-label">Nome do cartão</label>
          <input
            className="form-input"
            type="text"
            placeholder="Ex: Nubank, Bradesco, Itaú..."
            value={name}
            onChange={e => setName(e.target.value)}
            autoComplete="off"
            autoCorrect="off"
          />
        </div>

        <div className="form-row">
          <div className="form-group" style={{ margin: 0 }}>
            <label className="form-label">Últimos 4 dígitos</label>
            <input
              className="form-input mono"
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              placeholder="0000"
              maxLength={4}
              value={lastDigits}
              onChange={e => setLastDigits(e.target.value.replace(/\D/g, ""))}
              autoComplete="off"
            />
          </div>
          <div className="form-group" style={{ margin: 0 }}>
            <label className="form-label">Bandeira</label>
            <select className="form-input" value={brand} onChange={e => setBrand(e.target.value)}>
              {["Visa", "Mastercard", "Elo", "Amex", "Hipercard"].map(b => (
                <option key={b} value={b}>{b}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="form-group">
          <label className="form-label">Limite (R$)</label>
          <input
            className="form-input mono"
            type="text"
            inputMode="decimal"
            pattern="[0-9]*[.,]?[0-9]*"
            placeholder="0,00"
            value={totalLimit}
            onChange={e => setTotalLimit(e.target.value.replace(/[^0-9.,]/g, ""))}
            autoComplete="off"
          />
        </div>

        <div className="form-row">
          <div className="form-group" style={{ margin: 0 }}>
            <label className="form-label">Dia de fechamento</label>
            <input
              className="form-input mono"
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              placeholder="10"
              maxLength={2}
              value={closingDay}
              onChange={e => setClosingDay(e.target.value.replace(/\D/g, ""))}
              autoComplete="off"
            />
          </div>
          <div className="form-group" style={{ margin: 0 }}>
            <label className="form-label">Dia de vencimento</label>
            <input
              className="form-input mono"
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              placeholder="17"
              maxLength={2}
              value={dueDay}
              onChange={e => setDueDay(e.target.value.replace(/\D/g, ""))}
              autoComplete="off"
            />
          </div>
        </div>

        <div className="form-group">
          <label className="form-label">Conta para pagamento</label>
          <select
            className="form-input"
            value={paymentAccountId}
            onChange={e => setPaymentAccountId(e.target.value)}
          >
            {state.accounts.filter(a => a.active).map(a => (
              <option key={a.id} value={a.id}>{a.icon} {a.name}</option>
            ))}
          </select>
        </div>

        <div className="form-group" style={{ marginBottom: 0 }}>
          <label className="form-label">Cor do cartão</label>
          <div style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(34px, 1fr))",
            gap: "8px",
            maxWidth: "320px",
          }}>
            {CARD_COLORS.map(c => (
              <button
                key={c}
                onClick={() => setColor(c)}
                style={{
                  width: "100%", aspectRatio: "1", maxWidth: "40px",
                  borderRadius: "10px",
                  background: c, border: "none", cursor: "pointer",
                  outline: color === c ? "3px solid white" : "none",
                  outlineOffset: "2px", transition: "outline 0.15s",
                  touchAction: "manipulation",
                }}
              />
            ))}
          </div>
        </div>
      </div>

      <div style={{
        position: "fixed", bottom: 0, left: 0, right: 0, zIndex: 50,
        background: "var(--bg)", borderTop: "1px solid var(--border)",
        padding: "12px 16px",
        paddingBottom: "calc(12px + env(safe-area-inset-bottom, 0px))",
        display: "flex", flexDirection: "column", gap: "8px",
      }}>
        {error && (
          <p style={{ color: "var(--red)", fontSize: "13px", fontWeight: 600, textAlign: "center" }}>
            {error}
          </p>
        )}
        <button
          className="btn-primary"
          onClick={handleSave}
          style={{ width: "100%", textAlign: "center", justifyContent: "center" }}
        >
          {isEdit ? "Salvar alterações" : "Adicionar cartão"}
        </button>
      </div>
    </>
  );
}
