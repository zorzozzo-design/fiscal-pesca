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
  assert.equal(digitos('RSPAXXX061970XX'), '061970');
  assert.equal(digitos('XXX.449.780-XX'), '449780');
  assert.equal(digitos('RSPAXXX.449.780-XX'), '449780');
  assert.equal(digitos('RSPAXXX.438880.XX'), '438880');
  assert.equal(digitos('RSPOXXX.9228.XX'), null);
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
  assert.deepEqual(tipos, ['colisao', 'duplicado']); // RSPS consta nas listas oficiais como licenciado: sem aviso
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
    nome: 'JOAO F', digitos: '111222', rgp: 'RSPA***111222**', situacao: 'Ativo', tipoRegistro: 'Registro inicial', uf: 'RS', municipio: 'Tramandaí',
    categoria: 'Artesanal', formaAtuacao: 'Embarcado', produto: 'Camarão', anoNascimento: '1975', primeiroRgp: '2010-02-03',
    locais: [{ tipo: 'Lago', uf: 'RS', municipio: 'Tramandaí' }, { tipo: 'Rio', uf: 'RS', municipio: 'Imbé' }],
  });
  // copiado com espaços depois dos dois-pontos e quebras de linha do Windows
  assert.equal(lerConsulta(txt.replace(/:/g, ': ').replace(/\n/g, '\r\n')).situacao, 'Ativo');
  assert.equal(lerConsulta('texto qualquer'), null);
});

test('consulta colada com nome: lê o nome e acha a pessoa pelos dígitos e pelo começo do nome', () => {
  const { lerConsulta, identificar } = globalThis.Lista;
  const lido = lerConsulta(readFileSync(new URL('./fixtures/consulta-pesqbrasil-nome.txt', import.meta.url), 'utf8'));
  assert.equal(lido.nome, 'JOSE P');
  assert.equal(lido.digitos, '456789');
  assert.deepEqual([...new Set(lido.locais.map(l => l.tipo))], ['Rio']);
  const ps = [{ id: 'a', nome: 'MARIA SOUZA', nomeNorm: 'MARIA SOUZA', digitos: '456789' }, { id: 'b', nome: 'JOSE PEREIRA', nomeNorm: 'JOSE PEREIRA', digitos: '456789' },
    { id: 'c', nome: 'JOSE PEREIRA', nomeNorm: 'JOSE PEREIRA', digitos: '111111' }];
  assert.deepEqual(identificar(ps, lido).map(x => [x.p.id, x.nomeConfere]), [['b', true], ['a', false]]);
});

test('lista da Lagoa dos Patos 2025/2026: RGP sem pontos, cabeçalho com nome não gruda, prefixo errado avisa', () => {
  const r = ler(fx('lista-c.json'));
  assert.equal(r.linhas, 4);
  assert.deepEqual(r.registros.map(x => x.digitos), ['101010', '202020', null, '404040']);
  assert.equal(r.registros.find(x => x.n === 4).nome, 'DANIEL MODELO');
  assert.deepEqual(r.avisos.map(a => a.tipo).sort(), ['prefixo', 'semDigitos']);
  assert.ok(r.avisos.find(a => a.tipo === 'prefixo').texto.includes('RSPO'));
});

test('lista da Lagoa Mirim 2025/2026: CPF com hífen; nome mascarado vincula pelos dígitos e primeiro nome', () => {
  const r = ler(fx('lista-d.json'));
  assert.deepEqual(r.registros.map(x => x.digitos), ['505050', '606060']);
  const base = {};
  criar(base, { nome: 'Fabio Real Completo', cpf: '' });
  const p = Object.values(base)[0]; p.digitos = '606060';
  const m = mesclar(base, r.registros, { area: 'mirim', temporada: '2025/2026', importacao: 'h' });
  assert.equal(m.vinculados, 1);
  assert.equal(p.nome, 'FABIO REAL COMPLETO'); // nome mascarado não substitui o completo
  const b2 = {};
  mesclar(b2, r.registros, { area: 'mirim', temporada: '2025/2026', importacao: 'h' });
  mesclar(b2, [{ n: 9, nome: 'FABIO REAL COMPLETO', nomeNorm: 'FABIO REAL COMPLETO', cpf: '', rgp: 'RSPA***606060**', digitos: '606060' }], { area: 'mirim', temporada: '2026/2027', importacao: 'h2' });
  const f = Object.values(b2).find(x => x.digitos === '606060');
  assert.equal(Object.values(b2).length, 2);
  assert.equal(f.nome, 'FABIO REAL COMPLETO'); // o completo substitui o mascarado
  assert.equal(f.licencas.length, 2);
});

