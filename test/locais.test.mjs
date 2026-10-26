import { test } from 'node:test';
import assert from 'node:assert/strict';
import '../municipios-rs.js';
import '../locais.js';
const { REGIMES, LOCAIS_PESCA, MUNICIPIOS, proximos, trechoPatos, buscarLocal, buscarMunicipio, porId, regimeDaBacia, baciasDe } = globalThis.Locais;

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

test('RS inteiro: 497 municípios, cada um com bacia e regime', () => {
  assert.equal(Object.keys(MUNICIPIOS).length, 497);
  for (const m of Object.keys(MUNICIPIOS)) { const bs = baciasDe(m); assert.ok(bs.length, m); for (const [b] of bs) assert.ok(REGIMES[regimeDaBacia(b)], m + ' ' + b); }
});

test('bacia define o regime: Uruguai, Tramandaí e demais', () => {
  assert.equal(regimeDaBacia('U050'), 'uruguai');
  assert.equal(regimeDaBacia('L010'), 'tramandai');
  assert.equal(regimeDaBacia('G080'), 'outras');
  assert.equal(regimeDaBacia('L040'), 'outras');
  assert.deepEqual(baciasDe('Uruguaiana').map(b => b[0]), ['U050', 'U060']);
});

test('município vira local de pesca, pela bacia escolhida', () => {
  const l = porId('m:Uruguaiana:U060');
  assert.equal(l.regime, 'uruguai'); assert.deepEqual(l.municipios, ['Uruguaiana']); assert.match(l.nome, /Quaraí/);
  assert.equal(porId('m:Porto Alegre:G080').regime, 'outras');
  assert.equal(porId('m:Xangri-lá:L010').regime, 'tramandai');
  assert.equal(porId('m:Nada:G080'), null);
  assert.equal(porId('lagoamirim').regime, 'mirim');
});

test('busca de município sem acento', () => {
  assert.deepEqual(buscarMunicipio('sao borja'), ['São Borja']);
  assert.ok(buscarLocal('guaiba').some(l => l.nome === 'Lago Guaíba'));
  assert.equal(proximos(-29.76, -57.08)[0], 'Uruguaiana');
});

test('lagoas do peixe-rei-bicudo estão nos locais (Emboaba e Caconde em peixoto; Horácio e Lessa em bicudo)', () => {
  const { LOCAIS_PESCA } = globalThis.Locais;
  assert.match(LOCAIS_PESCA.find(l => l.id === 'peixoto').nome, /Caconde/);
  const b = LOCAIS_PESCA.find(l => l.id === 'bicudo');
  assert.ok(b && /Horácio/.test(b.nome) && /Lessa/.test(b.nome) && b.regime === 'tramandai');
});
