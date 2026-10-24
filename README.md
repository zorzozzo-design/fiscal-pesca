# Fiscal Pesca

PWA offline para a fiscalização de pesca da PATRAM no litoral norte do RS. Consulta quem está licenciado na Bacia do Rio Tramandaí (IN MMA 17/2004) a partir das listas publicadas pelo Ministério da Pesca e Aquicultura.

Os dados ficam só no aparelho, criptografados com a senha (AES-GCM, chave PBKDF2). Nenhuma lista, backup ou dado de pescador entra neste repositório.

## Uso

1. Criar a senha.
2. **Dados → Lista de licenciados do MPA:** informar a temporada (ex.: `2026/2027`) e escolher o PDF baixado do site do MPA. Importe também as listas antigas: o app marca quem saiu da lista atual.
3. **Pescadores:** busca por nome (sem acento, aceita grafia de listas antigas), CPF completo, 6 dígitos ou RGP. Filtros: na lista atual, saiu da lista atual, mesmos dígitos de outra pessoa.
4. **Backup:** exportar no PC e importar no celular (ou o contrário). Os dados são mesclados.

## Como o app reconhece a mesma pessoa

As listas publicam só 6 dígitos do CPF (posições 4 a 9), e há pessoas diferentes com os mesmos dígitos. Por isso a mesma pessoa = mesmos dígitos + nome parecido (tolera erro de digitação como LUIZ/LUIS). Mesmos dígitos com nome diferente viram pessoas separadas e aparecem em "para revisar" na importação.

## Atualização anual da lista

Quando o MPA publicar a lista nova, importe o PDF com a temporada nova. A temporada mais recente de cada área passa a ser a "lista atual".

## Desenvolvimento

- `npm test` roda os testes do leitor de listas (fixtures fictícias em `test/fixtures`).
- Servir local: `python3 -m http.server` e abrir http://localhost:8000.
- Ao publicar mudanças, incremente `CACHE` em `sw.js`.
- `vendor/pdf.min.js` e `vendor/pdf.worker.min.js`: pdf.js 3.11.174, build legacy (licença Apache 2.0 em `vendor/pdfjs-LICENSE`).
