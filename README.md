# RótuloFácil

Aplicativo web mobile-first em português para elaboração de rotulagem nutricional de alimentos embalados no padrão **ANVISA** (**RDC nº 429/2020**, **IN nº 75/2020**, **RDC nº 727/2022**, **Lei nº 10.674/2003** e **RDC nº 136/2017**).

## O que o aplicativo faz

- **Cadastro de receitas e busca oficial TACO:** pesquisa ingredientes diretamente nos CSVs da **Tabela TACO (4ª edição / UNICAMP)** com busca fuzzy sem acento (`GET /api/taco/search`), seleção assistida por IA limitada aos candidatos da TACO (`POST /api/taco/match`) ou cadastro manual por ficha técnica.
- **Cálculo nutricional conforme a IN 75/2020:** cálculo energético pelos fatores do Anexo XXII (`4/4/9 kcal/g`), tratamento de carboidratos disponíveis, conversão de produtos líquidos por densidade (`g/ml`), rendimento pronto (`readyWeightGrams`), critérios de quantidades não significativas (Anexo IV), arredondamento oficial (Anexo III) e `%VD` sobre o valor da porção já arredondado (Anexo II).
- **Lupa Frontal (Anexo XV, XVI e XVII):** detecção automática de `ALTO EM` (Açúcar Adicionado, Gordura Saturada, Sódio), avaliação das exceções do Anexo XVI, dimensionamento por área do painel principal (`panelArea`) e renderização em SVG puro (com suporte a arquivos oficiais em `public/lupa/`).
- **Alergênicos, Glúten, Lactose e Ingredientes:** lista fechada da RDC 727/2022 (`contém`, `derivados de` e `pode conter`), confirmação explícita obrigatória para declaração de glúten, indicação de `CONTÉM LACTOSE` e lista de ingredientes em ordem decrescente com suporte a `labelName`, água e aditivos (`função + nome`).
- **Exportação para gráfica:** PDF vetorial 1:1 no tamanho exato em milímetros (Helvetica, preto sobre branco, sem cabeçalho extra), folha A4 com múltiplas etiquetas e marcas de corte, SVG vetorial da tabela e da lupa e PNG em **600 DPI**.
- **Contas, criptografia e LGPD:** autenticação via Firebase Auth, verificação de e-mail e redefinição de senha via Brevo, isolamento por usuário no **Supabase (PostgreSQL com RLS forçado)**, criptografia **AES-256-GCM** das receitas no servidor e recursos LGPD para exportação dos dados (`GET /api/account/export`) e exclusão permanente da conta (`DELETE /api/account`).

> **Aviso Legal e Responsabilidade Técnica:**
> Os valores nutricionais são calculados a partir da Tabela TACO e dos dados informados pelo usuário. A responsabilidade legal pelo rótulo final é do fabricante; **o rótulo deve ser revisado e validado por nutricionista responsável técnico** (ou profissional legalmente habilitado) antes da impressão e comercialização do produto.

---

## Como rodar o projeto

1. **Instale as dependências:**
   ```bash
   npm install
   ```

2. **Configure as variáveis de ambiente:**
   Copie `.env.example` para `.env` (ou configure os Secrets no ambiente) e preencha todas as chaves.

3. **Banco de dados no Supabase:**
   A estrutura do schema `rotulo` (`rotulo.users`, `rotulo.recipes`, triggers e políticas RLS) é gerenciada diretamente por script SQL no Supabase. Não execute `drizzle-kit push`, `migrate` ou `generate`.

4. **Inicie o servidor de desenvolvimento (Express + Vite na porta 3000):**
   ```bash
   npm run dev
   ```

5. **Testes, verificação de tipos e build de produção:**
   ```bash
   npm run lint    # Verifica tipos TypeScript (tsc --noEmit)
   npm test        # Executa testes unitários (Vitest)
   npm run build   # Gera bundle de produção em dist/
   npm start       # Inicia o servidor em produção
   ```

---

## Variáveis de ambiente