test('lista de autorização (automonitoramento, Prefeitura de Imbé): cabeçalho, nomes e CPF completo', () => {
  const { lerAutorizacao } = globalThis.Lista;
  const r = lerAutorizacao(fx('autorizacao.json'));
  assert.equal(r.titulo, 'Automonitoramento 2025');
  assert.equal(r.ano, '2025');
  assert.equal(r.categoria, 'Embarcado Baliza Tramandaí');
  assert.equal(r.orgao, 'Prefeitura Municipal de Imbé, Secretaria Municipal de Pesca');
  assert.equal(r.registros.length, 5);
  assert.deepEqual(r.registros[0], { n: 1, nome: 'JOAO FICTICIO DA SILVA', nomeNorm: 'JOAO FICTICIO DA SILVA', cpf: '11122233396', digitos: '222333' });
  assert.equal(r.registros[4].nome, 'ANA OUTRA PESSOA'); // segunda página, depois do rodapé e do cabeçalho repetido
  assert.deepEqual(r.avisos.map(a => [a.n, a.tipo]), [[3, 'cpfRepetido'], [4, 'cpfInvalido']]);
});

test('mescla de autorização: vincula pelo CPF ou dígitos + nome, grava o CPF, cria quem não está na base, não duplica', () => {
  const { lerAutorizacao, mesclarAutorizacao } = globalThis.Lista;
  const base = {};
  const ja = criar(base, { nome: 'JOAO FICTICIO SILVA', cpf: '' }); ja.digitos = '222333';
  const r = lerAutorizacao(fx('autorizacao.json'));
  const aut = { id: 'automonitoramento-2025-embarcado-baliza-tramandai', titulo: r.titulo, ano: r.ano, categoria: r.categoria, orgao: r.orgao, area: 'tramandai' };
  const m = mesclarAutorizacao(base, r.registros, aut);
  assert.equal(m.vinculados, 1);
  assert.equal(m.novos, 4);
  assert.equal(ja.cpf, '11122233396'); // CPF válido gravado na ficha
  assert.deepEqual(ja.autorizacoes.map(a => [a.id, a.n]), [[aut.id, 1]]);
  assert.ok(!Object.values(base).find(p => p.nomeNorm === 'CARLOS DIGITO ERRADO').cpf); // CPF inválido não é gravado
  const m2 = mesclarAutorizacao(base, r.registros, aut);
  assert.equal(m2.novos + m2.vinculados, 0);
  assert.equal(m2.jaTinha, 5);
});

