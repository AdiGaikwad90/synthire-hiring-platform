export type FileType = 'pdf' | 'docx'

export function detectFileType(buffer: ArrayBuffer): FileType | null {
  const bytes = new Uint8Array(buffer.slice(0, 8))

  // PDF: %PDF (25 50 44 46)
  if (bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46) {
    return 'pdf'
  }

  // DOCX: PK (50 4B) — ZIP-based format
  if (bytes[0] === 0x50 && bytes[1] === 0x4b) {
    return 'docx'
  }

  return null
}

export function getExtension(type: FileType): string {
  return type === 'pdf' ? 'pdf' : 'docx'
}

export function getContentType(type: FileType): string {
  return type === 'pdf'
    ? 'application/pdf'
    : 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
}
