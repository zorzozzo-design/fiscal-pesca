// Embarcações de pesca da lista do MPA (Painel Unificado do RGP): leitura do PDF ou da planilha, busca e fiscalizações.
// Script comum (sem módulos), como os demais.
(() => {

// Cabeçalho do MPA -> campo. Colunas sem campo (porão, tanque, frota, código IN, índice) só delimitam as vizinhas.
const CAMPOS = [['nome', /^nome da embarca/], ['rgp', /rgp/], ['marinha', /marinha/], ['ab', /^ab$/], ['comprimentoM', /^comprimento/],
  ['propulsao', /^propuls/], ['hp', /^hp$/], ['tripulacao', /^tripula/], ['covos', /covos/], ['status', /^status/], ['uf', /^uf$/],
  ['petrecho', /^petrecho/], ['ano', /^ano/]];
const NUM = new Set(['ab', 'comprimentoM', 'hp', 'tripulacao', 'covos', 'ano']);
const campoDe = t => (CAMPOS.find(([, re]) => re.test(t.trim().toLowerCase())) || [null])[0];
const ehCabecalho = s => /^nome da embarca/i.test(String(s).trim());

function registro(v) {
  const n = k => { const s = String(v[k] ?? '').trim().replace(',', '.'); return s === '' || isNaN(+s) ? null : +s; };
  // O Excel grava números longos em notação científica (4,43E+09): o número da Marinha se perde.
  const mar = String(v.marinha ?? '').trim(), perdida = /e\+/i.test(mar);
  const r = { nome: String(v.nome ?? '').replace(/\s+/g, ' ').trim(), rgp: String(v.rgp ?? '').trim().toUpperCase(), marinha: perdida ? '' : mar, marinhaPerdida: perdida };
  for (const k of ['ab', 'comprimentoM']) r[k] = n(k);
  r.propulsao = String(v.propulsao ?? '').trim();
  for (const k of ['hp', 'tripulacao', 'covos']) r[k] = n(k);
  Object.assign(r, { status: String(v.status ?? '').trim(), uf: String(v.uf ?? '').trim().toUpperCase(),
    petrecho: String(v.petrecho ?? '').replace(/^\d+\.\s*/, '').trim(), ano: n('ano') });
  return r;
}

function resultado(registros) {
  const perdidas = registros.filter(r => r.marinhaPerdida).length;
  return { registros, avisos: perdidas ? [`${perdidas} embarcações com o número da Marinha perdido na exportação (aparece como 4,43E+09). Busque pelo nome ou pelo RGP.`] : [] };
}

// PDF: itens do pdf.js {p, x, y, s}. Cada linha (página e altura) é uma embarcação; a coluna vem da posição do cabeçalho.
function lerFrotaPdf(itens) {
  const linhas = new Map();
  for (const it of itens) if (String(it.s).trim()) {
    const k = `${it.p}:${it.y}`;
    if (!linhas.has(k)) linhas.set(k, { p: it.p, y: it.y, itens: [] });
    linhas.get(k).itens.push(it);
  }
  const ordem = [...linhas.values()].sort((a, b) => a.p - b.p || b.y - a.y);
  let cols = null;
  const registros = [];
  for (const l of ordem) {
    if (l.itens.some(i => ehCabecalho(i.s))) { cols = l.itens.map(i => ({ x: i.x, campo: campoDe(i.s) })).sort((a, b) => a.x - b.x); continue; }
    if (!cols) continue;
    const v = {};
    for (const it of l.itens) {
      const c = cols.filter(c => c.x <= it.x + 2).pop();
      if (c?.campo) v[c.campo] = v[c.campo] ? `${v[c.campo]} ${it.s.trim()}` : it.s.trim();
    }
    if (v.nome || v.rgp) registros.push(registro(v));
  }
  if (!cols) throw new Error('Cabeçalho não encontrado. O PDF deve ser a lista de embarcações do MPA, com a coluna "Nome da Embarcação".');
  return resultado(registros);
}

// Planilha: matriz de textos (planilha.js), com o mesmo cabeçalho.
function lerFrotaPlanilha(linhas) {
  const iCab = linhas.findIndex(l => l.some(ehCabecalho));
  if (iCab < 0) throw new Error('Cabeçalho não encontrado. A planilha deve ter a coluna "Nome da Embarcação".');
  const col = {};
  linhas[iCab].forEach((c, i) => { const k = campoDe(String(c)); if (k && col[k] == null) col[k] = i; });
  const registros = linhas.slice(iCab + 1).map(l => Object.fromEntries(Object.entries(col).map(([k, i]) => [k, l[i]])))
    .filter(v => String(v.nome ?? '').trim() || String(v.rgp ?? '').trim()).map(registro);
  return resultado(registros);
}

// CSV exportado pelo Excel: UTF-8 ou Windows-1252 (Latin-1), separador ";" ou ",", campos entre aspas.
function textoDe(buf) {
  try { return new TextDecoder('utf-8', { fatal: true }).decode(buf).replace(/^\uFEFF/, ''); }
  catch { return new TextDecoder('windows-1252').decode(buf); }
}
function lerCsv(texto) {
  const sep = (texto.split(/\r?\n/)[0].match(/;/g) || []).length >= (texto.split(/\r?\n/)[0].match(/,/g) || []).length ? ';' : ',';
  const linhas = [];
  let l = [], c = '', aspas = false;
  for (let i = 0; i < texto.length; i++) {
    const ch = texto[i];
    if (aspas) { if (ch === '"' && texto[i + 1] === '"') { c += '"'; i++; } else if (ch === '"') aspas = false; else c += ch; }
    else if (ch === '"') aspas = true;
    else if (ch === sep) { l.push(c); c = ''; }
    else if (ch === '\n' || ch === '\r') { if (ch === '\r' && texto[i + 1] === '\n') i++; l.push(c); linhas.push(l); l = []; c = ''; }
    else c += ch;
  }
  if (c || l.length) { l.push(c); linhas.push(l); }
  return linhas;
}

// Mesmo RGP = mesma embarcação; a lista nova vale.
function mesclarFrota(lista, registros) {
  const res = { novos: 0, atualizados: 0 }, pos = new Map(lista.map((e, i) => [e.rgp, i]));
  for (const r of registros) {
    if (r.rgp && pos.has(r.rgp)) { lista[pos.get(r.rgp)] = r; res.atualizados++; }
    else { if (r.rgp) pos.set(r.rgp, lista.length); lista.push(r); res.novos++; }
  }
  return res;
}

const alnum = s => String(s ?? '').toUpperCase().replace(/[^0-9A-Z]/g, '');
const semAcento = s => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase();

function buscarFrota(lista, q) {
  const t = semAcento(q).trim(), a = alnum(q);
  if (!t) return lista;
  return lista.filter(e => semAcento(e.nome).includes(t) || (a.length >= 4 && (alnum(e.rgp).includes(a) || alnum(e.marinha).includes(a))));
}

// A lista do MPA muda: atualizar a cada 6 meses.
function lembreteFrota(ultima, hoje) {
  if (!ultima) return null;
  const dias = Math.round((Date.parse(hoje.slice(0, 10)) - Date.parse(ultima.slice(0, 10))) / 864e5);
  return dias > 182 ? `A lista de embarcações tem mais de 6 meses (${Math.floor(dias / 30)} meses). Baixe a lista nova no Painel Unificado do RGP (MPA) e importe em Dados.` : null;
}

// Abordagens em que a embarcação foi usada: a embarcação do cadastro da pessoa com o mesmo RGP ou a mesma inscrição na Marinha.
function fiscalizacoesDe(e, abordagens, pessoa) {
  const rgp = alnum(e.rgp), mar = alnum(e.marinha);
  const mesma = b => !!b && ((rgp && alnum(b.rgp) === rgp) || (mar && alnum(b.inscricao) === mar));
  return abordagens.filter(a => (a.envolvidos || []).some(en => mesma((pessoa(en.pescadorId)?.embarcacoes || []).find(b => b.id === en.embarcacaoId))))
    .sort((a, b) => b.data.localeCompare(a.data));
}

// Registro da lista do MPA para a embarcação do cadastro da pessoa (RGP com ou sem traços, ou inscrição na Marinha).
function registroDaEmbarcacao(lista, emb) {
  const rgp = alnum(emb?.rgp), mar = alnum(emb?.inscricao);
  if (!rgp && !mar) return null;
  return lista.find(e => (rgp && alnum(e.rgp) === rgp) || (mar && alnum(e.marinha) === mar)) || null;
}

// Autorização de pesca x TIE. Vale o TIE: embarcação alterada sem anuência do órgão perde a permissão (IN SEAP/PR 03/2004, art. 14).
const NORMA_RGP = 'Lei 11.959/2009, art. 24 (embarcação de pesca inscrita no RGP)';
const CONFERIR = [['comprimentoM', 'comprimento', ' m'], ['ab', 'AB', ''], ['hp', 'potência', ' HP'], ['ano', 'ano de construção', '']];
function conferirEmbarcacao(reg, tie = {}, emb = {}) {
  const ms = [], add = (nivel, texto, norma) => ms.push({ regra: 'R45', nivel, texto, norma, enquadramento: '', artigo: null });
  if (!reg) {
    if (emb?.rgp) add('amarelo', `RGP da embarcação ${emb.rgp} não está na lista do MPA importada: confira a autorização de pesca.`, NORMA_RGP);
    return ms;
  }
  if (reg.status === 'Cancelada' || reg.status === 'Suspensa')
    add('vermelho', `Autorização de pesca da embarcação ${reg.nome} ${reg.status.toLowerCase()} na lista do MPA.`, NORMA_RGP);
  const fmt = v => String(v).replace('.', ',');
  const difs = CONFERIR.filter(([k]) => tie?.[k] != null && tie[k] !== '' && reg[k] != null && Math.abs(+tie[k] - reg[k]) > 0.005)
    .map(([k, rot, un]) => `${rot} ${fmt(tie[k])}${un} no TIE e ${fmt(reg[k])}${un} na autorização`);
  if (difs.length) add('vermelho', `Embarcação diferente da autorização de pesca: ${difs.join('; ')}. Vale o TIE: a autorização fica sem efeito (embarcação alterada sem anuência).`,
    'IN SEAP/PR 03/2004, art. 14; ' + NORMA_RGP);
  return ms;
}

globalThis.Frota = { registroDaEmbarcacao, conferirEmbarcacao, textoDe, lerCsv, lerFrotaPdf, lerFrotaPlanilha, mesclarFrota, buscarFrota, lembreteFrota, fiscalizacoesDe };
})();
