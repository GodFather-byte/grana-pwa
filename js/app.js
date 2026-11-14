/* Grana — controle de gastos por voz (PWA). Tudo roda no navegador; os dados ficam no aparelho. */
'use strict';

/* ---------- utilidades ---------- */
const $ = (s, el = document) => el.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const brl = v => (Number(v) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const brl0 = v => (Number(v) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const p2 = n => String(n).padStart(2, '0');
const iso = d => `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`;
const hojeISO = () => iso(new Date());
const mesAtual = () => hojeISO().slice(0, 7);
const somaMes = (mk, n) => { const [y, m] = mk.split('-').map(Number); const d = new Date(y, m - 1 + n, 1); return `${d.getFullYear()}-${p2(d.getMonth() + 1)}`; };
const diasNoMes = mk => { const [y, m] = mk.split('-').map(Number); return new Date(y, m, 0).getDate(); };
const nomeMes = (mk, curto) => { const [y, m] = mk.split('-').map(Number); return new Date(y, m - 1, 1).toLocaleDateString('pt-BR', curto ? { month: 'short' } : { month: 'long', year: 'numeric' }).replace('.', ''); };
const Mes = mk => { const n = nomeMes(mk); return n[0].toUpperCase() + n.slice(1); };
const nomeDia = d => { const h = hojeISO(); if (d === h) return 'Hoje'; const o = new Date(); o.setDate(o.getDate() - 1); if (d === iso(o)) return 'Ontem'; const [y, m, dd] = d.split('-').map(Number); return new Date(y, m - 1, dd).toLocaleDateString('pt-BR', { weekday: 'short', day: 'numeric', month: 'short' }).replace(/\./g, ''); };
const lerValor = s => { let t = String(s ?? '').replace(/[^\d.,-]/g, ''); if (t.includes(',')) t = t.replace(/\./g, '').replace(',', '.'); const n = parseFloat(t); return isFinite(n) ? Math.round(n * 100) / 100 : 0; };
const mostraValor = v => v ? String(v.toFixed(2)).replace('.', ',') : '';

/* ---------- categorias ---------- */
const CATS = [
  { id: 'alimentacao', nome: 'Alimentação', emoji: '🍽️', cor: '#C2572B', tipo: 'despesa' },
  { id: 'mercado', nome: 'Mercado', emoji: '🛒', cor: '#2E8B62', tipo: 'despesa' },
  { id: 'transporte', nome: 'Transporte', emoji: '🚗', cor: '#2B6CB0', tipo: 'despesa' },
  { id: 'moradia', nome: 'Moradia', emoji: '🏠', cor: '#6B4E9B', tipo: 'despesa' },
  { id: 'contas', nome: 'Contas da casa', emoji: '💡', cor: '#D9A21B', tipo: 'despesa' },
  { id: 'saude', nome: 'Saúde', emoji: '💊', cor: '#B8323E', tipo: 'despesa' },
  { id: 'lazer', nome: 'Lazer', emoji: '🎉', cor: '#D0608F', tipo: 'despesa' },
  { id: 'compras', nome: 'Compras', emoji: '🛍️', cor: '#0F7C8A', tipo: 'despesa' },
  { id: 'educacao', nome: 'Educação', emoji: '📚', cor: '#4B5FA8', tipo: 'despesa' },
  { id: 'assinaturas', nome: 'Assinaturas', emoji: '🔁', cor: '#8A7A3F', tipo: 'despesa' },
  { id: 'outros', nome: 'Outros', emoji: '📦', cor: '#6C7A80', tipo: 'despesa' },
  { id: 'salario', nome: 'Salário', emoji: '💼', cor: '#1B7A53', tipo: 'receita' },
  { id: 'vendas', nome: 'Vendas e serviços', emoji: '🧾', cor: '#3A9A6E', tipo: 'receita' },
  { id: 'rendimentos', nome: 'Rendimentos', emoji: '📈', cor: '#5DB58B', tipo: 'receita' },
  { id: 'outras-receitas', nome: 'Outras receitas', emoji: '➕', cor: '#88C9A8', tipo: 'receita' },
];
const cat = id => CATS.find(c => c.id === id) || CATS[10];
const catsDe = tipo => CATS.filter(c => c.tipo === tipo);
const FORMAS = ['Pix', 'Dinheiro', 'Débito', 'Crédito', 'Boleto'];

/* ---------- estado ---------- */
const CHAVE = 'grana.v1';
const MODELO_PADRAO = 'gemini-3.8-flash';
const API = 'https://generativelanguage.googleapis.com/v1beta';
const vazio = () => ({ tx: [], orc: {}, metas: [], contas: [], chat: [], analises: {}, cfg: { chave: '', modelo: MODELO_PADRAO, falar: true, tema: 'claro' } });
let S = vazio();
const ui = { view: 'inicio', mes: mesAtual(), aba: 'orcamentos', filtro: 'tudo', busca: '', ocupado: false };

function carregar() {
  try { const j = JSON.parse(localStorage.getItem(CHAVE) || 'null'); if (j && typeof j === 'object') S = { ...vazio(), ...j, cfg: { ...vazio().cfg, ...(j.cfg || {}) } }; } catch (e) { /* começa vazio */ }
}
function salvar() {
  try { localStorage.setItem(CHAVE, JSON.stringify(S)); } catch (e) { aviso('Não foi possível salvar neste aparelho.'); }
}

/* ---------- contas ---------- */
const doMes = mk => S.tx.filter(t => t.data.startsWith(mk));
function resumo(mk, ateDia) {
  let rec = 0, desp = 0; const porCat = {};
  for (const t of doMes(mk)) {
    if (ateDia && Number(t.data.slice(8)) > ateDia) continue;
    if (t.tipo === 'receita') rec += t.valor;
    else { desp += t.valor; porCat[t.cat] = (porCat[t.cat] || 0) + t.valor; }
  }
  return { rec, desp, saldo: rec - desp, porCat };
}
const contaPaga = (c, mk) => { const id = c.pagos && c.pagos[mk]; return !!id && S.tx.some(t => t.id === id); };
const contasPendentes = mk => S.contas.filter(c => !contaPaga(c, mk));
const totalOrc = () => Object.values(S.orc).reduce((a, b) => a + b, 0);

function livreHoje(mk) {
  if (mk !== mesAtual()) return null;
  const r = resumo(mk), dia = new Date().getDate(), dias = diasNoMes(mk) - dia + 1;
  if (r.rec > 0) { const pend = contasPendentes(mk).reduce((a, c) => a + c.valor, 0); const disp = r.rec - r.desp - pend; return { disp, porDia: disp / dias, dias, pend, base: 'renda' }; }
  const o = totalOrc(); if (o > 0) { const disp = o - r.desp; return { disp, porDia: disp / dias, dias, pend: 0, base: 'orcamento' }; }
  return null;
}

function avisos(mk) {
  const out = [], r = resumo(mk), atual = mk === mesAtual(), dia = atual ? new Date().getDate() : diasNoMes(mk);
  for (const [id, lim] of Object.entries(S.orc)) {
    const g = r.porCat[id] || 0; if (!lim) continue;
    if (g > lim) out.push({ tom: 'alerta', txt: `${cat(id).nome} passou do orçamento em ${brl(g - lim)}.` });
    else if (g >= lim * .8) out.push({ tom: 'info', txt: `${cat(id).nome} já usou ${Math.round(g / lim * 100)}% do orçamento. Restam ${brl(lim - g)}.` });
  }
  if (atual) for (const c of contasPendentes(mk)) {
    const falta = c.dia - dia;
    if (falta < 0) out.push({ tom: 'alerta', txt: `${c.desc} venceu no dia ${c.dia} e ainda não foi paga (${brl(c.valor)}).` });
    else if (falta <= 5) out.push({ tom: 'info', txt: `${c.desc} vence ${falta === 0 ? 'hoje' : falta === 1 ? 'amanhã' : 'em ' + falta + ' dias'} (${brl(c.valor)}).` });
  }
  const ant = resumo(somaMes(mk, -1), dia);
  if (ant.desp > 0 && r.desp > 0) {
    const d = (r.desp - ant.desp) / ant.desp;
    if (Math.abs(d) >= .08) out.push({ tom: d > 0 ? 'alerta' : 'bom', txt: `Você gastou ${Math.round(Math.abs(d) * 100)}% ${d > 0 ? 'a mais' : 'a menos'} que no mesmo período do mês passado.` });
  }
  if (atual && dia >= 5 && r.desp > 0) out.push({ tom: 'info', txt: `Nesse ritmo, o mês fecha com cerca de ${brl0(r.desp / dia * diasNoMes(mk))} em despesas.` });
  if (r.rec > 0 && r.desp > 0) { const t = (r.rec - r.desp) / r.rec; out.push(t >= .1 ? { tom: 'bom', txt: `Você está guardando ${Math.round(t * 100)}% do que recebeu.` } : t < 0 ? { tom: 'alerta', txt: `As despesas passaram das receitas em ${brl(r.desp - r.rec)}.` } : { tom: 'info', txt: `Sobrou ${Math.round(t * 100)}% da renda. A referência mais usada é guardar 20%.` }); }
  return out;
}

/* ---------- roseta (guilhochê) ---------- */
function roseta(cls = 'roseta') {
  let paths = '';
  for (let k = 0; k < 9; k++) {
    const R = 34 + k * 6.5, A = 7 + k * .6, n = 12; let d = '';
    for (let i = 0; i <= 240; i++) {
      const th = i / 240 * Math.PI * 2, r = R + A * Math.sin(n * th + k * .9);
      d += (i ? 'L' : 'M') + (r * Math.cos(th)).toFixed(1) + ' ' + (r * Math.sin(th)).toFixed(1);
    }
    paths += `<path d="${d}Z"/>`;
  }
  return `<svg class="${cls}" viewBox="-100 -100 200 200" fill="none" stroke="currentColor" stroke-width=".7" aria-hidden="true">${paths}</svg>`;
}

/* ---------- componentes ---------- */
const I = {
  ajustes: '<svg viewBox="0 0 24 24"><path d="M4 6h10M18 6h2M4 12h2M10 12h10M4 18h12M16 4v4M8 10v4M18 16v4"/></svg>',
  ant: '<svg viewBox="0 0 24 24"><path d="M15 5l-7 7 7 7"/></svg>', prox: '<svg viewBox="0 0 24 24"><path d="M9 5l7 7-7 7"/></svg>',
  foto: '<svg viewBox="0 0 24 24"><path d="M4 8h3l2-3h6l2 3h3v11H4zM12 17a4 4 0 1 0 0-8 4 4 0 0 0 0 8z"/></svg>',
  enviar: '<svg viewBox="0 0 24 24"><path d="M5 12h14M13 6l6 6-6 6"/></svg>',
};
function linhaTx(t, acao = 'editar') {
  const c = cat(t.cat);
  return `<button class="linha" data-a="${acao}" data-id="${t.id}"><span class="bolha">${c.emoji}</span><span class="meio"><b>${esc(t.desc)}</b><span>${esc(c.nome)}${t.forma ? ', ' + esc(t.forma) : ''}</span></span><span class="v ${t.tipo === 'receita' ? 'pos' : ''}">${t.tipo === 'receita' ? '+' : '−'} ${brl(t.valor)}</span></button>`;
}
function barra(titulo, valorTxt, pct, sub, cls = '', attrs = '') {
  return `<button class="prog" ${attrs}><span class="tit"><span>${titulo}</span><span>${valorTxt}</span></span><span class="trilho"><i class="${cls}" style="width:${Math.max(2, Math.min(100, pct))}%"></i></span><span class="sub">${sub}</span></button>`;
}
function barraOrc(id, r) {
  const lim = S.orc[id], g = r.porCat[id] || 0, p = g / lim * 100, c = cat(id);
  return barra(`${c.emoji} ${esc(c.nome)}`, `${brl0(g)} de ${brl0(lim)}`, p, g > lim ? `Passou ${brl(g - lim)}` : `Restam ${brl(lim - g)}`, p > 100 ? 'x' : p >= 80 ? 'w' : '', `data-a="orc" data-id="${id}"`);
}

/* ---------- telas ---------- */
const TELAS = {
  inicio() {
    const mk = ui.mes, r = resumo(mk), lh = livreHoje(mk), tx = doMes(mk).sort(ordem).slice(0, 5), av = avisos(mk).slice(0, 4);
    if (!S.tx.length) return `<div class="vazio">${roseta()}<h2>Fale o que gastou</h2><p>Toque no microfone e diga, por exemplo, “gastei 32 reais no almoço”. O Grana anota, categoriza e mostra para onde o dinheiro vai.</p><div class="acoes"><button class="btn" data-a="go" data-v="ajustes">Conectar o Gemini</button><button class="btn sec" data-a="demo">Ver com dados de exemplo</button></div><p class="sm" style="margin-top:14px"><button class="link" data-a="novo">Ou anotar um gasto à mão</button></p></div>`;
    const orcs = Object.keys(S.orc).filter(id => S.orc[id] > 0).sort((a, b) => (r.porCat[b] || 0) / S.orc[b] - (r.porCat[a] || 0) / S.orc[a]).slice(0, 3);
    return `
    <section class="saldo">${roseta()}
      <small>Saldo de ${nomeMes(mk)}</small>
      <div class="valor">${brl(r.saldo)}</div>
      <div class="par"><div>Entrou<b>${brl(r.rec)}</b></div><div>Saiu<b>${brl(r.desp)}</b></div></div>
      ${lh ? `<div class="hoje">${lh.disp > 0 ? `Dá para gastar <b>${brl(lh.porDia)}</b> por dia até o fim do mês` : `Não sobra margem este mês: faltam <b>${brl(-lh.disp)}</b>`}${lh.pend ? `<br><span style="opacity:.8;font-size:13px">já separando ${brl(lh.pend)} das contas fixas a pagar</span>` : ''}</div>` : ''}
    </section>
    ${av.length ? `<section class="bloco"><h2>Para ficar de olho</h2><div class="avisos">${av.map(a => `<div class="aviso ${a.tom}">${esc(a.txt)}</div>`).join('')}</div></section>` : ''}
    ${orcs.length ? `<section class="bloco"><h2>Orçamentos <button data-a="go" data-v="planejar">Ver todos</button></h2><div class="cartao">${orcs.map(id => barraOrc(id, r)).join('')}</div></section>` : ''}
    <section class="bloco"><h2>Últimos lançamentos <button data-a="go" data-v="lancamentos">Ver todos</button></h2>
      ${tx.length ? `<div class="cartao">${tx.map(t => linhaTx(t)).join('')}</div>` : `<p class="muted">Nada lançado em ${nomeMes(mk)}.</p>`}
    </section>`;
  },

  lancamentos() {
    return `<div class="seg" style="margin-bottom:10px">${[['tudo', 'Tudo'], ['despesa', 'Despesas'], ['receita', 'Receitas']].map(([k, n]) => `<button class="${ui.filtro === k ? 'on' : ''}" data-a="filtro" data-f="${k}">${n}</button>`).join('')}</div>
    <input class="busca" id="busca" type="search" placeholder="Buscar por descrição ou categoria" value="${esc(ui.busca)}" aria-label="Buscar lançamentos">
    <div id="lista" style="margin-top:8px">${listaTx()}</div>
    <div class="acoes"><button class="btn cheio" data-a="novo">Novo lançamento</button></div>`;
  },

  assistente() {
    const sug = ['Gastei 32 reais no almoço', 'Recebi 1.500 de um serviço ontem', 'Quanto gastei com mercado este mês?', 'Coloca um limite de 600 em lazer'];
    const msgs = S.chat.map((m, i) => {
      if (m.de === 'eu') return `<div class="msg eu">${m.via !== 'texto' ? `<span class="tag">${m.via === 'voz' ? 'Áudio' : 'Foto do cupom'}</span>` : ''}${esc(m.txt || (m.via === 'voz' ? '…' : ''))}</div>`;
      if (m.pend) return `<div class="msg ia"><span class="pontos" aria-label="Processando"><i></i><i></i><i></i></span></div>`;
      const txs = (m.ids || []).map(id => S.tx.find(t => t.id === id)).filter(Boolean);
      return `<div class="msg ia ${m.erro ? 'erro' : ''}"><p>${esc(m.txt)}</p>${txs.length ? `<div class="salvos">${txs.map(t => linhaTx(t)).join('')}</div><div class="rodape"><button class="link" data-a="desfazer" data-i="${i}">Desfazer</button><span class="muted">Toque num item para corrigir</span></div>` : ''}${m.acao ? `<div class="rodape"><button class="link" data-a="go" data-v="ajustes">${esc(m.acao)}</button></div>` : ''}</div>`;
    }).join('');
    return `<div class="chat">${msgs || `<div class="vazio" style="padding-bottom:8px">${roseta()}<h2>Diga ou escreva</h2><p>Toque no microfone para falar, fotografe um cupom fiscal ou escreva abaixo.</p>${S.cfg.chave ? '' : `<div class="acoes"><button class="btn" data-a="go" data-v="ajustes">Conectar o Gemini</button></div>`}</div><div class="chips">${sug.map(s => `<button class="chip" data-a="sugestao">${s}</button>`).join('')}</div>`}</div>
    <form class="compor" data-form="pergunta"><button type="button" class="ico" data-a="foto" aria-label="Fotografar cupom fiscal">${I.foto}</button><input name="q" autocomplete="off" placeholder="Escreva um gasto ou uma pergunta" aria-label="Mensagem"><button class="ico env" aria-label="Enviar">${I.enviar}</button></form>`;
  },

  planejar() {
    const mk = mesAtual(), r = resumo(mk);
    const abas = `<div class="seg" style="margin-bottom:16px">${[['orcamentos', 'Orçamentos'], ['metas', 'Metas'], ['contas', 'Contas fixas']].map(([k, n]) => `<button class="${ui.aba === k ? 'on' : ''}" data-a="aba" data-k="${k}">${n}</button>`).join('')}</div>`;
    let corpo = '';
    if (ui.aba === 'orcamentos') {
      const com = catsDe('despesa').filter(c => S.orc[c.id] > 0), sem = catsDe('despesa').filter(c => !(S.orc[c.id] > 0));
      const tot = totalOrc(), gasto = com.reduce((a, c) => a + (r.porCat[c.id] || 0), 0);
      corpo = `${com.length ? `<p class="muted sm" style="margin-bottom:10px">${brl0(gasto)} usados de ${brl0(tot)} planejados em ${nomeMes(mk)}.</p><div class="cartao">${com.map(c => barraOrc(c.id, r)).join('')}</div>` : `<p class="muted">Defina um limite por categoria e acompanhe quanto ainda pode gastar em cada uma.</p>`}
      ${sem.length ? `<section class="bloco"><h2>Sem limite definido</h2><div class="chips">${sem.map(c => `<button class="chip" data-a="orc" data-id="${c.id}">${c.emoji} ${c.nome}${r.porCat[c.id] ? ' (' + brl0(r.porCat[c.id]) + ')' : ''}</button>`).join('')}</div></section>` : ''}
      <div class="acoes"><button class="btn sec cheio" data-a="sugerirOrc">Sugerir limites pela média dos últimos 3 meses</button></div>`;
    } else if (ui.aba === 'metas') {
      corpo = `${S.metas.length ? `<div class="cartao">${S.metas.map(m => {
        const p = m.alvo ? m.atual / m.alvo * 100 : 0, falta = Math.max(0, m.alvo - m.atual); let sub = falta ? `Faltam ${brl(falta)}` : 'Meta alcançada';
        if (falta && m.prazo) { const [y, mo] = m.prazo.split('-').map(Number), [cy, cm] = mesAtual().split('-').map(Number); const n = (y - cy) * 12 + (mo - cm) + 1; sub += n > 0 ? `. Guardando ${brl(falta / n)} por mês você chega lá em ${nomeMes(m.prazo)}` : '. O prazo já passou'; }
        return barra(`${esc(m.emoji || '🎯')} ${esc(m.nome)}`, `${brl0(m.atual)} de ${brl0(m.alvo)}`, p, sub, p >= 100 ? 'ok' : '', `data-a="meta" data-id="${m.id}"`);
      }).join('')}</div>` : `<p class="muted">Crie uma meta, como reserva de emergência ou uma viagem, e registre o que for guardando.</p>`}
      <div class="acoes"><button class="btn cheio" data-a="meta">Nova meta</button></div>`;
    } else {
      const lista = [...S.contas].sort((a, b) => a.dia - b.dia), total = lista.reduce((a, c) => a + c.valor, 0);
      corpo = `${lista.length ? `<p class="muted sm" style="margin-bottom:10px">${brl(total)} por mês em contas fixas e assinaturas, ${brl0(total * 12)} por ano.</p><div class="cartao">${lista.map(c => {
        const pg = contaPaga(c, mk);
        return `<div class="linha"><button class="bolha" data-a="conta" data-id="${c.id}" aria-label="Editar ${esc(c.desc)}">${cat(c.cat).emoji}</button><button class="meio" data-a="conta" data-id="${c.id}" style="text-align:left"><b>${esc(c.desc)}</b><span>Todo dia ${c.dia}, ${brl(c.valor)}</span></button>${pg ? `<span class="sm pos" style="font-weight:600">Paga</span>` : `<button class="btn sm sec" data-a="pagar" data-id="${c.id}">Pagar</button>`}</div>`;
      }).join('')}</div>` : `<p class="muted">Cadastre aluguel, internet, streaming e outras contas que se repetem. O Grana avisa perto do vencimento e desconta do que você pode gastar.</p>`}
      <div class="acoes"><button class="btn cheio" data-a="conta">Nova conta fixa</button></div>`;
    }
    return abas + corpo;
  },

  relatorios() {
    const mk = ui.mes, r = resumo(mk);
    if (!S.tx.length) return `<div class="vazio">${roseta()}<h2>Ainda sem dados</h2><p>Os gráficos aparecem assim que houver lançamentos.</p><div class="acoes"><button class="btn sec" data-a="demo">Ver com dados de exemplo</button></div></div>`;
    const cats = Object.entries(r.porCat).sort((a, b) => b[1] - a[1]);
    const an = S.analises[mk];
    return `
    <section class="bloco" style="margin-top:6px"><h2>Para onde foi o dinheiro</h2>
      ${cats.length ? `<div class="cartao pad"><div class="rosca">${rosca(cats, r.desp)}<div class="leg">${cats.slice(0, 6).map(([id, v]) => `<div><i style="background:${cat(id).cor}"></i><span>${cat(id).nome}</span><b>${Math.round(v / r.desp * 100)}%</b></div>`).join('')}</div></div></div>` : `<p class="muted">Sem despesas em ${nomeMes(mk)}.</p>`}
    </section>
    ${cats.length ? `<section class="bloco"><h2>Por categoria</h2><div class="cartao">${cats.map(([id, v]) => `<div class="linha"><span class="bolha">${cat(id).emoji}</span><span class="meio"><b>${cat(id).nome}</b><span>${(n => n + (n === 1 ? ' lançamento' : ' lançamentos'))(doMes(mk).filter(t => t.cat === id && t.tipo === 'despesa').length)}</span></span><span class="v">${brl(v)}</span></div>`).join('')}</div></section>` : ''}
    <section class="bloco"><h2>Ritmo de gastos</h2><div class="cartao pad">${linhaAcumulada(mk)}<div class="legenda"><span><i style="background:var(--neg)"></i>${nomeMes(mk, true)}</span><span><i style="background:var(--ink2);opacity:.45"></i>${nomeMes(somaMes(mk, -1), true)}</span></div></div></section>
    <section class="bloco"><h2>Últimos 6 meses</h2><div class="cartao pad">${barras6(mk)}<div class="legenda"><span><i style="background:var(--pos)"></i>Receitas</span><span><i style="background:var(--neg)"></i>Despesas</span></div></div></section>
    <section class="bloco"><h2>Análise do assistente</h2>
      ${an ? `<div class="cartao pad analise"><p>${esc(an.resumo)}</p>${an.pontos?.length ? `<ul>${an.pontos.map(p => `<li>${esc(p)}</li>`).join('')}</ul>` : ''}${an.sugestoes?.length ? `<p><b>O que fazer</b></p><ul>${an.sugestoes.map(p => `<li>${esc(p)}</li>`).join('')}</ul>` : ''}</div>` : `<p class="muted">O Gemini lê os números de ${nomeMes(mk)} e aponta onde dá para economizar.</p>`}
      <div class="acoes"><button class="btn ${an ? 'sec' : ''} cheio" data-a="analisar" ${ui.ocupado ? 'disabled' : ''}>${ui.ocupado ? 'Analisando' : an ? 'Analisar de novo' : 'Analisar este mês'}</button></div>
    </section>`;
  },

  ajustes() {
    const c = S.cfg;
    return `
    <section class="bloco" style="margin-top:6px"><h2>Assistente de voz</h2><div class="cartao pad">
      <p class="sm muted">A voz e as fotos são interpretadas pelo Gemini, do Google. Crie uma chave gratuita em <a class="link" href="https://aistudio.google.com/apikey" target="_blank" rel="noopener">aistudio.google.com/apikey</a> e cole aqui.</p>
      <form data-form="cfg">
        <label class="campo">Chave da API do Gemini<input name="chave" type="password" autocomplete="off" value="${esc(c.chave)}" placeholder="AIza..."></label>
        <label class="campo">Modelo<input name="modelo" list="modelos" value="${esc(c.modelo)}" autocomplete="off"></label><datalist id="modelos"></datalist>
        <div class="acoes"><button class="btn">Salvar chave</button><button type="button" class="btn sec" data-a="testar">Testar conexão</button></div>
      </form></div>
      <div class="cartao" style="margin-top:10px">
        <div class="ajuste"><div><b>Responder em voz alta</b><p>O assistente lê a resposta depois de anotar.</p></div><button class="troca ${c.falar ? 'on' : ''}" data-a="alternar" data-k="falar" role="switch" aria-checked="${c.falar}" aria-label="Responder em voz alta"></button></div>
        <div class="ajuste"><div><b>Tema escuro</b></div><button class="troca ${c.tema === 'escuro' ? 'on' : ''}" data-a="tema" role="switch" aria-checked="${c.tema === 'escuro'}" aria-label="Tema escuro"></button></div>
      </div>
    </section>
    <section class="bloco"><h2>Aplicativo</h2><div class="acoes" style="margin-top:0">
      ${aparelho().instalado ? '' : `<button class="btn cheio" data-a="comoInstalar">Instalar no ${aparelho().ios || aparelho().android ? aparelho().nome : 'aparelho'}</button>`}
      <button class="btn sec" data-a="exportar">Baixar backup</button><button class="btn sec" data-a="importar">Restaurar backup</button>
      <button class="btn sec cheio" data-a="csv">Exportar lançamentos para planilha (CSV)</button>
      <button class="btn sec" data-a="demo">Carregar dados de exemplo</button><button class="btn perigo" data-a="apagar">Apagar tudo</button>
    </div>
    <p class="sm muted" style="margin-top:14px">Seus lançamentos ficam guardados só neste aparelho. O áudio, as fotos e um resumo dos seus números são enviados ao Gemini apenas quando você usa o assistente.</p></section>`;
  },
};

const ordem = (a, b) => b.data.localeCompare(a.data) || (b.criado || 0) - (a.criado || 0);
function listaTx() {
  const q = ui.busca.trim().toLowerCase();
  const tx = doMes(ui.mes).filter(t => (ui.filtro === 'tudo' || t.tipo === ui.filtro) && (!q || t.desc.toLowerCase().includes(q) || cat(t.cat).nome.toLowerCase().includes(q))).sort(ordem);
  if (!tx.length) return `<p class="muted" style="padding:18px 2px">${q ? 'Nada encontrado para essa busca.' : 'Nenhum lançamento em ' + nomeMes(ui.mes) + '.'}</p>`;
  let html = '', dia = '', bloco = [];
  const fecha = () => { if (!bloco.length) return; const s = bloco.reduce((a, t) => a + (t.tipo === 'receita' ? t.valor : -t.valor), 0); html += `<div class="dia"><span>${nomeDia(dia)}</span><span>${s >= 0 ? '+' : '−'} ${brl(Math.abs(s))}</span></div><div class="cartao">${bloco.map(t => linhaTx(t)).join('')}</div>`; bloco = []; };
  for (const t of tx) { if (t.data !== dia) { fecha(); dia = t.data; } bloco.push(t); }
  fecha(); return html;
}

/* ---------- gráficos (SVG) ---------- */
function rosca(cats, total) {
  const R = 46, C = 2 * Math.PI * R; let acc = 0, seg = '';
  for (const [id, v] of cats) { const len = v / total * C; seg += `<circle r="${R}" cx="66" cy="66" fill="none" stroke="${cat(id).cor}" stroke-width="18" stroke-dasharray="${Math.max(0, len - 1.5).toFixed(2)} ${(C - len + 1.5).toFixed(2)}" stroke-dashoffset="${(-acc).toFixed(2)}" transform="rotate(-90 66 66)"/>`; acc += len; }
  return `<svg viewBox="0 0 132 132" role="img" aria-label="Despesas por categoria">${seg}<text x="66" y="62" text-anchor="middle" style="font:500 10px var(--body);fill:var(--ink2)">Saiu</text><text x="66" y="79" text-anchor="middle" style="font:700 15px var(--display);fill:var(--ink)">${brl0(total)}</text></svg>`;
}
function barras6(mk) {
  const ms = [-5, -4, -3, -2, -1, 0].map(n => somaMes(mk, n)), d = ms.map(m => resumo(m)), max = Math.max(1, ...d.map(x => Math.max(x.rec, x.desp)));
  const W = 320, H = 150, base = 126, g = W / 6; let s = '';
  d.forEach((x, i) => {
    const cx = g * i + g / 2, h1 = x.rec / max * 108, h2 = x.desp / max * 108;
    s += `<rect x="${cx - 15}" y="${base - h1}" width="13" height="${h1}" rx="3" fill="var(--pos)"/><rect x="${cx + 2}" y="${base - h2}" width="13" height="${h2}" rx="3" fill="var(--neg)"/><text x="${cx}" y="143" text-anchor="middle">${nomeMes(ms[i], true)}</text>`;
  });
  return `<svg class="graf" viewBox="0 0 ${W} ${H}" role="img" aria-label="Receitas e despesas dos últimos seis meses"><line x1="0" x2="${W}" y1="${base}" y2="${base}" stroke="var(--line)"/><text x="0" y="12">${brl0(max)}</text>${s}</svg>`;
}
function linhaAcumulada(mk) {
  const acum = (m, ate) => { const n = diasNoMes(m), a = new Array(n).fill(0); for (const t of doMes(m)) if (t.tipo === 'despesa') a[Number(t.data.slice(8)) - 1] += t.valor; let s = 0; return a.map(v => s += v).slice(0, ate || n); };
  const ant = acum(somaMes(mk, -1)), cur = acum(mk, mk === mesAtual() ? new Date().getDate() : 0);
  const max = Math.max(1, ...ant, ...cur), W = 320, H = 130, n = 31;
  const pts = a => a.map((v, i) => `${(i / (n - 1) * W).toFixed(1)},${(H - 16 - v / max * (H - 34)).toFixed(1)}`).join(' ');
  const fim = cur.length ? pts(cur).split(' ').pop().split(',') : null;
  return `<svg class="graf" viewBox="0 0 ${W} ${H}" role="img" aria-label="Despesas acumuladas no mês comparadas ao mês anterior"><text x="0" y="12">${brl0(max)}</text><line x1="0" x2="${W}" y1="${H - 16}" y2="${H - 16}" stroke="var(--line)"/><polyline points="${pts(ant)}" fill="none" stroke="var(--ink2)" stroke-opacity=".45" stroke-width="2" stroke-dasharray="4 4" stroke-linejoin="round"/><polyline points="${pts(cur)}" fill="none" stroke="var(--neg)" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"/>${fim ? `<circle cx="${fim[0]}" cy="${fim[1]}" r="4" fill="var(--neg)"/>` : ''}<text x="0" y="${H - 3}">dia 1</text><text x="${W}" y="${H - 3}" text-anchor="end">dia 31</text></svg>`;
}

/* ---------- renderização ---------- */
const TITULOS = { assistente: 'Assistente', planejar: 'Planejar', ajustes: 'Ajustes' };
function render() {
  const v = ui.view, comMes = ['inicio', 'lancamentos', 'relatorios'].includes(v);
  $('#top').innerHTML = `<span class="marca">${TITULOS[v] || 'Grana'}</span>${comMes ? `<div class="mes"><button class="ico" data-a="mes" data-d="-1" aria-label="Mês anterior">${I.ant}</button><span>${Mes(ui.mes)}</span><button class="ico" data-a="mes" data-d="1" aria-label="Próximo mês">${I.prox}</button></div>` : ''}<button class="ico ${comMes ? '' : 'so'}" data-a="go" data-v="ajustes" aria-label="Ajustes">${I.ajustes}</button>`;
  $('#view').innerHTML = (v === 'inicio' ? faixaInstalar() : '') + TELAS[v]();
  document.querySelectorAll('#nav > button[data-v]').forEach(b => b.classList.toggle('on', b.dataset.v === v));
  if (v === 'assistente') requestAnimationFrame(() => window.scrollTo(0, document.body.scrollHeight));
}
function go(v) { ui.view = v; render(); if (v !== 'assistente') window.scrollTo(0, 0); }
let tAviso;
function aviso(txt) { const t = $('#toast'); t.textContent = txt; t.classList.add('on'); clearTimeout(tAviso); tAviso = setTimeout(() => t.classList.remove('on'), 3200); }
function abrir(html) { $('.sheet-box').innerHTML = html; $('#sheet').hidden = false; const f = $('.sheet-box [autofocus]'); if (f) setTimeout(() => f.focus(), 60); }
function fechar() { $('#sheet').hidden = true; $('.sheet-box').innerHTML = ''; }

/* ---------- formulários ---------- */
function formTx(t) {
  const n = !t; t = t || { tipo: 'despesa', valor: 0, desc: '', cat: 'alimentacao', data: hojeISO(), forma: 'Pix' };
  const opts = tipo => catsDe(tipo).map(c => `<option value="${c.id}" ${c.id === t.cat ? 'selected' : ''}>${c.emoji} ${c.nome}</option>`).join('');
  abrir(`<h2>${n ? 'Novo lançamento' : 'Editar lançamento'}</h2>
  <form data-form="tx"><input type="hidden" name="id" value="${t.id || ''}"><input type="hidden" name="tipo" value="${t.tipo}">
    <div class="seg" style="margin-top:12px"><button type="button" class="${t.tipo === 'despesa' ? 'on' : ''}" data-a="tipoTx" data-t="despesa">Despesa</button><button type="button" class="${t.tipo === 'receita' ? 'on' : ''}" data-a="tipoTx" data-t="receita">Receita</button></div>
    <label class="campo">Valor (R$)<input class="grande" name="valor" inputmode="decimal" placeholder="0,00" value="${mostraValor(t.valor)}" required ${n ? 'autofocus' : ''}></label>
    <label class="campo">Descrição<input name="desc" maxlength="60" value="${esc(t.desc)}" placeholder="Ex.: almoço, gasolina" required></label>
    <div class="duas"><label class="campo">Categoria<select name="cat" data-d="${esc(opts('despesa'))}" data-r="${esc(opts('receita'))}">${opts(t.tipo)}</select></label>
    <label class="campo">Data<input name="data" type="date" value="${t.data}" required></label></div>
    <label class="campo">Forma de pagamento<select name="forma">${FORMAS.map(f => `<option ${f === t.forma ? 'selected' : ''}>${f}</option>`).join('')}</select></label>
    <div class="acoes"><button class="btn">${n ? 'Salvar lançamento' : 'Salvar alterações'}</button>${n ? '' : `<button type="button" class="btn perigo" data-a="excluirTx" data-id="${t.id}">Excluir</button>`}</div>
  </form>`);
}
function formOrc(id) {
  const c = cat(id), g = resumo(mesAtual()).porCat[id] || 0;
  abrir(`<h2>${c.emoji} Orçamento de ${c.nome}</h2><p class="muted sm">Gasto neste mês até agora: ${brl(g)}.</p>
  <form data-form="orc"><input type="hidden" name="id" value="${id}"><label class="campo">Limite por mês (R$)<input class="grande" name="lim" inputmode="decimal" placeholder="0,00" value="${mostraValor(S.orc[id] || 0)}" autofocus></label>
  <div class="acoes"><button class="btn">Salvar limite</button>${S.orc[id] ? `<button type="button" class="btn perigo" data-a="tirarOrc" data-id="${id}">Remover limite</button>` : ''}</div></form>`);
}
function formMeta(m) {
  const n = !m; m = m || { nome: '', alvo: 0, atual: 0, prazo: '', emoji: '🎯' };
  abrir(`<h2>${n ? 'Nova meta' : esc(m.nome)}</h2>
  <form data-form="meta"><input type="hidden" name="id" value="${m.id || ''}">
    <label class="campo">Nome<input name="nome" maxlength="40" value="${esc(m.nome)}" placeholder="Ex.: reserva de emergência" required ${n ? 'autofocus' : ''}></label>
    <div class="duas"><label class="campo">Quanto quer juntar (R$)<input name="alvo" inputmode="decimal" value="${mostraValor(m.alvo)}" required></label><label class="campo">Já guardado (R$)<input name="atual" inputmode="decimal" value="${mostraValor(m.atual)}"></label></div>
    <label class="campo">Até quando (opcional)<input name="prazo" type="month" value="${m.prazo || ''}"></label>
    ${n ? '' : `<label class="campo">Guardar mais agora (R$)<input name="aporte" inputmode="decimal" placeholder="0,00"></label>`}
    <div class="acoes"><button class="btn">${n ? 'Criar meta' : 'Salvar meta'}</button>${n ? '' : `<button type="button" class="btn perigo" data-a="excluirMeta" data-id="${m.id}">Excluir</button>`}</div>
  </form>`);
}
function formConta(c) {
  const n = !c; c = c || { desc: '', valor: 0, dia: 10, cat: 'contas' };
  abrir(`<h2>${n ? 'Nova conta fixa' : 'Editar conta fixa'}</h2>
  <form data-form="conta"><input type="hidden" name="id" value="${c.id || ''}">
    <label class="campo">Nome<input name="desc" maxlength="40" value="${esc(c.desc)}" placeholder="Ex.: aluguel, internet" required ${n ? 'autofocus' : ''}></label>
    <div class="duas"><label class="campo">Valor (R$)<input name="valor" inputmode="decimal" value="${mostraValor(c.valor)}" required></label><label class="campo">Dia do vencimento<input name="dia" type="number" min="1" max="31" value="${c.dia}" required></label></div>
    <label class="campo">Categoria<select name="cat">${catsDe('despesa').map(k => `<option value="${k.id}" ${k.id === c.cat ? 'selected' : ''}>${k.emoji} ${k.nome}</option>`).join('')}</select></label>
    <div class="acoes"><button class="btn">${n ? 'Criar conta fixa' : 'Salvar conta fixa'}</button>${n ? '' : `<button type="button" class="btn perigo" data-a="excluirConta" data-id="${c.id}">Excluir</button>`}</div>
  </form>`);
}

const FORMS = {
  tx(f) {
    const valor = lerValor(f.get('valor')); if (!(valor > 0)) return aviso('Informe um valor maior que zero.');
    const d = { tipo: f.get('tipo'), valor, desc: f.get('desc').trim(), cat: f.get('cat'), data: f.get('data'), forma: f.get('forma') };
    const id = f.get('id'); const t = S.tx.find(x => x.id === id);
    if (t) Object.assign(t, d); else S.tx.push({ id: uid(), ...d, origem: 'manual', criado: Date.now() });
    salvar(); fechar(); render(); aviso(t ? 'Alterações salvas' : 'Lançamento salvo');
  },
  orc(f) { const v = lerValor(f.get('lim')); if (v > 0) S.orc[f.get('id')] = v; else delete S.orc[f.get('id')]; salvar(); fechar(); render(); aviso('Limite salvo'); },
  meta(f) {
    const alvo = lerValor(f.get('alvo')); if (!(alvo > 0)) return aviso('Informe quanto quer juntar.');
    const d = { nome: f.get('nome').trim(), alvo, atual: lerValor(f.get('atual')) + lerValor(f.get('aporte')), prazo: f.get('prazo') || '' };
    const m = S.metas.find(x => x.id === f.get('id')); if (m) Object.assign(m, d); else S.metas.push({ id: uid(), emoji: '🎯', ...d });
    salvar(); fechar(); render(); aviso(m ? 'Meta salva' : 'Meta criada');
  },
  conta(f) {
    const valor = lerValor(f.get('valor')); if (!(valor > 0)) return aviso('Informe o valor da conta.');
    const d = { desc: f.get('desc').trim(), valor, dia: Math.min(31, Math.max(1, parseInt(f.get('dia')) || 1)), cat: f.get('cat') };
    const c = S.contas.find(x => x.id === f.get('id')); if (c) Object.assign(c, d); else S.contas.push({ id: uid(), pagos: {}, ...d });
    salvar(); fechar(); render(); aviso(c ? 'Conta fixa salva' : 'Conta fixa criada');
  },
  cfg(f) { S.cfg.chave = f.get('chave').trim(); S.cfg.modelo = f.get('modelo').trim() || MODELO_PADRAO; salvar(); aviso('Chave salva'); },
  pergunta(f, form) { const q = f.get('q').trim(); if (!q) return; form.reset(); perguntar({ texto: q }); },
};

/* ---------- ações ---------- */
let instalar = null;
const A = {
  go: d => go(d.v),
  mes: d => { ui.mes = somaMes(ui.mes, Number(d.d)); render(); },
  filtro: d => { ui.filtro = d.f; render(); },
  aba: d => { ui.aba = d.k; render(); },
  novo: () => formTx(),
  editar: d => { const t = S.tx.find(x => x.id === d.id); if (t) formTx(t); },
  tipoTx: (d, el) => { const f = el.closest('form'); f.tipo.value = d.t; el.parentNode.querySelectorAll('button').forEach(b => b.classList.toggle('on', b === el)); f.cat.innerHTML = d.t === 'despesa' ? f.cat.dataset.d : f.cat.dataset.r; },
  excluirTx: d => { S.tx = S.tx.filter(t => t.id !== d.id); salvar(); fechar(); render(); aviso('Lançamento excluído'); },
  orc: d => formOrc(d.id),
  tirarOrc: d => { delete S.orc[d.id]; salvar(); fechar(); render(); },
  sugerirOrc() {
    const mk = mesAtual(); let n = 0;
    for (const c of catsDe('despesa')) {
      if (S.orc[c.id] > 0) continue;
      const m = [-1, -2, -3].map(k => resumo(somaMes(mk, k)).porCat[c.id] || 0).filter(v => v > 0); if (!m.length) continue;
      S.orc[c.id] = Math.ceil(m.reduce((a, b) => a + b, 0) / m.length / 10) * 10; n++;
    }
    salvar(); render(); aviso(n ? `${n} limites sugeridos. Toque em um para ajustar.` : 'Faltam lançamentos dos meses anteriores para sugerir.');
  },
  meta: d => formMeta(S.metas.find(m => m.id === d.id)),
  excluirMeta: d => { S.metas = S.metas.filter(m => m.id !== d.id); salvar(); fechar(); render(); },
  conta: d => formConta(S.contas.find(c => c.id === d.id)),
  excluirConta: d => { S.contas = S.contas.filter(c => c.id !== d.id); salvar(); fechar(); render(); },
  pagar: d => {
    const c = S.contas.find(x => x.id === d.id); if (!c) return;
    const t = { id: uid(), tipo: 'despesa', valor: c.valor, desc: c.desc, cat: c.cat, data: hojeISO(), forma: 'Pix', origem: 'conta', criado: Date.now() };
    S.tx.push(t); c.pagos = c.pagos || {}; c.pagos[mesAtual()] = t.id; salvar(); render(); aviso(`${c.desc} paga e lançada`);
  },
  closeSheet: fechar,
  mic: () => rec.on ? pararGravacao(true) : iniciarGravacao(),
  recCancel: () => pararGravacao(false),
  foto: () => $('#pick-foto').click(),
  sugestao: (d, el) => perguntar({ texto: el.textContent }),
  desfazer: d => { const m = S.chat[Number(d.i)]; if (!m || !m.ids) return; S.tx = S.tx.filter(t => !m.ids.includes(t.id)); m.ids = []; m.txt = 'Desfeito. Nada foi lançado.'; salvar(); render(); },
  alternar: d => { S.cfg[d.k] = !S.cfg[d.k]; salvar(); render(); },
  tema: () => { S.cfg.tema = S.cfg.tema === 'escuro' ? 'claro' : 'escuro'; salvar(); aplicarTema(); render(); },
  async testar(d, el) {
    const f = el.closest('form'); S.cfg.chave = f.chave.value.trim(); S.cfg.modelo = f.modelo.value.trim() || MODELO_PADRAO; salvar();
    if (!S.cfg.chave) return aviso('Cole a chave primeiro.');
    el.disabled = true;
    try {
      const ms = await listarModelos(); $('#modelos').innerHTML = ms.map(m => `<option value="${esc(m)}">`).join('');
      if (!ms.includes(S.cfg.modelo)) { const m = melhorModelo(ms); if (m) { S.cfg.modelo = m; f.modelo.value = m; salvar(); } }
      aviso(`Conectado. Modelo em uso: ${S.cfg.modelo}`);
    } catch (e) { aviso(e.message); }
    el.disabled = false;
  },
  async instalar() { if (!instalar) return tutorialInstalar(); fechar(); instalar.prompt(); await instalar.userChoice; instalar = null; render(); },
  comoInstalar: () => tutorialInstalar(),
  instNao: () => { gravarInst('nao'); fechar(); render(); aviso('Tudo bem. O passo a passo continua em Ajustes.'); },
  async copiarLink() { try { await navigator.clipboard.writeText(location.origin + location.pathname); aviso('Link copiado'); } catch (e) { aviso(location.origin + location.pathname); } },
  exportar: () => baixar(`grana-backup-${hojeISO()}.json`, JSON.stringify({ ...S, cfg: { ...S.cfg, chave: '' } }, null, 1), 'application/json'),
  importar: () => $('#pick-backup').click(),
  csv() {
    const l = [['Data', 'Tipo', 'Valor', 'Descrição', 'Categoria', 'Forma de pagamento'], ...[...S.tx].sort(ordem).map(t => [t.data.split('-').reverse().join('/'), t.tipo, t.valor.toFixed(2).replace('.', ','), t.desc, cat(t.cat).nome, t.forma || ''])];
    baixar(`grana-lancamentos-${hojeISO()}.csv`, '\ufeff' + l.map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(';')).join('\r\n'), 'text/csv');
  },
  demo() { if (S.tx.length) return abrir(`<h2>Carregar dados de exemplo?</h2><p class="muted">Os lançamentos, orçamentos, metas e contas atuais serão substituídos.</p><div class="acoes"><button class="btn" data-a="demoOk">Substituir pelos dados de exemplo</button><button class="btn sec" data-a="closeSheet">Cancelar</button></div>`); A.demoOk(); },
  demoOk() { dadosDeExemplo(); salvar(); fechar(); ui.mes = mesAtual(); go('inicio'); aviso('Dados de exemplo carregados'); },
  apagar: () => abrir(`<h2>Apagar tudo?</h2><p class="muted">Todos os lançamentos, orçamentos, metas e contas fixas deste aparelho serão apagados. A chave do Gemini continua salva.</p><div class="acoes"><button class="btn perigo" data-a="apagarOk">Apagar tudo</button><button class="btn sec" data-a="closeSheet">Cancelar</button></div>`),
  apagarOk() { const cfg = S.cfg; S = vazio(); S.cfg = cfg; salvar(); fechar(); go('inicio'); aviso('Dados apagados'); },
  analisar,
};
function baixar(nome, conteudo, tipo) {
  const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([conteudo], { type: tipo })); a.download = nome; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}
