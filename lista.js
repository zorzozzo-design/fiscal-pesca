// Leitura das listas de pescadores licenciados publicadas pelo MPA (PDF) e mescla na base local.
// Script comum (sem módulos) para funcionar também aberto direto do arquivo (file://).
(() => {

const normNome = s => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/\s+/g, ' ').trim();

// Os 6 dígitos visíveis do CPF (posições 4 a 9), em qualquer formato publicado pelo MPA ou digitado em campo.
function digitos(s) {
  const t = String(s ?? '').trim();
  // Máscaras vistas nas listas: ***123456**, XXX.123.456.XX, XXX.123.456-XX, XXX123456XX, XXX.123456.XX.
  const m = t.match(/(?:\*{3}|X{3})\.?(\d{3})\.?(\d{3})[.-]?(?:\*{2}|X{2})/i);
  if (m) return m[1] + m[2];
  if (/[a-z]/i.test(t)) return null; // RS-P0000000-0, "Protocolo" e outros textos
  const d = t.replace(/\D/g, '');
  if (d.length === 11) return d.slice(3, 9);
  if (d.length === 6) return d;
  return null;
}

// RGP em qualquer forma publicada, inclusive com erro de digitação do MPA (RSPO, RSP0, RS-PXXX.7544-7.XX).
const ehRgp = s => /^RS-?P[A-Z0-9]?[X*\d][X*\d.-]{4,}$/i.test(s) || /^protocolo$/i.test(s);
const ehCpfMasc = s => /^(\*{3}|X{3})\.?\d{3}\.?\d{3}[.-]?(\*{2}|X{2})$/i.test(s) || /^\d{3}\.?\*{6}-?\d{2}$/.test(s);

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
  prefixo: 'RGP com prefixo diferente de RSPA e RSPS',
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
      pendente = it.length === 1 && !ehRgp(it[0].s) ? { p: l.p, y: l.y, x: it[0].x, s: it[0].s } : null;
      continue;
    }
    const iId = it.findIndex((x, i) => i > 0 && (ehCpfMasc(x.s) || ehRgp(x.s)));
    const partes = it.slice(1, iId);
    // Só junta a linha logo acima (nome quebrado); o cabeçalho de página que repete um nome fica de fora.
    if (pendente && pendente.p === l.p && Math.abs(pendente.x - partes[0].x) <= 3 && pendente.y - l.y <= 20) partes.unshift(pendente);
    pendente = null;
    const cpf = ehCpfMasc(it[iId].s) ? it[iId].s : '';
    const rgp = it.at(-1).s;
    const nome = partes.map(x => x.s).join(' ').replace(/\s+/g, ' ').trim();
    brutos.push({ n: +it[0].s, nome, nomeNorm: normNome(nome), cpf, rgp, digitos: digitos(cpf) ?? digitos(rgp) });
  }

  const avisos = [], registros = [], vistos = new Map();
  const avisar = (tipo, r, extra = '') => avisos.push({ tipo, n: r.n, nome: r.nome, texto: AVISO_TXT[tipo] + extra });
  for (const r of brutos) {
    // RSPA e RSPS aparecem nas listas oficiais de licenciados; outro prefixo (RSPO, RSP0) é erro de digitação a conferir.
    if (/^RSP/i.test(r.rgp) && !/^RSP[AS]/i.test(r.rgp)) avisar('prefixo', r, `: ${r.rgp}`);
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

// Nome com partes trocadas por X (ex.: "FABIO XXXXX XXXXX"): com os mesmos dígitos, basta o primeiro nome conferir.
const mascarado = s => normNome(s).split(' ').some(t => /^X{2,}$/.test(t));
const mascaradoConfere = (a, b) => (mascarado(a) || mascarado(b)) && normNome(a).split(' ')[0] === normNome(b).split(' ')[0] && !/^X+$/.test(normNome(a).split(' ')[0]);

const slug = s => normNome(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

// Junta os registros de uma lista na base (objeto id -> pescador). Mesma pessoa = mesmos dígitos + nome parecido.
function mesclar(base, registros, { area, temporada, importacao }) {
  const res = { novos: 0, vinculados: 0, jaTinha: 0, alterados: [], revisar: [] }; // revisar: mesmos dígitos, nome diferente
  const porDig = new Map();
  for (const p of Object.values(base)) if (p.digitos) (porDig.get(p.digitos) || porDig.set(p.digitos, []).get(p.digitos)).push(p);
  const agora = new Date().toISOString();
  for (const r of registros) {
    const cands = r.digitos ? porDig.get(r.digitos) || [] : Object.values(base).filter(p => !p.digitos);
    let p = cands.find(c => c.nomeNorm === r.nomeNorm) || cands.find(c => parecido(c.nome, r.nome))
      || (r.digitos ? cands.find(c => mascaradoConfere(c.nome, r.nome)) : null);
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
    if (mascarado(p.nome) && !mascarado(r.nome)) { p.nome = r.nome; p.nomeNorm = r.nomeNorm; } // fica o nome completo
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

function cpfValido(s) {
  const d = String(s ?? '').replace(/\D/g, '');
  if (d.length !== 11 || /^(\d)\1{10}$/.test(d)) return false;
  const dv = n => { let soma = 0; for (let i = 0; i < n; i++) soma += +d[i] * (n + 1 - i); return (soma * 10 % 11) % 10; };
  return dv(9) === +d[9] && dv(10) === +d[10];
}

// Pessoa abordada em campo que não está em nenhuma lista. Se a lista importada depois trouxer a pessoa, mesclar() a reconhece.
function criar(base, { nome, cpf }) {
  const c = cpfValido(cpf) ? String(cpf).replace(/\D/g, '') : '';
  const dig = c ? c.slice(3, 9) : null;
  let id = `${dig || 'sem'}-${slug(nome)}`;
  while (base[id]) id += '-2';
  const agora = new Date().toISOString();
  return base[id] = { id, nome: normNome(nome), nomeNorm: normNome(nome), digitos: dig, cpf: c, rgp: '', licencas: [], consultas: [],
    origem: 'campo', obs: '', criadoEm: agora, atualizadoEm: agora };
}

// Texto da consulta pública do PesqBrasil, copiado da página (selecionar tudo e copiar) e colado no app.
function lerConsulta(texto) {
  const t = String(texto ?? '').replace(/\r/g, '');
  const campo = rotulo => (t.match(new RegExp(`^\\s*${rotulo}:[ \\t]*(.+?)\\s*$`, 'm')) || [])[1] || '';
  const situacao = campo('Situação do RGP');
  if (!situacao) return null;
  const rgp = (t.match(/RSP[A-Z]?\*{3}\d{6}\*{2}|[A-Z]{2}-P\d{7}-\d/) || [''])[0];
  const pri = campo('Data do 1º RGP').match(/(\d{2})\/(\d{2})\/(\d{4})/);
  const locais = [];
  const bloco = t.split(/Local de pesca\s+UF\s+Município/)[1] || '';
  const ls = bloco.split('\n').map(l => l.trim()).filter(Boolean);
  for (let i = 0; i + 1 < ls.length; i += 2) {
    const m = ls[i + 1].match(/^([A-Z]{2})\s+(.+)$/);
    if (!m) break;
    locais.push({ tipo: ls[i], uf: m[1], municipio: m[2] });
  }
  // Nome (o site mostra só o primeiro nome e a inicial): a linha antes do CPF mascarado sozinho.
  const ls0 = t.split('\n').map(l => l.trim());
  const iCpf = ls0.findIndex(l => /^\*{3}\d{6}\*{2}$/.test(l));
  const nome = iCpf > 0 ? (ls0.slice(0, iCpf).filter(l => l && !/^(Resultado|Imagem|CPF|Nº do RGP|Limpar|Consultar|Consulte)/.test(l)).at(-1) || '') : '';
  return { nome, digitos: digitos(t.match(/\*{3}\d{6}\*{2}/)?.[0]), rgp, situacao, tipoRegistro: campo('Tipo de registro'),
    uf: campo('UF do pescador\\(a\\)'), municipio: campo('Município do pescador\\(a\\)'), categoria: campo('Categoria'),
    formaAtuacao: campo('Forma de atuação'), produto: campo('Produto de pesca'), anoNascimento: campo('Ano de nascimento'),
    primeiroRgp: pri ? `${pri[3]}-${pri[2]}-${pri[1]}` : '', locais };
}

// Pessoas da base com os mesmos 6 dígitos da consulta; primeiro as cujo nome começa como o nome mostrado pelo site.
function identificar(ps, lido) {
  if (!lido?.digitos) return [];
  const n = normNome(lido.nome);
  return ps.filter(p => p.digitos === lido.digitos).map(p => ({ p, nomeConfere: !!n && p.nomeNorm.startsWith(n) }))
    .sort((a, b) => b.nomeConfere - a.nomeConfere || a.p.nomeNorm.localeCompare(b.p.nomeNorm));
}

// Listas de autorização especial (ex.: Automonitoramento da Prefeitura de Imbé): nome e CPF completo, sem número de ordem.
// O documento chama a coluna de "RGP", mas o conteúdo é o CPF.
const MINUSC = new Set(['de', 'da', 'do', 'das', 'dos', 'e']);
const titulo = t => t.toLowerCase().split(' ').map((w, i) => i && MINUSC.has(w) ? w : w[0].toUpperCase() + w.slice(1)).join(' ');
function lerAutorizacao(itens) {
  const out = { titulo: '', ano: '', categoria: '', orgao: '', registros: [], avisos: [] };
  const orgao = [], vistos = new Map();
  for (const l of linhas(itens)) {
    const t = l.itens.map(x => x.s).join(' ').replace(/\s+/g, ' ').trim();
    let m;
    if (/^(PREFEITURA|SECRETARIA) /i.test(t) && !orgao.includes(titulo(t))) { orgao.push(titulo(t)); continue; }
    if ((m = t.match(/autorizados no (.+?\b(\d{4}))$/i)) && !out.titulo) { out.titulo = m[1]; out.ano = m[2]; continue; }
    if ((m = t.match(/^Categoria (.+)$/i)) && !out.categoria) { out.categoria = m[1]; continue; }
    if (!(m = t.match(/^(\D+?)\s+(\d{3}\.?\d{3}\.?\d{3}-?\d{2})$/))) continue;
    const n = out.registros.length + 1, nome = normNome(m[1]), cpf = m[2].replace(/\D/g, '');
    const r = { n, nome, nomeNorm: nome, cpf, digitos: cpf.slice(3, 9) };
    if (!cpfValido(cpf)) { out.avisos.push({ n, nome, tipo: 'cpfInvalido', texto: `CPF ${m[2]} inválido: não gravado na ficha` }); r.cpf = ''; }
    else if (vistos.has(cpf)) { out.avisos.push({ n, nome, tipo: 'cpfRepetido', texto: `mesmo CPF do nº ${vistos.get(cpf)}: não gravado na ficha` }); r.cpf = ''; }
    else vistos.set(cpf, n);
    out.registros.push(r);
  }
  out.orgao = orgao.join(', ');
  return out;
}

// Junta a autorização na base: mesma pessoa pelo CPF completo ou pelos dígitos + nome. Quem não está na base é cadastrado.
function mesclarAutorizacao(base, registros, aut) {
  const res = { novos: 0, vinculados: 0, jaTinha: 0, alterados: [], revisar: [] };
  const agora = new Date().toISOString();
  for (const r of registros) {
    const ps = Object.values(base);
    const cands = ps.filter(p => p.digitos === r.digitos);
    const p = (r.cpf && ps.find(x => x.cpf === r.cpf)) || cands.find(c => c.nomeNorm === r.nomeNorm)
      || cands.find(c => parecido(c.nome, r.nome) || mascaradoConfere(c.nome, r.nome));
    const a = { ...aut, n: r.n };
    if (p) {
      if ((p.autorizacoes || []).some(x => x.id === aut.id)) { res.jaTinha++; continue; }
      (p.autorizacoes ||= []).push(a);
      if (!p.cpf && r.cpf) { p.cpf = r.cpf; p.digitos ||= r.digitos; }
      p.atualizadoEm = agora; res.vinculados++; res.alterados.push(p.id);
      continue;
    }
    if (cands.length) res.revisar.push({ nome: r.nome, n: r.n, digitos: r.digitos, outros: cands.map(c => c.nome) });
    let id = `${r.digitos || 'sem'}-${slug(r.nome)}`;
    while (base[id]) id += '-2';
    base[id] = { id, nome: r.nome, nomeNorm: r.nomeNorm, digitos: r.digitos, cpf: r.cpf, rgp: '', licencas: [], consultas: [], autorizacoes: [a],
      origem: 'autorizacao', obs: '', criadoEm: agora, atualizadoEm: agora };
    res.novos++; res.alterados.push(id);
  }
  return res;
}

// Busca por nome parcial (sem acento), dígitos do CPF, CPF completo ou RGP.
function buscar(ps, q) {
  const t = String(q ?? '').trim();
  if (!t) return ps;
  if ((t.match(/\d/g) || []).length >= 6) {
    const d = digitos(t) ?? digitos(t.replace(/\D/g, ''));
    const cpf = t.replace(/\D/g, '');
    return d ? ps.filter(p => p.digitos === d && !(cpf.length === 11 && p.cpf && p.cpf !== cpf)) : [];
  }
  const n = normNome(t);
  // também pela grafia de listas anteriores (ex.: LUIZ numa lista, LUIS na outra)
  return ps.filter(p => p.nomeNorm.includes(n) || (p.licencas || []).some(l => normNome(l.nomeLista).includes(n)));
}

globalThis.Lista = { lerAutorizacao, mesclarAutorizacao, normNome, digitos, linhas, ler, parecido, mesclar, temporadaAtual, situacao, buscar, cpfValido, criar, lerConsulta, identificar, AVISO_TXT };
})();
