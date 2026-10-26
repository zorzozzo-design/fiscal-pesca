// Regras de pesca checadas na abordagem (R02 a R33; a R01 fica no semáforo, junto da lista).
// Fonte de cada regra: aba "Legislação" do documento do projeto. Indica, não autua.
(() => {

const LOCAIS = {
  tramandai: ['Lagoa Tramandaí', 'Laguna do Armazém', 'Outra lagoa da bacia', 'Rio, canal ou foz',
    'Canal da Barra e Boca da Barra (IN 17, art. 2º)', 'Sobre a ponte Giuseppe Garibaldi (art. 3º)', 'Lagoa Gentil (art. 4º)',
    'Canal de 200 m na Laguna do Armazém (art. 5º)', 'Faixa de 150 m das margens: Itapeva, Quadros, Pinguela, Malva, Palmital, Passo (art. 6º)',
    'Rio Cornélio, Lagoa Boa Vista ou áreas do art. 7º', 'Raio de 200 m da foz de rio ou canal (art. 9º)', 'Braço Morto do Imbé (art. 10)',
    'Sob a ponte Giuseppe Garibaldi, sentido oeste (art. 25, II)'],
  mar: ['Praia (desembarcado)', 'Embarcado até 1 milha da costa', 'Embarcado além de 1 milha', 'Barra ou desembocadura (fora de Tramandaí)'],
  outras: ['Lagoa ou rio', 'Reservatório de hidrelétrica ou açude público', 'Lagoa marginal', 'Até 200 m de barragem, cachoeira ou corredeira',
    'Entre 200 e 1.500 m de barragem, cachoeira ou corredeira', 'Barra ou desembocadura (fora de Tramandaí)'],
  uruguai: ['Lagoa ou rio', 'Reservatório de hidrelétrica ou açude público', 'Lagoa marginal', 'Até 200 m de barragem, cachoeira ou corredeira',
    'Entre 200 e 1.500 m de barragem, cachoeira ou corredeira', 'Até 500 m de confluência com o rio Uruguai', 'Trecho vedado na piracema (IN 193, art. 3º, V a VIII)'],
  mirim: ['Lagoa Mirim', 'Lagoa Mangueira', 'Canal São Gonçalo'],
  patos: ['Estuário', 'Barra ou desembocadura (fora de Tramandaí)'],
  peixe: ['Lagoa do Peixe', 'Barra ou desembocadura (fora de Tramandaí)'],
  mampituba: ['Barra do Mampituba até a Figueirinha'],
};

// INC 03/2004, art. 2º: meses em que cada espécie pode ser pescada no estuário da Lagoa dos Patos.
const CALENDARIO_PATOS = { 'tainha': [10, 11, 12, 1, 2, 3, 4, 5], 'corvina': [10, 11, 12, 1, 2], 'bagre': [10, 11, 3, 4, 5], 'camarao': [2, 3, 4, 5] };
const MESES = ['', 'jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

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

// Áreas da IN 17/2004 com coordenadas no texto oficial (graus, minutos, segundos -> decimal).
const dms = (g, m, s) => -(g + m / 60 + s / 3600);
const P = (la, lo) => [dms(...la), dms(...lo)];
const RODOVIARIA = P([29, 59, 10.9], [50, 8, 50.3]), CAPAO_GRANDE = P([29, 59, 10.5], [50, 9, 10.0]), CECLIMAR = P([29, 58, 25.5], [50, 8, 18.5]);
const metros = ([a, b], [c, d]) => 6371000 * 2 * Math.asin(Math.sqrt(Math.sin((c - a) * Math.PI / 360) ** 2 + Math.cos(a * Math.PI / 180) * Math.cos(c * Math.PI / 180) * Math.sin((d - b) * Math.PI / 360) ** 2));
// Distância do ponto ao segmento AB (aproximação plana, suficiente para centenas de metros).
const aoSegmento = (p, a, b) => {
  const k = Math.cos(a[0] * Math.PI / 180), ax = a[1] * k, bx = b[1] * k, px = p[1] * k;
  const t = Math.max(0, Math.min(1, ((px - ax) * (bx - ax) + (p[0] - a[0]) * (b[0] - a[0])) / ((bx - ax) ** 2 + (b[0] - a[0]) ** 2)));
  return metros(p, [a[0] + t * (b[0] - a[0]), (ax + t * (bx - ax)) / k]);
};
const noPoligono = (p, vs) => { let d = false; for (let i = 0, j = vs.length - 1; i < vs.length; j = i++) {
  const [yi, xi] = vs[i], [yj, xj] = vs[j]; if ((yi > p[0]) !== (yj > p[0]) && p[1] < (xj - xi) * (p[0] - yi) / (yj - yi) + xi) d = !d; } return d; };
const AREAS_IN17 = [
  // Art. 2º: canal e boca da barra; 3.000 m para o oceano, 2.000 m ao norte, 3.000 m ao sul. Aproximado por 3 km da divisa do CECLIMAR, do lado do mar.
  ['art. 2º', 'na área do canal e da boca da barra (aproximada)', (la, lo) => metros([la, lo], CECLIMAR) <= 3000 && lo > RODOVIARIA[1]],
  ['art. 5º', 'no canal de 200 m da Laguna do Armazém', (la, lo) => aoSegmento([la, lo], CAPAO_GRANDE, RODOVIARIA) <= 100],
  ['art. 7º, I', 'na área da Lagoa Boa Vista e margens do rio Cornélio', (la, lo) => noPoligono([la, lo],
    [P([29, 38, 51.7], [50, 2, 42.7]), P([29, 37, 47.0], [50, 1, 12.9]), P([29, 37, 22.6], [50, 1, 19.7]), P([29, 38, 27.0], [50, 2, 44.3])])],
  ['art. 7º, II', 'na foz do rio Cornélio na Lagoa Itapeva (Reserva dos Quirinos)', (la, lo) => noPoligono([la, lo],
    [P([29, 37, 50.4], [50, 1, 11.4]), P([29, 36, 17.2], [49, 59, 30.0]), P([29, 36, 35], [49, 58, 51.7]), P([29, 38, 46.5], [50, 0, 12.2])])],
  ['art. 7º, III', 'na área da Lagoa dos Quadros (Sanga Funda, coroa do peixe-rei, FEPAGRO)', (la, lo) => noPoligono([la, lo],
    [P([29, 38, 16.4], [50, 5, 15.7]), P([29, 39, 0.27], [50, 5, 30.9]), P([29, 38, 50.4], [50, 6, 32.0])])],
];

// IN MMA 53/2005, comprimento total mínimo (cm), pelo nome usado no app.
const TAMANHO_MINIMO = { 'tainha': 35, 'anchova': 35, 'linguado': 35, 'corvina': 25, 'miraguaia': 65, 'pescada-olhuda': 30, 'pescadinha': 25,
  'papa-terra': 20, 'bagre-branco': 40, 'bagre': 20, 'peixe-rei': 10, 'parati': 20, 'robalo-peva': 30, 'robalo-flecha': 50 };

// Espécies ameaçadas (Decreto RS 51.797/2014; Portaria MMA 445/2014; bagres: Portaria Interministerial SEAP/MMA 39/2018).
// Casadas pelo nome sem acento; o grupo de conferência pega nomes genéricos de grupos com espécies ameaçadas.
const AMEACADAS = [
  [/bagre-branco|barbus/, 'Genidens barbus'], [/planifrons/, 'Genidens planifrons'], [/miraguaia|pogonias/, 'Pogonias cromis'],
  [/garoupa-verdadeira|marginatus/, 'Epinephelus marginatus'], [/bicudo/, 'Odontesthes bicudo'],
  // Água doce. "Dourado" no mar é outro peixe (Coryphaena), por isso só fora do mar.
  [/^dourado|salminus/, 'Salminus brasiliensis', 'continental'], [/surubim|^pintado(?![- ]amarelo)|pseudoplatystoma/, 'Pseudoplatystoma corruscans', 'continental'],
  [/suruvi|steindachneridi/, 'Steindachneridion scriptum'], [/piracanjuba|bracanjuva|orbignyanus|salmao-crioulo/, 'Brycon orbignyanus'],
  [/cherne-poveiro|polyprion/, 'Polyprion americanus'], [/namorado|pseudopercis/, 'Pseudopercis semifasciata'],
  [/peixe-batata|lopholatilus/, 'Lopholatilus villarii'], [/peixe-folha|lobotes/, 'Lobotes surinamensis'],
];
// Só nas águas costeiras e estuarinas: nas bacias interiores "bagre" e "raia" são outras espécies.
const CONFERIR_ESPECIE = /^(bagre|garoupa|cacao|raia|viola|tubarao)/;
const NORMA_AMEACADAS = 'Lei RS 15.223/2018, art. 30, III; Decreto RS 51.797/2014; Portaria MMA 445/2014';

// Crime e infração administrativa separados. Art. 36 da Lei 9.605: pesca é todo ato tendente a retirar peixe (inclui a tentativa).
const CRIME_34 = 'Crime: Lei 9.605/98, art. 34 c/c art. 36 · Infração: Dec. 6.514/2008, art. 35';
const CRIME_34_II = 'Crime: Lei 9.605/98, art. 34, p. ún., II c/c art. 36 · Infração: Dec. 6.514/2008, art. 35, p. ún., II';
const CRIME_34_I = 'Crime: Lei 9.605/98, art. 34, p. ún., I c/c art. 36 · Infração: Dec. 6.514/2008, art. 35, p. ún., I';

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
    // Art. 25, II: tarrafa embarcada de 25 mm para sardinha e peixe-rei, sob a ponte, sentido oeste (só licenciados).
    const art25 = local.startsWith('Sob a ponte') && ab.embarcacao && ab.embarcacao !== 'Nenhuma' && pes.length
      && pes.every(p => /^(peixe-rei|sardinha)/.test(chave(p.especie)));
    for (const t of de('Tarrafa')) if (t.malhaMm != null && t.malhaMm < (art25 ? 25 : 60))
      add('R06', 'vermelho', `Tarrafa de peixe com malha ${t.malhaMm} mm (mínimo ${art25 ? '25 mm, art. 25, II' : '60 mm'}).`, 'IN 17/2004, arts. 6º, 8º e 25', CRIME_34_II);
    // R34: posição do GPS dentro das áreas georreferenciadas da IN 17 (indica para conferir; o GPS do celular erra alguns metros).
    if (ab.gps) for (const [art, texto, dentro] of AREAS_IN17) if (dentro(ab.gps.lat, ab.gps.lon))
      add('R34', 'amarelo', `Pelo GPS, o ponto fica ${texto}: confira se a pesca é permitida ali.`, `IN 17/2004, ${art}`, CRIME_34);
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
      const min = TAMANHO_MINIMO[chave(p.especie).split(' (')[0]];
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

  if (ab.area === 'patos') {
    const malhaMin = especie('bagre') ? 140 : pes.length && pes.every(p => chave(p.especie).startsWith('peixe-rei')) ? 40 : 100;
    for (const r of de('Rede de emalhe')) if (r.malhaMm != null && r.malhaMm < malhaMin)
      add('R18', 'vermelho', `Rede de espera com malha ${r.malhaMm} mm (mínimo ${malhaMin} mm${malhaMin === 140 ? ' para bagre' : malhaMin === 40 ? ' para peixe-rei' : ''}).`, 'INC 03/2004, art. 3º, I e §§1º e 2º', CRIME_34_II);
    const saco = [...de('Rede de saco'), ...de('Aviãozinho')];
    if (saco.length) {
      const qtd = saco.reduce((t, a) => t + (+a.qtd || 1), 0);
      const erros = [saco.some(a => a.malhaMm != null && a.malhaMm < 24) && 'malha abaixo de 24 mm', qtd > 10 && `${qtd} redes (andaina de até 10)`].filter(Boolean);
      if (erros.length) add('R19', 'vermelho', `Rede de saco ou aviãozinho: ${erros.join('; ')}.`, 'INC 03/2004, arts. 3º, II e 5º, II', CRIME_34_II);
    }
    if (de('Rede de arrasto').length) add('R20', 'vermelho', 'Arrasto no estuário da Lagoa dos Patos.', 'INC 03/2004, art. 3º, III', CRIME_34_II);
    if (ab.embarcacao && ab.embarcacao !== 'Nenhuma' && ab.comprimentoEmbM > 12)
      add('R21', 'vermelho', `Embarcação com ${num(ab.comprimentoEmbM)} m (máximo 12 m).`, 'INC 03/2004, art. 3º, IV', CRIME_34_II);
    const metros = de('Rede de emalhe').reduce((t, r) => t + (+r.comprimentoM || 0) * (+r.qtd || 1), 0);
    if (metros > 1830) add('R22', 'vermelho', `${metros} m de rede de espera (máximo 1.830 m por embarcação).`, 'INC 03/2004, art. 4º', CRIME_34_II);
    const mes = +data.slice(5, 7);
    for (const [sp, meses] of Object.entries(CALENDARIO_PATOS)) if (especie(sp) && !meses.includes(mes))
      add('R23', 'vermelho', `${sp === 'camarao' ? 'Camarão-rosa' : sp[0].toUpperCase() + sp.slice(1)} fora do calendário do estuário (permitido em ${meses.map(m => MESES[m]).join(', ')}).`, 'INC 03/2004, art. 2º', CRIME_34);
    for (const p of pes) if (chave(p.especie).startsWith('camarao') && p.menorCm != null && p.menorCm < 9)
      add('R24', 'amarelo', `Camarão-rosa com ${num(p.menorCm)} cm (mínimo 9 cm). Tolerância de 20% do número de exemplares: confira a proporção.`, 'INC 03/2004, art. 6º', CRIME_34_I);
  }

  if (ab.area === 'peixe')
    add('R25', 'amarelo', 'Parque Nacional da Lagoa do Peixe: só pescam os artesanais do Termo de Compromisso do ICMBio, com aviãozinho de lacre numerado, em caíco sem motor, na temporada aberta pelo monitoramento. Confira o cadastro e os lacres.', 'Decreto 93.546/1986; Termo de Compromisso ICMBio', CRIME_34);
  if (ab.area === 'mampituba')
    add('R26', 'amarelo', 'Barra do Mampituba até a Figueirinha: norma própria (Portaria SUDEPE 006/1984), texto não localizado. Confira.', 'Portaria SUDEPE 006/1984', CRIME_34);

  if (local === 'Barra ou desembocadura (fora de Tramandaí)' && entre(data, '03-15', '08-15') && pets.some(p => p.tipo !== 'Tarrafa'))
    add('R15', 'vermelho', 'Desembocadura de lagoa ou estuário de 15/03 a 15/08: só tarrafa.', 'IN IBAMA 171/2008, art. 2º', CRIME_34);

  // R28: águas continentais sem norma própria, o ano todo (IN IBAMA 43/2004, § 2º com redação da IN 120/2006).
  const continental = ab.area === 'outras' || ab.area === 'uruguai';
  if (continental) {
    const in43 = inc => `IN IBAMA 43/2004, art. 1º, ${inc}`;
    if (de('Rede de arrasto').length) add('R28', 'vermelho', 'Rede de arrasto ou de lance em águas continentais.', in43('I'), CRIME_34_II);
    for (const r of de('Rede de emalhe')) if (r.malhaMm != null && r.malhaMm < 70)
      add('R28', 'vermelho', `Rede de espera com malha ${r.malhaMm} mm (mínimo 70 mm).`, in43('II'), CRIME_34_II);
    for (const t of [...de('Tarrafa'), ...de('Tarrafa de camarão')]) if (t.malhaMm != null && t.malhaMm < 50)
      add('R28', 'vermelho', `Tarrafa com malha ${t.malhaMm} mm (mínimo 50 mm).`, in43('III'), CRIME_34_II);
    for (const c of de('Covo/armadilha')) if (c.malhaMm != null && c.malhaMm < 50)
      add('R28', 'vermelho', `Covo com malha ${c.malhaMm} mm (mínimo 50 mm).`, in43('IV'), CRIME_34_II);
    if (de('Espinhel').length)
      add('R28', 'amarelo', 'Espinhel: confira se passa de 1/3 da largura do corpo d\'água e se os anzóis capturam peixes imaturos.', in43('VI'), CRIME_34_II);
  }

  // R31: IN 43/2004, art. 2º, o ano todo.
  if (continental && local.startsWith('Até 200 m de barragem'))
    add('R31', 'vermelho', 'Pesca a menos de 200 m de barragem, cachoeira ou corredeira.', 'IN IBAMA 43/2004, art. 2º', CRIME_34);

  // R29 e R30: piracema da bacia do Uruguai (IN 193/2008).
  if (ab.area === 'uruguai' && entre(data, '10-01', '01-31')) {
    const in193 = a => `IN IBAMA 193/2008, ${a}`;
    if (pets.some(p => p.tipo !== 'Linha e anzol') || pets.length > 1)
      add('R29', 'vermelho', 'Piracema do Uruguai (1º/10 a 31/01): só linha de mão, vara ou linha e anzol, um por pescador.', in193('art. 6º, II e § 3º'), CRIME_34);
    if (ab.embarcacao === 'Motorizada') add('R29', 'vermelho', 'Piracema do Uruguai: embarcação só sem motor.', in193('art. 6º, § 1º'), CRIME_34);
    if (kg > 5) add('R29', 'vermelho', `Piracema do Uruguai: ${num(kg)} kg (máximo 5 kg).`, in193('art. 7º'), CRIME_34);
    const vedado = [['Lagoa marginal', 'art. 3º, I'], ['Entre 200 e 1.500 m', 'art. 3º, II'], ['Trecho vedado', 'art. 3º, V a VIII'], ['Até 500 m de confluência', 'art. 4º']].find(([ini]) => local.startsWith(ini));
    if (vedado) add('R30', 'vermelho', `Piracema: pesca proibida neste ponto (${local}), com qualquer petrecho.`, in193(vedado[1]), CRIME_34);
  }
  if (ab.area === 'outras' && entre(data, '11-01', '01-31') && (local === 'Lagoa marginal' || local.startsWith('Entre 200 e 1.500 m')))
    add('R30', 'vermelho', `Piracema: pesca proibida neste ponto (${local}), com qualquer petrecho.`, 'IN IBAMA 197/2008, art. 5º', CRIME_34);

  // R32: lambari em reservatório público (IN IBAMA 51/2004), 1º/11 a 28/02.
  if (local.startsWith('Reservatório') && entre(data, '11-01', '02-29') && especie('lambari'))
    add('R32', 'vermelho', 'Lambari em reservatório no defeso (1º/11 a 28/02).', 'IN IBAMA 51/2004', CRIME_34);

  // R33: Lagoa Mirim e Mangueira (INC MMA/SEAP 02/2004, texto não localizado; defeso pela planilha do MPA).
  if (ab.area === 'mirim') {
    add('R33', 'amarelo', 'Lagoa Mirim e Mangueira: norma própria (INC MMA/SEAP 02/2004), texto não localizado. Confira malha e petrechos.', 'INC MMA/SEAP 02/2004', CRIME_34);
    if (entre(data, '11-01', '01-31') && pets.some(p => p.tipo !== 'Linha e anzol'))
      add('R33', 'vermelho', 'Defeso da Lagoa Mirim e Mangueira (1º/11 a 31/01), todas as espécies.', 'INC MMA/SEAP 02/2004 (planilha de defesos do MPA)', CRIME_34);
  }

  if (ab.area === 'outras' && entre(data, '11-01', '01-31')) {
    if (pets.some(p => p.tipo !== 'Linha e anzol'))
      add('R16', 'vermelho', 'Piracema (1º/11 a 31/01): só anzol simples, um petrecho por pescador.', 'IN IBAMA 197/2008, art. 4º', CRIME_34);
    if (kg > 5) add('R16', 'vermelho', `Piracema: ${num(kg)} kg (máximo 5 kg por pescador).`, 'IN IBAMA 197/2008, art. 7º', CRIME_34);
  }

  // R27: espécie ameaçada, proibida em qualquer local e época (acima dos calendários da IN 17 e da INC 03).
  for (const p of pes) {
    const k = chave(p.especie);
    const am = AMEACADAS.find(([re, , onde]) => re.test(k) && !(onde === 'continental' && ab.area === 'mar'));
    if (am) add('R27', 'vermelho', `${p.especie}: espécie ameaçada${k.includes(chave(am[1])) ? '' : ` (${am[1]})`}, pesca proibida em qualquer local e época.`, NORMA_AMEACADAS, CRIME_34_I);
    else if (CONFERIR_ESPECIE.test(k) && !['outras', 'uruguai', 'mirim'].includes(ab.area)) add('R27', 'amarelo', `${p.especie}: confira a espécie. Há espécies ameaçadas neste grupo, proibidas o ano todo.`, NORMA_AMEACADAS, CRIME_34_I);
  }

  if (ab.categoria === 'Amador') {
    const limite = ab.area === 'mar' ? 15 : 10; // águas continentais e estuarinas 10 kg (art. 7º); marinhas 15 kg (art. 8º)
    if (kg > limite) add('R17', 'vermelho', `Amador com ${num(kg)} kg (cota de ${limite} kg mais 1 exemplar): confira se o excedente é um único exemplar.`, `Portaria SAP/MAPA 616/2022, art. ${limite === 15 ? '8º' : '7º'}`, CRIME_34_II);
    // R35: petrechos do amador (art. 4º): linha de mão, caniço, vara com molinete ou carretilha, arbalete, puçá-de-siri e
    // bomba manual de isca. Rede, tarrafa, espinhel, covo e afins ficam de fora. Tramandaí e Patos já têm a regra "só linha" no semáforo.
    if (!['tramandai', 'patos'].includes(ab.area)) {
      const proibidos = [...new Set(pets.filter(p => !['Linha e anzol', 'Outro'].includes(p.tipo)).map(p => p.tipo))];
      if (proibidos.length) add('R35', 'vermelho', `Amador com petrecho não permitido: ${proibidos.join(', ').toLowerCase()}.`, 'Portaria SAP/MAPA 616/2022, art. 4º', CRIME_34_II);
      if (de('Outro').length) add('R35', 'amarelo', 'Amador com petrecho "outro": só valem linha de mão, caniço, vara com molinete ou carretilha, arbalete, puçá-de-siri e bomba manual de isca. Confira.', 'Portaria SAP/MAPA 616/2022, art. 4º', CRIME_34_II);
    }
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

// Defesos e períodos por regime, para a faixa da tela inicial e o Guia. [nome, início MM-DD, fim MM-DD, texto, norma].
const DEFESOS = {
  tramandai: [['Bagre', '12-15', '03-31', 'Pesca de bagre proibida', 'IN MMA 17/2004, art. 14']],
  outras: [['Piracema', '11-01', '01-31', 'Só anzol simples, 1 petrecho e até 5 kg. Pesca proibida em lagoa marginal e a até 1.500 m de barragem', 'IN IBAMA 197/2008'],
    ['Lambari em reservatório', '11-01', '02-29', 'Pesca de lambari proibida em reservatório público', 'IN IBAMA 51/2004']],
  uruguai: [['Piracema', '10-01', '01-31', 'Só linha, 1 por pescador, até 5 kg e barco sem motor. Pesca proibida em lagoa marginal, a até 1.500 m de barragem e a até 500 m de confluência', 'IN IBAMA 193/2008'],
    ['Lambari em reservatório', '11-01', '02-29', 'Pesca de lambari proibida em reservatório público', 'IN IBAMA 51/2004']],
  mirim: [['Defeso de todas as espécies', '11-01', '01-31', 'Pesca proibida na Lagoa Mirim e na Lagoa Mangueira', 'INC MMA/SEAP 02/2004']],
  mar: [['Anchova', '12-01', '03-31', 'Pesca de anchova proibida', 'INI MPA/MMA 02/2009'],
    ['Barras e desembocaduras', '03-15', '08-15', 'Nas desembocaduras, só tarrafa', 'IN IBAMA 171/2008']],
  patos: [['Barras e desembocaduras', '03-15', '08-15', 'Nas desembocaduras, só tarrafa', 'IN IBAMA 171/2008']],
  peixe: [['Barras e desembocaduras', '03-15', '08-15', 'Nas desembocaduras, só tarrafa', 'IN IBAMA 171/2008']],
  mampituba: [],
};
const dataMMDD = d => d.slice(5, 10);
const diasAte = (data, mmdd) => { // dias até a próxima ocorrência de MM-DD
  const d = new Date(data.slice(0, 10) + 'T12:00'), alvo = new Date(`${d.getFullYear()}-${mmdd}T12:00`);
  if (alvo < d) alvo.setFullYear(alvo.getFullYear() + 1);
  return Math.round((alvo - d) / 864e5);
};
const fmtDM = mmdd => mmdd.split('-').reverse().join('/').replace(/^01\//, '1º/').replace('29/02', '28/02');
// estado: 'vigente' ou 'proximo' (começa em até 30 dias). Os demais não entram.
function defesosDe(area, data) {
  const out = [];
  for (const [nome, de, ate, texto, norma] of DEFESOS[area] || []) {
    const estado = entre(data, de, ate) ? 'vigente' : diasAte(data, de) <= 30 ? 'proximo' : '';
    if (estado) out.push({ nome, estado, periodo: `${fmtDM(de)} a ${fmtDM(ate)}`, texto, norma });
  }
  if (area === 'patos') {
    const mes = +data.slice(5, 7), fora = Object.entries(CALENDARIO_PATOS).filter(([, ms]) => !ms.includes(mes)).map(([sp]) => sp === 'camarao' ? 'camarão-rosa' : sp);
    if (fora.length) out.push({ nome: 'Fora do calendário do estuário', estado: 'vigente', periodo: `em ${MESES[mes]}`, texto: `Proibido agora: ${fora.join(', ')}`, norma: 'INC 03/2004, art. 2º' });
  }
  return out;
}

// Resumo para "bater o olho" ao escolher o local (mesmo conteúdo das regras acima).
const RESUMO = {
  tramandai: ['Licença: só pesca o profissional da lista atual (IN 17, art. 22). Amador: só linha e anzol, sem licença (art. 26, II).',
    'Rede de espera: malha mínima de 80 mm. Na Lagoa Tramandaí: malha mínima de 90 mm e até 500 m. Em rio, canal ou foz: proibida.',
    'Tarrafa de peixe: malha mínima de 60 mm. Arrasto: proibido.', 'Aviãozinho: só na Laguna do Armazém. Malha mínima de 25 mm. Até 10 redes por pescador.',
    'Camarão: só na temporada da portaria anual. Bagre: proibido de 15/12 a 31/03.',
    'Locais proibidos: canal e boca da barra, ponte Giuseppe Garibaldi, Lagoa Gentil, Braço Morto do Imbé e 200 m da foz de rios (arts. 2º a 10). Com GPS, o app avisa nas áreas com coordenadas.',
    'Sob a ponte, sentido oeste: tarrafa embarcada de 25 mm permitida para sardinha e peixe-rei. Só para licenciados (art. 25, II).'],
  patos: ['Licença: só pesca o profissional da lista do estuário (INC 03/2004).', 'Rede de espera: malha mínima de 100 mm. Para bagre: 140 mm. Para peixe-rei: 40 mm. Até 1.830 m por embarcação.',
    'Rede de saco e aviãozinho: malha mínima de 24 mm. Andaina de até 10 redes.', 'Arrasto: proibido. Embarcação: até 12 m.',
    'Calendário: tainha de out a mai. Corvina de out a fev. Camarão-rosa de fev a mai, com 9 cm no mínimo.'],
  outras: ['Rede de espera: malha mínima de 70 mm. Tarrafa e covo: malha mínima de 50 mm. Arrasto: proibido (IN 43/2004).',
    'A menos de 200 m de barragem, cachoeira ou corredeira: pesca proibida.',
    'Piracema, de 1º/11 a 31/01: só anzol simples, 1 petrecho e até 5 kg. Em lagoa marginal e a até 1.500 m de barragem: pesca proibida (IN 197/2008).',
    'Lambari em reservatório: proibido de 1º/11 a 28/02.'],
  uruguai: ['Rede de espera: malha mínima de 70 mm. Tarrafa e covo: malha mínima de 50 mm. Arrasto: proibido (IN 43/2004).',
    'A menos de 200 m de barragem, cachoeira ou corredeira: pesca proibida.',
    'Piracema, de 1º/10 a 31/01: só linha, 1 por pescador, até 5 kg e barco sem motor. Pesca proibida em lagoa marginal, a até 1.500 m de barragem, a até 500 m da confluência com o Uruguai e nos trechos do art. 3º (IN 193/2008).',
    'Lambari em reservatório: proibido de 1º/11 a 28/02.'],
  mirim: ['Licença: só pesca o profissional da lista das Lagoas Mirim e Mangueira, publicada pelo MPA (INC 02/2004).', 'Defeso de todas as espécies: de 1º/11 a 31/01.',
    'Malha e petrechos: INC MMA/SEAP 02/2004. O texto da norma não foi localizado. Confira.'],
  peixe: ['Parque Nacional: só pesca quem está no Termo de Compromisso do ICMBio.',
    'Camarão: só aviãozinho com lacre numerado, em caíco sem motor. Só na temporada que o ICMBio abre pelo monitoramento (2026: aberta em 14/01).'],
  mampituba: ['Barra do Mampituba até a Figueirinha: Portaria SUDEPE 006/1984. O texto não foi localizado. Confira.'],
  mar: ['Emalhe: malha de 70 a 140 mm. Altura: até 4 m. RGP na tralha superior (IN 12/2012).', 'Barco motorizado: emalhe só além de 1 milha da costa.',
    'Arrasto por barco motorizado: proibido nas 12 milhas do RS (Lei RS 15.223/2018).',
    'Tamanho mínimo: tainha, anchova e linguado, 35 cm. Corvina e pescadinha, 25 cm (IN 53/2005).',
    'Anchova: defeso de 1º/12 a 31/03. Barras: de 15/03 a 15/08, só tarrafa.'],
};
const RESUMO_TODOS = ['Espécies ameaçadas: pesca proibida em qualquer local e época (bagre-branco, miraguaia, dourado, surubim, garoupa-verdadeira e outras).',
  'Amador, cota: até 10 kg em rio, lagoa e estuário. Até 15 kg no mar. Mais 1 exemplar (Portaria SAP/MAPA 616/2022).',
  'Amador: venda do pescado proibida. Transporte em postas, filés ou sem cabeça: proibido.',
  'Amador, petrechos: só linha de mão, caniço, vara com molinete ou carretilha, arbalete, puçá-de-siri e bomba manual de isca (art. 4º).',
  'Amador, licença: obrigatória. Exceção: só linha de mão ou caniço simples (IN MPA 05/2012).'];

// Guia: peixes ameaçados do RS que aparecem na pesca (Decreto RS 51.797/2014, Anexo I). [popular, científico, ambiente, categoria].
// Ficaram de fora os peixes-anuais, rivulídeos, lambaris e cascudos pequenos (não são alvo de pesca), citados em nota no Guia.
const AMEACADAS_GUIA = [
  ['Bagre-branco, bagre-rosado', 'Genidens barbus', 'Estuário e mar', 'EN'], ['Bagre-boca-larga, bagre-cachorro', 'Genidens planifrons', 'Estuário e mar', 'CR'],
  ['Miraguaia, corvina-negra', 'Pogonias cromis', 'Estuário e mar', 'EN'], ['Garoupa-verdadeira', 'Epinephelus marginatus', 'Mar', 'EN'],
  ['Peixe-rei (bicudo)', 'Odontesthes bicudo', 'Lagoas do litoral', 'EN'], ['Dourado', 'Salminus brasiliensis', 'Rios: bacias da Laguna dos Patos e do Uruguai', 'EN e VU'],
  ['Surubim, pintado', 'Pseudoplatystoma corruscans', 'Rio Uruguai', 'EN'], ['Suruvi, surubim, bocudo', 'Steindachneridion scriptum', 'Rio Uruguai', 'EN'],
  ['Piracanjuba, bracanjuva, salmão-crioulo', 'Brycon orbignyanus', 'Rio Uruguai', 'CR'], ['Cascudo-preto', 'Pogonopoma obscurum', 'Rios', 'VU'],
  ['Cherne-poveiro', 'Polyprion americanus', 'Mar', 'CR'], ['Namorado', 'Pseudopercis semifasciata', 'Mar', 'VU'], ['Peixe-batata', 'Lopholatilus villarii', 'Mar', 'VU'],
  ['Peixe-folha, prejereba', 'Lobotes surinamensis', 'Mar', 'CR'],
  ['Cação-anjo (3 espécies)', 'Squatina argentina, S. guggenheim, S. occulta', 'Mar', 'CR'], ['Cação-mangona', 'Carcharias taurus', 'Mar', 'CR'],
  ['Cação-bico-doce', 'Galeorhinus galeus', 'Mar', 'CR'], ['Cação-sebastião, canejo', 'Mustelus schmitti', 'Mar', 'CR'], ['Cação-malhado, cação-listrado', 'Mustelus fasciatus', 'Mar', 'CR'],
  ['Boca-de-velha, bodinho', 'Mustelus canis', 'Mar', 'EN'], ['Tubarão-galhudo, cação-galhudo', 'Carcharhinus plumbeus', 'Mar', 'CR'], ['Cação', 'Carcharhinus signatus', 'Mar', 'CR'],
  ['Tubarão-martelo (2 espécies)', 'Sphyrna lewini, S. zygaena', 'Mar', 'CR'], ['Tubarão-azul, mole-mole', 'Prionace glauca', 'Mar', 'VU'],
  ['Tubarão-galha-branca-oceânico', 'Carcharhinus longimanus', 'Mar', 'VU'],
  ['Viola, raia-viola', 'Rhinobatos horkelii', 'Mar', 'CR'], ['Viola-banjo', 'Zapteryx brevirostris', 'Mar', 'CR'], ['Raia-pintada, raia-chita', 'Atlantoraja castelnaui', 'Mar', 'EN'],
  ['Raia-manteiga, raia-borboleta', 'Gymnura altavela', 'Mar', 'EN'], ['Ticonha', 'Rhinoptera brasiliensis', 'Mar', 'CR'], ['Raia-sapo, emplastro-amarelo', 'Myliobatis freminvillii, M. goodei', 'Mar', 'CR'],
  ['Emplastro, raia-lisa', 'Rioraja agassizii', 'Mar', 'EN'], ['Emplastro-bicudo', 'Sympterygia acuta', 'Mar', 'EN'], ['Emplastro-amarelo', 'Sympterygia bonapartii', 'Mar', 'CR'],
  ['Raia', 'Dasyatis centroura', 'Mar', 'EN'],
];

globalThis.Normas = { checar, multaReferencia, defesosDe, DEFESOS, RESUMO, RESUMO_TODOS, AMEACADAS_GUIA, LOCAIS, TAMANHO_MINIMO, CALENDARIO_PATOS };
})();
