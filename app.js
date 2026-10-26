const { ler, mesclar, temporadaAtual, situacao, buscar, parecido, cpfValido, criar, lerConsulta, identificar, AVISO_TXT } = window.Lista;
const { avaliar, ultimaConsulta, corDe, AREAS_COM_LISTA } = window.Semaforo;
const { checar, multaReferencia, defesosDe, DEFESOS, RESUMO, RESUMO_TODOS, AMEACADAS_GUIA, TAMANHO_MINIMO, LOCAIS } = window.Normas;
const { NOTIF_ABERTURA, itensDaAbordagem, termoApreensao, notificacao, motivoSugerido, normalizarAb, pendenciasDe, PESSOAIS, DESTINOS } = window.Docs;

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

const { REGIMES, BACIAS, LOCAIS_PESCA, proximos, trechoPatos, buscarLocal, buscarMunicipio, baciasDe, localDoMunicipio, porId } = window.Locais;
const AREAS = Object.fromEntries(Object.entries(REGIMES).map(([k, v]) => [k, v.nome]));
const AREA_CURTA = { tramandai: 'Tramandaí', patos: 'Lagoa dos Patos', mar: 'Mar', outras: 'Guaíba e Litoral', uruguai: 'Uruguai', mirim: 'Lagoa Mirim', peixe: 'Lagoa do Peixe', mampituba: 'Barra do Mampituba' };
const AREAS_LISTA = Object.keys(REGIMES).filter(k => REGIMES[k].lista);
const localPesca = id => (id ? porId(id) : null);
// Resumo "O que vale aqui" aberto ou fechado: lembra a escolha (preferência deste aparelho).
const lerAberto = () => { try { return localStorage.getItem('fpesca-resumo') !== '0'; } catch { return true; } };
const gravarAberto = v => { try { localStorage.setItem('fpesca-resumo', v ? '1' : '0'); } catch { /* sem armazenamento */ } };
const lerLocalTurno = () => { try { return localStorage.getItem('fpesca-local') || ''; } catch { return ''; } };
const gravarLocalTurno = id => { try { localStorage.setItem('fpesca-local', id); } catch { /* armazenamento indisponível */ } };
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
const BLOCO = 40; // itens desenhados por vez na lista de pescadores
function porDigitos() {
  const m = new Map();
  for (const p of Object.values(db.pescadores)) if (p.digitos) m.set(p.digitos, (m.get(p.digitos) || 0) + 1);
  return m;
}
// Situação da pessoa em cada área com lista nominal (Tramandaí e estuário da Lagoa dos Patos).
const atuais = () => Object.fromEntries(AREAS_LISTA.map(a => [a, temporadaAtual(db.importacoes, a)]));
const situacoes = (p, at) => AREAS_LISTA.map(a => [a, situacao(p, a, at[a])]).filter(([, s]) => s !== 'nunca');
const tagsListas = (p, at) => {
  const ss = situacoes(p, at);
  return ss.length ? ss.map(([a, s]) => `<span class="tag ${SIT[s][1]}">${esc(AREA_CURTA[a])}: ${s === 'atual' ? 'na lista atual' : 'saiu da lista'}</span>`).join('')
    : '<span class="tag aviso">Em nenhuma lista</span>';
};
// Da última consulta ao PesqBrasil: categoria, forma de atuação e ambientes de pesca (Rio, Lagoa...), para ver sem abrir a ficha.
const infoConsulta = p => {
  const c = (p.consultas || []).slice().sort((a, b) => b.data.localeCompare(a.data))[0];
  if (!c) return '';
  const amb = [...new Set((c.locais || []).map(l => l.tipo))];
  return ` · ${[c.situacao, c.categoria, c.formaAtuacao].filter(Boolean).map(esc).join(', ')}${amb.length ? ` · <b>${amb.map(esc).join(', ')}</b>` : ''}`;
};
// Colar o resultado da consulta pública do PesqBrasil: o app acha a pessoa pelos 6 dígitos do CPF e pelo nome,
// e grava a consulta na ficha. Sem ninguém na base, oferece cadastrar.
function colarConsulta(alvo, fixa = null) {
  alvo.innerHTML = `<div class="colar"><label for="cc-txt">No site, selecione tudo a partir do "Resultado da consulta", copie e cole aqui</label>
    <textarea id="cc-txt" rows="4" placeholder="Resultado da consulta pública do CPF ***000000** ..."></textarea><div id="cc-res"></div></div>`;
  const gravar = async (p, lido) => {
    (p.consultas ||= []).push({ ...lido, id: novoId(), data: agora(), obs: '' });
    if (!p.rgp && lido.rgp) p.rgp = lido.rgp;
    p.atualizadoEm = agora();
    sujos.add(p.id);
    await salvar();
    alvo.innerHTML = `<p class="msg">Consulta gravada em <a href="#/p/${encodeURIComponent(p.id)}">${esc(nomeProprio(p.nome))}</a>.</p>`;
  };
  alvo.querySelector('#cc-txt').oninput = e => {
    const lido = lerConsulta(e.target.value), r = alvo.querySelector('#cc-res');
    if (!e.target.value.trim()) { r.innerHTML = ''; return; }
    if (!lido) { r.innerHTML = '<p class="msg erro">Não reconheci o resultado. Copie a página a partir de "Resultado da consulta".</p>'; return; }
    const resumo = `<p class="peq"><b>${esc(lido.nome || 'Sem nome')}</b> · ${esc(fmtDig(lido.digitos))} · ${esc(lido.rgp)}<br>
      ${[lido.situacao, lido.categoria, lido.formaAtuacao, lido.produto].filter(Boolean).map(esc).join(' · ')}
      ${lido.locais.length ? `<br>Locais: ${[...new Set(lido.locais.map(l => `${l.tipo} (${l.municipio})`))].map(esc).join(', ')}` : ''}</p>`;
    if (fixa) {
      const outro = lido.digitos && fixa.digitos && lido.digitos !== fixa.digitos;
      r.innerHTML = resumo + (outro ? `<p class="msg erro">Esta consulta é de outro CPF (${esc(fmtDig(lido.digitos))}).</p>`
        : '<p><button type="button" id="cc-ok">Gravar nesta ficha</button></p>');
      alvo.querySelector('#cc-ok')?.addEventListener('click', () => gravar(fixa, lido));
      return;
    }
    const cs = identificar(Object.values(db.pescadores), lido);
    r.innerHTML = resumo + (cs.length ? `<p class="peq">${cs.length === 1 ? 'Pessoa' : 'Pessoas'} com os mesmos dígitos:</p><ul class="lista">${cs.map(({ p, nomeConfere }) =>
      `<li><a href="#" data-id="${esc(p.id)}"><span class="nome">${esc(nomeProprio(p.nome))}</span>
        <span class="info">${esc(p.rgp || fmtDig(p.digitos))}${nomeConfere ? ' · nome confere' : ' · nome diferente: confira'}</span></a></li>`).join('')}</ul>
        <p class="muted peq">Toque na pessoa para gravar a consulta.</p>`
      : `<p class="peq">Ninguém na base com esses dígitos.</p><label for="cc-nome">Nome completo</label><input id="cc-nome" value="${esc(lido.nome)}">
        <p><button type="button" id="cc-novo">Cadastrar e gravar</button></p>`);
    r.querySelectorAll('a[data-id]').forEach(a => a.onclick = ev => { ev.preventDefault(); gravar(db.pescadores[a.dataset.id], lido); });
    alvo.querySelector('#cc-novo')?.addEventListener('click', () => {
      const nome = alvo.querySelector('#cc-nome').value.trim();
      if (nome.split(/\s+/).length < 2) { alvo.querySelector('#cc-nome').focus(); return; }
      const p = criar(db.pescadores, { nome, cpf: '' });
      p.digitos = lido.digitos; p.rgp = lido.rgp;
      gravar(p, lido);
    });
  };
  alvo.querySelector('#cc-txt').focus();
}

// Faixa com defesos em vigor ou próximos (30 dias) do local do turno. Hoje pela data do aparelho.
function faixaDefesos() {
  const l = localPesca(lerLocalTurno()), area = l?.regime || 'tramandai', hoje = agoraLocal().slice(0, 10);
  const ds = defesosDe(area, hoje);
  const cam = db.cfg.camarao || CAMARAO_PADRAO;
  if (area === 'tramandai' && cam?.inicio?.slice(0, 4) === hoje.slice(0, 4))
    ds.push({ nome: 'Camarão', estado: hoje >= cam.inicio && hoje <= cam.fim ? 'liberado' : 'fechado', periodo: `(temporada ${fmtData(cam.inicio).slice(0, 5)} a ${fmtData(cam.fim).slice(0, 5)})`, texto: '' });
  return `<a class="faixa${ds.some(d => d.estado === 'vigente') ? ' vigente' : ''}" href="#/guia">
    <span class="peq">${esc(l ? l.nome : REGIMES[area].nome)}${l ? '' : ' (escolha o local numa abordagem)'}</span>
    ${ds.length ? ds.map(d => `<span><b>${esc(d.nome)}:</b> ${d.estado === 'vigente' ? 'em vigor' : d.estado === 'proximo' ? 'começa em breve' : esc(d.estado)} ${esc(d.periodo)}</span>`).join('')
      : '<span>Nenhum defeso em vigor ou próximo</span>'}</a>`;
}
function telaLista() {
  const at = atuais();
  const todos = Object.values(db.pescadores);
  if (!todos.length) {
    app.innerHTML = `<div class="card"><h1>Pescadores</h1>
      <p>Nenhum pescador na base. Importe a lista de licenciados do MPA em <a href="#/dados">Dados</a>.</p></div>`;
    return;
  }
  // Busca e filtros fixos no topo; a lista rola dentro da própria caixa.
  app.innerHTML = `<div class="tela-lista"><div class="lista-topo">${faixaDefesos()}
      <p class="muted peq">${AREAS_LISTA.map(a => `${esc(AREA_CURTA[a])}: ${esc(at[a] || 'lista não importada')}`).join(' · ')}
        · <a href="#" id="b-colar">Colar consulta do PesqBrasil</a></p>
      <div id="colar"></div>
      <div class="filtros" style="grid-template-columns:2fr 1fr">
        <input id="q" type="search" placeholder="Nome, CPF, dígitos ou RGP" value="${esc(filtro.q)}" autocomplete="off">
        <select id="sit">
          <option value="">Todos</option>
          <option value="atual">Na lista atual</option>
          <option value="saiu">Saiu da lista atual</option>
          <option value="digitos">Mesmos dígitos de outra pessoa</option>
        </select>
      </div>
      <p id="cont" class="muted peq"></p></div>
      <ul id="lista" class="lista caixa"></ul></div>`;
  $('#sit').value = filtro.sit;
  $('#b-colar').onclick = e => { e.preventDefault(); colarConsulta($('#colar')); };
  const dig = porDigitos();
  const desenhar = () => {
    let ps = buscar(todos, filtro.q);
    if (filtro.sit === 'digitos') ps = ps.filter(p => dig.get(p.digitos) > 1);
    else if (filtro.sit) ps = ps.filter(p => situacoes(p, at).some(([, s]) => s === filtro.sit));
    ps.sort((a, b) => a.nomeNorm.localeCompare(b.nomeNorm));
    $('#cont').textContent = `${ps.length} de ${todos.length} pescadores`;
    // Desenha 40 por vez; os seguintes entram quando o fim da caixa aparece (lista longa no celular).
    const item = p => `<li><a href="#/p/${encodeURIComponent(p.id)}">
        <div class="nome">${esc(nomeProprio(p.nome))}</div>
        <div class="info">${esc(p.rgp || fmtDig(p.digitos))}${infoConsulta(p)}</div>
        ${tagsListas(p, at)}${dig.get(p.digitos) > 1 ? '<span class="tag aviso">Mesmos dígitos de outra pessoa</span>' : ''}
      </a></li>`;
    let n = 0;
    const mais = () => {
      $('#mais')?.remove();
      $('#lista').insertAdjacentHTML('beforeend', ps.slice(n, n + BLOCO).map(item).join('') + (n + BLOCO < ps.length ? '<li id="mais" class="muted peq" style="padding:10px">Carregando…</li>' : ''));
      n += BLOCO;
      if ($('#mais')) obs.observe($('#mais'));
    };
    obs?.disconnect();
    obs = new IntersectionObserver(es => es.some(e => e.isIntersecting) && mais(), { root: $('#lista') });
    $('#lista').innerHTML = ps.length ? '' : '<li class="muted peq" style="padding:10px">Nenhum pescador encontrado.</li>';
    if (ps.length) mais();
    $('#lista').scrollTop = 0;
  };
  let obs, espera;
  desenhar();
  $('#q').oninput = e => { filtro.q = e.target.value; clearTimeout(espera); espera = setTimeout(desenhar, 120); };
  $('#sit').onchange = e => { filtro.sit = e.target.value; desenhar(); };
}

