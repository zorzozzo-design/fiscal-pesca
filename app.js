const { ler, mesclar, temporadaAtual, situacao, buscar, parecido, cpfValido, criar, lerConsulta, AVISO_TXT } = window.Lista;
const { avaliar, ultimaConsulta, corDe, AREAS_COM_LISTA } = window.Semaforo;
const { checar, multaReferencia, LOCAIS } = window.Normas;
const { itensDaAbordagem, termoApreensao, notificacao, motivoSugerido, DESTINOS } = window.Docs;

// ---------- utilitários ----------
const $ = s => document.querySelector(s);
const app = $('#app');
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const agora = () => new Date().toISOString();
const fmtDH = iso => iso ? new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : '';
const hojeIso = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const fmtDig = d => d ? `***.${d.slice(0, 3)}.${d.slice(3)}-**` : 'sem dígitos';
// Converte em blocos: espalhar o array inteiro em fromCharCode estoura a pilha com bases grandes.
const b64 = buf => {
  const u = new Uint8Array(buf);
  let s = '';
  for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode.apply(null, u.subarray(i, i + 0x8000));
  return btoa(s);
};
const unb64 = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));
const PARTICULAS = new Set(['de', 'da', 'do', 'das', 'dos', 'e', 'di', 'du', 'del', 'van', 'von']);
const nomeProprio = s => String(s ?? '').toLowerCase().trim().split(/\s+/).map((w, i) => i && PARTICULAS.has(w) ? w
  : w.replace(/(^|['\-])(\p{L})/gu, (_, sep, l) => sep + l.toUpperCase())).join(' ');

const AREAS = { tramandai: 'Bacia do Rio Tramandaí (IN MMA 17/2004)', mar: 'Mar (sem lista nominal)', outras: 'Outras lagoas e rios (fora da bacia)' };
const AREA_CURTA = { tramandai: 'Tramandaí', mar: 'Mar', outras: 'Outras águas' };
const SIT = { atual: ['Na lista atual', 'ok'], saiu: ['Saiu da lista atual', 'alerta'], nunca: ['Sem licença na área', 'aviso'] };

// ---------- armazenamento criptografado (IndexedDB + AES-GCM), mesmo modelo do Fiscal Passeriformes ----------
// Cada pescador é um registro cifrado separado. "meta" guarda o salt, as configurações e o histórico de importações.
function idb() {
  return new Promise((ok, erro) => {
    const r = indexedDB.open('fiscal-pesca', 2);
    r.onupgradeneeded = () => {
      for (const loja of ['kv', 'pescadores', 'abordagens']) if (!r.result.objectStoreNames.contains(loja)) r.result.createObjectStore(loja);
    };
    r.onsuccess = () => ok(r.result);
    r.onerror = () => erro(r.error);
  });
}
async function tx(loja, modo, fn) {
  const d = await idb();
  return new Promise((ok, erro) => {
    const t = d.transaction(loja, modo);
    const r = fn(t.objectStore(loja));
    t.oncomplete = () => ok(r?.result);
    t.onerror = () => erro(t.error);
  });
}
const apagarTudo = () => new Promise(ok => {
  const r = indexedDB.deleteDatabase('fiscal-pesca');
  r.onsuccess = r.onerror = r.onblocked = () => ok();
});

async function derivar(senha, salt) {
  const base = await crypto.subtle.importKey('raw', new TextEncoder().encode(senha), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey({ name: 'PBKDF2', salt, iterations: 310000, hash: 'SHA-256' },
    base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
}
async function cifrar(chave, salt, obj) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, chave, new TextEncoder().encode(JSON.stringify(obj)));
  return { app: 'fiscal-pesca', v: 1, salt: b64(salt), iv: b64(iv), ct: b64(ct) };
}
async function decifrar(chave, cofre) {
  const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(cofre.iv) }, chave, unb64(cofre.ct));
  return JSON.parse(new TextDecoder().decode(pt));
}

let chave = null, salt = null, db = null;
const sujos = new Set(); // pescadores alterados desde o último salvamento
const sujosAb = new Set(); // abordagens alteradas
async function salvar() {
  const lote = [...sujos], loteAb = [...sujosAb];
  sujos.clear(); sujosAb.clear();
  const meta = await cifrar(chave, salt, { cfg: db.cfg, importacoes: db.importacoes });
  const regs = await Promise.all(lote.map(async id => [id, await cifrar(chave, salt, db.pescadores[id])]));
  const regsAb = await Promise.all(loteAb.map(async id => [id, await cifrar(chave, salt, db.abordagens[id])]));
  if (regs.length) await tx('pescadores', 'readwrite', s => regs.forEach(([id, v]) => s.put(v, id)));
  if (regsAb.length) await tx('abordagens', 'readwrite', s => regsAb.forEach(([id, v]) => s.put(v, id)));
  await tx('kv', 'readwrite', s => s.put(meta, 'meta'));
}
async function lerLoja(loja) {
  const d = await idb();
  return new Promise((ok, erro) => {
    const out = [], r = d.transaction(loja).objectStore(loja).openCursor();
    r.onsuccess = () => { const c = r.result; if (!c) return ok(out); out.push([c.key, c.value]); c.continue(); };
    r.onerror = () => erro(r.error);
  });
}
async function carregar(meta) {
  const m = await decifrar(chave, meta);
  db = { cfg: m.cfg, importacoes: m.importacoes || [], pescadores: {}, abordagens: {} };
  for (const [id, v] of await lerLoja('pescadores')) db.pescadores[id] = await decifrar(chave, v);
  for (const [id, v] of await lerLoja('abordagens')) db.abordagens[id] = await decifrar(chave, v);
}

// ---------- tela de senha ----------
async function telaSenha() {
  const meta = await tx('kv', 'readonly', s => s.get('meta'));
  app.innerHTML = `<div class="card centro">
    <h1>${meta ? 'Desbloquear' : 'Criar senha'}</h1>
    <p class="muted peq">${meta ? 'Os dados ficam criptografados neste aparelho.'
      : 'Os dados ficam só neste aparelho, criptografados com esta senha. Sem ela não há como recuperar.'}</p>
    <form id="f">
      <label for="s1">Senha</label><input id="s1" type="password" autocomplete="current-password" required minlength="6">
      ${meta ? '' : '<label for="s2">Repita a senha</label><input id="s2" type="password" required minlength="6">'}
      <p><button>${meta ? 'Entrar' : 'Criar'}</button></p>
      <p id="m" class="msg erro"></p>
    </form>
    ${meta ? '<p class="peq"><a href="#" id="esqueci">Esqueci a senha (apaga tudo)</a></p>' : ''}
  </div>`;
  $('#s1').focus();
  $('#f').onsubmit = async e => {
    e.preventDefault();
    const s1 = $('#s1').value;
    try {
      if (meta) {
        salt = unb64(meta.salt);
        chave = await derivar(s1, salt);
        await carregar(meta);
      } else {
        if (s1 !== $('#s2').value) throw new Error('As senhas não conferem.');
        salt = crypto.getRandomValues(new Uint8Array(16));
        chave = await derivar(s1, salt);
        db = { cfg: {}, importacoes: [], pescadores: {}, abordagens: {} };
        await salvar();
      }
      $('#nav').hidden = false;
      rotear();
    } catch (err) {
      chave = null;
      $('#m').textContent = err.message?.includes('conferem') ? err.message : 'Senha incorreta.';
    }
  };
  $('#esqueci')?.addEventListener('click', async e => {
    e.preventDefault();
    if (confirm('Apagar todos os dados deste aparelho?')) { await apagarTudo(); location.reload(); }
  });
}

// ---------- lista de pescadores ----------
const filtro = { q: '', sit: '' };
const LIMITE = 200;
function porDigitos() {
  const m = new Map();
  for (const p of Object.values(db.pescadores)) if (p.digitos) m.set(p.digitos, (m.get(p.digitos) || 0) + 1);
  return m;
}
function telaLista() {
  const atual = temporadaAtual(db.importacoes, 'tramandai');
  const todos = Object.values(db.pescadores);
  if (!todos.length) {
    app.innerHTML = `<div class="card"><h1>Pescadores</h1>
      <p>Nenhum pescador na base. Importe a lista de licenciados do MPA em <a href="#/dados">Dados</a>.</p></div>`;
    return;
  }
  app.innerHTML = `<div class="card"><h1>Pescadores</h1>
      <p class="muted peq">${esc(AREAS.tramandai)} · temporada atual: ${esc(atual || 'nenhuma importada')}</p>
      <div class="filtros" style="grid-template-columns:2fr 1fr">
        <input id="q" type="search" placeholder="Nome, CPF, dígitos ou RGP" value="${esc(filtro.q)}" autocomplete="off">
        <select id="sit">
          <option value="">Todos</option>
          <option value="atual">Na lista atual</option>
          <option value="saiu">Saiu da lista atual</option>
          <option value="digitos">Mesmos dígitos de outra pessoa</option>
        </select>
      </div>
      <p id="cont" class="muted peq"></p>
      <ul id="lista" class="lista"></ul></div>`;
  $('#sit').value = filtro.sit;
  const dig = porDigitos();
  const desenhar = () => {
    let ps = buscar(todos, filtro.q);
    if (filtro.sit === 'digitos') ps = ps.filter(p => dig.get(p.digitos) > 1);
    else if (filtro.sit) ps = ps.filter(p => situacao(p, 'tramandai', atual) === filtro.sit);
    ps.sort((a, b) => a.nomeNorm.localeCompare(b.nomeNorm));
    $('#cont').textContent = `${ps.length} de ${todos.length} pescadores${ps.length > LIMITE ? ` · mostrando os ${LIMITE} primeiros, refine a busca` : ''}`;
    $('#lista').innerHTML = ps.slice(0, LIMITE).map(p => {
      const [txt, cls] = SIT[situacao(p, 'tramandai', atual)];
      return `<li><a href="#/p/${encodeURIComponent(p.id)}">
        <div class="nome">${esc(nomeProprio(p.nome))}</div>
        <div class="info">${esc(p.rgp || fmtDig(p.digitos))}</div>
        <span class="tag ${cls}">${txt}</span>${dig.get(p.digitos) > 1 ? '<span class="tag aviso">Mesmos dígitos de outra pessoa</span>' : ''}
      </a></li>`;
    }).join('') || '<li class="muted peq" style="padding:10px">Nenhum pescador encontrado.</li>';
  };
  desenhar();
  $('#q').oninput = e => { filtro.q = e.target.value; desenhar(); };
  $('#sit').onchange = e => { filtro.sit = e.target.value; desenhar(); };
}

// ---------- ficha ----------
function telaFicha(id) {
  const p = db.pescadores[id];
  if (!p) { app.innerHTML = '<div class="card"><p>Pescador não encontrado.</p><p><a href="#/">Voltar</a></p></div>'; return; }
  const atual = temporadaAtual(db.importacoes, 'tramandai');
  const [txt, cls] = SIT[situacao(p, 'tramandai', atual)];
  const lics = p.licencas.slice().sort((a, b) => b.temporada.localeCompare(a.temporada));
  const outros = Object.values(db.pescadores).filter(o => o !== p && o.digitos && o.digitos === p.digitos);
  app.innerHTML = `<div class="card">
      <p class="peq"><a href="#/">← Pescadores</a></p>
      <h1>${esc(nomeProprio(p.nome))}</h1>
      <span class="tag ${cls}">${txt}</span>
      <div class="grade" style="margin-top:10px">
        <div><span>RGP (lista mais recente)</span>${esc(p.rgp || '-')}</div>
        <div><span>CPF (dígitos publicados)</span>${esc(fmtDig(p.digitos))}</div>
        <div><span>Temporada atual da área</span>${esc(atual || '-')}</div>
        ${p.cpf ? `<div><span>CPF conferido em campo</span>${esc(fmtCpf(p.cpf))}</div>` : ''}
        ${QUALIFICACAO.filter(([k]) => p[k]).map(([k, rot]) => `<div><span>${rot}</span>${esc(p[k])}</div>`).join('')}
      </div>
      <p><a class="btn" href="#/ab/novo?p=${encodeURIComponent(p.id)}">Nova abordagem</a></p></div>
    ${outros.length ? `<div class="card revisar"><h2>Mesmos dígitos de CPF</h2>
      <p class="muted peq">As listas publicam só 6 dígitos do CPF. Pode ser outra pessoa ou a mesma com nome escrito diferente: confira o documento.</p>
      <ul class="lista">${outros.map(o => `<li><a href="#/p/${encodeURIComponent(o.id)}">${esc(nomeProprio(o.nome))} <span class="info">${esc(o.rgp)}</span></a></li>`).join('')}</ul></div>` : ''}
    <div class="card"><h2>Licenças por temporada</h2>
      <div class="tabela"><table><thead><tr><th>Temporada</th><th>Área</th><th>Nº</th><th>Nome na lista</th><th>RGP na lista</th></tr></thead>
      <tbody>${lics.map(l => `<tr><td>${esc(l.temporada)}</td><td>${esc(AREA_CURTA[l.area] || l.area)}</td><td>${l.n}</td><td>${esc(l.nomeLista)}</td><td>${esc(l.rgp)}</td></tr>`).join('')}</tbody></table></div>
      ${lics.length ? '' : '<p class="muted peq">Em nenhuma lista importada.</p>'}</div>
    <div class="card"><h2>Consultas ao PesqBrasil</h2>${tabelaConsultas(p)}</div>
    <div class="card"><h2>Abordagens</h2>${listaAbordagens(Object.values(db.abordagens).filter(a => a.pescadorId === p.id))}</div>
    <div class="card"><h2>Observações</h2>
      <textarea id="obs" placeholder="Anotações de fiscalização">${esc(p.obs)}</textarea>
      <p><button id="b-obs" type="button">Salvar</button> <span id="m-obs" class="muted peq"></span></p></div>`;
  $('#b-obs').onclick = async () => {
    p.obs = $('#obs').value.trim();
    p.atualizadoEm = agora();
    sujos.add(p.id);
    await salvar();
    $('#m-obs').textContent = 'Salvo.';
  };
}

// ---------- abordagem em campo ----------
const PESQBRASIL = 'https://pesqbrasil-pescadorprofissional.mpa.gov.br/acesso-externo';
const SITUACOES = ['Ativo', 'Suspenso', 'Cancelado', 'Em análise', 'Não encontrado'];
const PETRECHOS = ['Rede de emalhe', 'Tarrafa', 'Tarrafa de camarão', 'Espinhel', 'Aviãozinho', 'Rede de arrasto', 'Linha e anzol', 'Covo/armadilha', 'Outro'];
// Nomes iguais aos da tabela de tamanho mínimo (normas.js) para a checagem funcionar.
const ESPECIES = ['Tainha', 'Camarão-rosa', 'Bagre', 'Bagre-branco', 'Corvina', 'Peixe-rei', 'Traíra', 'Jundiá', 'Linguado', 'Pescadinha',
  'Pescada-olhuda', 'Papa-terra', 'Anchova', 'Miraguaia', 'Parati', 'Robalo-peva', 'Robalo-flecha', 'Siri'];
const EMBARCACOES = ['Nenhuma', 'A remo', 'Motorizada'];
const CATEGORIAS = ['Profissional', 'Amador'];
const CAMARAO_PADRAO = { inicio: '2026-01-23', fim: '2026-06-21' }; // Portaria Interministerial MPA/MMA 48/2026
const fmtReais = v => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const PROVIDENCIAS = ['Nenhuma (regular)', 'Orientação', 'Notificação', 'Auto de infração', 'Apreensão', 'Outra'];
const COR_TXT = { verde: 'Pode pescar', amarelo: 'Conferir', vermelho: 'Irregular' };
const fmtCpf = c => c ? `${c.slice(0, 3)}.${c.slice(3, 6)}.${c.slice(6, 9)}-${c.slice(9)}` : '';
const fmtData = iso => iso ? iso.slice(0, 10).split('-').reverse().join('/') : '';
const agoraLocal = () => { const d = new Date(); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 16); };
const novoId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const opcoes = (lista, sel) => lista.map(v => `<option${v === sel ? ' selected' : ''}>${esc(v)}</option>`).join('');

const tabelaConsultas = p => !(p.consultas || []).length ? '<p class="muted peq">Nenhuma consulta registrada.</p>' : `
  <div class="tabela"><table><thead><tr><th>Data</th><th>Situação do RGP</th><th>Município</th><th>Primeiro RGP</th><th>Atuação</th><th>Locais de pesca</th><th>Obs.</th></tr></thead>
  <tbody>${p.consultas.slice().sort((a, b) => b.data.localeCompare(a.data)).map(c => `<tr><td>${fmtData(c.data)}</td><td>${esc(c.situacao)}</td>
    <td>${esc(c.municipio)}</td><td>${fmtData(c.primeiroRgp)}</td><td>${esc([c.categoria, c.formaAtuacao, c.produto].filter(Boolean).join(', '))}</td>
    <td>${esc((c.locais || []).map(l => `${l.tipo} ${l.municipio}`).join(', '))}</td><td>${esc(c.obs)}</td></tr>`).join('')}</tbody></table></div>`;

const listaAbordagens = abs => !abs.length ? '<p class="muted peq">Nenhuma abordagem.</p>' : `<ul class="lista">${abs
  .sort((a, b) => b.data.localeCompare(a.data)).map(a => { const p = db.pescadores[a.pescadorId]; return `<li><a href="#/ab/${a.id}">
    <div class="nome">${esc(p ? nomeProprio(p.nome) : 'Pessoa removida')}</div>
    <div class="info">${fmtData(a.data)} ${esc(a.data.slice(11, 16))} · ${esc(AREA_CURTA[a.area])}${a.local ? ' · ' + esc(a.local) : ''}${a.providencia ? ' · ' + esc(a.providencia) : ''}</div>
    <span class="tag sem-${a.semaforo.cor}">${COR_TXT[a.semaforo.cor]}</span>${a.apreensao?.itens?.length ? '<span class="tag">Apreensão</span>' : ''}${a.notificacao ? '<span class="tag">Notificação</span>' : ''}</a></li>`; }).join('')}</ul>`;

// Imprime (ou salva em PDF) só o documento, escondendo o app.
function imprimir(html) {
  let d = $('#impressao');
  if (!d) { d = Object.assign(document.createElement('div'), { id: 'impressao' }); document.body.appendChild(d); }
  d.innerHTML = html;
  document.body.classList.add('imprimindo');
  const fim = () => { document.body.classList.remove('imprimindo'); removeEventListener('afterprint', fim); };
  addEventListener('afterprint', fim);
  print();
}

const QUALIFICACAO = [['rg', 'RG'], ['telefone', 'Telefone'], ['endereco', 'Endereço'], ['bairro', 'Bairro'], ['municipio', 'Município']];
const UNIDADES = ['un', 'kg', 'm'];

function telaAbordagens() {
  app.innerHTML = `<div class="card"><h1>Abordagens</h1>
    <p><a class="btn" href="#/ab/novo">Nova abordagem</a></p>
    ${listaAbordagens(Object.values(db.abordagens))}</div>`;
}

function telaAbordagem(param) {
  const [idUrl, query] = param.split('?');
  const existente = db.abordagens[idUrl];
  if (idUrl !== 'novo' && !existente) { app.innerHTML = '<div class="card"><p>Abordagem não encontrada.</p><p><a href="#/abordagens">Voltar</a></p></div>'; return; }
  const pInicial = new URLSearchParams(query || '').get('p');
  const ab = existente ? structuredClone(existente) : { id: novoId(), data: agoraLocal(), area: 'tramandai', local: '', gps: null,
    pescadorId: db.pescadores[pInicial] ? pInicial : null, identificadoPor: 'nome', cpfInformado: '', petrechos: [], pescado: [],
    providencia: '', documento: '', obs: '', localTipo: '', embarcacao: 'Nenhuma', categoria: 'Profissional' };
  const pesc = () => db.pescadores[ab.pescadorId] || null;
  const atualDe = area => AREAS_COM_LISTA.has(area) ? temporadaAtual(db.importacoes, area) : null;
  // Lista e PesqBrasil (semaforo.js) + regras de pesca R02 a R17 (normas.js).
  const semaforo = () => {
    const s = avaliar({ pescador: pesc(), area: ab.area, atual: atualDe(ab.area), data: ab.data, identificadoPor: ab.identificadoPor,
      outrosMesmosDigitos: pesc()?.digitos ? Object.values(db.pescadores).filter(o => o.digitos === pesc().digitos && o.id !== ab.pescadorId).length : 0,
      categoria: ab.categoria || 'Profissional', soLinha: ab.petrechos.every(p => p.tipo === 'Linha e anzol') });
    const motivos = [...s.motivos, ...checar(ab, { camarao: db.cfg.camarao || CAMARAO_PADRAO })];
    return { cor: corDe(motivos), motivos };
  };
  const opcoesLocal = () => `<option value="">(não informado)</option>${opcoes(LOCAIS[ab.area], ab.localTipo)}`;

  app.innerHTML = `<div class="card">
      <p class="peq"><a href="#/abordagens">← Abordagens</a></p>
      <h1>${existente ? 'Abordagem' : 'Nova abordagem'}</h1>
      <div class="grade">
        <div><label for="a-area">Área</label><select id="a-area">${Object.entries(AREAS).map(([k, v]) => `<option value="${k}"${k === ab.area ? ' selected' : ''}>${esc(v)}</option>`).join('')}</select></div>
        <div><label for="a-data">Data e hora</label><input id="a-data" type="datetime-local" value="${esc(ab.data)}"></div>
        <div style="grid-column:1/-1"><label for="a-loc">Local na área</label><select id="a-loc">${opcoesLocal()}</select></div>
        <div><label for="a-emb">Embarcação</label><select id="a-emb">${opcoes(EMBARCACOES, ab.embarcacao || 'Nenhuma')}</select></div>
        <div><label for="a-cat">Categoria</label><select id="a-cat">${opcoes(CATEGORIAS, ab.categoria || 'Profissional')}</select></div>
      </div></div>
    <div class="card"><h2>Pessoa</h2><div id="pessoa"></div></div>
    <div class="card" id="c-qual" hidden><h2>Qualificação</h2><p class="muted peq">Usada na notificação e no termo. Fica salva no cadastro da pessoa.</p><div id="qual" class="grade"></div></div>
    <div id="sem"></div>
    <div class="card" id="c-consulta" hidden><h2>Consulta ao PesqBrasil</h2><div id="consulta"></div></div>
    <div class="card"><h2>Local</h2>
      <input id="a-local" placeholder="Ex.: Lagoa do Armazém, margem leste" value="${esc(ab.local)}">
      <div class="linha" style="margin-top:8px"><button class="sec" id="b-gps" type="button">Usar GPS</button><span id="gps" class="muted peq"></span></div></div>
    <div class="card"><h2>Petrechos</h2><div id="petrechos"></div>
      <button class="sec" id="b-pet" type="button">Adicionar petrecho</button></div>
    <div class="card"><h2>Pescado</h2><div id="pescado"></div>
      <button class="sec" id="b-pes" type="button">Adicionar pescado</button>
      <datalist id="especies">${ESPECIES.map(e => `<option value="${esc(e)}">`).join('')}</datalist></div>
    <div class="card"><h2>Apreensão</h2>
      <label class="chk"><input type="checkbox" id="ap-on"${ab.apreensao ? ' checked' : ''}> Houve apreensão</label>
      <div id="ap"></div></div>
    <div class="card"><h2>Notificação</h2>
      <label class="chk"><input type="checkbox" id="nt-on"${ab.notificacao ? ' checked' : ''}> Notificar a pessoa</label>
      <div id="nt"></div></div>
    <div class="card"><h2>Providência</h2>
      <div class="grade">
        <div><label for="a-prov">Providência</label><select id="a-prov"><option value=""></option>${opcoes(PROVIDENCIAS, ab.providencia)}</select></div>
        <div><label for="a-doc">Nº do documento</label><input id="a-doc" value="${esc(ab.documento)}" placeholder="Auto, notificação, BO"></div>
      </div>
      <label for="a-obs">Observações</label><textarea id="a-obs">${esc(ab.obs)}</textarea>
      <p><button id="b-salvar" type="button">Salvar abordagem</button></p>
      <p id="m-ab" class="msg"></p></div>`;

  const desenharSem = () => {
    const s = semaforo();
    $('#sem').innerHTML = `<div class="card sem sem-${s.cor}"><div class="sem-cor">${COR_TXT[s.cor]}</div>
      <ul>${s.motivos.map(m => `<li class="m-${m.nivel}">${esc(m.texto)}${m.norma ? `<div class="sem-norma">${esc(m.norma)}${m.enquadramento ? ' · ' + esc(m.enquadramento) : ''}</div>` : ''}</li>`).join('')}</ul>
      ${(() => { const kg = ab.pescado.reduce((t, x) => t + (+x.kg || 0), 0), mr = multaReferencia(s.motivos, kg);
        return mr ? `<div class="sem-multa">Multa mínima de referência: ${fmtReais(mr.minimo)} (Dec. 6.514/2008, art. ${mr.artigo}: ${mr.artigo === 35 ? 'R$ 700' : 'R$ 300'} + R$ 20 por kg, ${String(kg).replace('.', ',')} kg)</div>` : ''; })()}</div>`;
  };

  const desenharConsulta = () => {
    const p = pesc();
    $('#c-consulta').hidden = !p;
    if (!p) return;
    const cpf = p.cpf || (ab.identificadoPor === 'cpf' ? ab.cpfInformado : '');
    const c = ultimaConsulta(p.consultas, ab.data);
    $('#consulta').innerHTML = `
      <p class="muted peq">${c ? `Última: ${fmtData(c.data)}, ${esc(c.situacao)}.` : 'Nenhuma consulta registrada.'} A consulta é feita por você no site, uma por vez.</p>
      <p><button class="sec" id="b-pesq" type="button">${cpf ? 'Copiar CPF e abrir o PesqBrasil' : 'Abrir o PesqBrasil'}</button></p>
      <label for="c-cola">Resultado copiado do PesqBrasil (selecionar tudo, copiar e colar aqui)</label>
      <textarea id="c-cola" rows="3" placeholder="Cole o texto da página de resultado"></textarea>
      <p id="c-lido" class="muted peq"></p>
      <div class="grade">
        <div><label for="c-sit">Situação do RGP</label><select id="c-sit">${opcoes(SITUACOES, 'Ativo')}</select></div>
        <div><label for="c-mun">Município</label><input id="c-mun"></div>
        <div><label for="c-pri">Data do primeiro RGP</label><input id="c-pri" type="date"></div>
      </div>
      <label for="c-obs">Observação da consulta</label><input id="c-obs">
      <p><button id="b-cons" type="button">Registrar consulta de hoje</button> <span id="m-cons" class="muted peq"></span></p>`;
    $('#b-pesq').onclick = async () => {
      if (cpf) { try { await navigator.clipboard.writeText(cpf); } catch { /* sem área de transferência: o CPF aparece na ficha */ } }
      open(PESQBRASIL, '_blank', 'noopener');
    };
    let lido = null; // demais campos do resultado colado (categoria, forma de atuação, locais de pesca...)
    $('#c-cola').oninput = e => {
      lido = lerConsulta(e.target.value);
      const m = $('#c-lido');
      if (!e.target.value.trim()) { m.textContent = ''; return; }
      if (!lido) { m.textContent = 'Não reconheci o resultado. Copie a página inteira depois de consultar.'; m.className = 'msg erro'; return; }
      if (lido.digitos && p.digitos && lido.digitos !== p.digitos) {
        m.textContent = `Este resultado é de outro CPF (${fmtDig(lido.digitos)}), não de ${nomeProprio(p.nome)}.`; m.className = 'msg erro'; lido = null; return;
      }
      if (!SITUACOES.includes(lido.situacao)) $('#c-sit').insertAdjacentHTML('beforeend', `<option>${esc(lido.situacao)}</option>`);
      $('#c-sit').value = lido.situacao; $('#c-mun').value = lido.municipio; $('#c-pri').value = lido.primeiroRgp;
      m.className = 'muted peq';
      m.textContent = [lido.categoria, lido.formaAtuacao, lido.produto, lido.tipoRegistro].filter(Boolean).join(' · ')
        + (lido.locais.length ? ` · Locais de pesca: ${lido.locais.map(l => `${l.tipo} em ${l.municipio}/${l.uf}`).join(', ')}` : '');
    };
    $('#b-cons').onclick = async () => {
      (p.consultas ||= []).push({ ...(lido || {}), id: novoId(), data: agora(), situacao: $('#c-sit').value, municipio: $('#c-mun').value.trim(),
        primeiroRgp: $('#c-pri').value, obs: $('#c-obs').value.trim() });
      p.atualizadoEm = agora();
      sujos.add(p.id);
      await salvar();
      desenharConsulta(); desenharSem();
      $('#m-cons').textContent = 'Consulta registrada.';
    };
  };

  const escolher = (p, porCpf, cpf) => {
    ab.pescadorId = p.id;
    ab.identificadoPor = porCpf ? 'cpf' : 'nome';
    ab.cpfInformado = porCpf ? cpf : '';
    desenharPessoa(); desenharSem(); desenharConsulta(); desenharQual();
  };

  const desenharQual = () => {
    const p = pesc();
    $('#c-qual').hidden = !p;
    if (!p) return;
    $('#qual').innerHTML = QUALIFICACAO.map(([k, rot]) => `<div><label for="q-${k}">${rot}</label><input id="q-${k}" data-q="${k}" value="${esc(p[k] || '')}"></div>`).join('');
    $('#qual').querySelectorAll('[data-q]').forEach(el => el.oninput = () => { p[el.dataset.q] = el.value.trim(); p.atualizadoEm = agora(); sujos.add(p.id); });
  };

  const exigePessoa = msgId => { if (pesc()) return true; $(msgId).textContent = 'Selecione a pessoa abordada antes.'; $(msgId).className = 'msg erro'; return false; };

  const CAMPOS_AP = [['tipo', 'Tipo', 'select', ['Petrecho', 'Pescado', 'Outro']], ['descricao', 'Descrição', 'text', ''],
    ['quantidade', 'Quantidade', 'number', 'min="0" step="0.1" inputmode="decimal"'], ['unidade', 'Unidade', 'select', UNIDADES]];
  const FIEL = [['nome', 'Nome'], ['rg', 'RG'], ['cpf', 'CPF'], ['telefone', 'Telefone'], ['endereco', 'Endereço'], ['municipioUf', 'Município/UF']];
  const desenharApreensao = () => {
    const a = ab.apreensao;
    if (!a) { $('#ap').innerHTML = ''; return; }
    $('#ap').innerHTML = `
      <div class="grade">
        <div><label for="ap-tipo">Documento lavrado</label><select id="ap-tipo">${opcoes(['BO/TC-COP', 'BA'], a.docTipo)}</select></div>
        <div><label for="ap-num">Nº</label><input id="ap-num" value="${esc(a.docNumero)}"></div></div>
      <h3>Itens apreendidos</h3><div id="ap-itens"></div>
      <div class="linha"><button class="sec" id="b-ap-add" type="button">Adicionar item</button>
        <button class="sec" id="b-ap-trazer" type="button">Trazer petrechos e pescado da abordagem</button></div>
      <details${a.fiel?.nome ? ' open' : ''}><summary>Fiel depositário</summary><div class="grade">
        ${FIEL.map(([k, rot]) => `<div><label for="fd-${k}">${rot}</label><input id="fd-${k}" data-f="${k}" value="${esc(a.fiel?.[k] || '')}"></div>`).join('')}</div></details>
      <label for="ap-dest">Destinação, quando não houver fiel depositário</label>
      <select id="ap-dest"><option value=""></option>${opcoes(DESTINOS, a.destinacao)}</select>
      <p><button class="sec" id="b-ap-imp" type="button">Imprimir termo de apreensão</button></p><p id="m-ap" class="msg"></p>`;
    desenharLinhas(a.itens, '#ap-itens', CAMPOS_AP);
    $('#ap-tipo').onchange = e => { a.docTipo = e.target.value; };
    $('#ap-num').oninput = e => { a.docNumero = e.target.value; };
    $('#ap-dest').onchange = e => { a.destinacao = e.target.value; };
    $('#ap').querySelectorAll('[data-f]').forEach(el => el.oninput = () => { (a.fiel ||= {})[el.dataset.f] = el.value; });
    $('#b-ap-add').onclick = () => { a.itens.push({ tipo: 'Petrecho', descricao: '', quantidade: 1, unidade: 'un' }); desenharLinhas(a.itens, '#ap-itens', CAMPOS_AP); };
    $('#b-ap-trazer').onclick = () => { a.itens.push(...itensDaAbordagem(ab)); desenharLinhas(a.itens, '#ap-itens', CAMPOS_AP); };
    $('#b-ap-imp').onclick = () => { if (exigePessoa('#m-ap')) imprimir(termoApreensao(ab, pesc(), db.cfg)); };
  };
  $('#ap-on').onchange = e => {
    ab.apreensao = e.target.checked ? (ab.apreensao || { docTipo: 'BO/TC-COP', docNumero: ab.documento || '', itens: itensDaAbordagem(ab), fiel: {}, destinacao: '' }) : null;
    desenharApreensao();
  };

  const desenharNotificacao = () => {
    const n = ab.notificacao;
    if (!n) { $('#nt').innerHTML = ''; return; }
    $('#nt').innerHTML = `
      <label for="nt-mot">Motivo</label><textarea id="nt-mot" rows="6">${esc(n.motivo)}</textarea>
      <p><button class="sec" id="b-nt-sem" type="button">Usar os motivos do semáforo</button></p>
      <label for="nt-comp">Endereço de comparecimento e apresentação dos documentos</label><input id="nt-comp" value="${esc(n.comparecimento)}">
      <p><button class="sec" id="b-nt-imp" type="button">Imprimir notificação</button></p><p id="m-nt" class="msg"></p>`;
    $('#nt-mot').oninput = e => { n.motivo = e.target.value; };
    $('#nt-comp').oninput = e => { n.comparecimento = e.target.value; };
    $('#b-nt-sem').onclick = () => { n.motivo = motivoSugerido({ semaforo: semaforo() }); $('#nt-mot').value = n.motivo; };
    $('#b-nt-imp').onclick = () => { if (exigePessoa('#m-nt')) imprimir(notificacao(ab, pesc(), db.cfg)); };
  };
  $('#nt-on').onchange = e => {
    ab.notificacao = e.target.checked ? (ab.notificacao || { motivo: motivoSugerido({ semaforo: semaforo() }), comparecimento: db.cfg.comparecimento || '' }) : null;
    desenharNotificacao();
  };

  const desenharPessoa = () => {
    const p = pesc();
    if (p) {
      $('#pessoa').innerHTML = `<div class="nome"><b><a href="#/p/${encodeURIComponent(p.id)}">${esc(nomeProprio(p.nome))}</a></b></div>
        <div class="muted peq">${esc(p.rgp || fmtDig(p.digitos))}${ab.identificadoPor === 'cpf' ? ' · CPF conferido: ' + esc(fmtCpf(ab.cpfInformado || p.cpf)) : ''}</div>
        ${ab.identificadoPor === 'cpf' ? '' : `<label for="p-cpf">CPF do documento</label>
          <div class="linha"><input id="p-cpf" inputmode="numeric" placeholder="000.000.000-00" style="flex:1"><button class="sec" id="b-cpf" type="button">Conferir</button></div>
          <p id="m-cpf" class="msg"></p>`}
        <p><button class="sec" id="b-trocar" type="button">Trocar pessoa</button></p>`;
      $('#b-trocar').onclick = () => { ab.pescadorId = null; ab.identificadoPor = 'nome'; ab.cpfInformado = ''; desenharPessoa(); desenharSem(); desenharConsulta(); desenharQual(); };
      $('#b-cpf')?.addEventListener('click', () => {
        const v = $('#p-cpf').value.replace(/\D/g, '');
        if (!cpfValido(v)) { $('#m-cpf').textContent = 'CPF inválido.'; $('#m-cpf').className = 'msg erro'; return; }
        if ((p.digitos && p.digitos !== v.slice(3, 9)) || (p.cpf && p.cpf !== v)) {
          $('#m-cpf').textContent = `Este CPF não confere com o cadastro (${p.cpf ? fmtCpf(p.cpf) : fmtDig(p.digitos)}). Pode ser outra pessoa.`;
          $('#m-cpf').className = 'msg erro'; return;
        }
        escolher(p, true, v);
      });
      return;
    }
    $('#pessoa').innerHTML = `
      <label for="p-q">CPF, nome ou RGP</label><input id="p-q" type="search" autocomplete="off" placeholder="Digite o CPF do documento ou o nome">
      <p id="p-msg" class="muted peq"></p><ul id="p-res" class="lista"></ul>
      <details id="p-novo"><summary>Pessoa fora da base: cadastrar</summary>
        <label for="n-nome">Nome completo</label><input id="n-nome">
        <label for="n-cpf">CPF</label><input id="n-cpf" inputmode="numeric" placeholder="000.000.000-00">
        <p><button id="b-novo" type="button">Cadastrar e selecionar</button></p><p id="m-novo" class="msg"></p></details>`;
    const buscarPessoa = () => {
      const q = $('#p-q').value.trim(), cpf = q.replace(/\D/g, '');
      const porCpf = cpf.length === 11 && !/[a-z]/i.test(q);
      if (porCpf) $('#n-cpf').value = q;
      else if (/[a-z]/i.test(q)) $('#n-nome').value = q;
      if (porCpf && !cpfValido(cpf)) { $('#p-msg').textContent = 'CPF inválido (dígitos verificadores não conferem).'; $('#p-res').innerHTML = ''; return; }
      const res = q.length < 3 ? [] : buscar(Object.values(db.pescadores), q).sort((a, b) => a.nomeNorm.localeCompare(b.nomeNorm)).slice(0, 20);
      $('#p-msg').textContent = q.length < 3 ? '' : res.length ? `${res.length} encontrado(s)${porCpf ? ' com os mesmos dígitos do CPF: escolha pelo nome do documento' : ''}.` : 'Ninguém na base. Cadastre abaixo.';
      $('#p-res').innerHTML = res.map(p => `<li><a href="#" data-id="${esc(p.id)}"><div class="nome">${esc(nomeProprio(p.nome))}</div>
        <div class="info">${esc(p.rgp || fmtDig(p.digitos))}</div></a></li>`).join('');
      $('#p-res').querySelectorAll('a').forEach(a => a.onclick = e => { e.preventDefault(); escolher(db.pescadores[a.dataset.id], porCpf, cpf); });
      if (!res.length && q.length >= 3) $('#p-novo').open = true;
    };
    $('#p-q').oninput = buscarPessoa;
    $('#b-novo').onclick = async () => {
      const nome = $('#n-nome').value.trim(), cpf = $('#n-cpf').value.replace(/\D/g, '');
      const m = $('#m-novo');
      if (nome.split(/\s+/).length < 2) { m.textContent = 'Informe nome e sobrenome.'; m.className = 'msg erro'; return; }
      if (cpf && !cpfValido(cpf)) { m.textContent = 'CPF inválido.'; m.className = 'msg erro'; return; }
      const p = criar(db.pescadores, { nome, cpf });
      sujos.add(p.id);
      await salvar();
      escolher(p, !!cpf, cpf);
    };
    $('#p-q').focus();
  };

  const desenharLinhas = (lista, alvo, campos, aoMudar = () => {}) => {
    $(alvo).innerHTML = lista.map((item, i) => `<div class="grade linha-item">${campos.map(([k, rot, tipo, extra]) => `<div><label>${rot}</label>${
      tipo === 'select' ? `<select data-i="${i}" data-k="${k}">${opcoes(extra, item[k])}</select>`
        : `<input data-i="${i}" data-k="${k}" type="${tipo}" ${extra || ''} value="${esc(item[k] ?? '')}">`}</div>`).join('')}
      <div><label>&nbsp;</label><button class="sec" type="button" data-rm="${i}">Remover</button></div></div>`).join('');
    $(alvo).querySelectorAll('[data-k]').forEach(el => el.oninput = el.onchange = () => {
      lista[+el.dataset.i][el.dataset.k] = el.type === 'number' ? (el.value === '' ? null : +el.value) : el.value;
      aoMudar();
    });
    $(alvo).querySelectorAll('[data-rm]').forEach(b => b.onclick = () => { lista.splice(+b.dataset.rm, 1); desenharLinhas(lista, alvo, campos, aoMudar); aoMudar(); });
  };
  const CAMPOS_PET = [['tipo', 'Tipo', 'select', PETRECHOS], ['malhaMm', 'Malha (mm, nós opostos)', 'number', 'min="0" step="1" inputmode="numeric"'],
    ['comprimentoM', 'Comprimento (m)', 'number', 'min="0" step="1" inputmode="numeric"'], ['qtd', 'Quantidade', 'number', 'min="1" step="1" inputmode="numeric"'],
    ['alturaM', 'Altura (m, emalhe no mar)', 'number', 'min="0" step="0.1" inputmode="decimal"'], ['rgpTralha', 'RGP na tralha (emalhe no mar)', 'select', ['', 'Sim', 'Não']]];
  const CAMPOS_PES = [['especie', 'Espécie', 'text', 'list="especies"'], ['kg', 'Peso (kg)', 'number', 'min="0" step="0.1" inputmode="decimal"'],
    ['menorCm', 'Menor exemplar (cm)', 'number', 'min="0" step="0.5" inputmode="decimal"']];
  $('#b-pet').onclick = () => { ab.petrechos.push({ tipo: PETRECHOS[0], malhaMm: null, comprimentoM: null, qtd: 1, alturaM: null, rgpTralha: '' }); desenharLinhas(ab.petrechos, '#petrechos', CAMPOS_PET, desenharSem); desenharSem(); };
  $('#b-pes').onclick = () => { ab.pescado.push({ especie: '', kg: null, menorCm: null }); desenharLinhas(ab.pescado, '#pescado', CAMPOS_PES, desenharSem); };

  const mostrarGps = () => { $('#gps').innerHTML = ab.gps ? `<a href="https://maps.google.com/?q=${ab.gps.lat},${ab.gps.lon}" target="_blank" rel="noopener">${ab.gps.lat.toFixed(5)}, ${ab.gps.lon.toFixed(5)}</a> (±${Math.round(ab.gps.prec)} m)` : ''; };
  $('#b-gps').onclick = () => {
    if (!navigator.geolocation) { $('#gps').textContent = 'GPS indisponível neste aparelho.'; return; }
    $('#gps').textContent = 'Obtendo posição…';
    navigator.geolocation.getCurrentPosition(
      pos => { ab.gps = { lat: pos.coords.latitude, lon: pos.coords.longitude, prec: pos.coords.accuracy }; mostrarGps(); },
      err => { $('#gps').textContent = 'Não foi possível obter a posição: ' + err.message; },
      { enableHighAccuracy: true, timeout: 20000 });
  };

  $('#a-area').onchange = e => { ab.area = e.target.value; ab.localTipo = ''; $('#a-loc').innerHTML = opcoesLocal(); desenharSem(); };
  $('#a-loc').onchange = e => { ab.localTipo = e.target.value; desenharSem(); };
  $('#a-emb').onchange = e => { ab.embarcacao = e.target.value; desenharSem(); };
  $('#a-cat').onchange = e => { ab.categoria = e.target.value; desenharSem(); desenharConsulta(); };
  $('#a-data').onchange = e => { ab.data = e.target.value || ab.data; desenharSem(); desenharConsulta(); };
  $('#a-local').oninput = e => { ab.local = e.target.value; };
  $('#a-prov').onchange = e => { ab.providencia = e.target.value; };
  $('#a-doc').oninput = e => { ab.documento = e.target.value; };
  $('#a-obs').oninput = e => { ab.obs = e.target.value; };
  $('#b-salvar').onclick = async () => {
    const m = $('#m-ab');
    if (!pesc()) { m.textContent = 'Selecione ou cadastre a pessoa abordada.'; m.className = 'msg erro'; return; }
    const p = pesc();
    if (ab.identificadoPor === 'cpf' && !p.cpf) { p.cpf = ab.cpfInformado; if (!p.digitos) p.digitos = p.cpf.slice(3, 9); p.atualizadoEm = agora(); sujos.add(p.id); }
    ab.semaforo = semaforo();
    ab.criadoEm ||= agora();
    ab.atualizadoEm = agora();
    db.abordagens[ab.id] = structuredClone(ab);
    sujosAb.add(ab.id);
    await salvar();
    if (location.hash !== '#/ab/' + ab.id) location.hash = '#/ab/' + ab.id;
    else { m.textContent = 'Abordagem salva.'; m.className = 'msg'; }
  };

  desenharPessoa(); desenharSem(); desenharConsulta(); desenharQual(); mostrarGps();
  desenharLinhas(ab.petrechos, '#petrechos', CAMPOS_PET, desenharSem); desenharLinhas(ab.pescado, '#pescado', CAMPOS_PES, desenharSem);
  desenharApreensao(); desenharNotificacao();
  if (existente) $('#m-ab').textContent = `Salva em ${fmtDH(existente.atualizadoEm)}.`;
}

// ---------- importação das listas em PDF ----------
const carregarScript = src => new Promise((ok, erro) => {
  const s = Object.assign(document.createElement('script'), { src });
  s.onload = ok;
  s.onerror = () => erro(new Error('Não foi possível carregar ' + src));
  document.head.appendChild(s);
});
// O worker carregado como script faz o pdf.js rodar na própria página (funciona também aberto pelo arquivo).
async function pdfjs() {
  if (!window.pdfjsLib) { await carregarScript('vendor/pdf.worker.min.js'); await carregarScript('vendor/pdf.min.js'); }
  return window.pdfjsLib;
}
async function itensDoPdf(buf) {
  const lib = await pdfjs();
  const doc = await lib.getDocument({ data: new Uint8Array(buf) }).promise;
  const itens = [];
  for (let p = 1; p <= doc.numPages; p++) {
    const tc = await (await doc.getPage(p)).getTextContent();
    for (const it of tc.items) if (it.str?.trim()) itens.push({ p, x: Math.round(it.transform[4]), y: Math.round(it.transform[5]), s: it.str });
  }
  return itens;
}
const hashHex = async buf => [...new Uint8Array(await crypto.subtle.digest('SHA-256', buf))].map(b => b.toString(16).padStart(2, '0')).join('');

async function importarPdf(arquivo, area, temporada) {
  const buf = await arquivo.arrayBuffer();
  const hash = await hashHex(buf);
  const ja = db.importacoes.find(i => i.hash === hash);
  if (ja) throw new Error(`Este arquivo já foi importado em ${fmtDH(ja.data)} (${ja.temporada}).`);
  const lido = ler(await itensDoPdf(buf));
  if (!lido.registros.length) throw new Error('Nenhum pescador encontrado no PDF. Confira se é uma lista de licenciados do MPA.');
  const r = mesclar(db.pescadores, lido.registros, { area, temporada, importacao: hash });
  r.alterados.forEach(id => sujos.add(id));
  const imp = { hash, arquivo: arquivo.name, data: agora(), area, temporada, linhas: lido.linhas, registros: lido.registros.length,
    novos: r.novos, vinculados: r.vinculados, jaTinha: r.jaTinha, avisos: lido.avisos, revisar: r.revisar };
  db.importacoes.push(imp);
  await salvar();
  return imp;
}

const htmlAvisos = imp => `
  ${imp.avisos.length ? `<details><summary>${imp.avisos.length} aviso(s) da lista</summary><ul class="peq">
    ${imp.avisos.map(a => `<li>Nº ${a.n} ${esc(a.nome)}: ${esc(a.texto)}</li>`).join('')}</ul></details>` : ''}
  ${imp.revisar.length ? `<details open><summary>${imp.revisar.length} para revisar: mesmos dígitos de pessoa já na base, nome diferente</summary><ul class="peq">
    ${imp.revisar.map(a => `<li>Nº ${a.n} ${esc(a.nome)} x ${a.outros.map(esc).join(', ')}. Cadastrado como pessoa separada.</li>`).join('')}</ul></details>` : ''}`;

// ---------- backup ----------
// Junta dados de outro aparelho: mesma pessoa pelo id ou por dígitos + nome parecido; licenças e consultas somadas;
// observação e abordagem: vale a mais recente. A abordagem é religada ao pescador reconhecido aqui.
function mesclarBackup(outro) {
  let n = 0;
  const idLocal = {}; // id no aparelho de origem -> id aqui
  for (const b of Object.values(outro.pescadores || {})) {
    const lista = Object.values(db.pescadores);
    const a = db.pescadores[b.id] || lista.find(p => p.digitos && p.digitos === b.digitos && (p.nomeNorm === b.nomeNorm || parecido(p.nome, b.nome)));
    idLocal[b.id] = a ? a.id : b.id;
    if (!a) { db.pescadores[b.id] = b; sujos.add(b.id); n++; continue; }
    const antes = JSON.stringify(a);
    for (const l of b.licencas) if (!a.licencas.some(x => x.area === l.area && x.temporada === l.temporada)) a.licencas.push(l);
    if (b.obs && b.obs !== a.obs && b.atualizadoEm > a.atualizadoEm) { a.obs = b.obs; a.atualizadoEm = b.atualizadoEm; }
    for (const c of b.consultas || []) if (!(a.consultas ||= []).some(x => x.id === c.id)) a.consultas.push(c);
    if (b.cpf && !a.cpf) a.cpf = b.cpf;
    for (const [k] of QUALIFICACAO) if (b[k] && !a[k]) a[k] = b[k];
    if (JSON.stringify(a) !== antes) { sujos.add(a.id); n++; }
  }
  for (const i of outro.importacoes || []) if (!db.importacoes.some(x => x.hash === i.hash)) db.importacoes.push(i);
  for (const [id, b] of Object.entries(outro.abordagens || {})) { // vale a versão editada por último
    const a = db.abordagens[id];
    if (!a || b.atualizadoEm > a.atualizadoEm) { db.abordagens[id] = { ...b, pescadorId: idLocal[b.pescadorId] || b.pescadorId }; sujosAb.add(id); n++; }
  }
  return n;
}

// ---------- dados ----------
function telaDados() {
  const ps = Object.values(db.pescadores);
  const imps = db.importacoes.slice().sort((a, b) => b.data.localeCompare(a.data));
  app.innerHTML = `
    <div class="card"><h1>Dados</h1><p class="muted">${ps.length} pescadores · ${imps.length} lista(s) importada(s)</p></div>

    <div class="card"><h2>1. Lista de licenciados do MPA (PDF)</h2>
      <p class="muted peq">Baixe a lista no site do Ministério da Pesca e importe aqui. Pessoas já na base são reconhecidas pelos dígitos do CPF + nome. Importar o mesmo arquivo de novo não duplica nada.</p>
      <div class="grade">
        <div><label for="i-area">Área</label><select id="i-area">${Object.entries(AREAS).map(([k, v]) => `<option value="${k}">${esc(v)}</option>`).join('')}</select></div>
        <div><label for="i-temp">Temporada</label><input id="i-temp" placeholder="2026/2027" inputmode="numeric" pattern="\\d{4}/\\d{4}"></div>
      </div>
      <label for="f-pdf">Arquivo PDF</label><input type="file" id="f-pdf" accept=".pdf,application/pdf">
      <p id="m-pdf" class="msg"></p><div id="r-pdf"></div></div>

    <div class="card"><h2>2. Listas importadas</h2>
      ${imps.length ? imps.map(i => `<div class="revisar" style="border-color:var(--borda)">
        <b>${esc(AREAS[i.area] || i.area)} · ${esc(i.temporada)}</b>
        <div class="muted peq">${esc(i.arquivo)} · ${fmtDH(i.data)} · ${i.linhas} linhas, ${i.novos} novos, ${i.vinculados} já na base${i.jaTinha ? `, ${i.jaTinha} já tinham esta temporada` : ''}</div>
        ${htmlAvisos(i)}</div>`).join('') : '<p class="muted peq">Nenhuma lista importada.</p>'}</div>

    <div class="card"><h2>3. Backup e sincronização</h2>
      <p class="muted peq">O backup sai criptografado com a sua senha atual. No outro aparelho, importe o arquivo: os dados são mesclados.</p>
      <div class="linha"><button id="b-nuvem" type="button">Enviar para a nuvem</button>
        <button class="sec" id="b-exp" type="button">Baixar backup</button>
        <label class="btn sec" style="margin:0">Importar backup<input type="file" id="f-bak" accept=".json,application/json" hidden></label></div>
      <p id="m-bak" class="msg"></p></div>

    <div class="card"><h2>4. Documentos (termo de apreensão e notificação)</h2>
      <p class="muted peq">Preenchem os documentos impressos. O brasão e o logo ficam só neste aparelho, criptografados; não vão para o GitHub.</p>
      <div class="grade">
        <div><label for="g-nome">Nome do agente</label><input id="g-nome" value="${esc(db.cfg.agente?.nome || '')}" placeholder="Ex.: Sd PM Fulano de Tal"></div>
        <div><label for="g-id">Id Func.</label><input id="g-id" value="${esc(db.cfg.agente?.idFunc || '')}"></div>
        <div><label for="g-fr">Fração</label><input id="g-fr" value="${esc(db.cfg.agente?.fracao || '')}" placeholder="Ex.: 4º Pel / 1º BABM"></div>
      </div>
      <label for="g-comp">Endereço de comparecimento (padrão da notificação)</label><input id="g-comp" value="${esc(db.cfg.comparecimento || '')}">
      <div class="grade">
        <div><label for="g-bras">Brasão (esquerda)</label><input id="g-bras" type="file" accept="image/*"><div id="v-bras"></div></div>
        <div><label for="g-cmd">Logo do Comando (direita)</label><input id="g-cmd" type="file" accept="image/*"><div id="v-cmd"></div></div>
      </div>
      <p><button id="b-docs" type="button">Salvar</button> <span id="m-docs" class="muted peq"></span></p></div>

    <div class="card"><h2>5. Temporada do camarão (Bacia do Tramandaí)</h2>
      <p class="muted peq">A abertura sai por portaria todo ano; o fim é 21/06 (IN 17/2004, art. 20). Atualize quando sair a portaria nova.</p>
      <div class="grade">
        <div><label for="cm-ini">Abertura</label><input id="cm-ini" type="date" value="${esc((db.cfg.camarao || CAMARAO_PADRAO).inicio)}"></div>
        <div><label for="cm-fim">Encerramento</label><input id="cm-fim" type="date" value="${esc((db.cfg.camarao || CAMARAO_PADRAO).fim)}"></div>
      </div>
      <p><button id="b-cm" type="button">Salvar</button> <span id="m-cm" class="muted peq"></span></p></div>

    <div class="card"><h2>Apagar</h2>
      <p class="muted peq">Remove todos os dados deste aparelho. Exporte um backup antes.</p>
      <button class="perigo" id="b-apagar" type="button">Apagar todos os dados</button></div>`;

  // A tela pode ter mudado enquanto o salvamento terminava.
  const msg = (id, t, erro) => { const m = $(id); if (m) { m.textContent = t; m.className = 'msg' + (erro ? ' erro' : ''); } };

  $('#f-pdf').onchange = async e => {
    const arq = e.target.files[0];
    e.target.value = '';
    if (!arq) return;
    $('#r-pdf').innerHTML = '';
    const temp = $('#i-temp').value.trim();
    const m = temp.match(/^(\d{4})\/(\d{4})$/);
    if (!m || +m[2] !== +m[1] + 1) return msg('#m-pdf', 'Informe a temporada no formato 2026/2027 antes de escolher o arquivo.', true);
    msg('#m-pdf', 'Lendo o PDF…');
    try {
      const imp = await importarPdf(arq, $('#i-area').value, temp);
      telaDados();
      msg('#m-pdf', `${imp.temporada}: ${imp.linhas} linhas lidas, ${imp.registros} pescadores, ${imp.novos} novos, ${imp.vinculados} já estavam na base.`);
      $('#r-pdf').innerHTML = htmlAvisos(imp);
    } catch (err) { msg('#m-pdf', err.message, true); }
  };

  const baixarBlob = (blob, nome) => {
    const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: nome });
    a.click();
    URL.revokeObjectURL(a.href);
  };
  const exportarBackup = async enviar => {
    const nome = `backup-pesca-${hojeIso()}.json`;
    const blob = new Blob([JSON.stringify(await cifrar(chave, salt, db))], { type: 'application/json' });
    // No celular, "Enviar para a nuvem" abre o menu de compartilhar (Google Drive, OneDrive, etc.).
    if (enviar && navigator.canShare) {
      const arq = new File([blob], nome, { type: 'application/json' });
      if (navigator.canShare({ files: [arq] })) {
        try { await navigator.share({ files: [arq], title: nome }); return msg('#m-bak', 'Backup enviado. Salve no Google Drive ou OneDrive.'); }
        catch (err) { if (err.name === 'AbortError') return; } // fallback para download
      }
    }
    baixarBlob(blob, nome);
    msg('#m-bak', enviar ? 'Compartilhar indisponível neste aparelho: backup baixado. Salve o arquivo na pasta do Drive/OneDrive.' : 'Backup exportado.');
  };
  $('#b-exp').onclick = () => exportarBackup(false);
  $('#b-nuvem').onclick = () => exportarBackup(true);
  $('#f-bak').onchange = async e => {
    try {
      const cofre = JSON.parse(await e.target.files[0].text());
      if (cofre.app !== 'fiscal-pesca') throw new Error('Arquivo não é um backup deste app.');
      const senha = prompt('Senha usada no aparelho que gerou o backup:');
      if (!senha) return;
      let outro;
      try { outro = await decifrar(await derivar(senha, unb64(cofre.salt)), cofre); } catch { throw new Error('Senha do backup incorreta.'); }
      const n = mesclarBackup(outro);
      await salvar();
      telaDados();
      msg('#m-bak', `Backup mesclado (${n} alteração(ões)).`);
    } catch (err) { msg('#m-bak', err.message, true); }
    e.target.value = '';
  };
  const logos = { ...(db.cfg.logos || {}) };
  const verLogos = () => {
    $('#v-bras').innerHTML = logos.brasao ? `<img src="${esc(logos.brasao)}" alt="" style="height:56px;margin-top:6px">` : '';
    $('#v-cmd').innerHTML = logos.comando ? `<img src="${esc(logos.comando)}" alt="" style="height:56px;margin-top:6px">` : '';
  };
  // Reduz a imagem para no máximo 300 px: o documento usa poucos centímetros e o backup fica leve.
  const lerImagem = arq => new Promise((ok, erro) => {
    const img = new Image();
    img.onload = () => {
      const k = Math.min(1, 300 / Math.max(img.width, img.height));
      const c = Object.assign(document.createElement('canvas'), { width: Math.round(img.width * k), height: Math.round(img.height * k) });
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(img.src);
      ok(c.toDataURL('image/png'));
    };
    img.onerror = () => erro(new Error('Imagem inválida.'));
    img.src = URL.createObjectURL(arq);
  });
  $('#g-bras').onchange = async e => { if (e.target.files[0]) { logos.brasao = await lerImagem(e.target.files[0]); verLogos(); } };
  $('#g-cmd').onchange = async e => { if (e.target.files[0]) { logos.comando = await lerImagem(e.target.files[0]); verLogos(); } };
  verLogos();
  $('#b-docs').onclick = async () => {
    db.cfg.agente = { nome: $('#g-nome').value.trim(), idFunc: $('#g-id').value.trim(), fracao: $('#g-fr').value.trim() };
    db.cfg.comparecimento = $('#g-comp').value.trim();
    db.cfg.logos = logos;
    await salvar();
    $('#m-docs').textContent = 'Salvo.';
  };
  $('#b-cm').onclick = async () => {
    const inicio = $('#cm-ini').value, fim = $('#cm-fim').value;
    if (!inicio || !fim || fim < inicio) { $('#m-cm').textContent = 'Datas inválidas.'; return; }
    db.cfg.camarao = { inicio, fim };
    await salvar();
    $('#m-cm').textContent = 'Salvo.';
  };
  $('#b-apagar').onclick = async () => {
    if (confirm('Apagar todos os dados deste aparelho?')) { await apagarTudo(); location.reload(); }
  };
}

