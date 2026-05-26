"use client";
import { useState, useEffect } from "react";
import { useApp, newId, CARD_COLORS } from "@/context/AppContext";
import type { CreditCard } from "@/context/AppContext";

interface Props {
  card?: CreditCard;
  onClose: () => void;
}

export default function CardModal({ card, onClose }: Props) {
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

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [onClose]);

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
    dispatch({ type: card ? "UPD_CARD" : "ADD_CARD", payload: c });
    onClose();
  }

  function handleDelete() {
    if (!card) return;
    if (!confirm(`Excluir o cartão "${card.name}"? Todas as compras serão removidas.`)) return;
    dispatch({ type: "DEL_CARD", payload: card.id });
    onClose();
  }

  return (
    <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal">
        <div className="modal-header">
          <span style={{ fontSize: "16px", fontWeight: 700, color: "var(--text-1)" }}>
            {card ? "Editar cartão" : "Adicionar cartão"}
          </span>
          <button className="btn-secondary" onClick={onClose} style={{ padding: "6px 12px", fontSize: "16px" }}>×</button>
        </div>

        <div className="modal-body">
          <div className="form-group">
            <label className="form-label">Nome do cartão</label>
            <input className="form-input" type="text" placeholder="Ex: Nubank, Bradesco, Itaú..." value={name} onChange={e => setName(e.target.value)} autoComplete="off" autoCorrect="off" />
          </div>

          <div className="form-row">
            <div className="form-group" style={{ margin: 0 }}>
              <label className="form-label">Últimos 4 dígitos</label>
              <input className="form-input mono" type="text" inputMode="numeric" pattern="[0-9]*" placeholder="0000" maxLength={4} value={lastDigits} onChange={e => setLastDigits(e.target.value.replace(/\D/g, ""))} autoComplete="off" />
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
            <input className="form-input mono" type="text" inputMode="decimal" pattern="[0-9]*[.,]?[0-9]*" placeholder="0,00" value={totalLimit} onChange={e => setTotalLimit(e.target.value.replace(/[^0-9.,]/g, ""))} autoComplete="off" />
          </div>

          <div className="form-row">
            <div className="form-group" style={{ margin: 0 }}>
              <label className="form-label">Dia de fechamento</label>
              <input className="form-input mono" type="text" inputMode="numeric" pattern="[0-9]*" placeholder="10" maxLength={2} value={closingDay} onChange={e => setClosingDay(e.target.value.replace(/\D/g, ""))} autoComplete="off" />
            </div>
            <div className="form-group" style={{ margin: 0 }}>
              <label className="form-label">Dia de vencimento</label>
              <input className="form-input mono" type="text" inputMode="numeric" pattern="[0-9]*" placeholder="17" maxLength={2} value={dueDay} onChange={e => setDueDay(e.target.value.replace(/\D/g, ""))} autoComplete="off" />
            </div>
          </div>

          <div className="form-group">
            <label className="form-label">Conta para pagamento</label>
            <select className="form-input" value={paymentAccountId} onChange={e => setPaymentAccountId(e.target.value)}>
              {state.accounts.filter(a => a.active).map(a => (
                <option key={a.id} value={a.id}>{a.icon} {a.name}</option>
              ))}
            </select>
          </div>

          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label">Cor do cartão</label>
            <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
              {CARD_COLORS.map(c => (
                <button
                  key={c}
                  onClick={() => setColor(c)}
                  style={{
                    width: "32px", height: "32px", borderRadius: "8px",
                    background: c, border: "none", cursor: "pointer",
                    outline: color === c ? "3px solid white" : "none",
                    outlineOffset: "2px", transition: "outline 0.15s",
                  }}
                />
              ))}
            </div>
          </div>

          {error && <p style={{ color: "var(--red)", fontSize: "12px", marginTop: "12px" }}>{error}</p>}
        </div>

        <div className="modal-footer">
          {card && <button className="btn-danger" onClick={handleDelete}>Excluir</button>}
          <button className="btn-secondary" onClick={onClose}>Cancelar</button>
          <button className="btn-primary" onClick={handleSave}>{card ? "Salvar" : "Adicionar"}</button>
        </div>
      </div>
    </div>
  );
}
