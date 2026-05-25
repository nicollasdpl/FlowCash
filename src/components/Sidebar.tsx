"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

function IconGrid() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="7" height="7" rx="1.5" />
      <rect x="14" y="3" width="7" height="7" rx="1.5" />
      <rect x="3" y="14" width="7" height="7" rx="1.5" />
      <rect x="14" y="14" width="7" height="7" rx="1.5" />
    </svg>
  );
}

function IconArrows() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M7 17V7M7 7L4 10M7 7L10 10" />
      <path d="M17 7V17M17 17L14 14M17 17L20 14" />
    </svg>
  );
}

function IconCard() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="5" width="20" height="14" rx="2.5" />
      <line x1="2" y1="10" x2="22" y2="10" />
      <line x1="6" y1="15" x2="9" y2="15" />
    </svg>
  );
}

function IconTarget() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <circle cx="12" cy="12" r="6" />
      <circle cx="12" cy="12" r="2" fill="currentColor" stroke="none" />
    </svg>
  );
}

function IconChart() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="18" y1="20" x2="18" y2="10" />
      <line x1="12" y1="20" x2="12" y2="4" />
      <line x1="6" y1="20" x2="6" y2="14" />
      <line x1="2" y1="20" x2="22" y2="20" />
    </svg>
  );
}

function IconSettings() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  );
}

function IconBank() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="11" width="18" height="10" rx="1.5" />
      <path d="M12 3L3 9h18L12 3z" />
      <line x1="8" y1="14" x2="8" y2="18" />
      <line x1="12" y1="14" x2="12" y2="18" />
      <line x1="16" y1="14" x2="16" y2="18" />
    </svg>
  );
}

const navItems = [
  { href: "/", label: "Dashboard", icon: <IconGrid /> },
  { href: "/transacoes", label: "Transações", icon: <IconArrows /> },
  { href: "/contas", label: "Contas", icon: <IconBank /> },
  { href: "/cartoes", label: "Cartões", icon: <IconCard /> },
  { href: "/metas", label: "Metas", icon: <IconTarget /> },
  { href: "/relatorios", label: "Relatórios", icon: <IconChart /> },
];

export default function Sidebar() {
  const pathname = usePathname();

  return (
    <aside
      style={{
        width: "236px",
        minWidth: "236px",
        background: "var(--bg-sidebar)",
        borderRight: "1px solid var(--border)",
        display: "flex",
        flexDirection: "column",
        height: "100vh",
        overflow: "hidden",
      }}
    >
      {/* Logo */}
      <div
        style={{
          padding: "24px 20px 20px",
          display: "flex",
          alignItems: "center",
          gap: "12px",
          borderBottom: "1px solid var(--border)",
        }}
      >
        <div
          style={{
            background: "var(--accent)",
            borderRadius: "10px",
            width: "36px",
            height: "36px",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
            boxShadow: "0 0 20px rgba(0, 229, 195, 0.3)",
          }}
        >
          <span
            className="mono"
            style={{
              color: "#060C16",
              fontWeight: 700,
              fontSize: "13px",
              letterSpacing: "-0.02em",
            }}
          >
            FC
          </span>
        </div>
        <div>
          <div
            style={{
              color: "var(--text-1)",
              fontWeight: 700,
              fontSize: "15px",
              letterSpacing: "-0.02em",
              lineHeight: 1.2,
            }}
          >
            FlowCash
          </div>
          <div
            style={{
              color: "var(--text-3)",
              fontSize: "10.5px",
              fontWeight: 500,
              letterSpacing: "0.04em",
              textTransform: "uppercase",
              marginTop: "1px",
            }}
          >
            Finanças Pessoais
          </div>
        </div>
      </div>

      {/* Navigation */}
      <nav style={{ padding: "12px 12px", flex: 1 }}>
        <div
          style={{
            fontSize: "10px",
            fontWeight: 700,
            letterSpacing: "0.08em",
            color: "var(--text-3)",
            textTransform: "uppercase",
            padding: "8px 12px 6px",
          }}
        >
          Menu
        </div>
        {navItems.map((item) => {
          const active = pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`nav-link${active ? " active" : ""}`}
            >
              {item.icon}
              {item.label}
            </Link>
          );
        })}
      </nav>

      {/* Bottom */}
      <div style={{ padding: "12px", borderTop: "1px solid var(--border)" }}>
        <Link href="/configuracoes" className="nav-link">
          <IconSettings />
          Configurações
        </Link>

        {/* User */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "10px",
            padding: "10px 12px",
            marginTop: "4px",
            borderRadius: "10px",
            background: "rgba(255,255,255,0.03)",
          }}
        >
          <div
            style={{
              width: "30px",
              height: "30px",
              borderRadius: "50%",
              background: "linear-gradient(135deg, var(--accent) 0%, #0096FF 100%)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: "12px",
              fontWeight: 700,
              color: "#060C16",
              flexShrink: 0,
            }}
          >
            N
          </div>
          <div>
            <div
              style={{
                fontSize: "12.5px",
                fontWeight: 600,
                color: "var(--text-1)",
                lineHeight: 1.2,
              }}
            >
              Nicollas
            </div>
            <div style={{ fontSize: "10.5px", color: "var(--text-3)" }}>
              Conta pessoal
            </div>
          </div>
        </div>
      </div>
    </aside>
  );
}