| Variável | Descrição |
| --- | --- |
| `GEMINI_API_KEY` | Chave da API Gemini usada somente para escolher o `tacoId` dentre candidatos da TACO. |
| `APP_URL` | URL pública da aplicação usada nos links de e-mail do Brevo. |
| `BREVO_API_KEY` | Chave da API do Brevo para envio de confirmação de e-mail e redefinição de senha. |
| `BREVO_SENDER_EMAIL` | Endereço remetente verificado no Brevo. |
| `SUPABASE_DB_HOST` | Host da instância PostgreSQL do Supabase. |
| `SUPABASE_DB_PORT` | Porta do PostgreSQL do Supabase (padrão `5432`). |
| `SUPABASE_DB_USER` | Usuário restrito da aplicação no Supabase (`rotulofacil_app`, com RLS ativo). |
| `SUPABASE_DB_PASSWORD` | Senha do usuário `SUPABASE_DB_USER`. |
| `SUPABASE_DB_NAME` | Nome do banco de dados no Supabase (ex.: `postgres`). |
| `SUPABASE_DB_SSL_CA` | Certificado CA opcional em PEM para verificação estrita do certificado SSL do Supabase. |
| `DATA_ENCRYPTION_KEY` | Chave AES-256-GCM atual (32 bytes em base64 / 44 caracteres) usada para cifrar e decifrar as receitas. |
| `DATA_ENCRYPTION_KEY_VERSION` | Número da versão da chave atual (ex.: `1`). |
| `DATA_ENCRYPTION_KEY_PREVIOUS` | Chave da versão anterior (`versão - 1`) usada opcionalmente durante rotação de chaves. |

### Segurança, RLS e Criptografia (`DATA_ENCRYPTION_KEY`)

- **Isolamento por usuário (RLS):** o usuário configurado em `SUPABASE_DB_USER` **NÃO pode possuir** `rolsuper` nem `rolbypassrls`. Na inicialização do servidor, a aplicação verifica `pg_roles` e recusa iniciar caso o usuário ignore RLS. Todas as consultas de runtime rodam dentro de `withUserRls(uid, ...)` com `set_config('app.current_user_uid', uid, true)`.
- **ATENÇÃO CRÍTICA SOBRE A `DATA_ENCRYPTION_KEY`:** todo o conteúdo das receitas (nome, ingredientes, medidas, alergênicos, configurações) é salvo cifrado no banco (`payload_enc`) com AES-256-GCM e AAD amarrado ao `uid` e ao `id` da receita. **Se a `DATA_ENCRYPTION_KEY` for perdida ou apagada sem backup, todas as receitas criptografadas com ela tornam-se permanentemente irrecuperáveis.** Para rotacionar a chave sem perder dados, incremente `DATA_ENCRYPTION_KEY_VERSION`, mova a chave antiga para `DATA_ENCRYPTION_KEY_PREVIOUS` e defina a nova chave em `DATA_ENCRYPTION_KEY`.

---

## Como atualizar os CSVs da Tabela TACO

Os arquivos oficiais ficam na pasta `data/` na raiz do projeto e são carregados na inicialização do servidor (`src/server/taco.ts`):

- `data/taco.csv` — composição centesimal (TACO 4ª edição / UNICAMP).
- `data/taco_acidos_graxos.csv` — tabela de ácidos graxos (gorduras saturadas e trans), cruzada pelo número do alimento.

Para atualizar os dados:
1. Substitua `data/taco.csv` e/ou `data/taco_acidos_graxos.csv` mantendo a codificação UTF-8 e a estrutura original de colunas e marcadores (`Tr`, `NA`, `*`).
2. Reinicie o servidor (`npm run dev` ou `npm start`) para recarregar o índice de busca em memória (`fuse.js`).

---

## Deploy na Vercel

O projeto já inclui `vercel.json` e `api/index.ts` para servir o frontend estático (`dist/`) e executar o backend Express como função serverless (`/api/*`).

1. **Configure as variáveis de ambiente na Vercel (Project Settings → Environment Variables):**
   - `SUPABASE_DB_HOST`
   - `SUPABASE_DB_PORT` (use **`6543`** na Vercel, porta do pooler em modo transação do Supabase)
   - `SUPABASE_DB_USER`
   - `SUPABASE_DB_PASSWORD`
   - `SUPABASE_DB_NAME`
   - `DATA_ENCRYPTION_KEY`
   - `DATA_ENCRYPTION_KEY_VERSION`
   - `GEMINI_API_KEY`
   - `BREVO_API_KEY`
   - `BREVO_SENDER_EMAIL`
   - `APP_URL`
   - `FIREBASE_SERVICE_ACCOUNT` *(opcional)* — sem ela (ou `FIREBASE_SERVICE_ACCOUNT_BASE64`), os e-mails de confirmação de cadastro e redefinição de senha saem pelos modelos do próprio Firebase (**Authentication > Modelos**) em vez do Brevo, e a exclusão da conta no Firebase Authentication é feita diretamente pelo navegador.

2. **Autorize o domínio da Vercel no Firebase:**
   No console do Firebase, acesse **Authentication → Settings → Authorized domains** e adicione o domínio gerado pela Vercel (ex.: `seu-app.vercel.app`) e seu domínio próprio, caso utilize.

