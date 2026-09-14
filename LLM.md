# FlowCash — briefing para IAs

Leia este arquivo **antes** de alterar código. É a fonte de verdade do produto, do domínio financeiro e das convenções. Não invente regras de saldo, fatura ou relatório que não estejam aqui ou no código citado.

App pessoal de finanças (PWA) do Nicollas. UI e copy em **pt-BR**. Repositório: `https://github.com/nicollasdpl/FlowCash`. Produção Vercel: `https://flowcash-rho.vercel.app`. Firebase project: `flowcash-39f72`.

## O que é

Contas bancárias, transações, cartões de crédito (fatura ≠ conta), orçamentos, metas, relatórios, import de fatura (PDF Bradesco / CSV Nubank), copiloto (Gemini) e push FCM.

**Princípio:** saldo é **consequência** de eventos. Nunca gravar saldo derivado no Firestore. Recalcular com funções puras em `src/engine/`.

## Stack

- Next.js 16 App Router (`src/app/`), React 19, TypeScript, Tailwind 4
- Estado cliente: `src/context/AppContext.tsx` (reducer + sync Firestore)
- Auth: Google via Firebase Auth
- Dados: um documento `users/{uid}/app/state` (estado inteiro do app)
- IA: `src/app/api/ai/route.ts` → `gemini-flash-lite-latest`
- Testes: Vitest (`npm test`)
- Deploy: Vercel (Hobby) + Firebase Functions/Scheduler para cron de push

Next.js desta versão **não** é o da sua memória de treino. Consulte `node_modules/next/dist/docs/` e `AGENTS.md` antes de APIs novas.

## Mapa de pastas

| Caminho | Função |
|---|---|
| `src/types/financial.ts` | Tipos e IDs de categorias de sistema |
| `src/engine/financialEngine.ts` | Saldo real, projetado, fluxo, limite do cartão |
| `src/engine/invoiceEngine.ts` | Competência da compra, datas de fatura, parcelas |
| `src/engine/budgetEngine.ts` | Gasto por categoria (visão fatura / competência) |
| `src/engine/spendingCalendarEngine.ts` | Mapa de calor de gastos |
| `src/app/relatorios/consumptionByCategory.ts` | Visão “gasto real / consumo” |
| `src/lib/repairCardState.ts` | Reparo de compras/faturas corrompidas |
| `src/lib/invoiceImport/` | Parse PDF/CSV, match, categoria |
| `src/lib/ai/` | Contexto, intents, respostas locais, sanitização |
| `src/app/api/ai/route.ts` | Copiloto |
| `src/app/api/ai-categorize/route.ts` | Categoria no import |
| `src/app/api/ai-budget/route.ts` | Sugestão de orçamento |
| `src/components/AccountScopePicker.tsx` | Filtro de conta no dashboard |

Rotas de UI: `/` dashboard, `/transacoes`, `/contas`, `/cartoes`, `/orcamentos`, `/metas`, `/relatorios`, `/assistente`, `/configuracoes`.

## Domínio — regras que não podem quebrar

### Datas

- `competenceDate`: quando a obrigação existe.
- `paymentDate`: quando o dinheiro entra/sai.
- Status `paid` com `paymentDate` **futura** não entra no saldo real; entra no projetado.
- Datas de calendário: `YYYY-MM-DD` local. Evite `toISOString().split("T")[0]` para “hoje/fim do mês” (UTC quebra no Brasil). Use `currentMonth()`, `today()`, `endOfMonth()`.

### Conta vs cartão

- Cartão **não** é conta. Compra no cartão **não** reduz saldo.
- Só o **pagamento da fatura** (transação `expense`, `origin: "invoice"`, categoria `system_invoice_payment`) reduz a conta `paymentAccountId`.
- Essa categoria **não** conta como gasto por categoria (as parcelas já contam pelas categorias das compras).

### Saldo real — `getCurrentBalance`

`initialBalance` + transações `paid` com `paymentDate <= hoje` na conta (e transferências de entrada). Sem pendentes. Sem fatura aberta.

Não muda ao navegar meses na UI.

### Saldo projetado — `getProjectedBalance` + `projectionHorizon`

Base = saldo real de **hoje**. Soma pendentes / pagos futuros / faturas não pagas **até** `upToDate`.

Na UI (dashboard e transações), `upToDate` é `projectionHorizon(selectedMonth)`:

- mês **passado** → fim do **mês atual** (o número **não** pode pular ao voltar agosto/setembro)
- mês atual ou futuro → fim do mês selecionado (olhar outubro inclui vencimentos de outubro)

