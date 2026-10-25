// Atualiza a versão do cache do service worker quando algum arquivo do app muda.
// Uso: node tools/versao.mjs (o teste test/sw.test.mjs falha enquanto isso não for feito).
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

export function hashDoApp(raiz = new URL('../', import.meta.url)) {
  const sw = readFileSync(new URL('sw.js', raiz), 'utf8');
  const arquivos = JSON.parse(sw.match(/const ARQUIVOS = (\[[^\]]+\])/)[1].replace(/'/g, '"').replace(/\s+/g, ' '));
  const h = createHash('sha256');
  for (const a of arquivos.filter(a => a !== './').sort()) h.update(a).update(readFileSync(new URL(a, raiz)));
  return h.digest('hex').slice(0, 12);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const url = new URL('../sw.js', import.meta.url);
  let sw = readFileSync(url, 'utf8');
  const novo = hashDoApp(), atual = sw.match(/\/\/ conteudo: (\w+)/)?.[1];
  if (novo === atual) { console.log('Versão já atualizada.'); process.exit(0); }
  const n = +sw.match(/fpesca-v(\d+)/)[1] + 1;
  sw = sw.replace(/fpesca-v\d+/, `fpesca-v${n}`).replace(/^\/\/ conteudo: \w+\n/m, '');
  writeFileSync(url, `// conteudo: ${novo}\n` + sw);
  console.log(`Cache fpesca-v${n} (conteúdo ${novo}).`);
}
