# Arquitetura e Banco de Dados — PulseWork

## Estrutura de Módulos

- `src/app`: Rotas App Router (`/dashboard`, `/projetos`, `/assistente`, `/tarefas`, `/ponto`, `/horas-extras`, `/relatorios`, `/integracoes`, `/configuracoes`, `/admin`, `/login`, `/api/*`).
- `src/modules`: Lógica de domínio e componentes específicos por módulo (`dashboard`, e nas próximas fases `projects`, `tasks`, `timecard`, `overtime`, `assistant`, `reports`, `integrations`).
- `src/components`: Componentes compartilhados (`ui/*` no padrão shadcn/ui e `layout/app-shell.tsx`).
- `src/lib`: Infraestrutura (`supabase/client.ts`, `supabase/server.ts`, `supabase/middleware.ts`, `auth.ts`, `utils.ts`).
- `src/services`: Clientes de APIs externas (Notion, GitHub, Telegram, Provedor de IA) — Fases 2–5.
- `src/hooks`: Hooks React reutilizáveis.
- `src/types`: Tipagem TypeScript espelhada do PostgreSQL.
- `local-sync/`: Projeto independente em Node.js para sincronização local — Fase 2.
- `supabase/migrations/`: Migrations SQL versionadas com índices, triggers e RLS.

## Banco de Dados (20 tabelas + RLS)

Definido em [202611130001_initial_schema.sql](../supabase/migrations/202611130001_initial_schema.sql):
- Identidade e organização: `organizations`, `profiles`
- Projetos e sincronização: `projects`, `project_sources`, `project_sync_events`, `project_summaries`, `sync_devices`
- Tarefas e Notion: `tasks`, `task_sync_events`
- Assistente IA: `assistant_conversations`, `assistant_messages`
- Ponto e Horas Extras: `work_schedules`, `time_records`, `overtime_rules`, `monthly_closings`
- Relatórios, Integrações e Fila: `generated_reports`, `integrations`, `telegram_deliveries`, `audit_logs`, `background_jobs`
