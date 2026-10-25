// Locais de pesca de Torres a São José do Norte e o regime de normas de cada um.
// Fonte: aba "Legislação" do documento do projeto ("Onde vale cada norma"). Script comum, sem módulos.
(() => {

const REGIMES = {
  tramandai: { nome: 'Bacia do Rio Tramandaí', lista: true, normas: ['IN MMA 17/2004', 'Portaria anual do camarão (2026: Portaria MPA/MMA 48/2026)'] },
  patos: { nome: 'Lagoa dos Patos, estuário', lista: true, normas: ['INC MMA/SEAP 03/2004', 'IN IBAMA 171/2008 (barra)'] },
  outras: { nome: 'Lagoas e rios fora das bacias com norma própria', lista: false, normas: ['IN IBAMA 43/2004 (petrechos proibidos, o ano todo)', 'IN IBAMA 197/2008 (piracema, 1º/11 a 31/01)', 'IN IBAMA 171/2008 (barras)'] },
  peixe: { nome: 'Parque Nacional da Lagoa do Peixe', lista: false, normas: ['Decreto 93.546/1986', 'Termo de Compromisso ICMBio (2019)'] },
  mampituba: { nome: 'Barra do Mampituba até a Figueirinha', lista: false, normas: ['Portaria SUDEPE 006/1984 (texto não localizado)'] },
  mar: { nome: 'Mar e praias', lista: false, normas: ['IN MMA 53/2005 (tamanho mínimo)', 'IN Interministerial 12/2012 (emalhe)', 'IN IBAMA 171/2008 (barras)', 'Lei RS 15.223/2018 (arrasto)'] },
};

// Sede dos municípios (aprox.), só para ordenar a lista pelo GPS.
const MUNICIPIOS = {
  'Torres': [-29.335, -49.727], 'Dom Pedro de Alcântara': [-29.367, -49.852], 'Três Cachoeiras': [-29.449, -49.927],
  'Arroio do Sal': [-29.548, -49.888], 'Terra de Areia': [-29.578, -50.071], 'Três Forquilhas': [-29.536, -50.071],
  'Itati': [-29.497, -50.102], 'Maquiné': [-29.676, -50.207], 'Capão da Canoa': [-29.746, -50.010], 'Xangri-lá': [-29.801, -50.044],
  'Osório': [-29.887, -50.270], 'Imbé': [-29.975, -50.128], 'Tramandaí': [-29.985, -50.134], 'Cidreira': [-30.181, -50.205],
  'Balneário Pinhal': [-30.243, -50.233], 'Palmares do Sul': [-30.258, -50.510], 'Capivari do Sul': [-30.144, -50.516],
  'Mostardas': [-31.107, -50.917], 'Tavares': [-31.285, -51.093], 'São José do Norte': [-32.015, -52.041],
};

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
  L('barrososorio', 'Lagoa dos Barros (Osório)', ['Osório'], 'tramandai', 'Entre a Itapeva e a Cerquinha; a IN 17 não a nomeia', { sub: 'Outra lagoa da bacia', conferir: true }),
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
  L('lagoastorres', 'Lagoas do Violão, do Jacaré e do Morro do Forno', ['Torres'], 'outras', 'Bacia não confirmada', { sub: 'Lagoa ou rio', conferir: true }),
  L('mar', 'Mar e praias', Object.keys(MUNICIPIOS).filter(m => !['Dom Pedro de Alcântara', 'Três Cachoeiras', 'Terra de Areia', 'Três Forquilhas', 'Itati', 'Maquiné', 'Osório', 'Capivari do Sul'].includes(m)), 'mar', 'IN 53/2005, IN 12/2012, Lei RS 15.223/2018', { sub: 'Praia (desembarcado)' }),
];

const rad = x => x * Math.PI / 180;
const distKm = ([a, b], [c, d]) => 6371 * 2 * Math.asin(Math.sqrt(Math.sin(rad(c - a) / 2) ** 2 + Math.cos(rad(a)) * Math.cos(rad(c)) * Math.sin(rad(d - b) / 2) ** 2));
const proximos = (lat, lon) => Object.keys(MUNICIPIOS).sort((a, b) => distKm([lat, lon], MUNICIPIOS[a]) - distKm([lat, lon], MUNICIPIOS[b]));

// INC 03/2004, art. 1º: estuário ao sul do paralelo de Arambaré (30°55' S).
const trechoPatos = lat => lat <= -(30 + 55 / 60) ? 'patos' : 'outras';

const sem = s => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const buscarLocal = q => {
  const t = sem(q).trim();
  return t ? LOCAIS_PESCA.filter(l => sem(l.nome).includes(t) || l.municipios.some(m => sem(m).includes(t))) : LOCAIS_PESCA;
};

globalThis.Locais = { REGIMES, MUNICIPIOS, LOCAIS_PESCA, proximos, trechoPatos, buscarLocal };
})();
