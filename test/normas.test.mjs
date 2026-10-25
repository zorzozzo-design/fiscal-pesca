import { test } from 'node:test';
import assert from 'node:assert/strict';
import '../normas.js';
const { checar, multaReferencia, LOCAIS } = globalThis.Normas;

const cfg = { camarao: { inicio: '2026-01-23', fim: '2026-06-21' } };
const ab = extra => ({ area: 'tramandai', localTipo: 'Outra lagoa da bacia', data: '2026-10-25T10:00', embarcacao: 'Nenhuma', categoria: 'Profissional',
  petrechos: [], pescado: [], ...extra });
const pet = (tipo, x = {}) => ({ tipo, malhaMm: null, comprimentoM: null, alturaM: null, rgpTralha: '', qtd: 1, ...x });
const regras = (a, c = cfg) => checar(a, c).map(m => m.regra);
const tem = (a, r, c) => regras(a, c).includes(r);

test('R02: rede de espera na bacia com malha abaixo de 80 mm', () => {
  assert.ok(tem(ab({ petrechos: [pet('Rede de emalhe', { malhaMm: 70 })] }), 'R02'));
  assert.ok(!tem(ab({ petrechos: [pet('Rede de emalhe', { malhaMm: 80 })] }), 'R02'));
});

test('R03: Lagoa Tramandaí exige 90 mm e até 500 m, no lugar da R02', () => {
  const l = 'Lagoa Tramandaí';
  assert.deepEqual(regras(ab({ localTipo: l, petrechos: [pet('Rede de emalhe', { malhaMm: 85 })] })), ['R03']);
  assert.ok(tem(ab({ localTipo: l, petrechos: [pet('Rede de emalhe', { malhaMm: 90, comprimentoM: 600 })] }), 'R03'));
  assert.ok(!tem(ab({ localTipo: l, petrechos: [pet('Rede de emalhe', { malhaMm: 90, comprimentoM: 500 })] }), 'R03'));
});

test('R04: rede de espera em rio, canal ou foz', () => {
  assert.ok(tem(ab({ localTipo: 'Rio, canal ou foz', petrechos: [pet('Rede de emalhe', { malhaMm: 100 })] }), 'R04'));
  assert.ok(!tem(ab({ localTipo: 'Rio, canal ou foz', petrechos: [pet('Linha e anzol')] }), 'R04'));
});

test('R05: arrasto de qualquer tipo na bacia', () => {
  assert.ok(tem(ab({ petrechos: [pet('Rede de arrasto')] }), 'R05'));
  assert.ok(!tem(ab({ area: 'outras', petrechos: [pet('Rede de arrasto')] }), 'R05'));
});

test('R06: tarrafa de peixe abaixo de 60 mm', () => {
  assert.ok(tem(ab({ petrechos: [pet('Tarrafa', { malhaMm: 50 })] }), 'R06'));
  assert.ok(!tem(ab({ petrechos: [pet('Tarrafa', { malhaMm: 60 })] }), 'R06'));
  assert.ok(!tem(ab({ petrechos: [pet('Tarrafa de camarão', { malhaMm: 25 })] }), 'R06'));
});

test('R07: aviãozinho fora do Armazém, malha abaixo de 25 mm ou mais de 10 redes', () => {
  const a = 'Laguna do Armazém';
  assert.ok(!tem(ab({ localTipo: a, data: '2026-03-01T10:00', petrechos: [pet('Aviãozinho', { malhaMm: 25, qtd: 10 })] }), 'R07'));
  assert.ok(tem(ab({ localTipo: 'Lagoa Tramandaí', data: '2026-03-01T10:00', petrechos: [pet('Aviãozinho', { malhaMm: 25 })] }), 'R07'));
  assert.ok(tem(ab({ localTipo: a, data: '2026-03-01T10:00', petrechos: [pet('Aviãozinho', { malhaMm: 20 })] }), 'R07'));
  assert.ok(tem(ab({ localTipo: a, data: '2026-03-01T10:00', petrechos: [pet('Aviãozinho', { malhaMm: 25, qtd: 11 })] }), 'R07'));
});

