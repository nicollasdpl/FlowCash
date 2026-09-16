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
    <nav className="bottom-nav" aria-label="Navegação principal">
      <div className="bottom-nav-pill">
        {NAV.map(({ href, label, Icon }) => {
          const active =
            href === "/"
              ? pathname === "/"
              : pathname === href || pathname.startsWith(`${href}/`);

          return (
            <Link
              key={href}
              href={href}
              className={`bottom-nav-item${active ? " active" : ""}`}
              aria-label={label}
              aria-current={active ? "page" : undefined}
            >
              <span className="bottom-nav-icon">
                <Icon size={22} strokeWidth={active ? 2.1 : 1.6} aria-hidden />
              </span>
              <span className="bottom-nav-label">{label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
