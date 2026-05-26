import { NextResponse } from "next/server";

// Teste mínimo isolado — sem schema, sem structured output, sem parser
// Objetivo: validar se a API key + modelo respondem ao básico
// Endpoint: GET /api/ai-test

export async function GET() {
  const apiKey = process.env.GEMINI_API_KEY;

  // 1. Diagnóstico do ambiente
  const env = {
    hasKey: !!apiKey,
    keyPrefix: apiKey ? apiKey.slice(0, 8) + "..." : "(ausente)",
    model: "gemini-1.5-flash-latest",
    endpoint: "https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash-latest:generateContent",
    sdk: "REST puro via fetch — sem google-genai, sem @google-cloud, sem Vertex AI",
    auth: "query param ?key= (AI Studio)",
  };

  if (!apiKey) {
    return NextResponse.json({ ok: false, env, error: "GEMINI_API_KEY não definida" });
  }

  // 2. Listar modelos disponíveis para esta chave
  let availableModels: string[] = [];
  try {
    const listRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`,
      { signal: AbortSignal.timeout(10000) }
    );
    if (listRes.ok) {
      const listData = await listRes.json();
      availableModels = (listData.models ?? [])
        .filter((m: { supportedGenerationMethods?: string[] }) =>
          m.supportedGenerationMethods?.includes("generateContent")
        )
        .map((m: { name: string }) => m.name.replace("models/", ""));
    }
  } catch { /* ignora erro no list */ }

  // 3. Tentar modelos em ordem de preferência
  const candidates = ["gemini-2.0-flash", "gemini-flash-latest", "gemini-1.5-flash-latest", "gemini-1.5-flash"];
  const results: Record<string, { status: number; ok: boolean; response?: string; error?: string }> = {};

  for (const model of candidates) {
    try {
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ contents: [{ parts: [{ text: "Oi" }] }] }),
          signal: AbortSignal.timeout(8000),
        }
      );
      const body = await res.text();
      if (res.ok) {
        const data = JSON.parse(body);
        const text = data?.candidates?.[0]?.content?.parts?.[0]?.text ?? "(sem texto)";
        results[model] = { status: res.status, ok: true, response: text.slice(0, 100) };
        // Encontrou um modelo que funciona — retorna imediatamente
        return NextResponse.json({
          ok: true,
          env,
          workingModel: model,
          availableModels: availableModels.slice(0, 20),
          geminiResponse: text,
          allResults: results,
        });
      } else {
        results[model] = { status: res.status, ok: false, error: body.slice(0, 200) };
      }
    } catch (e) {
      results[model] = { status: 0, ok: false, error: String(e) };
    }
  }

  return NextResponse.json({
    ok: false,
    env,
    availableModels: availableModels.slice(0, 20),
    allResults: results,
    error: "Nenhum modelo funcionou. Veja allResults para detalhes.",
  });
}
