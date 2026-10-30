// Leitura de planilha .xlsx sem biblioteca (zip + XML) e cadastro de estabelecimentos (peixarias).
// Script comum (sem módulos), como os demais. Usa DecompressionStream (navegador e Node 18+).
(() => {

const u16 = (v, o) => v.getUint16(o, true), u32 = (v, o) => v.getUint32(o, true);

// Arquivos do zip: nome -> texto. Só lê os XML que interessam.
async function lerZip(buf, quer) {
  const v = new DataView(buf), out = {};
  let fim = -1;
  for (let i = buf.byteLength - 22; i >= 0; i--) if (u32(v, i) === 0x06054b50) { fim = i; break; }
  if (fim < 0) throw new Error('Arquivo não é uma planilha .xlsx.');
  let o = u32(v, fim + 16);
  const total = u16(v, fim + 10);
  for (let k = 0; k < total; k++) {
    const metodo = u16(v, o + 10), tam = u32(v, o + 20), nl = u16(v, o + 28), el = u16(v, o + 30), cl = u16(v, o + 32), local = u32(v, o + 42);
    const nome = new TextDecoder().decode(new Uint8Array(buf, o + 46, nl));
    o += 46 + nl + el + cl;
    if (!quer(nome)) continue;
    const ini = local + 30 + u16(v, local + 26) + u16(v, local + 28);
    const dados = new Uint8Array(buf, ini, tam);
    const bytes = metodo === 0 ? dados
      : new Uint8Array(await new Response(new Blob([dados]).stream().pipeThrough(new DecompressionStream('deflate-raw'))).arrayBuffer());
    out[nome] = new TextDecoder().decode(bytes);
  }
  return out;
}

const xml = s => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'")
  .replace(/&#(\d+);/g, (m, n) => String.fromCodePoint(+n)).replace(/&#x([0-9a-f]+);/gi, (m, n) => String.fromCodePoint(parseInt(n, 16))).replace(/&amp;/g, '&');
const textos = s => [...s.matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)].map(m => xml(m[1])).join('');
const coluna = ref => [...ref.replace(/\d/g, '')].reduce((n, c) => n * 26 + c.charCodeAt(0) - 64, 0) - 1;

// Linhas da primeira planilha, como matriz de textos (células vazias = '').
async function lerXlsx(buf) {
  const z = await lerZip(buf, n => n === 'xl/sharedStrings.xml' || /^xl\/worksheets\/sheet\d+\.xml$/.test(n));
  const folha = Object.keys(z).filter(n => n.startsWith('xl/worksheets/')).sort((a, b) => parseInt(a.match(/\d+/)) - parseInt(b.match(/\d+/)))[0];
  if (!folha) throw new Error('Planilha sem dados.');
  const comp = [...(z['xl/sharedStrings.xml'] || '').matchAll(/<si>([\s\S]*?)<\/si>/g)].map(m => textos(m[1]));
  const linhas = [];
  for (const [, corpo] of z[folha].matchAll(/<row[^>]*>([\s\S]*?)<\/row>/g)) {
    const l = [];
    for (const [, attrs, dentro = ''] of corpo.matchAll(/<c\s([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const ref = (attrs.match(/r="([A-Z]+\d+)"/) || [])[1], t = (attrs.match(/t="(\w+)"/) || [])[1];
      const v = (dentro.match(/<v>([\s\S]*?)<\/v>/) || [])[1];
      const val = t === 's' ? comp[+v] ?? '' : t === 'inlineStr' ? textos(dentro) : v != null ? xml(v) : '';
      l[ref ? coluna(ref) : l.length] = val;
    }
    linhas.push(Array.from(l, x => x ?? ''));
  }
  return linhas;
}

function cnpjValido(s) {
  const d = String(s ?? '').replace(/\D/g, '');
  if (d.length !== 14 || /^(\d)\1{13}$/.test(d)) return false;
  const dv = n => { const p = n === 12 ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    const r = p.reduce((t, w, i) => t + +d[i] * w, 0) % 11; return r < 2 ? 0 : 11 - r; };
  return dv(12) === +d[12] && dv(13) === +d[13];
}

// Coluna pelo começo do cabeçalho; o texto do cabeçalho muda de planilha para planilha.
const CAMPOS = [['nome', /^(NOME DA EMPRESA|EMPRESA|ESTABELECIMENTO|RAZ[AÃ]O)/], ['doc', /^(CNPJ|CPF)/], ['endereco', /^ENDERE[CÇ]O/],
  ['telefone', /^(TELEFONE|FONE)/], ['responsavel', /^RESPONS[AÁ]VEL/], ['situacao', /^SITUA[CÇ][AÃ]O/], ['cidade', /^(CIDADE|MUNIC[IÍ]PIO)/]];
const statusDe = s => !s ? 'sem informação' : /aguard/i.test(s) ? 'aguardando' : /^autorizad/i.test(s.trim()) ? 'autorizada' : 'outra';

function lerEstabelecimentos(linhas) {
  const iCab = linhas.findIndex(l => l.some(c => /^NOME DA EMPRESA|^EMPRESA|^CNPJ/i.test(String(c).trim())));
  if (iCab < 0) throw new Error('Cabeçalho não encontrado. A planilha deve ter as colunas "Nome da empresa" e "CNPJ".');
  const col = {};
  linhas[iCab].forEach((c, i) => { const t = String(c).trim().toUpperCase(); const k = CAMPOS.find(([, re]) => re.test(t)); if (k && col[k[0]] == null) col[k[0]] = i; });
  const registros = [], avisos = [], vistos = new Map();
  linhas.slice(iCab + 1).forEach((l, j) => {
    const v = k => col[k] == null ? '' : String(l[col[k]] ?? '').replace(/\s+/g, ' ').trim();
    if (!v('nome') && !v('doc')) return;
    const linha = iCab + j + 2; // número da linha no Excel
    const doc = v('doc').replace(/\D/g, '');
    const tipoDoc = cnpjValido(doc) ? 'CNPJ' : globalThis.Lista?.cpfValido(doc) ? 'CPF' : '';
    const r = { linha, nome: v('nome'), doc, docTexto: v('doc'), tipoDoc, endereco: v('endereco'), telefone: v('telefone'),
      responsavel: v('responsavel'), situacao: v('situacao'), status: statusDe(v('situacao')), cidade: v('cidade') };
    if (doc && !tipoDoc) avisos.push({ linha, nome: r.nome, tipo: 'docInvalido', texto: `CNPJ/CPF ${r.docTexto} inválido` });
    if (tipoDoc && vistos.has(doc)) avisos.push({ linha, nome: r.nome, tipo: 'docRepetido', texto: `mesmo documento da linha ${vistos.get(doc)}` });
    // Chave para reimportar: o documento válido e único; senão, o nome.
    r.chave = tipoDoc && !vistos.has(doc) ? doc : 'N:' + (globalThis.Lista?.normNome(r.nome) || r.nome.toUpperCase());
    if (tipoDoc && !vistos.has(doc)) vistos.set(doc, linha);
    registros.push(r);
  });
  return { registros, avisos };
}

// Atualiza a lista de estabelecimentos: mesma chave = mesmo estabelecimento (a planilha nova vale).
function mesclarEstabelecimentos(lista, registros, importacao) {
  const res = { novos: 0, atualizados: 0 };
  const agora = new Date().toISOString();
  for (const r of registros) {
    const i = lista.findIndex(e => e.chave === r.chave);
    const e = { ...r, importacao, atualizadoEm: agora };
    if (i < 0) { lista.push({ id: 'e-' + r.chave.replace(/\W/g, '').toLowerCase() + '-' + lista.length, criadoEm: agora, ...e }); res.novos++; }
    else { lista[i] = { ...lista[i], ...e }; res.atualizados++; }
  }
  return res;
}

globalThis.Planilha = { lerXlsx, lerEstabelecimentos, mesclarEstabelecimentos, cnpjValido };
})();