// ---------- ficha ----------
function telaFicha(id) {
  const p = db.pescadores[id];
  if (!p) { app.innerHTML = '<div class="card"><p>Pescador não encontrado.</p><p><a href="#/">Voltar</a></p></div>'; return; }
  const at = atuais();
  const lics = p.licencas.slice().sort((a, b) => b.temporada.localeCompare(a.temporada));
  const outros = Object.values(db.pescadores).filter(o => o !== p && o.digitos && o.digitos === p.digitos);
  app.innerHTML = `<div class="card">
      <p class="peq"><a href="#/">← Pescadores</a></p>
      <h1>${esc(nomeProprio(p.nome))}</h1>
      ${tagsListas(p, at)}
      <div class="grade" style="margin-top:10px">
        <div><span>RGP (lista mais recente)</span>${esc(p.rgp || '-')}</div>
        <div><span>CPF (dígitos publicados)</span>${esc(fmtDig(p.digitos))}</div>
        ${AREAS_LISTA.map(a => `<div><span>Lista atual: ${esc(AREA_CURTA[a])}</span>${esc(at[a] || 'não importada')}</div>`).join('')}
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
    ${['embarcacoes', 'veiculos'].map(t => `<div class="card"><h2>${t === 'veiculos' ? 'Veículos' : 'Embarcações'}</h2><div id="f-${t}"></div>
      <details><summary>Cadastrar ${BENS[t].nome}</summary><div id="f-${t}-form"></div></details></div>`).join('')}
    <div class="card"><h2>Vínculos</h2><p class="muted peq">Pessoas, embarcações, veículos, abordagens e denúncias ligados a esta pessoa.</p>
      <p><a class="btn sec" href="#/vinculos/${encodeURIComponent('p:' + p.id)}">Ver grafo de vínculos</a></p></div>
    <div class="card"><h2>Consultas ao PesqBrasil</h2>${tabelaConsultas(p)}
      <details><summary>Colar consulta</summary><div id="f-colar"></div></details></div>
    <div class="card"><h2>Abordagens</h2>${listaAbordagens(Object.values(db.abordagens).filter(a => normalizarAb(a).envolvidos.some(e => e.pescadorId === p.id)))}</div>
    <div class="card"><h2>Observações</h2>
      <textarea id="obs" placeholder="Anotações de fiscalização">${esc(p.obs)}</textarea>
      <p><button id="b-obs" type="button">Salvar</button> <span id="m-obs" class="muted peq"></span></p></div>`;
  colarConsulta($('#f-colar'), p);
  for (const t of ['embarcacoes', 'veiculos']) {
    const listar = () => { $(`#f-${t}`).innerHTML = (p[t] || []).length ? `<ul class="peq">${p[t].map(x => `<li>${esc(descBem(t, x))}</li>`).join('')}</ul>`
      : `<p class="muted peq">Nenhum${t === 'veiculos' ? '' : 'a'} ${BENS[t].nome} cadastrad${t === 'veiculos' ? 'o' : 'a'}.</p>`; };
    const novoForm = () => formBem(t, $(`#f-${t}-form`), p, () => { listar(); novoForm(); });
    listar(); novoForm();
  }
  $('#b-obs').onclick = async () => {
    p.obs = $('#obs').value.trim();
    p.atualizadoEm = agora();
    sujos.add(p.id);
    await salvar();
    $('#m-obs').textContent = 'Salvo.';
  };
}

// ---------- embarcações e veículos do pescador ----------
const PROPULSAO = ['A remo', 'Motorizada'];
const TIPOS_VEICULO = ['Carro', 'Caminhonete', 'Caminhão', 'Moto', 'Reboque', 'Outro'];
// [campo, rótulo, tipo de entrada, opções]; o primeiro ou o segundo campo é obrigatório.
const BENS = {
  embarcacoes: { nome: 'embarcação', campos: [['nome', 'Nome da embarcação'], ['inscricao', 'Inscrição na Capitania', 'maiusc'], ['rgp', 'RGP da embarcação', 'maiusc'],
    ['comprimentoM', 'Comprimento (m)', 'num'], ['propulsao', 'Propulsão', 'sel', PROPULSAO, 'Motorizada']] },
  veiculos: { nome: 'veículo', campos: [['placa', 'Placa', 'maiusc'], ['modelo', 'Modelo'], ['cor', 'Cor'], ['tipo', 'Tipo', 'sel', TIPOS_VEICULO, 'Carro']] },
};
const descBem = (tipo, x) => tipo === 'veiculos' ? [x.placa, x.modelo, x.cor, x.tipo].filter(Boolean).join(' · ')
  : [x.nome || 'Sem nome', x.inscricao && `inscrição ${x.inscricao}`, x.comprimentoM && `${String(x.comprimentoM).replace('.', ',')} m`, x.propulsao, x.rgp && `RGP ${x.rgp}`].filter(Boolean).join(' · ');
// Formulário de nova embarcação ou veículo em `alvo`; grava no cadastro da pessoa e chama aoSalvar(item).
function formBem(tipo, alvo, p, aoSalvar) {
  const { nome, campos } = BENS[tipo];
  alvo.innerHTML = `<div class="grade">${campos.map(([k, rot, t, ops, pad]) => `<div><label>${rot}</label>${t === 'sel'
      ? `<select data-b="${k}">${opcoes(ops, pad)}</select>` : `<input data-b="${k}"${t === 'num' ? ' type="number" min="0" step="0.1" inputmode="decimal"' : ''}${t === 'maiusc' ? ' autocapitalize="characters"' : ''}>`}</div>`).join('')}</div>
    <p><button data-salvar type="button">Salvar ${nome}</button> <span data-m class="msg peq"></span></p>`;
  alvo.querySelector('[data-salvar]').onclick = async () => {
    const x = { id: novoId(), criadoEm: agora() };
    for (const [k, , t] of campos) { const v = alvo.querySelector(`[data-b="${k}"]`).value.trim(); x[k] = t === 'num' ? (v === '' ? null : +v) : t === 'maiusc' ? v.toUpperCase() : v; }
    if (!x[campos[0][0]] && !x[campos[1][0]]) { alvo.querySelector('[data-m]').textContent = `Informe ${campos[0][1].toLowerCase()} ou ${campos[1][1].toLowerCase()}.`; return; }
    (p[tipo] ||= []).push(x);
    p.atualizadoEm = agora();
    sujos.add(p.id);
    await salvar();
    aoSalvar(x);
  };
}

// ---------- abordagem em campo ----------
const PESQBRASIL = 'https://pesqbrasil-pescadorprofissional.mpa.gov.br/acesso-externo';
const SITUACOES = ['Ativo', 'Suspenso', 'Cancelado', 'Em análise', 'Não encontrado'];
const PETRECHOS = ['Rede de emalhe', 'Tarrafa', 'Tarrafa de camarão', 'Espinhel', 'Aviãozinho', 'Rede de saco', 'Rede de arrasto', 'Linha e anzol', 'Covo/armadilha', 'Outro'];
// Nomes iguais aos da tabela de tamanho mínimo (normas.js) para a checagem funcionar.
// Espécies ameaçadas (R27) aparecem com o nome científico para a pessoa escolher com certeza.
const ESPECIES = ['Tainha', 'Camarão-rosa', 'Bagre (espécie não identificada)', 'Bagre-branco (Genidens barbus)', 'Bagre (Genidens planifrons)',
  'Corvina', 'Peixe-rei', 'Peixe-rei (Odontesthes bicudo)', 'Traíra', 'Jundiá', 'Linguado', 'Pescadinha', 'Pescada-olhuda', 'Papa-terra', 'Anchova',
  'Miraguaia (Pogonias cromis)', 'Garoupa-verdadeira (Epinephelus marginatus)', 'Cação', 'Raia', 'Parati', 'Robalo-peva', 'Robalo-flecha', 'Siri',
  'Lambari', 'Pintado ou surubim (Pseudoplatystoma corruscans)', 'Dourado (Salminus brasiliensis)', 'Suruvi (Steindachneridion scriptum)',
  'Piracanjuba (Brycon orbignyanus)', 'Grumatã', 'Cascudo', 'Carpa', 'Tilápia', 'Pintado-amarelo (Pimelodus maculatus)', 'Piava'];
const EMBARCACOES = ['Nenhuma', 'A remo', 'Motorizada'];
const CATEGORIAS = ['Profissional', 'Amador', 'Sem RGP ou licença'];
const CAMARAO_PADRAO = { inicio: '2026-01-23', fim: '2026-06-21' }; // Portaria Interministerial MPA/MMA 48/2026
const fmtReais = v => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
// Providências adotadas: mais de uma por abordagem. Com número: os documentos.
const PROVIDENCIAS = ['Abordagem', 'Averiguação', 'Orientação', 'BA', 'BO/TC', 'BO/COP', 'Condução à DP', 'Apreensão', 'Notificação',
  'Auto de infração', 'Destruição do pescado', 'Doação do pescado', 'Soltura do pescado'];
const COM_NUMERO = new Set(['BA', 'BO/TC', 'BO/COP', 'Apreensão', 'Notificação', 'Auto de infração']);
// Abordagens antigas tinham uma providência e um número só.
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

