// Semáforo da abordagem: indica se a pessoa pode pescar na área, com os motivos. Indica, não autua:
// a confirmação é sempre a consulta oficial e o documento apresentado.
(() => {

const AREAS_COM_LISTA = new Set(['tramandai', 'patos', 'mirim']);
// Onde a norma da área só admite amador com linha e anzol (IN 17/2004, art. 26, II; INC 03/2004).
const AMADOR_SO_LINHA = new Set(['tramandai', 'patos']);
const NOME_AREA = { tramandai: 'da Bacia do Tramandaí', patos: 'do estuário da Lagoa dos Patos', mirim: 'das Lagoas Mirim e Mangueira', mar: 'do mar', outras: 'das outras lagoas e rios' };
const VALIDADE_CONSULTA = 30; // dias
const VERMELHO = new Set(['Suspenso', 'Cancelado', 'Não encontrado']);

const fmtData = iso => iso.slice(0, 10).split('-').reverse().join('/');
const dias = (de, ate) => Math.round((Date.parse(ate.slice(0, 10)) - Date.parse(de.slice(0, 10))) / 864e5);

// Consulta mais recente feita até a data da abordagem.
const ultimaConsulta = (consultas, data) => (consultas || []).filter(c => c.data.slice(0, 10) <= data.slice(0, 10))
  .sort((a, b) => b.data.localeCompare(a.data))[0] || null;

const corDe = motivos => motivos.some(m => m.nivel === 'vermelho') ? 'vermelho' : motivos.some(m => m.nivel === 'amarelo') ? 'amarelo' : 'verde';
const R01_NORMA = { tramandai: 'IN 17/2004, arts. 22 e 26', patos: 'INC 03/2004, art. 7º', mirim: 'INC MMA/SEAP 02/2004 (lista de licenciados do MPA)' };
const r01 = area => ({ regra: 'R01', artigo: 37, norma: R01_NORMA[area], enquadramento: 'Dec. 6.514/2008, art. 37' });
// Dispensa de licença para linha e anzol: expressa na IN 17 (art. 26, II); as INC 03/2004 e 02/2004 não trazem dispensa conhecida.
const dispensaLinha = (area, quem) => area === 'tramandai'
  ? ['ok', `${quem} com linha e anzol: dispensa a licença ambiental (IN 17/2004, art. 26, II).`]
  : ['amarelo', `${quem} com linha e anzol fora da lista: a ${area === 'mirim' ? 'INC 02/2004' : 'INC 03/2004'} não traz dispensa expressa, confira.`];
// Amador fora das áreas acima: licença de pescador amador, salvo linha de mão ou caniço simples (IN MPA 05/2012, art. 5º, p. ún.).
const licencaAmador = embarcado => ['amarelo', `Amador: confira a licença de pescador amador${embarcado ? ' na categoria embarcada' : ''}. Dispensado só quem usa linha de mão ou caniço simples; vara com molinete ou carretilha exige licença.`,
  { regra: 'R01', artigo: 37, norma: 'IN MPA 05/2012, art. 5º', enquadramento: 'Dec. 6.514/2008, art. 37' }];

// soLinha: só linha e anzol (ou nenhum petrecho), que dispensa a licença ambiental na bacia (IN 17/2004, art. 26, II).
function avaliar({ pescador: p, area, atual, data, identificadoPor, outrosMesmosDigitos, categoria = 'Profissional', soLinha = false, embarcado = false }) {
  const motivos = [];
  const add = (nivel, texto, extra) => motivos.push({ nivel, texto, ...extra });
  const amador = categoria === 'Amador', semLicenca = categoria === 'Sem RGP ou licença';

  if (AMADOR_SO_LINHA.has(area) && amador) {
    if (soLinha) add(...dispensaLinha(area, 'Amador'));
    else add('vermelho', `Amador ${area === 'patos' ? 'no estuário da Lagoa dos Patos' : 'na Bacia do Tramandaí'} só pode pescar com linha e anzol.`, r01(area));
  } else if (amador) {
    add(...licencaAmador(embarcado));
  } else if (semLicenca) {
    // Sem RGP nem licença: só linha e anzol segue as dispensas acima; outro petrecho exige inscrição no RGP.
    if (!soLinha) add('vermelho', 'Sem RGP nem licença de pesca, com petrecho além de linha e anzol.', { regra: 'R01', artigo: 37, norma: 'Lei 11.959/2009, art. 24', enquadramento: 'Dec. 6.514/2008, art. 37' });
    else if (AREAS_COM_LISTA.has(area)) add(...dispensaLinha(area, 'Sem licença'));
    else add(...licencaAmador(embarcado));
  } else if (AREAS_COM_LISTA.has(area) && soLinha && !(p?.licencas || []).some(l => l.area === area && l.temporada === atual)) {
    add(...dispensaLinha(area, 'Só'));
  } else if (AREAS_COM_LISTA.has(area)) {
    const ls = (p?.licencas || []).filter(l => l.area === area);
    const naAtual = ls.find(l => l.temporada === atual);
    if (!atual) add('amarelo', `Nenhuma lista de licenciados ${NOME_AREA[area]} importada.`);
    else if (naAtual) add('ok', `Na lista ${atual} ${NOME_AREA[area]}, nº ${naAtual.n}.`);
    else if (ls.length) add('vermelho', `Não está na lista ${atual}. Estava em ${ls.map(l => l.temporada).sort().join(', ')}.`, r01(area));
    else add('vermelho', `Não está na lista de licenciados ${NOME_AREA[area]} (${atual}).`, r01(area));
  }

  const c = p ? ultimaConsulta(p.consultas, data) : null;
  if (amador || (semLicenca && !c)) { /* amador não tem RGP de profissional; sem RGP, a consulta é opcional */ }
  else if (!c) add('amarelo', 'Sem consulta ao PesqBrasil registrada.');
  else if (VERMELHO.has(c.situacao)) add('vermelho', `PesqBrasil em ${fmtData(c.data)}: RGP ${c.situacao.toLowerCase()}.`, { artigo: 37, norma: 'Lei 11.959/2009, art. 6º, §1º, III', enquadramento: 'Dec. 6.514/2008, art. 37' });
  else if (c.situacao !== 'Ativo') add('amarelo', `PesqBrasil em ${fmtData(c.data)}: ${c.situacao.toLowerCase()}. O protocolo não vale como licença desde 31/03/2025 (Portaria MPA 401/2024): confira.`);
  else if (dias(c.data, data) > VALIDADE_CONSULTA) add('amarelo', `RGP ativo na consulta de ${fmtData(c.data)}, há mais de ${VALIDADE_CONSULTA} dias: refaça a consulta.`);
  else add('ok', `RGP ativo no PesqBrasil em ${fmtData(c.data)}.`);

  if (outrosMesmosDigitos > 0) add('amarelo', 'Mesmos dígitos de CPF de outra pessoa na base: confira o nome no documento.');
  if (identificadoPor !== 'cpf') add('amarelo', 'Identificado sem CPF completo: confira o documento.');

  return { cor: corDe(motivos), motivos };
}

globalThis.Semaforo = { avaliar, ultimaConsulta, corDe, AREAS_COM_LISTA, AMADOR_SO_LINHA };
})();
