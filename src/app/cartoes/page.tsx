"use client";
import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { useApp, newId } from "@/context/AppContext";
import type { CreditCard, CardInstallment } from "@/context/AppContext";
import {
  getCardLimitSummary, getCurrentBalance, currentMonth, addMonths, today,
} from "@/engine/financialEngine";
import {
  getCardInvoices, getInstallmentsByMonth,
} from "@/engine/invoiceEngine";
import { CreditCard as CreditCardIcon, Pencil, Package, Trash2 } from "lucide-react";

function fmt(v: number) {
  return v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatDate(d: string) {
  if (!d) return "—";
  const [y, m, day] = d.split("-");
  return `${day}/${m}/${y}`;
}

export default function Cartoes() {
  const router = useRouter();
  const { state, dispatch } = useApp();
  const [selectedCard, setSelectedCard] = useState<CreditCard | null>(null);
  const [selectedMonth, setSelectedMonth] = useState(currentMonth());
  const [payError, setPayError] = useState("");
  const [payWarning, setPayWarning] = useState("");

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

  function payInvoice() {
    if (!activeCard) return;

    setPayError("");
    setPayWarning("");

    if (!activeCard.paymentAccountId) {
      setPayError("Vincule uma conta bancária ao cartão antes de pagar a fatura. Edite o cartão para configurar.");
      return;
    }

    const pendingInsts = installmentsThisMonth.filter(i => !i.paid);
    if (pendingInsts.length === 0) return;

    const total = pendingInsts.reduce((s, i) => s + i.amount, 0);

    const paymentAccount = state.accounts.find(a => a.id === activeCard.paymentAccountId);
    if (paymentAccount) {
      const balance = getCurrentBalance(paymentAccount, state.transactions);
      if (balance < total) {
        setPayWarning(`Saldo insuficiente (R$ ${fmt(balance)}). A conta ficará negativa após o pagamento.`);
      }
    }

    const todayDate = today();

    pendingInsts.forEach(inst => {
      dispatch({
        type: "PAY_INSTALLMENT",
        payload: { installmentId: inst.id, paidAt: todayDate },
      });
    });

    const cardCategory = state.categories.find(c =>
      /cart[aã]o|credit/i.test(c.name) && c.type === "expense"
    );
    const fallbackCategory = state.categories.find(c => c.type === "expense");
    const categoryId = cardCategory?.id ?? fallbackCategory?.id ?? "";

    const monthLabel = new Date(selectedMonth + "-15")
      .toLocaleDateString("pt-BR", { month: "short", year: "2-digit" })
      .replace(".", "");

    dispatch({
      type: "ADD_TX",
      payload: {
        id: newId(),
        accountId: activeCard.paymentAccountId,
        type: "expense",
        amount: total,
        description: `Fatura ${activeCard.name} ${monthLabel}`,
        categoryId,
        competenceDate: todayDate,
        paymentDate: todayDate,
        status: "paid",
        isRecurring: false,
        origin: "invoice",
        createdAt: new Date().toISOString(),
      },
    });
  }

  const months = useMemo(() => {
    const cm = currentMonth();
    return Array.from({ length: 5 }, (_, i) => addMonths(cm, i - 1));
  }, []);

  return (
    <div style={{ padding: "20px 16px", maxWidth: "1000px", margin: "0 auto" }}>

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
        <button className="btn-primary" onClick={() => router.push("/cartoes/nova")} style={{ fontSize: "13px", padding: "10px 16px" }}>
          + Novo
        </button>
      </div>

      {state.cards.length === 0 && (
        <div className="card" style={{ padding: "48px 24px", textAlign: "center" }}>
          <div style={{ display: "flex", justifyContent: "center", marginBottom: "14px", color: "var(--text-3)" }}>
            <CreditCardIcon size={44} strokeWidth={1.5} />
          </div>
          <p style={{ color: "var(--text-2)", fontSize: "15px", fontWeight: 600 }}>Nenhum cartão cadastrado</p>
          <p style={{ color: "var(--text-3)", fontSize: "13px", marginTop: "6px", marginBottom: "20px" }}>
            Adicione seu cartão para controlar faturas e parcelamentos.
          </p>
          <button className="btn-primary" onClick={() => router.push("/cartoes/nova")}>+ Adicionar cartão</button>
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
                      onClick={e => { e.stopPropagation(); router.push(`/cartoes/${card.id}/editar`); }}
                      style={{
                        background: "none", border: "none", cursor: "pointer", color: "var(--text-3)",
                        flexShrink: 0, padding: "0 0 0 8px",
                        display: "flex", alignItems: "center", justifyContent: "center",
                        minWidth: "28px", minHeight: "28px",
                      }}
                    >
                      <Pencil size={14} strokeWidth={1.5} />
                    </button>
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
                    onClick={() => activeCard && router.push(`/cartoes/${activeCard.id}/nova-compra`)}
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

                {/* Pagar Fatura */}
                {installmentsThisMonth.length > 0 && (() => {
                  const pendingInsts = installmentsThisMonth.filter(i => !i.paid);
                  const allPaid = pendingInsts.length === 0;
                  const pendingTotal = pendingInsts.reduce((s, i) => s + i.amount, 0);
                  return (
                    <div style={{ padding: "12px 16px", borderBottom: "1px solid var(--border)" }}>
                      {payError && (
                        <p style={{ fontSize: "11.5px", color: "var(--red)", marginBottom: "8px", lineHeight: "1.4" }}>
                          {payError}
                        </p>
                      )}
                      {payWarning && (
                        <p style={{ fontSize: "11.5px", color: "var(--amber)", marginBottom: "8px", lineHeight: "1.4" }}>
                          {payWarning}
                        </p>
                      )}
                      <button
                        onClick={payInvoice}
                        disabled={allPaid}
                        style={{
                          width: "100%", padding: "11px 16px", borderRadius: "10px",
                          fontSize: "13px", fontWeight: 700, fontFamily: "inherit",
                          cursor: allPaid ? "not-allowed" : "pointer",
                          background: allPaid ? "rgba(255,255,255,0.04)" : "var(--green)",
                          color: allPaid ? "var(--text-3)" : "#000",
                          border: allPaid ? "1px solid var(--border)" : "none",
                          opacity: allPaid ? 0.7 : 1,
                          minHeight: "44px",
                          transition: "opacity 0.15s",
                        }}
                      >
                        {allPaid ? "✓ Fatura já paga" : `Pagar Fatura · R$ ${fmt(pendingTotal)}`}
                      </button>
                    </div>
                  );
                })()}

                {/* Installments */}
                {installmentsThisMonth.length === 0 ? (
                  <div style={{ padding: "32px 16px", textAlign: "center", color: "var(--text-3)", fontSize: "13px" }}>
                    Nenhuma compra nesta fatura.
                  </div>
                ) : (
                  <div>
                    {installmentsThisMonth.map((inst) => {
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
                          }}>
                            {cat?.icon
                              ? cat.icon
                              : <Package size={16} strokeWidth={1.5} color="var(--text-3)" />
                            }
                          </div>

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
                                    color: "var(--red)", fontFamily: "inherit",
                                    display: "flex", alignItems: "center", justifyContent: "center",
                                  }}
                                >
                                  <Trash2 size={12} strokeWidth={1.5} />
                                </button>
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
