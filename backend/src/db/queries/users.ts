import { nanoid } from 'nanoid'
import type { D1Database } from '@cloudflare/workers-types'
import type { UserRow, CompanyRow, EmailPreferencesRow } from '../../types/db'

// ── Deserialization helpers ───────────────────────────────────────────────────

export function toPublicUser(user: UserRow) {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role as 'recruiter' | 'interviewer' | 'admin',
    company_id: user.company_id,
    created_at: user.created_at,
  }
}

// ── Company queries ───────────────────────────────────────────────────────────

export async function createCompany(db: D1Database, name: string): Promise<CompanyRow> {
  const id = nanoid()
  await db
    .prepare('INSERT INTO companies (id, name) VALUES (?, ?)')
    .bind(id, name)
    .run()
  return { id, name, plan: 'free', created_at: new Date().toISOString() }
}

// ── User queries ──────────────────────────────────────────────────────────────

export async function createUser(
  db: D1Database,
  opts: {
    company_id: string
    email: string
    password_hash: string
    name: string
    role?: string
  }
): Promise<UserRow> {
  const id = nanoid()
  const role = opts.role ?? 'recruiter'
  await db
    .prepare(
      'INSERT INTO users (id, company_id, email, password_hash, name, role) VALUES (?, ?, ?, ?, ?, ?)'
    )
    .bind(id, opts.company_id, opts.email.trim().toLowerCase(), opts.password_hash, opts.name, role)
    .run()
  return {
    id,
    company_id: opts.company_id,
    email: opts.email.trim().toLowerCase(),
    password_hash: opts.password_hash,
    name: opts.name,
    role,
    created_at: new Date().toISOString(),
  }
}

export async function findUserByEmail(
  db: D1Database,
  email: string
): Promise<UserRow | null> {
  return db
    .prepare('SELECT * FROM users WHERE email = lower(?) LIMIT 1')
    .bind(email.trim())
    .first<UserRow>()
}

export async function findUserById(
  db: D1Database,
  id: string
): Promise<UserRow | null> {
  return db
    .prepare('SELECT * FROM users WHERE id = ? LIMIT 1')
    .bind(id)
    .first<UserRow>()
}

export async function findUserByEmailInCompany(
  db: D1Database,
  email: string,
  companyId: string,
): Promise<UserRow | null> {
  return db
    .prepare('SELECT * FROM users WHERE email = lower(?) AND company_id = ? LIMIT 1')
    .bind(email.trim(), companyId)
    .first<UserRow>()
}

// ── Email preferences ─────────────────────────────────────────────────────────

export async function createEmailPreferences(
  db: D1Database,
  userId: string
): Promise<void> {
  const token = nanoid(32)
  await db
    .prepare(
      `INSERT INTO email_preferences (user_id, unsubscribe_token)
       VALUES (?, ?)
       ON CONFLICT(user_id) DO NOTHING`
    )
    .bind(userId, token)
    .run()
}

export async function getEmailPreferences(
  db: D1Database,
  userId: string
): Promise<EmailPreferencesRow | null> {
  return db
    .prepare('SELECT * FROM email_preferences WHERE user_id = ? LIMIT 1')
    .bind(userId)
    .first<EmailPreferencesRow>()
}
