import { z } from 'zod'

/**
 * Everything on the resume queue. Payloads carry IDs only — the file stays in
 * R2 (claim check), keeping messages far under the 128 KB limit.
 */
const processResume = z.object({
  type: z.literal('process-resume'),
  candidateId: z.string().min(1),
  companyId: z.string().min(1),
  jobId: z.string().min(1),
  r2Key: z.string().min(1),
  fileType: z.enum(['pdf', 'docx']),
})

const purgeCandidate = z.object({
  type: z.literal('purge-candidate'),
  candidateId: z.string().min(1),
  companyId: z.string().min(1),
  resumeUrl: z.string().min(1).nullable(),
})

const resumeQueueMessage = z.discriminatedUnion('type', [processResume, purgeCandidate])

export type ProcessResumeMessage = z.infer<typeof processResume>
export type PurgeCandidateMessage = z.infer<typeof purgeCandidate>
export type ResumeQueueMessage = z.infer<typeof resumeQueueMessage>

/** null for anything malformed — retrying cannot fix a bad payload. */
export function parseQueueMessage(body: unknown): ResumeQueueMessage | null {
  const result = resumeQueueMessage.safeParse(body)
  return result.success ? result.data : null
}