test('R08: camarão fora da temporada; temporada de outro ano fica amarela', () => {
  const camarao = { especie: 'Camarão-rosa', kg: 5 };
  assert.ok(!tem(ab({ data: '2026-03-01T10:00', pescado: [camarao] }), 'R08'));
  const fora = checar(ab({ data: '2026-07-01T10:00', pescado: [camarao] }), cfg).find(m => m.regra === 'R08');
  assert.equal(fora.nivel, 'vermelho');
  assert.ok(tem(ab({ data: '2026-07-01T10:00', petrechos: [pet('Tarrafa de camarão', { malhaMm: 25 })] }), 'R08'));
  assert.equal(checar(ab({ data: '2027-02-01T10:00', pescado: [camarao] }), cfg).find(m => m.regra === 'R08').nivel, 'amarelo');
});

test('R09: bagre de 15/12 a 31/03', () => {
  const bagre = { especie: 'Bagre', kg: 2 };
  assert.ok(tem(ab({ data: '2026-12-20T10:00', pescado: [bagre] }), 'R09'));
  assert.ok(tem(ab({ data: '2026-03-31T10:00', pescado: [bagre] }), 'R09'));
  assert.ok(!tem(ab({ data: '2026-04-01T10:00', pescado: [bagre] }), 'R09'));
});

test('R10: locais proibidos da IN 17, com as exceções de cada artigo', () => {
  const L = LOCAIS.tramandai;
  const barra = L.find(l => l.startsWith('Canal da Barra'));
  const ponte = L.find(l => l.startsWith('Sobre a ponte'));
  const faixa = L.find(l => l.startsWith('Faixa de 150 m'));
  assert.ok(tem(ab({ localTipo: barra, petrechos: [pet('Linha e anzol')] }), 'R10'));
  assert.ok(!tem(ab({ localTipo: ponte, petrechos: [pet('Linha e anzol')] }), 'R10'));
  assert.ok(tem(ab({ localTipo: ponte, petrechos: [pet('Tarrafa', { malhaMm: 60 })] }), 'R10'));
  assert.ok(!tem(ab({ localTipo: faixa, petrechos: [pet('Tarrafa', { malhaMm: 60 })] }), 'R10'));
  assert.ok(tem(ab({ localTipo: faixa, petrechos: [pet('Rede de emalhe', { malhaMm: 90 })] }), 'R10'));
});

test('R11: mar, exemplar abaixo do tamanho mínimo fica amarelo', () => {
  const r = checar(ab({ area: 'mar', localTipo: 'Praia (desembarcado)', pescado: [{ especie: 'Tainha', kg: 3, menorCm: 30 }] }), cfg).find(m => m.regra === 'R11');
  assert.equal(r.nivel, 'amarelo');
  assert.match(r.texto, /35 cm/);
  assert.ok(!tem(ab({ area: 'mar', pescado: [{ especie: 'Tainha', kg: 3, menorCm: 35 }] }), 'R11'));
  assert.ok(!tem(ab({ pescado: [{ especie: 'Tainha', kg: 3, menorCm: 20 }] }), 'R11')); // lagoa: ponto em aberto
});

test('R12: emalhe no mar fora de 70 a 140 mm, acima de 4 m de altura ou sem RGP na tralha', () => {
  const mar = x => ab({ area: 'mar', localTipo: 'Praia (desembarcado)', petrechos: [pet('Rede de emalhe', { malhaMm: 100, alturaM: 3, rgpTralha: 'Sim', ...x })] });
  assert.ok(!tem(mar({}), 'R12'));
  assert.ok(tem(mar({ malhaMm: 60 }), 'R12'));
  assert.ok(tem(mar({ malhaMm: 150 }), 'R12'));
  assert.ok(tem(mar({ alturaM: 5 }), 'R12'));
  assert.ok(tem(mar({ rgpTralha: 'Não' }), 'R12'));
});

