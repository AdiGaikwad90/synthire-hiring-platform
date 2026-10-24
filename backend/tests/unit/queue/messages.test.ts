import { describe, it, expect } from 'vitest'
import { parseQueueMessage } from '../../../src/queue/messages'

const PROCESS = { type: 'process-resume', candidateId: 'c1', companyId: 'co1', jobId: 'j1', r2Key: 'resumes/co1/j1/c1.pdf', fileType: 'pdf' }
const PURGE = { type: 'purge-candidate', candidateId: 'c1', companyId: 'co1', resumeUrl: 'resumes/co1/j1/c1.pdf' }

describe('parseQueueMessage — happy path', () => {
  it('accepts a process-resume message', () => {
    expect(parseQueueMessage(PROCESS)).toEqual(PROCESS)
  })
})

describe('parseQueueMessage — positive variants', () => {
  it('accepts a purge-candidate message', () => {
    expect(parseQueueMessage(PURGE)).toEqual(PURGE)
  })
  it('accepts a purge with no stored file', () => {
    expect(parseQueueMessage({ ...PURGE, resumeUrl: null })).toEqual({ ...PURGE, resumeUrl: null })
  })
  it('accepts docx', () => {
    expect(parseQueueMessage({ ...PROCESS, fileType: 'docx' })?.type).toBe('process-resume')
  })
})

describe('parseQueueMessage — invalid input', () => {
  it.each([
    ['unknown type', { ...PROCESS, type: 'reticulate' }],
    ['missing candidateId', { ...PROCESS, candidateId: undefined }],
    ['empty candidateId', { ...PROCESS, candidateId: '' }],
    ['bad fileType', { ...PROCESS, fileType: 'exe' }],
    ['purge without resumeUrl key', { type: 'purge-candidate', candidateId: 'c1', companyId: 'co1' }],
    ['a string', 'process-resume'],
    ['null', null],
    ['an array', [PROCESS]],
  ])('rejects %s', (_n, body) => {
    expect(parseQueueMessage(body)).toBeNull()
  })
})

// Empty: covered by null / missing-field cases. Error contract: N/A — returns null, never throws.
