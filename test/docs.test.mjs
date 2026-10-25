import { test } from 'node:test';
import assert from 'node:assert/strict';
import '../docs.js';
const { itensDaAbordagem, termoApreensao, notificacao, motivoSugerido } = globalThis.Docs;

const ab = {
  data: '2026-10-25T14:30', area: 'tramandai', local: 'Barra do Rio Tramandaí', gps: { lat: -29.97512, lon: -50.12345, prec: 8 },
  petrechos: [{ tipo: 'Rede de emalhe', malhaMm: 60, comprimentoM: 30, qtd: 2 }, { tipo: 'Tarrafa', malhaMm: null, comprimentoM: null, qtd: 1 }],
  pescado: [{ especie: 'Tainha', kg: 12.5, menorCm: 33 }],
  semaforo: { cor: 'vermelho', motivos: [{ nivel: 'vermelho', texto: 'Não está na lista 2026/2027.' }, { nivel: 'ok', texto: 'RGP ativo.' }] },
  apreensao: { docTipo: 'BO/TC-COP', docNumero: '1234/2026', itens: [], destinacao: 'Doação',
    fiel: { nome: '', rg: '', cpf: '', telefone: '', endereco: '', municipioUf: '' } },
  notificacao: { motivo: 'Apresentar <licença>', comparecimento: 'PATRAM Tramandaí' },
};
const p = { nome: 'JOAO FICTICIO DA SILVA', cpf: '52998224725', rg: '1234567890', telefone: '51 99999-0000',
  endereco: 'Rua A, 10', bairro: 'Centro', municipio: 'Tramandaí' };
const cfg = { agente: { nome: 'Sd Fulano', idFunc: '123456', fracao: '4º Pel / 1º BABM' } };

test('itens da abordagem viram itens de apreensão com medidas', () => {
  assert.deepEqual(itensDaAbordagem(ab), [
    { tipo: 'Petrecho', descricao: 'Rede de emalhe, malha 60 mm, 30 m', quantidade: 2, unidade: 'un' },
    { tipo: 'Petrecho', descricao: 'Tarrafa', quantidade: 1, unidade: 'un' },
    { tipo: 'Pescado', descricao: 'Tainha, menor exemplar 33 cm', quantidade: 12.5, unidade: 'kg' },
  ]);
});

test('termo de apreensão: documento marcado, responsável, itens, destinação e agente', () => {
  const h = termoApreensao({ ...ab, apreensao: { ...ab.apreensao, itens: itensDaAbordagem(ab) } }, p, cfg);
  assert.match(h, /TERMO DE APREENSÃO E FIEL DEPOSITÁRIO/);
  assert.match(h, /\( X \)BO\/TC-COP \/ \(&nbsp;&nbsp;&nbsp;\)BA nº <b>1234\/2026<\/b>/);
  assert.match(h, /Joao Ficticio da Silva/);
  assert.match(h, /529\.982\.247-25/);
  assert.match(h, /Rede de emalhe, malha 60 mm, 30 m/);
  assert.match(h, /12,5 kg/);
  assert.match(h, /\( X \) Doação/);
  assert.match(h, /\(&nbsp;&nbsp;&nbsp;\) Destruição/);
  assert.match(h, /Sd Fulano/);
  assert.match(h, /4º Pel \/ 1º BABM/);
  assert.match(h, /1ª via – Processo \| 2ª via – Autuado \| 3ª via – Depósito/);
  assert.equal((h.match(/class="linha-item"/g) || []).length, 15); // 3 itens + 12 linhas em branco
});

test('notificação: qualificação, motivo escapado, coordenadas e agente', () => {
  const h = notificacao(ab, p, cfg);
  assert.match(h, /NOTIFICAÇÃO AMBIENTAL/);
  assert.match(h, /25\/10\/2026/);
  assert.match(h, /14:30/);
  assert.match(h, /Rua A, 10/);
  assert.match(h, /Apresentar &lt;licença&gt;/);
  assert.match(h, /-29,97512/);
  assert.match(h, /WGS 84/);
  assert.match(h, /PATRAM Tramandaí/);
  assert.match(h, /ARTIGO 330 DO CÓDIGO PENAL/);
  assert.match(h, /Sd Fulano/);
});

test('motivo sugerido: irregularidades; sem elas, os pontos a conferir', () => {
  assert.equal(motivoSugerido(ab), 'Não está na lista 2026/2027.');
  assert.equal(motivoSugerido({ semaforo: { motivos: [{ nivel: 'ok', texto: 'Na lista.' }, { nivel: 'amarelo', texto: 'Sem consulta.' }] } }), 'Sem consulta.');
});

