// Regras de pesca checadas na abordagem (R02 a R17; a R01 fica no semáforo, junto da lista).
// Fonte de cada regra: aba "Legislação" do documento do projeto. Indica, não autua.
(() => {

const LOCAIS = {
  tramandai: ['Lagoa Tramandaí', 'Laguna do Armazém', 'Outra lagoa da bacia', 'Rio, canal ou foz',
    'Canal da Barra e Boca da Barra (IN 17, art. 2º)', 'Sobre a ponte Giuseppe Garibaldi (art. 3º)', 'Lagoa Gentil (art. 4º)',
    'Canal de 200 m na Laguna do Armazém (art. 5º)', 'Faixa de 150 m das margens: Itapeva, Quadros, Pinguela, Malva, Palmital, Passo (art. 6º)',
    'Rio Cornélio, Lagoa Boa Vista ou áreas do art. 7º', 'Raio de 200 m da foz de rio ou canal (art. 9º)', 'Braço Morto do Imbé (art. 10)'],
  mar: ['Praia (desembarcado)', 'Embarcado até 1 milha da costa', 'Embarcado além de 1 milha', 'Barra ou desembocadura (fora de Tramandaí)'],
  outras: ['Lagoa ou rio', 'Barra ou desembocadura (fora de Tramandaí)'],
};

// Locais proibidos da IN 17/2004: artigo e petrechos tolerados (vazio = nenhum).
const PROIBIDOS = [
  ['Canal da Barra', 'art. 2º', () => false],
  ['Sobre a ponte', 'art. 3º', p => p.tipo === 'Linha e anzol'],
  ['Lagoa Gentil', 'art. 4º', p => p.tipo === 'Linha e anzol'],
  ['Canal de 200 m', 'art. 5º', () => false],
  ['Faixa de 150 m', 'art. 6º', p => p.tipo === 'Tarrafa' && p.malhaMm >= 60],
  ['Rio Cornélio', 'art. 7º', () => false],
  ['Raio de 200 m', 'art. 9º', () => false],
  ['Braço Morto', 'art. 10', p => p.tipo === 'Linha e anzol'],
];

// IN MMA 53/2005, comprimento total mínimo (cm), pelo nome usado no app.
const TAMANHO_MINIMO = { 'tainha': 35, 'anchova': 35, 'linguado': 35, 'corvina': 25, 'miraguaia': 65, 'pescada-olhuda': 30, 'pescadinha': 25,
  'papa-terra': 20, 'bagre-branco': 40, 'bagre': 20, 'peixe-rei': 10, 'parati': 20, 'robalo-peva': 30, 'robalo-flecha': 50 };

const CRIME_34 = 'Lei 9.605/98, art. 34; Dec. 6.514/2008, art. 35';
const CRIME_34_II = 'Lei 9.605/98, art. 34, p. ún., II; Dec. 6.514/2008, art. 35, p. ún., II';
const CRIME_34_I = 'Lei 9.605/98, art. 34, p. ún., I; Dec. 6.514/2008, art. 35, p. ún., I';

const chave = s => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
const mmdd = data => data.slice(5, 10);
const entre = (data, de, ate) => de <= ate ? mmdd(data) >= de && mmdd(data) <= ate : mmdd(data) >= de || mmdd(data) <= ate; // "MM-DD", vira o ano
const fmt = iso => iso.slice(0, 10).split('-').reverse().join('/');
const num = v => String(v).replace('.', ',');

function checar(ab, cfg = {}) {
  const out = [];
  const add = (regra, nivel, texto, norma, enquadramento, artigo = 35) => out.push({ regra, nivel, texto, norma, enquadramento, artigo });
  const pets = ab.petrechos || [], pes = ab.pescado || [];
  const de = tipo => pets.filter(p => p.tipo === tipo);
  const kg = pes.reduce((t, p) => t + (+p.kg || 0), 0);
  const especie = nome => pes.some(p => chave(p.especie).startsWith(nome));
  const local = ab.localTipo || '';
  const data = ab.data;

  if (ab.area === 'tramandai') {
    const naLagoa = local === 'Lagoa Tramandaí';
    for (const r of de('Rede de emalhe')) {
      if (naLagoa && ((r.malhaMm != null && r.malhaMm < 90) || r.comprimentoM > 500))
        add('R03', 'vermelho', `Rede de espera na Lagoa Tramandaí${r.malhaMm < 90 ? ` com malha ${r.malhaMm} mm (mínimo 90 mm)` : ''}${r.comprimentoM > 500 ? ` com ${r.comprimentoM} m (máximo 500 m por baliza)` : ''}.`, 'IN 17/2004, art. 17, §§3º e 5º', CRIME_34_II);
      else if (!naLagoa && r.malhaMm != null && r.malhaMm < 80)
        add('R02', 'vermelho', `Rede de espera com malha ${r.malhaMm} mm (mínimo 80 mm).`, 'IN 17/2004, art. 15', CRIME_34_II);
      if (local === 'Rio, canal ou foz') add('R04', 'vermelho', 'Rede de espera em rio, canal ou foz.', 'IN 17/2004, art. 11, IV', CRIME_34_II);
    }
    if (de('Rede de arrasto').length) add('R05', 'vermelho', 'Rede de arrasto na bacia.', 'IN 17/2004, art. 11, I', CRIME_34_II);
    for (const t of de('Tarrafa')) if (t.malhaMm != null && t.malhaMm < 60)
      add('R06', 'vermelho', `Tarrafa de peixe com malha ${t.malhaMm} mm (mínimo 60 mm).`, 'IN 17/2004, arts. 6º, 8º e 25', CRIME_34_II);
    const av = de('Aviãozinho');
    if (av.length) {
      const qtd = av.reduce((t, a) => t + (+a.qtd || 1), 0);
      const erros = [local !== 'Laguna do Armazém' && 'fora da Laguna do Armazém', av.some(a => a.malhaMm != null && a.malhaMm < 25) && 'malha abaixo de 25 mm',
        qtd > 10 && `${qtd} redes (máximo 10 por pescador)`].filter(Boolean);
      if (erros.length) add('R07', 'vermelho', `Aviãozinho: ${erros.join('; ')}.`, 'IN 17/2004, art. 18', CRIME_34_II);
    }
    if (especie('camarao') || av.length || de('Tarrafa de camarão').length) {
      const t = cfg.camarao;
      if (!t?.inicio || t.inicio.slice(0, 4) !== data.slice(0, 4))
        add('R08', 'amarelo', `Temporada do camarão de ${data.slice(0, 4)} não cadastrada em Dados: confira a portaria do ano.`, 'IN 17/2004, art. 20', CRIME_34);
      else if (data.slice(0, 10) < t.inicio || data.slice(0, 10) > t.fim)
        add('R08', 'vermelho', `Camarão fora da temporada (${fmt(t.inicio)} a ${fmt(t.fim)}).`, 'IN 17/2004, art. 20; portaria anual da temporada', CRIME_34);
    }
    if (especie('bagre') && entre(data, '12-15', '03-31'))
      add('R09', 'vermelho', 'Bagre no período proibido (15/12 a 31/03).', 'IN 17/2004, art. 14', CRIME_34);
    const proib = PROIBIDOS.find(([ini]) => local.startsWith(ini));
    if (proib && !pets.every(proib[2]))
      add('R10', 'vermelho', `Pesca em local proibido: ${local}.`, `IN 17/2004, ${proib[1]}`, CRIME_34);
  }

  if (ab.area === 'mar') {
    for (const p of pes) {
      const min = TAMANHO_MINIMO[chave(p.especie)];
      if (min && p.menorCm != null && p.menorCm < min)
        add('R11', 'amarelo', `${p.especie} com exemplar de ${num(p.menorCm)} cm (mínimo ${min} cm). Tolerância de 10% do peso (20% para as espécies do Anexo II): confira a proporção.`, 'IN MMA 53/2005, arts. 3º e 4º', CRIME_34_I);
    }
    for (const r of de('Rede de emalhe')) {
      const erros = [r.malhaMm != null && (r.malhaMm < 70 || r.malhaMm > 140) && `malha ${r.malhaMm} mm (70 a 140 mm)`,
        r.alturaM > 4 && `altura ${num(r.alturaM)} m (máximo 4 m)`, r.rgpTralha === 'Não' && 'sem RGP na tralha superior'].filter(Boolean);
      if (erros.length) add('R12', 'vermelho', `Rede de emalhe: ${erros.join('; ')}.`, 'IN Interministerial MPA/MMA 12/2012, arts. 2º e 3º', CRIME_34_II);
      if (ab.embarcacao === 'Motorizada' && local === 'Embarcado até 1 milha da costa')
        add('R13', 'vermelho', 'Emalhe por embarcação motorizada a menos de 1 milha da costa.', 'IN Interministerial MPA/MMA 12/2012, art. 6º', CRIME_34);
    }
    if (ab.embarcacao === 'Motorizada' && de('Rede de arrasto').length)
      add('R14', 'vermelho', 'Arrasto tracionado por embarcação motorizada na faixa de 12 milhas do RS.', 'Lei RS 15.223/2018', CRIME_34_II);
  }

  if (local === 'Barra ou desembocadura (fora de Tramandaí)' && entre(data, '03-15', '08-15') && pets.some(p => p.tipo !== 'Tarrafa'))
    add('R15', 'vermelho', 'Desembocadura de lagoa ou estuário de 15/03 a 15/08: só tarrafa.', 'IN IBAMA 171/2008, art. 2º', CRIME_34);

  if (ab.area === 'outras' && entre(data, '11-01', '01-31')) {
    if (pets.some(p => p.tipo !== 'Linha e anzol'))
      add('R16', 'vermelho', 'Piracema (1º/11 a 31/01): só anzol simples, um petrecho por pescador.', 'IN IBAMA 197/2008, art. 4º', CRIME_34);
    if (kg > 5) add('R16', 'vermelho', `Piracema: ${num(kg)} kg (máximo 5 kg por pescador).`, 'IN IBAMA 197/2008, art. 7º', CRIME_34);
  }

  if (ab.categoria === 'Amador') {
    const limite = ab.area === 'mar' ? 15 : 10;
    if (kg > limite) add('R17', 'vermelho', `Amador com ${num(kg)} kg (cota de ${limite} kg mais 1 exemplar): confira se o excedente é um único exemplar.`, 'IN MPA 05/2012; cartilha da pesca amadora do MPA', CRIME_34_II);
  }
  return out;
}

// Multa mínima de referência pelo peso: o artigo mais grave entre as irregularidades (Dec. 6.514/2008, arts. 35 e 37).
function multaReferencia(motivos, kg) {
  const arts = motivos.filter(m => m.nivel === 'vermelho' && m.artigo).map(m => m.artigo);
  if (!arts.length) return null;
  const artigo = arts.includes(35) ? 35 : 37;
  return { artigo, minimo: (artigo === 35 ? 700 : 300) + 20 * (+kg || 0) };
}

globalThis.Normas = { checar, multaReferencia, LOCAIS, TAMANHO_MINIMO };
})();