function aplicarTema() { document.documentElement.dataset.tema = S.cfg.tema; const m = $('meta[name=theme-color]'); if (m) m.content = S.cfg.tema === 'escuro' ? '#0B191D' : '#EDF1EE'; }

/* ---------- Gemini ---------- */
class Falha extends Error { constructor(msg, acao) { super(msg); this.acao = acao; } }
async function chamar(caminho, corpo) {
  if (!navigator.onLine) throw new Falha('Sem internet. O assistente precisa de conexão; os lançamentos à mão continuam funcionando.');
  let r;
  try { r = await fetch(`${API}/${caminho}`, { method: corpo ? 'POST' : 'GET', headers: { 'x-goog-api-key': S.cfg.chave, ...(corpo ? { 'Content-Type': 'application/json' } : {}) }, body: corpo ? JSON.stringify(corpo) : undefined }); }
  catch (e) { throw new Falha('Não foi possível falar com o Gemini. Confira a internet e tente de novo.'); }
  if (r.ok) return r.json();
  let msg = ''; try { msg = (await r.json()).error?.message || ''; } catch (e) { /* sem corpo */ }
  if (r.status === 404) { const e = new Falha('Modelo não encontrado.'); e.status = 404; throw e; }
  if (r.status === 400 && /api key/i.test(msg) || r.status === 401 || r.status === 403) throw new Falha('A chave do Gemini não foi aceita. Confira a chave nos Ajustes.', 'Abrir Ajustes');
  if (r.status === 429) throw new Falha('O limite de uso da sua chave do Gemini foi atingido. Espere um minuto e tente de novo.');
  if (r.status >= 500) throw new Falha('O Gemini está indisponível agora. Tente de novo em instantes.');
  throw new Falha('O Gemini recusou o pedido: ' + (msg || 'erro ' + r.status));
}
async function listarModelos() {
  const j = await chamar('models?pageSize=200');
  return (j.models || []).filter(m => (m.supportedGenerationMethods || []).includes('generateContent')).map(m => m.name.replace('models/', '')).filter(n => /^gemini/.test(n) && !/image|tts|live|embedding|audio|robotics|computer/.test(n));
}
function melhorModelo(ms) {
  const nota = n => { const v = n.match(/^gemini-(\d+(?:\.\d+)?)-flash$/); return v ? parseFloat(v[1]) : n === 'gemini-flash-latest' ? .5 : -1; };
  return [...ms].sort((a, b) => nota(b) - nota(a)).find(n => nota(n) >= 0) || ms.find(n => /flash/.test(n)) || ms[0];
}
async function gemini(partes, esquema, sistema) {
  if (!S.cfg.chave) throw new Falha('Para usar a voz, conecte sua chave gratuita do Gemini.', 'Abrir Ajustes');
  const corpo = { systemInstruction: { parts: [{ text: sistema }] }, contents: [{ role: 'user', parts: partes }], generationConfig: { temperature: 0.2, responseMimeType: 'application/json', responseSchema: esquema } };
  let j;
  try { j = await chamar(`models/${encodeURIComponent(S.cfg.modelo || MODELO_PADRAO)}:generateContent`, corpo); }
  catch (e) {
    if (e.status !== 404) throw e;
    const m = melhorModelo(await listarModelos()); if (!m) throw new Falha('Sua chave não tem acesso a um modelo Gemini compatível.', 'Abrir Ajustes');
    S.cfg.modelo = m; salvar(); j = await chamar(`models/${encodeURIComponent(m)}:generateContent`, corpo);
  }
  const txt = (j.candidates?.[0]?.content?.parts || []).filter(p => !p.thought).map(p => p.text || '').join('');
  if (!txt) throw new Falha('O Gemini não devolveu resposta. Tente de novo.');
  try { return JSON.parse(txt.replace(/^```(?:json)?\s*|\s*```$/g, '')); } catch (e) { throw new Falha('Não entendi a resposta do Gemini. Tente de novo.'); }
}

