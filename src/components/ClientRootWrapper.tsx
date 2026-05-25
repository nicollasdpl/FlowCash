"use client";
import dynamic from "next/dynamic";

// ssr: false só é permitido dentro de Client Components
const ClientRoot = dynamic(() => import("./ClientRoot"), {
  ssr: false,
  loading: () => null,
});

export default function ClientRootWrapper({ children }: { children: React.ReactNode }) {
  return <ClientRoot>{children}</ClientRoot>;
}
