"use client";
import { useEffect } from "react";
import { useApp } from "@/context/AppContext";
import Sidebar from "./Sidebar";
import BottomNav from "./BottomNav";
import AIAssistant from "./AIAssistant";
import LoginScreen from "./LoginScreen";
import { Wallet } from "lucide-react";

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
        color: "var(--accent)",
      }}>
        <Wallet size={28} strokeWidth={1.5} />
      </div>
      <p style={{ color: "var(--text-3)", fontSize: "13px", fontWeight: 600 }}>Carregando...</p>
    </div>
  );
}

export default function AppShell({ children }: { children: React.ReactNode }) {
  const { user, authLoading } = useApp();

  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    function update() {
      const h = vv!.height;
      const t = vv!.offsetTop;
      const root = document.documentElement;
      root.style.setProperty("--modal-max-h", `${h - 8}px`);
      root.style.setProperty("--vv-height", `${h}px`);
      root.style.setProperty("--vv-top", `${t}px`);
    }
    update();
    vv.addEventListener("resize", update);
    vv.addEventListener("scroll", update);
    return () => {
      vv.removeEventListener("resize", update);
      vv.removeEventListener("scroll", update);
    };
  }, []);

  if (authLoading) return <LoadingScreen />;
  if (!user)       return <LoginScreen />;

  return (
    <>
      <Sidebar />
      <main style={{ flex: 1, overflowY: "auto", background: "var(--bg)" }}>
        {children}
      </main>
      <BottomNav />
      <AIAssistant />
    </>
  );
}
