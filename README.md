# Grana — controle de gastos por voz (PWA)

Aplicativo de finanças pessoais que roda inteiro no navegador. Você fala (ou escreve, ou fotografa um cupom) e o Gemini transforma em lançamentos categorizados. Sem build: são arquivos estáticos, com um servidor opcional que guarda a chave do Gemini.

## O que tem

- **Assistente por voz**: grava o áudio, envia ao Gemini e recebe os lançamentos prontos. Entende vários gastos na mesma fala, datas como "ontem" e perguntas como "quanto gastei com mercado este mês?". Responde em texto e em voz alta.
- **Foto de cupom fiscal**: o Gemini lê o total e o estabelecimento.
- **Início**: saldo do mês, quanto dá para gastar por dia até o fim do mês (já descontando contas fixas a pagar) e alertas.
- **Orçamentos por categoria**, com sugestão automática pela média dos últimos 3 meses.
- **Metas** com cálculo de quanto guardar por mês para chegar no prazo.
- **Contas fixas e assinaturas**: custo mensal e anual, aviso de vencimento, botão Pagar que já lança a despesa.
- **Relatórios**: rosca por categoria, ritmo de gastos contra o mês anterior, 6 meses de receitas e despesas, e análise do mês escrita pelo Gemini.
- **Tutorial de instalação**: identifica o aparelho e o navegador (iPhone/iPad no Safari ou Chrome, Android, link aberto dentro de outro app) e mostra o passo a passo certo na primeira visita.
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

## Assistente sem chave no aparelho (servidor)

Para quem abre o link usar o assistente sem configurar nada, publique com o `server.js` (Node 18+). Ele entrega o app e atende o assistente; as chaves ficam só no servidor, em variáveis de ambiente.

```bash
npm install
ANTHROPIC_API_KEY=sua-chave GEMINI_API_KEY=sua-chave node server.js    # http://localhost:8080
```

| Variáveis definidas | Texto, foto de cupom e análise | Voz |
|---|---|---|
| `ANTHROPIC_API_KEY` e `GEMINI_API_KEY` | Claude | Gemini (áudio gravado) |
| só `ANTHROPIC_API_KEY` | Claude | ditado do próprio aparelho, quando o navegador oferece |
| só `GEMINI_API_KEY` | Gemini | Gemini (áudio gravado) |

A API do Claude não recebe áudio, por isso a voz usa o Gemini ou o ditado do aparelho. O ditado depende do navegador e pode não existir no app instalado no iPhone; para a voz funcionar em qualquer aparelho, defina também `GEMINI_API_KEY`.

No Render: Web Service, runtime Node, build command `npm install`, start command `node server.js`, e as chaves em Environment. Nunca coloque uma chave no código.

O modelo do Claude é `claude-opus-5-5` (troque com `GRANA_MODELO`) e o esforço de raciocínio é `low` (troque com `GRANA_ESFORCO`).

O servidor só aceita pedidos vindos da própria página e limita o uso: 40 pedidos por aparelho a cada 10 minutos, 200 por aparelho por dia e 1500 no total por dia (ajustáveis com `LIMITE_IP_10MIN`, `LIMITE_IP_DIA` e `LIMITE_TOTAL_DIA`). Sem nenhuma chave no servidor, o app funciona como antes, com a chave do Gemini colada em Ajustes.

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
