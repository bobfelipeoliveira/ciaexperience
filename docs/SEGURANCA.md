# Segurança e Privacidade — CIA EXPERIENCE (Módulo Coletas de Urina)

Revisão de segurança da versão 1.0 (nov/2026). Referências: OWASP Top 10 (2021), OWASP API Security Top 10 (2023),
CWE, CVSS v3.1, LGPD (Lei 13.709/2018, art. 6º, 11 e 46), NIST SP 800-63B, CIS Controls v8.

## 1. Resumo executivo

O sistema trata **dados pessoais sensíveis de saúde** (LGPD art. 5º, II). A arquitetura não tem servidor próprio: toda a
autorização é aplicada no PostgreSQL do Supabase por **Row Level Security (RLS)**, e o navegador usa apenas a chave pública.

**Controles verificados por teste automatizado em banco PostgreSQL (16 cenários):** perfil forjado via metadados do cadastro
fica pendente e sem papéis; técnica não se autoaprova, não chama funções administrativas, não arquiva, não edita registro de
terceiros, não importa e não exclui anexos de outra pessoa; usuário pendente e anônimo não leem dados; upload fora da pasta da
solicitação é recusado; regras de negócio (emergência exige justificativa, realizada exige data, cancelamento exige motivo,
data agendada só muda por reagendamento) são impostas no banco.

**Não há vulnerabilidade Crítica ou Alta conhecida.** Restam riscos **Médios/Baixos** ligados a limites do plano gratuito
e a controles ainda não implementados (MFA, CAPTCHA), listados abaixo com plano de correção.

## 2. Modelo de ameaças (STRIDE)

| Ameaça | Exemplo | Controle implementado |
|---|---|---|
| **S**poofing | login com credencial de terceiro; conta criada para obter acesso | Supabase Auth (bcrypt), confirmação de e-mail, **aprovação manual**, política de senha ≥10 com complexidade, logout por inatividade (60 min) |
| **T**ampering | alterar `created_by`, status, papel ou data agendada pela API | RLS + gatilhos: campos imutáveis, papéis só via função admin, *column grants* em `profiles`, reagendamento atômico com histórico |
| **R**epudiation | negar alteração/exclusão/exportação | `audit_logs` gravado por gatilho `SECURITY DEFINER`, sem política de escrita para clientes; login/logout, importação e exportação registrados |
| **I**nformation disclosure | ler dados de pacientes sem perfil; links de anexos | RLS por módulo/papel; bucket privado, URLs assinadas de 60 s; nenhum dado enviado a IA/geocodificador; CSV protegido contra fórmula |
| **D**enial of service | cadastro em massa; esgotar cota de e-mail | rate limit nativo do Supabase Auth; (pendente) CAPTCHA |
| **E**levation of privilege | técnica virar admin editando o próprio perfil | `user_metadata` ignorado para privilégios; `user_roles` sem escrita para clientes; funções admin verificam `is_admin()`; admin não remove o próprio acesso |

## 3. Mapeamento OWASP

| Categoria | Situação |
|---|---|
| A01 Broken Access Control / API1 BOLA / API5 BFLA | RLS em **todas** as tabelas expostas; funções `SECURITY DEFINER` com `search_path=''` e checagem de papel; `REVOKE` em funções internas |
| A02 Cryptographic Failures | TLS em todo o tráfego (Supabase/GitHub Pages); senhas com bcrypt (Supabase); dados no Brasil (sa-east-1) |
| A03 Injection (SQLi/XSS/CSV) | PostgREST parametrizado; React escapa saída; balões do mapa montados com `textContent`; CSP `script-src 'self'`; `csvSafe()` (CWE-1236) |
| A04 Insecure Design | regras de negócio no banco; reagendamento sem sobrescrita; status "Realizada" exige evidência |
| A05 Security Misconfiguration | bucket privado com MIME/tamanho restritos; *workflow* bloqueia chave `service_role`; `noindex`, `no-referrer` |
| A06 Vulnerable Components | versões fixadas, `npm audit --audit-level=high` no CI, Dependabot; `uuid` corrigido via `overrides` (GHSA-w5hq-g745-h8pq) |
| A07 Identification & Auth Failures | confirmação de e-mail, aprovação, senha forte, mensagem de recuperação que não revela contas existentes |
| A08 Software & Data Integrity | `npm ci` com lockfile; anexos validados por assinatura binária (não só extensão); importação idempotente |
| A09 Logging & Monitoring | auditoria completa; sem dados de pacientes em logs públicos (CI não imprime dados) |
| A10 SSRF | não aplicável (sem servidor que busque URLs) |
| API3 Excessive Data Exposure | `list_staff()` devolve só nome/setor; e-mail/telefone de usuários só para admin |
| API4 Resource Consumption | paginação (1000/linha), limite de 1000 linhas por lote de importação, 10 MB por anexo |

