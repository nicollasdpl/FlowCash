"use client";
import { useState, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";

export function SectionCard({ id, title, icon, right, hint, children }: {
  id?: string;
  title: string;
  icon?: ReactNode;
  right?: ReactNode;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <section id={id} className="soft-card" style={{ padding: "14px", marginBottom: "12px", scrollMarginTop: "12px", minWidth: 0 }}>
      <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: hint ? "4px" : "12px" }}>
        {icon}
        <p className="section-heading" style={{ marginBottom: 0, flex: 1, minWidth: 0 }}>{title}</p>
        {right}
      </div>
      {hint && (
        <p style={{ fontSize: "11px", color: "var(--text-3)", lineHeight: 1.4, marginBottom: "12px" }}>{hint}</p>
      )}
      {children}
    </section>
  );
}

export default function CollapsibleCard({ id, title, subtitle, icon, defaultOpen = false, children }: {
  id?: string;
  title: string;
  subtitle?: string;
  icon?: ReactNode;
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <section id={id} className="soft-card" style={{ marginBottom: "12px", overflow: "hidden", scrollMarginTop: "12px", minWidth: 0 }}>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        aria-expanded={open}
        style={{
          width: "100%", display: "flex", alignItems: "center", gap: "8px",
          padding: "14px", background: "transparent", border: "none",
          cursor: "pointer", fontFamily: "inherit", textAlign: "left",
          touchAction: "manipulation", minHeight: "48px",
        }}
      >
        {icon}
        <span style={{ flex: 1, minWidth: 0 }}>
          <span style={{ display: "block", fontSize: "13px", fontWeight: 600, color: "var(--text-2)" }}>{title}</span>
          {subtitle && (
            <span style={{
              display: "block", fontSize: "11px", color: "var(--text-3)", marginTop: "2px",
              overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
            }}>
              {subtitle}
            </span>
          )}
        </span>
        <ChevronDown
          size={16}
          strokeWidth={1.5}
          color="var(--text-3)"
          style={{ transform: open ? "rotate(180deg)" : "none", transition: "transform 0.2s", flexShrink: 0 }}
        />
      </button>
      {open && <div style={{ borderTop: "1px solid var(--border)" }}>{children}</div>}
    </section>
  );
}
