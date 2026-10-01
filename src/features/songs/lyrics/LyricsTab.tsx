import { FilePlus, FileText, Link2, Minus, Plus, Upload, Keyboard } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { useNotify } from '@/app/notify/NotifyProvider';
import { formatDateWithYear } from '@/core/i18n/format';
import { extractText } from '@/core/lyrics/renderers';
import { useSession } from '@/core/session/BandSession';
import { basename } from '@/core/storage';
import { Button, Dialog, IconButton, Menu } from '@/ui';
import { useLibrary } from '../LibraryProvider';
import { lyricsSuggestions, type Song } from '../model';
import { LyricsChooser } from './LyricsChooser';
import { LyricsUploadDialog } from './LyricsUploadDialog';
import { LyricsContentView } from './LyricsContentView';
import { useLyrics } from './useLyrics';
import { useHighlightText } from '@/features/search/useHighlightTarget';
import styles from './Lyrics.module.css';

const SIZE_KEY = 'bandapp.lyrics.size';

/** Songtext tab (F4 §4.2, §6.3; F10 §5.7). */
export function LyricsTab({ song, find }: { song: Song; find?: string | null }) {
  const { t } = useTranslation('songs');
  const navigate = useNavigate();
  const notify = useNotify();
  const { store, state } = useLibrary();
  const { members } = useSession();
  const { content, status } = useLyrics(song);
  const [size, setSize] = useState(() => Number(localStorage.getItem(SIZE_KEY)) || 1);
  const [chooser, setChooser] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [adding, setAdding] = useState(false);
  const [history, setHistory] = useState(false);
  const lyrics = song.lyrics;
  const [contentRoot, setContentRoot] = useState<HTMLElement | null>(null);
  useHighlightText(contentRoot, find ?? null, Boolean(content));

  const changeSize = (delta: number) => {
    const next = Math.min(2, Math.max(0.8, Math.round((size + delta) * 10) / 10));
    setSize(next);
    localStorage.setItem(SIZE_KEY, String(next));
  };

  const openFile = async () => {
    if (!lyrics) return;
    const url = URL.createObjectURL(await store.storage.readBlob(lyrics.path));
    const a = Object.assign(document.createElement('a'), { href: url, download: lyrics.fileName, target: '_blank' });
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  };

  const takeOverText = async () => {
    if (!content) return;
    const text = await extractText(content).catch(() => null);
    if (!text) return notify({ message: t('lyrics.noText') });
    navigate(`/songs/${song.id}/lyrics`, { state: { text } });
  };

  const suggestions = lyrics ? [] : lyricsSuggestions(song, state.documents, store.linkedLyricsPaths());

  const actions = (
    <div className={styles.toolbar}>
      {(content?.kind === 'text' || content?.kind === 'html') && (
        <>
          <IconButton label={t('lyrics.smaller')} icon={<Minus size={18} />} onClick={() => changeSize(-0.1)} />
          <IconButton label={t('lyrics.larger')} icon={<Plus size={18} />} onClick={() => changeSize(0.1)} />
        </>
      )}
      {content?.kind === 'pdf' && (
        <>
          <IconButton label={t('lyrics.smaller')} icon={<Minus size={18} />} onClick={() => changeSize(-0.2)} />
          <IconButton label={t('lyrics.larger')} icon={<Plus size={18} />} onClick={() => changeSize(0.2)} />
        </>
      )}
      <span className={styles.fileName}>{lyrics?.fileName}</span>
      {lyrics?.ext === 'txt' && !lyrics.missing && (
        <Button icon={<Keyboard size={18} />} onClick={() => navigate(`/songs/${song.id}/lyrics`)}>
          {t('lyrics.edit')}
        </Button>
      )}
      <Menu
        label={t('lyrics.menu')}
        items={[
          { label: t('lyrics.fromFile'), onSelect: () => void takeOverText(), hidden: !(content?.kind === 'pdf' || content?.kind === 'html') },
          { label: t('lyrics.other'), onSelect: () => setChooser(true) },
          { label: t('lyrics.upload'), onSelect: () => setUploading(true) },
          { label: t('lyrics.history', { count: song.lyricsHistory.length }), onSelect: () => setHistory(true), hidden: song.lyricsHistory.length === 0 },
          { label: t('lyrics.open'), onSelect: () => void openFile(), hidden: !lyrics || lyrics.missing },
          {
            label: t('lyrics.unlink'),
            danger: true,
            onSelect: () =>
              void store
                .unlinkLyrics(song.id)
                .then(() => notify({ message: t('lyrics.unlinked') }))
                .catch(() => notify({ message: t('failed') })),
          },
        ]}
      />
    </div>
  );

  return (
    <section className={styles.lyrics}>
      {lyrics ? (
        <>
          {actions}
          {lyrics.missing && <p className={styles.hint}>{t('lyrics.missing')}</p>}
          {status === 'loading' && <p className={styles.hint}>{t('lyrics.loading')}</p>}
          {status === 'error' && <p className={styles.hint}>{t('lyrics.loadError')}</p>}
          {content && content.kind !== 'unsupported' && (
            <div ref={setContentRoot}>
              <LyricsContentView content={content} size={size} />
            </div>
          )}
          {content?.kind === 'unsupported' && (
            <div className={styles.empty}>
              <p>{t('lyrics.unsupported')}</p>
              <Button onClick={() => void openFile()}>{t('lyrics.open')}</Button>
            </div>
          )}
        </>
      ) : (
        <div className={styles.empty}>
          <p className={styles.hint}>{t('lyrics.none')}</p>
          {suggestions.length > 0 && (
            <ul className={styles.suggestions}>
              {suggestions.map((doc) => (
                <li key={doc.path}>
                  <FileText size={18} aria-hidden="true" />
                  <span className={styles.fileName}>
                    <strong>{t('lyrics.found')}:</strong> {doc.name}
                  </span>
                  <Button
                    icon={<Link2 size={18} />}
                    onClick={() =>
                      void store
                        .linkLyrics(song.id, doc.path, doc.id)
                        .then(() => notify({ message: t('lyrics.linked') }))
                        .catch(() => notify({ message: t('failed') }))
                    }
                  >
                    {t('lyrics.link')}
                  </Button>
                </li>
              ))}
            </ul>
          )}
          {/* one button, the three ways in a small dialog (R-UX-09: few visible actions) */}
          <div className={styles.emptyActions}>
            <Button icon={<Plus size={18} />} onClick={() => setAdding(true)}>
              {t('lyrics.add')}
            </Button>
          </div>
          <Dialog open={adding} title={t('lyrics.add')} closeLabel={t('common:actions.close')} onClose={() => setAdding(false)}>
            <div className={styles.addChoices}>
              <Button icon={<FilePlus size={18} />} onClick={() => (setAdding(false), setChooser(true))}>
                {t('lyrics.choose')}
              </Button>
              <Button icon={<Upload size={18} />} onClick={() => (setAdding(false), setUploading(true))}>
                {t('lyrics.upload')}
              </Button>
              <Button icon={<Keyboard size={18} />} onClick={() => navigate(`/songs/${song.id}/lyrics`)}>
                {t('lyrics.type')}
              </Button>
            </div>
          </Dialog>
        </div>
      )}

      {chooser && <LyricsChooser song={song} onClose={() => setChooser(false)} />}
      {uploading && <LyricsUploadDialog song={song} onClose={() => setUploading(false)} />}
      <Dialog open={history} title={t('lyrics.historyTitle')} closeLabel={t('common:actions.close')} onClose={() => setHistory(false)}>
        <ul className={styles.suggestions}>
          {song.lyricsHistory.map((h) => (
            <li key={h.path + h.savedAt}>
              <span className={styles.fileName}>
                <strong>{basename(h.path)}</strong>
                <br />
                <small>{t('lyrics.savedBy', { date: formatDateWithYear(h.savedAt), name: members.find((m) => m.id === h.savedBy)?.displayName ?? '?' })}</small>
              </span>
              <Button
                onClick={() => {
                  setHistory(false);
                  void store.linkLyrics(song.id, h.path).catch(() => notify({ message: t('failed') }));
                }}
              >
                {t('lyrics.restore')}
              </Button>
            </li>
          ))}
        </ul>
      </Dialog>
    </section>
  );
}
