import { test } from 'node:test';
import assert from 'node:assert/strict';
import '../locais.js';
const { REGIMES, LOCAIS_PESCA, MUNICIPIOS, proximos, trechoPatos, buscarLocal } = globalThis.Locais;

test('todo local tem regime conhecido, município cadastrado e base da classificação', () => {
  for (const l of LOCAIS_PESCA) {
    assert.ok(REGIMES[l.regime], l.nome);
    assert.ok(l.municipios.length && l.municipios.every(m => MUNICIPIOS[m]), l.nome);
    assert.ok(l.base, l.nome);
  }
  assert.equal(new Set(LOCAIS_PESCA.map(l => l.id)).size, LOCAIS_PESCA.length);
});

test('cada regime diz se tem lista e quais normas aplica', () => {
  assert.equal(REGIMES.tramandai.lista, true);
  assert.equal(REGIMES.patos.lista, true);
  assert.equal(REGIMES.outras.lista, false);
  assert.ok(REGIMES.tramandai.normas.some(n => n.includes('IN MMA 17/2004')));
  assert.ok(REGIMES.patos.normas.some(n => n.includes('INC MMA/SEAP 03/2004')));
});

test('locais-chave caem no regime certo', () => {
  const regime = nome => LOCAIS_PESCA.find(l => l.nome === nome).regime;
  assert.equal(regime('Lagoa Tramandaí'), 'tramandai');
  assert.equal(regime('Lagoa Itapeva'), 'tramandai');
  assert.equal(regime('Lagoa do Quintão'), 'outras');
  assert.equal(regime('Lagoa do Peixe'), 'peixe');
  assert.equal(regime('Lagoa dos Patos: estuário'), 'patos');
  assert.equal(regime('Lagoa dos Patos: trecho norte'), 'outras');
  assert.equal(regime('Barra do Mampituba até a Figueirinha'), 'mampituba');
  assert.equal(regime('Mar e praias'), 'mar');
});

test('GPS: municípios mais próximos primeiro', () => {
  assert.equal(proximos(-29.985, -50.134)[0], 'Tramandaí');
  assert.equal(proximos(-29.34, -49.73)[0], 'Torres');
  assert.equal(proximos(-32.01, -52.03)[0], 'São José do Norte');
});

test('Lagoa dos Patos: estuário ao sul de 30°55\'', () => {
  assert.equal(trechoPatos(-31.1), 'patos');
  assert.equal(trechoPatos(-30.5), 'outras');
});

test('busca por lagoa ou município, sem acento', () => {
  assert.ok(buscarLocal('quintao').some(l => l.nome === 'Lagoa do Quintão'));
  assert.ok(buscarLocal('osorio').some(l => l.nome.includes('Pinguela')));
  assert.equal(buscarLocal('').length, LOCAIS_PESCA.length);
});
