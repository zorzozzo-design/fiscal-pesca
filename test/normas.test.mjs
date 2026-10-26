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

const est = extra => ab({ area: 'patos', localTipo: 'Estuário', data: '2026-11-10T10:00', ...extra });

test('R18: estuário, rede de espera abaixo de 100 mm; 140 com bagre; 40 só com peixe-rei', () => {
  assert.ok(tem(est({ petrechos: [pet('Rede de emalhe', { malhaMm: 90 })] }), 'R18'));
  assert.ok(!tem(est({ petrechos: [pet('Rede de emalhe', { malhaMm: 100 })] }), 'R18'));
  assert.ok(tem(est({ petrechos: [pet('Rede de emalhe', { malhaMm: 120 })], pescado: [{ especie: 'Bagre', kg: 5 }] }), 'R18'));
  assert.ok(!tem(est({ petrechos: [pet('Rede de emalhe', { malhaMm: 45 })], pescado: [{ especie: 'Peixe-rei', kg: 2 }] }), 'R18'));
  assert.ok(!tem(ab({ petrechos: [pet('Rede de emalhe', { malhaMm: 90 })] }), 'R18'));
});

test('R19: estuário, rede de saco ou aviãozinho abaixo de 24 mm ou mais de 10 redes', () => {
  const e = x => est({ data: '2026-03-10T10:00', petrechos: [pet('Rede de saco', { malhaMm: 24, qtd: 10, ...x })] });
  assert.ok(!tem(e({}), 'R19'));
  assert.ok(tem(e({ malhaMm: 20 }), 'R19'));
  assert.ok(tem(e({ qtd: 11 }), 'R19'));
});

test('R20 e R21: estuário, arrasto e embarcação acima de 12 m', () => {
  assert.ok(tem(est({ petrechos: [pet('Rede de arrasto')] }), 'R20'));
  assert.ok(tem(est({ embarcacao: 'Motorizada', comprimentoEmbM: 13 }), 'R21'));
  assert.ok(!tem(est({ embarcacao: 'Motorizada', comprimentoEmbM: 12 }), 'R21'));
});

test('R22: estuário, mais de 1.830 m de rede de espera', () => {
  assert.ok(tem(est({ petrechos: [pet('Rede de emalhe', { malhaMm: 100, comprimentoM: 1000, qtd: 2 })] }), 'R22'));
  assert.ok(!tem(est({ petrechos: [pet('Rede de emalhe', { malhaMm: 100, comprimentoM: 900, qtd: 2 })] }), 'R22'));
});

test('R23: estuário, calendário por espécie', () => {
  const e = (data, especie) => est({ data, pescado: [{ especie, kg: 5 }] });
  assert.ok(!tem(e('2026-11-10T10:00', 'Tainha'), 'R23'));
  assert.ok(tem(e('2026-07-10T10:00', 'Tainha'), 'R23'));
  assert.ok(tem(e('2026-03-10T10:00', 'Corvina'), 'R23'));
  assert.ok(!tem(e('2026-02-10T10:00', 'Corvina'), 'R23'));
  assert.ok(tem(e('2026-12-10T10:00', 'Bagre'), 'R23'));
  assert.ok(!tem(e('2026-04-10T10:00', 'Bagre'), 'R23'));
  assert.ok(tem(e('2026-06-10T10:00', 'Camarão-rosa'), 'R23'));
  assert.ok(!tem(e('2026-03-10T10:00', 'Camarão-rosa'), 'R23'));
});

test('R24: estuário, camarão-rosa abaixo de 9 cm fica amarelo', () => {
  const r = checar(est({ data: '2026-03-10T10:00', pescado: [{ especie: 'Camarão-rosa', kg: 2, menorCm: 8 }] }), cfg).find(m => m.regra === 'R24');
  assert.equal(r.nivel, 'amarelo');
  assert.ok(!tem(est({ data: '2026-03-10T10:00', pescado: [{ especie: 'Camarão-rosa', kg: 2, menorCm: 9 }] }), 'R24'));
});

test('R25 e R26: Lagoa do Peixe e barra do Mampituba sempre pedem conferência', () => {
  assert.equal(checar(ab({ area: 'peixe', localTipo: 'Lagoa do Peixe' }), cfg).find(m => m.regra === 'R25').nivel, 'amarelo');
  assert.equal(checar(ab({ area: 'mampituba', localTipo: 'Barra do Mampituba até a Figueirinha' }), cfg).find(m => m.regra === 'R26').nivel, 'amarelo');
});

test('piracema não vale no estuário, na Lagoa do Peixe nem na barra do Mampituba', () => {
  for (const area of ['patos', 'peixe', 'mampituba']) assert.ok(!tem(ab({ area, petrechos: [pet('Tarrafa')] }), 'R16'), area);
});

