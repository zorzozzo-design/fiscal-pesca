// Orla marítima: áreas de pesca, surfe e banho de cada município (lei municipal) e a regra estadual (Lei RS 8.676/1988).
// Regra R36, chamada por normas.js no mar. Indica, não autua: a placa e a demarcação no local valem mais que o app.
(() => {

const ZONAS = {
  pesca: 'Área de pesca', surfe: 'Área de surfe', banho: 'Área de banho ou lazer', plataforma: 'Até 200 m da plataforma de pesca',
  especial: 'Área Especial da Barra (molhes até a Rua Bento Gonçalves)', barra: 'Até 1.000 m da barra de rio', outra: 'Outro trecho da orla', naosei: 'Não sei (sem placa visível)',
};
const REDES = new Set(['Rede de emalhe', 'Rede de arrasto', 'Aviãozinho', 'Rede de saco']);
const ESTADUAL = 'Lei RS 8.676/1988, art. 1º, § 2º (redação da Lei 13.660/2011)';
const SANCAO = 'Sanção administrativa: Decreto RS 49.245/2012, art. 5º (apreensão, advertência, multa de 100 UFIR); BM fiscaliza (art. 2º, III)';

const mmdd = d => d.slice(5, 10);
const entre = (d, de, ate) => de <= ate ? mmdd(d) >= de && mmdd(d) <= ate : mmdd(d) >= de || mmdd(d) <= ate;
const hora = d => (d || '').slice(11, 16);
// Horário noturno permitido: das "ini" às "fim" do dia seguinte.
const naNoite = (h, ini, fim) => !h || h >= ini || h < fim;

// Cada município: lei, zonas da lista, penalidade própria (se houver), regras e texto do Guia.
// regras(c) devolve [nivel, texto, artigo]. c: zona, amador, comRede, soLinha, cabo, embarcado, ate500, verao(de, ate), h.
const ORLA = {
  'Tramandaí': {
    lei: 'Lei Municipal de Tramandaí 3.952/2015 (red. Lei 4.687/2023)',
    zonas: ['pesca', 'surfe', 'outra', 'naosei'],
    regras: c => [
      c.zona === 'surfe' && !c.soLinha && ['vermelho', 'Pesca com petrecho de profissional em área de surfe. Ali só vale a pesca amadora com linha, caniço e anzol.', 'arts. 3º, 4º e 6º'],
      c.cabo && c.verao('12-15', '03-15') && ['vermelho', 'Rede com cabo no veraneio (15/12 a 15/03): proibida na área de pesca.', 'art. 5º'],
      c.amador && c.verao('12-15', '03-15') && !naNoite(c.h, '19:00', '08:00') && ['vermelho', `Amador no veraneio fora do horário (só das 19h às 8h). Hora da abordagem: ${c.h}.`, 'art. 6º'],
      c.ate500 && c.comRede && ['vermelho', 'Bote com rede a 500 m ou menos da costa (a lei municipal exige 500 m).', 'art. 2º, § 3º'],
      c.cabo && c.zona === 'pesca' && ['amarelo', 'Rede com cabo: confira boias vermelhas, bandeira vermelha na praia e placa com nome, endereço e RGP.', 'art. 7º, § 3º'],
    ],
    guia: ['Área de pesca: da Av. Alberto Bins até a Av. Belo Horizonte, e do fim da Av. Beira Mar (Tiaraju) até o limite sul.',
      'Área de surfe: dos molhes da Barra até a Rua Antunes Tavares; na Zona Sul, da Av. Belo Horizonte até a Rua das Alamandas.',
      'Rede com cabo: proibida de 15/12 a 15/03. Uma rede com cabo por família, com RGP, bloco do produtor e licença ambiental (Lei 4.687/2023).',
      'Bote: rede a mais de 500 m da costa. ATENÇÃO: com motor, o emalhe só é permitido além de 1 milha (IN 12/2012, art. 6º).',
      'Amador: linha, caniço e anzol em toda a orla. De 15/12 a 15/03, só das 19h às 8h.',
      'Sinalização da rede: boias vermelhas, bandeira vermelha alinhada na praia e placa com nome, endereço e RGP.'],
  },
  'Imbé': {
    lei: 'Lei Municipal de Imbé 1.328/2011',
    zonas: ['pesca', 'surfe', 'especial', 'naosei'],
    regras: c => [
      c.zona === 'especial' && !c.tarrafaOuCanico && ['vermelho', 'Área Especial da Barra: só tarrafa ou caniço. Rede de qualquer tipo é proibida.', 'art. 2º, § 1º'],
      c.zona === 'surfe' && !c.soLinha && ['vermelho', 'Pesca em área exclusiva de surfe.', 'art. 3º'],
      c.zona === 'surfe' && c.soLinha && c.verao('12-15', '03-15') && ['vermelho', 'Amador no veraneio fora da área de pesca (só nas áreas de pesca, das 19h às 9h).', 'arts. 3º e 6º'],
      c.zona === 'surfe' && c.soLinha && !c.verao('12-15', '03-15') && ['amarelo', 'Linha e anzol em área exclusiva de surfe: confira a sinalização no local.', 'art. 3º'],
      c.cabo && c.verao('12-15', '03-15') && ['vermelho', 'Rede com cabo no veraneio (15/12 a 15/03): proibida nas áreas de pesca.', 'art. 5º'],
      c.amador && c.zona === 'pesca' && c.verao('12-15', '03-15') && !naNoite(c.h, '19:00', '09:00') && ['vermelho', `Amador no veraneio fora do horário (só das 19h às 9h). Hora da abordagem: ${c.h}.`, 'art. 6º'],
      c.ate500 && c.comRede && ['vermelho', 'Bote com rede a 500 m ou menos da costa (a lei municipal exige 500 m).', 'art. 4º, § 2º'],
      c.cabo && c.zona === 'pesca' && ['amarelo', 'Rede com cabo: confira boias vermelhas, bandeira vermelha na praia e placa com nome, endereço e RGP.', 'art. 9º, III'],
    ],
    guia: ['Área Especial: da divisa com Tramandaí (centro do rio) até a Rua Bento Gonçalves, cerca de 380 m. Só tarrafa ou caniço. Rede e surfe proibidos.',
      'Surfe I: Rua Bento Gonçalves até a Rua Tancredo Neves. Surfe II: Rua Quartzo até a Rua Aloys Roth. Áreas exclusivas de surfe.',
      'Pesca I: Rua Tancredo Neves até a Rua Quartzo. Pesca II: Rua Aloys Roth até a divisa com Osório. Para rede com cabo e bote.',
      'Rede com cabo: proibida de 15/12 a 15/03. Bote: rede a mais de 500 m da costa (com motor, além de 1 milha pela IN 12/2012).',
      'Amador: de 15/12 a 15/03, só nas áreas de pesca, das 19h às 9h.'],
  },
  'Cidreira': {
    lei: 'Lei Municipal de Cidreira 628/1997 (red. Leis 1.828/2011, 2.576/2019 e 3.203/2024); Lei 1.826/2011 (surfe)',
    zonas: ['pesca', 'surfe', 'banho', 'plataforma', 'naosei'],
    regras: c => [
      c.zona === 'surfe' && ['vermelho', 'Pesca em área de surfe (Rua União até a Av. Itália): proibida para profissional e amador.', 'Lei 628/1997, art. 5º; Lei 1.826/2011, art. 2º'],
      c.zona === 'plataforma' && !(c.amador && c.soLinha) && ['vermelho', 'Até 200 m da plataforma: só pesca amadora.', 'Lei 628/1997, art. 5º'],
      c.zona === 'banho' && c.verao('12-16', '03-14') && ['vermelho', 'Pesca na área de banho no veraneio. De 16/12 a 14/03 só vale a área de pesca (Rua Maestro Medanha até a divisa com Tramandaí).', 'Lei 628/1997, arts. 2º e 5º'],
      c.amador && c.verao('12-16', '03-14') && !naNoite(c.h, '19:00', '08:00') && ['vermelho', `Amador no veraneio fora do horário (só das 19h às 8h). Hora da abordagem: ${c.h}.`, 'Lei 628/1997, art. 6º'],
    ],
    guia: ['Área de surfe: Rua União até a Av. Itália (2.100 m). Pesca proibida para todos.',
      'Banho: da Rua Maestro Medanha até a divisa com Balneário Pinhal. Pesca: da Rua Maestro Medanha até a divisa com Tramandaí.',
      'De 15/03 a 15/12: pesca profissional e amadora em toda a orla, menos na área de surfe.',
      'Até 200 m da plataforma: só pesca amadora. Extração de mariscos e moluscos proibida.',
      'Amador: de 16/12 a 14/03, só das 19h às 8h.'],
  },
  'Balneário Pinhal': {
    lei: 'Lei Municipal de Balneário Pinhal 449/2003 (red. Lei 731/2008)',
    pena: 'apreensão do material e multa de 2 cestas básicas (Lei 449/2003, art. 7º)',
    zonas: ['pesca', 'surfe', 'outra', 'naosei'],
    regras: c => {
      const prof = !c.amador && !c.soLinha, verao = c.verao('12-15', '03-15');
      const limite = c.embarcado ? '09:30' : '09:00'; // 30 min de tolerância para a saída do barco (art. 4º, § 1º)
      return [
        c.zona === 'surfe' && ['vermelho', 'Pesca em área de surfe: proibida.', 'art. 4º, § 2º'],
        prof && verao && c.zona !== 'pesca' && c.zona !== 'surfe' && c.h && c.h >= limite && c.h < '18:00' && ['vermelho', `Pesca artesanal ou profissional no veraneio fora do horário (só até as 9h e a partir das 18h). Hora da abordagem: ${c.h}.`, 'art. 4º'],
        prof && verao && c.zona !== 'surfe' && ['amarelo', 'O art. 5º só permite a pesca profissional de 15/03 a 15/12. O art. 4º admite horários no veraneio. Confira a regra aplicada pela Prefeitura.', 'art. 4º e art. 5º'],
      ];
    },
    guia: ['Travessa 45 (após o Clube de Pesca Atlântico Sul), 200 m: área exclusiva da pesca artesanal, 24 horas.',
      'Após a Rua Inhaúma (Magistério), 150 m, e "rua Projetada" (Pinhal Sul), 120 m: entrada e saída de barcos e botes.',
      'De 15/12 a 15/03: pesca artesanal e profissional só até as 9h e a partir das 18h (30 min de tolerância para o barco sair do mar).',
      'Área de surfe: pesca proibida. Penalidade: apreensão e multa de 2 cestas básicas.'],
  },
  'Palmares do Sul': {
    lei: 'Lei Municipal de Palmares do Sul 165/1988; Lei 219/1989 (red. Lei 1.125/2004, surfe no Quintão)',
    pena: 'apreensão do equipamento e multa (Lei 165/1988, art. 11)',
    zonas: ['pesca', 'surfe', 'banho', 'plataforma', 'barra', 'naosei'],
    regras: c => regras165(c, { banho: 'Lei 165/1988, art. 2º, p. ún.', surfe: 'Lei 165/1988, art. 4º, § 3º; Lei 219/1989, art. 1º', plataforma: 'Lei 165/1988, art. 6º, § 1º', barra: 'Lei 165/1988, art. 6º, § 2º' }),
    guia: ['Surfe no Quintão: da Rua Limite Norte até a Av. dos Bancários (16/12 a 15/03); da Rua Alegrete até a Av. dos Bancários (16/03 a 15/12). Pesca vedada a qualquer tempo.',
      'Banho: de dezembro a março, durante o dia, pesca vedada nas áreas e horários marcados.',
      'Até 200 m da plataforma: só pesca amadora.',
      'Barra de rio, 1.000 m ao norte e ao sul: rede, tarrafa embarcada e espinhel ferrador proibidos.'],
  },
  'Capão da Canoa': {
    lei: 'Lei Municipal de Capão da Canoa 353/1989',
    conferir: true, // texto localizado no portal do TCE-RS; alterações posteriores não conferidas
    pena: 'apreensão do equipamento e multa de 30 PTMs (Lei 353/1989, art. 17)',
    zonas: ['pesca', 'surfe', 'banho', 'plataforma', 'barra', 'naosei'],
    regras: c => regras165(c, { banho: 'art. 3º', surfe: 'art. 8º', plataforma: 'art. 11', barra: 'art. 12' }),
    guia: ['Texto da Lei 353/1989 localizado no portal Leis.org (TCE-RS). Alterações posteriores não conferidas: no app, as regras ficam em amarelo.',
      'Surfe: pesca vedada a qualquer tempo. Banho: de dezembro a março, de dia, pesca vedada.',
      'Até 200 m da plataforma: só amador. Barra de rio, 1.000 m ao norte e ao sul: rede, tarrafa embarcada e espinhel ferrador proibidos.'],
  },
};

// Palmares do Sul e Capão da Canoa seguem o mesmo modelo de lei (1988/1989, regulando a Lei RS 8.676).
function regras165(c, art) {
  return [
    c.zona === 'surfe' && ['vermelho', 'Pesca em área de surfe: vedada a qualquer tempo, amadora ou profissional.', art.surfe],
    c.zona === 'plataforma' && !(c.amador && c.soLinha) && ['vermelho', 'Até 200 m da plataforma: só pesca amadora.', art.plataforma],
    c.zona === 'barra' && (c.comRede || c.espinhel || (c.embarcado && c.tarrafa)) && ['vermelho', 'Barra de rio (1.000 m ao norte e ao sul): rede, tarrafa embarcada e espinhel ferrador proibidos.', art.barra],
    c.zona === 'banho' && ['12', '01', '02', '03'].includes(c.data.slice(5, 7)) && ['amarelo', 'Área de banho de dezembro a março: de dia, nos horários marcados, a pesca é vedada. Confira o horário na placa.', art.banho],
  ];
}

const MUNICIPIOS_ORLA = Object.keys(ORLA);
const zonasDe = municipio => (ORLA[municipio]?.zonas || ['pesca', 'surfe', 'banho', 'outra', 'naosei']).map(k => [k, ZONAS[k]]);

// ab: abordagem (visão do envolvido). Devolve motivos no formato de normas.js, sem artigo do Dec. 6.514 (a sanção é municipal e estadual).
function checar(ab) {
  const zona = ab.zonaOrla, municipio = ab.praia, pets = ab.petrechos || [];
  if (ab.area !== 'mar' || !municipio || !zona || !pets.length) return [];
  const tipos = pets.map(p => p.tipo), local = ab.localTipo || '';
  const embarcado = (!!ab.embarcacao && ab.embarcacao !== 'Nenhuma') || local.startsWith('Embarcado');
  const comRede = tipos.some(t => REDES.has(t));
  const c = { zona, data: ab.data || '', h: hora(ab.data), amador: ab.categoria === 'Amador', comRede, embarcado,
    soLinha: tipos.every(t => t === 'Linha e anzol'), tarrafaOuCanico: tipos.every(t => t === 'Linha e anzol' || t === 'Tarrafa'),
    tarrafa: tipos.includes('Tarrafa'), espinhel: tipos.includes('Espinhel'),
    cabo: comRede && !embarcado && local === 'Praia (desembarcado)', ate500: local === 'Embarcado até 500 m da costa',
    verao: (de, ate) => !!ab.data && entre(ab.data, de, ate) };
  const m = ORLA[municipio];
  const out = [];
  const pena = m?.pena ? `Penalidade municipal: ${m.pena} · ${SANCAO}` : SANCAO;
  for (const r of m ? m.regras(c) : []) if (r) {
    const [nivel, texto, art] = r;
    const norma = `${art.startsWith('Lei ') ? `Lei Municipal de ${municipio} ${art.slice(4)}` : `${m.lei}, ${art}`}${comRede && !c.amador && nivel === 'vermelho' && (zona === 'surfe' || zona === 'banho') ? '; ' + ESTADUAL : ''}`;
    out.push({ regra: 'R36', nivel: m.conferir && nivel === 'vermelho' ? 'amarelo' : nivel,
      texto: m.conferir && nivel === 'vermelho' ? `${texto} (Lei municipal não conferida: confira a vigência.)` : texto, norma, enquadramento: pena, artigo: null });
  }
  // Lei estadual: nas áreas demarcadas de esporte, recreação e lazer, pesca profissional com rede proibida (linha de mão e caniço liberados).
  if (!out.some(x => x.nivel === 'vermelho') && comRede && !c.amador) {
    if (zona === 'surfe' && !m?.conferir) out.push({ regra: 'R36', nivel: 'vermelho', texto: 'Rede de pesca profissional em área de surfe (esporte): proibida pela lei estadual.', norma: ESTADUAL, enquadramento: SANCAO, artigo: null });
    else if (zona === 'banho' && !m) out.push({ regra: 'R36', nivel: 'amarelo', texto: 'Rede de pesca profissional em área de banho ou lazer: a lei estadual proíbe nas áreas demarcadas. Confira a demarcação no local.', norma: ESTADUAL, enquadramento: SANCAO, artigo: null });
  }
  if (zona === 'naosei' && !out.length) out.push({ regra: 'R36', nivel: 'amarelo', texto: 'Zona da orla não identificada: confira as placas. Em área de surfe a pesca é proibida; em área de lazer, a rede de profissional também.', norma: m ? m.lei : ESTADUAL, enquadramento: SANCAO, artigo: null });
  return out;
}

const GUIA_ESTADUAL = [
  'Lei RS 8.676/1988 (red. Lei 13.660/2011): cada município do litoral demarca, no centro de cada balneário, no mínimo 2.100 m para esporte, recreação e lazer. Nessas áreas, a pesca profissional com rede é proibida. A pesca amadora com linha de mão e caniço é permitida.',
  'Decreto RS 49.245/2012: a BM fiscaliza (art. 2º, III). Sanções: apreensão, advertência e multa de 100 UFIR (art. 5º). Petrecho sem identificação na orla é recolhido (art. 7º).',
  'Lei RS 12.050/2003: o pescador profissional leva a carteira da associação. Petrecho deixado na orla tem etiqueta com nome, número da carteira e endereço (art. 3º).',
  'A lei municipal não libera o que a norma federal proíbe. Exemplo: bote com motor e rede de emalhe a 500 m da praia. A lei municipal fala em 500 m, mas a IN 12/2012 (art. 6º) proíbe o emalhe motorizado até 1 milha (1.852 m).',
];

globalThis.Orla = { ORLA, ZONAS, MUNICIPIOS_ORLA, zonasDe, checar, GUIA_ESTADUAL };
})();
