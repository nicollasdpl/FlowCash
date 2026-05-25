"use client";
import { AppProvider } from "@/context/AppContext";
import AppShell from "./AppShell";

export default function ClientRoot({ children }: { children: React.ReactNode }) {
  return (
    <AppProvider>
      <AppShell>{children}</AppShell>
    </AppProvider>
  );
}
