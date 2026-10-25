import { test } from 'node:test';
import assert from 'node:assert/strict';
import '../semaforo.js';
const { avaliar, ultimaConsulta } = globalThis.Semaforo;

const lic = (temporada, n = 10) => ({ area: 'tramandai', temporada, n, nomeLista: 'X', rgp: 'RSPA***123456**' });
const consulta = (data, situacao = 'Ativo') => ({ id: data + situacao, data, situacao });
const pesc = (licencas = [], consultas = []) => ({ id: 'p', nome: 'X', digitos: '123456', licencas, consultas });
const base = { area: 'tramandai', atual: '2026/2027', data: '2026-10-25', identificadoPor: 'cpf', outrosMesmosDigitos: 0 };
const av = extra => avaliar({ ...base, ...extra });
const tem = (r, trecho) => r.motivos.some(m => m.texto.includes(trecho));

test('verde: na lista atual, RGP ativo consultado há poucos dias, CPF completo, sem colisão', () => {
  const r = av({ pescador: pesc([lic('2026/2027')], [consulta('2026-10-20')]) });
  assert.equal(r.cor, 'verde');
  assert.ok(tem(r, 'nº 10'));
});

test('vermelho: pessoa sem cadastro em área com lista', () => {
  const r = av({ pescador: null, identificadoPor: 'nome' });
  assert.equal(r.cor, 'vermelho');
  assert.ok(tem(r, 'Não está na lista'));
});

test('vermelho: saiu da lista atual, motivo cita a temporada anterior', () => {
  const r = av({ pescador: pesc([lic('2024/2025')], [consulta('2026-10-20')]) });
  assert.equal(r.cor, 'vermelho');
  assert.ok(tem(r, '2024/2025'));
});

test('vermelho: RGP suspenso, cancelado ou não encontrado no PesqBrasil', () => {
  for (const s of ['Suspenso', 'Cancelado', 'Não encontrado']) {
    assert.equal(av({ pescador: pesc([lic('2026/2027')], [consulta('2026-10-20', s)]) }).cor, 'vermelho', s);
  }
});

test('amarelo: na lista, mas sem consulta ao PesqBrasil', () => {
  const r = av({ pescador: pesc([lic('2026/2027')]) });
  assert.equal(r.cor, 'amarelo');
  assert.ok(tem(r, 'Sem consulta'));
});

test('amarelo: consulta com mais de 30 dias', () => {
  const r = av({ pescador: pesc([lic('2026/2027')], [consulta('2026-09-01')]) });
  assert.equal(r.cor, 'amarelo');
  assert.ok(tem(r, '01/09/2026'));
});

test('amarelo: solicitação em análise', () => {
  assert.equal(av({ pescador: pesc([lic('2026/2027')], [consulta('2026-10-20', 'Em análise')]) }).cor, 'amarelo');
});

test('amarelo: identificado sem CPF completo', () => {
  const r = av({ pescador: pesc([lic('2026/2027')], [consulta('2026-10-20')]), identificadoPor: 'nome' });
  assert.equal(r.cor, 'amarelo');
  assert.ok(tem(r, 'documento'));
});

test('amarelo: mesmos dígitos de outra pessoa', () => {
  const r = av({ pescador: pesc([lic('2026/2027')], [consulta('2026-10-20')]), outrosMesmosDigitos: 1 });
  assert.equal(r.cor, 'amarelo');
  assert.ok(tem(r, 'Mesmos dígitos'));
});

test('amarelo: área com lista, mas nenhuma lista importada', () => {
  const r = av({ pescador: pesc([], [consulta('2026-10-20')]), atual: null });
  assert.equal(r.cor, 'amarelo');
  assert.ok(tem(r, 'Nenhuma lista'));
});

test('mar: sem lista nominal, decide só pela consulta', () => {
  assert.equal(av({ area: 'mar', pescador: pesc([], [consulta('2026-10-20')]) }).cor, 'verde');
  assert.equal(av({ area: 'mar', pescador: pesc() }).cor, 'amarelo');
  assert.equal(av({ area: 'mar', pescador: pesc([], [consulta('2026-10-20', 'Cancelado')]) }).cor, 'vermelho');
});

test('vale a consulta mais recente até a data da abordagem', () => {
  const cs = [consulta('2026-10-01', 'Ativo'), consulta('2026-10-20', 'Suspenso'), consulta('2026-11-10', 'Ativo')];
  assert.equal(ultimaConsulta(cs, '2026-10-25').situacao, 'Suspenso');
  assert.equal(av({ pescador: pesc([lic('2026/2027')], cs) }).cor, 'vermelho');
});
