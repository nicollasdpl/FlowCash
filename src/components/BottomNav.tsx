"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, ArrowUpDown, CreditCard, Target, Settings } from "lucide-react";

const NAV = [
  { href: "/", label: "Início", Icon: Home },
  { href: "/transacoes", label: "Transações", Icon: ArrowUpDown },
  { href: "/cartoes", label: "Cartões", Icon: CreditCard },
  { href: "/metas", label: "Metas", Icon: Target },
  { href: "/configuracoes", label: "Config", Icon: Settings },
];

const FORM_ROUTES = ["/nova", "/editar", "/nova-compra", "/assistente", "/depositar", "/cartoes/"];

export default function BottomNav() {
  const pathname = usePathname();

  if (FORM_ROUTES.some(r => pathname.includes(r))) return null;

  return (
    <nav className="bottom-nav">
      {NAV.map(({ href, label, Icon }) => (
        <Link
          key={href}
          href={href}
          className={`bottom-nav-item${pathname === href ? " active" : ""}`}
        >
          <Icon size={22} strokeWidth={1.5} />
          <span>{label}</span>
        </Link>
      ))}
    </nav>
  );
}
