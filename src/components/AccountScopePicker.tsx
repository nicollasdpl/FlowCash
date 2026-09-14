"use client";
import { useEffect, useRef, useState } from "react";
import type { Account } from "@/types/financial";

export const DASHBOARD_ACCOUNT_IDS_KEY = "flowcash.dashboardAccountIds";

function readStoredIds(): string[] | null {
  try {
    const raw = localStorage.getItem(DASHBOARD_ACCOUNT_IDS_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed) && parsed.every(id => typeof id === "string")) return parsed;
  } catch {
    /* ignore */
  }
  return null;
}

function writeStoredIds(ids: string[]) {
  try {
    localStorage.setItem(DASHBOARD_ACCOUNT_IDS_KEY, JSON.stringify(ids));
  } catch {
    /* ignore */
  }
}

export function useSelectedAccountIds(accounts: Account[]): [string[], (id: string) => void] {
  const activeIds = accounts.filter(a => a.active).map(a => a.id);
  const activeKey = activeIds.join(",");
  const [selected, setSelected] = useState<string[]>([]);
  const initialized = useRef(false);

  useEffect(() => {
    const ids = activeKey ? activeKey.split(",") : [];
    if (ids.length === 0) {
      setSelected([]);
      return;
    }
    if (!initialized.current) {
      const saved = readStoredIds();
      const next = saved?.filter(id => ids.includes(id)) ?? [];
      setSelected(next.length > 0 ? next : ids);
      initialized.current = true;
      return;
    }
    setSelected(prev => {
      const kept = prev.filter(id => ids.includes(id));
      return kept.length > 0 ? kept : ids;
    });
  }, [activeKey]);

  function toggle(id: string) {
    setSelected(prev => {
      const on = prev.includes(id);
      const next = on ? prev.filter(x => x !== id) : [...prev, id];
      const valid = next.length > 0 ? next : prev;
      writeStoredIds(valid);
      return valid;
    });
  }

  return [selected, toggle];
}

export function AccountScopePicker({
  accounts,
  selectedIds,
  onToggle,
}: {
  accounts: Account[];
  selectedIds: string[];
  onToggle: (id: string) => void;
}) {
  const active = accounts.filter(a => a.active);
  if (active.length < 2) return null;

  return (
    <div
      role="group"
      aria-label="Contas no saldo"
      style={{
        display: "flex",
        gap: "4px",
        width: "100%",
      }}
    >
      {active.map(acc => {
        const selected = selectedIds.includes(acc.id);
        return (
          <button
            key={acc.id}
            type="button"
            aria-pressed={selected}
            onClick={() => onToggle(acc.id)}
            style={{
              flex: 1,
              minWidth: 0,
              padding: "6px 8px",
              minHeight: "32px",
              borderRadius: "8px",
              cursor: "pointer",
              fontFamily: "inherit",
              fontSize: "11px",
              fontWeight: 700,
              textAlign: "center",
              touchAction: "manipulation",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
              background: selected ? "var(--accent-10)" : "rgba(255,255,255,0.04)",
              border: selected ? "1px solid var(--border-accent)" : "1px solid var(--border)",
              color: selected ? "var(--accent)" : "var(--text-3)",
            }}
          >
            {acc.name}
          </button>
        );
      })}
    </div>
  );
}
