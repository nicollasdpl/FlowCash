/** Extrai o id do cartão quando o copiloto foi aberto em /cartoes/[cardId] ou subrotas. */
export function parseCardIdFromPath(pathname: string): string | null {
  const path = decodeURIComponent(pathname).split("?")[0] ?? "";
  const match = path.match(/^\/cartoes\/([^/]+)/);
  if (!match || match[1] === "nova") return null;
  return match[1];
}
