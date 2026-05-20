import type { R2Bucket } from '@cloudflare/workers-types'

export async function uploadToR2(
  bucket: R2Bucket,
  key: string,
  data: ArrayBuffer,
  contentType: string
): Promise<string> {
  await bucket.put(key, data, {
    httpMetadata: { contentType },
  })
  return key
}

export async function deleteFromR2(bucket: R2Bucket, key: string): Promise<void> {
  await bucket.delete(key)
}

export function r2Key(
  companyId: string,
  jobId: string,
  candidateId: string,
  ext: string
): string {
  return `resumes/${companyId}/${jobId}/${candidateId}.${ext}`
}
