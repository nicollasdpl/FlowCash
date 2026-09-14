"use client";
import { usePathname, useRouter } from "next/navigation";

function SparkleIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M12 2L13.9 9.1L21 11L13.9 12.9L12 20L10.1 12.9L3 11L10.1 9.1L12 2Z" />
      <circle cx="19" cy="4" r="1.5" opacity="0.5" />
      <circle cx="5" cy="18" r="1" opacity="0.4" />
    </svg>
  );
}

type CopilotFabProps = {
  from?: string;
};

export function CopilotFab({ from }: CopilotFabProps) {
  const pathname = usePathname();
  const router = useRouter();
  const fromPath = from ?? (pathname === "/assistente" ? "/" : pathname);

  return (
    <button
      type="button"
      className="copilot-fab"
      onClick={() => router.push(`/assistente?from=${encodeURIComponent(fromPath)}`)}
      aria-label="Abrir Copiloto Financeiro"
    >
      <SparkleIcon />
    </button>
  );
}

/** Páginas que empilham o Copiloto com um FAB de ação próprio */
export function hasOwnFabStack(pathname: string) {
  return pathname === "/" || /^\/cartoes\/(?!nova$)[^/]+$/.test(pathname);
}
