import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import '../lista.js';
import '../planilha.js';
const { lerXlsx, lerEstabelecimentos, mesclarEstabelecimentos, cnpjValido } = globalThis.Planilha;
const buf = () => { const b = readFileSync(new URL('./fixtures/peixarias.xlsx', import.meta.url)); return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength); };

test('CNPJ: dígitos verificadores', () => {
  assert.ok(cnpjValido('11.222.333/0001-81'));
  assert.ok(!cnpjValido('11.222.333/0001-82'));
  assert.ok(!cnpjValido('001.222.333/0001-81'));
});

test('lê o .xlsx sem biblioteca: linhas da primeira planilha, texto com acento e caracteres especiais', async () => {
  const rows = await lerXlsx(buf());
  assert.equal(rows[0][0], 'NOME DA EMPRESA');
  assert.equal(rows[1][0], 'Peixaria Fictícia & Filhos LTDA ');
  assert.equal(rows[1][2], 'Rua Um, 10 <Centro>');
  assert.equal(rows[2][3], ''); // célula vazia no meio da linha
});

test('peixarias: colunas pelo cabeçalho, documento conferido, situação normalizada, linha vazia ignorada', async () => {
  const r = lerEstabelecimentos(await lerXlsx(buf()));
  assert.equal(r.registros.length, 4);
  const [a, b, c, d] = r.registros;
  assert.deepEqual([a.nome, a.doc, a.tipoDoc, a.situacao, a.status, a.cidade, a.responsavel],
    ['Peixaria Fictícia & Filhos LTDA', '11222333000181', 'CNPJ', 'AUTORIZADA', 'autorizada', 'Tramandaí', 'Fulano de Tal']);
  assert.deepEqual([b.tipoDoc, b.status], ['CPF', 'aguardando']);
  assert.deepEqual([c.tipoDoc, c.status], ['', 'sem informação']);
  assert.equal(d.status, 'aguardando');
  assert.deepEqual(r.avisos.map(x => [x.linha, x.tipo]), [[4, 'docInvalido'], [6, 'docRepetido']]);
});

test('peixarias: reimportar atualiza pelo documento ou nome, sem duplicar', async () => {
  const r = lerEstabelecimentos(await lerXlsx(buf()));
  const lista = [];
  const m1 = mesclarEstabelecimentos(lista, r.registros, 'h1');
  assert.deepEqual([m1.novos, m1.atualizados], [4, 0]);
  r.registros[0].situacao = 'SUSPENSA'; r.registros[0].status = 'outra';
  const m2 = mesclarEstabelecimentos(lista, r.registros, 'h2');
  assert.deepEqual([m2.novos, lista.length], [0, 4]);
  assert.equal(lista[0].situacao, 'SUSPENSA');
});
