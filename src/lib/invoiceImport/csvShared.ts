/** Helpers compartilhados pelo export e pelo import de fatura CSV. */

export function csvEscape(value: string): string {
  if (/[;"\n\r]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}

export function downloadTextFile(filename: string, content: string, mime: string) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/** Formata número no padrão do export (pt-BR 2 casas). */
export function formatPtBrAmount(v: number): string {
  return v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/** YYYY-MM-DD → DD/MM/YYYY */
export function formatDateBr(iso: string): string {
  if (!iso) return "—";
  const [y, m, day] = iso.split("-");
  if (!y || !m || !day) return iso;
  return `${day}/${m}/${y}`;
}

/** DD/MM/YYYY ou D/M/YYYY → YYYY-MM-DD; retorna null se inválido. */
export function parseDateBr(raw: string): string | null {
  const m = raw.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!m) return null;
  const day = Number(m[1]);
  const month = Number(m[2]);
  const year = Number(m[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/**
 * Aceita "1.878,95", "1878,95", "1878.95", "-2.298,22".
 * Retorna null se não for número válido.
 */
export function parsePtBrAmount(raw: string): number | null {
  let s = raw.trim().replace(/\s/g, "").replace(/R\$\s*/i, "");
  if (!s) return null;
  const neg = s.startsWith("-") || s.startsWith("(");
  s = s.replace(/^[-(]+/, "").replace(/\)+$/, "");
  if (s.includes(",") && s.includes(".")) {
    // 1.878,95 → remove milhar, vírgula → ponto
    s = s.replace(/\./g, "").replace(",", ".");
  } else if (s.includes(",")) {
    s = s.replace(",", ".");
  }
  const n = Number(s);
  if (!Number.isFinite(n)) return null;
  const rounded = Math.round(n * 100) / 100;
  return neg ? -rounded : rounded;
}

/** Split CSV line respecting quotes; separator default `;`. */
export function splitCsvLine(line: string, sep = ";"): string[] {
  const out: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          cur += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        cur += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === sep) {
      out.push(cur);
      cur = "";
    } else {
      cur += ch;
    }
  }
  out.push(cur);
  return out.map(c => c.trim());
}

export function stripBom(text: string): string {
  return text.replace(/^\uFEFF/, "");
}

/** Remove acentos e lower-case para matching. */
export function normalizeText(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function roundCents(n: number): number {
  return Math.round(n * 100) / 100;
}
