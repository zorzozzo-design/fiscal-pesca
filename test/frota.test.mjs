import { test } from 'node:test';
import assert from 'node:assert/strict';
import '../lista.js';
import '../frota.js';
const { lerFrotaPdf, lerFrotaPlanilha, mesclarFrota, buscarFrota, lembreteFrota, fiscalizacoesDe } = globalThis.Frota;

// Itens como o pdf.js entrega (uma célula por item), nas posições do PDF do MPA. Dados fictícios.
const X = [56, 96, 137, 177, 217, 257, 297, 338, 378, 418, 458, 498, 539, 579, 619, 659, 699, 740];
const CAB = ['Nome da Embarcação', 'Número de Inscrição no RGP (PPP ou RAEP)', 'Número de Inscrição na Marinha do Brasil', 'AB', 'Comprimento', 'Propulsão',
  'HP', 'Capacidade do Porão', 'Volume do Tanque', 'Tripulação', 'Número de Covos', 'Status', 'UF', 'Número da Frota', 'Código IN', 'Petrecho', 'Ano de Construção', 'Índice'];
// Valores alinhados à direita começam mais adiante na coluna (tripulação, covos, ano, índice).
const DESL = { 9: 32, 10: 28, 16: 20, 17: 32 };
const linha = (p, y, vals) => vals.flatMap((s, i) => s === '' ? [] : [{ p, x: X[i] + (DESL[i] || 0), y, w: 10, s }, { p, x: X[i] + 20, y, w: 5, s: ' ' }]);
const itens = [
  ...CAB.map((s, i) => ({ p: 1, x: X[i], y: 514, w: 20, s })),
  ...linha(1, 503, ['BOTO FICTICIO', 'RS00012345', '4,43E+09', '3.0', '9.50', 'Motor', '45.00', '', '', '3', '', 'Deferida', 'RS', '2.04.001', '2.4', '2. Rede de Emalhe', '2005', '1']),
  ...linha(1, 492, ['GARÇA DO MAR', 'RS00054321', '442M2015001234', '1.2', '7.00', 'Remo', '', '', '', '2', '60', 'Cancelada', 'RS', '5.01.004', '5.3', '5. Armadilha', '1998', '2']),
  ...linha(2, 514, ['TAINHA FICTA', 'SC00099999', '0230095631', '12.0', '11.00', 'Motor, Vela', '90.00', '1000.00', '200.00', '4', '', 'Suspensa', 'SC', '3.02.002', '3.9', '3. Rede de Arrasto', '2010', '3']),
];

test('lerFrotaPdf: lê as colunas pelo cabeçalho, em todas as páginas', () => {
  const { registros, avisos } = lerFrotaPdf(itens);
  assert.equal(registros.length, 3);
  assert.deepEqual(registros[0], { nome: 'BOTO FICTICIO', rgp: 'RS00012345', marinha: '', marinhaPerdida: true, ab: 3, comprimentoM: 9.5, propulsao: 'Motor',
    hp: 45, tripulacao: 3, covos: null, status: 'Deferida', uf: 'RS', petrecho: 'Rede de Emalhe', ano: 2005 });
  assert.equal(registros[1].marinha, '442M2015001234');
  assert.equal(registros[1].covos, 60);
  assert.equal(registros[2].propulsao, 'Motor, Vela');
  assert.equal(registros[2].status, 'Suspensa');
  assert.match(avisos[0], /Marinha/); // números da Marinha perdidos na exportação (notação científica)
});

test('lerFrotaPdf: sem o cabeçalho do MPA, erro claro', () => {
  assert.throws(() => lerFrotaPdf([{ p: 1, x: 10, y: 10, s: 'Outra coisa' }]), /Nome da Embarcação/);
});

test('lerFrotaPlanilha: mesma lista em .xlsx', () => {
  const { registros } = lerFrotaPlanilha([['Relatório'], CAB, ['BOTO FICTICIO', 'RS00012345', '4430012345', '3', '9.5', 'Motor', '45', '', '', '3', '', 'Deferida', 'RS', '', '', '2. Rede de Emalhe', '2005', '1']]);
  assert.equal(registros.length, 1);
  assert.equal(registros[0].marinha, '4430012345');
  assert.equal(registros[0].marinhaPerdida, false);
});

