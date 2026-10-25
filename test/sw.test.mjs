import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { hashDoApp } from '../tools/versao.mjs';

test('versão do cache acompanha os arquivos do app (senão os celulares ficam na versão antiga)', () => {
  const sw = readFileSync(new URL('../sw.js', import.meta.url), 'utf8');
  assert.equal(sw.match(/\/\/ conteudo: (\w+)/)?.[1], hashDoApp(), 'Arquivos mudaram: rode "node tools/versao.mjs" antes de publicar.');
});