const piorCor = cs => ['vermelho', 'amarelo', 'verde'].find(c => cs.includes(c)) || 'verde';
const listaAbordagens = abs => !abs.length ? '<p class="muted peq">Nenhuma abordagem.</p>' : `<ul class="lista">${abs.map(normalizarAb)
  .sort((a, b) => b.data.localeCompare(a.data)).map(a => { const es = a.envolvidos, cor = piorCor(es.map(e => e.semaforo?.cor));
    const provs = [...new Set(es.flatMap(e => (e.providencias || []).map(p => p.tipo)))];
    return `<li><a href="#/ab/${a.id}">
    <div class="nome">${esc(es.map(e => db.pescadores[e.pescadorId] ? nomeProprio(db.pescadores[e.pescadorId].nome) : 'Pessoa removida').join(', '))}</div>
    <div class="info">${fmtData(a.data)} ${esc(a.data.slice(11, 16))} · ${esc(localPesca(a.localPescaId)?.nome || AREA_CURTA[a.area])}${a.local && a.local !== localPesca(a.localPescaId)?.nome ? ' · ' + esc(a.local) : ''}${provs.length ? ' · ' + esc(provs.join(', ')) : ''}</div>
    <span class="tag sem-${cor}">${COR_TXT[cor]}</span>${es.length > 1 ? `<span class="tag">${es.length} envolvidos</span>` : ''}</a></li>`; }).join('')}</ul>`;

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

const abasAbordagens = (aba, nPend = null) => { if (nPend == null) nPend = todasPendencias().reduce((t, x) => t + x.ps.length, 0) + (db.cfg.tarefas || []).filter(t => !t.feito).length;
  return `<div class="abas-seg">${[['lista', '#/abordagens', 'Abordagens'], ['den', '#/denuncias', 'Denúncias'], ['pend', '#/pendencias', 'Pendências'], ['vinc', '#/vinculos', 'Vínculos']]
    .map(([k, h, t]) => `<a href="${h}" class="${aba === k ? 'ativo' : ''}">${t}${k === 'pend' && nPend ? ` <span class="cont">${nPend}</span>` : ''}</a>`).join('')}</div>`; };

// ---------- denúncias ----------
const TIPOS_DEN = ['Transporte de pescado', 'Pesca irregular', 'Comércio de pescado', 'Embarcação', 'Veículo', 'Pessoa', 'Outro'];
const ORIGENS_DEN = ['190', 'Disque-denúncia', 'WhatsApp', 'Pessoalmente', 'Outro órgão', 'Outra'];
const SITUACOES_DEN = ['Nova', 'Em apuração', 'Atendida', 'Improcedente'];
const lista = s => String(s || '').split(/[,;\n]/).map(x => x.trim()).filter(Boolean);
function telaDenuncias() {
  const ds = (db.cfg.denuncias ||= []).slice().sort((a, b) => (b.data || '').localeCompare(a.data || ''));
  app.innerHTML = `<div class="card">${abasAbordagens('den')}<p><a class="btn" href="#/denuncia/novo">Nova denúncia</a></p>
    <ul class="lista">${ds.map(d => `<li><a href="#/denuncia/${d.id}"><div class="nome">${esc(d.tipo)} · ${esc(d.situacao)}</div>
      <div class="info">${fmtData(d.data)} · ${esc([d.municipio, d.local].filter(Boolean).join(', '))}${d.placas?.length ? ' · ' + esc(d.placas.join(', ')) : ''}</div>
      <div class="info">${esc((d.descricao || '').slice(0, 90))}</div></a></li>`).join('') || '<li class="muted peq" style="padding:10px">Nenhuma denúncia.</li>'}</ul></div>`;
}
function telaDenuncia(id) {
  const ex = (db.cfg.denuncias ||= []).find(d => d.id === id);
  const d = ex ? structuredClone(ex) : { id: novoId(), data: agoraLocal().slice(0, 10), tipo: TIPOS_DEN[0], origem: ORIGENS_DEN[0], situacao: 'Nova',
    municipio: '', local: '', descricao: '', pescadorIds: [], pessoas: [], placas: [], embarcacoes: [], obs: '' };
  app.innerHTML = `<div class="card"><p class="peq"><a href="#/denuncias">← Denúncias</a></p><h1>${ex ? 'Denúncia' : 'Nova denúncia'}</h1>
    <div class="grade">
      <div><label for="d-data">Data</label><input id="d-data" type="date" value="${esc(d.data)}"></div>
      <div><label for="d-sit">Situação</label><select id="d-sit">${opcoes(SITUACOES_DEN, d.situacao)}</select></div>
      <div><label for="d-tipo">Tipo</label><select id="d-tipo">${opcoes(TIPOS_DEN, d.tipo)}</select></div>
      <div><label for="d-orig">Origem</label><select id="d-orig">${opcoes(ORIGENS_DEN, d.origem)}</select></div>
      <div><label for="d-mun">Município</label><input id="d-mun" list="d-muns" value="${esc(d.municipio)}"></div>
      <div><label for="d-local">Local</label><input id="d-local" value="${esc(d.local)}" placeholder="Rua, estrada, lagoa, praia"></div></div>
    <datalist id="d-muns">${Object.keys(window.Locais.MUNICIPIOS).map(m => `<option value="${esc(m)}">`).join('')}</datalist>
    <label for="d-desc">Relato</label><textarea id="d-desc" rows="4">${esc(d.descricao)}</textarea>
    <h2 class="sec-tit">Quem e o quê</h2>
    <label for="d-q">Pescadores da base citados</label><div id="d-pes" class="chips"></div>
    <input id="d-q" type="search" placeholder="Buscar por nome, CPF ou RGP" autocomplete="off"><ul id="d-res" class="lista lista-compacta"></ul>
    <label for="d-pessoas">Outras pessoas (uma por linha)</label><textarea id="d-pessoas" rows="2">${esc(d.pessoas.join('\n'))}</textarea>
    <label for="d-placas">Placas de veículos (separe por vírgula)</label><input id="d-placas" autocapitalize="characters" value="${esc(d.placas.join(', '))}">
    <label for="d-embs">Embarcações: nome ou inscrição (separe por vírgula)</label><input id="d-embs" value="${esc(d.embarcacoes.join(', '))}">
    <label for="d-obs">Providências e observações</label><textarea id="d-obs" rows="2">${esc(d.obs)}</textarea>
    <p><button id="b-den" type="button">Salvar denúncia</button> <span id="m-den" class="msg peq"></span></p></div>`;
  const chips = () => { $('#d-pes').innerHTML = d.pescadorIds.map(id => `<button type="button" class="chip ativo" data-rm="${esc(id)}">${esc(nomeProprio(db.pescadores[id]?.nome || id))} ✕</button>`).join('');
    $('#d-pes').querySelectorAll('[data-rm]').forEach(b => b.onclick = () => { d.pescadorIds = d.pescadorIds.filter(x => x !== b.dataset.rm); chips(); }); };
  chips();
  $('#d-q').oninput = e => {
    const q = e.target.value.trim(), res = q.length < 3 ? [] : buscar(Object.values(db.pescadores), q).slice(0, 15);
    $('#d-res').innerHTML = res.map(p => `<li><a href="#" data-id="${esc(p.id)}"><span class="nome">${esc(nomeProprio(p.nome))}</span><span class="info">${esc(p.rgp || fmtDig(p.digitos))}</span></a></li>`).join('');
    $('#d-res').querySelectorAll('a').forEach(a => a.onclick = ev => { ev.preventDefault(); if (!d.pescadorIds.includes(a.dataset.id)) d.pescadorIds.push(a.dataset.id); chips(); $('#d-q').value = ''; $('#d-res').innerHTML = ''; });
  };
  $('#b-den').onclick = async () => {
    Object.assign(d, { data: $('#d-data').value, situacao: $('#d-sit').value, tipo: $('#d-tipo').value, origem: $('#d-orig').value, municipio: $('#d-mun').value.trim(),
      local: $('#d-local').value.trim(), descricao: $('#d-desc').value.trim(), pessoas: lista($('#d-pessoas').value), placas: lista($('#d-placas').value).map(x => x.toUpperCase()),
      embarcacoes: lista($('#d-embs').value), obs: $('#d-obs').value.trim(), atualizadoEm: agora() });
    d.criadoEm ||= agora();
    const i = db.cfg.denuncias.findIndex(x => x.id === d.id);
    if (i >= 0) db.cfg.denuncias[i] = d; else db.cfg.denuncias.push(d);
    await salvar();
    if (!ex) location.hash = '#/denuncia/' + d.id; else $('#m-den').textContent = 'Salva.';
  };
}

// ---------- vínculos (grafo) ----------
let cyInst = null;
async function telaVinculos(centro) {
  const g = window.Vinculos.montarVinculos({ pescadores: db.pescadores, abordagens: Object.fromEntries(Object.entries(db.abordagens).map(([k, a]) => [k, normalizarAb(a)])), denuncias: db.cfg.denuncias || [] });
  app.innerHTML = `<div class="card">${abasAbordagens('vinc')}
    <p class="muted peq">Liga pescadores, embarcações (mesma inscrição), veículos (mesma placa), abordagens conjuntas e denúncias. Toque num ponto para abrir.</p>
    <input id="v-q" type="search" placeholder="Pescador, placa ou embarcação" autocomplete="off"><ul id="v-res" class="lista lista-compacta"></ul>
    ${centro ? `<label class="chk"><input type="checkbox" id="v-mais"> Mais um nível</label><div id="grafo" class="grafo-box"></div>
      <p class="peq"><span class="leg leg-p"></span> pescador <span class="leg leg-e"></span> embarcação <span class="leg leg-v"></span> veículo <span class="leg leg-a"></span> abordagem <span class="leg leg-d"></span> denúncia <span class="leg leg-x"></span> pessoa citada</p>` : ''}</div>`;
  $('#v-q').oninput = e => {
    const q = e.target.value.trim().normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase();
    const res = q.length < 2 ? [] : g.nodes.filter(n => ['pescador', 'embarcacao', 'veiculo', 'pessoa'].includes(n.tipo) && n.label.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().includes(q)).slice(0, 15);
    $('#v-res').innerHTML = res.map(n => `<li><a href="#/vinculos/${encodeURIComponent(n.id)}"><span class="nome">${esc(n.tipo === 'pescador' ? nomeProprio(n.label) : n.label)}</span><span class="info">${esc(n.tipo)}</span></a></li>`).join('')
      || (q.length >= 2 ? '<li class="muted peq" style="padding:8px">Nada com vínculo encontrado.</li>' : '');
  };
  if (!centro) return;
  if (!g.nodes.some(n => n.id === centro)) { $('#grafo').innerHTML = '<p class="muted peq" style="padding:10px">Sem vínculos registrados para este item.</p>'; return; }
  if (!window.cytoscape) await carregarScript('vendor/cytoscape.min.js');
  const COR = { pescador: '#0b4f7a', embarcacao: '#157f3b', veiculo: '#9a6700', abordagem: '#5d6b64', denuncia: '#b42318', pessoa: '#8a3ffc' };
  const desenhar = () => {
    const v = window.Vinculos.vizinhanca(g, centro, $('#v-mais').checked ? 2 : 1);
    const escuro = matchMedia('(prefers-color-scheme: dark)').matches;
    if (cyInst) cyInst.destroy();
    cyInst = cytoscape({ container: $('#grafo'),
      elements: [...v.nodes.map(n => ({ data: { ...n, label: n.tipo === 'pescador' ? nomeProprio(n.label) : n.label, central: n.id === centro } })), ...v.edges.map(e => ({ data: e }))],
      style: [{ selector: 'node', style: { 'background-color': n => COR[n.data('tipo')], label: 'data(label)', 'font-size': 8, 'text-wrap': 'wrap', 'text-max-width': 90,
        color: escuro ? '#e6ece9' : '#16211c', 'text-valign': 'bottom', 'text-margin-y': 2, width: n => n.data('central') ? 26 : 16, height: n => n.data('central') ? 26 : 16 } },
        { selector: 'edge', style: { width: 1.5, 'line-color': escuro ? '#3a4a43' : '#b9c4bd', 'curve-style': 'bezier' } }],
      layout: { name: 'concentric', concentric: n => n.data('central') ? 10 : 1, levelWidth: () => 1, minNodeSpacing: 36, padding: 12 } });
    cyInst.on('tap', 'node', ev => { const d = ev.target.data();
      location.hash = d.tipo === 'pescador' && d.id !== centro ? '#/vinculos/' + encodeURIComponent(d.id) : d.tipo === 'pescador' ? '#/p/' + encodeURIComponent(d.pescadorId)
        : d.tipo === 'abordagem' ? '#/ab/' + d.abordagemId : d.tipo === 'denuncia' ? '#/denuncia/' + d.denunciaId : '#/vinculos/' + encodeURIComponent(d.id); });
  };
  $('#v-mais').onchange = desenhar;
  desenhar();
}

