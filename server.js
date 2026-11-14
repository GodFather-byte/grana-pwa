/* Grana — servidor: entrega o app e repassa as chamadas ao Gemini.
   A chave fica só aqui, na variável de ambiente GEMINI_API_KEY; o navegador nunca a recebe. Sem dependências (Node 18+). */
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');

const PORTA = Number(process.env.PORT) || 8080;
const CHAVE = (process.env.GEMINI_API_KEY || '').trim();
const GEMINI = 'https://generativelanguage.googleapis.com/v1beta';
const num = (v, padrao) => Number(v) > 0 ? Number(v) : padrao;
const LIMITES = {
  ipJanela: num(process.env.LIMITE_IP_10MIN, 40),     // pedidos por aparelho a cada 10 minutos
  ipDia: num(process.env.LIMITE_IP_DIA, 200),         // pedidos por aparelho por dia
  totalDia: num(process.env.LIMITE_TOTAL_DIA, 1500),  // pedidos de todos os aparelhos por dia
  corpo: 14 * 1024 * 1024,                            // áudio e foto vão em base64
};

/* ---------- arquivos do app: só o que está nesta lista é servido ---------- */
const TIPOS = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.webmanifest': 'application/manifest+json; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png' };
const PUBLICO = [/^\/index\.html$/, /^\/sw\.js$/, /^\/manifest\.webmanifest$/, /^\/css\/[\w.-]+\.css$/, /^\/js\/[\w.-]+\.js$/, /^\/icons\/[\w.-]+\.(png|svg)$/];
function arquivo(req, res, caminho) {
  if (caminho === '/') caminho = '/index.html';
  if (!PUBLICO.some(r => r.test(caminho))) return texto(res, 404, 'Não encontrado');
  fs.readFile(path.join(__dirname, caminho), (erro, dados) => {
    if (erro) return texto(res, 404, 'Não encontrado');
    res.writeHead(200, { 'Content-Type': TIPOS[path.extname(caminho)] || 'application/octet-stream', 'Cache-Control': caminho.startsWith('/icons/') ? 'public, max-age=86400' : 'no-cache', 'X-Content-Type-Options': 'nosniff' });
    res.end(req.method === 'HEAD' ? undefined : dados);
  });
}
const texto = (res, status, msg) => { res.writeHead(status, { 'Content-Type': 'text/plain; charset=utf-8' }); res.end(msg); };
const json = (res, status, obj) => { res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(obj)); };
const recusa = (res, status, message) => json(res, status, { error: { message } });

/* ---------- limite de uso (em memória; zera quando o serviço reinicia) ---------- */
const uso = new Map(); let total = { dia: '', n: 0 };
const hoje = () => new Date().toISOString().slice(0, 10);
function dentroDoLimite(ip) {
  const agora = Date.now(), dia = hoje();
  if (total.dia !== dia) { total = { dia, n: 0 }; uso.clear(); }
  let u = uso.get(ip); if (!u) uso.set(ip, u = { recentes: [], n: 0 });
  u.recentes = u.recentes.filter(t => agora - t < 600000);
  if (total.n >= LIMITES.totalDia || u.n >= LIMITES.ipDia || u.recentes.length >= LIMITES.ipJanela) return false;
  u.recentes.push(agora); u.n++; total.n++; return true;
}
const ipDe = req => String(req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.socket.remoteAddress || '?';
/* só aceita pedidos feitos pela própria página do app */
function mesmaOrigem(req) {
  const o = req.headers.origin; if (!o) return req.headers['sec-fetch-site'] ? req.headers['sec-fetch-site'] === 'same-origin' : true;
  try { return new URL(o).host === req.headers.host; } catch (e) { return false; }
}
function lerCorpo(req) {
  return new Promise((ok, erro) => {
    const partes = []; let tam = 0;
    req.on('data', p => { tam += p.length; if (tam > LIMITES.corpo) { erro(new Error('grande')); req.destroy(); } else partes.push(p); });
    req.on('end', () => ok(Buffer.concat(partes))); req.on('error', erro);
  });
}

/* ---------- repasse ao Gemini: só listar modelos e generateContent ---------- */
async function repassar(req, res, resto, busca) {
  if (!CHAVE) return recusa(res, 503, 'O assistente não está configurado neste servidor.');
  if (!mesmaOrigem(req)) return recusa(res, 403, 'Origem não permitida.');
  const listar = req.method === 'GET' && resto === 'models';
  const gerar = req.method === 'POST' && /^models\/gemini-[\w.-]+:generateContent$/.test(resto);
  if (!listar && !gerar) return recusa(res, 404, 'Rota não disponível.');
  if (!dentroDoLimite(ipDe(req))) return recusa(res, 429, 'Limite de uso da demonstração atingido.');
  let corpo;
  if (gerar) { try { corpo = await lerCorpo(req); } catch (e) { return recusa(res, 413, 'Arquivo grande demais.'); } }
  let r;
  try { r = await fetch(`${GEMINI}/${resto}${listar ? '?pageSize=' + (Number(busca.get('pageSize')) || 200) : ''}`, { method: req.method, headers: { 'x-goog-api-key': CHAVE, ...(gerar ? { 'Content-Type': 'application/json' } : {}) }, body: corpo, signal: AbortSignal.timeout(90000) }); }
  catch (e) { return recusa(res, 502, 'Não foi possível falar com o Gemini.'); }
  const dados = Buffer.from(await r.arrayBuffer());
  // erro de chave é problema do servidor, não de quem está usando: não repassa o detalhe
  if (r.status === 401 || r.status === 403 || (r.status === 400 && /api key/i.test(dados.toString()))) { console.error('Gemini recusou a chave do servidor:', r.status); return recusa(res, 503, 'O assistente está sem acesso ao Gemini no momento.'); }
  res.writeHead(r.status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }); res.end(dados);
}

http.createServer((req, res) => {
  let url; try { url = new URL(req.url, 'http://x'); } catch (e) { return texto(res, 400, 'Pedido inválido'); }
  const p = url.pathname;
  if (p === '/api/status') return json(res, 200, { assistente: !!CHAVE });
  if (p.startsWith('/api/gemini/')) return repassar(req, res, p.slice('/api/gemini/'.length), url.searchParams).catch(e => { console.error(e); if (!res.headersSent) recusa(res, 500, 'Erro no servidor.'); });
  if (req.method !== 'GET' && req.method !== 'HEAD') return texto(res, 405, 'Método não permitido');
  arquivo(req, res, p);
}).listen(PORTA, () => console.log(`Grana em http://localhost:${PORTA} — assistente ${CHAVE ? 'ligado' : 'desligado (defina GEMINI_API_KEY)'}`));
