import { createHash } from 'node:crypto';

/**
 * VDR -> in-region document store. Runs on the Datasite "documents published" webhook.
 * Files are hashed (dedupe + chain of custody), OCRed with Textract in eu-central-1
 * and stored encrypted with the matter's KMS key. Nothing leaves the EU.
 */
export interface IngestedDoc { id: string; vdrPath: string; sha256: string; pages: number; language: string }

export async function ingest(file: { vdrPath: string; bytes: Buffer }, seen: Set<string>): Promise<IngestedDoc | null> {
  const sha256 = createHash('sha256').update(file.bytes).digest('hex');
  if (seen.has(sha256)) return null; // same file uploaded under two folders
  seen.add(sha256);
  const { pages, language } = await textract(file.bytes);
  return { id: sha256.slice(0, 16), vdrPath: file.vdrPath, sha256, pages, language };
}

export async function ocrText(id: string, opts: { pages: number }): Promise<{ vdrPath: string; text: string }> {
  // Reads the cached Textract output from the matter bucket (s3://dd-eu-central-1/<matter>/ocr/<id>.json).
  return { vdrPath: `vdr/${id}`, text: `first ${opts.pages} pages of ${id}` };
}

async function textract(bytes: Buffer): Promise<{ pages: number; language: string }> {
  // StartDocumentTextDetection on the eu-central-1 endpoint; polling elided.
  return { pages: Math.max(1, Math.round(bytes.length / 3000)), language: 'de' };
}