test('mesclarFrota: mesmo RGP é a mesma embarcação; a lista nova vale', () => {
  const lista = [];
  assert.deepEqual(mesclarFrota(lista, lerFrotaPdf(itens).registros), { novos: 3, atualizados: 0 });
  const r = mesclarFrota(lista, [{ ...lista[0], status: 'Cancelada' }]);
  assert.deepEqual(r, { novos: 0, atualizados: 1 });
  assert.equal(lista.length, 3);
  assert.equal(lista.find(e => e.rgp === 'RS00012345').status, 'Cancelada');
});

test('buscarFrota: nome sem acento, RGP e número da Marinha', () => {
  const lista = lerFrotaPdf(itens).registros;
  assert.deepEqual(buscarFrota(lista, 'garca').map(e => e.rgp), ['RS00054321']);
  assert.deepEqual(buscarFrota(lista, 'rs0001').map(e => e.rgp), ['RS00012345']);
  assert.deepEqual(buscarFrota(lista, '2015001234').map(e => e.rgp), ['RS00054321']);
  assert.equal(buscarFrota(lista, '').length, 3);
});

test('lembreteFrota: atualizar a cada 6 meses', () => {
  assert.equal(lembreteFrota(null, '2026-11-27'), null); // sem lista, a aba já orienta a importar
  assert.equal(lembreteFrota('2026-06-01T10:00', '2026-11-27'), null);
  assert.match(lembreteFrota('2026-05-01T10:00', '2026-11-27'), /6 meses/);
});

test('fiscalizacoesDe: abordagens com a embarcação, pelo RGP ou pela inscrição na Marinha', () => {
  const e = { rgp: 'RS00054321', marinha: '442M2015001234' };
  const pessoa = id => ({ p1: { embarcacoes: [{ id: 'b1', rgp: 'rs00054321' }] }, p2: { embarcacoes: [{ id: 'b2', inscricao: '442M2015001234' }, { id: 'b3', rgp: 'X' }] } })[id];
  const abs = [
    { id: 'a1', data: '2026-10-01T10:00', envolvidos: [{ pescadorId: 'p1', embarcacaoId: 'b1' }] },
    { id: 'a2', data: '2026-11-01T10:00', envolvidos: [{ pescadorId: 'p2', embarcacaoId: 'b2' }] },
    { id: 'a3', data: '2026-11-02T10:00', envolvidos: [{ pescadorId: 'p2', embarcacaoId: 'b3' }] },
  ];
  assert.deepEqual(fiscalizacoesDe(e, abs, pessoa).map(a => a.id), ['a2', 'a1']);
  assert.deepEqual(fiscalizacoesDe({ rgp: 'RS1', marinha: '' }, abs, pessoa), []);
});

test('CSV do Excel: ";" e acentos em Latin-1 (Windows-1252), com aspas', () => {
  const { lerCsv, textoDe } = globalThis.Frota;
  const txt = CAB.join(';') + '\r\n' + '"BOTO; FICTICIO";RS00012345;4430012345;3.0;9.50;Motor;45.00;;;3;;Deferida;RS;2.04.001;2.4;2. Rede de Emalhe;2005;1\r\n'
    + 'GARÇA;RS00054321;442M2015001234;;7.00;Remo;;;;2;60;Cancelada;RS;;;5. Armadilha;1998;2\r\n';
  const latin1 = Uint8Array.from([...txt].map(c => c.charCodeAt(0))).buffer; // "Ç" e "ã" em um byte
  const t = textoDe(latin1);
  assert.ok(t.startsWith('Nome da Embarcação;'));
  assert.equal(textoDe(new TextEncoder().encode('Embarcação').buffer), 'Embarcação'); // UTF-8 continua valendo
  const { registros } = lerFrotaPlanilha(lerCsv(t));
  assert.equal(registros.length, 2);
  assert.equal(registros[0].nome, 'BOTO; FICTICIO');
  assert.equal(registros[0].marinha, '4430012345');
  assert.equal(registros[1].nome, 'GARÇA');
  assert.equal(registros[1].covos, 60);
});
