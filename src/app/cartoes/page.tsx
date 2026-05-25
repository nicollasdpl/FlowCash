"use client";
import { useState, useMemo } from "react";
import { useApp, newId } from "@/context/AppContext";
import type { CreditCard, CardPurchase, CardInstallment } from "@/context/AppContext";
import CardModal from "@/components/CardModal";
import {
  getCardLimitSummary, currentMonth, addMonths,
} from "@/engine/financialEngine";
import {
  getCardInvoices, getInstallmentsByMonth,
} from "@/engine/invoiceEngine";

function fmt(v: number) {
  return v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatDate(d: string) {
  if (!d) return "—";
  const [y, m, day] = d.split("-");
  return `${day}/${m}/${y}`;
}

// ─── MODAL DE NOVA COMPRA NO CARTÃO ──────────────────────────────────────────
function PurchaseModal({ card, onClose }: { card: CreditCard; onClose: () => void }) {
  const { state, dispatch } = useApp();
  const todayStr = new Date().toISOString().split("T")[0];

  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [categoryId, setCategoryId] = useState(state.categories.find(c => c.type === "expense")?.id ?? "");
  const [purchaseDate, setPurchaseDate] = useState(todayStr);
  const [totalInstallments, setTotalInstallments] = useState("1");
  const [error, setError] = useState("");

  function handleSave() {
    if (!description.trim()) return setError("Informe a descrição.");
    const amt = parseFloat(amount);
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
    onClose();
  }

  const instCategories = state.categories.filter(c => c.type === "expense");

  return (
    <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal">
        <div className="modal-header">
          <span style={{ fontSize: "16px", fontWeight: 700, color: "var(--text-1)" }}>Nova compra — {card.name}</span>
          <button className="btn-secondary" onClick={onClose} style={{ padding: "6px 12px", fontSize: "16px" }}>×</button>
        </div>
        <div className="modal-body">
          <div className="form-group">
            <label className="form-label">Descrição</label>
            <input className="form-input" placeholder="Ex: iPhone, Restaurante, Netflix..." value={description} onChange={e => setDescription(e.target.value)} />
          </div>
          <div className="form-group">
            <label className="form-label">Categoria</label>
            <select className="form-input" value={categoryId} onChange={e => setCategoryId(e.target.value)}>
              {instCategories.map(c => <option key={c.id} value={c.id}>{c.icon} {c.name}</option>)}
            </select>
          </div>
          <div className="form-row">
            <div className="form-group" style={{ margin: 0 }}>
              <label className="form-label">Valor total (R$)</label>
              <input className="form-input mono" type="number" placeholder="0,00" min="0" step="0.01" value={amount} onChange={e => setAmount(e.target.value)} />
            </div>
            <div className="form-group" style={{ margin: 0 }}>
              <label className="form-label">Parcelas</label>
              <input className="form-input mono" type="number" placeholder="1" min="1" max="60" value={totalInstallments} onChange={e => setTotalInstallments(e.target.value)} />
            </div>
          </div>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label">Data da compra</label>
            <input className="form-input" type="date" value={purchaseDate} onChange={e => setPurchaseDate(e.target.value)} />
          </div>
          {error && <p style={{ color: "var(--red)", fontSize: "12px", marginTop: "12px" }}>{error}</p>}
        </div>
        <div className="modal-footer">
          <button className="btn-secondary" onClick={onClose}>Cancelar</button>
          <button className="btn-primary" onClick={handleSave}>Adicionar compra</button>
        </div>
      </div>
    </div>
  );
}

// ─── PÁGINA PRINCIPAL ─────────────────────────────────────────────────────────
export default function Cartoes() {
  const { state, dispatch } = useApp();
  const [selectedCard, setSelectedCard] = useState<CreditCard | null>(null);
  const [editCard, setEditCard] = useState<CreditCard | null>(null);
  const [showCardModal, setShowCardModal] = useState(false);
  const [showPurchaseModal, setShowPurchaseModal] = useState(false);
  const [selectedMonth, setSelectedMonth] = useState(currentMonth());

  const activeCard = selectedCard ?? state.cards[0] ?? null;

  const invoices = useMemo(() => {
    if (!activeCard) return [];
    return getCardInvoices(activeCard, state.installments, 3);
  }, [activeCard, state.installments]);

  const currentInvoice = useMemo(() => {
    return invoices.find(inv => inv.competenceMonth === selectedMonth) ?? null;
  }, [invoices, selectedMonth]);

  const installmentsThisMonth = useMemo(() => {
    if (!activeCard) return [];
    return getInstallmentsByMonth(state.installments, activeCard.id, selectedMonth);
  }, [activeCard, state.installments, selectedMonth]);

  const limitSummary = useMemo(() => {
    if (!activeCard) return null;
    return getCardLimitSummary(activeCard, state.installments);
  }, [activeCard, state.installments]);

  function payInstallment(inst: CardInstallment) {
    dispatch({
      type: "PAY_INSTALLMENT",
      payload: { installmentId: inst.id, paidAt: new Date().toISOString().split("T")[0] },
    });
  }

  function unpayInstallment(inst: CardInstallment) {
    dispatch({ type: "UNPAY_INSTALLMENT", payload: inst.id });
  }

  function deletePurchase(purchaseId: string) {
    if (!confirm("Excluir esta compra e todas as suas parcelas?")) return;
    dispatch({ type: "DEL_PURCHASE", payload: purchaseId });
  }

  const months = useMemo(() => {
    const cm = currentMonth();
    return Array.from({ length: 6 }, (_, i) => addMonths(cm, i - 1));
  }, []);

  return (
    <div style={{ padding: "28px", maxWidth: "1000px" }}>
      {showCardModal && <CardModal onClose={() => setShowCardModal(false)} />}
      {editCard && <CardModal card={editCard} onClose={() => setEditCard(null)} />}
      {showPurchaseModal && activeCard && (
        <PurchaseModal card={activeCard} onClose={() => setShowPurchaseModal(false)} />
      )}

      {/* Header */}
      <div className="fade-up-1" style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "24px" }}>
        <div>
          <h1 style={{ fontSize: "22px", fontWeight: 700, color: "var(--text-1)", letterSpacing: "-0.03em" }}>Cartões de Crédito</h1>
          <p style={{ fontSize: "13px", color: "var(--text-2)", marginTop: "3px" }}>
            {state.cards.length} cartão{state.cards.length !== 1 ? "ões" : ""} cadastrado{state.cards.length !== 1 ? "s" : ""}
          </p>
        </div>
        <button className="btn-primary" onClick={() => setShowCardModal(true)}>+ Novo cartão</button>
      </div>

      {state.cards.length === 0 && (
        <div className="card" style={{ padding: "48px", textAlign: "center" }}>
          <div style={{ fontSize: "48px", marginBottom: "16px" }}>💳</div>
          <p style={{ color: "var(--text-2)", fontSize: "15px", fontWeight: 600 }}>Nenhum cartão cadastrado</p>
          <p style={{ color: "var(--text-3)", fontSize: "13px", marginTop: "6px", marginBottom: "20px" }}>Adicione seu cartão para controlar faturas e parcelamentos.</p>
          <button className="btn-primary" onClick={() => setShowCardModal(true)}>+ Adicionar cartão</button>
        </div>
      )}

      {state.cards.length > 0 && (
        <>
          {/* Card selector */}
          <div className="fade-up-2" style={{ display: "flex", gap: "12px", marginBottom: "20px", flexWrap: "wrap" }}>
            {state.cards.map(card => {
              const summary = getCardLimitSummary(card, state.installments);
              const usedPct = Math.min((summary.usedLimit / summary.totalLimit) * 100, 100);
              const isActive = card.id === (activeCard?.id ?? state.cards[0]?.id);
              return (
                <div
                  key={card.id}
                  onClick={() => setSelectedCard(card)}
                  style={{
                    flex: "0 0 240px", borderRadius: "16px", padding: "20px",
                    background: isActive
                      ? `linear-gradient(135deg, ${card.color}33, ${card.color}18)`
                      : "var(--bg-card)",
                    border: `1px solid ${isActive ? card.color + "55" : "var(--border)"}`,
                    cursor: "pointer", transition: "all 0.2s",
                    boxShadow: isActive ? `0 0 20px ${card.color}22` : "none",
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "16px" }}>
                    <div>
                      <p style={{ fontSize: "14px", fontWeight: 700, color: "var(--text-1)" }}>{card.name}</p>
                      <p style={{ fontSize: "11.5px", color: "var(--text-3)", marginTop: "2px" }}>
                        {card.brand} •••• {card.lastDigits}
                      </p>
                    </div>
                    <button
                      onClick={e => { e.stopPropagation(); setEditCard(card); }}
                      style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-3)", fontSize: "14px" }}
                    >✏️</button>
                  </div>
                  <div style={{ marginBottom: "10px" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "6px" }}>
                      <span style={{ fontSize: "11px", color: "var(--text-3)" }}>Limite usado</span>
                      <span className="mono" style={{ fontSize: "11px", color: card.color, fontWeight: 700 }}>
                        {Math.round(usedPct)}%
                      </span>
                    </div>
                    <div style={{ height: "4px", background: "rgba(255,255,255,0.08)", borderRadius: "2px" }}>
                      <div style={{ height: "100%", width: `${usedPct}%`, background: card.color, borderRadius: "2px", transition: "width 0.3s" }} />
                    </div>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between" }}>
                    <div>
                      <p style={{ fontSize: "10px", color: "var(--text-3)", marginBottom: "2px" }}>Disponível</p>
                      <p className="mono" style={{ fontSize: "13px", fontWeight: 700, color: "var(--green)" }}>
                        R$ {fmt(summary.availableLimit)}
                      </p>
                    </div>
                    <div style={{ textAlign: "right" }}>
                      <p style={{ fontSize: "10px", color: "var(--text-3)", marginBottom: "2px" }}>Fatura atual</p>
                      <p className="mono" style={{ fontSize: "13px", fontWeight: 700, color: "var(--text-1)" }}>
                        R$ {fmt(summary.currentInvoiceAmount)}
                      </p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {activeCard && (
            <>
              {/* Month selector */}
              <div className="fade-up-3" style={{ display: "flex", gap: "12px", marginBottom: "16px", alignItems: "center", flexWrap: "wrap" }}>
                <div style={{ display: "flex", gap: "8px" }}>
                  {months.map(m => (
                    <button
                      key={m}
                      className={`filter-btn${selectedMonth === m ? " active" : ""}`}
                      onClick={() => setSelectedMonth(m)}
                    >
                      {new Date(m + "-15").toLocaleDateString("pt-BR", { month: "short", year: "2-digit" }).replace(".", "")}
                    </button>
                  ))}
                </div>
                <div style={{ marginLeft: "auto" }}>
                  <button
                    className="btn-primary"
                    style={{ fontSize: "13px", padding: "8px 16px" }}
                    onClick={() => setShowPurchaseModal(true)}
                  >+ Nova compra</button>
                </div>
              </div>

              {/* Invoice details */}
              <div className="card fade-up-4" style={{ marginBottom: "16px", overflow: "hidden" }}>
                <div style={{ padding: "18px 20px", borderBottom: "1px solid var(--border)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div>
                    <p style={{ fontSize: "13px", fontWeight: 700, color: "var(--text-1)" }}>
                      Fatura {new Date(selectedMonth + "-15").toLocaleDateString("pt-BR", { month: "long", year: "numeric" })}
                    </p>
                    {currentInvoice && (
                      <p style={{ fontSize: "11.5px", color: "var(--text-3)", marginTop: "3px" }}>
                        Fechamento: {formatDate(currentInvoice.closingDate)} · Vencimento: {formatDate(currentInvoice.dueDate)}
                      </p>
                    )}
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <p style={{ fontSize: "11px", color: "var(--text-3)", marginBottom: "4px" }}>Total da fatura</p>
                    <p className="mono" style={{ fontSize: "22px", fontWeight: 700, color: "var(--text-1)", letterSpacing: "-0.02em" }}>
                      R$ {fmt(currentInvoice?.totalAmount ?? 0)}
                    </p>
                    {currentInvoice && (
                      <span style={{
                        fontSize: "11px", fontWeight: 700, padding: "3px 10px", borderRadius: "6px", marginTop: "6px", display: "inline-block",
                        background: currentInvoice.status === "paid" ? "var(--green-10)" : currentInvoice.status === "closed" ? "var(--red-10)" : "var(--amber-10)",
                        color: currentInvoice.status === "paid" ? "var(--green)" : currentInvoice.status === "closed" ? "var(--red)" : "var(--amber)",
                        border: `1px solid ${currentInvoice.status === "paid" ? "var(--green-20)" : currentInvoice.status === "closed" ? "var(--red-20)" : "var(--amber-20)"}`,
                      }}>
                        {currentInvoice.status === "paid" ? "Paga" : currentInvoice.status === "closed" ? "Fechada" : "Em aberto"}
                      </span>
                    )}
                  </div>
                </div>

                {installmentsThisMonth.length === 0 ? (
                  <div style={{ padding: "32px", textAlign: "center", color: "var(--text-3)", fontSize: "13px" }}>
                    Nenhuma compra nesta fatura.
                  </div>
                ) : (
                  <div>
                    <div style={{
                      display: "grid", gridTemplateColumns: "1fr 100px 80px 120px 120px",
                      padding: "10px 20px", borderBottom: "1px solid var(--border)",
                      fontSize: "10px", fontWeight: 700, color: "var(--text-3)", letterSpacing: "0.07em", textTransform: "uppercase",
                    }}>
                      <span>Descrição</span>
                      <span>Categoria</span>
                      <span style={{ textAlign: "center" }}>Parcela</span>
                      <span style={{ textAlign: "right" }}>Valor</span>
                      <span style={{ textAlign: "center" }}>Ação</span>
                    </div>
                    {installmentsThisMonth.map((inst, i) => {
                      const purchase = state.purchases.find(p => p.id === inst.purchaseId);
                      const cat = state.categories.find(c => c.id === purchase?.categoryId);
                      return (
                        <div
                          key={inst.id}
                          style={{
                            display: "grid", gridTemplateColumns: "1fr 100px 80px 120px 120px",
                            padding: "13px 20px", alignItems: "center",
                            borderBottom: i < installmentsThisMonth.length - 1 ? "1px solid var(--border)" : "none",
                            opacity: inst.paid ? 0.6 : 1,
                          }}
                        >
                          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                            <div style={{
                              width: "32px", height: "32px", borderRadius: "8px", flexShrink: 0,
                              background: cat ? `${cat.color}18` : "rgba(255,255,255,0.06)",
                              display: "flex", alignItems: "center", justifyContent: "center", fontSize: "14px",
                            }}>{cat?.icon ?? "📦"}</div>
                            <p style={{ fontSize: "13px", fontWeight: 600, color: "var(--text-1)", textDecoration: inst.paid ? "line-through" : "none" }}>
                              {purchase?.description ?? "—"}
                            </p>
                          </div>
                          <span style={{ fontSize: "11.5px", color: "var(--text-3)" }}>{cat?.name ?? "—"}</span>
                          <span style={{ textAlign: "center", fontSize: "12px", color: "var(--text-3)" }}>
                            {inst.installmentNumber}/{inst.totalInstallments}
                          </span>
                          <div className="mono" style={{ textAlign: "right", fontSize: "14px", fontWeight: 700, color: "var(--text-1)" }}>
                            R$ {fmt(inst.amount)}
                          </div>
                          <div style={{ display: "flex", gap: "6px", justifyContent: "center" }}>
                            <button
                              onClick={() => inst.paid ? unpayInstallment(inst) : payInstallment(inst)}
                              style={{
                                padding: "5px 10px", borderRadius: "7px", cursor: "pointer",
                                fontSize: "11px", fontWeight: 700, fontFamily: "inherit",
                                background: inst.paid ? "var(--green-10)" : "rgba(255,255,255,0.05)",
                                color: inst.paid ? "var(--green)" : "var(--text-3)",
                                border: inst.paid ? "1px solid var(--green-20)" : "1px solid var(--border)",
                              }}
                            >{inst.paid ? "✓ Pago" : "Pagar"}</button>
                            {purchase && (
                              <button
                                onClick={() => deletePurchase(purchase.id)}
                                style={{
                                  width: "28px", height: "28px", borderRadius: "7px", cursor: "pointer",
                                  background: "var(--red-10)", border: "1px solid var(--red-20)",
                                  color: "var(--red)", fontSize: "12px", fontFamily: "inherit",
                                  display: "flex", alignItems: "center", justifyContent: "center",
                                }}
                              >🗑</button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Limit bar */}
              {limitSummary && (
                <div className="card fade-up-5" style={{ padding: "18px 20px" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px" }}>
                    <p style={{ fontSize: "12px", fontWeight: 700, color: "var(--text-3)", letterSpacing: "0.05em", textTransform: "uppercase" }}>
                      Limite do cartão
                    </p>
                    <p style={{ fontSize: "11.5px", color: "var(--text-3)" }}>
                      Fecha dia <strong style={{ color: "var(--text-2)" }}>{activeCard.closingDay}</strong> · Vence dia <strong style={{ color: "var(--text-2)" }}>{activeCard.dueDay}</strong>
                    </p>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "10px" }}>
                    <div>
                      <p style={{ fontSize: "10.5px", color: "var(--text-3)", marginBottom: "3px" }}>Usado (todas as parcelas futuras)</p>
                      <p className="mono" style={{ fontSize: "16px", fontWeight: 700, color: "var(--red)" }}>R$ {fmt(limitSummary.usedLimit)}</p>
                    </div>
                    <div style={{ textAlign: "right" }}>
                      <p style={{ fontSize: "10.5px", color: "var(--text-3)", marginBottom: "3px" }}>Disponível</p>
                      <p className="mono" style={{ fontSize: "16px", fontWeight: 700, color: "var(--green)" }}>R$ {fmt(limitSummary.availableLimit)}</p>
                    </div>
                    <div style={{ textAlign: "right" }}>
                      <p style={{ fontSize: "10.5px", color: "var(--text-3)", marginBottom: "3px" }}>Limite total</p>
                      <p className="mono" style={{ fontSize: "16px", fontWeight: 700, color: "var(--text-2)" }}>R$ {fmt(limitSummary.totalLimit)}</p>
                    </div>
                  </div>
                  <div style={{ height: "8px", background: "rgba(255,255,255,0.06)", borderRadius: "4px", overflow: "hidden" }}>
                    <div style={{
                      height: "100%",
                      width: `${Math.min((limitSummary.usedLimit / limitSummary.totalLimit) * 100, 100)}%`,
                      background: limitSummary.usedLimit / limitSummary.totalLimit > 0.8 ? "var(--red)" : activeCard.color,
                      borderRadius: "4px", transition: "width 0.3s",
                    }} />
                  </div>
                </div>
              )}
            </>
          )}
        </>
      )}
    </div>
  );
}
