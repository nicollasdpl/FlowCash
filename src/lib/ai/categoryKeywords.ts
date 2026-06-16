// Keywords semânticas por categoria — seed + personalizadas do usuário.

export const CATEGORY_KEYWORDS: Record<string, string> = {
  alimentacao:   "ifood, rappi, uber eats, restaurante, lanche, mercado, supermercado, padaria, acougue, hortifruti, pizza, hamburguer, delivery, mcdonalds, burger king, subway",
  transporte:    "uber, 99, cabify, 99pop, gasolina, combustivel, posto, onibus, metro, estacionamento, pedagio, taxi, passagem, brt",
  moradia:       "aluguel, condominio, iptu, agua, luz, energia, gas, internet, net, claro, vivo, tim, oi, conta de luz, conta de agua",
  saude:         "farmacia, remedio, consulta, medico, dentista, hospital, plano de saude, exame, drogaria, drogasil, ultrafarma",
  lazer:         "netflix, spotify, disney, amazon prime, cinema, teatro, show, ingresso, steam, playstation, xbox, jogo, eventim",
  academia:      "smartfit, bluefit, gympass, musculacao, treino, personal, academia, crossfit, pilates, yoga, wellhub",
  educacao:      "curso, faculdade, escola, livro, udemy, alura, mensalidade, material escolar, descomplica",
  vestuario:     "roupa, calcado, tenis, camisa, calca, loja, shein, renner, c&a, riachuelo, zara, hering, levis",
  eletronicos:   "celular, notebook, tablet, fone, carregador, kabum, amazon, americanas, magazine luiza, shopee",
  viagem:        "hotel, passagem aerea, airbnb, hospedagem, latam, gol, azul, booking, decolar",
  pets:          "racao, veterinario, petshop, banho e tosa, cobasi, petz, remedio pet",
  salario:       "salario, pagamento, holerite, pro-labore, renda, receita mensal",
  freelance:     "freelance, servico, honorario, projeto, consultoria, pix recebido",
  investimentos: "dividendo, rendimento, juros, resgate, cdb, tesouro, fundo, rendeu",
};

/** Keywords fixas para categorias personalizadas comuns (por nome normalizado). */
export const CUSTOM_CATEGORY_KEYWORDS: Record<string, string> = {
  corre:        "corre, baseado, beck, erva, verde, fumei, fumar, fuminho, bagulho, skank",
  "para mim":   "comprei pra mim, presente pra mim, mimo, roupa pra mim, tenis, perfume, compra pessoal",
  assinatura:   "netflix, spotify, amazon prime, youtube premium, chatgpt, discord nitro, mensalidade, plano, recorrente, renovacao",
  bebida:       "cerveja, heineken, budweiser, drinks, bar, boteco, cachaca, vinho, whisky, vodka, gelada, latinha",
};

export function normalizeCategoryKey(name: string): string {
  return name.toLowerCase().normalize("NFD").replace(/\p{M}/gu, "").trim();
}

export function getKeywordsForCategory(categoryName: string): string | undefined {
  const key = normalizeCategoryKey(categoryName);
  return CUSTOM_CATEGORY_KEYWORDS[key] ?? CATEGORY_KEYWORDS[key];
}

export function buildCategoryListLine(
  category: { id: string; name: string; type: string },
): string {
  const kw = getKeywordsForCategory(category.name);
  return `  id="${category.id}" | ${category.name} (${category.type})${kw ? ` → ${kw}` : ""}`;
}
