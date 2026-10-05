import { extractText } from 'unpdf'

export async function extractPdfText(buffer: ArrayBuffer): Promise<string> {
  // unpdf's pdf.js transfers (detaches) the ArrayBuffer backing the typed
  // array it's given. Callers reuse the same buffer afterwards (e.g. to
  // upload the original file to R2), so hand pdf.js a copy, never the original.
  const { text } = await extractText(new Uint8Array(buffer.slice(0)), { mergePages: true })
  return (text as string).trim()
}