const ESQUEMA = {
  type: 'OBJECT', required: ['transcricao', 'resposta', 'lancamentos'],
  properties: {
    transcricao: { type: 'STRING', description: 'O que o usuário disse ou escreveu, ou um resumo do cupom fotografado' },
    resposta: { type: 'STRING', description: 'Resposta curta em português do Brasil, para ser lida em voz alta' },
    lancamentos: {
      type: 'ARRAY', items: {
        type: 'OBJECT', required: ['tipo', 'valor', 'descricao', 'categoria', 'data'],
        properties: { tipo: { type: 'STRING', enum: ['despesa', 'receita'] }, valor: { type: 'NUMBER' }, descricao: { type: 'STRING' }, categoria: { type: 'STRING', enum: CATS.map(c => c.id) }, data: { type: 'STRING', description: 'AAAA-MM-DD' }, forma: { type: 'STRING', enum: FORMAS } },
      },
    },
    orcamentos: { type: 'ARRAY', items: { type: 'OBJECT', required: ['categoria', 'limite'], properties: { categoria: { type: 'STRING', enum: catsDe('despesa').map(c => c.id) }, limite: { type: 'NUMBER' } } } },
  },
};

function contexto() {
  const hoje = hojeISO(), mk = hoje.slice(0, 7), ant = somaMes(mk, -1), r = resumo(mk), ra = resumo(ant);
  const cats = o => Object.entries(o).sort((a, b) => b[1] - a[1]).map(([id, v]) => `${id} ${v.toFixed(2)}`).join('; ') || 'nada';
  return [
    `Hoje é ${new Date().toLocaleDateString('pt-BR', { weekday: 'long' })}, ${hoje}.`,
    `Mês atual (${mk}): receitas ${r.rec.toFixed(2)}, despesas ${r.desp.toFixed(2)}. Despesas por categoria: ${cats(r.porCat)}.`,
    `Mês anterior (${ant}): receitas ${ra.rec.toFixed(2)}, despesas ${ra.desp.toFixed(2)}. Despesas por categoria: ${cats(ra.porCat)}.`,
    `Orçamentos mensais: ${Object.entries(S.orc).map(([id, v]) => `${id} ${v}`).join('; ') || 'nenhum'}.`,
    `Metas: ${S.metas.map(m => `${m.nome} ${m.atual}/${m.alvo}`).join('; ') || 'nenhuma'}.`,
    `Contas fixas: ${S.contas.map(c => `${c.desc} ${c.valor} dia ${c.dia} (${contaPaga(c, mk) ? 'paga' : 'a pagar'})`).join('; ') || 'nenhuma'}.`,
    `Últimos lançamentos (data|tipo|valor|categoria|descrição):`,
    ...[...S.tx].sort(ordem).slice(0, 40).map(t => `${t.data}|${t.tipo}|${t.valor.toFixed(2)}|${t.cat}|${t.desc}`),
  ].join('\n');
}
const SISTEMA = () => `Você é o assistente do Grana, um aplicativo brasileiro de controle de gastos pessoais. O usuário fala, escreve ou fotografa um cupom fiscal.

O que fazer:
- Se ele relatar gastos ou ganhos, devolva cada um em "lancamentos". Uma fala pode conter vários. Valores em reais, como número (ex.: "trinta e dois e cinquenta" = 32.5, "dois mil" = 2000).
- Datas no formato AAAA-MM-DD. Sem data na fala, use hoje. Resolva "ontem", "sexta passada", "dia 5" a partir da data de hoje.
- "descricao" curta, com inicial maiúscula (ex.: "Almoço", "Uber", "Conta de luz").
- Categorias de despesa: ${catsDe('despesa').map(c => `${c.id} (${c.nome})`).join(', ')}. Categorias de receita: ${catsDe('receita').map(c => `${c.id} (${c.nome})`).join(', ')}. Comida pronta, restaurante e delivery são "alimentacao"; supermercado é "mercado".
- Preencha "forma" só se ele disser como pagou.
- Num cupom fiscal, crie um único lançamento com o total e o nome do estabelecimento, salvo se ele pedir item por item.
- Se pedir para definir ou mudar um limite de gastos, devolva em "orcamentos".
- Se for uma pergunta sobre as finanças dele, responda com os dados abaixo e deixe "lancamentos" vazio. Faça as contas com cuidado e não invente números que não estejam nos dados.
- Se não der para entender o áudio ou faltar o valor, deixe "lancamentos" vazio e peça para repetir.
- "resposta": uma ou duas frases, tom de conversa, sem markdown e sem emojis. Confirme o que anotou com valor e categoria, e acrescente um alerta só se for útil (por exemplo, orçamento estourando).
- "transcricao": o que ele disse, palavra por palavra.

Dados do usuário:
${contexto()}`;