test('R27: espécie ameaçada é vermelho em qualquer local e época', () => {
  const peixe = especie => ({ especie, kg: 1, menorCm: null });
  for (const area of ['tramandai', 'patos', 'outras', 'mar', 'peixe'])
    for (const sp of ['Bagre-branco', 'Bagre (Genidens planifrons)', 'Miraguaia', 'Garoupa-verdadeira', 'Peixe-rei (Odontesthes bicudo)']) {
      const r = checar(ab({ area, data: '2026-07-10T10:00', pescado: [peixe(sp)] }), cfg).find(m => m.regra === 'R27');
      assert.equal(r?.nivel, 'vermelho', `${sp} em ${area}`);
      assert.match(r.norma, /15\.223/);
    }
});

test('R27: bagre, garoupa, cação e raia sem espécie pedem conferência; peixe-rei comum não', () => {
  const nivel = sp => checar(ab({ pescado: [{ especie: sp, kg: 1 }] }), cfg).find(m => m.regra === 'R27')?.nivel;
  for (const sp of ['Bagre (espécie não identificada)', 'Garoupa', 'Cação', 'Raia', 'Viola']) assert.equal(nivel(sp), 'amarelo', sp);
  for (const sp of ['Peixe-rei', 'Tainha', 'Jundiá']) assert.equal(nivel(sp), undefined, sp);
});

test('R28: IN 43/2004 nas outras águas, o ano todo', () => {
  const out = x => ab({ area: 'outras', localTipo: 'Lagoa ou rio', data: '2026-07-10T10:00', ...x });
  const nivel = a => checar(a, cfg).filter(m => m.regra === 'R28').map(m => m.nivel);
  assert.deepEqual(nivel(out({ petrechos: [pet('Rede de emalhe', { malhaMm: 60 })] })), ['vermelho']);
  assert.deepEqual(nivel(out({ petrechos: [pet('Rede de emalhe', { malhaMm: 70 })] })), []);
  assert.deepEqual(nivel(out({ petrechos: [pet('Tarrafa', { malhaMm: 40 })] })), ['vermelho']);
  assert.deepEqual(nivel(out({ petrechos: [pet('Tarrafa', { malhaMm: 50 })] })), []);
  assert.deepEqual(nivel(out({ petrechos: [pet('Covo/armadilha', { malhaMm: 30 })] })), ['vermelho']);
  assert.deepEqual(nivel(out({ petrechos: [pet('Rede de arrasto')] })), ['vermelho']);
  assert.deepEqual(nivel(out({ petrechos: [pet('Espinhel')] })), ['amarelo']);
  assert.deepEqual(nivel(out({ petrechos: [pet('Linha e anzol')] })), []);
});

test('R28 não vale onde há norma própria', () => {
  for (const area of ['tramandai', 'patos', 'peixe', 'mampituba', 'mar'])
    assert.ok(!tem(ab({ area, petrechos: [pet('Rede de emalhe', { malhaMm: 50 })] }), 'R28'), area);
});

const uru = x => ab({ area: 'uruguai', localTipo: 'Lagoa ou rio', ...x });
const outras = x => ab({ area: 'outras', localTipo: 'Lagoa ou rio', ...x });
const niveis = (a, r) => checar(a, cfg).filter(m => m.regra === r).map(m => m.nivel);

test('R28 (IN 43) vale também na bacia do Uruguai', () => {
  assert.deepEqual(niveis(uru({ data: '2026-07-10T10:00', petrechos: [pet('Rede de emalhe', { malhaMm: 60 })] }), 'R28'), ['vermelho']);
});

test('R29: piracema do Uruguai de 1º/10 a 31/01, só linha, até 5 kg, sem motor', () => {
  const out = '2026-10-10T08:00';
  assert.ok(tem(uru({ data: out, petrechos: [pet('Rede de emalhe', { malhaMm: 100 })] }), 'R29'));
  assert.ok(!tem(uru({ data: out, petrechos: [pet('Linha e anzol')] }), 'R29'));
  assert.ok(tem(uru({ data: out, petrechos: [pet('Linha e anzol')], pescado: [{ especie: 'Traíra', kg: 6 }] }), 'R29'));
  assert.ok(tem(uru({ data: out, embarcacao: 'Motorizada', petrechos: [pet('Linha e anzol')] }), 'R29'));
  assert.ok(!tem(uru({ data: '2026-09-30T08:00', petrechos: [pet('Rede de emalhe', { malhaMm: 100 })] }), 'R29'));
  assert.ok(!tem(uru({ data: out, petrechos: [pet('Rede de emalhe', { malhaMm: 100 })] }), 'R16'), 'IN 197 não vale no Uruguai');
});

