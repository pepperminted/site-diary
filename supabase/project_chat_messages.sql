create table if not exists public.project_chat_messages (
  id uuid primary key default gen_random_uuid(),
  project_id text not null,
  user_id uuid not null,
  role text not null check (role in ('user', 'assistant')),
  content text not null,
  cited_entry_ids jsonb,
  created_at timestamptz not null default now()
);

create index if not exists project_chat_messages_project_id_created_at_idx
  on public.project_chat_messages (project_id, created_at asc);

alter table public.project_chat_messages enable row level security;

drop policy if exists "Users can read their project chat messages" on public.project_chat_messages;
create policy "Users can read their project chat messages"
on public.project_chat_messages
for select
to authenticated
using (auth.uid() = user_id);

drop policy if exists "Users can insert their project chat messages" on public.project_chat_messages;
create policy "Users can insert their project chat messages"
on public.project_chat_messages
for insert
to authenticated
with check (auth.uid() = user_id);

drop policy if exists "Users can delete their project chat messages" on public.project_chat_messages;
create policy "Users can delete their project chat messages"
on public.project_chat_messages
for delete
to authenticated
using (auth.uid() = user_id);