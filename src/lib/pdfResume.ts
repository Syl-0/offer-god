import * as pdfjsLib from 'pdfjs-dist';

export interface PdfExtractResult {
  text: string;
  pageCount: number;
}

/** 需在调用前设置 worker：setPdfWorkerUrl */
export function setPdfWorkerUrl(workerSrc: string): void {
  pdfjsLib.GlobalWorkerOptions.workerSrc = workerSrc;
}

export async function extractTextFromPdfArrayBuffer(buf: ArrayBuffer): Promise<PdfExtractResult> {
  const data = new Uint8Array(buf);
  // 设置 verbosity 为 0 抑制警告
  const doc = await pdfjsLib.getDocument({ data, verbosity: 0 }).promise;
  const pageCount = doc.numPages;
  const parts: string[] = [];
  for (let p = 1; p <= pageCount; p++) {
    const page = await doc.getPage(p);
    const content = await page.getTextContent();
    const strings = content.items.map((it) => ('str' in it ? (it as { str: string }).str : ''));
    parts.push(strings.join(' '));
  }
  const text = normalizeResumeText(parts.join('\n'));
  return { text, pageCount };
}

export function normalizeResumeText(raw: string): string {
  return raw
    .replace(/\s+/g, ' ')
    .replace(/[\u0000-\u001f]/g, ' ')
    .trim();
}

/** 截断过长简历，避免撑爆 storage / token */
export function summarizeResume(text: string, maxChars = 12000): string {
  if (text.length <= maxChars) return text;
  return `${text.slice(0, maxChars)}\n…（已截断）`;
}