test('juntar fichas: tudo passa para a que fica, abordagens e denúncias religadas, junção registrada', () => {
  const { juntarPessoas } = globalThis.Lista;
  const db = { cfg: { denuncias: [{ id: 'd1', pescadorIds: ['b'] }] }, abordagens: {
    a1: { id: 'a1', envolvidos: [{ pescadorId: 'b' }, { pescadorId: 'x' }] }, a2: { id: 'a2', pescadorId: 'b' } },
    pescadores: {
      a: { id: 'a', nome: 'JOAO FICTICIO', digitos: '222333', cpf: '', rgp: 'RSPA***222333**', telefone: '', obs: 'obs a',
        licencas: [{ area: 'tramandai', temporada: '2025/2026', n: 1 }], consultas: [{ id: 'c1' }], autorizacoes: [], embarcacoes: [] },
      b: { id: 'b', nome: 'JOAO FICTICIO DA SILVA', digitos: '222333', cpf: '11122233396', rgp: '', telefone: '51 0000-0000', obs: 'obs b',
        licencas: [{ area: 'tramandai', temporada: '2025/2026', n: 1 }, { area: 'patos', temporada: '2025/2026', n: 9 }], consultas: [{ id: 'c1' }, { id: 'c2' }],
        autorizacoes: [{ id: 'aut', n: 3 }], embarcacoes: [{ id: 'e1' }], veiculos: [{ id: 'v1' }] } } };
  const r = juntarPessoas(db, 'a', 'b');
  const a = db.pescadores.a;
  assert.ok(!db.pescadores.b);
  assert.deepEqual(a.licencas.map(l => l.area), ['tramandai', 'patos']);
  assert.deepEqual(a.consultas.map(c => c.id), ['c1', 'c2']);
  assert.deepEqual(a.autorizacoes.map(x => x.id), ['aut']);
  assert.deepEqual([a.embarcacoes.length, a.veiculos.length], [1, 1]);
  assert.equal(a.cpf, '11122233396');
  assert.equal(a.telefone, '51 0000-0000');
  assert.equal(a.obs, 'obs a\nobs b');
  assert.equal(a.nome, 'JOAO FICTICIO'); // o nome da que fica não muda
  assert.deepEqual(db.abordagens.a1.envolvidos.map(e => e.pescadorId), ['a', 'x']);
  assert.equal(db.abordagens.a2.pescadorId, 'a');
  assert.deepEqual(db.cfg.denuncias[0].pescadorIds, ['a']);
  assert.deepEqual(db.cfg.juncoes, { b: 'a' });
  assert.deepEqual(r.abordagens.sort(), ['a1', 'a2']);
});

test('corrigir cadastro: nome, CPF e RGP; CPF com outros dígitos é recusado', () => {
  const { corrigirCadastro } = globalThis.Lista;
  const p = { id: 'a', nome: 'JOAO FICTICIO', nomeNorm: 'JOAO FICTICIO', digitos: '222333', cpf: '', rgp: '', licencas: [{ area: 'tramandai' }] };
  assert.match(corrigirCadastro(p, { nome: 'João', cpf: '', rgp: '' }), /nome e sobrenome/);
  assert.match(corrigirCadastro(p, { nome: 'João Fictício', cpf: '111.222.333-00', rgp: '' }), /CPF inválido/);
  assert.match(corrigirCadastro(p, { nome: 'João Fictício', cpf: '444.555.666-19', rgp: '' }), /dígitos/);
  assert.equal(corrigirCadastro(p, { nome: 'João Fictício da Silva', cpf: '111.222.333-96', rgp: 'rspa***222333**' }), null);
  assert.deepEqual([p.nome, p.nomeNorm, p.cpf, p.rgp], ['JOAO FICTICIO DA SILVA', 'JOAO FICTICIO DA SILVA', '11122233396', 'RSPA***222333**']);
  const semDig = { id: 'z', nome: 'X Y', nomeNorm: 'X Y', digitos: null, cpf: '', rgp: '' };
  assert.equal(corrigirCadastro(semDig, { nome: 'X Y', cpf: '44455566619', rgp: '' }), null);
  assert.equal(semDig.digitos, '555666'); // sem dígitos de lista, o CPF define os dígitos
});

