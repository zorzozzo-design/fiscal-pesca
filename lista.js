// Leitura das listas de pescadores licenciados publicadas pelo MPA (PDF) e mescla na base local.
// Script comum (sem módulos) para funcionar também aberto direto do arquivo (file://).
(() => {

const normNome = s => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/\s+/g, ' ').trim();

// Os 6 dígitos visíveis do CPF (posições 4 a 9), em qualquer formato publicado pelo MPA ou digitado em campo.
function digitos(s) {
  const t = String(s ?? '').trim();
  let m = t.match(/\*{3}(\d{6})\*{2}/);
  if (m) return m[1];
  m = t.match(/X{3}\.(\d{3})\.(\d{3})\.X{2}/i);
  if (m) return m[1] + m[2];
  if (/[a-z]/i.test(t)) return null; // RS-P0000000-0, "Protocolo" e outros textos
  const d = t.replace(/\D/g, '');
  if (d.length === 11) return d.slice(3, 9);
  if (d.length === 6) return d;
  return null;
}

const ehRgp = s => /^RSP[A-Z]?(\*{3}\d{6}\*{2}|X{3}\.\d{3}\.\d{3}\.X{2})$/i.test(s) || /^[A-Z]{2}-P\d{7}-\d$/i.test(s) || /^protocolo$/i.test(s);
const ehCpfMasc = s => /^X{3}\.\d{3}\.\d{3}\.X{2}$/i.test(s);

// Agrupa os textos do pdf.js em linhas: por página, de cima para baixo, da esquerda para a direita.
function linhas(itens) {
  const out = [];
  const ord = itens.filter(i => String(i.s).trim()).slice().sort((a, b) => a.p - b.p || b.y - a.y || a.x - b.x);
  for (const it of ord) {
    const l = out.at(-1);
    if (l && l.p === it.p && Math.abs(l.y - it.y) <= 3) l.itens.push({ x: it.x, s: String(it.s).trim() });
    else out.push({ p: it.p, y: it.y, itens: [{ x: it.x, s: String(it.s).trim() }] });
  }
  for (const l of out) l.itens.sort((a, b) => a.x - b.x);
  return out;
}

const AVISO_TXT = {
  duplicado: 'nome e RGP repetidos na lista (mantido um registro)',
  colisao: 'mesmos dígitos de outra pessoa com nome diferente (mantidos os dois)',
  prefixo: 'RGP com prefixo diferente de RSPA',
  protocolo: 'RGP ainda em protocolo',
  formatoAntigo: 'RGP no formato antigo, sem dígitos de CPF',
  semDigitos: 'sem dígitos de CPF',
};

// Lê os itens de texto de uma lista do MPA (layout "Nº | NOME | RGP" ou "Nº | NOME | CPF | RGP").
function ler(itens) {
  const brutos = [];
  let pendente = null; // primeira parte de um nome quebrado em duas linhas, que fica sozinha acima do número
  for (const l of linhas(itens)) {
    const it = l.itens;
    const num = /^\d{1,4}$/.test(it[0].s) && it.length >= 3 && ehRgp(it.at(-1).s);
    if (!num) {
      pendente = it.length === 1 && !ehRgp(it[0].s) ? { p: l.p, x: it[0].x, s: it[0].s } : null;
      continue;
    }
    const iId = it.findIndex((x, i) => i > 0 && (ehCpfMasc(x.s) || ehRgp(x.s)));
    const partes = it.slice(1, iId);
    if (pendente && pendente.p === l.p && Math.abs(pendente.x - partes[0].x) <= 3) partes.unshift(pendente);
    pendente = null;
    const cpf = ehCpfMasc(it[iId].s) ? it[iId].s : '';
    const rgp = it.at(-1).s;
    const nome = partes.map(x => x.s).join(' ').replace(/\s+/g, ' ').trim();
    brutos.push({ n: +it[0].s, nome, nomeNorm: normNome(nome), cpf, rgp, digitos: digitos(cpf) ?? digitos(rgp) });
  }

  const avisos = [], registros = [], vistos = new Map();
  const avisar = (tipo, r, extra = '') => avisos.push({ tipo, n: r.n, nome: r.nome, texto: AVISO_TXT[tipo] + extra });
  for (const r of brutos) {
    if (/^RSP[A-Z]/i.test(r.rgp) && !/^RSPA/i.test(r.rgp)) avisar('prefixo', r, `: ${r.rgp}`);
    if (/^protocolo$/i.test(r.rgp)) avisar('protocolo', r);
    if (/^[A-Z]{2}-P/i.test(r.rgp)) avisar('formatoAntigo', r, `: ${r.rgp}`);
    if (!r.digitos) { avisar('semDigitos', r); registros.push(r); continue; }
    const mesmos = vistos.get(r.digitos) || [];
    const igual = mesmos.find(o => o.nomeNorm === r.nomeNorm);
    if (igual) { avisar('duplicado', r, ` (nº ${igual.n})`); continue; }
    if (mesmos.length) avisar('colisao', r, ` (nº ${mesmos[0].n}, ${mesmos[0].nome})`);
    mesmos.push(r);
    vistos.set(r.digitos, mesmos);
    registros.push(r);
  }
  return { linhas: brutos.length, registros, avisos };
}

// Mesma pessoa com grafia diferente entre listas (ex.: "DOS REIS LIMA" / "DOS REIS DE LIMA", "GLAPINSKI" / "GLAPINSLK").
const PARTICULAS = new Set(['DA', 'DE', 'DO', 'DAS', 'DOS', 'E']);
const tokens = s => normNome(s).split(' ').filter(t => t && !PARTICULAS.has(t));
function bigramas(s) { const b = []; for (let i = 0; i < s.length - 1; i++) b.push(s.slice(i, i + 2)); return b; }
function dice(a, b) {
  const ba = bigramas(a), bb = bigramas(b);
  if (!ba.length || !bb.length) return a === b ? 1 : 0;
  const resto = [...bb];
  let comum = 0;
  for (const x of ba) { const i = resto.indexOf(x); if (i >= 0) { comum++; resto.splice(i, 1); } }
  return 2 * comum / (ba.length + bb.length);
}
function parecido(a, b) {
  const ta = tokens(a), tb = tokens(b);
  if (!ta.length || !tb.length) return false;
  const d = dice(ta.join(' '), tb.join(' '));
  return ta[0] === tb[0] ? d >= 0.75 : d >= 0.85; // primeiro nome diferente só passa com o resto quase igual (LUIZ/LUIS)
}

const slug = s => normNome(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

// Junta os registros de uma lista na base (objeto id -> pescador). Mesma pessoa = mesmos dígitos + nome parecido.
function mesclar(base, registros, { area, temporada, importacao }) {
  const res = { novos: 0, vinculados: 0, jaTinha: 0, alterados: [], revisar: [] }; // revisar: mesmos dígitos, nome diferente
  const porDig = new Map();
  for (const p of Object.values(base)) if (p.digitos) (porDig.get(p.digitos) || porDig.set(p.digitos, []).get(p.digitos)).push(p);
  const agora = new Date().toISOString();
  for (const r of registros) {
    const cands = r.digitos ? porDig.get(r.digitos) || [] : Object.values(base).filter(p => !p.digitos);
    let p = cands.find(c => c.nomeNorm === r.nomeNorm) || cands.find(c => parecido(c.nome, r.nome));
    const lic = { area, temporada, n: r.n, nomeLista: r.nome, rgp: r.rgp, importacao };
    if (!p && r.digitos && cands.length) res.revisar.push({ nome: r.nome, n: r.n, digitos: r.digitos, outros: cands.map(c => c.nome) });
    if (!p) {
      let id = `${r.digitos || 'sem'}-${slug(r.nome)}`;
      while (base[id]) id += '-2';
      p = base[id] = { id, nome: r.nome, nomeNorm: r.nomeNorm, digitos: r.digitos, rgp: r.rgp, licencas: [lic], obs: '', criadoEm: agora, atualizadoEm: agora };
      if (r.digitos) (porDig.get(r.digitos) || porDig.set(r.digitos, []).get(r.digitos)).push(p);
      res.novos++; res.alterados.push(id);
      continue;
    }
    if (p.licencas.some(l => l.area === area && l.temporada === temporada)) { res.jaTinha++; continue; }
    p.licencas.push(lic);
    if (temporada === p.licencas.map(l => l.temporada).sort().at(-1)) p.rgp = r.rgp; // RGP da lista mais recente
    p.atualizadoEm = agora;
    res.vinculados++; res.alterados.push(p.id);
  }
  return res;
}

const temporadaAtual = (importacoes, area) => importacoes.filter(i => i.area === area).map(i => i.temporada).sort().at(-1) || null;

function situacao(p, area, atual) {
  const ls = p.licencas.filter(l => l.area === area);
  if (!ls.length) return 'nunca';
  return ls.some(l => l.temporada === atual) ? 'atual' : 'saiu';
}

// Busca por nome parcial (sem acento), dígitos do CPF, CPF completo ou RGP.
function buscar(ps, q) {
  const t = String(q ?? '').trim();
  if (!t) return ps;
  if ((t.match(/\d/g) || []).length >= 6) {
    const d = digitos(t) ?? digitos(t.replace(/\D/g, ''));
    return d ? ps.filter(p => p.digitos === d) : [];
  }
  const n = normNome(t);
  // também pela grafia de listas anteriores (ex.: LUIZ numa lista, LUIS na outra)
  return ps.filter(p => p.nomeNorm.includes(n) || (p.licencas || []).some(l => normNome(l.nomeLista).includes(n)));
}

globalThis.Lista = { normNome, digitos, linhas, ler, parecido, mesclar, temporadaAtual, situacao, buscar, AVISO_TXT };
})();
