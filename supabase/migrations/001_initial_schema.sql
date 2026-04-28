-- Users table (extends Supabase auth.users)
create table public.users (
  id uuid references auth.users(id) on delete cascade primary key,
  email text not null,
  name text,
  date_of_birth date,
  connected_devices text[] default '{}',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table public.health_metrics (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references public.users(id) on delete cascade not null,
  source text not null, -- oura/apple/whoop/garmin
  metric_type text not null, -- sleep_score, hrv, resting_hr, spo2, recovery_score, cycle_day
  value numeric not null,
  unit text not null,
  recorded_at timestamptz not null,
  created_at timestamptz default now()
);

create table public.baselines (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references public.users(id) on delete cascade not null,
  metric_type text not null,
  baseline_value numeric not null,
  baseline_range_low numeric not null,
  baseline_range_high numeric not null,
  computed_at timestamptz default now(),
  window_days integer not null default 90
);

create table public.signals (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references public.users(id) on delete cascade not null,
  signal_type text not null,
  severity text not null check (severity in ('info', 'watch', 'alert')),
  title text not null,
  body text not null,
  supporting_metrics text[] default '{}',
  generated_at timestamptz default now(),
  dismissed_at timestamptz
);

create table public.context_briefs (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references public.users(id) on delete cascade not null,
  appointment_date date not null,
  provider_name text not null,
  generated_content jsonb,
  pdf_url text,
  created_at timestamptz default now()
);

create table public.appointments (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references public.users(id) on delete cascade not null,
  provider_name text not null,
  specialty text,
  appointment_at timestamptz not null,
  brief_generated boolean default false,
  created_at timestamptz default now()
);

create table public.chat_messages (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references public.users(id) on delete cascade not null,
  session_id text not null,
  role text not null check (role in ('user', 'assistant')),
  content text not null,
  created_at timestamptz default now()
);

-- Indexes
create index on public.health_metrics (user_id, recorded_at desc);
create index on public.health_metrics (user_id, metric_type, recorded_at desc);
create index on public.baselines (user_id, metric_type);
create index on public.signals (user_id, generated_at desc);
create index on public.appointments (user_id, appointment_at);
create index on public.chat_messages (user_id, session_id, created_at);

-- RLS
alter table public.users enable row level security;
alter table public.health_metrics enable row level security;
alter table public.baselines enable row level security;
alter table public.signals enable row level security;
alter table public.context_briefs enable row level security;
alter table public.appointments enable row level security;
alter table public.chat_messages enable row level security;

create policy "Users can view own data" on public.users for select using (auth.uid() = id);
create policy "Users can update own data" on public.users for update using (auth.uid() = id);
create policy "Users can insert own data" on public.users for insert with check (auth.uid() = id);

create policy "Users can view own metrics" on public.health_metrics for all using (auth.uid() = user_id);
create policy "Users can view own baselines" on public.baselines for all using (auth.uid() = user_id);
create policy "Users can view own signals" on public.signals for all using (auth.uid() = user_id);
create policy "Users can view own briefs" on public.context_briefs for all using (auth.uid() = user_id);
create policy "Users can view own appointments" on public.appointments for all using (auth.uid() = user_id);
create policy "Users can view own messages" on public.chat_messages for all using (auth.uid() = user_id);
