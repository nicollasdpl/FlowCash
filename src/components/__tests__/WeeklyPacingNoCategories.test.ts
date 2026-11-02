import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import WeeklyPacingNoCategories from "@/components/WeeklyPacingNoCategories";

describe("WeeklyPacingNoCategories", () => {
  it("mostra mensagem e link de configuração sem barra", () => {
    const html = renderToStaticMarkup(createElement(WeeklyPacingNoCategories));
    expect(html).toContain("Defina um orçamento deste mês");
    expect(html).toContain('href="/configuracoes/cota-semanal"');
    expect(html).not.toContain("role=\"img\"");
  });
});
