import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import '../lista.js';
const { normNome, digitos, ler, parecido, mesclar, temporadaAtual, situacao, buscar, cpfValido, criar } = globalThis.Lista;

const fx = n => JSON.parse(readFileSync(new URL(`./fixtures/${n}`, import.meta.url), 'utf8'));

test('normaliza nome: sem acento, maiúsculo, espaços únicos', () => {
  assert.equal(normNome('  José  da   Conceição '), 'JOSE DA CONCEICAO');
});

test('extrai os 6 dígitos do meio de qualquer formato', () => {
  assert.equal(digitos('RSPA***123456**'), '123456');
  assert.equal(digitos('RSPS***123456**'), '123456');
  assert.equal(digitos('RSPAXXX.123.456.XX'), '123456');
  assert.equal(digitos('XXX.123.456.XX'), '123456');
  assert.equal(digitos('987.123.456-00'), '123456');
  assert.equal(digitos('98712345600'), '123456');
  assert.equal(digitos('123456'), '123456');
  assert.equal(digitos('RS-P0060135-9'), null);
  assert.equal(digitos('Protocolo'), null);
});

test('lista no layout A: registros, nome quebrado e avisos', () => {
  const r = ler(fx('lista-a.json'));
  assert.equal(r.linhas, 9);
  assert.equal(r.registros.length, 8); // 9 linhas, 1 duplicada
  assert.equal(r.registros.find(x => x.n === 8).nome, 'BEATRIZ NOME MUITO COMPRIDO DO NASCIMENTO');
  assert.equal(r.registros.find(x => x.n === 7).nomeNorm, 'JOSE ACENTUADO');
  const tipos = r.avisos.map(a => a.tipo).sort();
  assert.deepEqual(tipos, ['colisao', 'duplicado', 'prefixo']);
});

test('lista no layout B: dígitos vêm do CPF, avisos de protocolo e formato antigo', () => {
  const r = ler(fx('lista-b.json'));
  assert.equal(r.registros.length, 5);
  const antigo = r.registros.find(x => x.n === 2);
  assert.equal(antigo.digitos, '888888');
  assert.equal(antigo.rgp, 'RS-P0000001-9');
  assert.deepEqual(r.avisos.map(a => a.tipo).sort(), ['formatoAntigo', 'protocolo']);
});

test('nomes parecidos x pessoas diferentes', () => {
  assert.ok(parecido('ADRIANA DOS REIS LIMA', 'ADRIANA DOS REIS DE LIMA'));
  assert.ok(parecido('GILMAR FEIJO GLAPINSKI', 'GILMAR FEIJO GLAPINSLK'));
  assert.ok(parecido('JULIO CESAR BECHER MONTEIRO', 'JULIO CESAR BECKER MONTEIRO'));
  assert.ok(parecido('LUIZ CARLOS DA SILVA TESTE', 'LUIS CARLOS DA SILVA TESTE'));
  assert.ok(parecido('VALDOIR MENDES EXEMPLO', 'VADOIR MENDES EXEMPLO'));
  assert.ok(!parecido('CLAUDIA DE LIMA DA SILVA', 'CLAUDIA SANTANA DE LIMA'));
  assert.ok(!parecido('LINDOMAR VARGAS DULLIUS', 'MARCIO PEREIRA DA ROSA'));
  assert.ok(!parecido('PEDRO TESTE', 'ANA OUTRA PESSOA'));
});

test('mescla: colisão vira duas pessoas, reimportar não duplica licença', () => {
  const base = {};
  const a = ler(fx('lista-a.json'));
  const m1 = mesclar(base, a.registros, { area: 'tramandai', temporada: '2026/2027', importacao: 'h1' });
  assert.equal(Object.keys(base).length, 8);
  assert.equal(m1.novos, 8);
  const m2 = mesclar(base, a.registros, { area: 'tramandai', temporada: '2026/2027', importacao: 'h1' });
  assert.equal(m2.novos, 0);
  assert.equal(m2.vinculados, 0);
  assert.ok(Object.values(base).every(p => p.licencas.length === 1));
});

test('mescla de temporadas diferentes: vincula por dígitos + nome parecido e marca quem saiu', () => {
  const base = {};
  mesclar(base, ler(fx('lista-a.json')).registros, { area: 'tramandai', temporada: '2026/2027', importacao: 'h1' });
  const m = mesclar(base, ler(fx('lista-b.json')).registros, { area: 'tramandai', temporada: '2024/2025', importacao: 'h2' });
  // JOAO FICTICIO SILVA ~ JOAO FICTICIO DA SILVA (111111) vincula; MARCIO PEREIRA TESTE x 333333 não é parecido com ninguém
  assert.equal(m.vinculados, 1);
  assert.equal(m.novos, 4);
  assert.deepEqual(m.revisar.map(r => r.nome), ['MARCIO PEREIRA TESTE']); // mesmos dígitos de PEDRO TESTE e ANA OUTRA PESSOA
  const imps = [{ area: 'tramandai', temporada: '2026/2027' }, { area: 'tramandai', temporada: '2024/2025' }];
  const atual = temporadaAtual(imps, 'tramandai');
  assert.equal(atual, '2026/2027');
  const ps = Object.values(base);
  assert.equal(ps.filter(p => situacao(p, 'tramandai', atual) === 'saiu').length, 4);
  assert.equal(situacao(ps.find(p => p.digitos === '111111'), 'tramandai', atual), 'atual');
});

