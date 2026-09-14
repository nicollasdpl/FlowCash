# FlowCash

App PWA de finanças pessoais (contas, cartões, orçamentos, relatórios, copiloto).

- **Produção:** https://flowcash-rho.vercel.app
- **Repo:** https://github.com/nicollasdpl/FlowCash
- **Para IAs / outras sessões:** leia [`LLM.md`](./LLM.md)

```bash
npm install
npm run dev    # http://localhost:3000
npm test
```

Auth Google + Firestore. Variáveis em `.env.local` (não versionadas): `NEXT_PUBLIC_FIREBASE_*` e chave Gemini nas rotas `/api/ai*`.
