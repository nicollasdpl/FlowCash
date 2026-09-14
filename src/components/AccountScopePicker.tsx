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
  const chips: { id: AccountScope; label: string; value: number }[] = [
    ...active.map(acc => ({ id: acc.id, label: acc.name, value: balances[acc.id] ?? 0 })),
    ...(active.length > 1 ? [{ id: ALL_ACCOUNTS_SCOPE, label: "Total", value: total }] : []),
  ];

  return (
    <div
      role="tablist"
      aria-label="Conta para o saldo"
      style={{
        display: "flex",
        gap: "4px",
        width: "100%",
      }}
    >
      {chips.map(chip => {
        const selected = scope === chip.id;
        return (
          <button
            key={chip.id}
            type="button"
            role="tab"
            aria-selected={selected}
            onClick={() => onChange(chip.id)}
            style={{
              flex: 1,
              minWidth: 0,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: "1px",
              padding: "5px 6px",
              minHeight: "36px",
              borderRadius: "8px",
              cursor: "pointer",
              fontFamily: "inherit",
              textAlign: "center",
              touchAction: "manipulation",
              background: selected ? "var(--accent-10)" : "rgba(255,255,255,0.04)",
              border: selected ? "1px solid var(--border-accent)" : "1px solid var(--border)",
              color: selected ? "var(--accent)" : "var(--text-2)",
            }}
          >
            <span style={{
              fontSize: "10px",
              fontWeight: 700,
              letterSpacing: "0.01em",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
              maxWidth: "100%",
            }}>
              {chip.label}
            </span>
            <span
              className="mono"
              style={{
                fontSize: "10px",
                fontWeight: 700,
                color: selected ? amountColor(chip.value, "var(--accent)") : amountColor(chip.value, "var(--text-2)"),
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
                maxWidth: "100%",
              }}
            >
              R$ {fmt(chip.value)}
            </span>
          </button>
        );
      })}
    </div>
  );
}
