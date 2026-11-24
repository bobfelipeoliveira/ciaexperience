# Arquitetura — CIA EXPERIENCE

## Visão geral

```
Navegador (React + Vite + TypeScript, hospedado no GitHub Pages)
   │  HTTPS — somente chave PÚBLICA (publishable/anon) + token do usuário logado
   ▼
Supabase (região São Paulo)
   ├─ Auth ............ cadastro, confirmação de e-mail, login, recuperação de senha
   ├─ PostgreSQL ...... tabelas + RLS (toda a autorização) + gatilhos de auditoria + funções
   ├─ Realtime ........ atualiza painel e alertas quando algo muda (respeita RLS)
   └─ Storage ......... bucket PRIVADO de anexos (links temporários de 60 s)
```

Não há servidor próprio. O navegador nunca recebe a chave `service_role`.

## Plataforma × módulos

| Camada | Pasta | Conteúdo |
|---|---|---|
| Núcleo | `src/core` + `supabase/migrations/001_*` | autenticação, perfis, papéis por módulo, setores, configurações, notificações, auditoria, layout e componentes reutilizáveis |
| Módulo | `src/modules/<modulo>` + `supabase/migrations/0NN_*` | tabelas com prefixo próprio, regras, telas, provedor de dados |

Contrato de módulo: `src/core/modules.ts` (`PlatformModule`: rotas, menu, provedor de dados, contadores).
O `App.tsx` monta automaticamente rotas e menu dos módulos ativos para os quais o usuário tem papel.

### Como adicionar um módulo (ex.: Remoções Hospitalares)

1. Banco: novo arquivo `supabase/migrations/004_modulo_remocoes.sql` com tabelas `hospital_removal_*`,
   RLS usando `public.has_module_role('hospital_removals', array[...])` e gatilhos `audit_row_change('hospital_removals')`.
2. Ativar o módulo: `update modules set active = true where key = 'hospital_removals';`
3. Frontend: criar `src/modules/hospital-removals/index.tsx` exportando um `PlatformModule` e incluí-lo em `src/modules/index.ts`.
4. Atribuir papéis em **Usuários** (as caixas de perfil por módulo aparecem automaticamente).

Nenhum dado, regra ou formulário é compartilhado entre módulos, exceto o núcleo.

## Modelo de dados (resumo)

| Tabela | Função |
|---|---|
| `profiles` | 1 por usuário do Auth; status `pending/approved/rejected/blocked` (só muda por função admin) |
| `user_roles` | papéis: `admin` (global) · `coordenacao` / `tecnica` (por módulo) |
| `sectors`, `modules`, `system_settings` | cadastros e parâmetros |
| `notifications` | central de notificações por usuário, sem repetição (`dedupe_key`) |
| `audit_logs` | auditoria imutável (gatilhos), com valores anteriores/posteriores só dos campos alterados |
| `urine_collection_requests` | solicitação (UUID, criador, datas, status, endereço, execução, origem da importação) |
| `urine_collection_reschedules` | histórico de reagendamentos (nunca sobrescreve) |
| `urine_collection_attachments` | metadados dos anexos (arquivo no Storage privado) |
| `urine_collection_export_logs` / `_import_batches` | histórico de exportações e importações |

Índices: data agendada, status, prioridade, cidade, bairro, forma de coleta, responsável, criador, recebimento, nome normalizado, telefone.

## Decisões técnicas

| Decisão | Motivo |
|---|---|
| `HashRouter` (`/#/rota`) | GitHub Pages não reescreve rotas; evita 404 ao recarregar. |
| Auth com PKCE | Links de e-mail voltam com `?code=`, compatível com o HashRouter. |
| Alertas calculados no banco (`urine_alerts()`) | Sempre atuais, sem tarefas agendadas (que exigiriam plano pago/servidor); um alerta por tipo evita repetição. |
| Interpretador de texto por regras locais | Funciona sem IA paga e sem enviar dados de pacientes a terceiros. Interface `ExtractionProvider` permite plugar IA no futuro. |
| Geolocalização por base local de bairros | Privacidade (LGPD): nenhum endereço sai do navegador. Interface `GeoProvider` permite trocar o provedor. |
| Datas `date` + fuso `America/Sao_Paulo` | "Hoje/amanhã" calculados no fuso local, no banco e na tela. |
| Reagendamento só via função `urine_reschedule` | Garante histórico: o banco recusa alterar data agendada diretamente (exceto correção pelo admin, auditada). |
| ExcelJS (carregado sob demanda) | Lê e grava .xlsx no navegador; carregado só nas telas de importação/exportação. |