// ---------- roteamento e bloqueio ----------
function marcarNav() {
  const h = location.hash.startsWith('#/dados') ? '#/dados' : location.hash.startsWith('#/ab') ? '#/abordagens' : '#/';
  document.querySelectorAll('#nav a').forEach(a => a.classList.toggle('ativo', a.getAttribute('href') === h));
}
function rotear() {
  if (!db) return telaSenha();
  marcarNav();
  const h = location.hash;
  if (h.startsWith('#/p/')) return telaFicha(decodeURIComponent(h.slice(4)));
  if (h === '#/dados') return telaDados();
  if (h === '#/abordagens') return telaAbordagens();
  if (h.startsWith('#/ab/')) return telaAbordagem(h.slice(5));
  return telaLista();
}
window.addEventListener('hashchange', rotear);
$('#btn-bloquear').onclick = () => location.reload();

// Salvamento automático do que estiver pendente e bloqueio após 5 min em segundo plano.
async function autosalvar() {
  if (chave && db && (sujos.size || sujosAb.size)) { try { await salvar(); } catch { /* tenta no próximo ciclo */ } }
}
setInterval(autosalvar, 30000);
let escondidoEm = 0;
document.addEventListener('visibilitychange', () => {
  if (document.hidden) { escondidoEm = Date.now(); autosalvar(); }
  else if (db && escondidoEm && Date.now() - escondidoEm > 5 * 60e3) location.reload();
});
addEventListener('pagehide', autosalvar);

if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) navigator.serviceWorker.register('sw.js');
rotear();
