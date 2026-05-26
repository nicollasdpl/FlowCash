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

// ─── MODAL DE NOVA COMPRA ─────────────────────────────────────────────────────
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
    onClose();
  }

  const instCategories = state.categories.filter(c => c.type === "expense");

  return (
    <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal">
        <div className="modal-header">
          <span style={{ fontSize: "16px", fontWeight: 700, color: "var(--text-1)" }}>
            Nova compra — {card.name}
          </span>
          <button className="btn-secondary" onClick={onClose} style={{ padding: "6px 12px", fontSize: "16px" }}>×</button>
        </div>
        <div className="modal-body">
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
          <div className="form-group">
            <label className="form-label">Categoria</label>
            <select className="form-input" value={categoryId} onChange={e => setCategoryId(e.target.value)}>
              {instCategories.map(c => <option key={c.id} value={c.id}>{c.icon} {c.name}</option>)}
            </select>
          </div>
          <div className="form-row">
            <div className="form-group" style={{ margin: 0 }}>
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
              />
            </div>
            <div className="form-group" style={{ margin: 0 }}>
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
    return Array.from({ length: 5 }, (_, i) => addMonths(cm, i - 1));
  }, []);

  return (
    <div style={{ padding: "20px 16px", maxWidth: "1000px", margin: "0 auto" }}>
      {showCardModal && <CardModal onClose={() => setShowCardModal(false)} />}
      {editCard && <CardModal card={editCard} onClose={() => setEditCard(null)} />}
      {showPurchaseModal && activeCard && (
        <PurchaseModal card={activeCard} onClose={() => setShowPurchaseModal(false)} />
      )}

      {/* Header */}
      <div className="fade-up-1" style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "20px" }}>
        <div>
          <h1 style={{ fontSize: "20px", fontWeight: 700, color: "var(--text-1)", letterSpacing: "-0.03em" }}>
            Cartões de Crédito
          </h1>
          <p style={{ fontSize: "12px", color: "var(--text-3)", marginTop: "2px" }}>
            {state.cards.length} cartão{state.cards.length !== 1 ? "ões" : ""} cadastrado{state.cards.length !== 1 ? "s" : ""}
          </p>
        </div>
        <button className="btn-primary" onClick={() => setShowCardModal(true)} style={{ fontSize: "13px", padding: "10px 16px" }}>
          + Novo
        </button>
      </div>

      {state.cards.length === 0 && (
        <div className="card" style={{ padding: "48px 24px", textAlign: "center" }}>
          <div style={{ fontSize: "44px", marginBottom: "14px" }}>💳</div>
          <p style={{ color: "var(--text-2)", fontSize: "15px", fontWeight: 600 }}>Nenhum cartão cadastrado</p>
          <p style={{ color: "var(--text-3)", fontSize: "13px", marginTop: "6px", marginBottom: "20px" }}>
            Adicione seu cartão para controlar faturas e parcelamentos.
          </p>
          <button className="btn-primary" onClick={() => setShowCardModal(true)}>+ Adicionar cartão</button>
        </div>
      )}

      {state.cards.length > 0 && (
        <>
          {/* Card selector — scroll horizontal no mobile */}
          <div
            className="fade-up-2"
            style={{
              display: "flex", gap: "10px", marginBottom: "16px",
              overflowX: "auto", paddingBottom: "4px",
              WebkitOverflowScrolling: "touch",
              scrollbarWidth: "none",
            }}
          >
            {state.cards.map(card => {
              const summary = getCardLimitSummary(card, state.installments);
              const usedPct = Math.min((summary.usedLimit / summary.totalLimit) * 100, 100);
              const isActive = card.id === (activeCard?.id ?? state.cards[0]?.id);
              return (
                <div
                  key={card.id}
                  onClick={() => setSelectedCard(card)}
                  style={{
                    flex: "0 0 220px", borderRadius: "14px", padding: "16px",
                    background: isActive
                      ? `linear-gradient(135deg, ${card.color}33, ${card.color}18)`
                      : "var(--bg-card)",
                    border: `1px solid ${isActive ? card.color + "55" : "var(--border)"}`,
                    cursor: "pointer", transition: "all 0.18s",
                    boxShadow: isActive ? `0 0 18px ${card.color}22` : "none",
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "12px" }}>
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <p style={{ fontSize: "13px", fontWeight: 700, color: "var(--text-1)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {card.name}
                      </p>
                      <p style={{ fontSize: "11px", color: "var(--text-3)", marginTop: "2px" }}>
                        {card.brand} •••• {card.lastDigits}
                      </p>
                    </div>
                    <button
                      onClick={e => { e.stopPropagation(); setEditCard(card); }}
                      style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-3)", fontSize: "13px", flexShrink: 0, padding: "0 0 0 8px" }}
                    >✏️</button>
                  </div>
                  <div style={{ marginBottom: "8px" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "5px" }}>
                      <span style={{ fontSize: "10px", color: "var(--text-3)" }}>Limite usado</span>
                      <span className="mono" style={{ fontSize: "10px", color: card.color, fontWeight: 700 }}>
                        {Math.round(usedPct)}%
                      </span>
                    </div>
                    <div style={{ height: "3px", background: "rgba(255,255,255,0.08)", borderRadius: "2px" }}>
                      <div style={{ height: "100%", width: `${usedPct}%`, background: card.color, borderRadius: "2px" }} />
                    </div>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between" }}>
                    <div>
                      <p style={{ fontSize: "9.5px", color: "var(--text-3)", marginBottom: "2px" }}>Disponível</p>
                      <p className="mono" style={{ fontSize: "12px", fontWeight: 700, color: "var(--green)" }}>
                        R$ {fmt(summary.availableLimit)}
                      </p>
                    </div>
                    <div style={{ textAlign: "right" }}>
                      <p style={{ fontSize: "9.5px", color: "var(--text-3)", marginBottom: "2px" }}>Fatura</p>
                      <p className="mono" style={{ fontSize: "12px", fontWeight: 700, color: "var(--text-1)" }}>
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
              {/* Month selector + botão Nova compra */}
              <div className="fade-up-3" style={{ marginBottom: "14px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "10px" }}>
                  <div style={{
                    display: "flex", gap: "6px", flex: 1,
                    overflowX: "auto", paddingBottom: "2px",
                    WebkitOverflowScrolling: "touch",
                    scrollbarWidth: "none",
                  }}>
                    {months.map(m => (
                      <button
                        key={m}
                        className={`filter-btn${selectedMonth === m ? " active" : ""}`}
                        onClick={() => setSelectedMonth(m)}
                        style={{ fontSize: "11.5px", padding: "7px 12px", flexShrink: 0 }}
                      >
                        {new Date(m + "-15").toLocaleDateString("pt-BR", { month: "short", year: "2-digit" }).replace(".", "")}
                      </button>
                    ))}
                  </div>
                  <button
                    className="btn-primary"
                    style={{ fontSize: "12px", padding: "8px 14px", flexShrink: 0, whiteSpace: "nowrap" }}
                    onClick={() => setShowPurchaseModal(true)}
                  >+ Compra</button>
                </div>
              </div>

              {/* Invoice header */}
              <div className="card fade-up-4" style={{ marginBottom: "12px", overflow: "hidden" }}>
                <div style={{
                  padding: "14px 16px", borderBottom: "1px solid var(--border)",
                  display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "8px",
                }}>
                  <div>
                    <p style={{ fontSize: "13px", fontWeight: 700, color: "var(--text-1)" }}>
                      Fatura {new Date(selectedMonth + "-15").toLocaleDateString("pt-BR", { month: "long", year: "numeric" })}
                    </p>
                    {currentInvoice && (
                      <p style={{ fontSize: "11px", color: "var(--text-3)", marginTop: "3px" }}>
                        Fecha {formatDate(currentInvoice.closingDate)} · Vence {formatDate(currentInvoice.dueDate)}
                      </p>
                    )}
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                    {currentInvoice && (
                      <span style={{
                        fontSize: "11px", fontWeight: 700, padding: "4px 10px", borderRadius: "6px",
                        background: currentInvoice.status === "paid" ? "var(--green-10)" : currentInvoice.status === "closed" ? "var(--red-10)" : "var(--amber-10)",
                        color: currentInvoice.status === "paid" ? "var(--green)" : currentInvoice.status === "closed" ? "var(--red)" : "var(--amber)",
                        border: `1px solid ${currentInvoice.status === "paid" ? "var(--green-20)" : currentInvoice.status === "closed" ? "var(--red-20)" : "var(--amber-20)"}`,
                      }}>
                        {currentInvoice.status === "paid" ? "Paga" : currentInvoice.status === "closed" ? "Fechada" : "Em aberto"}
                      </span>
                    )}
                    <p className="mono" style={{ fontSize: "20px", fontWeight: 700, color: "var(--text-1)", letterSpacing: "-0.02em" }}>
                      R$ {fmt(currentInvoice?.totalAmount ?? 0)}
                    </p>
                  </div>
                </div>

                {/* Installments — card layout para mobile */}
                {installmentsThisMonth.length === 0 ? (
                  <div style={{ padding: "32px 16px", textAlign: "center", color: "var(--text-3)", fontSize: "13px" }}>
                    Nenhuma compra nesta fatura.
                  </div>
                ) : (
                  <div>
                    {installmentsThisMonth.map((inst, i) => {
                      const purchase = state.purchases.find(p => p.id === inst.purchaseId);
                      const cat = state.categories.find(c => c.id === purchase?.categoryId);
                      return (
                        <div
                          key={inst.id}
                          style={{
                            display: "flex", alignItems: "center", gap: "12px",
                            padding: "13px 16px",
                            borderTop: "1px solid var(--border)",
                            opacity: inst.paid ? 0.55 : 1,
                          }}
                        >
                          <div style={{
                            width: "38px", height: "38px", borderRadius: "10px", flexShrink: 0,
                            background: cat ? `${cat.color}18` : "rgba(255,255,255,0.06)",
                            display: "flex", alignItems: "center", justifyContent: "center", fontSize: "16px",
                          }}>{cat?.icon ?? "📦"}</div>

                          <div style={{ flex: 1, minWidth: 0 }}>
                            <p style={{
                              fontSize: "13px", fontWeight: 600, color: "var(--text-1)",
                              overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                              textDecoration: inst.paid ? "line-through" : "none",
                            }}>
                              {purchase?.description ?? "—"}
                            </p>
                            <p style={{ fontSize: "10.5px", color: "var(--text-3)", marginTop: "2px" }}>
                              {cat?.name ?? "—"} · {inst.installmentNumber}/{inst.totalInstallments}x
                            </p>
                          </div>

                          <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: "6px", flexShrink: 0 }}>
                            <p className="mono" style={{ fontSize: "13px", fontWeight: 700, color: "var(--text-1)" }}>
                              R$ {fmt(inst.amount)}
                            </p>
                            <div style={{ display: "flex", gap: "5px" }}>
                              <button
                                onClick={() => inst.paid ? unpayInstallment(inst) : payInstallment(inst)}
                                style={{
                                  padding: "5px 10px", borderRadius: "7px", cursor: "pointer",
                                  fontSize: "11px", fontWeight: 700, fontFamily: "inherit",
                                  background: inst.paid ? "var(--green-10)" : "rgba(255,255,255,0.05)",
                                  color: inst.paid ? "var(--green)" : "var(--text-3)",
                                  border: inst.paid ? "1px solid var(--green-20)" : "1px solid var(--border)",
                                  minHeight: "30px",
                                }}
                              >{inst.paid ? "✓ Pago" : "Pagar"}</button>
                              {purchase && (
                                <button
                                  onClick={() => deletePurchase(purchase.id)}
                                  style={{
                                    width: "30px", height: "30px", borderRadius: "7px", cursor: "pointer",
                                    background: "var(--red-10)", border: "1px solid var(--red-20)",
                                    color: "var(--red)", fontSize: "12px", fontFamily: "inherit",
                                    display: "flex", alignItems: "center", justifyContent: "center",
                                  }}
                                >🗑</button>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Limit bar */}
              {limitSummary && (
                <div className="card fade-up-5" style={{ padding: "16px" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "10px" }}>
                    <p style={{ fontSize: "11px", fontWeight: 700, color: "var(--text-3)", letterSpacing: "0.05em", textTransform: "uppercase" }}>
                      Limite do cartão
                    </p>
                    <p style={{ fontSize: "11px", color: "var(--text-3)" }}>
                      Fecha dia <strong style={{ color: "var(--text-2)" }}>{activeCard.closingDay}</strong> · Vence <strong style={{ color: "var(--text-2)" }}>{activeCard.dueDay}</strong>
                    </p>
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "10px", marginBottom: "10px" }}>
                    <div>
                      <p style={{ fontSize: "10px", color: "var(--text-3)", marginBottom: "3px" }}>Usado</p>
                      <p className="mono" style={{ fontSize: "14px", fontWeight: 700, color: "var(--red)" }}>R$ {fmt(limitSummary.usedLimit)}</p>
                    </div>
                    <div style={{ textAlign: "center" }}>
                      <p style={{ fontSize: "10px", color: "var(--text-3)", marginBottom: "3px" }}>Disponível</p>
                      <p className="mono" style={{ fontSize: "14px", fontWeight: 700, color: "var(--green)" }}>R$ {fmt(limitSummary.availableLimit)}</p>
                    </div>
                    <div style={{ textAlign: "right" }}>
                      <p style={{ fontSize: "10px", color: "var(--text-3)", marginBottom: "3px" }}>Total</p>
                      <p className="mono" style={{ fontSize: "14px", fontWeight: 700, color: "var(--text-2)" }}>R$ {fmt(limitSummary.totalLimit)}</p>
                    </div>
                  </div>
                  <div style={{ height: "6px", background: "rgba(255,255,255,0.06)", borderRadius: "3px", overflow: "hidden" }}>
                    <div style={{
                      height: "100%",
                      width: `${Math.min((limitSummary.usedLimit / limitSummary.totalLimit) * 100, 100)}%`,
                      background: limitSummary.usedLimit / limitSummary.totalLimit > 0.8 ? "var(--red)" : activeCard.color,
                      borderRadius: "3px", transition: "width 0.3s",
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
