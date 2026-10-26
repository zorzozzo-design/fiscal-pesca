// Termo de apreensão e notificação ambiental, no layout dos modelos do Comando Ambiental da Brigada Militar.
// Gera HTML para impressão (ou PDF pelo "Imprimir" do navegador). Script comum, sem módulos.
(() => {

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const PARTICULAS = new Set(['de', 'da', 'do', 'das', 'dos', 'e']);
const nomeProprio = s => String(s ?? '').toLowerCase().trim().split(/\s+/).map((w, i) => i && PARTICULAS.has(w) ? w
  : w.replace(/(^|['\-])(\p{L})/gu, (_, sep, l) => sep + l.toUpperCase())).join(' ');
const num = v => String(v).replace('.', ',');
const fmtCpf = p => p.cpf ? `${p.cpf.slice(0, 3)}.${p.cpf.slice(3, 6)}.${p.cpf.slice(6, 9)}-${p.cpf.slice(9)}`
  : p.digitos ? `***.${p.digitos.slice(0, 3)}.${p.digitos.slice(3)}-**` : '';
const dataBr = iso => iso ? iso.slice(0, 10).split('-').reverse().join('/') : '';
const marca = ok => ok ? '( X )' : '(&nbsp;&nbsp;&nbsp;)';
const linha = n => '_'.repeat(n);
const DESTINOS = ['Recolhimento', 'Doação', 'Soltura', 'Destruição'];

// Petrechos e pescado registrados na abordagem viram itens do termo (editáveis depois).
function itensDaAbordagem(ab) {
  const pet = (ab.petrechos || []).map(x => ({ tipo: 'Petrecho', unidade: 'un', quantidade: x.qtd || 1,
    descricao: [x.tipo, x.malhaMm ? `malha ${x.malhaMm} mm` : '', x.comprimentoM ? `${x.comprimentoM} m` : ''].filter(Boolean).join(', ') }));
  const pes = (ab.pescado || []).filter(x => x.especie).map(x => ({ tipo: 'Pescado', unidade: 'kg', quantidade: x.kg || 0,
    descricao: [x.especie, x.menorCm ? `menor exemplar ${num(x.menorCm)} cm` : ''].filter(Boolean).join(', ') }));
  return [...pet, ...pes];
}

// Motivos de irregularidade; sem nenhum, os pontos a conferir.
function motivoSugerido(ab) {
  const ms = ab.semaforo?.motivos || [];
  const de = nivel => ms.filter(m => m.nivel === nivel).map(m => m.norma ? `${m.texto} (${m.norma})` : m.texto);
  return (de('vermelho').length ? de('vermelho') : de('amarelo')).join(' ');
}

const cabecalho = (cfg, titulo) => `
  <table class="doc-cab"><tr>
    <td class="doc-logo">${cfg.logos?.brasao ? `<img src="${esc(cfg.logos.brasao)}" alt="">` : ''}</td>
    <td class="doc-orgao">ESTADO DO RIO GRANDE DO SUL<br>SECRETARIA DE SEGURANÇA PÚBLICA<br>BRIGADA MILITAR<br>COMANDO AMBIENTAL DA BRIGADA MILITAR</td>
    <td class="doc-logo">${cfg.logos?.comando ? `<img src="${esc(cfg.logos.comando)}" alt="">` : ''}</td>
  </tr></table>
  <div class="doc-titulo">${titulo}</div>`;

const campo = (rot, val, cls = '') => `<td class="${cls}"><span class="doc-rot">${rot}</span> ${esc(val)}</td>`;

function termoApreensao(ab, p, cfg) {
  const a = ab.apreensao, f = a.fiel || {}, ag = cfg.agente || {};
  const itens = a.itens || [];
  const linhas = [...itens.map(i => `<tr class="linha-item"><td>${esc(i.descricao)}</td><td class="doc-qtd">${esc(num(i.quantidade))} ${esc(i.unidade)}</td></tr>`),
    ...Array.from({ length: Math.max(0, 15 - itens.length) }, () => '<tr class="linha-item"><td>&nbsp;</td><td></td></tr>')].join('');
  return `<div class="doc">
    ${cabecalho(cfg, 'TERMO DE APREENSÃO E FIEL DEPOSITÁRIO')}
    <div class="doc-faixa">APREENSÃO</div>
    <p class="doc-texto">Em decorrência da lavratura do ${marca(a.docTipo === 'BO/TC-COP')}BO/TC-COP / ${marca(a.docTipo === 'BA')}BA nº <b>${esc(a.docNumero) || linha(15)}</b>,
      que consta como responsável pelos fatos constatados o(a) Sr(a) <b>${esc(nomeProprio(p.nome))}</b>${fmtCpf(p) ? `, CPF <b>${esc(fmtCpf(p))}</b>` : ''},
      fica(m) apreendido(s) o(s) animal(is), produto(s), petrecho(s) e/ou material(is) abaixo descrito(s):</p>
    <table class="doc-linhas">${linhas}</table>
    ${bensUsados(ab, p)}
    <table class="doc-grade"><tr><td class="doc-assin">Assinatura do responsável cujos bens / animais foram apreendidos:</td></tr></table>
    <div class="doc-faixa">FIEL DEPOSITÁRIO</div>
    <p class="doc-texto doc-negrito">Nomeio como FIEL DEPOSITÁRIO dos animais/produtos/bens aqui apreendidos, a pessoa abaixo qualificada, que desde já, fica ciente de que NÃO PODERÁ vender, usufruir, e/ou emprestar os mesmos, devendo apresentá-los quando solicitado pelo depositante, nas mesmas condições e quantidades que recebeu, conforme Art. 640 e 652 do Código Civil vigente.</p>
    <table class="doc-grade">
      <tr>${campo('Nome do(a) Fiel Depositário(a):', f.nome)}</tr></table>
    <table class="doc-grade"><tr>${campo('RG:', f.rg)}${campo('CPF:', f.cpf)}${campo('Telefone:', f.telefone)}</tr></table>
    <table class="doc-grade"><tr>${campo('Endereço:', f.endereco, 'doc-largo')}${campo('Município/UF:', f.municipioUf)}</tr></table>
    <table class="doc-grade"><tr><td class="doc-assin">Assinatura do Fiel Depositário</td></tr></table>
    <div class="doc-faixa">DADOS DO AGENTE APREENSOR</div>
    <table class="doc-grade"><tr>${campo('Nome:', ag.nome, 'doc-largo')}${campo('Id Func.:', ag.idFunc)}</tr>
      <tr><td class="doc-assin"><span class="doc-rot">Assinatura:</span></td>${campo('Fração:', ag.fracao)}</tr></table>
    <table class="doc-grade"><tr><td><b>Destinação do material apreendido quando não for nomeado Fiel Depositário:</b><br>
      ${DESTINOS.map(d => `${marca(a.destinacao === d)} ${d}`).join('&nbsp;&nbsp;')}</td></tr></table>
    <div class="doc-vias">1ª via – Processo | 2ª via – Autuado | 3ª via – Depósito</div>
  </div>`;
}

// Embarcação e veículo usados (cadastro da pessoa), quando informados na abordagem.
function bensUsados(ab, p) {
  const e = (p.embarcacoes || []).find(x => x.id === ab.embarcacaoId), v = (p.veiculos || []).find(x => x.id === ab.veiculoId);
  const ts = [e && `Embarcação: ${[e.nome, e.inscricao && `inscrição ${e.inscricao}`, e.rgp && `RGP ${e.rgp}`, e.comprimentoM && `${num(e.comprimentoM)} m`, e.propulsao].filter(Boolean).join(', ')}`,
    v && `Veículo: ${[v.placa, v.modelo, v.cor, v.tipo].filter(Boolean).join(', ')}`].filter(Boolean);
  return ts.length ? `<p class="doc-texto">${ts.map(esc).join('<br>')}</p>` : '';
}

// Abertura fixa do motivo da notificação.
const NOTIF_ABERTURA = 'Tendo em vista os princípios da precaução e da prevenção (artigo 225 da CF/88), fica notificado(a) pelo seguinte motivo:';
function notificacao(ab, p, cfg) {
  const n = ab.notificacao || {}, ag = cfg.agente || {};
  const coord = v => ab.gps ? num(v.toFixed(5)) : '';
  return `<div class="doc">
    ${cabecalho(cfg, 'NOTIFICAÇÃO AMBIENTAL')}
    <table class="doc-grade"><tr>${campo('Data:', dataBr(ab.data))}${campo('Hora:', ab.data.slice(11, 16))}</tr></table>
    <table class="doc-grade"><tr>${campo('Nome ou razão social do(a) notificado(a):', nomeProprio(p.nome))}</tr></table>
    <table class="doc-grade"><tr>${campo('CPF / CNPJ:', fmtCpf(p))}${campo('RG:', p.rg)}${campo('Telefone:', p.telefone)}</tr></table>
    <table class="doc-grade"><tr>${campo('Endereço:', p.endereco)}</tr></table>
    <table class="doc-grade"><tr>${campo('Bairro:', p.bairro)}${campo('Município:', p.municipio)}</tr></table>
    <table class="doc-grade"><tr><td class="doc-motivo"><b>${NOTIF_ABERTURA}</b><div>${esc(n.motivo).replace(/\n/g, '<br>')}</div></td></tr></table>
    <table class="doc-grade"><tr><td><b>Local onde foi lavrada a notificação</b> ${esc(ab.local)}<br>
      <span class="doc-rot">Coordenadas geográficas:</span> <b>Latitude:</b> ${coord(ab.gps?.lat)}&nbsp;&nbsp;&nbsp; <b>Longitude:</b> ${coord(ab.gps?.lon)}<br>
      <span class="doc-rot">DATUM:</span> ${ab.gps ? 'WGS 84' : ''}</td></tr></table>
    <div class="doc-aviso">O NÃO ATENDIMENTO DO PRESENTE PODERÁ CONSTITUIR<br>CRIME DE DESOBEDIÊNCIA CONFORME ARTIGO 330 DO CÓDIGO PENAL</div>
    <table class="doc-grade"><tr><td><b>RECEBI A 2ª VIA DO PRESENTE, ESTANDO NOTIFICADO SOBRE O FATO E CIENTE DOS PRAZOS ESTIPULADOS.</b><br>
      EM _____/ _____/ ______<br>Nome do preposto: ${linha(45)}, CPF ${linha(20)}<br>
      Assinatura do Notificado/ Preposto (&nbsp;&nbsp;&nbsp;): ${linha(50)}</td></tr></table>
    <table class="doc-grade"><tr>${campo('Endereço de comparecimento e apresentação dos documentos solicitados:', n.comparecimento)}</tr></table>
    <div class="doc-faixa">DADOS DO POLICIAL MILITAR RESPONSÁVEL PELA NOTIFICAÇÃO</div>
    <table class="doc-grade"><tr>${campo('Nome:', ag.nome, 'doc-largo')}${campo('Id Func.:', ag.idFunc)}</tr>
      <tr><td class="doc-assin" colspan="2"><span class="doc-rot">Assinatura:</span></td></tr></table>
    <div class="doc-vias">1ª via – Processo | 2ª via – Notificado</div>
  </div>`;
}

// Abordagem com vários envolvidos: local, data e GPS uma vez; cada envolvido com pessoa, ponto, petrechos, pescado e providências.
const PESSOAIS = ['pescadorId', 'identificadoPor', 'cpfInformado', 'categoria', 'embarcacao', 'comprimentoEmbM', 'embarcacaoId', 'veiculoId', 'localTipo',
  'petrechos', 'pescado', 'apreensao', 'notificacao', 'providencias', 'semaforo'];
// Abordagens gravadas antes (uma pessoa só) viram uma com um envolvido. A providência única vira lista.
function normalizarAb(a) {
  if (a.envolvidos) return a;
  const e = { id: a.id + '-1' }, n = {};
  for (const [k, v] of Object.entries(a)) if (PESSOAIS.includes(k)) e[k] = v; else if (k !== 'providencia' && k !== 'documento') n[k] = v;
  e.providencias ||= a.providencia ? [{ tipo: a.providencia, numero: a.documento || '' }] : [];
  n.envolvidos = [e];
  return n;
}

// O que falta para o processo administrativo. resolvidas: chaves marcadas como resolvidas pela equipe.
const PEDE_NUMERO = new Set(['BA', 'BO/TC', 'BO/COP', 'Apreensão', 'Notificação', 'Auto de infração']);
const DOCUMENTOS = ['BA', 'BO/TC', 'BO/COP', 'Auto de infração'];
function pendenciasDe(a, pessoa) {
  const out = [], feitas = new Set(a.resolvidas || []);
  const add = (e, k, texto, resolvivel = false) => { const chave = `${e.id}:${k}`; if (!feitas.has(chave)) out.push({ chave, envolvido: e.id, texto, resolvivel }); };
  for (const e of a.envolvidos || []) {
    const p = pessoa(e.pescadorId), quem = p ? nomeProprio(p.nome) : 'Envolvido sem pessoa';
    const provs = e.providencias || [];
    if (!p) add(e, 'pessoa', `${quem}: identificar a pessoa.`);
    for (const pr of provs) if (PEDE_NUMERO.has(pr.tipo) && !String(pr.numero || '').trim()) add(e, `num:${pr.tipo}`, `${quem}: falta o número (${pr.tipo}).`);
    if (e.semaforo?.cor === 'vermelho' && !provs.some(pr => DOCUMENTOS.includes(pr.tipo)))
      add(e, 'sem-documento', `${quem}: irregular sem BA, BO ou auto registrado.`, true);
    if (e.apreensao) {
      if (!(e.apreensao.itens || []).length) add(e, 'ap-itens', `${quem}: apreensão sem itens no termo.`);
      if (!e.apreensao.fiel?.nome && !e.apreensao.destinacao) add(e, 'ap-destino', `${quem}: apreensão sem fiel depositário nem destinação.`);
    }
    if (p && (e.apreensao || e.notificacao || provs.some(pr => DOCUMENTOS.includes(pr.tipo))) && !(p.rg && p.endereco && p.municipio))
      add(e, 'qualificacao', `${quem}: qualificação incompleta (RG, endereço, município).`);
    if (p && e.categoria !== 'Amador' && !(p.consultas || []).some(c => c.data.slice(0, 10) <= a.data.slice(0, 10) && c.data.slice(0, 10) >= diaMenos(a.data, 30)))
      add(e, 'consulta', `${quem}: sem consulta ao PesqBrasil nos 30 dias da abordagem.`, true);
    if (e.notificacao) add(e, 'comparecimento', `${quem}: acompanhar o comparecimento da notificação.`, true);
  }
  return out;
}
const diaMenos = (iso, n) => { const d = new Date(iso.slice(0, 10) + 'T12:00'); d.setDate(d.getDate() - n); return d.toISOString().slice(0, 10); };

// Lembrete na tela inicial: os dados só existem no aparelho. Sem dados, não há o que guardar.
function lembreteBackup(ultimo, hoje, temDados) {
  if (!temDados) return null;
  if (!ultimo) return 'Nenhum backup feito neste aparelho. Faça um backup.';
  const dias = Math.round((Date.parse(hoje.slice(0, 10)) - Date.parse(ultimo.slice(0, 10))) / 864e5);
  return dias > 7 ? `O último backup tem ${dias} dias. Faça um backup.` : null;
}

globalThis.Docs = { lembreteBackup, NOTIF_ABERTURA, itensDaAbordagem, termoApreensao, notificacao, motivoSugerido, normalizarAb, pendenciasDe, PESSOAIS, DESTINOS };
})();
