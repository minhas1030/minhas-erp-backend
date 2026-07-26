-- Minhas Academy ERP — Database Schema
-- Run this once in your Supabase project's SQL Editor (Supabase → SQL Editor → New Query → paste → Run)

create extension if not exists pgcrypto;

-- One row per school/academy that signs up
create table if not exists schools (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  tagline text default 'School & Academy Management',
  primary_color text default '#13233F',
  gold_color text default '#C0973B',
  logo_letter text default 'M',
  contact text default '',
  address text default '',
  created_at timestamptz default now()
);

-- Login accounts (Admin, Teacher, Parent, Accountant) — always belong to exactly one school
create table if not exists users (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references schools(id) on delete cascade,
  name text not null,
  username text unique not null,
  password_hash text not null,
  role text not null default 'Admin',
  created_at timestamptz default now()
);

-- Every other module (students, staff, fees, attendance, homework, notices,
-- events, complaints, admissions, library, transport, exams, expenses) is
-- stored here as flexible JSON rows, scoped to a school and a collection name.
-- This keeps the schema simple and lets new modules be added later without
-- migrations, while still being a real, permanent, ACID-safe database.
create table if not exists records (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references schools(id) on delete cascade,
  collection text not null,
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz default now()
);

create index if not exists idx_records_school_collection on records(school_id, collection);
create index if not exists idx_users_username on users(username);
