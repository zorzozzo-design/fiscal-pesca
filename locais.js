// Locais de pesca do RS e o regime de normas de cada um (bacia ou norma própria).
// Fonte: aba "Legislação" do documento do projeto ("Onde vale cada norma"). Script comum, sem módulos.
(() => {

const REGIMES = {
  tramandai: { nome: 'Bacia do Rio Tramandaí', lista: true, normas: ['IN MMA 17/2004', 'Portaria anual do camarão (2026: Portaria MPA/MMA 48/2026)'] },
  patos: { nome: 'Lagoa dos Patos, estuário', lista: true, normas: ['INC MMA/SEAP 03/2004', 'IN IBAMA 171/2008 (barra)'] },
  outras: { nome: 'Bacias do Guaíba e do Litoral (sem norma própria)', lista: false, normas: ['IN IBAMA 43/2004 (petrechos proibidos, o ano todo)', 'IN IBAMA 197/2008 (piracema, 1º/11 a 31/01)', 'IN IBAMA 171/2008 (barras)', 'IN IBAMA 51/2004 (lambari em reservatório)'] },
  uruguai: { nome: 'Bacia do Rio Uruguai', lista: false, normas: ['IN IBAMA 43/2004 (petrechos proibidos, o ano todo)', 'IN IBAMA 193/2008 (piracema, 1º/10 a 31/01)', 'IN IBAMA 51/2004 (lambari em reservatório)'] },
  mirim: { nome: 'Lagoa Mirim e Lagoa Mangueira', lista: true, normas: ['INC MMA/SEAP 02/2004 (lista de licenciados do MPA; defeso 1º/11 a 31/01; texto não localizado)'] },
  peixe: { nome: 'Parque Nacional da Lagoa do Peixe', lista: false, normas: ['Decreto 93.546/1986', 'Termo de Compromisso ICMBio (2019)'] },
  mampituba: { nome: 'Barra do Mampituba até a Figueirinha', lista: false, normas: ['Portaria SUDEPE 006/1984 (texto não localizado)'] },
  mar: { nome: 'Mar e praias', lista: false, normas: ['IN MMA 53/2005 (tamanho mínimo)', 'IN Interministerial 12/2012 (emalhe)', 'IN IBAMA 171/2008 (barras)', 'Lei RS 15.223/2018 (arrasto)'] },
};

// Municípios do RS (municipios-rs.js): sede para ordenar pelo GPS e bacias SEMA com % da área.
const { BACIAS, LISTA } = globalThis.MunicipiosRS;
const MUNICIPIOS = Object.fromEntries(LISTA.map(([n, lat, lon]) => [n, [lat, lon]]));
const BACIAS_MUN = Object.fromEntries(LISTA.map(([n, , , b]) => [n, b.split(' ').map(x => { const [c, p] = x.split(':'); return [c, +p]; })]));
const baciasDe = nome => BACIAS_MUN[nome] || [];
// Uruguai: IN 193/2008. Tramandaí: IN 17/2004 (a bacia L010 coincide com a área do art. 1º). Demais: IN 197/2008.
const regimeDaBacia = b => b[0] === 'U' ? 'uruguai' : b === 'L010' ? 'tramandai' : 'outras';

// sub = ponto inicial na lista de pontos da área (normas.js); conferir = classificação ainda não confirmada.
const L = (id, nome, municipios, regime, base, extra = {}) => ({ id, nome, municipios, regime, base, ...extra });
const LOCAIS_PESCA = [
  L('itapeva', 'Lagoa Itapeva', ['Torres', 'Arroio do Sal', 'Três Cachoeiras', 'Dom Pedro de Alcântara'], 'tramandai', 'IN 17, arts. 1º e 6º', { sub: 'Outra lagoa da bacia' }),
  L('quadros', 'Lagoa dos Quadros', ['Capão da Canoa', 'Terra de Areia', 'Maquiné'], 'tramandai', 'IN 17, arts. 6º e 7º', { sub: 'Outra lagoa da bacia' }),
  L('pinguela', 'Lagoa da Pinguela', ['Osório'], 'tramandai', 'IN 17, arts. 6º e 7º', { sub: 'Outra lagoa da bacia' }),
  L('malvas', 'Lagoa das Malvas', ['Osório'], 'tramandai', 'IN 17, art. 6º', { sub: 'Outra lagoa da bacia' }),
  L('palmital', 'Lagoa do Palmital', ['Osório'], 'tramandai', 'IN 17, art. 6º', { sub: 'Outra lagoa da bacia' }),
  L('passo', 'Lagoa do Passo', ['Osório'], 'tramandai', 'IN 17, arts. 6º e 7º', { sub: 'Outra lagoa da bacia' }),
  L('boavista', 'Lagoa Boa Vista', ['Osório'], 'tramandai', 'IN 17, art. 7º', { sub: 'Rio Cornélio, Lagoa Boa Vista ou áreas do art. 7º' }),
  L('tramandai', 'Lagoa Tramandaí', ['Tramandaí', 'Imbé'], 'tramandai', 'IN 17, arts. 16 e 17', { sub: 'Lagoa Tramandaí' }),
  L('armazem', 'Laguna do Armazém', ['Tramandaí'], 'tramandai', 'IN 17, arts. 5º e 18', { sub: 'Laguna do Armazém' }),
  L('gentil', 'Lagoa Gentil', ['Tramandaí'], 'tramandai', 'IN 17, art. 4º', { sub: 'Lagoa Gentil (art. 4º)' }),
  L('custodias', 'Lagoa das Custódias', ['Tramandaí'], 'tramandai', 'IN 17, art. 19', { sub: 'Outra lagoa da bacia' }),
  L('manoelvicente', 'Lagoa Manoel Vicente', ['Tramandaí'], 'tramandai', 'IN 197/2008, art. 3º', { sub: 'Outra lagoa da bacia' }),
  L('cerquinha', 'Lagoa da Cerquinha', ['Cidreira', 'Balneário Pinhal'], 'tramandai', 'IN 17, art. 1º (limite sul)', { sub: 'Outra lagoa da bacia' }),
  L('barratramandai', 'Barra e canal do Rio Tramandaí', ['Tramandaí', 'Imbé'], 'tramandai', 'IN 17, art. 2º', { sub: 'Canal da Barra e Boca da Barra (IN 17, art. 2º)' }),
  L('ponte', 'Ponte Giuseppe Garibaldi', ['Tramandaí', 'Imbé'], 'tramandai', 'IN 17, art. 3º', { sub: 'Sobre a ponte Giuseppe Garibaldi (art. 3º)' }),
  L('bracomorto', 'Braço Morto do Imbé', ['Imbé'], 'tramandai', 'IN 17, art. 10', { sub: 'Braço Morto do Imbé (art. 10)' }),
  L('rioscardoso', 'Rios Cardoso, Três Forquilhas e Maquiné', ['Terra de Areia', 'Três Forquilhas', 'Itati', 'Maquiné'], 'tramandai', 'IN 17, art. 1º', { sub: 'Rio, canal ou foz' }),
  L('cornelio', 'Rio Cornélio', ['Torres', 'Arroio do Sal', 'Capão da Canoa'], 'tramandai', 'IN 17, art. 7º', { sub: 'Rio Cornélio, Lagoa Boa Vista ou áreas do art. 7º' }),
  L('camarao', 'Rios Camarão e Relógio', ['Tramandaí', 'Osório'], 'tramandai', 'IN 17, art. 19', { sub: 'Rio, canal ou foz' }),
  L('peixoto', 'Lagoas Peixoto, Marcelino, Caconde e Emboaba', ['Osório', 'Tramandaí'], 'tramandai', 'Entre a Itapeva e a Cerquinha; a IN 17 não as nomeia', { sub: 'Outra lagoa da bacia', conferir: true }),
  L('barrososorio', 'Lagoa dos Barros', ['Osório', 'Santo Antônio da Patrulha'], 'outras', 'Bacia do Litoral Médio, drena para a Lagoa dos Patos (Vanzella e outros, IST, 2021); fora da IN 17', { sub: 'Lagoa ou rio' }),
  L('fortaleza', 'Lagoa da Fortaleza', ['Cidreira'], 'tramandai', 'Ao norte da Cerquinha; a IN 17 não a nomeia', { sub: 'Outra lagoa da bacia', conferir: true }),
  L('rincao', 'Lagoa Rincão das Éguas', ['Balneário Pinhal', 'Palmares do Sul'], 'outras', 'Nota técnica SEMA 001/2007: ao sul do limite da bacia', { sub: 'Lagoa ou rio' }),
  L('porteira', 'Lagoa da Porteira', ['Palmares do Sul'], 'outras', 'Nota técnica SEMA 001/2007', { sub: 'Lagoa ou rio' }),
  L('quintao', 'Lagoa do Quintão', ['Palmares do Sul'], 'outras', 'Nota técnica SEMA 001/2007', { sub: 'Lagoa ou rio' }),
  L('bacopari', 'Lagoa do Bacopari', ['Palmares do Sul', 'Mostardas'], 'outras', 'Nota técnica SEMA 001/2007', { sub: 'Lagoa ou rio' }),
  L('pinheiro', 'Lagoas Pinheiro, Capão Alto, Potreirinho e Cipó', ['Palmares do Sul', 'Mostardas'], 'outras', 'Nota técnica SEMA 001/2007', { sub: 'Lagoa ou rio' }),
  L('patosnorte', 'Lagoa dos Patos: trecho norte', ['Palmares do Sul', 'Capivari do Sul', 'Mostardas'], 'outras', 'IN 197/2008, art. 3º: só o estuário (ao sul de 30°55\') tem norma própria', { sub: 'Lagoa ou rio' }),
  L('patos', 'Lagoa dos Patos: estuário', ['Mostardas', 'Tavares', 'São José do Norte'], 'patos', 'INC 03/2004, art. 1º: de 30°55\' S a 32°10\' S', { sub: 'Estuário' }),
  L('barrariogrande', 'Barra de Rio Grande', ['São José do Norte'], 'patos', 'INC 03/2004, art. 1º; IN 171/2008, art. 2º', { sub: 'Barra ou desembocadura (fora de Tramandaí)' }),
  L('peixe', 'Lagoa do Peixe', ['Tavares', 'Mostardas'], 'peixe', 'Parque Nacional; IN 197/2008, art. 3º', { sub: 'Lagoa do Peixe' }),
  L('mampituba', 'Rio Mampituba', ['Torres'], 'outras', 'Bacias do RS: IN 197/2008', { sub: 'Lagoa ou rio' }),
  L('barramampituba', 'Barra do Mampituba até a Figueirinha', ['Torres'], 'mampituba', 'IN 197/2008, art. 3º: 2.000 m com norma própria', { sub: 'Barra do Mampituba até a Figueirinha' }),
  L('lagoastorres', 'Lagoas do Violão, do Jacaré e do Morro do Forno', ['Torres'], 'outras', 'Torres fica 79% na bacia do Mampituba (SEMA); bacia de cada lagoa não confirmada', { sub: 'Lagoa ou rio', conferir: true }),
  // Demais regiões do RS: principais corpos d'água; o resto se escolhe pelo município.
  L('guaiba', 'Lago Guaíba', ['Porto Alegre', 'Guaíba', 'Eldorado do Sul', 'Barra do Ribeiro', 'Viamão'], 'outras', 'Bacia G080 (Lago Guaíba)', { sub: 'Lagoa ou rio' }),
  L('deltajacui', 'Delta do Jacuí', ['Porto Alegre', 'Eldorado do Sul', 'Canoas', 'Triunfo', 'Nova Santa Rita'], 'outras', 'Bacia G080 (Lago Guaíba)', { sub: 'Lagoa ou rio' }),
  L('jacui', 'Rio Jacuí', ['Cachoeira do Sul', 'Rio Pardo', 'General Câmara', 'São Jerônimo', 'Charqueadas', 'Triunfo'], 'outras', 'Bacia G070 (Baixo Jacuí)', { sub: 'Lagoa ou rio' }),
  L('taquari', 'Rio Taquari', ['Lajeado', 'Estrela', 'Bom Retiro do Sul', 'Taquari', 'Triunfo'], 'outras', 'Bacia G040 (Taquari-Antas)', { sub: 'Lagoa ou rio' }),
  L('antas', 'Rio das Antas', ['Bento Gonçalves', 'Veranópolis', 'Nova Roma do Sul'], 'outras', 'Bacia G040 (Taquari-Antas)', { sub: 'Lagoa ou rio' }),
  L('cai', 'Rio Caí', ['Montenegro', 'São Sebastião do Caí', 'Nova Santa Rita'], 'outras', 'Bacia G030 (Caí)', { sub: 'Lagoa ou rio' }),
  L('sinos', 'Rio dos Sinos', ['São Leopoldo', 'Novo Hamburgo', 'Campo Bom', 'Sapiranga', 'Taquara'], 'outras', 'Bacia G020 (Sinos)', { sub: 'Lagoa ou rio' }),
  L('gravatai', 'Rio Gravataí', ['Gravataí', 'Cachoeirinha', 'Alvorada', 'Glorinha'], 'outras', 'Bacia G010 (Gravataí)', { sub: 'Lagoa ou rio' }),
  L('pardo', 'Rio Pardo', ['Rio Pardo', 'Candelária'], 'outras', 'Bacia G090 (Pardo)', { sub: 'Lagoa ou rio' }),
  L('vacacai', 'Rio Vacacaí', ['Santa Maria', 'São Sepé', 'Restinga Sêca'], 'outras', 'Bacia G060 (Vacacaí-Vacacaí Mirim)', { sub: 'Lagoa ou rio' }),
  L('passoreal', 'Reservatório de Passo Real', ['Salto do Jacuí'], 'outras', 'Bacia G050 (Alto Jacuí)', { sub: 'Reservatório de hidrelétrica ou açude público' }),
  L('donafrancisca', 'Reservatório de Dona Francisca', ['Agudo', 'Nova Palma'], 'outras', 'Bacia G070 (Baixo Jacuí)', { sub: 'Reservatório de hidrelétrica ou açude público' }),
  L('ernestina', 'Barragem de Ernestina', ['Ernestina', 'Tio Hugo'], 'outras', 'Bacia G050 (Alto Jacuí)', { sub: 'Reservatório de hidrelétrica ou açude público' }),
  L('camaqua', 'Rio Camaquã', ['Camaquã', 'Cristal'], 'outras', 'Bacia L030 (Camaquã)', { sub: 'Lagoa ou rio' }),
  L('arroioduro', 'Barragem do Arroio Duro', ['Camaquã'], 'outras', 'Bacia L030 (Camaquã)', { sub: 'Reservatório de hidrelétrica ou açude público' }),
  L('lagoamirim', 'Lagoa Mirim', ['Santa Vitória do Palmar', 'Jaguarão', 'Arroio Grande', 'Rio Grande'], 'mirim', 'INC MMA/SEAP 02/2004; bacia L040', { sub: 'Lagoa Mirim' }),
  L('mangueira', 'Lagoa Mangueira', ['Santa Vitória do Palmar'], 'mirim', 'INC MMA/SEAP 02/2004; bacia L040', { sub: 'Lagoa Mangueira' }),
  L('saogoncalo', 'Canal São Gonçalo', ['Pelotas', 'Rio Grande', 'Capão do Leão', 'Arroio Grande'], 'mirim', 'Liga a Lagoa Mirim à Lagoa dos Patos; abrangência da INC 02/2004 a confirmar', { sub: 'Canal São Gonçalo', conferir: true }),
  L('jaguarao', 'Rio Jaguarão', ['Jaguarão'], 'outras', 'Bacia L040 (Mirim-São Gonçalo)', { sub: 'Lagoa ou rio' }),
  L('piratini', 'Rio Piratini', ['Pedro Osório', 'Arroio Grande'], 'outras', 'Bacia L040 (Mirim-São Gonçalo)', { sub: 'Lagoa ou rio' }),
  L('santabarbara', 'Barragem Santa Bárbara', ['Pelotas'], 'outras', 'Bacia L040 (Mirim-São Gonçalo)', { sub: 'Reservatório de hidrelétrica ou açude público' }),
  L('chasqueiro', 'Barragem do Chasqueiro', ['Arroio Grande'], 'outras', 'Bacia L040 (Mirim-São Gonçalo)', { sub: 'Reservatório de hidrelétrica ou açude público' }),
  L('uruguaisc', 'Rio Uruguai: divisa com Santa Catarina', ['Iraí', 'Alpestre', 'Barra do Guarita', 'Marcelino Ramos'], 'uruguai', 'IN 193/2008, art. 1º', { sub: 'Lagoa ou rio' }),
  L('uruguaiar', 'Rio Uruguai: fronteira com a Argentina', ['Porto Mauá', 'Porto Xavier', 'São Borja', 'Itaqui', 'Uruguaiana'], 'uruguai', 'IN 193/2008, art. 1º', { sub: 'Lagoa ou rio' }),
  L('turvo', 'Rio Uruguai no Parque Estadual do Turvo', ['Derrubadas'], 'uruguai', 'IN 193/2008, art. 3º, V', { sub: 'Trecho vedado na piracema (IN 193, art. 3º, V a VIII)' }),
  L('ibicui', 'Rio Ibicuí', ['Alegrete', 'Manoel Viana', 'São Francisco de Assis', 'Itaqui', 'Uruguaiana'], 'uruguai', 'Bacia U050 (Ibicuí)', { sub: 'Lagoa ou rio' }),
  L('ijui', 'Rio Ijuí', ['Ijuí', 'Santo Ângelo'], 'uruguai', 'Bacia U090 (Ijuí)', { sub: 'Lagoa ou rio' }),
  L('piratinim', 'Rio Piratinim', ['São Luiz Gonzaga', 'Bossoroca'], 'uruguai', 'Bacia U040 (Piratinim)', { sub: 'Lagoa ou rio' }),
  L('quarai', 'Rio Quaraí', ['Quaraí', 'Barra do Quaraí'], 'uruguai', 'Bacia U060 (Quaraí)', { sub: 'Lagoa ou rio' }),
  L('santamaria', 'Rio Santa Maria', ['Rosário do Sul', 'Dom Pedrito'], 'uruguai', 'Bacia U070 (Santa Maria)', { sub: 'Lagoa ou rio' }),
  L('negro', 'Rio Negro', ['Bagé', 'Hulha Negra'], 'uruguai', 'Bacia U080 (Negro)', { sub: 'Lagoa ou rio' }),
  L('machadinho', 'Reservatório de Machadinho (rio Pelotas)', ['Machadinho', 'Maximiliano de Almeida'], 'uruguai', 'Bacia U010 (Apuaê-Inhandava)', { sub: 'Reservatório de hidrelétrica ou açude público' }),
  L('barragrande', 'Reservatório de Barra Grande (rio Pelotas)', ['Pinhal da Serra', 'Esmeralda'], 'uruguai', 'Bacia U010 (Apuaê-Inhandava)', { sub: 'Reservatório de hidrelétrica ou açude público' }),
  L('ita', 'Reservatório de Itá (rio Uruguai)', ['Aratiba', 'Marcelino Ramos', 'Mariano Moro'], 'uruguai', 'Bacia U010 (Apuaê-Inhandava)', { sub: 'Reservatório de hidrelétrica ou açude público' }),
  L('fozchapeco', 'Reservatório de Foz do Chapecó', ['Alpestre', 'Rio dos Índios'], 'uruguai', 'Bacia U100 (Várzea)', { sub: 'Reservatório de hidrelétrica ou açude público' }),
  L('mar', 'Mar e praias', ['Torres', 'Arroio do Sal', 'Capão da Canoa', 'Xangri-lá', 'Osório', 'Imbé', 'Tramandaí', 'Cidreira', 'Balneário Pinhal', 'Palmares do Sul', 'Mostardas', 'Tavares', 'São José do Norte', 'Rio Grande', 'Santa Vitória do Palmar', 'Chuí'], 'mar', 'IN 53/2005, IN 12/2012, Lei RS 15.223/2018', { sub: 'Praia (desembarcado)' }),
];

const rad = x => x * Math.PI / 180;
const distKm = ([a, b], [c, d]) => 6371 * 2 * Math.asin(Math.sqrt(Math.sin(rad(c - a) / 2) ** 2 + Math.cos(rad(a)) * Math.cos(rad(c)) * Math.sin(rad(d - b) / 2) ** 2));
const proximos = (lat, lon) => Object.keys(MUNICIPIOS).sort((a, b) => distKm([lat, lon], MUNICIPIOS[a]) - distKm([lat, lon], MUNICIPIOS[b]));

// INC 03/2004, art. 1º: estuário ao sul do paralelo de Arambaré (30°55' S).
const trechoPatos = lat => lat <= -(30 + 55 / 60) ? 'patos' : 'outras';

const sem = s => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
// Município como local de pesca: "m:<nome>:<bacia>". O regime vem da bacia escolhida.
const localDoMunicipio = (nome, bacia) => {
  if (!MUNICIPIOS[nome] || !BACIAS[bacia]) return null;
  const regime = regimeDaBacia(bacia);
  return { id: `m:${nome}:${bacia}`, nome: `${nome}: águas da bacia ${BACIAS[bacia]}`, municipios: [nome], regime, bacia,
    base: `Bacia ${bacia} (${BACIAS[bacia]}), SEMA/RS`, sub: regime === 'tramandai' ? 'Outra lagoa da bacia' : 'Lagoa ou rio' };
};
const porId = id => {
  if (String(id).startsWith('m:')) { const [, nome, bacia] = id.split(':'); return localDoMunicipio(nome, bacia); }
  return LOCAIS_PESCA.find(l => l.id === id) || null;
};
const buscarMunicipio = q => { const t = sem(q).trim(); return t ? Object.keys(MUNICIPIOS).filter(m => sem(m).includes(t)) : []; };
const buscarLocal = q => {
  const t = sem(q).trim();
  return t ? LOCAIS_PESCA.filter(l => sem(l.nome).includes(t) || l.municipios.some(m => sem(m).includes(t))) : LOCAIS_PESCA;
};

globalThis.Locais = { REGIMES, BACIAS, MUNICIPIOS, LOCAIS_PESCA, proximos, trechoPatos, buscarLocal, buscarMunicipio, baciasDe, regimeDaBacia, localDoMunicipio, porId };
})();