function limparLanc(l) {
  const tipo = l.tipo === 'receita' ? 'receita' : 'despesa', valor = Math.round(Math.abs(Number(l.valor)) * 100) / 100;
  if (!(valor > 0)) return null;
  let c = CATS.find(x => x.id === l.categoria); if (!c || c.tipo !== tipo) c = cat(tipo === 'receita' ? 'outras-receitas' : 'outros');
  const data = /^\d{4}-\d{2}-\d{2}$/.test(l.data || '') && !isNaN(new Date(l.data)) ? l.data : hojeISO();
  return { id: uid(), tipo, valor, desc: String(l.descricao || c.nome).trim().slice(0, 60), cat: c.id, data, forma: FORMAS.includes(l.forma) ? l.forma : '' };
}

/* interpretação simples, usada só para texto digitado quando não há chave do Gemini */
function interpretarLocal(txt) {
  const m = txt.match(/(\d{1,3}(?:\.\d{3})+(?:,\d{1,2})?|\d+(?:[.,]\d{1,2})?)/); if (!m) return null;
  const t = txt.toLowerCase(), receita = /\b(recebi|ganhei|sal[aá]rio|entrou|vendi|pagaram)\b/.test(t);
  const mapa = receita ? [['salario', /sal[aá]rio/], ['vendas', /vend|servi|freela|cliente/], ['rendimentos', /rend|juros|dividendo/]] :
    [['mercado', /mercado|feira|a[cç]ougue|sacol[aã]o/], ['alimentacao', /almo|jant|lanch|pizza|restaurante|ifood|padaria|caf[eé]|marmita|comida/], ['transporte', /uber|99|gasolina|combust|[oô]nibus|metr[oô]|estaciona|ped[aá]gio/], ['moradia', /aluguel|condom[ií]nio|iptu/], ['contas', /luz|energia|[aá]gua|internet|g[aá]s|celular|telefone/], ['saude', /farm[aá]cia|rem[eé]dio|m[eé]dico|consulta|exame|dentista/], ['lazer', /cinema|bar|show|festa|viagem|jogo/], ['educacao', /curso|livro|escola|faculdade/], ['assinaturas', /netflix|spotify|assinatura|streaming/], ['compras', /roupa|sapato|t[eê]nis|loja|presente/]];
  const c = (mapa.find(([, re]) => re.test(t)) || [receita ? 'outras-receitas' : 'outros'])[0];
  const d = new Date(); if (/\bontem\b/.test(t)) d.setDate(d.getDate() - 1);
  const desc = txt.replace(m[0], '').replace(/\b(gastei|paguei|comprei|recebi|ganhei|reais|real|r\$|de|no|na|em|com|ontem|hoje)\b/gi, ' ').replace(/\s+/g, ' ').trim();
  return { tipo: receita ? 'receita' : 'despesa', valor: lerValor(m[0]), descricao: desc ? desc[0].toUpperCase() + desc.slice(1) : cat(c).nome, categoria: c, data: iso(d) };
}

