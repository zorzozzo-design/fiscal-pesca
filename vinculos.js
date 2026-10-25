// Grafo de vínculos: pescadores, embarcações, veículos, abordagens e denúncias. Funções puras; o desenho fica no app (Cytoscape).
(() => {

const chavePlaca = s => String(s ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');
const chaveTexto = s => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/\s+/g, ' ').trim();
// Embarcação: pela inscrição na Capitania; sem inscrição, pelo nome.
const chaveEmb = e => e.inscricao ? chavePlaca(e.inscricao) : 'N:' + chaveTexto(e.nome);

function montarVinculos(db) {
  const nos = new Map(), arestas = new Map();
  const no = (id, tipo, label, extra = {}) => { if (!nos.has(id)) nos.set(id, { id, tipo, label, ...extra }); return id; };
  const liga = (a, b, label = '') => { const k = [a, b].sort().join('|'); if (a !== b && !arestas.has(k)) arestas.set(k, { id: k, source: a, target: b, label }); };
  const pes = id => db.pescadores[id] ? no('p:' + id, 'pescador', db.pescadores[id].nome, { pescadorId: id }) : null;
  for (const p of Object.values(db.pescadores)) {
    for (const e of p.embarcacoes || []) liga(pes(p.id), no('e:' + chaveEmb(e), 'embarcacao', e.nome || e.inscricao), 'embarcação');
    for (const v of p.veiculos || []) liga(pes(p.id), no('v:' + chavePlaca(v.placa), 'veiculo', [chavePlaca(v.placa), v.modelo].filter(Boolean).join(' ')), 'veículo');
  }
  for (const a of Object.values(db.abordagens)) {
    const es = (a.envolvidos || []).filter(e => db.pescadores[e.pescadorId]);
    if (!es.length) continue;
    const an = no('a:' + a.id, 'abordagem', 'Abordagem ' + a.data.slice(0, 10).split('-').reverse().join('/'), { abordagemId: a.id });
    for (const e of es) liga(an, pes(e.pescadorId));
  }
  for (const d of db.denuncias || []) {
    const dn = no('d:' + d.id, 'denuncia', `Denúncia ${String(d.data || '').slice(0, 10).split('-').reverse().join('/')}`, { denunciaId: d.id });
    for (const id of d.pescadorIds || []) if (db.pescadores[id]) liga(dn, pes(id));
    for (const pl of d.placas || []) if (chavePlaca(pl)) liga(dn, no('v:' + chavePlaca(pl), 'veiculo', chavePlaca(pl)));
    for (const em of d.embarcacoes || []) if (chaveTexto(em)) {
      // A embarcação citada pode ser inscrição ou nome: liga à que já existe na base, se houver.
      const id = nos.has('e:' + chavePlaca(em)) ? 'e:' + chavePlaca(em) : 'e:N:' + chaveTexto(em);
      liga(dn, no(id, 'embarcacao', em));
    }
    for (const nome of d.pessoas || []) if (chaveTexto(nome)) liga(dn, no('x:' + chaveTexto(nome), 'pessoa', nome));
  }
  // Fica só o que tem vínculo.
  const usados = new Set([...arestas.values()].flatMap(e => [e.source, e.target]));
  return { nodes: [...nos.values()].filter(n => usados.has(n.id)), edges: [...arestas.values()] };
}

// Nós a até `niveis` ligações do nó central, e as arestas entre eles.
function vizinhanca(g, centro, niveis = 1) {
  const viz = new Map();
  for (const e of g.edges) { (viz.get(e.source) || viz.set(e.source, []).get(e.source)).push(e.target); (viz.get(e.target) || viz.set(e.target, []).get(e.target)).push(e.source); }
  const dentro = new Set([centro]);
  let borda = [centro];
  for (let i = 0; i < niveis; i++) borda = borda.flatMap(n => viz.get(n) || []).filter(n => !dentro.has(n) && dentro.add(n));
  return { nodes: g.nodes.filter(n => dentro.has(n.id)), edges: g.edges.filter(e => dentro.has(e.source) && dentro.has(e.target)) };
}

globalThis.Vinculos = { montarVinculos, vizinhanca, chavePlaca, chaveEmb };
})();
