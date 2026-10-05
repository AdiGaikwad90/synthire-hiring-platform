import type { KVNamespace } from '@cloudflare/workers-types'
import type { Env } from '../../types/bindings'
import { AppError } from '../../types/api'
import { getFromR2, uploadToR2, deleteFromR2 } from '../storage/r2'

/** Long enough for a recruiter to finish the job form; the R2 rule expires the file after 1 day. */
export const JD_PARSE_TTL_SECONDS = 86400

export interface JdParseRecord {
  status: 'processing' | 'done' | 'error'
  companyId: string
  pendingKey: string
  ext: 'pdf' | 'docx'
  result?: Record<string, unknown>
  error?: string
}

export const jdParseKvKey = (parseId: string) => `jdparse:${parseId}`
/** Under jd-pending/, which an R2 lifecycle rule empties after 1 day. */
export const pendingJdKey = (companyId: string, parseId: string, ext: string) => `jd-pending/${companyId}/${parseId}.${ext}`
export const jobJdKey = (companyId: string, jobId: string, ext: string) => `jd/${companyId}/${jobId}.${ext}`

const UNAVAILABLE = 'This JD upload has expired or is not available — upload it again'

export async function readJdParse(kv: KVNamespace, parseId: string): Promise<JdParseRecord | null> {
  const raw = await kv.get(jdParseKvKey(parseId))
  if (!raw) return null
  try { return JSON.parse(raw) as JdParseRecord } catch { return null }
}

/** A foreign tenant's parse is indistinguishable from an expired one. */
export async function resolveJdParse(kv: KVNamespace, parseId: string, companyId: string): Promise<JdParseRecord> {
  const record = await readJdParse(kv, parseId)
  if (!record || record.status !== 'done' || record.companyId !== companyId) throw new AppError(UNAVAILABLE, 422)
  return record
}

/** Moves the pending upload to its permanent key. null if the pending file is gone. */
export async function attachJd(env: Env, record: JdParseRecord, companyId: string, jobId: string): Promise<string | null> {
  const pending = await getFromR2(env, record.pendingKey)
  if (!pending) return null
  const finalKey = jobJdKey(companyId, jobId, record.ext)
  const contentType = pending.httpMetadata?.contentType
    ?? (record.ext === 'pdf' ? 'application/pdf' : 'application/vnd.openxmlformats-officedocument.wordprocessingml.document')
  await uploadToR2(env, finalKey, await pending.arrayBuffer(), contentType)
  await deleteFromR2(env, record.pendingKey)
  return finalKey
}