test('R30: áreas vedadas na piracema (IN 193, arts. 3º e 4º; IN 197, art. 5º)', () => {
  const linha = [pet('Linha e anzol')];
  assert.ok(tem(uru({ data: '2026-10-10T08:00', localTipo: 'Lagoa marginal', petrechos: linha }), 'R30'));
  assert.ok(tem(uru({ data: '2026-10-10T08:00', localTipo: 'Até 500 m de confluência com o rio Uruguai', petrechos: linha }), 'R30'));
  assert.ok(!tem(uru({ data: '2026-03-10T08:00', localTipo: 'Lagoa marginal', petrechos: linha }), 'R30'));
  assert.ok(tem(outras({ data: '2026-11-10T08:00', localTipo: 'Entre 200 e 1.500 m de barragem, cachoeira ou corredeira', petrechos: linha }), 'R30'));
  assert.ok(!tem(outras({ data: '2026-10-10T08:00', localTipo: 'Lagoa marginal', petrechos: linha }), 'R30'), 'IN 197 começa em 1º/11');
});

test('R31: a menos de 200 m de barragem, cachoeira ou corredeira, o ano todo (IN 43, art. 2º)', () => {
  for (const f of [uru, outras]) assert.deepEqual(niveis(f({ data: '2026-07-10T08:00', localTipo: 'Até 200 m de barragem, cachoeira ou corredeira', petrechos: [pet('Linha e anzol')] }), 'R31'), ['vermelho']);
});

test('R32: lambari em reservatório de 1º/11 a 28/02 (IN 51/2004)', () => {
  const res = (data, especie) => uru({ data, localTipo: 'Reservatório de hidrelétrica ou açude público', pescado: [{ especie, kg: 1 }] });
  assert.ok(tem(res('2027-02-20T08:00', 'Lambari'), 'R32'));
  assert.ok(!tem(res('2027-03-05T08:00', 'Lambari'), 'R32'));
  assert.ok(!tem(res('2027-02-20T08:00', 'Traíra'), 'R32'));
});

test('R33: Lagoa Mirim e Mangueira, defeso de 1º/11 a 31/01 e norma a conferir', () => {
  const mir = x => ab({ area: 'mirim', localTipo: 'Lagoa Mirim', ...x });
  assert.deepEqual(niveis(mir({ data: '2026-07-10T08:00' }), 'R33'), ['amarelo']);
  assert.ok(niveis(mir({ data: '2026-12-10T08:00', petrechos: [pet('Rede de emalhe', { malhaMm: 100 })] }), 'R33').includes('vermelho'));
});

test('R27: peixes de água doce ameaçados no RS', () => {
  for (const sp of ['Dourado', 'Surubim', 'Pintado', 'Suruvi', 'Piracanjuba'])
    assert.equal(checar(uru({ pescado: [{ especie: sp, kg: 1 }] }), cfg).find(m => m.regra === 'R27')?.nivel, 'vermelho', sp);
});

test('R27: bagre de água doce não pede conferência; dourado do mar não é o Salminus', () => {
  assert.equal(checar(uru({ pescado: [{ especie: 'Bagre', kg: 1 }] }), cfg).find(m => m.regra === 'R27'), undefined);
  assert.equal(checar(uru({ pescado: [{ especie: 'Pintado-amarelo (Pimelodus maculatus)', kg: 1 }] }), cfg).find(m => m.regra === 'R27'), undefined);
  assert.equal(checar(ab({ area: 'mar', localTipo: 'Praia (desembarcado)', pescado: [{ especie: 'Dourado', kg: 1 }] }), cfg).find(m => m.regra === 'R27'), undefined);
});

test('defesos por regime: vigente e próximo', () => {
  const { defesosDe } = globalThis.Normas;
  const nomes = (a, d) => defesosDe(a, d).map(x => `${x.nome}:${x.estado}`);
  assert.ok(nomes('tramandai', '2026-12-20').includes('Bagre:vigente'));
  assert.ok(nomes('tramandai', '2026-11-20').includes('Bagre:proximo'));
  assert.ok(nomes('outras', '2026-11-10').includes('Piracema:vigente'));
  assert.ok(nomes('uruguai', '2026-10-10').includes('Piracema:vigente'));
  assert.ok(nomes('uruguai', '2026-09-10').includes('Piracema:proximo'));
  assert.ok(nomes('mirim', '2027-01-10').includes('Defeso de todas as espécies:vigente'));
  assert.ok(nomes('mar', '2027-01-10').includes('Anchova:vigente'));
  assert.ok(!defesosDe('outras', '2026-06-10').some(x => x.nome === 'Piracema'));
  assert.ok(defesosDe('patos', '2026-07-10').some(x => x.nome === 'Fora do calendário do estuário' && /corvina/.test(x.texto)));
});