// Pendências: o que falta em cada abordagem para o processo administrativo, mais tarefas livres da equipe.
const todasPendencias = () => Object.values(db.abordagens).map(normalizarAb)
  .map(a => ({ a, ps: pendenciasDe(a, id => db.pescadores[id]) })).filter(x => x.ps.length).sort((x, y) => y.a.data.localeCompare(x.a.data));
function telaAbordagens(aba = 'lista') {
  const pend = todasPendencias(), tarefas = (db.cfg.tarefas ||= []);
  const nPend = pend.reduce((t, x) => t + x.ps.length, 0) + tarefas.filter(t => !t.feito).length;
  app.innerHTML = `<div class="card">${abasAbordagens(aba, nPend)}
    ${aba === 'lista' ? `<p><a class="btn" href="#/ab/novo">Nova abordagem</a></p>${listaAbordagens(Object.values(db.abordagens))}` : `
      <h2>Tarefas</h2>
      <div class="linha"><input id="t-txt" placeholder="Ex.: levar termo ao IBAMA" style="flex:2"><input id="t-prazo" type="date" style="flex:1"><button id="b-tarefa" type="button">Adicionar</button></div>
      <ul class="lista">${tarefas.slice().sort((a, b) => a.feito - b.feito || (a.prazo || '9').localeCompare(b.prazo || '9')).map(t => `<li class="tarefa${t.feito ? ' feita' : ''}">
        <label class="chk"><input type="checkbox" data-t="${t.id}"${t.feito ? ' checked' : ''}> <span>${esc(t.texto)}${t.prazo ? ` <span class="${!t.feito && t.prazo < agoraLocal().slice(0, 10) ? 'erro-txt' : 'muted'} peq">até ${fmtData(t.prazo)}</span>` : ''}</span></label>
        <button class="sec" type="button" data-rmt="${t.id}">Apagar</button></li>`).join('') || '<li class="muted peq" style="padding:8px">Nenhuma tarefa.</li>'}</ul>
      <h2 class="sec-tit">Das abordagens</h2>
      ${pend.map(({ a, ps }) => `<div class="pend"><a href="#/ab/${a.id}"><b>${fmtData(a.data)}</b> · ${esc(localPesca(a.localPescaId)?.nome || AREA_CURTA[a.area])}</a>
        <ul class="peq">${ps.map(p => `<li>${esc(p.texto)}${p.resolvivel ? ` <button class="sec mini" type="button" data-ab="${a.id}" data-res="${esc(p.chave)}">Resolvida</button>` : ''}</li>`).join('')}</ul></div>`).join('')
        || '<p class="muted peq">Nenhuma pendência nas abordagens.</p>'}`}</div>`;
  if (aba !== 'pend') return;
  const gravarTarefas = async () => { await salvar(); telaAbordagens('pend'); };
  $('#b-tarefa').onclick = () => { const texto = $('#t-txt').value.trim(); if (!texto) return $('#t-txt').focus();
    tarefas.push({ id: novoId(), texto, prazo: $('#t-prazo').value, feito: false, criadoEm: agora() }); gravarTarefas(); };
  app.querySelectorAll('[data-t]').forEach(c => c.onchange = () => { tarefas.find(t => t.id === c.dataset.t).feito = c.checked; gravarTarefas(); });
  app.querySelectorAll('[data-rmt]').forEach(b => b.onclick = () => { tarefas.splice(tarefas.findIndex(t => t.id === b.dataset.rmt), 1); gravarTarefas(); });
  app.querySelectorAll('[data-res]').forEach(b => b.onclick = async () => {
    const a = normalizarAb(db.abordagens[b.dataset.ab]);
    a.resolvidas = [...(a.resolvidas || []), b.dataset.res];
    db.abordagens[a.id] = a; sujosAb.add(a.id);
    await salvar(); telaAbordagens('pend');
  });
}

