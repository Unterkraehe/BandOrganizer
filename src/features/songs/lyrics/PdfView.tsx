import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { loadPdfJs } from '@/core/lyrics/renderers';
import styles from './Lyrics.module.css';

/** Renders all pages of a PDF, fit to width, zoomable (F4 §6.3). */
export function PdfView({ data, zoom }: { data: ArrayBuffer; zoom: number }) {
  const { t } = useTranslation('songs');
  const container = useRef<HTMLDivElement>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const host = container.current;
    if (!host) return;
    (async () => {
      try {
        const pdfjs = await loadPdfJs();
        const pdf = await pdfjs.getDocument({ data: data.slice(0) }).promise;
        if (cancelled) return;
        host.replaceChildren();
        const width = host.clientWidth * zoom;
        const ratio = window.devicePixelRatio || 1;
        for (let i = 1; i <= pdf.numPages && !cancelled; i++) {
          const page = await pdf.getPage(i);
          const base = page.getViewport({ scale: 1 });
          const viewport = page.getViewport({ scale: (width / base.width) * ratio });
          const canvas = document.createElement('canvas');
          canvas.width = viewport.width;
          canvas.height = viewport.height;
          canvas.style.width = `${viewport.width / ratio}px`;
          canvas.setAttribute('aria-label', t('lyrics.page', { page: i }));
          host.appendChild(canvas);
          await page.render({ canvasContext: canvas.getContext('2d')!, viewport }).promise;
        }
      } catch (e) {
        console.error('PDF rendering failed', e);
        if (!cancelled) setError(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [data, zoom, t]);

  if (error) return <p className={styles.hint}>{t('lyrics.loadError')}</p>;
  return <div ref={container} className={styles.pdf} />;
}
