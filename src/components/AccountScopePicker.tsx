"use client";
import { useEffect, useRef, useState } from "react";
import type { Account } from "@/types/financial";
import { fmt, isBalanceNegative, isBalancePositive } from "@/engine/financialEngine";

export const DASHBOARD_ACCOUNT_SCOPE_KEY = "flowcash.dashboardAccountId";
export const ALL_ACCOUNTS_SCOPE = "all";

export type AccountScope = typeof ALL_ACCOUNTS_SCOPE | string;

function readStoredScope(): AccountScope | null {
  try {
    const saved = localStorage.getItem(DASHBOARD_ACCOUNT_SCOPE_KEY);
    if (saved) return saved;
  } catch {
    /* ignore */
  }
  return null;
}

function writeStoredScope(scope: AccountScope) {
  try {
    localStorage.setItem(DASHBOARD_ACCOUNT_SCOPE_KEY, scope);
  } catch {
    /* ignore */
  }
}

export function useAccountScope(accounts: Account[]): [AccountScope, (scope: AccountScope) => void, boolean] {
  const [scope, setScopeState] = useState<AccountScope>(ALL_ACCOUNTS_SCOPE);
  const [ready, setReady] = useState(false);
  const initialized = useRef(false);
  const activeIds = accounts.filter(a => a.active).map(a => a.id).join(",");

  useEffect(() => {
    const ids = activeIds ? activeIds.split(",") : [];
    if (!initialized.current) {
      if (ids.length === 0) {
        setReady(true);
        return;
      }
      const saved = readStoredScope();
      if (saved === ALL_ACCOUNTS_SCOPE || ids.includes(saved ?? "")) {
        setScopeState(saved!);
      } else {
        setScopeState(ids[0]);
        writeStoredScope(ids[0]);
      }
      initialized.current = true;
      setReady(true);
      return;
    }
    if (scope !== ALL_ACCOUNTS_SCOPE && !ids.includes(scope)) {
      const next = ids[0] ?? ALL_ACCOUNTS_SCOPE;
      setScopeState(next);
      writeStoredScope(next);
    }
  }, [activeIds, scope]);

  function setScope(next: AccountScope) {
    setScopeState(next);
    writeStoredScope(next);
  }

  return [scope, setScope, ready];
}

function amountColor(v: number, positive: string) {
  if (isBalanceNegative(v)) return "var(--red)";
  if (isBalancePositive(v)) return positive;
  return "var(--text-2)";
}

export function AccountScopePicker({
  accounts,
  balances,
  scope,
  onChange,
}: {
  accounts: Account[];
  balances: Record<string, number>;
  scope: AccountScope;
  onChange: (scope: AccountScope) => void;
}) {
  const active = accounts.filter(a => a.active);
  if (active.length === 0) return null;

  const total = active.reduce((s, a) => s + (balances[a.id] ?? 0), 0);
  const showTotalChip = active.length > 1;

  return (
    <div
      role="tablist"
      aria-label="Conta para o saldo"
      style={{
        display: "flex",
        gap: "6px",
        overflowX: "auto",
        paddingBottom: "2px",
        WebkitOverflowScrolling: "touch",
      }}
    >
      {active.map(acc => {
        const selected = scope === acc.id;
        const value = balances[acc.id] ?? 0;
        return (
          <button
            key={acc.id}
            type="button"
            role="tab"
            aria-selected={selected}
            onClick={() => onChange(acc.id)}
            style={{
              flexShrink: 0,
              display: "flex",
              flexDirection: "column",
              alignItems: "flex-start",
              gap: "2px",
              padding: "8px 12px",
              minHeight: "44px",
              borderRadius: "12px",
              cursor: "pointer",
              fontFamily: "inherit",
              textAlign: "left",
              touchAction: "manipulation",
              background: selected ? "var(--accent-10)" : "rgba(255,255,255,0.04)",
              border: selected ? "1px solid var(--border-accent)" : "1px solid var(--border)",
              color: selected ? "var(--accent)" : "var(--text-2)",
            }}
          >
            <span style={{
              fontSize: "11px",
              fontWeight: 700,
              letterSpacing: "0.01em",
              display: "flex",
              alignItems: "center",
              gap: "5px",
            }}>
              <span aria-hidden>{acc.icon}</span>
              {acc.name}
            </span>
            <span
              className="mono"
              style={{
                fontSize: "11px",
                fontWeight: 700,
                color: selected ? amountColor(value, "var(--accent)") : amountColor(value, "var(--text-2)"),
              }}
            >
              R$ {fmt(value)}
            </span>
          </button>
        );
      })}
      {showTotalChip && (
        <button
          type="button"
          role="tab"
          aria-selected={scope === ALL_ACCOUNTS_SCOPE}
          onClick={() => onChange(ALL_ACCOUNTS_SCOPE)}
          style={{
            flexShrink: 0,
            display: "flex",
            flexDirection: "column",
            alignItems: "flex-start",
            gap: "2px",
            padding: "8px 12px",
            minHeight: "44px",
            borderRadius: "12px",
            cursor: "pointer",
            fontFamily: "inherit",
            textAlign: "left",
            touchAction: "manipulation",
            background: scope === ALL_ACCOUNTS_SCOPE ? "var(--accent-10)" : "rgba(255,255,255,0.04)",
            border: scope === ALL_ACCOUNTS_SCOPE ? "1px solid var(--border-accent)" : "1px solid var(--border)",
            color: scope === ALL_ACCOUNTS_SCOPE ? "var(--accent)" : "var(--text-2)",
          }}
        >
          <span style={{ fontSize: "11px", fontWeight: 700 }}>Total</span>
          <span
            className="mono"
            style={{
              fontSize: "11px",
              fontWeight: 700,
              color: scope === ALL_ACCOUNTS_SCOPE
                ? amountColor(total, "var(--accent)")
                : amountColor(total, "var(--text-2)"),
            }}
          >
            R$ {fmt(total)}
          </span>
        </button>
      )}
    </div>
  );
}
