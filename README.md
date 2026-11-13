# Grana — controle de gastos por voz (PWA)

Aplicativo de finanças pessoais que roda inteiro no navegador. Você fala (ou escreve, ou fotografa um cupom) e o Gemini transforma em lançamentos categorizados. Sem backend, sem build: são arquivos estáticos.

## O que tem

- **Assistente por voz**: grava o áudio, envia ao Gemini e recebe os lançamentos prontos. Entende vários gastos na mesma fala, datas como "ontem" e perguntas como "quanto gastei com mercado este mês?". Responde em texto e em voz alta.
- **Foto de cupom fiscal**: o Gemini lê o total e o estabelecimento.
- **Início**: saldo do mês, quanto dá para gastar por dia até o fim do mês (já descontando contas fixas a pagar) e alertas.
- **Orçamentos por categoria**, com sugestão automática pela média dos últimos 3 meses.
- **Metas** com cálculo de quanto guardar por mês para chegar no prazo.
- **Contas fixas e assinaturas**: custo mensal e anual, aviso de vencimento, botão Pagar que já lança a despesa.
- **Relatórios**: rosca por categoria, ritmo de gastos contra o mês anterior, 6 meses de receitas e despesas, e análise do mês escrita pelo Gemini.
- **PWA**: instala na tela inicial, abre sem internet, backup em JSON e exportação em CSV (abre no Excel).

## Como rodar

O microfone e o modo offline exigem HTTPS ou `localhost`. Abrir o `index.html` direto do disco não serve.

```bash
# na pasta do projeto
npx serve .          # ou: python3 -m http.server 8080
```

## Como publicar (grátis)

- **GitHub Pages**: suba a pasta para um repositório e ative Pages em Settings > Pages (branch `main`, pasta raiz).
- **Netlify**: arraste a pasta em app.netlify.com/drop.
- **Vercel / Cloudflare Pages**: importe o repositório; não há comando de build.

Ao publicar uma nova versão, mude `VERSAO` em `sw.js` (ex.: `grana-v2`) para os aparelhos baixarem os arquivos novos.

## Chave do Gemini

1. Crie uma chave gratuita em https://aistudio.google.com/apikey
2. No app, abra Ajustes, cole a chave e toque em **Testar conexão**.

O modelo padrão é `gemini-3.8-flash` (constante `MODELO_PADRAO` em `js/app.js`). Se a chave não tiver acesso a ele, o app consulta a lista de modelos e troca sozinho para o Flash mais novo disponível.

**Atenção para produção:** a chave fica guardada no navegador do usuário. Para demonstração e uso pessoal está certo. Para distribuir a clientes com uma chave sua, coloque um servidor intermediário (um endpoint que recebe o áudio e chama o Gemini) e troque a constante `API` em `js/app.js`; nunca publique sua chave no código.

## Estrutura

```
index.html              casca do app
css/app.css             estilos (tema claro e escuro)
js/app.js               telas, armazenamento, gravação e chamadas ao Gemini
sw.js                   service worker (cache offline)
manifest.webmanifest    dados de instalação
icons/                  ícones
```

Os dados ficam em `localStorage` (chave `grana.v1`). Categorias ficam na lista `CATS`, no topo de `js/app.js`.

## O que não tem

- Sincronização entre aparelhos e login (precisa de backend).
- Conexão automática com bancos via Open Finance (precisa de um agregador como Pluggy ou Belvo, pago, e de backend).