async function perguntar({ texto, audio, imagem }) {
  if (ui.ocupado) return;
  const via = audio ? 'voz' : imagem ? 'foto' : 'texto';
  const eu = { de: 'eu', via, txt: texto || '' }, ia = { de: 'ia', pend: true };
  S.chat.push(eu, ia); ui.ocupado = true; $('#fab').classList.add('pensando'); go('assistente');
  try {
    let out;
    if (!S.cfg.chave && texto) {
      const l = interpretarLocal(texto);
      if (!l) throw new Falha('Sem o Gemini eu só entendo frases com valor, como “gastei 25 no almoço”. Para perguntas, voz e fotos, conecte sua chave gratuita.', 'Abrir Ajustes');
      out = { transcricao: texto, resposta: `Anotei ${brl(l.valor)} em ${cat(l.categoria).nome}. Com o Gemini conectado eu também entendo voz, fotos e perguntas.`, lancamentos: [l] };
    } else {
      const hist = S.chat.slice(-9, -2).filter(m => m.txt && !m.erro).map(m => `${m.de === 'eu' ? 'Usuário' : 'Assistente'}: ${m.txt}`).join('\n');
      const partes = [{ text: (hist ? `Conversa recente:\n${hist}\n\n` : '') + (audio ? 'Mensagem do usuário no áudio a seguir.' : imagem ? 'O usuário enviou a foto de um cupom fiscal ou comprovante. Registre a compra.' : `Mensagem do usuário: ${texto}`) }];
      if (audio) partes.push({ inlineData: { mimeType: audio.mime, data: audio.data } });
      if (imagem) partes.push({ inlineData: { mimeType: 'image/jpeg', data: imagem } });
      out = await gemini(partes, ESQUEMA, SISTEMA());
    }
    const novos = (out.lancamentos || []).map(limparLanc).filter(Boolean).map(t => ({ ...t, origem: via, criado: Date.now() }));
    S.tx.push(...novos);
    for (const o of out.orcamentos || []) if (catsDe('despesa').some(c => c.id === o.categoria) && o.limite > 0) S.orc[o.categoria] = Math.round(o.limite * 100) / 100;
    if (via !== 'texto' && out.transcricao) eu.txt = String(out.transcricao);
    Object.assign(ia, { pend: false, txt: String(out.resposta || (novos.length ? 'Anotado.' : 'Não consegui entender. Pode repetir?')), ids: novos.map(t => t.id) });
    if (novos.length) ui.mes = mesAtual();
    falar(ia.txt);
  } catch (e) {
    Object.assign(ia, { pend: false, erro: true, txt: e instanceof Falha ? e.message : 'Algo deu errado ao processar. Tente de novo.', acao: e.acao });
    if (!(e instanceof Falha)) console.error(e);
  }
  if (S.chat.length > 40) S.chat = S.chat.slice(-40);
  ui.ocupado = false; $('#fab').classList.remove('pensando'); salvar(); if (ui.view === 'assistente') render();
}

