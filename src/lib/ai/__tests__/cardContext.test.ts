import { describe, expect, it } from "vitest";
import { parseCardIdFromPath } from "../cardContext";

describe("parseCardIdFromPath", () => {
  it("extrai id da página do cartão", () => {
    expect(parseCardIdFromPath("/cartoes/nubank-123")).toBe("nubank-123");
    expect(parseCardIdFromPath("/cartoes/nubank-123/nova-compra")).toBe("nubank-123");
  });

  it("ignora lista e nova compra de cartão", () => {
    expect(parseCardIdFromPath("/cartoes")).toBeNull();
    expect(parseCardIdFromPath("/cartoes/nova")).toBeNull();
    expect(parseCardIdFromPath("/")).toBeNull();
  });
});
