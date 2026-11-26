# CIA EXPERIENCE

**Centro de Inteligência Assistencial · Solar Cuidados**
*Informação que organiza. Inteligência que movimenta.*

Plataforma web da Intercorrência. Primeiro módulo: **Coletas de Urina**: registro por texto livre
(Bloco de Anotação Inteligente), agenda, alertas, mapa operacional, indicadores, anexos,
importação da planilha atual e exportação para Excel.

> 📌 Este guia foi escrito para quem **nunca** usou GitHub, Supabase ou terminal.
> Siga na ordem. Cada passo diz **onde clicar** e **o que copiar**.
> Você **não precisa digitar código**.

---

## Sumário

0. [O que você vai precisar](#0-o-que-você-vai-precisar)
1. [Criar conta no GitHub](#1-criar-conta-no-github)
2. [Criar o repositório e enviar o projeto](#2-criar-o-repositório)
3. [Como abrir e navegar no projeto](#3-como-abrir-o-projeto)
4. [Criar o projeto no Supabase](#4-configurar-o-supabase)
5. [Criar as tabelas](#5-criar-as-tabelas)
6. [Executar os scripts SQL](#6-executar-os-scripts-sql-passo-a-passo)
7. [Configurar a autenticação (login e e-mails)](#7-configurar-a-autenticação)
8. [Configurar o primeiro administrador](#8-configurar-o-primeiro-administrador)
9. [Configurar o armazenamento de anexos](#9-configurar-o-armazenamento)
10. [Configurar as variáveis de ambiente](#10-configurar-as-variáveis-de-ambiente)
11. [Configurar o GitHub Actions](#11-configurar-o-github-actions)
12. [Publicar](#12-publicar)
13. [Atualizar o sistema](#13-atualizar-o-sistema)
14. [Corrigir erros comuns](#14-corrigir-erros-comuns)
15. [Fazer backup](#15-fazer-backup)
16. [Importar a planilha atual](#16-importar-a-planilha-atual)
17. [Limites dos planos gratuitos](#17-limites-dos-planos-gratuitos)
18. [Estrutura do projeto](#18-estrutura-do-projeto)

---

## 0. O que você vai precisar

- Um computador com navegador (Chrome, Edge ou Firefox).
- Seu e-mail profissional.
- Cerca de **1 hora** na primeira vez.
- **Custo: zero.** Tudo usa planos gratuitos (veja os limites na [seção 17](#17-limites-dos-planos-gratuitos)).

Você vai criar **duas contas**:

| Serviço | Para que serve |
|---|---|
| **GitHub** | Guarda o código e publica o site (GitHub Pages). |
| **Supabase** | Banco de dados, login, arquivos anexos. **É onde ficam os dados dos pacientes.** |

---

## 1. Criar conta no GitHub

1. Acesse **https://github.com/signup**.
2. Informe e-mail, crie uma senha forte e um nome de usuário (ex.: `solar-cia`).
3. Confirme o código que chega no seu e-mail.
4. **Recomendado:** ative a verificação em duas etapas em
   **foto de perfil (canto superior direito) → Settings → Password and authentication → Enable two-factor authentication**.

> Se você já tem conta no GitHub, pule para o passo 2.

## 2. Criar o repositório

O **repositório** é a pasta do projeto no GitHub.

1. Entre no GitHub e clique no **+** (canto superior direito) → **New repository**.
2. **Repository name:** `cia-experience` (pode ser outro nome; ele aparecerá no endereço do site).
3. Marque **Public**.
   - ⚠️ O GitHub Pages gratuito só publica repositórios **públicos**.
   - Isso é **seguro** neste projeto: o código **não contém dados de pacientes nem senhas**. Os dados
     ficam no Supabase, protegidos por login e por regras no banco.
4. **Não** marque "Add a README" (o projeto já tem um).
5. Clique em **Create repository**.

O código deste projeto é enviado para esse repositório pelo assistente que o desenvolveu.
Se precisar enviar manualmente, na página do repositório vazio use **uploading an existing file**
e arraste todos os arquivos (menos a pasta `node_modules`, se existir).

## 3. Como abrir o projeto

Você não precisa instalar nada. No GitHub, clique no nome de qualquer pasta/arquivo para ver o conteúdo.
Para editar um arquivo pelo navegador: abra o arquivo → ícone de **lápis** ✏️ → edite → **Commit changes**.

Arquivos que você vai usar:

- `supabase/migrations/` → scripts do banco (passos 5 e 6).
- `README.md` → este guia.
- `docs/` → segurança, arquitetura e análise da planilha.

---

## 4. Configurar o Supabase

1. Acesse **https://supabase.com** → **Start your project** → entre com sua conta do GitHub
   (ou e-mail).
2. Clique em **New project**.
3. Preencha:
   - **Name:** `cia-experience`
   - **Database Password:** clique em **Generate a password** e **guarde em local seguro**
     (gerenciador de senhas). Ela **não** é usada no site, mas é necessária para restaurar/administrar.
   - **Region:** **South America (São Paulo)** — mantém os dados no Brasil (LGPD).
   - **Plan:** Free.
4. Clique em **Create new project** e aguarde 1 a 2 minutos.

> Este projeto deve ser **separado** de qualquer outro sistema (ex.: Gestão de Feedbacks).
> O plano gratuito permite 2 projetos ativos.

## 5. Criar as tabelas

As tabelas, regras de segurança, alertas e funções já estão prontas em 3 arquivos:

| Ordem | Arquivo | O que cria |
|---|---|---|
| 1º | `supabase/migrations/001_nucleo_plataforma.sql` | usuários, perfis, setores, módulos, configurações, notificações, auditoria |
| 2º | `supabase/migrations/002_modulo_coletas_urina.sql` | solicitações, reagendamentos, anexos, exportações, importações, alertas |
| 3º | `supabase/migrations/003_armazenamento_anexos.sql` | pasta privada de anexos e suas permissões |
| 4º | `supabase/migrations/004_prioridades_eletiva_urgente.sql` | prioridades somente ELETIVA e URGENTE |

## 6. Executar os scripts SQL (passo a passo)

Repita para **cada arquivo, na ordem 001 → 002 → 003 → 004**:

1. No GitHub, abra o arquivo (ex.: `supabase/migrations/001_nucleo_plataforma.sql`).
2. Clique no botão **Copy raw file** (ícone de duas folhas, à direita, acima do código).
3. No Supabase, menu da esquerda → **SQL Editor** → **+ New query** (ou "New snippet").
4. Cole (**Ctrl+V**) e clique em **Run** (ou Ctrl+Enter).
5. Deve aparecer **"Success. No rows returned"**.
   - Se aparecer um aviso sobre "destructive operations", clique em **Run this query** (os scripts só
     removem regras antigas para recriá-las; não apagam dados).

✅ Os scripts podem ser executados de novo sem perder dados (são "idempotentes").

Para conferir: menu **Table Editor** → devem aparecer tabelas como `profiles`,
`urine_collection_requests`, `audit_logs`, etc.

## 7. Configurar a autenticação

### 7.1 URL do site (para os links de e-mail funcionarem)

Primeiro descubra o endereço do seu site: `https://SEU-USUARIO.github.io/cia-experience/`
(troque `SEU-USUARIO` pelo seu usuário do GitHub e `cia-experience` pelo nome do repositório).

No Supabase: **Authentication → URL Configuration**:

- **Site URL:** cole o endereço do site (com a barra `/` no final).
- **Redirect URLs → Add URL:** cole o mesmo endereço **e também** `http://localhost:5173/`
  (este último só é usado se um dia você rodar o sistema no computador).
- Clique em **Save**.

### 7.2 Cadastro e confirmação de e-mail

**Authentication → Sign In / Providers → Email** (o nome do menu pode variar levemente):

- **Enable Email provider:** ligado.
- **Allow new users to sign up:** **ligado** (as pessoas criam a própria conta; o acesso só é liberado após sua aprovação).
- **Confirm email:** **ligado**.
- **Secure password change / Secure email change:** ligados.
- **Minimum password length:** `10`.
- **Password requirements:** *Lowercase, uppercase letters, digits and symbols*.
- **Save**.

### 7.3 E-mails (limite importante)

O Supabase gratuito envia poucos e-mails por hora pelo servidor padrão (pensado para testes).
Para a equipe toda se cadastrar no mesmo dia, cadastre as pessoas aos poucos **ou** configure um
SMTP gratuito (ex.: Resend, Brevo) em **Authentication → Emails → SMTP Settings**.

Opcional: traduza os e-mails em **Authentication → Emails → Templates** (ex.: "Confirme seu cadastro no CIA EXPERIENCE").
Mantenha o link `{{ .ConfirmationURL }}` no texto.

### 7.4 Como funciona o cadastro

1. A pessoa clica em **Criar conta** e preenche nome, setor, e-mail, telefone e senha.
2. Recebe o e-mail de confirmação e clica no link.
3. Fica em **"Aguardando aprovação"**. O administrador recebe uma notificação no sino 🔔 do sistema.
4. O administrador abre **Usuários** → **Aprovar** (a pessoa recebe automaticamente o perfil **Técnica**) e
   ajusta para **Coordenação** se necessário.

> 🔐 Nada que a pessoa digita no cadastro concede privilégios. Perfis ficam numa tabela que só o
> administrador altera, e o banco recusa qualquer tentativa de "se promover".

## 8. Configurar o primeiro administrador

Feito **uma única vez**, depois dos passos 1 a 12 (o site precisa estar no ar):

1. Abra o site e clique em **Criar conta**. Cadastre-se com o e-mail administrativo (ex.: o seu e-mail
   da Solar).
2. Confirme o e-mail pelo link recebido. Você verá a tela "Aguardando aprovação".
3. No Supabase: **SQL Editor → New query**, cole a linha abaixo **trocando pelo seu e-mail** e clique em **Run**:

   ```sql
   select public.bootstrap_first_admin('seu.email@solarcuidados.com.br');
   ```

4. Deve aparecer `OK: administrador configurado.`
5. Volte ao site e clique em **Verificar novamente**. Pronto: você é **Administrador master**.

> Essa função **só funciona pelo SQL Editor do Supabase** (o site não consegue chamá-la). Assim
> nenhum privilégio administrativo fica exposto no código público.

Depois, em **Configurações → Regras da operação**, preencha o **E-mail para aviso de novos cadastros**.

## 9. Configurar o armazenamento

O script `003` já criou a pasta (bucket) **privada** `urine-attachments`, com limite de **10 MB** por arquivo e
somente **PDF, JPG, PNG e WEBP**. Para conferir: **Storage** → deve aparecer `urine-attachments` com
o selo **Private**.

⚠️ **Nunca** marque esse bucket como *Public*. Os anexos são abertos por links temporários de 60 segundos.

## 10. Configurar as variáveis de ambiente

O site precisa saber **qual** Supabase usar. São dois valores **públicos**:

1. No Supabase: botão **Connect** (topo) ou **Project Settings → API Keys / Data API**.
2. Copie:
   - **Project URL** → algo como `https://abcdefghijk.supabase.co`
   - **Publishable key** (começa com `sb_publishable_…`) — ou, em projetos antigos, a chave **anon public**.
3. ⚠️ **NUNCA** copie a chave **secret** / **service_role**. Ela dá acesso total ao banco.
   O processo de publicação **bloqueia** automaticamente se ela for usada por engano.

No GitHub, no seu repositório:

1. **Settings** (aba do repositório) → **Secrets and variables** → **Actions** → aba **Variables** → **New repository variable**.
2. Crie a variável:
   - **Name:** `VITE_SUPABASE_URL`
   - **Value:** a Project URL
   - **Add variable**
3. Crie a segunda:
   - **Name:** `VITE_SUPABASE_ANON_KEY`
   - **Value:** a Publishable/anon key
   - **Add variable**

> Por que "Variables" e não "Secrets"? Porque esses dois valores são públicos por natureza (ficam
> no navegador de quem acessa). A proteção real dos dados é feita pelas regras do banco (RLS).

## 11. Configurar o GitHub Actions

O arquivo `.github/workflows/deploy.yml` já faz tudo: instala, **testa**, verifica vulnerabilidades,
verifica se nenhuma chave secreta foi usada, compila e publica.

1. No repositório: **Settings → Pages**.
2. Em **Build and deployment → Source**, escolha **GitHub Actions**.
3. Pronto (não precisa clicar em mais nada nesta tela).

## 12. Publicar

1. Aba **Actions** do repositório → à esquerda, **Publicar no GitHub Pages** → botão **Run workflow** → **Run workflow**.
2. Aguarde a bolinha ficar **verde** ✅ (2 a 4 minutos).
3. Clique na execução → no quadro **deploy** aparece o link do site
   (`https://SEU-USUARIO.github.io/cia-experience/`).
4. Volte ao [passo 8](#8-configurar-o-primeiro-administrador) para se tornar administrador.

A partir daí, **toda alteração enviada para a branch `main` publica o site sozinha**.

## 13. Atualizar o sistema

- **Alterações no site:** quando novas versões forem enviadas para a branch `main`, a publicação é automática (acompanhe na aba **Actions**).
- **Alterações no banco:** se uma atualização trouxer um novo arquivo em `supabase/migrations/`
  (ex.: `004_…sql`), execute-o no **SQL Editor** como no passo 6. Os arquivos antigos podem ser
  executados de novo sem problemas.
- **Cores oficiais da Solar:** edite `src/styles/tokens.css` (os valores `--solar-wine-…`, `--solar-purple-…`, `--solar-pink-…`).
- **Regras da operação** (limite do alerta de volume, horas sem atualização, distância de agrupamento,
  edição pelas técnicas): no próprio sistema, **Configurações → Regras da operação** (administrador).

## 14. Corrigir erros comuns

| O que aparece | Causa provável | Como resolver |
|---|---|---|
| Tela **"Configuração pendente"** | Variáveis do passo 10 ausentes ou com erro | Confira os nomes exatos `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY` e rode o workflow de novo (passo 12). |
| Tela **"Chave secreta detectada"** | Você colou a chave secret/service_role | Troque pela publishable/anon. No Supabase, **gere uma nova chave secreta** (a antiga deve ser considerada exposta). |
| Página em branco / 404 no endereço do site | Pages não configurado | Passo 11 (Source = GitHub Actions) e aguarde o ✅ verde. |
| Workflow vermelho ❌ em "Auditoria de dependências" | Vulnerabilidade nova em alguma biblioteca | Aceite o *pull request* do Dependabot que aparecer na aba **Pull requests**, ou peça ajuda. |
| "Não foi possível carregar seu perfil" | Scripts SQL não executados | Execute 001, 002 e 003 (passo 6). |
| Link do e-mail abre o site mas não entra | O link foi aberto em outro navegador/celular | Normal por segurança: o e-mail **já foi confirmado**; basta fazer login. |
| "E-mail ou senha incorretos" após cadastro | E-mail não confirmado | Procure o e-mail de confirmação (inclusive no spam). |
| Não chega e-mail | Limite de envios do plano gratuito | Aguarde 1 hora ou configure SMTP (passo 7.3). |
| "Você não tem permissão para esta ação" | Perfil sem permissão | Admin: **Usuários** → ajustar perfil. Técnicas editam só o que criaram (ou ative em Configurações). |
| Site lento/"sem conexão" após dias sem uso | Supabase pausou o projeto (7 dias sem acesso) | Painel do Supabase → projeto → **Restore project**. Os dados não se perdem. |
| Mapa cinza sem ruas | Rede bloqueando o OpenStreetMap | Os pontos continuam corretos; teste em outra rede. |

## 15. Fazer backup

O plano gratuito do Supabase **não oferece backups que você possa baixar**. Faça assim:

**Semanal (5 minutos):** no sistema, **Relatórios → Layout "Ampliada" → marcar "Incluir arquivados" → Excel**.
Guarde o arquivo em local **protegido** (pasta restrita da empresa), pois contém dados de saúde. Apague versões antigas desnecessárias.

**Completo (opcional, mensal):** no Supabase, **Table Editor** → abra cada tabela → **Export → CSV**
(principais: `urine_collection_requests`, `urine_collection_reschedules`, `urine_collection_attachments`,
`profiles`, `user_roles`, `audit_logs`). Os arquivos anexos ficam em **Storage → urine-attachments**.

**Nunca** coloque backups ou planilhas no GitHub (o `.gitignore` já bloqueia `.xlsx` e `.csv`).

## 16a. Colar o print do sistema + mensagem do WhatsApp

Em **Nova coleta → Bloco inteligente**, a técnica pode:
1. colar a mensagem do WhatsApp no bloco;
2. colar o **print** do sistema de origem com **Ctrl+V** no mesmo bloco (ou arrastar a imagem, ou tocar em **Adicionar imagem** — no celular abre a câmera/galeria);
3. conferir o **texto lido da imagem** (pode corrigir) e clicar em **Interpretar**.

A mensagem digitada tem prioridade sobre o print (ex.: o familiar e o telefone que confirmaram vêm da mensagem). Contradições — como "sem material" e "Material na casa: SIM" no mesmo texto — viram pergunta, nunca uma escolha automática.
A imagem é lida **no próprio navegador** e não é enviada a nenhum serviço. Ela só fica guardada se a técnica marcar **"Anexar a(s) imagem(ns) à solicitação"**.

## 16. Importar a planilha atual

1. Entre como administrador → menu **Importar planilha**.
2. Clique em **Escolher arquivo .xlsx** e selecione *"Quadro básico monitoramento atend. intercorrência (7).xlsx"*.
3. O sistema lê **somente** a aba **"Coleta de urina"** (no seu computador; somente os registros dessa aba, após sua confirmação, são gravados no banco).
4. Revise: mapeamento das colunas, campos vazios, possíveis duplicidades e pendências de cada linha.
   Desmarque linhas que não devem entrar.
5. Clique em **Importar** e confirme. Ao final aparece o relatório de sucesso e erros.

Regras aplicadas (detalhes em `docs/ANALISE-PLANILHA.md`):
- Padroniza `cva `→`CVA`, `NÂO`→`NÃO`, `INTERCORRENCIA `→`INTERCORRÊNCIA`, `ELEETIVO`→`TICKET ELETIVO`.
- **Realizada** somente quando há DATA DA COLETA. Valor vazio = **NÃO INFORMADO** (nada inventado).
- Datas inválidas ficam vazias; o valor original é preservado no histórico do registro.
- Importar o mesmo arquivo de novo **não duplica**.

## 17. Limites dos planos gratuitos

Valores de referência (nov/2026). **Confira sempre** em https://supabase.com/pricing e https://docs.github.com/pt/pages.

| Recurso | Limite aproximado | Suficiente? |
|---|---|---|
| Banco Supabase | 500 MB | Sim para dezenas de milhares de coletas (cada uma ≈ 2–4 KB). |
| Arquivos (anexos) | 1 GB | ≈ 300–1.000 anexos, dependendo do tamanho. Prefira PDFs leves. |
| Usuários ativos/mês | 50.000 | Sim. |
| Pausa por inatividade | 7 dias sem acesso | Com uso diário não acontece. |
| E-mails de autenticação | poucos por hora | Use SMTP próprio se necessário (7.3). |
| GitHub Pages | repositório público; ~100 GB de tráfego/mês | Sim. |

⚠️ **O plano gratuito não tem garantia de disponibilidade nem backup automático baixável.**
Para operação crítica de longo prazo, avalie o plano Pro do Supabase (backups diários) quando houver orçamento.

## 18. Estrutura do projeto

```
src/
  core/                      ← plataforma (compartilhada por todos os módulos)
    auth/                    login, cadastro, recuperação, sessão
    components/              ícones, formulários, alertas, gráficos, modais
    layout/AppShell.tsx      cabeçalho + menu lateral
    pages/                   usuários, configurações, auditoria, notificações
    modules.ts               contrato para criar novos módulos
  modules/
    urine-collection/        ← MÓDULO COLETAS DE URINA
      domain/                regras: interpretador de texto, endereços, perguntas, importação, exportação, indicadores
      geo/                   base local de bairros do RJ, agrupamento, provedor de localização
      services/              acesso ao Supabase
      pages/                 telas do módulo
    index.ts                 lista de módulos instalados
  styles/tokens.css          ← CORES da identidade Solar
supabase/
  migrations/                scripts SQL (rodar em ordem)
  functions/notify-new-signup  (opcional) e-mail ao admin em novo cadastro
docs/                        arquitetura, segurança (LGPD/OWASP), análise da planilha
tests/                       testes automáticos do interpretador
.github/workflows/deploy.yml publicação automática
```

Para desenvolvedores: `npm ci`, crie `.env.local` a partir de `.env.example`, `npm run dev`, `npm test`, `npm run build`.

### Novos módulos (Remoções, Rotas, Materiais…)

Veja `docs/ARQUITETURA.md`. Resumo: tabelas com prefixo próprio, nova pasta em `src/modules/`, registro em
`src/modules/index.ts` e uma linha na tabela `modules` (já pré-cadastrada como inativa). Nada do
módulo de Coletas precisa ser alterado.
