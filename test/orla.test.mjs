import { test } from 'node:test';
import assert from 'node:assert/strict';
import '../orla.js';
import '../normas.js';
const { checar } = globalThis.Normas;
const { ORLA, zonasDe, MUNICIPIOS_ORLA } = globalThis.Orla;

const pet = (tipo, x = {}) => ({ tipo, malhaMm: 100, comprimentoM: 100, alturaM: 3, rgpTralha: 'Sim', qtd: 1, ...x });
const ab = extra => ({ area: 'mar', localTipo: 'Praia (desembarcado)', data: '2026-10-25T10:00', embarcacao: 'Nenhuma', categoria: 'Profissional',
  petrechos: [pet('Rede de emalhe')], pescado: [], praia: 'Tramandaí', zonaOrla: 'pesca', ...extra });
const r36 = a => checar(a).filter(m => m.regra === 'R36');
const nivel = a => { const ms = r36(a); return ms.some(m => m.nivel === 'vermelho') ? 'vermelho' : ms.some(m => m.nivel === 'amarelo') ? 'amarelo' : 'nada'; };
const linha = [pet('Linha e anzol')];

test('Orla: municípios com lei e zonas de cada um', () => {
  for (const m of ['Tramandaí', 'Imbé', 'Cidreira', 'Balneário Pinhal', 'Palmares do Sul', 'Capão da Canoa']) assert.ok(ORLA[m], m);
  assert.ok(zonasDe('Imbé').some(([k]) => k === 'especial'));
  assert.ok(!zonasDe('Tramandaí').some(([k]) => k === 'especial'));
  assert.ok(zonasDe('Osório').some(([k]) => k === 'surfe')); // sem lei no app: zonas genéricas
  assert.ok(MUNICIPIOS_ORLA.includes('Cidreira'));
});

test('R36: só fora do mar, com município e zona informados', () => {
  assert.equal(nivel(ab({ area: 'tramandai', zonaOrla: 'surfe' })), 'nada');
  assert.equal(nivel(ab({ praia: '', zonaOrla: 'surfe' })), 'nada');
  assert.equal(nivel(ab({ zonaOrla: '' })), 'nada');
  assert.equal(nivel(ab({ petrechos: [], zonaOrla: 'surfe' })), 'nada');
});

test('R36 Tramandaí: rede em área de surfe é vermelho; amador com linha pode em toda a orla fora do veraneio', () => {
  const m = r36(ab({ zonaOrla: 'surfe' }));
  assert.ok(m.some(x => x.nivel === 'vermelho' && x.norma.includes('3.952/2015') && x.norma.includes('13.660')));
  assert.ok(m.every(x => x.artigo == null), 'sem multa do Dec. 6.514: a sanção é municipal e estadual');
  assert.ok(m[0].enquadramento.includes('49.245/2012'));
  assert.equal(nivel(ab({ zonaOrla: 'surfe', categoria: 'Amador', petrechos: linha })), 'nada');
});

test('R36 Tramandaí: rede com cabo proibida de 15/12 a 15/03 na área de pesca', () => {
  assert.equal(nivel(ab({ data: '2026-01-10T22:00' })), 'vermelho');
  assert.ok(r36(ab({ data: '2026-01-10T22:00' })).some(x => x.norma.includes('art. 5º')));
  assert.notEqual(nivel(ab({ data: '2026-03-16T22:00' })), 'vermelho');
  // Barco: não é rede com cabo.
  assert.notEqual(nivel(ab({ data: '2026-01-10T22:00', localTipo: 'Embarcado além de 1 milha', embarcacao: 'A remo' })), 'vermelho');
});

test('R36 Tramandaí: amador no veraneio só das 19h às 8h', () => {
  const am = (h, d = '2026-01-10') => ab({ categoria: 'Amador', petrechos: linha, data: `${d}T${h}` });
  assert.equal(nivel(am('14:00')), 'vermelho');
  assert.equal(nivel(am('19:00')), 'nada');
  assert.equal(nivel(am('07:59')), 'nada');
  assert.equal(nivel(am('08:00')), 'vermelho');
  assert.equal(nivel(am('14:00', '2026-04-10')), 'nada');
});

test('R36 Tramandaí e Imbé: bote com rede a 500 m ou menos da costa', () => {
  const b = a => ab({ localTipo: 'Embarcado até 500 m da costa', embarcacao: 'A remo', ...a });
  assert.ok(r36(b({})).some(x => x.nivel === 'vermelho' && /500 m/.test(x.texto)));
  assert.ok(r36(b({ praia: 'Imbé' })).some(x => x.nivel === 'vermelho' && x.norma.includes('art. 4º, § 2º')));
});

test('R13: "Embarcado até 500 m" conta como dentro de 1 milha para o emalhe motorizado', () => {
  const r = checar(ab({ localTipo: 'Embarcado até 500 m da costa', embarcacao: 'Motorizada', zonaOrla: '' }));
  assert.ok(r.some(m => m.regra === 'R13' && m.nivel === 'vermelho'));
});

