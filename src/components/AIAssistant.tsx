"use client";
import { usePathname, useRouter } from "next/navigation";

function SparkleIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 2L13.9 9.1L21 11L13.9 12.9L12 20L10.1 12.9L3 11L10.1 9.1L12 2Z" />
      <circle cx="19" cy="4" r="1.5" opacity="0.5" />
      <circle cx="5" cy="18" r="1" opacity="0.4" />
    </svg>
  );
}

/** Páginas com FAB de ação próprio no canto inferior direito */
function hasStackedPageFab(pathname: string) {
  return pathname === "/" || /^\/cartoes\/(?!nova$)[^/]+$/.test(pathname);
}

export default function AIAssistant() {
  const pathname = usePathname();
  const router = useRouter();

  if (pathname === "/assistente") return null;

  const stacked = hasStackedPageFab(pathname);

  return (
    <button
      onClick={() => {
        const from = pathname === "/assistente" ? "/" : pathname;
        router.push(`/assistente?from=${encodeURIComponent(from)}`);
      }}
      aria-label="Abrir Copiloto Financeiro"
      style={{
        position: "fixed",
        bottom: stacked
          ? pathname === "/"
            ? "calc(var(--fab-bottom) + var(--copilot-fab-size) + var(--fab-stack-gap))"
            : "calc(var(--fab-bottom) + var(--page-fab-h) + var(--fab-stack-gap))"
          : "var(--fab-bottom)",
        right: "var(--fab-right)",
        zIndex: 300,
        width: "var(--copilot-fab-size)",
        height: "var(--copilot-fab-size)",
        borderRadius: "50%",
        background: "var(--accent)",
        border: "none",
        color: "#06100E",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        cursor: "pointer",
        boxShadow: "0 4px 20px rgba(0,229,160,0.45), 0 0 0 1px rgba(0,229,160,0.15)",
        animation: "fabBreath 3s ease-in-out infinite",
        touchAction: "manipulation",
        WebkitTapHighlightColor: "transparent",
      }}
    >
      <SparkleIcon />
    </button>
  );
}