test('R13: emalhe por barco motorizado a menos de 1 milha', () => {
  const r = x => ab({ area: 'mar', petrechos: [pet('Rede de emalhe', { malhaMm: 100 })], ...x });
  assert.ok(tem(r({ embarcacao: 'Motorizada', localTipo: 'Embarcado até 1 milha da costa' }), 'R13'));
  assert.ok(!tem(r({ embarcacao: 'A remo', localTipo: 'Embarcado até 1 milha da costa' }), 'R13'));
  assert.ok(!tem(r({ embarcacao: 'Motorizada', localTipo: 'Embarcado além de 1 milha' }), 'R13'));
});

test('R14: arrasto motorizado no mar', () => {
  assert.ok(tem(ab({ area: 'mar', embarcacao: 'Motorizada', petrechos: [pet('Rede de arrasto')] }), 'R14'));
  assert.ok(!tem(ab({ area: 'mar', embarcacao: 'Nenhuma', petrechos: [pet('Rede de arrasto')] }), 'R14'));
});

test('R15: barra fora de Tramandaí de 15/03 a 15/08, só tarrafa', () => {
  const r = (data, tipo) => ab({ area: 'mar', localTipo: 'Barra ou desembocadura (fora de Tramandaí)', data, petrechos: [pet(tipo, { malhaMm: 100 })] });
  assert.ok(tem(r('2026-05-01T10:00', 'Rede de emalhe'), 'R15'));
  assert.ok(!tem(r('2026-05-01T10:00', 'Tarrafa'), 'R15'));
  assert.ok(!tem(r('2026-09-01T10:00', 'Rede de emalhe'), 'R15'));
});

test('R16: piracema nas outras águas, de 1º/11 a 31/01: só anzol e até 5 kg', () => {
  const r = (data, tipo, kg) => ab({ area: 'outras', localTipo: 'Lagoa ou rio', data, petrechos: [pet(tipo)], pescado: [{ especie: 'Traíra', kg }] });
  assert.ok(tem(r('2026-11-10T10:00', 'Tarrafa', 1), 'R16'));
  assert.ok(tem(r('2027-01-31T10:00', 'Linha e anzol', 6), 'R16'));
  assert.ok(!tem(r('2026-11-10T10:00', 'Linha e anzol', 5), 'R16'));
  assert.ok(!tem(r('2026-10-31T10:00', 'Tarrafa', 20), 'R16'));
});

test('R17: amador acima da cota (10 kg em lagoa e estuário, 15 kg no mar)', () => {
  const r = (area, kg) => ab({ area, categoria: 'Amador', petrechos: [pet('Linha e anzol')], pescado: [{ especie: 'Corvina', kg }] });
  assert.ok(tem(r('tramandai', 10.5), 'R17'));
  assert.ok(!tem(r('tramandai', 10), 'R17'));
  assert.ok(tem(r('mar', 16), 'R17'));
  assert.ok(!tem(r('mar', 15), 'R17'));
  assert.ok(!tem(ab({ categoria: 'Profissional', pescado: [{ especie: 'Corvina', kg: 50 }] }), 'R17'));
});

test('cada motivo traz norma e enquadramento', () => {
  for (const m of checar(ab({ petrechos: [pet('Rede de arrasto')] }), cfg)) {
    assert.ok(m.norma && m.enquadramento && m.texto, m.regra);
  }
});

test('multa de referência: mínimo do artigo mais R$ 20 por quilo', () => {
  assert.deepEqual(multaReferencia([{ nivel: 'vermelho', artigo: 35 }], 12.5), { artigo: 35, minimo: 950 });
  assert.deepEqual(multaReferencia([{ nivel: 'vermelho', artigo: 37 }], 10), { artigo: 37, minimo: 500 });
  assert.deepEqual(multaReferencia([{ nivel: 'vermelho', artigo: 37 }, { nivel: 'vermelho', artigo: 35 }], 0), { artigo: 35, minimo: 700 });
  assert.equal(multaReferencia([{ nivel: 'amarelo', artigo: 35 }], 10), null);
});
