import { describe, expect, it } from "vitest";
import { detectIntent, isLocalAnswerCandidate } from "../intentDetection";

describe("detectIntent", () => {
  it("detecta lançamento com verbo brasileiro", () => {
    expect(detectIntent("passei 30 no mercadão")).toBe("launch");
    expect(detectIntent("pix de 200 reais")).toBe("launch");
    expect(detectIntent("transferi 500")).toBe("launch");
  });

  it("detecta pergunta sobre gastos do mês", () => {
    expect(detectIntent("quanto gastei esse mês?")).toBe("question");
    expect(detectIntent("gastei esse mês")).toBe("question");
  });

  it("detecta mixed quando pergunta e valor coexistem", () => {
    expect(detectIntent("gastei 50 no ifood, como tá o orçamento?")).toBe("mixed");
  });

  it("detecta ação de apagar", () => {
    expect(detectIntent("apaga o ifood de ontem")).toBe("action");
    expect(detectIntent("remove o uber")).toBe("action");
  });

  it("detecta correção após launch", () => {
    expect(detectIntent("errado, foi 15,50", "launch")).toBe("launch");
    expect(detectIntent("na verdade foi no Bradesco", "mixed")).toBe("launch");
  });

  it("não confunde 'como comprei muito' com pergunta", () => {
    expect(detectIntent("como comprei muito esse mês")).toBe("launch");
  });
});

describe("isLocalAnswerCandidate", () => {
  it("identifica perguntas respondíveis localmente", () => {
    expect(isLocalAnswerCandidate("quanto gastei esse mês?")).toBe(true);
    expect(isLocalAnswerCandidate("falta quanto pro orçamento de alimentação?")).toBe(true);
    expect(isLocalAnswerCandidate("resumo do mês")).toBe(true);
    expect(isLocalAnswerCandidate("gastei 50 no ifood")).toBe(false);
  });
});