test('R06: tarrafa embarcada de 25 mm para peixe-rei e sardinha sob a ponte, sentido oeste (IN 17, art. 25, II)', () => {
  const base = { localTipo: 'Sob a ponte Giuseppe Garibaldi, sentido oeste (art. 25, II)', embarcacao: 'A remo', petrechos: [pet('Tarrafa', { malhaMm: 30 })] };
  assert.ok(!tem(ab({ ...base, pescado: [{ especie: 'Peixe-rei', kg: 2 }] }), 'R06'));
  assert.ok(tem(ab({ ...base, pescado: [{ especie: 'Tainha', kg: 2 }] }), 'R06'), 'outra espécie: vale 60 mm');
  assert.ok(tem(ab({ ...base, embarcacao: 'Nenhuma', pescado: [{ especie: 'Peixe-rei', kg: 2 }] }), 'R06'), 'desembarcado: vale 60 mm');
  assert.ok(tem(ab({ ...base, petrechos: [pet('Tarrafa', { malhaMm: 20 })], pescado: [{ especie: 'Peixe-rei', kg: 2 }] }), 'R06'));
});

test('R34: GPS dentro das áreas da IN 17 pede conferência', () => {
  const g = (lat, lon) => ab({ gps: { lat, lon, prec: 10 } });
  const r34 = a => checar(a, cfg).filter(m => m.regra === 'R34').map(m => m.norma);
  // art. 7º, III (Lagoa dos Quadros): dentro do triângulo
  assert.match(r34(g(-29.6435, -50.0960)).join(), /art\. 7º, III/);
  // art. 5º: sobre o eixo do canal entre o pontal do Capão Grande e a antiga rodoviária
  assert.match(r34(g(-29.98636, -50.14998)).join(), /art\. 5º/);
  // art. 2º: perto da barra
  assert.match(r34(g(-29.9750, -50.1300)).join(), /art\. 2º/);
  // longe de tudo (meio da Lagoa Itapeva)
  assert.deepEqual(r34(g(-29.50, -49.90)), []);
  // fora da bacia do Tramandaí, não avalia
  assert.deepEqual(checar({ ...g(-29.6435, -50.0960), area: 'outras' }, cfg).filter(m => m.regra === 'R34'), []);
});

test('R17 cita a Portaria SAP/MAPA 616/2022; estuário da Lagoa dos Patos usa 10 kg', () => {
  const r = checar(ab({ area: 'patos', data: '2026-10-25', categoria: 'Amador', petrechos: [pet('Linha e anzol')], pescado: [{ especie: 'Tainha', kg: 11 }] }), cfg);
  assert.ok(r.find(m => m.regra === 'R17').norma.includes('616/2022'));
});

test('R35: amador só com os petrechos da Portaria SAP/MAPA 616/2022 (fora de Tramandaí e Patos, que já têm regra própria)', () => {
  const a = (area, tipo) => ab({ area, data: '2026-06-10', categoria: 'Amador', petrechos: [pet(tipo, { malhaMm: 80 })], pescado: [] });
  const r = (area, tipo) => checar(a(area, tipo), cfg);
  for (const tipo of ['Rede de emalhe', 'Tarrafa', 'Espinhel', 'Covo/armadilha'])
    assert.ok(r('outras', tipo).some(m => m.regra === 'R35' && m.nivel === 'vermelho' && m.norma.includes('616/2022, art. 4º')), tipo);
  assert.ok(!tem(a('outras', 'Linha e anzol'), 'R35'));
  assert.ok(r('mar', 'Outro').some(m => m.regra === 'R35' && m.nivel === 'amarelo'));
  assert.ok(!tem(a('tramandai', 'Rede de emalhe'), 'R35'));
  assert.ok(!tem(ab({ area: 'outras', data: '2026-06-10', categoria: 'Profissional', petrechos: [pet('Rede de emalhe', { malhaMm: 80 })] }), 'R35'));
});

test('R27: peixe-rei sem espécie nas lagoas do peixe-rei-bicudo fica amarelo', () => {
  const r = local => checar(ab({ localPescaId: local, data: '2026-06-10', pescado: [{ especie: 'Peixe-rei', kg: 2 }] }), cfg);
  for (const l of ['peixoto', 'bicudo']) assert.ok(r(l).some(m => m.regra === 'R27' && m.nivel === 'amarelo' && /bicudo/.test(m.texto)), l);
  assert.ok(!r('tramandai').some(m => /bicudo/.test(m.texto)));
  // espécie já informada como bicudo: vermelho, sem o amarelo
  const v = checar(ab({ localPescaId: 'bicudo', data: '2026-06-10', pescado: [{ especie: 'Peixe-rei (Odontesthes bicudo)', kg: 2 }] }), cfg);
  assert.ok(v.some(m => m.regra === 'R27' && m.nivel === 'vermelho') && !v.some(m => m.nivel === 'amarelo' && m.regra === 'R27'));
});