function telaAbordagem(param) {
  const [idUrl, query] = param.split('?');
  const existente = db.abordagens[idUrl];
  if (idUrl !== 'novo' && !existente) { app.innerHTML = '<div class="card"><p>Abordagem não encontrada.</p><p><a href="#/abordagens">Voltar</a></p></div>'; return; }
  const pInicial = new URLSearchParams(query || '').get('p');
  // Local vindo de "Normas por local" ou o da última abordagem: o turno costuma seguir no mesmo lugar.
  const turno = localPesca(new URLSearchParams(query || '').get('l')) || localPesca(lerLocalTurno());
  // Vários envolvidos: local, data e GPS ficam na abordagem (A); pessoa, ponto, petrechos, pescado e providências, em cada envolvido.
  const novoEnv = (pescadorId, localTipo) => ({ id: novoId(), pescadorId, identificadoPor: 'nome', cpfInformado: '', categoria: 'Profissional',
    embarcacao: 'Nenhuma', comprimentoEmbM: null, embarcacaoId: '', localTipo, petrechos: [], pescado: [], apreensao: null, notificacao: null, providencias: [] });
  const A = existente ? normalizarAb(structuredClone(existente)) : { id: novoId(), data: agoraLocal(), area: turno?.regime || 'tramandai', local: '', gps: null,
    obs: '', localPescaId: turno?.id || '', envolvidos: [novoEnv(db.pescadores[pInicial] ? pInicial : null, turno?.sub || '')] };
  let atual = 0;
  // `ab` é a visão do envolvido aberto: campos pessoais vão para ele, os demais para a abordagem. O resto da tela usa só `ab`.
  const PESS = new Set(PESSOAIS);
  const ab = new Proxy({}, { get: (_, k) => (PESS.has(k) ? A.envolvidos[atual] : A)[k],
    set: (_, k, v) => { (PESS.has(k) ? A.envolvidos[atual] : A)[k] = v; return true; } });
  const pesc = () => db.pescadores[ab.pescadorId] || null;
  const atualDe = area => AREAS_COM_LISTA.has(area) ? temporadaAtual(db.importacoes, area) : null;
  // Lista e PesqBrasil (semaforo.js) + regras de pesca R02 a R17 (normas.js).
  const semaforo = () => {
    const s = avaliar({ pescador: pesc(), area: ab.area, atual: atualDe(ab.area), data: ab.data, identificadoPor: ab.identificadoPor,
      outrosMesmosDigitos: pesc()?.digitos ? Object.values(db.pescadores).filter(o => o.digitos === pesc().digitos && o.id !== ab.pescadorId).length : 0,
      categoria: ab.categoria || 'Profissional', soLinha: ab.petrechos.every(p => p.tipo === 'Linha e anzol'),
      embarcado: !!ab.embarcacao && ab.embarcacao !== 'Nenhuma' });
    const motivos = [...s.motivos, ...checar(ab, { camarao: db.cfg.camarao || CAMARAO_PADRAO })];
    return { cor: corDe(motivos), motivos };
  };
  const opcoesLocal = () => `<option value="">(não informado)</option>${opcoes(LOCAIS[ab.area] || [], ab.localTipo)}`;

  // Mobile first: o que muda o semáforo vem primeiro; semáforo resumido e Salvar ficam na barra do rodapé.
  app.innerHTML = `<div class="card">
      <p class="peq"><a href="#/abordagens">← Abordagens</a></p>
      <h1>${existente ? 'Abordagem' : 'Nova abordagem'}</h1>
      <div id="onde"></div>
      <div class="grade">
        <div style="grid-column:1/-1"><label for="a-loc">Ponto no local</label><select id="a-loc">${opcoesLocal()}</select></div>
        <div style="grid-column:1/-1"><label for="a-local">Descrição do local</label>
          <input id="a-local" placeholder="Ex.: Laguna do Armazém, margem leste" value="${esc(ab.local)}">
          <div class="linha" style="margin-top:6px"><button class="sec" id="b-gps" type="button">Registrar GPS</button><span id="gps" class="muted peq"></span></div></div>
        <div><label for="a-data">Data e hora</label><input id="a-data" type="datetime-local" value="${esc(ab.data)}"></div>
      </div></div>
    <div class="card"><h2>Pessoas abordadas</h2><div id="envs" class="chips envs"></div><div id="pessoa"></div><div id="embs"></div>
      <div class="grade">
        <div><label for="a-cat">Categoria</label><select id="a-cat">${opcoes(CATEGORIAS, ab.categoria || 'Profissional')}</select></div>
        <div><label for="a-emb">Embarcação</label><select id="a-emb">${opcoes(EMBARCACOES, ab.embarcacao || 'Nenhuma')}</select></div>
        <div id="d-comp"${ab.embarcacao && ab.embarcacao !== 'Nenhuma' ? '' : ' hidden'}><label for="a-comp">Comprimento (m)</label><input id="a-comp" type="number" min="0" step="0.5" inputmode="decimal" value="${esc(ab.comprimentoEmbM ?? '')}"></div>
      </div></div>
    <div id="sem"></div>
    <div class="card" id="c-consulta" hidden><h2>Consulta ao PesqBrasil</h2><div id="consulta"></div></div>
    <div class="card" id="c-qual" hidden><h2>Qualificação</h2><p class="muted peq">Usada na notificação e no termo. Fica salva no cadastro da pessoa.</p><div id="qual" class="grade"></div></div>
    <div class="card"><h2>Petrechos<span class="quem"></span></h2><div id="petrechos"></div>
      <button class="sec" id="b-pet" type="button">Adicionar petrecho</button></div>
    <div class="card"><h2>Pescado<span class="quem"></span></h2><div id="pescado"></div>
      <button class="sec" id="b-pes" type="button">Adicionar pescado</button>
      <datalist id="especies">${ESPECIES.map(e => `<option value="${esc(e)}">`).join('')}</datalist></div>
    <div class="card"><h2>Apreensão<span class="quem"></span></h2>
      <label class="chk"><input type="checkbox" id="ap-on"${ab.apreensao ? ' checked' : ''}> Houve apreensão</label>
      <div id="ap"></div></div>
    <div class="card"><h2>Notificação<span class="quem"></span></h2>
      <label class="chk"><input type="checkbox" id="nt-on"${ab.notificacao ? ' checked' : ''}> Notificar a pessoa</label>
      <div id="nt"></div></div>
    <div class="card"><h2>Providências<span class="quem"></span></h2>
      <p class="muted peq">Marque todas as adotadas.</p><div id="provs" class="provs"></div>
      <label for="a-obs">Observações</label><textarea id="a-obs">${esc(ab.obs)}</textarea></div>
    <div class="barra-ab"><a href="#" id="ba-cor" class="ba-cor"></a><span id="m-ab" class="msg peq"></span><button id="b-salvar" type="button">Salvar</button></div>`;
  document.body.classList.add('com-barra');

  const desenharSem = () => {
    const s = semaforo();
    $('#sem').innerHTML = `<div class="card sem sem-${s.cor}"><div class="sem-cor">${COR_TXT[s.cor]}</div>
      <ul>${s.motivos.map(m => `<li class="m-${m.nivel}">${esc(m.texto)}${m.norma ? `<div class="sem-norma">${esc(m.norma)}${m.enquadramento ? ' · ' + esc(m.enquadramento) : ''}</div>` : ''}</li>`).join('')}</ul>
      ${(() => { const kg = ab.pescado.reduce((t, x) => t + (+x.kg || 0), 0), mr = multaReferencia(s.motivos, kg);
        return mr ? `<div class="sem-multa">Multa mínima de referência: ${fmtReais(mr.minimo)} (Dec. 6.514/2008, art. ${mr.artigo}: ${mr.artigo === 35 ? 'R$ 700' : 'R$ 300'} + R$ 20 por kg, ${String(kg).replace('.', ',')} kg)</div>` : ''; })()}</div>`;    const irr = s.motivos.filter(m => m.nivel !== 'ok').length, ba = $('#ba-cor');
    ba.className = 'ba-cor sem-' + s.cor;
    ba.textContent = COR_TXT[s.cor] + (irr ? ` · ${irr} ${irr === 1 ? 'motivo' : 'motivos'}` : '');
    desenharEnvs();
  };
  const semaforoDe = i => { const antes = atual; atual = i; try { return semaforo(); } finally { atual = antes; } };
  // Só redesenha os botões quando algo muda: assim o toque não se perde quando um campo perde o foco e o semáforo recalcula.
  const desenharEnvs = () => {
    const html = A.envolvidos.map((e, i) => { const p = db.pescadores[e.pescadorId];
      return `<button type="button" class="chip sem-${semaforoDe(i).cor}${i === atual ? ' ativo' : ''}" data-env="${i}">${esc(p ? nomeProprio(p.nome).split(' ')[0] : `Pessoa ${i + 1}`)}</button>`; }).join('')
      + '<button type="button" class="chip" data-env="+">+ Pessoa</button>'
      + (A.envolvidos.length > 1 ? '<button type="button" class="chip" data-env="-">Remover esta</button>' : '');
    if ($('#envs').innerHTML !== html) $('#envs').innerHTML = html;
    // Com mais de uma pessoa, cada seção mostra de quem é.
    const p = pesc(), quem = A.envolvidos.length > 1 ? ` · ${p ? nomeProprio(p.nome).split(' ')[0] : `Pessoa ${atual + 1}`}` : '';
    document.querySelectorAll('.quem').forEach(q => { q.textContent = quem; });
  };
  $('#envs').onclick = e => {
    const v = e.target.closest('[data-env]')?.dataset.env;
    if (v === '+') { A.envolvidos.push(novoEnv(null, ab.localTipo)); trocarEnv(A.envolvidos.length - 1); }
    else if (v === '-') { A.envolvidos.splice(atual, 1); trocarEnv(Math.max(0, atual - 1)); }
    else if (v != null) trocarEnv(+v);
  };
  // Troca o envolvido aberto e redesenha as partes pessoais da tela.
  const trocarEnv = i => {
    atual = i;
    $('#a-loc').innerHTML = opcoesLocal();
    $('#a-cat').value = ab.categoria || 'Profissional'; $('#a-emb').value = ab.embarcacao || 'Nenhuma';
    $('#a-comp').value = ab.comprimentoEmbM ?? ''; $('#d-comp').hidden = !ab.embarcacao || ab.embarcacao === 'Nenhuma';
    $('#ap-on').checked = !!ab.apreensao; $('#nt-on').checked = !!ab.notificacao;
    desenharPessoa(); desenharSem(); desenharConsulta(); desenharQual();
    desenharLinhas(ab.petrechos, '#petrechos', CAMPOS_PET, desenharSem); desenharLinhas(ab.pescado, '#pescado', CAMPOS_PES, desenharSem);
    desenharApreensao(); desenharNotificacao(); desenharProvs();
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
    ab.apreensao = e.target.checked ? (ab.apreensao || { docTipo: 'BO/TC-COP', docNumero: ab.providencias.find(p => p.tipo.startsWith('BO'))?.numero || '', itens: itensDaAbordagem(ab), fiel: {}, destinacao: '' }) : null;
    marcarProv('Apreensão', e.target.checked);
    desenharApreensao();
  };

  const desenharNotificacao = () => {
    const n = ab.notificacao;
    if (!n) { $('#nt').innerHTML = ''; return; }
    $('#nt').innerHTML = `
      <label for="nt-mot">Motivo</label><p class="muted peq">O documento começa com: ${esc(NOTIF_ABERTURA)}</p><textarea id="nt-mot" rows="6">${esc(n.motivo)}</textarea>
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
    marcarProv('Notificação', e.target.checked);
    desenharNotificacao();
  };

  // Embarcação usada: escolhida entre as do cadastro da pessoa ou cadastrada na hora; preenche propulsão e comprimento.
  const aplicarEmb = e => {
    ab.embarcacaoId = e?.id || '';
    if (e) { ab.embarcacao = e.propulsao; ab.comprimentoEmbM = e.comprimentoM; $('#a-emb').value = e.propulsao; $('#a-comp').value = e.comprimentoM ?? ''; $('#d-comp').hidden = false; }
    desenharSem();
  };
  // Embarcação e veículo usados: escolhidos do cadastro da pessoa ou cadastrados na hora.
  const SEL_BEM = { embarcacoes: ['embarcacaoId', 'Embarcação usada', aplicarEmb], veiculos: ['veiculoId', 'Veículo usado', x => { ab.veiculoId = x?.id || ''; }] };
  const desenharEmb = () => {
    const p = pesc();
    $('#embs').innerHTML = Object.entries(SEL_BEM).map(([t, [campo, rot]]) => { const xs = p[t] || [];
      return `<label>${rot}</label><select data-sel="${t}"><option value="">${xs.length ? 'Nenhum ou não informado' : 'Nenhum cadastrado'}</option>
        ${xs.map(x => `<option value="${esc(x.id)}"${x.id === ab[campo] ? ' selected' : ''}>${esc(descBem(t, x))}</option>`).join('')}
        <option value="+">Cadastrar ${BENS[t].nome}…</option></select><div data-form="${t}"></div>`; }).join('');
    $('#embs').querySelectorAll('[data-sel]').forEach(sel => sel.onchange = () => {
      const t = sel.dataset.sel, [, , aplicar] = SEL_BEM[t], form = $(`#embs [data-form="${t}"]`);
      if (sel.value !== '+') { form.innerHTML = ''; aplicar((p[t] || []).find(x => x.id === sel.value)); return; }
      formBem(t, form, p, novo => { aplicar(novo); desenharEmb(); });
    });
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
      $('#b-trocar').onclick = () => { ab.pescadorId = null; ab.identificadoPor = 'nome'; ab.cpfInformado = ''; ab.embarcacaoId = ''; ab.veiculoId = ''; desenharPessoa(); desenharSem(); desenharConsulta(); desenharQual(); };
      $('#b-cpf')?.addEventListener('click', () => {
        const v = $('#p-cpf').value.replace(/\D/g, '');
        if (!cpfValido(v)) { $('#m-cpf').textContent = 'CPF inválido.'; $('#m-cpf').className = 'msg erro'; return; }
        if ((p.digitos && p.digitos !== v.slice(3, 9)) || (p.cpf && p.cpf !== v)) {
          $('#m-cpf').textContent = `Este CPF não confere com o cadastro (${p.cpf ? fmtCpf(p.cpf) : fmtDig(p.digitos)}). Pode ser outra pessoa.`;
          $('#m-cpf').className = 'msg erro'; return;
        }
        escolher(p, true, v);
      });
      desenharEmb();
      return;
    }
    $('#embs').innerHTML = '';
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

  // Cada item: cabeçalho com número e Remover; campos em duas colunas. O 5º elemento do campo, se houver, diz se ele aparece.
  const TITULO_LINHA = { '#petrechos': 'Petrecho', '#pescado': 'Pescado', '#ap-itens': 'Item' };
  const desenharLinhas = (lista, alvo, campos, aoMudar = () => {}) => {
    $(alvo).innerHTML = lista.map((item, i) => `<div class="linha-item"><div class="li-topo"><b>${TITULO_LINHA[alvo] || 'Item'} ${i + 1}</b>
      <button class="sec li-rm" type="button" data-rm="${i}">Remover</button></div><div class="li-campos">${
      campos.filter(([, , , , mostra]) => !mostra || mostra(item)).map(([k, rot, tipo, extra]) => `<div><label>${rot}</label>${
      tipo === 'select' ? `<select data-i="${i}" data-k="${k}">${opcoes(extra, item[k])}</select>`
        : `<input data-i="${i}" data-k="${k}" type="${tipo}" ${extra || ''} value="${esc(item[k] ?? '')}">`}</div>`).join('')}</div></div>`).join('');
    $(alvo).querySelectorAll('[data-k]').forEach(el => el.oninput = el.onchange = () => {
      lista[+el.dataset.i][el.dataset.k] = el.type === 'number' ? (el.value === '' ? null : +el.value) : el.value;
      if (el.dataset.k === 'tipo' && el.type !== 'number' && campos.some(c => c[4])) desenharLinhas(lista, alvo, campos, aoMudar); // os campos mudam com o tipo
      aoMudar();
    });
    $(alvo).querySelectorAll('[data-rm]').forEach(b => b.onclick = () => { lista.splice(+b.dataset.rm, 1); desenharLinhas(lista, alvo, campos, aoMudar); aoMudar(); });
  };
  // Só os campos que as regras usam para o tipo: malha (todos menos linha), comprimento (redes, espinhel), altura e RGP na tralha (emalhe no mar).
  const emalheMar = p => p.tipo === 'Rede de emalhe' && (ab.area === 'mar' || p.alturaM != null || !!p.rgpTralha);
  const CAMPOS_PET = [['tipo', 'Tipo', 'select', PETRECHOS], ['malhaMm', 'Malha (mm)', 'number', 'min="0" step="1" inputmode="numeric" placeholder="nós opostos"', p => p.tipo !== 'Linha e anzol'],
    ['qtd', 'Quantidade', 'number', 'min="1" step="1" inputmode="numeric"'],
    ['comprimentoM', 'Comprimento (m)', 'number', 'min="0" step="1" inputmode="numeric"', p => /^Rede|Espinhel|Outro/.test(p.tipo)],
    ['alturaM', 'Altura (m)', 'number', 'min="0" step="0.1" inputmode="decimal"', emalheMar], ['rgpTralha', 'RGP na tralha', 'select', ['', 'Sim', 'Não'], emalheMar]];
  const CAMPOS_PES = [['especie', 'Espécie', 'text', 'list="especies"'], ['kg', 'Peso (kg)', 'number', 'min="0" step="0.1" inputmode="decimal"'],
    ['menorCm', 'Menor exemplar (cm)', 'number', 'min="0" step="0.5" inputmode="decimal"']];
  $('#b-pet').onclick = () => { ab.petrechos.push({ tipo: PETRECHOS[0], malhaMm: null, comprimentoM: null, qtd: 1, alturaM: null, rgpTralha: '' }); desenharLinhas(ab.petrechos, '#petrechos', CAMPOS_PET, desenharSem); desenharSem(); };
  $('#b-pes').onclick = () => { ab.pescado.push({ especie: '', kg: null, menorCm: null }); desenharLinhas(ab.pescado, '#pescado', CAMPOS_PES, desenharSem); };

  const mostrarGps = () => { $('#gps').innerHTML = ab.gps ? `<a href="https://maps.google.com/?q=${ab.gps.lat},${ab.gps.lon}" target="_blank" rel="noopener">${ab.gps.lat.toFixed(5)}, ${ab.gps.lon.toFixed(5)}</a> (±${Math.round(ab.gps.prec)} m)` : ''; };
  $('#b-gps').onclick = async () => {
    $('#gps').textContent = 'Obtendo posição…';
    try { await posicao(); if (ab.localPescaId) escolherLocal(localPesca(ab.localPescaId)); } catch (err) { $('#gps').textContent = err.message; }
  };

  // Onde: o local de pesca define o regime de normas (locais.js). Lista compacta com busca; GPS ordena por proximidade.
  let ordemGps = null;
  const posicao = () => new Promise((ok, erro) => {
    if (!navigator.geolocation) return erro(new Error('GPS indisponível neste aparelho.'));
    navigator.geolocation.getCurrentPosition(pos => { ab.gps = { lat: pos.coords.latitude, lon: pos.coords.longitude, prec: pos.coords.accuracy }; mostrarGps(); ok(ab.gps); },
      err => erro(new Error('Não foi possível obter a posição: ' + err.message)), { enableHighAccuracy: true, timeout: 20000 });
  });
  const escolherLocal = l => {
    ab.localPescaId = l.id;
    ab.area = l.regime;
    if ((l.id === 'patos' || l.id === 'patosnorte') && ab.gps) ab.area = trechoPatos(ab.gps.lat);
    A.envolvidos.forEach(e => { e.localTipo = l.sub || ''; }); // trocou o local: o ponto volta ao padrão para todos
    if (!ab.local) { ab.local = l.nome; $('#a-local').value = l.nome; }
    gravarLocalTurno(l.id);
    $('#a-loc').innerHTML = opcoesLocal();
    desenharOnde(); desenharLinhas(ab.petrechos, '#petrechos', CAMPOS_PET, desenharSem); desenharSem();
  };
  const desenharOnde = () => {
    const l = localPesca(ab.localPescaId);
    if (l) {
      const r = REGIMES[ab.area];
      const avisoPatos = (l.id === 'patos' || l.id === 'patosnorte') && ab.gps && trechoPatos(ab.gps.lat) !== l.regime
        ? `<p class="msg erro">Pela posição do GPS, este ponto fica no ${trechoPatos(ab.gps.lat) === 'patos' ? 'estuário' : 'trecho norte'} da Lagoa dos Patos: aplicado esse regime.</p>` : '';
      $('#onde').innerHTML = `<div class="onde-sel">
          <div><b>${esc(l.nome)}</b> <span class="muted peq">${esc(l.municipios.join(', '))}</span></div>
          <div class="peq">${esc(r.nome)}: ${esc(r.normas.join('; '))}${r.lista ? ' · com lista nominal' : ''}</div>
          ${l.conferir ? `<div class="peq aviso-txt">Classificação a confirmar: ${esc(l.base)}.</div>` : ''}${avisoPatos}
          ${l.bacia && baciasDe(l.municipios[0]).length > 1 ? `<div class="chips">${baciasDe(l.municipios[0]).map(([b, pct]) =>
            `<button type="button" class="chip${b === l.bacia ? ' ativo' : ''}" data-bacia="${b}">${esc(BACIAS[b])} ${pct}%</button>`).join('')}</div>` : ''}
          <details class="resumo"${lerAberto() ? ' open' : ''}><summary class="peq">O que vale aqui</summary>
            <ul class="peq">${[...(RESUMO[ab.area] || []), ...RESUMO_TODOS].map(t => `<li>${esc(t)}</li>`).join('')}</ul></details>
          <div class="peq"><a href="#" id="o-trocar">Trocar local</a> · <a href="#/normas">Normas por local</a></div></div>`;
      $('#onde details.resumo').ontoggle = e => gravarAberto(e.target.open);
      $('#o-trocar').onclick = e => { e.preventDefault(); ab.localPescaId = ''; desenharOnde(); };
      $('#onde').querySelectorAll('[data-bacia]').forEach(b => b.onclick = () => escolherLocal(localDoMunicipio(l.municipios[0], b.dataset.bacia)));
      return;
    }
    $('#onde').innerHTML = `<label for="o-q">Onde está fiscalizando?</label>
      <div class="linha"><input id="o-q" type="search" autocomplete="off" placeholder="Lagoa, rio, barragem ou município" style="flex:1">
        <button class="sec" id="o-gps" type="button">Perto de mim</button></div>
      <p id="o-msg" class="muted peq"></p><ul id="o-res" class="lista lista-compacta"></ul>`;
    // Locais com nome e, abaixo, municípios (águas da bacia principal). Com GPS, os mais próximos primeiro.
    const listar = () => {
      const q = $('#o-q').value;
      let ls = buscarLocal(q);
      if (ordemGps) ls = ls.slice().sort((a, b) => Math.min(...a.municipios.map(m => ordemGps.indexOf(m))) - Math.min(...b.municipios.map(m => ordemGps.indexOf(m))));
      const ms = q.trim() ? buscarMunicipio(q).slice(0, 8) : ordemGps ? ordemGps.slice(0, 5) : [];
      const itemMun = m => { const bs = baciasDe(m), r = localDoMunicipio(m, bs[0][0]).regime;
        return `<li><a href="#" data-mun="${esc(m)}"><span class="nome">${esc(m)}: outros rios e lagoas</span>
          <span class="info">${bs.map(([b, p]) => `${esc(BACIAS[b])}${bs.length > 1 ? ` ${p}%` : ''}`).join(', ')} · ${esc(AREA_CURTA[r])}</span></a></li>`; };
      $('#o-res').innerHTML = (ordemGps && !q.trim() ? ms.map(itemMun).join('') : '') + ls.map(l => `<li><a href="#" data-id="${l.id}"><span class="nome">${esc(l.nome)}</span>
        <span class="info">${esc(l.municipios.slice(0, 3).join(', '))}${l.municipios.length > 3 ? '…' : ''} · ${esc(AREA_CURTA[l.regime])}</span></a></li>`).join('')
        + (q.trim() ? ms.map(itemMun).join('') : '');
      $('#o-res').querySelectorAll('a[data-id]').forEach(a => a.onclick = e => { e.preventDefault(); escolherLocal(localPesca(a.dataset.id)); });
      $('#o-res').querySelectorAll('a[data-mun]').forEach(a => a.onclick = e => { e.preventDefault(); escolherLocal(localDoMunicipio(a.dataset.mun, baciasDe(a.dataset.mun)[0][0])); });
    };
    $('#o-q').oninput = listar;
    $('#o-gps').onclick = async () => {
      $('#o-msg').textContent = 'Obtendo posição…';
      try { const g = await posicao(); ordemGps = proximos(g.lat, g.lon); $('#o-msg').textContent = `Mais perto: ${ordemGps.slice(0, 3).join(', ')}.`; listar(); }
      catch (err) { $('#o-msg').textContent = err.message; }
    };
    listar();
  };
  $('#a-loc').onchange = e => { ab.localTipo = e.target.value; desenharSem(); };
  $('#a-emb').onchange = e => { ab.embarcacao = e.target.value; $('#d-comp').hidden = ab.embarcacao === 'Nenhuma'; desenharSem(); };
  $('#a-comp').oninput = e => { ab.comprimentoEmbM = e.target.value === '' ? null : +e.target.value; desenharSem(); };
  $('#a-cat').onchange = e => { ab.categoria = e.target.value; desenharSem(); desenharConsulta(); };
  $('#a-data').onchange = e => { ab.data = e.target.value || ab.data; desenharSem(); desenharConsulta(); };
  $('#a-local').oninput = e => { ab.local = e.target.value; };
  $('#ba-cor').onclick = e => { e.preventDefault(); $('#sem').scrollIntoView({ behavior: 'smooth', block: 'start' }); };
  // Marcar apreensão ou notificação acima já marca a providência.
  const marcarProv = (t, sim) => {
    if (sim && !ab.providencias.some(x => x.tipo === t)) ab.providencias.push({ tipo: t, numero: '' });
    if (!sim) ab.providencias = ab.providencias.filter(x => x.tipo !== t);
    desenharProvs();
  };
  const desenharProvs = () => {
    $('#provs').innerHTML = PROVIDENCIAS.map(t => { const p = ab.providencias.find(x => x.tipo === t);
      return `<div class="prov"><label class="chk"><input type="checkbox" data-prov="${esc(t)}"${p ? ' checked' : ''}> ${esc(t)}</label>
        ${p && COM_NUMERO.has(t) ? `<input data-num="${esc(t)}" value="${esc(p.numero)}" placeholder="Nº" inputmode="text">` : ''}</div>`; }).join('');
    $('#provs').querySelectorAll('[data-prov]').forEach(c => c.onchange = () => {
      const t = c.dataset.prov;
      ab.providencias = c.checked ? [...ab.providencias, { tipo: t, numero: '' }] : ab.providencias.filter(x => x.tipo !== t);
      desenharProvs();
      $(`#provs [data-num="${t}"]`)?.focus();
    });
    $('#provs').querySelectorAll('[data-num]').forEach(i => i.oninput = () => { ab.providencias.find(x => x.tipo === i.dataset.num).numero = i.value; });
  };
  $('#a-obs').oninput = e => { ab.obs = e.target.value; };
  $('#b-salvar').onclick = async () => {
    const m = $('#m-ab');
    const sem = A.envolvidos.findIndex(e => !db.pescadores[e.pescadorId]);
    if (sem >= 0) { trocarEnv(sem); m.textContent = 'Selecione ou cadastre a pessoa abordada.'; m.className = 'msg erro'; return; }
    A.envolvidos.forEach((e, i) => {
      const p = db.pescadores[e.pescadorId];
      if (e.identificadoPor === 'cpf' && !p.cpf) { p.cpf = e.cpfInformado; if (!p.digitos) p.digitos = p.cpf.slice(3, 9); p.atualizadoEm = agora(); sujos.add(p.id); }
      e.semaforo = semaforoDe(i);
    });
    A.criadoEm ||= agora();
    A.atualizadoEm = agora();
    db.abordagens[A.id] = structuredClone(A);
    sujosAb.add(A.id);
    await salvar();
    if (location.hash !== '#/ab/' + A.id) location.hash = '#/ab/' + A.id;
    else { m.textContent = 'Abordagem salva.'; m.className = 'msg'; }
  };

  desenharOnde(); mostrarGps(); trocarEnv(0);
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
// Junta dados de outro aparelho: mesma pessoa pelo id ou por dígitos + nome parecido; licenças, consultas e embarcações somadas;
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
    for (const t of ['embarcacoes', 'veiculos']) for (const x of b[t] || []) if (!(a[t] ||= []).some(y => y.id === x.id)) a[t].push(x);
    if (b.cpf && !a.cpf) a.cpf = b.cpf;
    for (const [k] of QUALIFICACAO) if (b[k] && !a[k]) a[k] = b[k];
    if (JSON.stringify(a) !== antes) { sujos.add(a.id); n++; }
  }
  for (const i of outro.importacoes || []) if (!db.importacoes.some(x => x.hash === i.hash)) db.importacoes.push(i);
  for (const k of ['denuncias', 'tarefas']) for (const x of outro.cfg?.[k] || []) { // vale a versão editada por último
    const l = (db.cfg[k] ||= []), i = l.findIndex(y => y.id === x.id);
    if (i < 0) { l.push(x); n++; } else if ((x.atualizadoEm || '') > (l[i].atualizadoEm || '')) { l[i] = x; n++; }
  }
  for (const [id, b] of Object.entries(outro.abordagens || {})) { // vale a versão editada por último
    const a = db.abordagens[id];
    if (!a || b.atualizadoEm > a.atualizadoEm) {
      const nb = normalizarAb(b);
      db.abordagens[id] = { ...nb, envolvidos: nb.envolvidos.map(e => ({ ...e, pescadorId: idLocal[e.pescadorId] || e.pescadorId })) };
      sujosAb.add(id); n++;
    }
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
        <div><label for="i-area">Área</label><select id="i-area">${AREAS_LISTA.map(k => `<option value="${k}">${esc(AREAS[k])}</option>`).join('')}</select></div>
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

// ---------- guia de consulta rápida (colegas de reforço; funciona sem internet) ----------
const CAT = { CR: 'criticamente em perigo', EN: 'em perigo', VU: 'vulnerável' };
function telaGuia() {
  const hoje = agoraLocal().slice(0, 10);
  const agora = Object.keys(REGIMES).map(r => [r, defesosDe(r, hoje)]).filter(([, ds]) => ds.length);
  const ameacadas = new Set(['bagre-branco', 'miraguaia']);
  app.innerHTML = `<div class="card fixo"><h1>Guia</h1>
      <p class="muted peq">Consulta rápida para a fiscalização. Funciona sem internet. Para as regras completas, com artigos, abra <a href="#/normas">Normas por local</a>.</p>
      <input id="g-q" type="search" placeholder="Buscar peixe, local ou regra" autocomplete="off"></div>
    <div class="card"><h2>Agora (${fmtData(hoje)})</h2>${agora.length ? agora.map(([r, ds]) => `<p class="peq"><b>${esc(REGIMES[r].nome)}</b><br>
      ${ds.map(d => `${esc(d.nome)}: ${d.estado === 'vigente' ? '<b>em vigor</b>' : 'começa em breve'}, ${esc(d.periodo)}. ${esc(d.texto)} (${esc(d.norma)}).`).join('<br>')}</p>`).join('')
      : '<p class="muted peq">Nenhum defeso em vigor ou próximo.</p>'}</div>
    <details class="card card-dobra g" open><summary><h2 style="display:inline">Peixes ameaçados: pesca proibida</h2></summary>
      <p class="muted peq">Pesca proibida em todo o RS, o ano todo, em qualquer tamanho (Lei RS 15.223/2018, art. 30, III; Decreto RS 51.797/2014). Na dúvida sobre a espécie, fotografe o exemplar e registre na abordagem.</p>
      <ul class="lista g-lista">${AMEACADAS_GUIA.map(([pop, cie, amb, cat]) => `<li class="g-item"><div class="nome">${esc(pop)}</div>
        <div class="info"><i>${esc(cie)}</i> · ${esc(amb)} · ${esc(cat.split(' e ').map(c => CAT[c] || c).join(' / '))}</div></li>`).join('')}</ul>
      <p class="muted peq">Também estão na lista: peixes-anuais, lambaris (<i>Bryconamericus lambari</i>, <i>Diapoma pyrrhopteryx</i>), lambari-listrado, canivete, joana e cambeva.</p></details>
    <details class="card card-dobra g"><summary><h2 style="display:inline">Bagre</h2></summary>
      <p class="peq g-item"><b>Espécies ameaçadas.</b> Bagre-branco (<i>Genidens barbus</i>) e bagre-boca-larga (<i>Genidens planifrons</i>) são ameaçados no RS. A pesca destas espécies é proibida o ano todo, em qualquer local (Lei RS 15.223/2018, art. 30, III; Decreto RS 51.797/2014).</p>
      <p class="peq g-item"><b>Estuário da Lagoa dos Patos.</b> A Justiça Federal manteve a proibição dos dois bagres em 10/2025 (2ª Vara Federal de Pelotas, ACP 5002915-31.2019.4.04.7110). O calendário da INC 03/2004 cita bagre em out, nov e de mar a mai. ATENÇÃO: este calendário não libera os dois bagres ameaçados. Rede de espera para bagre: malha mínima de 140 mm.</p>
      <p class="peq g-item"><b>Bacia do Tramandaí.</b> Pesca de bagre proibida de 15/12 a 31/03 (IN 17/2004, art. 14). A IN 17 cita <i>G. barbus</i>, <i>Netuma planifrons</i> e <i>G. genidens</i>. Fora deste período, os dois bagres ameaçados continuam proibidos.</p>
      <p class="peq g-item"><b>Identificação.</b> Registre a espécie na abordagem. Bagre sem espécie fica amarelo no app. Fotografe o exemplar e confira. <i>G. genidens</i> não está na lista de ameaçados usada pelo app. No mar, o tamanho mínimo de <i>G. genidens</i> é 20 cm (IN 53/2005).</p></details>
    <details class="card card-dobra g"><summary><h2 style="display:inline">Camarão</h2></summary>
      <p class="peq g-item"><b>Bacia do Tramandaí: temporada.</b> Pesca de camarão só na temporada da portaria anual. Em 2026: de 23/01 a 21/06 (Portaria Interministerial MPA/MMA 48/2026). A cada ano, atualize as datas em Dados.</p>
      <p class="peq g-item"><b>Bacia do Tramandaí: aviãozinho.</b> Só na Laguna do Armazém, nas balizas sorteadas, em estrela de 5. Malha mínima de 25 mm. Boca de até 13,20 m. Até 10 redes por pescador e 800 no total. Só camarão pode ser desembarcado. No fim da safra, as redes saem da água (IN 17/2004, art. 18).</p>
      <p class="peq g-item"><b>Bacia do Tramandaí: tarrafa de camarão.</b> Malha de 25 mm. Só para licenciado. Só nos pontos demarcados das lagoas Tramandaí, Armazém e Custódias e dos rios Camarão e Relógio (IN 17/2004).</p>
      <p class="peq g-item"><b>Estuário da Lagoa dos Patos.</b> Camarão-rosa: de fev a mai (INC 03/2004, art. 2º). Tamanho mínimo: 9 cm, com tolerância de 20% do número de exemplares (art. 6º). Rede de saco e aviãozinho: malha mínima de 24 mm. Andaina de até 10 redes por licenciado. Tralha de até 15 m. Placa com o registro no primeiro calão. Distância de 300 m entre séries paralelas.</p>
      <p class="peq g-item"><b>Lagoa do Peixe.</b> Só pesca quem está no Termo de Compromisso do ICMBio. Aviãozinho com lacre numerado, em caíco sem motor. Só na temporada que o ICMBio abre.</p>
      <p class="peq g-item"><b>Arrasto.</b> Proibido na Bacia do Tramandaí e no estuário da Lagoa dos Patos.</p></details>
    <details class="card card-dobra g"><summary><h2 style="display:inline">Defesos por região</h2></summary>
      ${Object.entries(DEFESOS).filter(([, ds]) => ds.length).map(([r, ds]) => `<p class="peq g-item"><b>${esc(REGIMES[r].nome)}</b><br>${ds.map(([n, de, ate, t, norma]) =>
        `${esc(n)}: de ${esc(de.split('-').reverse().join('/'))} a ${esc(ate.split('-').reverse().join('/').replace('29/02', '28/02'))}. ${esc(t)} (${esc(norma)}).`).join('<br>')}</p>`).join('')}
      <p class="peq g-item"><b>Lagoa dos Patos, estuário</b><br>Tainha: de out a mai. Corvina: de out a fev. Camarão-rosa: de fev a mai (INC 03/2004, art. 2º).</p>
      <p class="peq g-item"><b>Bacia do Tramandaí</b><br>Camarão: só na temporada da portaria anual. A data fica em Dados.</p></details>
    <details class="card card-dobra g"><summary><h2 style="display:inline">Tamanho mínimo no mar</h2></summary>
      <p class="muted peq">Comprimento total, do focinho à ponta da cauda (IN MMA 53/2005). Tolerância: 10% do peso. Nas espécies do Anexo II: 20%.</p>
      <ul class="lista g-lista">${Object.entries(TAMANHO_MINIMO).filter(([k]) => !ameacadas.has(k)).map(([k, cm]) => `<li class="g-item"><div class="nome">${esc(k[0].toUpperCase() + k.slice(1))}: ${cm} cm</div></li>`).join('')}</ul></details>
    <details class="card card-dobra g"><summary><h2 style="display:inline">Petrechos e malhas por local</h2></summary>
      ${Object.entries(RESUMO).map(([r, ts]) => `<div class="g-item"><p class="peq"><b>${esc(REGIMES[r].nome)}</b></p><ul class="peq">${ts.map(t => `<li>${esc(t)}</li>`).join('')}</ul></div>`).join('')}
      <div class="g-item"><p class="peq"><b>Pesca amadora, em qualquer local</b></p><ul class="peq">${RESUMO_TODOS.slice(1).map(t => `<li>${esc(t)}</li>`).join('')}</ul></div></details>
    <details class="card card-dobra g"><summary><h2 style="display:inline">RGP e licença: quem precisa</h2></summary>
      <ul class="peq g-item"><li><b>Precisam de RGP:</b> pescador profissional (artesanal ou industrial), aprendiz, armador, embarcação de pesca, aquicultor e empresa pesqueira (Dec. 8.425/2015).</li>
        <li><b>Amador:</b> precisa da licença de pescador amador. A licença vale 1 ano (IN MPA 05/2012, art. 10). Com barco, use a licença embarcada. O barco deve ser de esporte e recreio (Lei 11.959/2009).</li>
        <li><b>Dispensados:</b> pesca de subsistência; amador só com linha de mão ou caniço simples; indígenas na subsistência (Dec. 8.425/2015, art. 3º, §1º). ATENÇÃO: vara com molinete ou carretilha exige licença.</li>
        <li><b>Isenção de taxa:</b> aposentados, homens com 65 anos ou mais e mulheres com 60 anos ou mais. Só com linha, caniço ou molinete (IN MPA 05/2012, art. 6º). A isenção é da taxa, não da licença.</li>
        <li><b>Profissional:</b> pesca só com RGP ativo e licença. O REAP anual mantém a licença. O REAP de 2025 vai até 31/12/2026 (Portaria MPA 127/2023).</li>
        <li><b>Protocolo:</b> não vale como licença desde 31/03/2025.</li>
        <li><b>RSPA e RSPS:</b> os dois prefixos aparecem nas listas oficiais de licenciados. Não há definição oficial publicada da diferença. Use a lista e a situação no PesqBrasil. Na dúvida, consulte a SFPA/RS.</li>
        <li><b>Sem RGP ou licença:</b> infração do Dec. 6.514/2008, art. 37. Sem outra irregularidade, não é crime do art. 34 (MPF, 4ª CCR, Enunciado 81).</li></ul></details>
    <details class="card card-dobra g"><summary><h2 style="display:inline">Enquadramento</h2></summary>
      <ul class="peq g-item"><li><b>Crime:</b> Lei 9.605/98, art. 34. Caput: período proibido ou local interditado. Parágrafo único, I: espécie protegida ou abaixo do tamanho mínimo. II: quantidade acima do permitido, petrecho ou método proibido. III: transporte ou comércio de pescado proibido.</li>
        <li><b>Tentativa:</b> pela Lei 9.605/98, art. 36, pesca é todo ato tendente a retirar peixe. A tentativa também é pesca.</li>
        <li><b>Infração:</b> Dec. 6.514/2008, art. 35: R$ 700 a R$ 100.000, mais R$ 20 por kg ou fração.</li>
        <li><b>Sem autorização ou registro:</b> Dec. 6.514/2008, art. 37: R$ 300 a R$ 10.000, mais R$ 20 por kg.</li>
        <li>O app indica. A equipe decide e autua.</li></ul></details>`;
  // Busca: mostra só os itens que contêm o texto e abre as seções onde há resultado.
  const sem = t => t.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  $('#g-q').oninput = e => {
    const q = sem(e.target.value.trim());
    document.querySelectorAll('.g').forEach(sec => {
      let algum = false;
      sec.querySelectorAll('.g-item').forEach(i => { const ok = !q || sem(i.textContent).includes(q); i.hidden = !ok; algum ||= ok; });
      if (q) sec.open = algum;
    });
  };
}

// ---------- normas por local (consulta rápida, sem abordagem) ----------
function telaNormas() {
  const regimes = Object.keys(REGIMES);
  app.innerHTML = `<div class="card"><h1>Normas por local</h1>
      <p class="muted peq">O local de pesca define as normas. Toque num local para ver a base da classificação.</p>
      <input id="n-q" type="search" autocomplete="off" placeholder="Lagoa, rio, barragem ou município"></div>
    <div id="n-res"></div>
    <div class="card"><h2>Valem em qualquer local</h2>
      <ul class="peq">
        <li><b>Espécies ameaçadas</b>: proibidas o ano todo (bagre-branco, <i>Genidens planifrons</i>, miraguaia, garoupa-verdadeira, <i>Odontesthes bicudo</i>; cações e raias: conferir a espécie). Lei RS 15.223/2018, art. 30, III; Decreto RS 51.797/2014; Portaria MMA 445/2014.</li>
        <li><b>RGP e licença</b>: pesca sem RGP ou sem licença é proibida. Lei RS 15.223/2018, art. 30, V. Nas áreas com lista nominal, a lista é a licença.</li>
        <li><b>Barras e desembocaduras</b>: de 15/03 a 15/08, só tarrafa. IN IBAMA 171/2008.</li>
        <li><b>Águas continentais</b>: nada a menos de 200 m de barragem, cachoeira ou corredeira; rede de espera com malha mínima de 70 mm, tarrafa e covo de 50 mm, sem arrasto. IN IBAMA 43/2004 (onde não há norma própria).</li>
      </ul></div>`;
  const listar = () => {
    const ls = buscarLocal($('#n-q').value);
    $('#n-res').innerHTML = regimes.map(rg => {
      const doRegime = ls.filter(l => l.regime === rg);
      if (!doRegime.length) return '';
      const r = REGIMES[rg];
      return `<div class="card"><h2>${esc(r.nome)}</h2>
        <p class="peq">${esc(r.normas.join('; '))}${r.lista ? ' · <b>com lista nominal</b>' : ''}</p>
        ${doRegime.map(l => `<details class="local"><summary>${esc(l.nome)}${l.conferir ? ' <span class="tag aviso">a confirmar</span>' : ''}</summary>
          <p class="peq">${esc(l.municipios.join(', '))}</p><p class="peq">Base: ${esc(l.base)}.</p>
          <p><a class="btn sec" href="#/ab/novo?l=${encodeURIComponent(l.id)}">Nova abordagem aqui</a></p></details>`).join('')}</div>`;
    }).join('');
    const ms = buscarMunicipio($('#n-q').value).slice(0, 10);
    $('#n-res').innerHTML += ms.length ? `<div class="card"><h2>Municípios</h2><p class="muted peq">Rios e lagoas sem nome na lista seguem a bacia. Município em mais de uma bacia: confira em qual está.</p>
      ${ms.map(m => `<details class="local"><summary>${esc(m)}</summary>${baciasDe(m).map(([b, pct]) => { const l = localDoMunicipio(m, b);
        return `<p class="peq"><b>${esc(BACIAS[b])}</b> (${pct}% da área): ${esc(REGIMES[l.regime].nome)}. ${esc(REGIMES[l.regime].normas.join('; '))}.
          <a href="#/ab/novo?l=${encodeURIComponent(l.id)}">Nova abordagem aqui</a></p>`; }).join('')}</details>`).join('')}</div>` : '';
    if (!$('#n-res').innerHTML) $('#n-res').innerHTML = '<div class="card"><p class="muted peq">Nenhum local encontrado.</p></div>';
  };
  $('#n-q').oninput = listar;
  listar();
}

// ---------- roteamento e bloqueio ----------
function marcarNav() {
  const h = location.hash.startsWith('#/dados') ? '#/dados' : location.hash.startsWith('#/normas') || location.hash.startsWith('#/guia') ? '#/guia' : /^#\/(ab|pendencias|denuncia|vinculos)/.test(location.hash) ? '#/abordagens' : '#/';
  document.querySelectorAll('#nav a').forEach(a => a.classList.toggle('ativo', a.getAttribute('href') === h));
}
function rotear() {
  if (!db) return telaSenha();
  marcarNav();
  document.body.classList.remove('com-barra');
  const h = location.hash;
  if (h === '#/normas') return telaNormas();
  if (h === '#/guia') return telaGuia();
  if (h.startsWith('#/p/')) return telaFicha(decodeURIComponent(h.slice(4)));
  if (h === '#/dados') return telaDados();
  if (h === '#/abordagens') return telaAbordagens();
  if (h === '#/pendencias') return telaAbordagens('pend');
  if (h === '#/denuncias') return telaDenuncias();
  if (h.startsWith('#/denuncia/')) return telaDenuncia(h.slice(11));
  if (h === '#/vinculos') return telaVinculos('');
  if (h.startsWith('#/vinculos/')) return telaVinculos(decodeURIComponent(h.slice(11)));
  if (h.startsWith('#/ab/')) return telaAbordagem(h.slice(5));
  return telaLista();
}
window.addEventListener('hashchange', rotear);
// Altura do cabeçalho, para a lista da tela inicial ocupar o resto da tela.
const medirTopo = () => document.documentElement.style.setProperty('--topo-h', document.querySelector('.topo').offsetHeight + 'px');
addEventListener('resize', medirTopo); medirTopo();
$('#btn-bloquear').onclick = () => location.reload();
// Tema: segue o celular até a pessoa escolher; a escolha fica neste aparelho (não é dado da fiscalização).
const temaAtual = () => document.documentElement.dataset.theme || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
const mostrarTema = () => { const escuro = temaAtual() === 'dark';
  $('#btn-tema').setAttribute('aria-label', escuro ? 'Usar tema claro' : 'Usar tema escuro'); $('#btn-tema').title = $('#btn-tema').getAttribute('aria-label');
  $('#btn-tema').innerHTML = escuro ? ICONE_SOL : ICONE_LUA; };
const ICONE_SOL = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>';
const ICONE_LUA = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/></svg>';
$('#btn-tema').onclick = () => {
  const novo = temaAtual() === 'dark' ? 'light' : 'dark';
  document.documentElement.dataset.theme = novo;
  try { localStorage.setItem('fp-tema', novo); } catch {}
  mostrarTema();
};
mostrarTema();

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

// O app abre do cache (sw.js). Quando uma versão nova termina de instalar, avisa para recarregar.
if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
  const tinha = !!navigator.serviceWorker.controller;
  navigator.serviceWorker.register('sw.js').then(r => r.update()).catch(() => {});
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!tinha || $('#aviso-versao')) return;
    const a = Object.assign(document.createElement('button'), { id: 'aviso-versao', type: 'button', textContent: 'Versão nova do app. Toque para atualizar.' });
    a.onclick = async () => { await autosalvar(); location.reload(); };
    document.body.appendChild(a);
  });
}
rotear();
