-- Client-side error logging table + safe insert RPC
-- Lightweight crash monitoring without third-party services

create table if not exists public.client_error_logs (
  id          bigint generated always as identity primary key,
  created_at  timestamptz not null default now(),
  user_id     uuid,
  session_id  text,
  error_name  text not null,
  message     text not null,
  stack       text,
  context     text,            -- e.g. 'ErrorBoundary', 'useGameActions', 'ChatPanel'
  route       text,
  device_type text,
  user_agent  text,
  app_version text
);

-- RLS: users cannot read error logs; only insert via RPC
alter table public.client_error_logs enable row level security;

-- No SELECT/UPDATE/DELETE policies — logs are write-only from client perspective

-- SECURITY DEFINER RPC so anon users can insert without direct table access
create or replace function public.log_client_error(
  p_user_id     uuid     default null,
  p_session_id  text     default null,
  p_error_name  text     default 'Error',
  p_message     text     default '',
  p_stack       text     default null,
  p_context     text     default null,
  p_route       text     default null,
  p_device_type text     default null,
  p_user_agent  text     default null,
  p_app_version text     default null
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.client_error_logs (
    user_id, session_id, error_name, message, stack,
    context, route, device_type, user_agent, app_version
  ) values (
    p_user_id, p_session_id, p_error_name, p_message, p_stack,
    p_context, p_route, p_device_type, p_user_agent, p_app_version
  );
end;
$$;