## 4. Riscos residuais (vulnerabilidades/fragilidades encontradas)

### V1 — Ausência de backup gerenciado no plano gratuito
- **Severidade:** Média · **CWE:** CWE-1059 (documentação/processo insuficiente) · **OWASP:** A04
- **CVSS v3.1 estimado:** 5.3 (AV:N/AC:H/PR:N/UI:N/S:U/C:N/I:N/A:H)
- **Evidência:** Supabase Free não oferece backup baixável/PITR.
- **Impacto de negócio:** perda do histórico operacional em incidente/erro humano; descumprimento do art. 46 LGPD (segurança).
- **Cenário:** exclusão acidental em massa por administrador ou incidente no provedor.
- **Remediação:** rotina semanal de exportação ampliada (README §15); avaliar Supabase Pro (backups diários) quando houver orçamento.
- **Inseguro × seguro:** depender só do banco ✗ → export semanal protegido + plano com PITR ✓.

### V2 — Sem MFA para administradores
- **Severidade:** Média · **CWE:** CWE-308 · **OWASP:** A07 · **CVSS:** 5.9 (AV:N/AC:H/PR:N/UI:N/S:U/C:H/I:N/A:N)
- **Evidência:** a interface não oferece cadastro de TOTP; o Supabase Auth suporta MFA TOTP no plano gratuito.
- **Impacto:** conta admin com senha vazada (phishing) expõe todos os dados.
- **Remediação:** Roadmap R1 — tela de MFA (TOTP) e exigência de `aal2` nas políticas de admin (`auth.jwt()->>'aal' = 'aal2'`).
- **Exemplo seguro:** `create policy ... using (public.is_admin() and (auth.jwt()->>'aal') = 'aal2')`.

### V3 — Cadastro público sem CAPTCHA
- **Severidade:** Baixa · **CWE:** CWE-799 · **OWASP API4** · **CVSS:** 4.3 (AV:N/AC:L/PR:N/UI:N/S:U/C:N/I:N/A:L)
- **Evidência:** `signUp` aberto (requisito do fluxo de autocadastro). Contas não aprovadas **não acessam dados**.
- **Impacto:** spam de cadastros, consumo da cota de e-mails.
- **Remediação:** habilitar CAPTCHA (Cloudflare Turnstile/hCaptcha gratuitos) em Authentication → Attack Protection e passar `captchaToken` no `signUp`.

### V4 — Proteções de cabeçalho limitadas no GitHub Pages
- **Severidade:** Baixa · **CWE:** CWE-1021 (clickjacking), CWE-693 · **OWASP:** A05 · **CVSS:** 3.1
- **Evidência:** GitHub Pages não permite cabeçalhos HTTP customizados; CSP via `<meta>` não suporta `frame-ancestors`.
- **Impacto:** página poderia ser emoldurada por site malicioso (ações exigem login e cliques específicos).
- **Remediação:** se houver domínio próprio, publicar via Cloudflare (gratuito) com `Content-Security-Policy: frame-ancestors 'none'`, HSTS e `X-Content-Type-Options`.

### V5 — Token de sessão em `localStorage`
- **Severidade:** Baixa · **CWE:** CWE-922 · **OWASP:** A07 · **CVSS:** 3.7
- **Evidência:** padrão do supabase-js (necessário para o fluxo PKCE dos links de e-mail).
- **Mitigação existente:** CSP `script-src 'self'` sem `unsafe-inline`, nenhum `dangerouslySetInnerHTML`, logout por inatividade, tokens de curta duração.

