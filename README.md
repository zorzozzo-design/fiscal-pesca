# Fiscal Pesca

PWA offline para a fiscalização de pesca da PATRAM no litoral norte do RS. Consulta quem está licenciado na Bacia do Rio Tramandaí (IN MMA 17/2004) a partir das listas publicadas pelo Ministério da Pesca e Aquicultura.

Os dados ficam só no aparelho, criptografados com a senha (AES-GCM, chave PBKDF2). Nenhuma lista, backup ou dado de pescador entra neste repositório.

## Uso

1. Criar a senha.
2. **Dados → Lista de licenciados do MPA:** informar a temporada (ex.: `2026/2027`) e escolher o PDF baixado do site do MPA. Importe também as listas antigas: o app marca quem saiu da lista atual.
3. **Pescadores:** busca por nome (sem acento, aceita grafia de listas antigas), CPF completo, 6 dígitos ou RGP. Filtros: na lista atual, saiu da lista atual, mesmos dígitos de outra pessoa.
4. **Abordagens → Nova abordagem:** digitar o CPF do documento (ou o nome), escolher a pessoa e ver o semáforo da área:
   - **Pode pescar:** na lista atual, RGP ativo consultado há até 30 dias, CPF conferido, sem colisão de dígitos.
   - **Conferir:** falta consulta, consulta antiga ou em análise, CPF não conferido, ou outra pessoa com os mesmos dígitos.
   - **Irregular:** fora da lista da área (inclusive quem saiu dela) ou RGP suspenso, cancelado ou não encontrado.
   No mar e nas outras águas não há lista: o semáforo usa a consulta. O semáforo indica, não autua.
   Informe local na área, embarcação, categoria (profissional ou amador), petrechos com malha e pescado com peso e menor exemplar: o app aplica as 17 regras da IN 17/2004, IN 53/2005, IN 12/2012, IN 171/2008, IN 197/2008 (piracema), Lei RS 15.223/2018 e cota do amador, mostra a norma e o enquadramento de cada irregularidade e a multa mínima de referência pelo peso (Dec. 6.514/2008, arts. 35 e 37). A temporada do camarão se atualiza em Dados.
5. **Consulta ao PesqBrasil:** o botão copia o CPF e abre a consulta pública. Depois do resultado, selecione tudo na página, copie e cole no campo do app: ele preenche situação, município, data do 1º RGP, categoria, forma de atuação e locais de pesca, e recusa resultado de outro CPF.
6. **Apreensão e notificação** (na abordagem): marque "Houve apreensão" ou "Notificar a pessoa". Os petrechos e o pescado registrados viram itens do termo; dá para editar, nomear fiel depositário e escolher a destinação. "Imprimir" gera o termo de apreensão e a notificação no layout dos modelos do Comando Ambiental (no celular, salve como PDF). Antes, preencha em **Dados → Documentos** o nome, Id funcional e fração do agente, o endereço de comparecimento e carregue o brasão e o logo do Comando (as imagens ficam só no aparelho).
7. **Backup:** exportar no PC e importar no celular (ou o contrário). Os dados são mesclados, e as abordagens são religadas à pessoa reconhecida no outro aparelho.

## Como o app reconhece a mesma pessoa

As listas publicam só 6 dígitos do CPF (posições 4 a 9), e há pessoas diferentes com os mesmos dígitos. Por isso a mesma pessoa = mesmos dígitos + nome parecido (tolera erro de digitação como LUIZ/LUIS). Mesmos dígitos com nome diferente viram pessoas separadas e aparecem em "para revisar" na importação.

## Atualização anual da lista

Quando o MPA publicar a lista nova, importe o PDF com a temporada nova. A temporada mais recente de cada área passa a ser a "lista atual".

## Desenvolvimento

- `npm test` roda os testes do leitor de listas, do semáforo e do leitor da consulta (fixtures fictícias em `test/fixtures`).
- Servir local: `python3 -m http.server` e abrir http://localhost:8000.
- Ao publicar mudanças, incremente `CACHE` em `sw.js`.
- `vendor/pdf.min.js` e `vendor/pdf.worker.min.js`: pdf.js 3.11.174, build legacy (licença Apache 2.0 em `vendor/pdfjs-LICENSE`).