test('busca por nome parcial sem acento, dígitos ou RGP', () => {
  const base = {};
  mesclar(base, ler(fx('lista-a.json')).registros, { area: 'tramandai', temporada: '2026/2027', importacao: 'h1' });
  const ps = Object.values(base);
  assert.equal(buscar(ps, 'jose acent').length, 1);
  assert.equal(buscar(ps, 'josé').length, 1);
  assert.equal(buscar(ps, '555555').length, 1);
  assert.equal(buscar(ps, 'RSPA***555555**').length, 1);
  assert.equal(buscar(ps, '000.555.555-00').length, 1);
  assert.equal(buscar(ps, '').length, 8);
});

test('busca acha pela grafia de uma lista anterior', () => {
  const base = {};
  mesclar(base, [{ n: 1, nome: 'LUIS CARLOS DA SILVA TESTE', nomeNorm: 'LUIS CARLOS DA SILVA TESTE', digitos: '123123', rgp: 'RSPA***123123**' }], { area: 'tramandai', temporada: '2026/2027', importacao: 'h1' });
  mesclar(base, [{ n: 9, nome: 'LUIZ CARLOS DA SILVA TESTE', nomeNorm: 'LUIZ CARLOS DA SILVA TESTE', digitos: '123123', rgp: 'RSPAXXX.123.123.XX' }], { area: 'tramandai', temporada: '2024/2025', importacao: 'h2' });
  assert.equal(Object.keys(base).length, 1);
  assert.equal(buscar(Object.values(base), 'luiz carlos').length, 1);
});

test('busca em 4.000 registros em menos de 200 ms', () => {
  const ps = Array.from({ length: 4000 }, (_, i) => ({ nome: `PESSOA NUMERO ${i}`, nomeNorm: `PESSOA NUMERO ${i}`, digitos: String(100000 + i), rgp: '' }));
  const t = performance.now();
  buscar(ps, 'numero 39');
  assert.ok(performance.now() - t < 200);
});

test('valida CPF pelos dígitos verificadores', () => {
  assert.ok(cpfValido('529.982.247-25'));
  assert.ok(cpfValido('52998224725'));
  assert.ok(!cpfValido('529.982.247-24'));
  assert.ok(!cpfValido('111.111.111-11'));
  assert.ok(!cpfValido('5299822472'));
});

test('cria pescador abordado em campo e a lista importada depois o reconhece', () => {
  const base = {};
  const p = criar(base, { nome: 'João Ficticio da Silva', cpf: '529.982.247-25' });
  assert.equal(p.digitos, '982247');
  assert.equal(p.cpf, '52998224725');
  assert.equal(p.nomeNorm, 'JOAO FICTICIO DA SILVA');
  assert.equal(p.origem, 'campo');
  assert.deepEqual(p.licencas, []);
  const m = mesclar(base, [{ n: 1, nome: 'JOAO FICTICIO DA SILVA', nomeNorm: 'JOAO FICTICIO DA SILVA', digitos: '982247', rgp: 'RSPA***982247**' }],
    { area: 'tramandai', temporada: '2026/2027', importacao: 'h1' });
  assert.equal(m.vinculados, 1);
  assert.equal(Object.keys(base).length, 1);
  const semCpf = criar(base, { nome: 'Sem Documento' });
  assert.equal(semCpf.digitos, null);
});

test('CPF completo informado no cadastro exclui quem tem outro CPF', () => {
  const ps = [{ nome: 'A', nomeNorm: 'A', digitos: '982247', cpf: '11198224700', licencas: [] },
    { nome: 'B', nomeNorm: 'B', digitos: '982247', licencas: [] }];
  assert.deepEqual(buscar(ps, '529.982.247-25').map(p => p.nome), ['B']);
});

test('lê o resultado colado da consulta pública do PesqBrasil', async () => {
  const { lerConsulta } = globalThis.Lista;
  const txt = readFileSync(new URL('./fixtures/consulta-pesqbrasil.txt', import.meta.url), 'utf8');
  assert.deepEqual(lerConsulta(txt), {
    digitos: '111222', rgp: 'RSPA***111222**', situacao: 'Ativo', tipoRegistro: 'Registro inicial', uf: 'RS', municipio: 'Tramandaí',
    categoria: 'Artesanal', formaAtuacao: 'Embarcado', produto: 'Camarão', anoNascimento: '1975', primeiroRgp: '2010-02-03',
    locais: [{ tipo: 'Lago', uf: 'RS', municipio: 'Tramandaí' }, { tipo: 'Rio', uf: 'RS', municipio: 'Imbé' }],
  });
  // copiado com espaços depois dos dois-pontos e quebras de linha do Windows
  assert.equal(lerConsulta(txt.replace(/:/g, ': ').replace(/\n/g, '\r\n')).situacao, 'Ativo');
  assert.equal(lerConsulta('texto qualquer'), null);
});
