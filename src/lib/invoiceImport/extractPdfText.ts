/**
 * Extrai texto de PDF no browser via pdf.js, agrupando por linha (Y)
 * para o parser Bradesco conseguir juntar descrição quebrada + valor.
 */

type PdfTextItem = {
  str?: string;
  transform?: number[];
};

function itemsToLines(items: PdfTextItem[]): string {
  const rows: { y: number; parts: { x: number; str: string }[] }[] = [];

  for (const item of items) {
    const str = item.str?.replace(/\s+/g, " ").trim();
    if (!str || !item.transform || item.transform.length < 6) continue;
    const x = item.transform[4];
    const y = item.transform[5];

    let row = rows.find(r => Math.abs(r.y - y) < 2.5);
    if (!row) {
      row = { y, parts: [] };
      rows.push(row);
    }
    row.parts.push({ x, str });
  }

  // PDF: Y cresce para cima → ordenar do topo para baixo
  rows.sort((a, b) => b.y - a.y);

  return rows
    .map(r => {
      r.parts.sort((a, b) => a.x - b.x);
      return r.parts.map(p => p.str).join(" ").replace(/\s+/g, " ").trim();
    })
    .filter(Boolean)
    .join("\n");
}

/** Extrai texto de todas as páginas de um PDF (ArrayBuffer). */
export async function extractTextFromPdf(data: ArrayBuffer): Promise<string> {
  const pdfjs = await import("pdfjs-dist");
  pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";

  const loadingTask = pdfjs.getDocument({ data: new Uint8Array(data) });
  const pdf = await loadingTask.promise;
  const pages: string[] = [];

  for (let n = 1; n <= pdf.numPages; n++) {
    const page = await pdf.getPage(n);
    const content = await page.getTextContent();
    const items = content.items as PdfTextItem[];
    const pageText = itemsToLines(items);
    if (pageText) pages.push(pageText);
  }

  const text = pages.join("\n");
  if (!text.trim()) {
    throw new Error(
      "Não consegui ler texto neste PDF (pode ser imagem/scan). Tente colar o texto do extrato.",
    );
  }
  return text;
}

export async function extractTextFromPdfFile(file: File): Promise<string> {
  const buffer = await file.arrayBuffer();
  return extractTextFromPdf(buffer);
}

/** Exposto para testes unitários do agrupamento por linha. */
export function __testItemsToLines(items: PdfTextItem[]): string {
  return itemsToLines(items);
}
