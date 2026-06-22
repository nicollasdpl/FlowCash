"use client";
import { useState, useMemo, useEffect } from "react";
import { useRouter, useParams } from "next/navigation";
import { useApp, newId } from "@/context/AppContext";
import type { CardInstallment } from "@/context/AppContext";
import { SEED_INVOICE_PAYMENT_CATEGORY_ID } from "@/types/financial";
import {
  getCardLimitSummary, getCurrentBalance, currentMonth, addMonths, today,
} from "@/engine/financialEngine";
import {
  getCardInvoices, getInstallmentsByMonth, getInvoiceDates, getDefaultInvoiceMonth,
} from "@/engine/invoiceEngine";
import { Pencil, Package, Plus, Trash2 } from "lucide-react";
import CategoryIcon from "@/components/CategoryIcon";

function fmt(v: number) {
  return v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatDate(d: string) {
  if (!d) return "—";
  const [y, m, day] = d.split("-");
  return `${day}/${m}/${y}`;
}

const MONTHS_LONG  = ["Janeiro","Fevereiro","Março","Abril","Maio","Junho","Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"];
const MONTHS_SHORT = ["Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"];

// Labels are derived from dueDate month, not competenceMonth
function invoiceLabel(dueDate: string) {
  const [y, m] = dueDate.split("-").map(Number);
  return `Fatura ${MONTHS_LONG[m - 1]} ${y}`;
}

function monthTabLabel(dueDate: string) {
  const [y, m] = dueDate.split("-").map(Number);
  return `${MONTHS_SHORT[m - 1]}/${String(y).slice(2)}`;
}

export default function CartaoDetail() {
  const { cardId } = useParams<{ cardId: string }>();
  const router = useRouter();
  const { state, dispatch } = useApp();

  const card = state.cards.find(c => c.id === cardId);

  const [selectedMonth, setSelectedMonth] = useState(currentMonth());
  const [payError, setPayError] = useState("");
  const [payWarning, setPayWarning] = useState("");

  // Ao abrir o cartão, foca na fatura em aberto (não no mês do calendário).
  useEffect(() => {
    if (!card) return;
    setSelectedMonth(getDefaultInvoiceMonth(card, state.installments));
  }, [cardId]); // eslint-disable-line react-hooks/exhaustive-deps -- só ao trocar de cartão

  const months = useMemo(() => {
    return Array.from({ length: 5 }, (_, i) => addMonths(selectedMonth, i - 2));
  }, [selectedMonth]);

  const invoices = useMemo(() => {
    if (!card) return [];
    return getCardInvoices(card, state.installments, 3);
  }, [card, state.installments]);

  const currentInvoice = useMemo(() => {
    return invoices.find(inv => inv.competenceMonth === selectedMonth) ?? null;
  }, [invoices, selectedMonth]);

  const installmentsThisMonth = useMemo(() => {
    if (!card) return [];
    return getInstallmentsByMonth(state.installments, card.id, selectedMonth);
  }, [card, state.installments, selectedMonth]);

  const limitSummary = useMemo(() => {
    if (!card) return null;
    return getCardLimitSummary(card, state.installments, state.purchases);
  }, [card, state.installments, state.purchases]);

  function payInstallment(inst: CardInstallment) {
    dispatch({
      type: "PAY_INSTALLMENT",
      payload: { installmentId: inst.id, paidAt: today() },
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
    if (!card) return;
    setPayError("");
    setPayWarning("");

    if (!card.paymentAccountId) {
      setPayError("Vincule uma conta a este cartão antes de pagar a fatura.");
      return;
    }

    const pendingInsts = installmentsThisMonth.filter(i => !i.paid);
    if (pendingInsts.length === 0) return;

    const total = pendingInsts.reduce((s, i) => s + i.amount, 0);

    const paymentAccount = state.accounts.find(a => a.id === card.paymentAccountId);
    if (paymentAccount) {
      const balance = getCurrentBalance(paymentAccount, state.transactions);
      if (balance < total) {
        setPayWarning(`Saldo insuficiente (R$ ${fmt(balance)}). A conta ficará negativa após o pagamento.`);
      }
    }

    const todayDate = today();
    const { dueDate: noteDueDate } = getInvoiceDates(selectedMonth, card.closingDay, card.dueDay);
    const invoiceNote = `Fatura ${card.name} ${monthTabLabel(noteDueDate)}`;

    // Marca todas as parcelas da fatura como pagas. O vínculo de cada parcela
    // com sua compra permanece — o histórico por categoria é preservado.
    pendingInsts.forEach(inst => {
      dispatch({
        type: "PAY_INSTALLMENT",
        payload: { installmentId: inst.id, paidAt: todayDate },
      });
    });

    // Cria UMA única transação representando a liquidação da fatura.
    // Usa a categoria de sistema "Pagamento de Fatura": ela NÃO conta como
    // gasto por categoria (budgetEngine a ignora), evitando a dupla contagem
    // com as parcelas — que já contam pelas categorias das compras.
    dispatch({
      type: "ADD_TX",
      payload: {
        id: newId(),
        accountId: card.paymentAccountId,
        type: "expense",
        amount: total,
        description: `Pagamento Fatura ${card.name} ${monthTabLabel(noteDueDate)}`,
        categoryId: SEED_INVOICE_PAYMENT_CATEGORY_ID,
        competenceDate: todayDate,
        paymentDate: todayDate,
        status: "paid",
        isRecurring: false,
        origin: "invoice",
        notes: invoiceNote,
        createdAt: new Date().toISOString(),
      },
    });

    const paidIds = new Set(pendingInsts.map(i => i.id));
    const nextInstallments = state.installments.map(i =>
      paidIds.has(i.id) ? { ...i, paid: true, paidAt: todayDate } : i,
    );
    setSelectedMonth(getDefaultInvoiceMonth(card, nextInstallments));
  }

  if (!card) {
    return (
      <div style={{ padding: "60px 24px", textAlign: "center" }}>
        <p style={{ color: "var(--text-3)", fontSize: "14px", marginBottom: "16px" }}>
          Cartão não encontrado.
        </p>
        <button
          onClick={() => router.push("/cartoes")}
          style={{
            background: "none", border: "none", color: "var(--accent)",
            cursor: "pointer", fontSize: "14px", fontFamily: "inherit",
          }}
        >
          ← Voltar para cartões
        </button>
      </div>
    );
  }

  const pendingInsts = installmentsThisMonth.filter(i => !i.paid);
  const allPaid = pendingInsts.length === 0 && installmentsThisMonth.length > 0;
  const pendingTotal = pendingInsts.reduce((s, i) => s + i.amount, 0);

  return (
    <>
      {/* ── Sticky header ── */}
      <div style={{
        position: "sticky", top: 0, zIndex: 10,
        background: "var(--bg)", borderBottom: "1px solid var(--border)",
        display: "flex", alignItems: "center", gap: "4px",
        padding: "0 8px 0 4px", height: "60px", flexShrink: 0,
      }}>
        <button
          onClick={() => router.push("/cartoes")}
          style={{
            background: "none", border: "none", color: "var(--text-2)",
            cursor: "pointer", fontSize: "24px",
            width: "48px", height: "48px", borderRadius: "12px",
            display: "flex", alignItems: "center", justifyContent: "center",
            flexShrink: 0, touchAction: "manipulation",
            WebkitTapHighlightColor: "transparent",
          }}
        >‹</button>
        <div style={{ flex: 1, minWidth: 0, display: "flex", alignItems: "center", justifyContent: "space-between", paddingRight: "4px" }}>
          <div style={{ minWidth: 0 }}>
            <p style={{
              fontSize: "17px", fontWeight: 700, color: "var(--text-1)",
              overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
            }}>
              {card.name}
            </p>
            <p style={{ fontSize: "11px", color: "var(--text-3)" }}>
              {card.brand} •••• {card.lastDigits}
            </p>
          </div>
          <button
            onClick={() => router.push(`/cartoes/${card.id}/editar`)}
            style={{
              background: "none", border: "none", cursor: "pointer",
              color: "var(--text-3)", padding: "10px",
              display: "flex", alignItems: "center", justifyContent: "center",
              borderRadius: "10px", touchAction: "manipulation",
              WebkitTapHighlightColor: "transparent", flexShrink: 0,
            }}
          >
            <Pencil size={16} strokeWidth={1.5} />
          </button>
        </div>
      </div>

      {/* ── Content ── */}
      <div style={{
        padding: "16px 16px calc(var(--fab-bottom) + var(--page-fab-h) + var(--fab-stack-gap) + var(--copilot-fab-size) + 16px)",
      }}>

        {/* ── Resumo do limite ── */}
        {limitSummary && (
          <div className="card fade-up-1" style={{ padding: "16px", marginBottom: "16px" }}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "8px", marginBottom: "12px" }}>
              <div>
                <p style={{ fontSize: "10px", color: "var(--text-3)", marginBottom: "3px" }}>Disponível</p>
                <p className="mono" style={{ fontSize: "14px", fontWeight: 700, color: "var(--green)" }}>
                  R$ {fmt(limitSummary.availableLimit)}
                </p>
              </div>
              <div style={{ textAlign: "center" }}>
                <p style={{ fontSize: "10px", color: "var(--text-3)", marginBottom: "3px" }}>Usado</p>
                <p className="mono" style={{ fontSize: "14px", fontWeight: 700, color: "var(--red)" }}>
                  R$ {fmt(limitSummary.usedLimit)}
                </p>
              </div>
              <div style={{ textAlign: "right" }}>
                <p style={{ fontSize: "10px", color: "var(--text-3)", marginBottom: "3px" }}>Limite total</p>
                <p className="mono" style={{ fontSize: "14px", fontWeight: 700, color: "var(--text-2)" }}>
                  R$ {fmt(limitSummary.totalLimit)}
                </p>
              </div>
            </div>
            <div style={{ height: "5px", background: "rgba(255,255,255,0.06)", borderRadius: "3px", overflow: "hidden" }}>
              <div style={{
                height: "100%",
                width: `${Math.min((limitSummary.usedLimit / limitSummary.totalLimit) * 100, 100)}%`,
                background: limitSummary.usedLimit / limitSummary.totalLimit > 0.8 ? "var(--red)" : card.color,
                borderRadius: "3px", transition: "width 0.3s",
              }} />
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", marginTop: "8px" }}>
              <span style={{ fontSize: "10px", color: "var(--text-3)" }}>
                Fecha dia <strong style={{ color: "var(--text-2)" }}>{card.closingDay}</strong>
              </span>
              <span style={{ fontSize: "10px", color: "var(--text-3)" }}>
                Vence dia <strong style={{ color: "var(--text-2)" }}>{card.dueDay}</strong>
              </span>
            </div>
          </div>
        )}

        {/* ── Seletor de mês ── */}
        <div className="fade-up-2" style={{ marginBottom: "14px" }}>
          <div style={{
            display: "flex", gap: "6px",
            overflowX: "auto", paddingBottom: "2px",
            WebkitOverflowScrolling: "touch", scrollbarWidth: "none",
            touchAction: "pan-x",
          }}>
            {months.map(m => {
              const { dueDate } = getInvoiceDates(m, card.closingDay, card.dueDay);
              return (
                <button
                  key={m}
                  className={`filter-btn${selectedMonth === m ? " active" : ""}`}
                  onClick={() => setSelectedMonth(m)}
                  style={{ fontSize: "11.5px", padding: "7px 12px", flexShrink: 0 }}
                >
                  {monthTabLabel(dueDate)}
                </button>
              );
            })}
          </div>
        </div>

        {/* ── Card de fatura ── */}
        <div className="card fade-up-3" style={{ overflow: "hidden" }}>

          {/* Header da fatura */}
          <div style={{
            padding: "14px 16px", borderBottom: "1px solid var(--border)",
            display: "flex", justifyContent: "space-between", alignItems: "center",
            flexWrap: "wrap", gap: "8px",
          }}>
            <div>
              <p style={{ fontSize: "13px", fontWeight: 700, color: "var(--text-1)" }}>
                {currentInvoice ? invoiceLabel(currentInvoice.dueDate) : invoiceLabel(getInvoiceDates(selectedMonth, card.closingDay, card.dueDay).dueDate)}
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
                  ...({
                    paid:    { background: "var(--green-10)",        color: "var(--green)", border: "1px solid var(--green-20)"        },
                    closed:  { background: "rgba(255,140,66,0.10)",  color: "#FF8C42",      border: "1px solid rgba(255,140,66,0.30)" },
                    overdue: { background: "var(--red-10)",          color: "var(--red)",   border: "1px solid var(--red-20)"         },
                    open:    { background: "var(--amber-10)",        color: "var(--amber)", border: "1px solid var(--amber-20)"       },
                  }[currentInvoice.status]),
                }}>
                  {{ paid: "Paga", closed: "Fechada", overdue: "Vencida", open: "Em aberto" }[currentInvoice.status]}
                </span>
              )}
              <p className="mono" style={{ fontSize: "20px", fontWeight: 700, color: "var(--text-1)", letterSpacing: "-0.02em" }}>
                R$ {fmt(currentInvoice?.totalAmount ?? 0)}
              </p>
            </div>
          </div>

          {/* Botão Pagar Fatura */}
          {installmentsThisMonth.length > 0 && (
            <div style={{ padding: "12px 16px", borderBottom: "1px solid var(--border)" }}>
              {payError && (
                <p style={{ fontSize: "11.5px", color: "var(--red)", marginBottom: "8px", lineHeight: 1.4 }}>
                  {payError}
                </p>
              )}
              {payWarning && (
                <p style={{ fontSize: "11.5px", color: "var(--amber)", marginBottom: "8px", lineHeight: 1.4 }}>
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
                  minHeight: "44px", transition: "opacity 0.15s",
                }}
              >
                {allPaid ? "✓ Fatura já paga" : `Pagar Fatura · R$ ${fmt(pendingTotal)}`}
              </button>
            </div>
          )}

          {/* Lista de parcelas */}
          {installmentsThisMonth.length === 0 ? (
            <div style={{ padding: "32px 16px", textAlign: "center", color: "var(--text-3)", fontSize: "13px" }}>
              Nenhuma compra nesta fatura.
            </div>
          ) : (
            <div>
              {installmentsThisMonth.map(inst => {
                const purchase = state.purchases.find(p => p.id === inst.purchaseId);
                const cat = state.categories.find(c => c.id === purchase?.categoryId);
                return (
                  <div
                    key={inst.id}
                    style={{
                      display: "flex", alignItems: "center", gap: "12px",
                      padding: "13px 16px", borderTop: "1px solid var(--border)",
                      opacity: inst.paid ? 0.55 : 1,
                    }}
                  >
                    {/* Ícone categoria */}
                    <div style={{
                      width: "38px", height: "38px", borderRadius: "10px", flexShrink: 0,
                      background: cat ? `${cat.color}18` : "rgba(255,255,255,0.06)",
                      display: "flex", alignItems: "center", justifyContent: "center", fontSize: "16px",
                    }}>
                      {cat?.icon
                        ? <CategoryIcon icon={cat.icon} color={cat.color} size={16} />
                        : <Package size={16} strokeWidth={1.5} color="var(--text-3)" />}
                    </div>

                    {/* Descrição */}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{
                        fontSize: "13px", fontWeight: 600, color: "var(--text-1)",
                        overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                        textDecoration: inst.paid ? "line-through" : "none",
                      }}>
                        {purchase?.description ?? "—"}
                      </p>
                      <p style={{ fontSize: "10.5px", color: "var(--text-3)", marginTop: "2px", display: "flex", alignItems: "center", gap: "5px" }}>
                        {cat?.name ?? "—"} ·{" "}
                        {purchase?.isSubscription ? (
                          <span style={{
                            fontSize: "9px", fontWeight: 700, padding: "1px 5px", borderRadius: "4px",
                            background: "rgba(155,109,255,0.15)", color: "#9B6DFF",
                            border: "1px solid rgba(155,109,255,0.25)", letterSpacing: "0.05em",
                          }}>ASSINATURA</span>
                        ) : `${inst.installmentNumber}/${inst.totalInstallments}x`}
                      </p>
                    </div>

                    {/* Valor + ações */}
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
                        >
                          {inst.paid ? "✓ Pago" : "Pagar"}
                        </button>
                        {purchase && (
                          <>
                            <button
                              onClick={() => router.push(`/cartoes/${card.id}/compras/${purchase.id}/editar`)}
                              style={{
                                width: "30px", height: "30px", borderRadius: "7px", cursor: "pointer",
                                background: "var(--bg-elevated)", border: "1px solid var(--border)",
                                color: "var(--text-3)", fontFamily: "inherit",
                                display: "flex", alignItems: "center", justifyContent: "center",
                              }}
                            >
                              <Pencil size={12} strokeWidth={1.5} />
                            </button>
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
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* ── FAB Nova Compra ── */}
      <button
        onClick={() => router.push(`/cartoes/${card.id}/nova-compra`)}
        style={{
          position: "fixed",
          bottom: "var(--fab-bottom)",
          right: "var(--fab-right)",
          zIndex: 50,
          height: "48px",
          padding: "0 20px",
          borderRadius: "24px",
          background: card.color,
          color: "#fff",
          border: "none",
          cursor: "pointer",
          fontFamily: "inherit",
          fontSize: "14px",
          fontWeight: 700,
          display: "flex",
          alignItems: "center",
          gap: "7px",
          boxShadow: `0 4px 16px ${card.color}66`,
          touchAction: "manipulation",
          WebkitTapHighlightColor: "transparent",
        }}
      >
        <Plus size={17} strokeWidth={2.5} />
        Nova Compra
      </button>
    </>
  );
}
