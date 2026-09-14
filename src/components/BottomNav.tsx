"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, ArrowUpDown, CreditCard, PiggyBank, Settings } from "lucide-react";

const NAV = [
  { href: "/", label: "Início", Icon: Home },
  { href: "/transacoes", label: "Transações", Icon: ArrowUpDown },
  { href: "/cartoes", label: "Cartões", Icon: CreditCard },
  { href: "/investimentos", label: "Investir", Icon: PiggyBank },
  { href: "/configuracoes", label: "Config", Icon: Settings },
];

const FORM_ROUTES = ["/nova", "/editar", "/nova-compra", "/assistente", "/depositar", "/guardar", "/resgatar", "/configuracoes/categorias/"];

export default function BottomNav() {
  const pathname = usePathname();

  if (FORM_ROUTES.some(r => pathname.includes(r))) return null;

  return (
    <nav className="bottom-nav">
      {NAV.map(({ href, label, Icon }) => (
        <Link
          key={href}
          href={href}
          className={`bottom-nav-item${
            href === "/"
              ? pathname === "/" ? " active" : ""
              : pathname === href || pathname.startsWith(`${href}/`) ? " active" : ""
          }`}
        >
          <Icon size={22} strokeWidth={1.5} />
          <span>{label}</span>
        </Link>
      ))}
    </nav>
  );
}
