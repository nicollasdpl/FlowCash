"use client";
import { useState } from "react";
import { useApp } from "@/context/AppContext";
import { Wallet, Cloud, Lock, BarChart2, LoaderCircle } from "lucide-react";

export default function LoginScreen() {
  const { signIn } = useApp();
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState("");

  function handleSignIn() {
    setError("");
    setLoading(true);
    const promise = signIn();
    promise
      .then(() => setLoading(false))
      .catch((e: { code?: string; message?: string }) => {
        setLoading(false);
        const code = e?.code ?? "";
        if (!code.includes("closed") && !code.includes("cancelled")) {
          setError("Erro ao entrar. Tente novamente.");
        }
      });
  }

  const features = [
    { Icon: Cloud,    text: "Dados sincronizados entre celular e PC" },
    { Icon: Lock,     text: "Login seguro com sua conta Google" },
    { Icon: BarChart2, text: "Motor de saldo real, projetado e fluxo de caixa" },
  ];

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
          color: "var(--accent)",
        }}>
          <Wallet size={34} strokeWidth={1.5} />
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
          {features.map(({ Icon, text }) => (
            <div key={text} style={{ display: "flex", alignItems: "center", gap: "12px", textAlign: "left" }}>
              <div style={{
                width: "32px", height: "32px", borderRadius: "10px", flexShrink: 0,
                background: "var(--bg-input)", border: "1px solid var(--border)",
                display: "flex", alignItems: "center", justifyContent: "center",
                color: "var(--text-2)",
              }}>
                <Icon size={16} strokeWidth={1.5} />
              </div>
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
              <LoaderCircle size={18} strokeWidth={2} style={{ animation: "spin 0.7s linear infinite" }} />
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
