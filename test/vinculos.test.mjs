import { test } from 'node:test';
import assert from 'node:assert/strict';
import '../vinculos.js';
const { montarVinculos, vizinhanca, chavePlaca } = globalThis.Vinculos;

const db = {
  pescadores: {
    p1: { id: 'p1', nome: 'JOAO TESTE', embarcacoes: [{ id: 'e1', nome: 'Marisco', inscricao: '441' }], veiculos: [{ id: 'v1', placa: 'abc-1d23', modelo: 'Saveiro' }] },
    p2: { id: 'p2', nome: 'PEDRO TESTE', embarcacoes: [{ id: 'e2', nome: 'Outro', inscricao: '441' }], veiculos: [] },
    p3: { id: 'p3', nome: 'ANA TESTE' },
    p4: { id: 'p4', nome: 'SEM VINCULO' },
  },
  abordagens: { a1: { id: 'a1', data: '2026-10-01T10:00', envolvidos: [{ id: 'x', pescadorId: 'p1' }, { id: 'y', pescadorId: 'p3' }] } },
  denuncias: [{ id: 'd1', data: '2026-10-02', tipo: 'Transporte de pescado', pescadorIds: [], placas: ['ABC1D23'], embarcacoes: [], pessoas: ['Fulano'] }],
};

test('placa sem traço e em maiúsculas', () => assert.equal(chavePlaca('abc-1d23'), 'ABC1D23'));

test('vínculos: embarcação com a mesma inscrição, veículo citado em denúncia, abordagem conjunta', () => {
  const g = montarVinculos(db);
  const ids = new Set(g.nodes.map(n => n.id));
  for (const id of ['p:p1', 'p:p2', 'p:p3', 'e:441', 'v:ABC1D23', 'a:a1', 'd:d1']) assert.ok(ids.has(id), id);
  assert.ok(!ids.has('p:p4'), 'pescador sem vínculo fica de fora');
  const tem = (a, b) => g.edges.some(e => (e.source === a && e.target === b) || (e.source === b && e.target === a));
  assert.ok(tem('p:p1', 'e:441')); assert.ok(tem('p:p2', 'e:441')); assert.ok(tem('p:p1', 'v:ABC1D23'));
  assert.ok(tem('d:d1', 'v:ABC1D23')); assert.ok(tem('a:a1', 'p:p1')); assert.ok(tem('a:a1', 'p:p3'));
});

test('vizinhança de um pescador: 1 nível e 2 níveis', () => {
  const g = montarVinculos(db);
  const n1 = new Set(vizinhanca(g, 'p:p1', 1).nodes.map(n => n.id));
  assert.deepEqual([...n1].sort(), ['a:a1', 'e:441', 'p:p1', 'v:ABC1D23']);
  const n2 = new Set(vizinhanca(g, 'p:p1', 2).nodes.map(n => n.id));
  for (const id of ['p:p2', 'p:p3', 'd:d1']) assert.ok(n2.has(id), id);
});
