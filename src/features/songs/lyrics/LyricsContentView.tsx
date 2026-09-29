import type { LyricsContent } from '@/core/lyrics/renderers';
import { PdfView } from './PdfView';
import styles from './Lyrics.module.css';

/** Renders loaded lyrics at a size factor (text/html) or zoom (PDF). */
export function LyricsContentView({ content, size, baseRem = 1.125 }: { content: LyricsContent; size: number; baseRem?: number }) {
  if (content.kind === 'text')
    return (
      <div className={styles.text} style={{ fontSize: `${size * baseRem}rem` }}>
        {content.text}
      </div>
    );
  if (content.kind === 'html') return <div className={styles.html} style={{ fontSize: `${size * baseRem}rem` }} dangerouslySetInnerHTML={{ __html: content.html }} />;
  if (content.kind === 'pdf') return <PdfView data={content.data} zoom={size} />;
  return null;
}