async function analisar() {
  if (ui.ocupado) return; const mk = ui.mes; ui.ocupado = true; render();
  try {
    const r = resumo(mk), ra = resumo(somaMes(mk, -1));
    const dados = `Mês analisado: ${nomeMes(mk)}. Receitas ${r.rec.toFixed(2)}, despesas ${r.desp.toFixed(2)}.\nPor categoria: ${Object.entries(r.porCat).map(([k, v]) => `${cat(k).nome} ${v.toFixed(2)}`).join('; ')}.\nMês anterior: receitas ${ra.rec.toFixed(2)}, despesas ${ra.desp.toFixed(2)}; por categoria: ${Object.entries(ra.porCat).map(([k, v]) => `${cat(k).nome} ${v.toFixed(2)}`).join('; ')}.\nOrçamentos: ${Object.entries(S.orc).map(([k, v]) => `${cat(k).nome} ${v}`).join('; ') || 'nenhum'}.\nContas fixas: ${S.contas.map(c => `${c.desc} ${c.valor}`).join('; ') || 'nenhuma'}.\nMetas: ${S.metas.map(m => `${m.nome} ${m.atual}/${m.alvo}`).join('; ') || 'nenhuma'}.\nLançamentos do mês:\n${doMes(mk).sort(ordem).slice(0, 150).map(t => `${t.data}|${t.tipo}|${t.valor.toFixed(2)}|${cat(t.cat).nome}|${t.desc}`).join('\n')}`;
    S.analises[mk] = await gemini([{ text: dados }], { type: 'OBJECT', required: ['resumo', 'pontos', 'sugestoes'], properties: { resumo: { type: 'STRING' }, pontos: { type: 'ARRAY', items: { type: 'STRING' } }, sugestoes: { type: 'ARRAY', items: { type: 'STRING' } } } },
      'Você é um planejador financeiro pessoal brasileiro. Analise os números do mês em português simples, sem jargão, sem markdown e sem emojis. "resumo": duas frases sobre como foi o mês. "pontos": até 4 observações concretas com valores em reais (o que subiu, o que pesa mais, gastos repetidos). "sugestoes": até 3 ações práticas e específicas, cada uma com o valor estimado de economia. Use apenas os dados recebidos; não invente números.');
    salvar();
  } catch (e) { aviso(e instanceof Falha ? e.message : 'Não foi possível analisar agora.'); if (e.acao) go('ajustes'); }
  ui.ocupado = false; if (ui.view === 'relatorios') render();
}