Não use o fim do mês passado como horizonte do projetado.

Fatura unpaid só desconta se `dueDate <= upToDate` e **não** existe “Pagamento Fatura {nome} {Mês/AA}” pago no extrato (`hasPaidInvoiceTx` / `hasInvoicePaymentForDue`).

### Fatura — `invoiceEngine`

- Compra com `purchaseDate` **antes** do fechamento do mês → competência desse mês; **no fechamento ou depois** → mês seguinte (`getCompetenceMonth`).
- `dueDay > closingDay` → vence no mesmo mês de competência; senão vence no mês seguinte (`getInvoiceDates`).
- Parcelar N vezes = N `CardInstallment` em competências distintas. Assinatura gera parcelas à frente, mas limite do cartão só conta o mês atual da assinatura.

### Relatórios / dashboard

- **Receitas (caixa):** `income` + `paid` + `paymentDate` no mês, **exceto** `excludeFromReports` (empréstimo, reembolso de receita).
- **Despesas / donut “por fatura”:** `getSpentByCategory` — competência + parcelas do mês, **sem** pagamento de fatura.
- **Donut “gasto real”:** `getConsumptionByCategory` — à vista no mês da `purchaseDate`; parcelado no mês civil a partir da compra; não inflar com liquidação de fatura.
- Empréstimo: dinheiro **entra no saldo**, **não** entra em “Receitas”. Reembolso: PIX de terceiro não é renda; despesa no cartão fica separada.

### Edição de compra no cartão

Nunca apagar/recriar parcelas pagas como não pagas. Parse de valor pt-BR: `"1.240,62"` é 1240.62, não 1.24. Há reparo em `repairCardState` para dados já corrompidos.

## Copiloto

- Cliente: `src/components/ai/*`, FAB em `CopilotFab` / `FabStack`.
- Servidor manda bloco de contexto (`buildFinancialContext` / `formatFinancialContextBlock`), schema JSON, intents `launch | question | mixed | action`.
- Gastos no cartão aberto viram `card_purchase`, não transação na conta.
- Não lançar transação automaticamente sem confirmação do usuário.
- Rate limit e modelo flash-lite existem para caber no free tier; não trocar para modelo pesado sem motivo.

## Persistência

Documento único do usuário. `ignoreUndefinedProperties` no Firestore. Sync ao mudar estado e ao voltar ao primeiro plano (PWA).

Não commitar `.env*`, `public/fcm-init.js`, chaves Firebase. `NEXT_PUBLIC_FIREBASE_*` e `GEMINI_API_KEY` / equivalentes só em env da Vercel.

## Como trabalhar neste repo

1. Entenda se a mudança é **saldo**, **fatura**, **relatório** ou **UI**. Cada um tem motor diferente.
2. Funções de engine são **puras**. Sem `Date.now` escondido além de `today()`/`currentMonth()`.
3. Alinhe totais: dashboard, `/transacoes` e relatórios devem usar a **mesma** função para o mesmo conceito.
4. Teste com Vitest no motor/relatório/import. `npm test`.
5. UI: verifique no browser (login Google). Sem login, não declare fluxo autenticado como testado.
6. Não commitar `debug-*.log`, `.cursor/debug-*.log`, arquivos soltos tipo `novo 1.txt`.
7. Commits em pt ou conventional commits curtos (`fix(dashboard): …`), focados no porquê.
8. Produção = push em `master` (GitHub → Vercel). Branch `cursor/*` gera preview (`flowcash-git-…vercel.app`), não substitui produção sozinha.

## Armadilhas já vistas

| Sintoma | Causa típica |
|---|---|
| Projetado muda ao voltar um mês | Horizonte amarrado no mês da tela; usar `projectionHorizon` |
| Projetado cai duas vezes após pagar fatura | Parcela `paid: false` + transação de pagamento no extrato; respeitar `hasPaidInvoiceTx` |
| Fatura “vencida” depois de editar compra | Parcelas pagas recriadas; `repairCardState` / não resetar `paid` |
| Receitas infladas | Empréstimo/reembolso sem `excludeFromReports` |
| Donut ≠ card Despesas | Funções diferentes (`getSpentByCategory` vs consumo vs caixa) |
| App quebrado no celular | Service worker / FCM; ver rotas `fcm-init` e PWA |

## Comandos

```bash
npm run dev      # http://localhost:3000
npm test
npm run build
npm run lint
```
