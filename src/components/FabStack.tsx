"use client";
import type { ReactNode } from "react";

/** Empilha FABs no canto inferior direito (Copiloto acima, ação da página abaixo). */
export function FabStack({ children }: { children: ReactNode }) {
  return <div className="fab-stack">{children}</div>;
}