function falar(txt) {
  if (!S.cfg.falar || !('speechSynthesis' in window)) return;
  try { speechSynthesis.cancel(); const u = new SpeechSynthesisUtterance(txt); u.lang = 'pt-BR'; u.rate = 1.05; const v = speechSynthesis.getVoices().find(x => /pt[-_]BR/i.test(x.lang)); if (v) u.voice = v; speechSynthesis.speak(u); } catch (e) { /* sem voz neste aparelho */ }
}

/* ---------- gravação ---------- */
const rec = { on: false, mr: null, partes: [], stream: null, t0: 0, timer: 0, ctx: null, raf: 0, enviar: true };
async function iniciarGravacao() {
  if (ui.ocupado) return aviso('Aguarde a resposta anterior.');
  if (!S.cfg.chave) { go('assistente'); return aviso('Para falar, conecte sua chave do Gemini. Por enquanto, escreva o gasto.'); }
  if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) return aviso('Este navegador não grava áudio. Escreva o gasto no assistente.');
  try { rec.stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, channelCount: 1 } }); }
  catch (e) { return aviso('Permita o uso do microfone para falar com o assistente.'); }
  try { speechSynthesis.cancel(); } catch (e) { /* ok */ }
  const tipo = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus'].find(t => MediaRecorder.isTypeSupported(t));
  rec.mr = new MediaRecorder(rec.stream, tipo ? { mimeType: tipo, audioBitsPerSecond: 32000 } : undefined);
  rec.partes = []; rec.enviar = true; rec.on = true; rec.t0 = Date.now();
  rec.mr.ondataavailable = e => { if (e.data.size) rec.partes.push(e.data); };
  rec.mr.onstop = aoParar; rec.mr.start();
  $('#fab').classList.add('gravando'); $('#fab').setAttribute('aria-label', 'Enviar áudio'); $('#rec').hidden = false; $('#rec-time').textContent = '0:00';
  rec.timer = setInterval(() => { const s = Math.floor((Date.now() - rec.t0) / 1000); $('#rec-time').textContent = `${Math.floor(s / 60)}:${p2(s % 60)}`; if (s >= 60) pararGravacao(true); }, 250);
  try {
    rec.ctx = new (window.AudioContext || window.webkitAudioContext)(); const an = rec.ctx.createAnalyser(); an.fftSize = 256; rec.ctx.createMediaStreamSource(rec.stream).connect(an);
    const buf = new Uint8Array(an.fftSize), fab = $('#fab');
    const loop = () => { an.getByteTimeDomainData(buf); let m = 0; for (const b of buf) m = Math.max(m, Math.abs(b - 128)); fab.style.setProperty('--lvl', Math.min(1, m / 60).toFixed(2)); rec.raf = requestAnimationFrame(loop); }; loop();
  } catch (e) { /* medidor é opcional */ }
  if (ui.view !== 'assistente') go('assistente');
}
function pararGravacao(enviar) { if (!rec.on) return; rec.enviar = enviar; rec.on = false; try { rec.mr.stop(); } catch (e) { aoParar(); } }
async function aoParar() {
  clearInterval(rec.timer); cancelAnimationFrame(rec.raf); rec.stream?.getTracks().forEach(t => t.stop()); try { rec.ctx?.close(); } catch (e) { /* ok */ }
  $('#fab').classList.remove('gravando'); $('#fab').setAttribute('aria-label', 'Falar com o assistente'); $('#fab').style.removeProperty('--lvl'); $('#rec').hidden = true;
  if (!rec.enviar) return;
  const blob = new Blob(rec.partes, { type: rec.mr?.mimeType || 'audio/webm' });
  if (blob.size < 1500 || Date.now() - rec.t0 < 600) return aviso('Gravação curta demais. Toque, fale e toque de novo para enviar.');
  let mime = (blob.type || 'audio/webm').split(';')[0]; if (mime === 'audio/mp4' || mime === 'audio/x-m4a') mime = 'audio/m4a';
  perguntar({ audio: { mime, data: await base64(blob) } });
}
const base64 = blob => new Promise((ok, erro) => { const fr = new FileReader(); fr.onload = () => ok(String(fr.result).split(',')[1]); fr.onerror = erro; fr.readAsDataURL(blob); });
async function reduzirFoto(file) {
  const img = await new Promise((ok, erro) => { const i = new Image(); i.onload = () => ok(i); i.onerror = erro; i.src = URL.createObjectURL(file); });
  const k = Math.min(1, 1600 / Math.max(img.width, img.height)), c = document.createElement('canvas'); c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
  c.getContext('2d').drawImage(img, 0, 0, c.width, c.height); URL.revokeObjectURL(img.src);
  return c.toDataURL('image/jpeg', .85).split(',')[1];
}

/* ---------- dados de exemplo ---------- */
function dadosDeExemplo() {
  let seed = 42; const rnd = () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
  const um = a => a[Math.floor(rnd() * a.length)], hoje = hojeISO(), mk = mesAtual(), tx = [];
  const add = (data, tipo, valor, desc, c, forma = 'Pix') => { if (data <= hoje) tx.push({ id: uid(), tipo, valor: Math.round(valor * 100) / 100, desc, cat: c, data, forma, origem: 'manual', criado: tx.length }); };
  for (let k = -5; k <= 0; k++) {
    const m = somaMes(mk, k), d = n => `${m}-${p2(Math.min(n, diasNoMes(m)))}`, dr = () => d(1 + Math.floor(rnd() * 28));
    add(d(5), 'receita', 3400, 'Salário', 'salario'); if (rnd() > .35) add(d(18), 'receita', 300 + Math.round(rnd() * 8) * 100, 'Serviço avulso', 'vendas');
    add(d(10), 'despesa', 1150, 'Aluguel', 'moradia'); add(d(12), 'despesa', 138 + rnd() * 45, 'Conta de luz', 'contas', 'Boleto'); add(d(15), 'despesa', 99.9, 'Internet', 'contas', 'Boleto');
    add(d(8), 'despesa', 39.9, 'Streaming de filmes', 'assinaturas', 'Crédito'); add(d(20), 'despesa', 21.9, 'Streaming de música', 'assinaturas', 'Crédito'); add(d(7), 'despesa', 89.9, 'Curso online', 'educacao', 'Crédito');
    for (const dia of [3, 9, 16, 23, 28]) add(d(dia), 'despesa', 150 + rnd() * 130, 'Compra no mercado', 'mercado', 'Débito');
    for (let i = 0; i < 9 + (k === 0 ? 3 : 0); i++) add(dr(), 'despesa', 18 + rnd() * 42, um(['Almoço', 'Lanche', 'Pizza', 'Padaria', 'Marmita', 'Delivery']), 'alimentacao', um(['Pix', 'Crédito', 'Débito']));
    for (let i = 0; i < 6; i++) add(dr(), 'despesa', 12 + rnd() * 60, um(['Corrida de app', 'Gasolina', 'Ônibus']), 'transporte');
    for (let i = 0; i < 3; i++) add(dr(), 'despesa', 35 + rnd() * 90, um(['Cinema', 'Bar com amigos', 'Show']), 'lazer', 'Crédito');
    for (let i = 0; i < 2; i++) add(dr(), 'despesa', 60 + rnd() * 180, um(['Roupas', 'Presente', 'Loja online']), 'compras', 'Crédito');
    add(dr(), 'despesa', 25 + rnd() * 70, 'Farmácia', 'saude');
  }
  const contas = [['Aluguel', 1150, 10, 'moradia'], ['Conta de luz', 160, 12, 'contas'], ['Internet', 99.9, 15, 'contas'], ['Streaming de filmes', 39.9, 8, 'assinaturas'], ['Streaming de música', 21.9, 20, 'assinaturas']].map(([desc, valor, dia, c]) => { const pg = tx.find(t => t.desc === desc && t.data.startsWith(mk)); return { id: uid(), desc, valor, dia, cat: c, pagos: pg ? { [mk]: pg.id } : {} }; });
  S = { ...vazio(), cfg: S.cfg, tx, contas, orc: { alimentacao: 450, mercado: 1100, transporte: 300, lazer: 250, compras: 350 }, metas: [{ id: uid(), nome: 'Reserva de emergência', alvo: 10000, atual: 3200, prazo: '', emoji: '🛟' }, { id: uid(), nome: 'Notebook novo', alvo: 4500, atual: 1350, prazo: somaMes(mk, 6), emoji: '💻' }] };
}

