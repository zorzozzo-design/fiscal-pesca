// Semáforo da abordagem: indica se a pessoa pode pescar na área, com os motivos. Indica, não autua:
// a confirmação é sempre a consulta oficial e o documento apresentado.
(() => {

const AREAS_COM_LISTA = new Set(['tramandai']);
const NOME_AREA = { tramandai: 'da Bacia do Tramandaí', mar: 'do mar', outras: 'das outras lagoas e rios' };
const VALIDADE_CONSULTA = 30; // dias
const VERMELHO = new Set(['Suspenso', 'Cancelado', 'Não encontrado']);

const fmtData = iso => iso.slice(0, 10).split('-').reverse().join('/');
const dias = (de, ate) => Math.round((Date.parse(ate.slice(0, 10)) - Date.parse(de.slice(0, 10))) / 864e5);

// Consulta mais recente feita até a data da abordagem.
const ultimaConsulta = (consultas, data) => (consultas || []).filter(c => c.data.slice(0, 10) <= data.slice(0, 10))
  .sort((a, b) => b.data.localeCompare(a.data))[0] || null;

const corDe = motivos => motivos.some(m => m.nivel === 'vermelho') ? 'vermelho' : motivos.some(m => m.nivel === 'amarelo') ? 'amarelo' : 'verde';
const R01 = { regra: 'R01', artigo: 37, norma: 'IN 17/2004, arts. 22 e 26', enquadramento: 'Dec. 6.514/2008, art. 37' };

// soLinha: só linha e anzol (ou nenhum petrecho), que dispensa a licença ambiental na bacia (IN 17/2004, art. 26, II).
function avaliar({ pescador: p, area, atual, data, identificadoPor, outrosMesmosDigitos, categoria = 'Profissional', soLinha = false }) {
  const motivos = [];
  const add = (nivel, texto, extra) => motivos.push({ nivel, texto, ...extra });
  const amador = categoria === 'Amador';

  if (AREAS_COM_LISTA.has(area) && amador) {
    if (soLinha) add('ok', 'Amador com linha e anzol: dispensa a licença ambiental (IN 17/2004, art. 26, II).');
    else add('vermelho', 'Amador na bacia só pode pescar com linha e anzol.', R01);
  } else if (AREAS_COM_LISTA.has(area) && soLinha && !(p?.licencas || []).some(l => l.area === area && l.temporada === atual)) {
    add('ok', 'Só linha e anzol: dispensa a licença ambiental da bacia (IN 17/2004, art. 26, II).');
  } else if (AREAS_COM_LISTA.has(area)) {
    const ls = (p?.licencas || []).filter(l => l.area === area);
    const naAtual = ls.find(l => l.temporada === atual);
    if (!atual) add('amarelo', `Nenhuma lista de licenciados ${NOME_AREA[area]} importada.`);
    else if (naAtual) add('ok', `Na lista ${atual} ${NOME_AREA[area]}, nº ${naAtual.n}.`);
    else if (ls.length) add('vermelho', `Não está na lista ${atual}. Estava em ${ls.map(l => l.temporada).sort().join(', ')}.`, R01);
    else add('vermelho', `Não está na lista de licenciados ${NOME_AREA[area]} (${atual}).`, R01);
  }

  const c = p ? ultimaConsulta(p.consultas, data) : null;
  if (amador) { /* amador não tem RGP de profissional */ }
  else if (!c) add('amarelo', 'Sem consulta ao PesqBrasil registrada.');
  else if (VERMELHO.has(c.situacao)) add('vermelho', `PesqBrasil em ${fmtData(c.data)}: RGP ${c.situacao.toLowerCase()}.`, { artigo: 37, norma: 'Lei 11.959/2009, art. 6º, §1º, III', enquadramento: 'Dec. 6.514/2008, art. 37' });
  else if (c.situacao !== 'Ativo') add('amarelo', `PesqBrasil em ${fmtData(c.data)}: ${c.situacao.toLowerCase()}. Confira o protocolo.`);
  else if (dias(c.data, data) > VALIDADE_CONSULTA) add('amarelo', `RGP ativo na consulta de ${fmtData(c.data)}, há mais de ${VALIDADE_CONSULTA} dias: refaça a consulta.`);
  else add('ok', `RGP ativo no PesqBrasil em ${fmtData(c.data)}.`);

  if (outrosMesmosDigitos > 0) add('amarelo', 'Mesmos dígitos de CPF de outra pessoa na base: confira o nome no documento.');
  if (identificadoPor !== 'cpf') add('amarelo', 'Identificado sem CPF completo: confira o documento.');

  return { cor: corDe(motivos), motivos };
}

globalThis.Semaforo = { avaliar, ultimaConsulta, corDe, AREAS_COM_LISTA };
})();
