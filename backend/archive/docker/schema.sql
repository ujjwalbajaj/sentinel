create table if not exists alerts (
  id text primary key,
  created_at timestamptz not null default now(),
  chain_id integer not null,
  protocol_name text not null,
  vault text not null,
  probability integer not null,
  paused boolean not null,
  explanation text not null,
  payload jsonb not null
);