test('logos opcionais: sem imagem não quebra, com imagem entra no cabeçalho', () => {
  assert.doesNotMatch(notificacao(ab, p, cfg), /<img/);
  assert.match(notificacao(ab, p, { ...cfg, logos: { brasao: 'data:image/png;base64,AAA', comando: 'data:image/png;base64,BBB' } }), /<img src="data:image\/png;base64,AAA"/);
});

test('abordagem antiga vira abordagem com um envolvido', () => {
  const { normalizarAb } = globalThis.Docs;
  const velha = { id: 'x', data: '2026-10-25T10:00', area: 'tramandai', local: 'L', gps: null, localPescaId: 'tramandai', localTipo: 'Lagoa Tramandaí', obs: 'o',
    pescadorId: 'p1', identificadoPor: 'cpf', cpfInformado: '52998224725', categoria: 'Profissional', embarcacao: 'Nenhuma', comprimentoEmbM: null,
    petrechos: [{ tipo: 'Tarrafa' }], pescado: [], providencia: 'Notificação', documento: '12', notificacao: { motivo: 'm' }, semaforo: { cor: 'amarelo', motivos: [] } };
  const n = normalizarAb(velha);
  assert.equal(n.envolvidos.length, 1);
  const e = n.envolvidos[0];
  assert.equal(e.pescadorId, 'p1'); assert.equal(e.localTipo, 'Lagoa Tramandaí'); assert.deepEqual(e.providencias, [{ tipo: 'Notificação', numero: '12' }]);
  assert.equal(e.notificacao.motivo, 'm'); assert.equal(n.area, 'tramandai'); assert.equal(n.obs, 'o');
  assert.equal(n.pescadorId, undefined);
  assert.equal(normalizarAb(n), n, 'já no formato novo: não muda');
});

test('pendências da abordagem para o administrativo', () => {
  const { pendenciasDe } = globalThis.Docs;
  const pess = { p1: { id: 'p1', nome: 'JOAO TESTE', consultas: [] }, p2: { id: 'p2', nome: 'ANA TESTE', rg: '1', endereco: 'R', municipio: 'M', consultas: [{ data: '2026-10-25T09:00' }] } };
  const a = { id: 'a1', data: '2026-10-25T10:00', envolvidos: [
    { id: 'e1', pescadorId: 'p1', categoria: 'Profissional', semaforo: { cor: 'vermelho' }, providencias: [{ tipo: 'BO/TC', numero: '' }],
      apreensao: { itens: [], fiel: {}, destinacao: '' }, notificacao: { motivo: 'x' } },
    { id: 'e2', pescadorId: 'p2', categoria: 'Profissional', semaforo: { cor: 'verde' }, providencias: [{ tipo: 'Abordagem', numero: '' }] }] };
  const ps = pendenciasDe(a, id => pess[id]);
  const chaves = ps.map(p => p.chave);
  assert.ok(chaves.includes('e1:num:BO/TC'));
  assert.ok(chaves.includes('e1:ap-itens'));
  assert.ok(chaves.includes('e1:ap-destino'));
  assert.ok(chaves.includes('e1:qualificacao'));
  assert.ok(chaves.includes('e1:consulta'));
  assert.ok(chaves.includes('e1:comparecimento'));
  assert.ok(!chaves.some(c => c.startsWith('e2:')), 'regular, consultado e qualificado: nada pendente');
  const resolvida = pendenciasDe({ ...a, resolvidas: ['e1:comparecimento'] }, id => pess[id]).map(p => p.chave);
  assert.ok(!resolvida.includes('e1:comparecimento'));
  const semDoc = pendenciasDe({ ...a, envolvidos: [{ ...a.envolvidos[0], providencias: [] }] }, id => pess[id]).map(p => p.chave);
  assert.ok(semDoc.includes('e1:sem-documento'));
});

test('termo de apreensão mostra a embarcação e o veículo usados', () => {
  const pe = { ...p, embarcacoes: [{ id: 'e1', nome: 'Marisco', inscricao: '4410', comprimentoM: 7, propulsao: 'Motorizada' }], veiculos: [{ id: 'v1', placa: 'ABC1D23', modelo: 'Saveiro' }] };
  const h = termoApreensao({ ...ab, embarcacaoId: 'e1', veiculoId: 'v1' }, pe, {});
  assert.match(h, /Embarcação: Marisco, inscrição 4410, 7 m, Motorizada/);
  assert.match(h, /Veículo: ABC1D23, Saveiro/);
  assert.doesNotMatch(termoApreensao(ab, pe, {}), /Embarcação:/);
});