test('R36 Imbé: Área Especial da Barra só tarrafa e caniço; surfe exclusivo; amador no veraneio só na área de pesca', () => {
  const i = a => ab({ praia: 'Imbé', ...a });
  assert.equal(nivel(i({ zonaOrla: 'especial' })), 'vermelho');
  assert.equal(nivel(i({ zonaOrla: 'especial', categoria: 'Amador', petrechos: [pet('Tarrafa')] })), 'nada');
  assert.equal(nivel(i({ zonaOrla: 'surfe' })), 'vermelho');
  assert.equal(nivel(i({ zonaOrla: 'surfe', categoria: 'Amador', petrechos: linha, data: '2026-01-10T22:00' })), 'vermelho');
  assert.equal(nivel(i({ zonaOrla: 'surfe', categoria: 'Amador', petrechos: linha, data: '2026-05-10T10:00' })), 'amarelo');
  assert.equal(nivel(i({ zonaOrla: 'pesca', categoria: 'Amador', petrechos: linha, data: '2026-01-10T08:30' })), 'nada'); // até 9h
  assert.equal(nivel(i({ zonaOrla: 'pesca', categoria: 'Amador', petrechos: linha, data: '2026-01-10T09:30' })), 'vermelho');
  assert.equal(nivel(i({ data: '2026-02-01T23:00' })), 'vermelho'); // rede com cabo no veraneio
});

test('R36 Cidreira: surfe proibido para todos; plataforma só amador; veraneio fora da área de pesca', () => {
  const c = a => ab({ praia: 'Cidreira', ...a });
  assert.equal(nivel(c({ zonaOrla: 'surfe', categoria: 'Amador', petrechos: linha })), 'vermelho');
  assert.equal(nivel(c({ zonaOrla: 'plataforma' })), 'vermelho');
  assert.equal(nivel(c({ zonaOrla: 'plataforma', categoria: 'Amador', petrechos: linha })), 'nada');
  assert.equal(nivel(c({ zonaOrla: 'banho', data: '2026-01-10T22:00' })), 'vermelho');
  assert.equal(nivel(c({ zonaOrla: 'banho', data: '2026-05-10T10:00' })), 'nada');
  assert.equal(nivel(c({ zonaOrla: 'pesca', categoria: 'Amador', petrechos: linha, data: '2026-01-10T12:00' })), 'vermelho');
});

test('R36 Balneário Pinhal: no veraneio, profissional só até 9h e após 18h; art. 5º gera amarelo', () => {
  const p = a => ab({ praia: 'Balneário Pinhal', zonaOrla: 'outra', ...a });
  assert.equal(nivel(p({ data: '2026-01-10T12:00' })), 'vermelho');
  const cedo = r36(p({ data: '2026-01-10T06:00' }));
  assert.ok(!cedo.some(x => x.nivel === 'vermelho') && cedo.some(x => x.nivel === 'amarelo' && x.norma.includes('art. 5º')));
  assert.equal(nivel(p({ data: '2026-01-10T09:20', localTipo: 'Embarcado além de 1 milha', embarcacao: 'Motorizada' })), 'amarelo'); // tolerância de 30 min do barco
  assert.equal(nivel(p({ data: '2026-01-10T12:00', zonaOrla: 'pesca' })), 'amarelo'); // Travessa 45: exclusiva 24 h
  assert.equal(nivel(p({ zonaOrla: 'surfe', data: '2026-05-10T10:00' })), 'vermelho');
  assert.equal(nivel(p({ data: '2026-05-10T12:00' })), 'nada');
});

test('R36 Palmares do Sul: surfe sempre vedado; barra de rio com rede; banho no verão de dia é amarelo', () => {
  const p = a => ab({ praia: 'Palmares do Sul', ...a });
  assert.equal(nivel(p({ zonaOrla: 'surfe', categoria: 'Amador', petrechos: linha })), 'vermelho');
  assert.equal(nivel(p({ zonaOrla: 'barra' })), 'vermelho');
  assert.equal(nivel(p({ zonaOrla: 'barra', categoria: 'Amador', petrechos: linha })), 'nada');
  assert.equal(nivel(p({ zonaOrla: 'banho', categoria: 'Amador', petrechos: linha, data: '2026-01-10T14:00' })), 'amarelo');
});

test('R36 Capão da Canoa: lei não conferida, tudo vira amarelo', () => {
  assert.equal(nivel(ab({ praia: 'Capão da Canoa', zonaOrla: 'surfe' })), 'amarelo');
});

test('R36 município sem lei no app: só a lei estadual (rede de profissional em área de surfe ou lazer)', () => {
  const o = a => ab({ praia: 'Torres', ...a });
  assert.ok(r36(o({ zonaOrla: 'surfe' })).some(x => x.nivel === 'vermelho' && x.norma.includes('8.676/1988')));
  assert.equal(nivel(o({ zonaOrla: 'surfe', categoria: 'Amador', petrechos: linha })), 'nada');
  assert.equal(nivel(o({ zonaOrla: 'banho' })), 'amarelo');
});

test('R36 "Não sei a zona": amarelo pedindo para conferir a placa, quando há regra de zona', () => {
  assert.equal(nivel(ab({ zonaOrla: 'naosei', data: '2026-05-10T10:00' })), 'amarelo');
});