### V6 — Acesso amplo das técnicas aos registros do módulo (necessidade de conhecer)
- **Severidade:** Baixa · **CWE:** CWE-285 · **LGPD:** art. 6º, III (necessidade)
- **Evidência:** técnicas leem todas as solicitações não arquivadas do módulo (necessário para plantões, agenda e checagem de duplicidade); edição restrita ao próprio registro (configurável).
- **Remediação futura:** se a operação permitir, restringir leitura por setor/equipe (ABAC) usando `profiles.sector_id`.

### V7 — Dados sensíveis na auditoria e em arquivos exportados
- **Severidade:** Baixa · **CWE:** CWE-532 / CWE-359 · **LGPD:** art. 46
- **Evidência:** `audit_logs` guarda a linha na inclusão; exportações saem do ambiente controlado.
- **Mitigação existente:** auditoria legível só por admin (e histórico do registro por quem já pode lê-lo); exportação só para coordenação/admin, registrada; aviso LGPD na tela; texto de busca não é registrado.
- **Remediação futura:** política de retenção (ex.: expurgo/anonimização após prazo definido pelo DPO); marca d'água com usuário/data no arquivo exportado.

### V8 — Tiles do OpenStreetMap revelam a área visualizada
- **Severidade:** Informativa · Nenhum endereço é enviado; apenas coordenadas de tiles (região). Política de uso do OSM respeitada (atribuição, sem uso massivo). Para alto volume, trocar por provedor de tiles contratado.

## 5. DevSecOps

| Prática | Situação |
|---|---|
| SCA | `npm audit` no CI (falha em High/Critical) + Dependabot semanal |
| Secret scanning | CI bloqueia `service_role`/`sb_secret_`; `.gitignore` bloqueia `.env`, `.xlsx`, `.csv`, backups. **Ative** em Settings → Code security → *Secret Protection / Push protection* (gratuito em repositório público) |
| SAST | Recomendado: habilitar **CodeQL** (Settings → Code security → Code scanning → Default) — gratuito em repositório público |
| Testes | `npm test` (interpretador/endereços) no CI; testes de RLS executados em PostgreSQL durante o desenvolvimento |
| Supply chain | lockfile + `npm ci`; ações oficiais `actions/*` |

## 6. Quick wins (≤ 1 dia, custo zero)

1. Ativar 2FA no GitHub e no Supabase das contas administrativas.
2. GitHub: ativar CodeQL, Secret Protection e Push protection.
3. Supabase: Attack Protection → CAPTCHA (Turnstile) + manter "Confirm email".
4. Configurar SMTP próprio para e-mails de autenticação (evita bloqueio por cota).
5. Definir a rotina semanal de backup (README §15) e o responsável.

## 7. Roadmap de correção

| Prazo | Item |
|---|---|
| R1 — 30 dias | MFA TOTP obrigatório para administradores (V2) |
| R2 — 30 dias | CAPTCHA no cadastro (V3) |
| R3 — 60 dias | Política de retenção/anonimização definida com o DPO e expurgo automatizado (V7) |
| R4 — 90 dias | Avaliar Supabase Pro (backups/PITR) e domínio próprio com cabeçalhos de segurança (V1, V4) |
| R5 — contínuo | Revisão trimestral de acessos (usuários ativos × equipe atual) e das dependências |

## 8. LGPD — registro resumido

- **Finalidade:** organização assistencial e logística de coletas de urina domiciliares.
- **Base legal (art. 11, II, "f"):** tutela da saúde por profissionais/serviços de saúde. Validar com o Encarregado (DPO).
- **Minimização:** sem CPF/documentos obrigatórios; texto original do WhatsApp só é guardado se a técnica marcar; geolocalização aproximada por bairro.
- **Compartilhamento:** operadores Supabase (armazenamento, região São Paulo) e GitHub (apenas código, sem dados). Nenhum envio a IA ou geocodificador.
- **Direitos do titular:** correção pela tela de edição; exclusão definitiva pelo administrador (auditada).
