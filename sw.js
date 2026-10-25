const CACHE = 'fpesca-v12';
const ARQUIVOS = ['./', 'index.html', 'app.js', 'lista.js', 'semaforo.js', 'normas.js', 'docs.js', 'municipios-rs.js', 'locais.js', 'vinculos.js', 'style.css', 'manifest.webmanifest',
  'vendor/pdf.min.js', 'vendor/pdf.worker.min.js', 'vendor/cytoscape.min.js', 'icons/icon.svg', 'icons/icon-192.png', 'icons/icon-512.png'];

// Instala a versão nova baixando tudo do servidor (cache:'reload' ignora a cópia antiga do navegador).
self.addEventListener('install', e => e.waitUntil(caches.open(CACHE)
  .then(c => c.addAll(ARQUIVOS.map(a => new Request(a, { cache: 'reload' })))).then(() => self.skipWaiting())));
self.addEventListener('activate', e => e.waitUntil(
  caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())));
// Cache primeiro: abre na hora, mesmo com sinal fraco. Atualização chega por uma versão nova deste arquivo (CACHE),
// e a página avisa para recarregar.
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET' || new URL(e.request.url).origin !== location.origin) return;
  e.respondWith(caches.match(e.request, { ignoreSearch: true }).then(c => c || fetch(e.request)));
});
