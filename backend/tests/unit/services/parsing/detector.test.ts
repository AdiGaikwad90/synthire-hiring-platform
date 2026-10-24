import { describe, it, expect } from 'vitest'
import {
  detectFileType,
  getExtension,
  getContentType,
  hasReadableResumeText,
  MIN_RESUME_TEXT_CHARS,
} from '../../../../src/services/parsing/detector'

/**
 * This is a SECURITY boundary: it is the only thing standing between an
 * uploaded blob and the parsers. It deliberately reads magic bytes rather than
 * trusting the filename or the client-supplied Content-Type.
 */

const buf = (...bytes: number[]) => new Uint8Array(bytes).buffer
const PDF = [0x25, 0x50, 0x44, 0x46] // %PDF
const ZIP = [0x50, 0x4b, 0x03, 0x04] // PK\x03\x04 — DOCX is a zip

describe('detectFileType — accepts real files', () => {
  it('detects a PDF from its %PDF header', () => {
    expect(detectFileType(buf(...PDF, 0x2d, 0x31, 0x2e, 0x34))).toBe('pdf')
  })

  it('detects a DOCX from its PK zip header', () => {
    expect(detectFileType(buf(...ZIP, 0x14, 0x00, 0x00, 0x00))).toBe('docx')
  })

  it('reads only the header, so file length beyond it is irrelevant', () => {
    const long = new Uint8Array(4096)
    long.set(PDF, 0)
    expect(detectFileType(long.buffer)).toBe('pdf')
  })
})

describe('detectFileType — rejects everything else', () => {
  it('rejects an executable masquerading as a resume', () => {
    expect(detectFileType(buf(0x4d, 0x5a, 0x90, 0x00))).toBeNull() // MZ / .exe
    expect(detectFileType(buf(0x7f, 0x45, 0x4c, 0x46))).toBeNull() // ELF
  })

  it('rejects images', () => {
    expect(detectFileType(buf(0xff, 0xd8, 0xff, 0xe0))).toBeNull() // JPEG
    expect(detectFileType(buf(0x89, 0x50, 0x4e, 0x47))).toBeNull() // PNG — note byte 1 is 'P'
  })

  it('rejects plain text even though the extension might say .pdf', () => {
    expect(detectFileType(buf(...new TextEncoder().encode('Dear hiring manager')))).toBeNull()
  })

  it('rejects a near-miss PDF header (one byte off)', () => {
    expect(detectFileType(buf(0x25, 0x50, 0x44, 0x47))).toBeNull() // %PDG
    expect(detectFileType(buf(0x26, 0x50, 0x44, 0x46))).toBeNull() // &PDF
  })

  it('rejects the magic bytes appearing later in the file', () => {
    expect(detectFileType(buf(0x00, ...PDF))).toBeNull()
  })
})

describe('detectFileType — degenerate input', () => {
  it('returns null for an empty buffer instead of throwing', () => {
    expect(detectFileType(new ArrayBuffer(0))).toBeNull()
  })

  it('returns null for a truncated header instead of throwing', () => {
    expect(detectFileType(buf(0x25))).toBeNull()
    expect(detectFileType(buf(0x25, 0x50))).toBeNull()
    expect(detectFileType(buf(0x25, 0x50, 0x44))).toBeNull()
  })

  it('accepts a PK header only two bytes long, which is all DOCX needs', () => {
    // Documents current behaviour: DOCX detection checks 2 bytes, PDF checks 4.
    expect(detectFileType(buf(0x50, 0x4b))).toBe('docx')
  })

  it('never throws for any short buffer', () => {
    for (let n = 0; n <= 8; n++) {
      expect(() => detectFileType(new ArrayBuffer(n)), `threw at length ${n}`).not.toThrow()
    }
  })
})

describe('getExtension / getContentType', () => {
  it('maps pdf', () => {
    expect(getExtension('pdf')).toBe('pdf')
    expect(getContentType('pdf')).toBe('application/pdf')
  })

  it('maps docx', () => {
    expect(getExtension('docx')).toBe('docx')
    expect(getContentType('docx')).toBe(
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    )
  })
})

// Regression: a blank or image-only PDF extracts to "", and the parse model
// then INVENTED a candidate ("John Doe") and the pipeline scored it 32%. Found
// in the live-app Playwright pass. Nothing may reach the model without text.
describe('hasReadableResumeText — happy path', () => {
  it('accepts real resume text', () => {
    expect(hasReadableResumeText('Priya Raman — backend engineer, 6 years of Go and PostgreSQL.')).toBe(true)
  })
})

describe('hasReadableResumeText — boundaries', () => {
  it(`rejects text shorter than ${MIN_RESUME_TEXT_CHARS} characters and accepts exactly that many`, () => {
    expect(hasReadableResumeText('x'.repeat(MIN_RESUME_TEXT_CHARS - 1))).toBe(false)
    expect(hasReadableResumeText('x'.repeat(MIN_RESUME_TEXT_CHARS))).toBe(true)
  })

  it('measures after trimming whitespace', () => {
    expect(hasReadableResumeText(' \n\t'.repeat(100) + 'short')).toBe(false)
  })
})

describe('hasReadableResumeText — empty / invalid', () => {
  it.each([['empty string', ''], ['whitespace only', '   \n\n  '], ['null', null], ['undefined', undefined]])(
    'rejects %s', (_n, v) => {
      expect(hasReadableResumeText(v as string)).toBe(false)
    },
  )
})
// Error contract: N/A — returns a boolean; the caller throws.
