import type { KVNamespace } from '@cloudflare/workers-types'
import { AppError } from '../../types/api'

// ── R2 Operation classification (Cloudflare pricing) ─────────────────────────
//
// Class A (paid, ~$4.50/million): PutObject, ListObjects, CopyObject, etc.
//   → our: uploadToR2 (bucket.put)
//
// Class B (paid, ~$0.36/million): GetObject, HeadObject, HeadBucket, etc.
//   → our: getFromR2 (bucket.get) — currently not called in routes, but tracked
//           for when resume preview/download endpoints are added
//
// FREE: DeleteObject, DeleteBucket, AbortMultipartUpload
//   → our: deleteFromR2 (bucket.delete) — free, no op counting needed
//
// Free tier: 10 GB storage, 1M Class A ops/month, 10M Class B ops/month

export interface R2LimitConfig {
  enabled: boolean
  maxStorageBytes: number          // hard cap on total stored bytes
  maxClassAOpsMonthly: number      // PutObject (upload) count per calendar month
  maxClassBOpsMonthly: number      // GetObject (read/download) count per calendar month
}

function yearMonth(): string {
  const d = new Date()
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`
}

const CLASS_A_KEY = () => `r2:ops:class_a:${yearMonth()}`
const CLASS_B_KEY = () => `r2:ops:class_b:${yearMonth()}`
const STORAGE_KEY = 'r2:storage:bytes'
const FILE_SIZE_KEY = (r2Key: string) => `r2:file:${r2Key}:size`

// 65-day TTL so monthly counters self-clean after the billing period
const MONTHLY_TTL = 65 * 24 * 60 * 60

// ── Pre-flight checks ─────────────────────────────────────────────────────────

export async function assertUploadAllowed(
  kv: KVNamespace,
  config: R2LimitConfig,
  incomingBytes: number
): Promise<void> {
  if (!config.enabled) return

  const [classAStr, storageStr] = await Promise.all([
    kv.get(CLASS_A_KEY()),
    kv.get(STORAGE_KEY),
  ])

  const classACount = classAStr ? parseInt(classAStr, 10) : 0
  const storedBytes = storageStr ? parseInt(storageStr, 10) : 0

  if (classACount >= config.maxClassAOpsMonthly) {
    throw new AppError(
      `R2 Class A operation limit reached for this month ` +
      `(${classACount.toLocaleString()} / ${config.maxClassAOpsMonthly.toLocaleString()} ops). ` +
      'Resume uploads are paused until the 1st of next month.',
      503
    )
  }

  if (storedBytes + incomingBytes > config.maxStorageBytes) {
    const usedGB = (storedBytes / 1024 ** 3).toFixed(2)
    const limitGB = (config.maxStorageBytes / 1024 ** 3).toFixed(1)
    throw new AppError(
      `R2 storage limit reached (${usedGB} GB used / ${limitGB} GB limit). ` +
      'Delete unused resumes or raise R2_MAX_STORAGE_BYTES in wrangler.toml.',
      507
    )
  }
}

export async function assertReadAllowed(
  kv: KVNamespace,
  config: R2LimitConfig
): Promise<void> {
  if (!config.enabled) return

  const classBStr = await kv.get(CLASS_B_KEY())
  const classBCount = classBStr ? parseInt(classBStr, 10) : 0

  if (classBCount >= config.maxClassBOpsMonthly) {
    throw new AppError(
      `R2 Class B operation limit reached for this month ` +
      `(${classBCount.toLocaleString()} / ${config.maxClassBOpsMonthly.toLocaleString()} ops). ` +
      'Resume downloads are paused until the 1st of next month.',
      503
    )
  }
}

// Note: no assertDeleteAllowed — DeleteObject is a FREE R2 operation.
// No op counting needed for deletes.

// ── Post-operation bookkeeping ────────────────────────────────────────────────

export async function recordUpload(
  kv: KVNamespace,
  r2Key: string,
  bytes: number
): Promise<void> {
  const [classAStr, storageStr] = await Promise.all([
    kv.get(CLASS_A_KEY()),
    kv.get(STORAGE_KEY),
  ])

  const classACount = classAStr ? parseInt(classAStr, 10) : 0
  const storedBytes = storageStr ? parseInt(storageStr, 10) : 0

  await Promise.all([
    kv.put(CLASS_A_KEY(), String(classACount + 1), { expirationTtl: MONTHLY_TTL }),
    kv.put(STORAGE_KEY, String(storedBytes + bytes)),
    // Store per-file size so deletion can accurately subtract from the total
    kv.put(FILE_SIZE_KEY(r2Key), String(bytes), { expirationTtl: 365 * 24 * 60 * 60 }),
  ])
}

export async function recordRead(kv: KVNamespace): Promise<void> {
  const classBStr = await kv.get(CLASS_B_KEY())
  const classBCount = classBStr ? parseInt(classBStr, 10) : 0
  await kv.put(CLASS_B_KEY(), String(classBCount + 1), { expirationTtl: MONTHLY_TTL })
}

export async function recordDeletion(kv: KVNamespace, r2Key: string): Promise<void> {
  // DeleteObject is FREE — no op counter to increment.
  // Only update the storage total.
  const [fileSizeStr, storageStr] = await Promise.all([
    kv.get(FILE_SIZE_KEY(r2Key)),
    kv.get(STORAGE_KEY),
  ])

  if (!fileSizeStr) return  // unknown file — storage total stays as-is

  const fileBytes = parseInt(fileSizeStr, 10)
  const storedBytes = storageStr ? parseInt(storageStr, 10) : 0

  await Promise.all([
    kv.put(STORAGE_KEY, String(Math.max(0, storedBytes - fileBytes))),
    kv.delete(FILE_SIZE_KEY(r2Key)),
  ])
}

// ── Usage snapshot (for analytics endpoint) ───────────────────────────────────

export interface R2UsageSnapshot {
  storage_bytes: number
  storage_gb: number
  storage_limit_bytes: number
  storage_used_pct: number
  class_a_ops_this_month: number      // PutObject (uploads)
  class_a_ops_limit: number
  class_a_used_pct: number
  class_b_ops_this_month: number      // GetObject (reads/downloads)
  class_b_ops_limit: number
  class_b_used_pct: number
  limits_enabled: boolean
  note: string
}

export async function getR2Usage(
  kv: KVNamespace,
  config: R2LimitConfig
): Promise<R2UsageSnapshot> {
  const [storageStr, classAStr, classBStr] = await Promise.all([
    kv.get(STORAGE_KEY),
    kv.get(CLASS_A_KEY()),
    kv.get(CLASS_B_KEY()),
  ])

  const storageBytes = storageStr ? parseInt(storageStr, 10) : 0
  const classAOps = classAStr ? parseInt(classAStr, 10) : 0
  const classBOps = classBStr ? parseInt(classBStr, 10) : 0

  return {
    storage_bytes: storageBytes,
    storage_gb: parseFloat((storageBytes / 1024 ** 3).toFixed(3)),
    storage_limit_bytes: config.maxStorageBytes,
    storage_used_pct: parseFloat(((storageBytes / config.maxStorageBytes) * 100).toFixed(1)),
    class_a_ops_this_month: classAOps,
    class_a_ops_limit: config.maxClassAOpsMonthly,
    class_a_used_pct: parseFloat(((classAOps / config.maxClassAOpsMonthly) * 100).toFixed(1)),
    class_b_ops_this_month: classBOps,
    class_b_ops_limit: config.maxClassBOpsMonthly,
    class_b_used_pct: parseFloat(((classBOps / config.maxClassBOpsMonthly) * 100).toFixed(1)),
    limits_enabled: config.enabled,
    note: 'Class B (read) ops are only tracked for reads proxied through the Worker. ' +
      'Direct R2 URL reads are not visible here.',
  }
}
