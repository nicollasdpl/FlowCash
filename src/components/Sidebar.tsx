"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  ArrowUpDown,
  Landmark,
  PiggyBank,
  CreditCard,
  BarChart3,
  Settings,
  LogOut,
} from "lucide-react";
import { useApp } from "@/context/AppContext";

const navItems = [
  { href: "/", label: "Dashboard", Icon: LayoutDashboard },
  { href: "/transacoes", label: "Transações", Icon: ArrowUpDown },
  { href: "/contas", label: "Contas", Icon: Landmark },
  { href: "/investimentos", label: "Investimentos", Icon: PiggyBank },
  { href: "/cartoes", label: "Cartões", Icon: CreditCard },
  { href: "/relatorios", label: "Relatórios", Icon: BarChart3 },
];

export default function Sidebar() {
  const pathname = usePathname();
  const { user, signOut, state } = useApp();
  const settingsActive =
    pathname === "/configuracoes" || pathname.startsWith("/configuracoes/");

  return (
    <aside className="app-sidebar">
      <div className="app-sidebar-brand">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/icon-192.png"
          alt="FlowCash"
          width={36}
          height={36}
          className="app-sidebar-logo"
        />
        <div>
          <div className="app-sidebar-title">FlowCash</div>
          <div className="app-sidebar-subtitle">Finanças Pessoais</div>
        </div>
      </div>

      <nav className="app-sidebar-nav" aria-label="Menu principal">
        <div className="app-sidebar-section">Menu</div>
        {navItems.map(({ href, label, Icon }) => {
          const active =
            href === "/"
              ? pathname === "/"
              : pathname === href || pathname.startsWith(`${href}/`);
          return (
            <Link
              key={href}
              href={href}
              className={`nav-link${active ? " active" : ""}`}
            >
              <Icon size={18} strokeWidth={active ? 2.1 : 1.75} aria-hidden />
              {label}
            </Link>
          );
        })}
      </nav>

      <div className="app-sidebar-footer">
        <Link
          href="/configuracoes"
          className={`nav-link${settingsActive ? " active" : ""}`}
        >
          <Settings size={18} strokeWidth={settingsActive ? 2.1 : 1.75} aria-hidden />
          Configurações
        </Link>

        <div className="app-sidebar-user">
          {user?.photoURL ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={user.photoURL}
              alt=""
              width={30}
              height={30}
              className="app-sidebar-avatar"
            />
          ) : (
            <div className="app-sidebar-avatar-fallback">
              {(state.userName || user?.displayName || "?")[0].toUpperCase()}
            </div>
          )}
          <div className="app-sidebar-user-meta">
            <div className="app-sidebar-user-name">
              {state.userName || user?.displayName || "Usuário"}
            </div>
            <div className="app-sidebar-user-email">{user?.email ?? ""}</div>
          </div>
          <button
            type="button"
            onClick={signOut}
            title="Sair"
            className="app-sidebar-signout"
          >
            <LogOut size={16} strokeWidth={2} aria-hidden />
          </button>
        </div>
      </div>
    </aside>
  );
}
