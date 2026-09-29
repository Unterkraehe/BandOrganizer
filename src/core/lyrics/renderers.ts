import { extensionOf } from '@/core/files/scan';

/**
 * Lyrics renderers per file format (F4 §6.3, pluggable). Adding a format = adding one entry.
 * Heavy libraries (mammoth, pdf.js) are loaded only when needed.
 */

export type LyricsContent =
  | { kind: 'text'; text: string }
  | { kind: 'html'; html: string; text: string }
  | { kind: 'pdf'; data: ArrayBuffer }
  | { kind: 'unsupported' };

interface LyricsRenderer {
  extensions: string[];
  load: (blob: Blob) => Promise<LyricsContent>;
}

/** UTF-8 first; old Windows text files fall back to windows-1252 (umlauts). */
export async function decodeText(blob: Blob): Promise<string> {
  const buffer = await blob.arrayBuffer();
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(buffer).replace(/^\uFEFF/, '');
  } catch {
    return new TextDecoder('windows-1252').decode(buffer);
  }
}

const ALLOWED_TAGS = new Set(['P', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'STRONG', 'B', 'EM', 'I', 'U', 'UL', 'OL', 'LI', 'BR', 'TABLE', 'THEAD', 'TBODY', 'TR', 'TD', 'TH', 'SUP', 'SUB', 'SPAN']);

/** Keeps only simple formatting tags, no attributes, no links/images/scripts. */
export function sanitizeHtml(html: string): string {
  const doc = new DOMParser().parseFromString(`<div>${html}</div>`, 'text/html');
  const clean = (node: Element) => {
    for (const child of [...node.children]) {
      if (!ALLOWED_TAGS.has(child.tagName)) {
        const text = doc.createTextNode(child.textContent ?? '');
        child.replaceWith(text);
        continue;
      }
      for (const attr of [...child.attributes]) child.removeAttribute(attr.name);
      clean(child);
    }
  };
  const root = doc.body.firstElementChild!;
  clean(root);
  return root.innerHTML;
}

const renderers: LyricsRenderer[] = [
  {
    extensions: ['txt'],
    load: async (blob) => ({ kind: 'text', text: await decodeText(blob) }),
  },
  {
    extensions: ['docx'],
    load: async (blob) => {
      const mammoth = (await import('mammoth')).default;
      const arrayBuffer = await blob.arrayBuffer();
      const [html, raw] = await Promise.all([mammoth.convertToHtml({ arrayBuffer }), mammoth.extractRawText({ arrayBuffer })]);
      return { kind: 'html', html: sanitizeHtml(html.value), text: raw.value.trim() };
    },
  },
  {
    extensions: ['pdf'],
    load: async (blob) => ({ kind: 'pdf', data: await blob.arrayBuffer() }),
  },
];

export const canRender = (fileName: string) => renderers.some((r) => r.extensions.includes(extensionOf(fileName)));

export async function loadLyrics(blob: Blob, fileName: string): Promise<LyricsContent> {
  const renderer = renderers.find((r) => r.extensions.includes(extensionOf(fileName)));
  return renderer ? renderer.load(blob) : { kind: 'unsupported' };
}

/** Plain text for "Als Text übernehmen" and search; null if the file has no real text (scans). */
export async function extractText(content: LyricsContent): Promise<string | null> {
  if (content.kind === 'text' || content.kind === 'html') return content.text || null;
  if (content.kind !== 'pdf') return null;
  const pdfjs = await loadPdfJs();
  const pdf = await pdfjs.getDocument({ data: content.data.slice(0) }).promise;
  const pages: string[] = [];
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const text = await page.getTextContent();
    let line = '';
    const lines: string[] = [];
    for (const item of text.items) {
      if (!('str' in item)) continue;
      line += item.str;
      if (item.hasEOL) {
        lines.push(line);
        line = '';
      }
    }
    if (line) lines.push(line);
    pages.push(lines.join('\n'));
  }
  const all = pages.join('\n\n').trim();
  return all || null;
}

// Legacy build: works on older iOS Safari versions too (R-UI-01, mobile first)
let pdfjsPromise: Promise<typeof import('pdfjs-dist')> | null = null;

export function loadPdfJs() {
  pdfjsPromise ??= Promise.all([
    import('pdfjs-dist/legacy/build/pdf.mjs') as Promise<typeof import('pdfjs-dist')>,
    import('pdfjs-dist/legacy/build/pdf.worker.min.mjs?url'),
  ]).then(([pdfjs, worker]) => {
    pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
    return pdfjs;
  });
  return pdfjsPromise;
}
