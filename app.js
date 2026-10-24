const { ler, mesclar, temporadaAtual, situacao, buscar, parecido, AVISO_TXT } = window.Lista;

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

const AREAS = { tramandai: 'Bacia do Rio Tramandaí (IN MMA 17/2004)' };
const AREA_CURTA = { tramandai: 'Tramandaí' };
const SIT = { atual: ['Na lista atual', 'ok'], saiu: ['Saiu da lista atual', 'alerta'], nunca: ['Sem licença na área', 'aviso'] };

// ---------- armazenamento criptografado (IndexedDB + AES-GCM), mesmo modelo do Fiscal Passeriformes ----------
// Cada pescador é um registro cifrado separado. "meta" guarda o salt, as configurações e o histórico de importações.
function idb() {
  return new Promise((ok, erro) => {
    const r = indexedDB.open('fiscal-pesca', 1);
    r.onupgradeneeded = () => {
      for (const loja of ['kv', 'pescadores']) if (!r.result.objectStoreNames.contains(loja)) r.result.createObjectStore(loja);
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
async function salvar() {
  const lote = [...sujos];
  sujos.clear();
  const meta = await cifrar(chave, salt, { cfg: db.cfg, importacoes: db.importacoes });
  const regs = await Promise.all(lote.map(async id => [id, await cifrar(chave, salt, db.pescadores[id])]));
  if (regs.length) await tx('pescadores', 'readwrite', s => regs.forEach(([id, v]) => s.put(v, id)));
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
  db = { cfg: m.cfg, importacoes: m.importacoes || [], pescadores: {} };
  for (const [id, v] of await lerLoja('pescadores')) db.pescadores[id] = await decifrar(chave, v);
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
        db = { cfg: {}, importacoes: [], pescadores: {} };
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
      </div></div>
    ${outros.length ? `<div class="card revisar"><h2>Mesmos dígitos de CPF</h2>
      <p class="muted peq">As listas publicam só 6 dígitos do CPF. Pode ser outra pessoa ou a mesma com nome escrito diferente: confira o documento.</p>
      <ul class="lista">${outros.map(o => `<li><a href="#/p/${encodeURIComponent(o.id)}">${esc(nomeProprio(o.nome))} <span class="info">${esc(o.rgp)}</span></a></li>`).join('')}</ul></div>` : ''}
    <div class="card"><h2>Licenças por temporada</h2>
      <div class="tabela"><table><thead><tr><th>Temporada</th><th>Área</th><th>Nº</th><th>Nome na lista</th><th>RGP na lista</th></tr></thead>
      <tbody>${lics.map(l => `<tr><td>${esc(l.temporada)}</td><td>${esc(AREA_CURTA[l.area] || l.area)}</td><td>${l.n}</td><td>${esc(l.nomeLista)}</td><td>${esc(l.rgp)}</td></tr>`).join('')}</tbody></table></div></div>
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
// Junta dados de outro aparelho: mesma pessoa pelo id ou por dígitos + nome parecido; licenças somadas; observação mais recente.
function mesclarBackup(outro) {
  let n = 0;
  for (const b of Object.values(outro.pescadores || {})) {
    const lista = Object.values(db.pescadores);
    const a = db.pescadores[b.id] || lista.find(p => p.digitos && p.digitos === b.digitos && (p.nomeNorm === b.nomeNorm || parecido(p.nome, b.nome)));
    if (!a) { db.pescadores[b.id] = b; sujos.add(b.id); n++; continue; }
    const antes = JSON.stringify(a);
    for (const l of b.licencas) if (!a.licencas.some(x => x.area === l.area && x.temporada === l.temporada)) a.licencas.push(l);
    if (b.obs && b.obs !== a.obs && b.atualizadoEm > a.atualizadoEm) { a.obs = b.obs; a.atualizadoEm = b.atualizadoEm; }
    if (JSON.stringify(a) !== antes) { sujos.add(a.id); n++; }
  }
  for (const i of outro.importacoes || []) if (!db.importacoes.some(x => x.hash === i.hash)) db.importacoes.push(i);
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
  $('#b-apagar').onclick = async () => {
    if (confirm('Apagar todos os dados deste aparelho?')) { await apagarTudo(); location.reload(); }
  };
}

// ---------- roteamento e bloqueio ----------
function marcarNav() {
  const h = location.hash.startsWith('#/dados') ? '#/dados' : '#/';
  document.querySelectorAll('#nav a').forEach(a => a.style.textDecoration = a.getAttribute('href') === h ? 'underline' : 'none');
}
function rotear() {
  if (!db) return telaSenha();
  marcarNav();
  const h = location.hash;
  if (h.startsWith('#/p/')) return telaFicha(decodeURIComponent(h.slice(4)));
  if (h === '#/dados') return telaDados();
  return telaLista();
}
window.addEventListener('hashchange', rotear);
$('#btn-bloquear').onclick = () => location.reload();

// Salvamento automático do que estiver pendente e bloqueio após 5 min em segundo plano.
async function autosalvar() {
  if (chave && db && sujos.size) { try { await salvar(); } catch { /* tenta no próximo ciclo */ } }
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
