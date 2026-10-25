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
