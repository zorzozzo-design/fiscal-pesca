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

test('R01: profissional fora da lista só com linha e anzol não é irregular pela lista', () => {
  const r = av({ pescador: null, soLinha: true });
  assert.ok(!r.motivos.some(m => m.nivel === 'vermelho'));
  assert.ok(tem(r, 'art. 26'));
});

test('R01: amador na bacia só pode linha e anzol; não precisa de consulta ao PesqBrasil', () => {
  const r = av({ pescador: pesc(), categoria: 'Amador', soLinha: false });
  assert.equal(r.cor, 'vermelho');
  assert.ok(tem(r, 'Amador'));
  assert.ok(!tem(r, 'PesqBrasil'));
  assert.equal(av({ pescador: pesc(), categoria: 'Amador', soLinha: true }).cor, 'verde');
});

test('R01: fora da lista e com petrecho de profissional, a multa de referência vai para o art. 35 (crime do art. 34, p. ún., II)', () => {
  const m = av({ pescador: null }).motivos.find(x => x.nivel === 'vermelho');
  assert.equal(m.artigo, 35);
  assert.equal(m.regra, 'R01');
});

test('corDe junta motivos de origens diferentes', () => {
  const { corDe } = globalThis.Semaforo;
  assert.equal(corDe([{ nivel: 'ok' }, { nivel: 'amarelo' }]), 'amarelo');
  assert.equal(corDe([{ nivel: 'amarelo' }, { nivel: 'vermelho' }]), 'vermelho');
  assert.equal(corDe([{ nivel: 'ok' }]), 'verde');
});

test('estuário da Lagoa dos Patos tem lista própria; linha e anzol fora da lista fica para conferir', () => {
  const p = pesc([{ area: 'patos', temporada: '2025/2026', n: 7, nomeLista: 'X', rgp: 'R' }], [consulta('2026-10-20')]);
  assert.equal(av({ area: 'patos', atual: '2025/2026', pescador: p }).cor, 'verde');
  const fora = av({ area: 'patos', atual: '2025/2026', pescador: null, soLinha: false });
  assert.equal(fora.cor, 'vermelho');
  assert.ok(fora.motivos.find(m => m.nivel === 'vermelho').norma.includes('INC 03/2004'));
  const linha = av({ area: 'patos', atual: '2025/2026', pescador: pesc([], [consulta('2026-10-20')]), soLinha: true });
  assert.equal(linha.cor, 'amarelo');
});

test('Lagoa Mirim tem lista: profissional fora dela é vermelho pela INC 02/2004', () => {
  const r = av({ area: 'mirim', pescador: pesc([lic('2025/2026')], [consulta('2026-10-20')]), atual: '2025/2026' });
  assert.equal(r.cor, 'vermelho'); // a licença do fixture é de Tramandaí
  assert.ok(r.motivos.some(m => m.regra === 'R01' && m.norma.includes('02/2004')));
  const ok = av({ area: 'mirim', atual: '2025/2026', pescador: pesc([{ ...lic('2025/2026'), area: 'mirim' }], [consulta('2026-10-20')]) });
  assert.equal(ok.cor, 'verde');
});

test('amador fora de Tramandaí e Patos: licença a conferir (IN MPA 05/2012); com barco, categoria embarcada', () => {
  for (const area of ['outras', 'mirim', 'mar']) {
    const r = av({ area, atual: null, categoria: 'Amador', pescador: null });
    assert.equal(r.cor, 'amarelo', area);
    assert.ok(r.motivos.some(m => m.norma === 'IN MPA 05/2012, art. 5º' && m.texto.includes('caniço simples')), area);
    assert.ok(!tem(r, 'só pode pescar'), area);
  }
  assert.ok(tem(av({ area: 'outras', atual: null, categoria: 'Amador', pescador: null, embarcado: true }), 'embarcada'));
});

test('PesqBrasil sem situação ativa: lembra que o protocolo não vale mais como licença', () => {
  const r = av({ pescador: pesc([lic('2026/2027')], [consulta('2026-10-20', 'Em análise')]) });
  assert.equal(r.cor, 'amarelo');
  assert.ok(tem(r, '31/03/2025'));
});

test('sem RGP ou licença: rede é vermelho pelo art. 24 da Lei 11.959; linha e anzol na bacia é dispensado; sem exigir consulta', () => {
  const r = av({ pescador: pesc(), categoria: 'Sem RGP ou licença', soLinha: false });
  assert.equal(r.cor, 'vermelho');
  assert.ok(r.motivos.some(m => m.norma === 'Lei 11.959/2009, art. 24' && m.artigo === 35));
  assert.ok(!tem(r, 'PesqBrasil'));
  assert.equal(av({ pescador: pesc(), categoria: 'Sem RGP ou licença', soLinha: true }).cor, 'verde');
  assert.equal(av({ pescador: pesc(), categoria: 'Sem RGP ou licença', soLinha: true, area: 'mar', atual: null }).cor, 'amarelo');
});

test('sem licença com petrecho de profissional: crime do art. 34, p. ún., II (Enunciado 81 só cobre a falta de licença)', () => {
  const crime = r => r.motivos.some(m => m.nivel === 'vermelho' && m.artigo === 35 && /art\. 34, p\. ún\., II/.test(m.enquadramento) && /art\. 37/.test(m.enquadramento));
  // profissional fora da lista, com rede
  assert.ok(crime(av({ pescador: pesc([], [consulta('2026-10-20')]), soLinha: false })));
  // amador com rede em Tramandaí
  assert.ok(crime(av({ categoria: 'Amador', pescador: null, soLinha: false })));
  // sem RGP ou licença, fora das áreas com lista
  assert.ok(crime(av({ area: 'outras', atual: null, categoria: 'Sem RGP ou licença', pescador: null, soLinha: false })));
  // RGP cancelado no PesqBrasil, área sem lista
  assert.ok(crime(av({ area: 'mar', atual: null, pescador: pesc([], [consulta('2026-10-20', 'Cancelado')]), soLinha: false })));
});

test('sem licença só com linha e anzol: segue só infração (art. 37), sem crime', () => {
  const r = av({ area: 'mar', atual: null, pescador: pesc([], [consulta('2026-10-20', 'Cancelado')]), soLinha: true });
  assert.equal(r.cor, 'vermelho');
  assert.ok(r.motivos.every(m => !/art\. 34/.test(m.enquadramento || '')));
});

test('autorização especial aparece no semáforo da área, sem mudar a cor', () => {
  const aut = { id: 'x', titulo: 'Automonitoramento 2025', categoria: 'Embarcado Baliza Tramandaí', orgao: 'Prefeitura Municipal de Imbé', area: 'tramandai', n: 7 };
  const p = { ...pesc([lic('2026/2027')], [consulta('2026-10-20')]), autorizacoes: [aut] };
  const r = av({ pescador: p });
  assert.equal(r.cor, 'verde');
  assert.ok(r.motivos.some(m => m.nivel === 'ok' && m.texto.includes('Automonitoramento 2025') && m.texto.includes('nº 7')));
  assert.ok(!av({ pescador: p, area: 'mar', atual: null }).motivos.some(m => m.texto.includes('Automonitoramento')));
});
