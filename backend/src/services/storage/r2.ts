import type { Env } from '../../types/bindings'
import {
  assertUploadAllowed,
  assertReadAllowed,
  recordUpload,
  recordRead,
  recordDeletion,
  type R2LimitConfig,
} from './r2-limits'

export function buildR2LimitConfig(env: Env): R2LimitConfig {
  return {
    enabled: (env.R2_LIMITS_ENABLED ?? 'true') === 'true',
    maxStorageBytes: parseInt(env.R2_MAX_STORAGE_BYTES ?? '10737418240', 10),
    maxClassAOpsMonthly: parseInt(env.R2_MAX_CLASS_A_OPS_MONTHLY ?? '900000', 10),
    maxClassBOpsMonthly: parseInt(env.R2_MAX_CLASS_B_OPS_MONTHLY ?? '9000000', 10),
  }
}

// Class A operation (PutObject) — $4.50/million, 1M free/month
export async function uploadToR2(
  env: Env,
  key: string,
  data: ArrayBuffer,
  contentType: string
): Promise<string> {
  const config = buildR2LimitConfig(env)
  await assertUploadAllowed(env.KV_CACHE, config, data.byteLength)

  await env.RESUME_BUCKET.put(key, data, { httpMetadata: { contentType } })

  // Record after successful put — counts only real R2 operations
  await recordUpload(env.KV_CACHE, key, data.byteLength)
  return key
}

// Class B operation (GetObject) — $0.36/million, 10M free/month
// Use this if you add a resume preview/download route through the Worker.
export async function getFromR2(
  env: Env,
  key: string
): Promise<R2ObjectBody | null> {
  const config = buildR2LimitConfig(env)
  await assertReadAllowed(env.KV_CACHE, config)

  const object = await env.RESUME_BUCKET.get(key)
  if (object) {
    await recordRead(env.KV_CACHE)
  }
  return object
}

// FREE operation (DeleteObject) — no charge, no op counting
export async function deleteFromR2(env: Env, key: string): Promise<void> {
  await env.RESUME_BUCKET.delete(key)
  // Only update storage bookkeeping — deletes are free, no op counter
  await recordDeletion(env.KV_CACHE, key)
}

export function r2Key(
  companyId: string,
  jobId: string,
  candidateId: string,
  ext: string
): string {
  return `resumes/${companyId}/${jobId}/${candidateId}.${ext}`
}
