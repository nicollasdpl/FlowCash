"use client";
import { useApp } from "@/context/AppContext";
import Sidebar from "./Sidebar";
import BottomNav from "./BottomNav";
import LoginScreen from "./LoginScreen";

function LoadingScreen() {
  return (
    <div style={{
      height: "100dvh", width: "100%",
      background: "var(--bg)",
      display: "flex", alignItems: "center", justifyContent: "center",
      flexDirection: "column", gap: "16px",
    }}>
      <div style={{
        width: "60px", height: "60px", borderRadius: "18px",
        background: "var(--accent-10)", border: "1px solid var(--border-accent)",
        display: "flex", alignItems: "center", justifyContent: "center",
        fontSize: "28px",
      }}>
        💸
      </div>
      <p style={{ color: "var(--text-3)", fontSize: "13px", fontWeight: 600 }}>Carregando...</p>
    </div>
  );
}

export default function AppShell({ children }: { children: React.ReactNode }) {
  const { user, authLoading } = useApp();

  if (authLoading) return <LoadingScreen />;
  if (!user)       return <LoginScreen />;

  return (
    <>
      <Sidebar />
      <main style={{ flex: 1, overflowY: "auto", background: "var(--bg)" }}>
        {children}
      </main>
      <BottomNav />
    </>
  );
}
