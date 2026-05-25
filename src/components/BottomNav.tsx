"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

function IconGrid() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="7" height="7" rx="1.5" />
      <rect x="14" y="3" width="7" height="7" rx="1.5" />
      <rect x="3" y="14" width="7" height="7" rx="1.5" />
      <rect x="14" y="14" width="7" height="7" rx="1.5" />
    </svg>
  );
}
function IconArrows() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M7 17V7M7 7L4 10M7 7L10 10" />
      <path d="M17 7V17M17 17L14 14M17 17L20 14" />
    </svg>
  );
}
function IconCard() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="5" width="20" height="14" rx="2.5" />
      <line x1="2" y1="10" x2="22" y2="10" />
      <line x1="6" y1="15" x2="9" y2="15" />
    </svg>
  );
}
function IconTarget() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <circle cx="12" cy="12" r="6" />
      <circle cx="12" cy="12" r="2" fill="currentColor" stroke="none" />
    </svg>
  );
}
function IconBank() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="11" width="18" height="10" rx="1.5" />
      <path d="M12 3L3 9h18L12 3z" />
      <line x1="8" y1="14" x2="8" y2="18" />
      <line x1="12" y1="14" x2="12" y2="18" />
      <line x1="16" y1="14" x2="16" y2="18" />
    </svg>
  );
}

const NAV = [
  { href: "/", label: "Início", icon: <IconGrid /> },
  { href: "/transacoes", label: "Transações", icon: <IconArrows /> },
  { href: "/contas", label: "Contas", icon: <IconBank /> },
  { href: "/cartoes", label: "Cartões", icon: <IconCard /> },
  { href: "/metas", label: "Metas", icon: <IconTarget /> },
];

export default function BottomNav() {
  const pathname = usePathname();
  return (
    <nav className="bottom-nav">
      {NAV.map(item => (
        <Link
          key={item.href}
          href={item.href}
          className={`bottom-nav-item${pathname === item.href ? " active" : ""}`}
        >
          {item.icon}
          {item.label}
        </Link>
      ))}
    </nav>
  );
}