test('juntar fichas: CPF da ficha apagada com outros dígitos não passa para a que fica (CPF errado na lista)', () => {
  const { juntarPessoas } = globalThis.Lista;
  const db = { cfg: {}, abordagens: {}, pescadores: {
    a: { id: 'a', nome: 'JOAO FICTICIO', digitos: '222333', cpf: '', licencas: [{ area: 'tramandai', temporada: '2025/2026', n: 1 }] },
    b: { id: 'b', nome: 'JOAO FICTISSIO', digitos: '555666', cpf: '44455566619', licencas: [], autorizacoes: [{ id: 'aut', n: 3 }] } } };
  const r = juntarPessoas(db, 'a', 'b');
  assert.equal(db.pescadores.a.cpf, '');
  assert.match(r.avisos.join(' '), /CPF/);
  assert.deepEqual(db.pescadores.a.autorizacoes.map(x => x.id), ['aut']);
});

test('corrigir cadastro: ficha sem lista do MPA aceita troca de CPF e de dígitos', () => {
  const { corrigirCadastro } = globalThis.Lista;
  const p = { id: 'b', nome: 'JOAO FICTISSIO', nomeNorm: 'JOAO FICTISSIO', digitos: '555666', cpf: '44455566619', rgp: '', licencas: [] };
  assert.equal(corrigirCadastro(p, { nome: 'João Fictício', cpf: '111.222.333-96', rgp: '' }), null);
  assert.deepEqual([p.cpf, p.digitos], ['11122233396', '222333']);
});

test('lista do Projeto de Monitoramento (BHRT): nº, categoria por linha, nome quebrado, CPF com erro de digitação, asterisco', () => {
  const { lerAutorizacao } = globalThis.Lista;
  const r = lerAutorizacao(fx('autorizacao-projeto.json'));
  assert.equal(r.titulo, 'Projeto de Monitoramento da Pesca Artesanal');
  assert.equal(r.orgao, 'Projeto de Monitoramento da Pesca Artesanal na Bacia Hidrográfica do Rio Tramandaí e Região Marinha Adjacente');
  assert.equal(r.categoria, 'Fora de Baliza Embarcado e Desembarcado');
  assert.deepEqual(r.registros.map(x => x.n), [1, 2, 3, 4, 5, 6]);
  assert.deepEqual(r.registros.map(x => x.categoria), ['Embarcado Fora da Baliza', 'Caniço/Tarrafa/Fora da Baliza', 'Caniço/Tarrafa/Fora da Baliza',
    'Embarcado Fora da Baliza', 'Embarcado Fora da Baliza', 'Embarcado Fora da Baliza']);
  assert.equal(r.registros[3].nome, 'SANDRO NOME QUEBRADO GOMES DE OLIVEIRA');
  assert.equal(r.registros[1].cpf, '40450560686'); // ";" no meio do CPF: lido
  assert.equal(r.registros[4].cpf, '12123234320'); // ponto no lugar do hífen: lido
  assert.deepEqual([r.registros[2].cpf, r.registros[2].digitos], ['', null]); // 10 dígitos: sem CPF e sem dígitos
  const av = Object.fromEntries(r.avisos.map(a => [a.n, a.tipo]));
  assert.deepEqual(av, { 3: 'cpfInvalido', 5: 'nomeAsterisco' });
  assert.equal(r.registros[5].nome, 'ANA OUTRA PESSOA');
});

test('autorização: a categoria da linha vale para a pessoa; sem dígitos, vincula só pelo nome exato', () => {
  const { lerAutorizacao, mesclarAutorizacao } = globalThis.Lista;
  const base = {};
  const ja = criar(base, { nome: 'PEDRO DEZ DIGITOS', cpf: '' }); ja.digitos = '999888';
  criar(base, { nome: 'OUTRO SEM DIGITOS', cpf: '' });
  const r = lerAutorizacao(fx('autorizacao-projeto.json'));
  const m = mesclarAutorizacao(base, r.registros, { id: 'proj-fora', titulo: r.titulo, categoria: r.categoria, orgao: r.orgao, area: 'tramandai' });
  assert.equal(m.vinculados, 1);
  assert.equal(ja.autorizacoes[0].categoria, 'Caniço/Tarrafa/Fora da Baliza');
  assert.equal(Object.values(base).find(p => p.nomeNorm === 'OUTRO SEM DIGITOS').autorizacoes, undefined);
});
