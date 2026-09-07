"use client";
import { useState } from "react";
import { doc, setDoc, serverTimestamp } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useApp } from "@/context/AppContext";

export default function ImportarBackup() {
  const { user, dispatch } = useApp();
  const [fileName, setFileName] = useState<string | null>(null);
  const [parsed, setParsed] = useState<any>(null);
  const [status, setStatus] = useState<"idle" | "loading" | "done" | "error">("idle");
  const [message, setMessage] = useState("");

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    setStatus("idle");
    setMessage("");
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const json = JSON.parse(reader.result as string);
        setParsed(json);
      } catch {
        setStatus("error");
        setMessage("Esse arquivo não é um JSON válido.");
      }
    };
    reader.readAsText(file);
  }

  async function handleImport() {
    if (!user) {
      setStatus("error");
      setMessage("Você precisa estar logado no app pra importar.");
      return;
    }
    if (!parsed) return;
    setStatus("loading");
    try {
      const ref = doc(db, "users", user.uid, "app", "state");
      await setDoc(ref, { ...parsed, updatedAt: serverTimestamp() });
      dispatch({ type: "LOAD", payload: parsed });
      setStatus("done");
      setMessage("Importado com sucesso. Recarregue a página (F5) pra conferir tudo.");
    } catch (err: any) {
      setStatus("error");
      setMessage("Erro ao importar: " + (err?.message ?? String(err)));
    }
  }

  return (
    <div style={{ maxWidth: 480, margin: "0 auto", padding: 24, fontFamily: "sans-serif" }}>
      <h1 style={{ fontSize: 20, fontWeight: 700, marginBottom: 4 }}>Importar backup</h1>
      <p style={{ fontSize: 14, color: "#888", marginBottom: 24 }}>
        {user ? `Logado como ${user.email ?? user.uid}` : "Você não está logado."}
      </p>

      <input
        type="file"
        accept="application/json"
        onChange={handleFile}
        style={{ marginBottom: 16, display: "block" }}
      />

      {fileName && <p style={{ fontSize: 13, marginBottom: 8 }}>Arquivo: {fileName}</p>}

      {parsed && (
        <p style={{ fontSize: 13, color: "#888", marginBottom: 16 }}>
          {parsed.accounts?.length ?? 0} contas · {parsed.transactions?.length ?? 0} transações ·{" "}
          {parsed.cards?.length ?? 0} cartões · {parsed.installments?.length ?? 0} parcelas
        </p>
      )}

      <button
        onClick={handleImport}
        disabled={!parsed || status === "loading" || !user}
        style={{
          padding: "10px 20px",
          borderRadius: 8,
          border: "none",
          background: !parsed || status === "loading" || !user ? "#444" : "#00E5A0",
          color: "#000",
          fontWeight: 600,
          cursor: !parsed || status === "loading" ? "default" : "pointer",
        }}
      >
        {status === "loading" ? "Importando..." : "Importar e substituir dados do Firestore"}
      </button>

      {message && (
        <p style={{ marginTop: 16, fontSize: 14, color: status === "error" ? "#FF4D6A" : "#00E5A0" }}>
          {message}
        </p>
      )}
    </div>
  );
}
