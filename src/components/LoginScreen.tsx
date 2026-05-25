"use client";
import { useState } from "react";
import { useApp } from "@/context/AppContext";

export default function LoginScreen() {
  const { signIn } = useApp();
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState("");

  async function handleSignIn() {
    setLoading(true);
    setError("");
    try {
      await signIn();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "";
      if (!msg.includes("popup-closed")) {
        setError("Erro ao entrar. Tente novamente.");
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{
      height: "100dvh", width: "100%",
      background: "var(--bg)",
      display: "flex", alignItems: "center", justifyContent: "center",
      padding: "24px",
    }}>
      <div style={{ maxWidth: "360px", width: "100%", textAlign: "center" }}>

        {/* Logo */}
        <div style={{
          width: "72px", height: "72px", borderRadius: "22px",
          background: "var(--accent-10)", border: "1px solid var(--border-accent)",
          display: "flex", alignItems: "center", justifyContent: "center",
          margin: "0 auto 24px",
          fontSize: "34px",
        }}>
          💸
        </div>

        <h1 style={{ fontSize: "28px", fontWeight: 800, color: "var(--text-1)", letterSpacing: "-0.04em", marginBottom: "8px" }}>
          FlowCash
        </h1>
        <p style={{ fontSize: "14px", color: "var(--text-2)", lineHeight: 1.6, marginBottom: "36px" }}>
          Motor financeiro temporal.{" "}
          <span style={{ color: "var(--accent)" }}>Seus dados na nuvem</span>,
          acessíveis em qualquer dispositivo.
        </p>

        {/* Features */}
        <div style={{ marginBottom: "36px", display: "flex", flexDirection: "column", gap: "10px" }}>
          {[
            { icon: "☁️", text: "Dados sincronizados entre celular e PC" },
            { icon: "🔒", text: "Login seguro com sua conta Google" },
            { icon: "📊", text: "Motor de saldo real, projetado e fluxo de caixa" },
          ].map(({ icon, text }) => (
            <div key={text} style={{ display: "flex", alignItems: "center", gap: "12px", textAlign: "left" }}>
              <span style={{ fontSize: "18px", flexShrink: 0 }}>{icon}</span>
              <span style={{ fontSize: "13px", color: "var(--text-2)" }}>{text}</span>
            </div>
          ))}
        </div>

        {/* Google Sign-In button */}
        <button
          onClick={handleSignIn}
          disabled={loading}
          style={{
            width: "100%",
            padding: "14px 20px",
            borderRadius: "14px",
            border: "1px solid var(--border)",
            background: loading ? "rgba(255,255,255,0.04)" : "rgba(255,255,255,0.07)",
            color: loading ? "var(--text-3)" : "var(--text-1)",
            fontSize: "15px",
            fontWeight: 700,
            fontFamily: "inherit",
            cursor: loading ? "not-allowed" : "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: "12px",
            transition: "all 0.15s ease",
            minHeight: "52px",
          }}
        >
          {loading ? (
            <>
              <span style={{ fontSize: "18px" }}>⏳</span>
              Redirecionando...
            </>
          ) : (
            <>
              {/* Google icon */}
              <svg width="20" height="20" viewBox="0 0 24 24">
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
              </svg>
              Continuar com Google
            </>
          )}
        </button>

        {error && (
          <p style={{ color: "var(--red)", fontSize: "13px", marginTop: "14px", fontWeight: 600 }}>
            {error}
          </p>
        )}

        <p style={{ fontSize: "11px", color: "var(--text-3)", marginTop: "24px", lineHeight: 1.6 }}>
          Ao entrar, seus dados são salvos de forma privada
          associados à sua conta Google. Nenhum terceiro tem acesso.
        </p>
      </div>
    </div>
  );
}
