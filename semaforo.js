// Semáforo da abordagem: indica se a pessoa pode pescar na área, com os motivos. Indica, não autua:
// a confirmação é sempre a consulta oficial e o documento apresentado.
(() => {

const AREAS_COM_LISTA = new Set(['tramandai']);
const NOME_AREA = { tramandai: 'da Bacia do Tramandaí', mar: 'do mar' };
const VALIDADE_CONSULTA = 30; // dias
const VERMELHO = new Set(['Suspenso', 'Cancelado', 'Não encontrado']);

const fmtData = iso => iso.slice(0, 10).split('-').reverse().join('/');
const dias = (de, ate) => Math.round((Date.parse(ate.slice(0, 10)) - Date.parse(de.slice(0, 10))) / 864e5);

// Consulta mais recente feita até a data da abordagem.
const ultimaConsulta = (consultas, data) => (consultas || []).filter(c => c.data.slice(0, 10) <= data.slice(0, 10))
  .sort((a, b) => b.data.localeCompare(a.data))[0] || null;

function avaliar({ pescador: p, area, atual, data, identificadoPor, outrosMesmosDigitos }) {
  const motivos = [];
  const add = (nivel, texto) => motivos.push({ nivel, texto });

  if (AREAS_COM_LISTA.has(area)) {
    const ls = (p?.licencas || []).filter(l => l.area === area);
    const naAtual = ls.find(l => l.temporada === atual);
    if (!atual) add('amarelo', `Nenhuma lista de licenciados ${NOME_AREA[area]} importada.`);
    else if (naAtual) add('ok', `Na lista ${atual} ${NOME_AREA[area]}, nº ${naAtual.n}.`);
    else if (ls.length) add('vermelho', `Não está na lista ${atual}. Estava em ${ls.map(l => l.temporada).sort().join(', ')}.`);
    else add('vermelho', `Não está na lista de licenciados ${NOME_AREA[area]} (${atual}).`);
  }

  const c = p ? ultimaConsulta(p.consultas, data) : null;
  if (!c) add('amarelo', 'Sem consulta ao PesqBrasil registrada.');
  else if (VERMELHO.has(c.situacao)) add('vermelho', `PesqBrasil em ${fmtData(c.data)}: RGP ${c.situacao.toLowerCase()}.`);
  else if (c.situacao !== 'Ativo') add('amarelo', `PesqBrasil em ${fmtData(c.data)}: ${c.situacao.toLowerCase()}. Confira o protocolo.`);
  else if (dias(c.data, data) > VALIDADE_CONSULTA) add('amarelo', `RGP ativo na consulta de ${fmtData(c.data)}, há mais de ${VALIDADE_CONSULTA} dias: refaça a consulta.`);
  else add('ok', `RGP ativo no PesqBrasil em ${fmtData(c.data)}.`);

  if (outrosMesmosDigitos > 0) add('amarelo', 'Mesmos dígitos de CPF de outra pessoa na base: confira o nome no documento.');
  if (identificadoPor !== 'cpf') add('amarelo', 'Identificado sem CPF completo: confira o documento.');

  const cor = motivos.some(m => m.nivel === 'vermelho') ? 'vermelho' : motivos.some(m => m.nivel === 'amarelo') ? 'amarelo' : 'verde';
  return { cor, motivos };
}

globalThis.Semaforo = { avaliar, ultimaConsulta, AREAS_COM_LISTA };
})();
