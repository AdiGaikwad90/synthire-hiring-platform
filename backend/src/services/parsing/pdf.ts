// Uses pdf-parse package (available via nodejs_compat)
import pdfParse from 'pdf-parse'

export async function extractPdfText(buffer: ArrayBuffer): Promise<string> {
  const result = await pdfParse(Buffer.from(buffer))
  return result.text.trim()
}
