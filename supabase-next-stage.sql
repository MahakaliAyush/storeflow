-- NEXT-STAGE DRAFT ONLY
-- Do not use this until the Supabase integration stage.

create type public.user_role as enum ('staff', 'manager', 'owner');
create type public.task_status as enum ('todo', 'completed');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null,
  role public.user_role not null default 'staff',
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.tasks (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text,
  department text not null,
  priority text not null check (priority in ('low', 'medium', 'high')),
  due_date date,
  assigned_to uuid references public.profiles(id),
  created_by uuid not null references public.profiles(id),
  status public.task_status not null default 'todo',
  completed_by uuid references public.profiles(id),
  completed_at timestamptz,
  archived boolean not null default false,
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;
alter table public.tasks enable row level security;

-- Policies will be added carefully during the secure integration stage.
