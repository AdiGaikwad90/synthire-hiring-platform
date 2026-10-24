import { describe, it, expect } from 'vitest'
import { extractPdfText } from '../../../../src/services/parsing/pdf'

/**
 * Regression: unpdf's pdf.js detaches (transfers) the ArrayBuffer backing the
 * Uint8Array it's given. The route reads `buffer.arrayBuffer()` once and
 * later uploads the SAME buffer to R2 — if extraction detaches it, the R2
 * upload stores a 0-byte file. extractPdfText must hand unpdf a copy.
 */

// 863-byte blank one-page PDF (no extractable text) — same fixture as
// tests/integration/routes/candidate-upload.test.ts.
const BLANK_PDF_B64 = 'JVBERi0xLjQKJdPr6eEKMSAwIG9iago8PC9UaXRsZSAoYmxhbmsuaHRtbCkKL0NyZWF0b3IgKE1vemlsbGEvNS4wIFwoTWFjaW50b3NoOyBJbnRlbCBNYWMgT1MgWCAxMF8xNV83XCkgQXBwbGVXZWJLaXQvNTM3LjM2IFwoS0hUTUwsIGxpa2UgR2Vja29cKSBIZWFkbGVzc0Nocm9tZS8xNTIuMC4wLjAgU2FmYXJpLzUzNy4zNikKL1Byb2R1Y2VyIChTa2lhL1BERiBtMTUyKQovQ3JlYXRpb25EYXRlIChEOjIwMjYxMDAzMTk1NjUzKzAwJzAwJykKL01vZERhdGUgKEQ6MjAyNjEwMDMxOTU2NTMrMDAnMDAnKT4+CmVuZG9iagozIDAgb2JqCjw8L0xlbmd0aCAwPj4gc3RyZWFtCgplbmRzdHJlYW0KZW5kb2JqCjIgMCBvYmoKPDwvVHlwZSAvUGFnZQovUmVzb3VyY2VzIDw8L1Byb2NTZXQgWy9QREYgL1RleHQgL0ltYWdlQiAvSW1hZ2VDIC9JbWFnZUldPj4KL01lZGlhQm94IFswIDAgNjEyIDc5Ml0KL0NvbnRlbnRzIDMgMCBSCi9UYWJzIC9TCi9QYXJlbnQgNCAwIFI+PgplbmRvYmoKNCAwIG9iago8PC9UeXBlIC9QYWdlcwovQ291bnQgMQovS2lkcyBbMiAwIFJdPj4KZW5kb2JqCjUgMCBvYmoKPDwvVHlwZSAvQ2F0YWxvZwovUGFnZXMgNCAwIFIKL1ZpZXdlclByZWZlcmVuY2VzIDw8L1R5cGUgL1ZpZXdlclByZWZlcmVuY2VzCi9EaXNwbGF5RG9jVGl0bGUgdHJ1ZT4+Pj4KZW5kb2JqCnhyZWYKMCA2CjAwMDAwMDAwMDAgNjU1MzUgZiAKMDAwMDAwMDAxNSAwMDAwMCBuIAowMDAwMDAwMzQzIDAwMDAwIG4gCjAwMDAwMDAyOTYgMDAwMDAgbiAKMDAwMDAwMDQ5OCAwMDAwMCBuIAowMDAwMDAwNTUzIDAwMDAwIG4gCnRyYWlsZXIKPDwvU2l6ZSA2Ci9Sb290IDUgMCBSCi9JbmZvIDEgMCBSPj4Kc3RhcnR4cmVmCjY3MAolJUVPRgo='

function blankPdfBuffer(): ArrayBuffer {
  return Uint8Array.from(atob(BLANK_PDF_B64), ch => ch.charCodeAt(0)).buffer
}

describe('extractPdfText — buffer ownership', () => {
  it('does not detach the caller-supplied ArrayBuffer after extraction', async () => {
    const buffer = blankPdfBuffer()
    const originalByteLength = buffer.byteLength

    await extractPdfText(buffer)

    expect(buffer.byteLength).toBe(originalByteLength)
  })
})