/* ---------- instalação: identifica o aparelho e mostra o passo a passo certo ---------- */
const CHAVE_INST = 'grana.instalar';   // '' nunca viu, 'visto' já viu o tutorial, 'nao' pediu para não mostrar
const lerInst = () => { try { return localStorage.getItem(CHAVE_INST) || ''; } catch (e) { return ''; } };
const gravarInst = v => { try { localStorage.setItem(CHAVE_INST, v); } catch (e) { } };
function aparelho(ua = navigator.userAgent || '') {
  const ipad = /iPad/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const iphone = /iPhone|iPod/.test(ua), ios = iphone || ipad, android = /Android/.test(ua);
  const instalado = navigator.standalone === true || matchMedia('(display-mode: standalone)').matches;
  const embutido = /Instagram|FBAN|FBAV|FB_IAB|LinkedInApp|TikTok|musical_ly|BytedanceWebview|Line\/|MicroMessenger|Snapchat|Twitter|Pinterest|GSA\//.test(ua);
  let nav = 'outro';
  if (ios) nav = /CriOS/.test(ua) ? 'Chrome' : /FxiOS/.test(ua) ? 'Firefox' : /EdgiOS/.test(ua) ? 'Edge' : /OPiOS|OPT\//.test(ua) ? 'Opera' : 'Safari';
  else if (android) nav = /SamsungBrowser/.test(ua) ? 'Samsung Internet' : /Firefox/.test(ua) ? 'Firefox' : /EdgA/.test(ua) ? 'Edge' : /OPR\//.test(ua) ? 'Opera' : 'Chrome';
  // O Safari novo congela o "OS 18_x" no user agent; o número real vem em "Version/".
  const v = Number((ua.match(/Version\/(\d+)/) || ua.match(/OS (\d+)_/) || [])[1]) || 0;
  return { ios, iphone, ipad, android, instalado, embutido, nav, versao: ios ? v : 0, nome: iphone ? 'iPhone' : ipad ? 'iPad' : android ? 'Android' : 'computador' };
}
const IC = {
  share: '<svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 15V3M8 7l4-4 4 4M6 11H5a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-8a1 1 0 0 0-1-1h-1"/></svg>',
  mais: '<svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="4" width="16" height="16" rx="4"/><path d="M12 8.5v7M8.5 12h7"/></svg>',
};
function passosInstalar(ap) {
  const add = `Role a lista e toque em <b>Adicionar à Tela de Início</b> ${IC.mais}`;
  if (ap.embutido) return [`Este link abriu dentro de outro aplicativo, que não deixa instalar. Toque no menu <b>•••</b> e escolha <b>Abrir no ${ap.ios ? 'Safari' : 'Chrome'}</b>.`, `Se não houver essa opção, copie o link abaixo e cole no ${ap.ios ? 'Safari' : 'Chrome'}.`, 'Lá o Grana mostra de novo este passo a passo.'];
  if (ap.ios) {
    const fim = [add, ap.versao >= 26 ? 'Deixe ligada a opção de abrir como app e toque em <b>Adicionar</b>, no canto de cima.' : 'Toque em <b>Adicionar</b>, no canto de cima.'];
    if (ap.nav === 'Safari') return [ap.versao >= 26
      ? `Toque em <b>•••</b> na barra do Safari e depois em <b>Compartilhar</b> ${IC.share}<small>Se o ícone Compartilhar já aparece na barra, toque direto nele.</small>`
      : `Toque em <b>Compartilhar</b> ${IC.share} na barra do Safari${ap.ipad ? ', no alto da tela' : ', embaixo da tela'}.<small>Não achou? Toque em ••• e depois em Compartilhar.</small>`, ...fim];
    if (ap.nav === 'Chrome') return [`Toque em <b>Compartilhar</b> ${IC.share}, na ponta direita da barra de endereço do Chrome.`, ...fim];
    return [`Abra o menu do ${ap.nav} e toque em <b>Compartilhar</b> ${IC.share}<small>Se não encontrar, copie o link abaixo e abra no Safari.</small>`, ...fim];
  }
  if (ap.android) return [`Toque no menu <b>${ap.nav === 'Samsung Internet' ? '☰' : '⋮'}</b> do ${ap.nav}.`, 'Toque em <b>Instalar app</b> ou <b>Adicionar à tela inicial</b>.', 'Confirme em <b>Instalar</b>.'];
  return ['Para instalar no celular, abra este mesmo link no iPhone ou no Android. O Grana mostra o passo a passo do seu aparelho.', 'No computador, o Chrome e o Edge mostram um ícone de instalar na ponta direita da barra de endereço.'];
}
function tutorialInstalar() {
  const ap = aparelho();
  if (ap.instalado) return aviso('O Grana já está instalado neste aparelho.');
  const movel = ap.ios || ap.android, direto = !!instalar && !ap.embutido;
  const rotulo = (ap.embutido ? [ap.nome, 'aberto dentro de outro app'] : [ap.nome, movel && ap.nav !== 'outro' ? ap.nav : '', ap.nav === 'Safari' && ap.versao ? 'iOS ' + ap.versao : '']).filter(Boolean).join(' · ');
  abrir(`<span class="inst-chip">Detectamos: ${esc(rotulo)}</span>
  <h2>${movel ? `Instale o Grana no seu ${ap.nome}` : 'Instale o Grana'}</h2>
  <p class="muted">${direto ? 'Um toque e ele fica na tela inicial, abre em tela cheia e funciona sem internet.' : 'Leva 10 segundos, não passa pela loja de aplicativos e ele abre em tela cheia, como qualquer app.'}</p>
  ${direto ? '' : `<ol class="passos">${passosInstalar(ap).map(p => `<li><div>${p}</div></li>`).join('')}</ol>${movel && !ap.embutido ? `<p class="sm muted">Pronto: o ícone do Grana aparece na tela de início.</p>` : ''}`}
  <div class="acoes">${direto ? `<button class="btn" data-a="instalar">Instalar agora</button>` : ''}${ap.embutido || !movel || (ap.ios && !['Safari', 'Chrome'].includes(ap.nav)) ? `<button class="btn" data-a="copiarLink">Copiar link</button>` : ''}<button class="btn sec" data-a="closeSheet">${direto ? 'Agora não' : 'Entendi'}</button></div>
  ${movel ? `<p class="sm" style="margin-top:12px;text-align:center"><button class="link" data-a="instNao">Não mostrar de novo</button></p>` : ''}`);
  if (!lerInst()) gravarInst('visto');
}
function faixaInstalar() {
  const ap = aparelho();
  if (ap.instalado || !(ap.ios || ap.android) || lerInst() === 'nao') return '';
  return `<button class="faixa-inst" data-a="comoInstalar"><span>${IC.mais}</span><span><b>Instale o Grana no seu ${ap.nome}</b><small>Veja o passo a passo para o ${ap.embutido ? 'seu aparelho' : ap.nav}</small></span><span class="seta">›</span></button>`;
}
/* abre sozinho na primeira visita pelo celular */
function oferecerInstalacao() {
  const ap = aparelho();
  if (ap.instalado || lerInst() || !$('#sheet').hidden || !(ap.ios || ap.android)) return;
  tutorialInstalar();
}

/* ---------- eventos ---------- */
document.addEventListener('click', e => {
  const el = e.target.closest('[data-a]'); if (!el) return;
  const f = A[el.dataset.a]; if (f) f(el.dataset, el);
});
document.addEventListener('submit', e => { const form = e.target.closest('[data-form]'); if (!form) return; e.preventDefault(); FORMS[form.dataset.form](new FormData(form), form); });
document.addEventListener('input', e => { if (e.target.id === 'busca') { ui.busca = e.target.value; $('#lista').innerHTML = listaTx(); } });
document.addEventListener('keydown', e => { if (e.key === 'Escape' && !$('#sheet').hidden) fechar(); });
$('#pick-foto').addEventListener('change', async e => {
  const f = e.target.files[0]; e.target.value = ''; if (!f) return;
  if (!S.cfg.chave) { go('ajustes'); return aviso('Conecte sua chave do Gemini para ler cupons.'); }
  try { perguntar({ imagem: await reduzirFoto(f) }); } catch (err) { aviso('Não foi possível abrir essa foto.'); }
});
$('#pick-backup').addEventListener('change', async e => {
  const f = e.target.files[0]; e.target.value = ''; if (!f) return;
  try { const j = JSON.parse(await f.text()); if (!Array.isArray(j.tx)) throw 0; const chave = S.cfg.chave; S = { ...vazio(), ...j, cfg: { ...vazio().cfg, ...(j.cfg || {}), chave: j.cfg?.chave || chave } }; salvar(); aplicarTema(); go('inicio'); aviso('Backup restaurado'); }
  catch (err) { aviso('Esse arquivo não é um backup do Grana.'); }
});
window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); instalar = e; oferecerInstalacao(); });
window.addEventListener('appinstalled', () => { instalar = null; fechar(); render(); aviso('Grana instalado'); });

/* ---------- início ---------- */
carregar(); aplicarTema(); render();
if (location.hash === '#novo') formTx(); else if (location.hash === '#falar') go('assistente');
/* iPhone e iPad mostram o tutorial logo; o Android espera um instante pelo botão de instalar do próprio navegador */
setTimeout(oferecerInstalacao, aparelho().ios ? 700 : 3000);
if ('serviceWorker' in navigator && location.protocol !== 'file:') window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => { }));
