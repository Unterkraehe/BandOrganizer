import { describe, expect, it } from 'vitest';
import { canRender, decodeText, loadLyrics, sanitizeHtml } from './renderers';

describe('lyrics renderers (F4 §6.3)', () => {
  it('decodes UTF-8 and old Windows text files', async () => {
    await expect(decodeText(new Blob(['Grüße'], { type: 'text/plain' }))).resolves.toBe('Grüße');
    await expect(decodeText(new Blob([new Uint8Array([0x47, 0x72, 0xfc, 0xdf, 0x65])]))).resolves.toBe('Grüße');
  });

  it('keeps simple formatting and removes everything else', () => {
    expect(sanitizeHtml('<p style="x"><strong>Stimme 1</strong> <a href="javascript:x">link</a><img src=x onerror=alert(1)></p><script>alert(1)</script>')).toBe(
      '<p><strong>Stimme 1</strong> link</p>alert(1)',
    );
  });

  it('knows which formats it can show', async () => {
    expect(canRender('a.PDF')).toBe(true);
    expect(canRender('a.doc')).toBe(false);
    await expect(loadLyrics(new Blob(['x']), 'a.pages')).resolves.toEqual({ kind: 'unsupported' });
    await expect(loadLyrics(new Blob(['Zeile 1']), 'a.txt')).resolves.toEqual({ kind: 'text', text: 'Zeile 1' });
  });
});
