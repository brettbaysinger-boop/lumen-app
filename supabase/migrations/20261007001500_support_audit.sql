create table public.support_audit (
  id uuid primary key,
  actor_user_id uuid not null,
  target_user_id uuid not null,
  action text not null check (action in ('unlock','recovery')),
  status text not null check (status in ('requested','accepted','failed')),
  created_at timestamptz not null default now(),
  finished_at timestamptz
);
alter table public.support_audit enable row level security;
revoke all on public.support_audit from public, anon, authenticated, service_role;
grant select, insert on public.support_audit to service_role;
grant update (status, finished_at) on public.support_audit to service_role;
create index support_audit_recent on public.support_audit (created_at desc);
notify pgrst, 'reload schema';
