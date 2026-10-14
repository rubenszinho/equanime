# Equânime

Interface em português para registrar uma banca, acompanhar a análise e baixar o relatório. As chamadas do navegador passam por `/api`, que usa o service binding `EQUANIME_API` em produção. Em desenvolvimento local, defina `EQUANIME_API_URL` em `.dev.vars` para apontar ao Worker da API.

```bash
npm install
npm run dev
npm test
npm run build
```
