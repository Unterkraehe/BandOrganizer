import { Layers, Star } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNotify } from '@/app/notify/NotifyProvider';
import { formatDateWithYear, formatDuration } from '@/core/i18n/format';
import { useSession } from '@/core/session/BandSession';
import { Button, ConfirmDialog, Dialog, Menu, TextField } from '@/ui';
import { useLibrary } from './LibraryProvider';
import { recordingName, versionSuggestions, type Recording, type Song } from './model';
import { usePlaySong } from './usePlaySong';
import styles from './SongDetail.module.css';

/** Versions & Band-Version (F4 §4.4, §6.8) plus suggestions for similar songs. */
export function VersionsSection({ song, onSelect }: { song: Song; onSelect: (recording: Recording) => void }) {
  const { t } = useTranslation('songs');
  const notify = useNotify();
  const { store, songs } = useLibrary();
  const { members } = useSession();
  const { play } = usePlaySong();
  const [confirmBand, setConfirmBand] = useState<Recording | null>(null);
  const [renaming, setRenaming] = useState<Recording | null>(null);
  const [label, setLabel] = useState('');
  const suggestions = versionSuggestions(song, songs);
  const setBy = members.find((m) => m.id === song.bandVersionSetBy);
  const fail = () => notify({ message: t('failed') });

  return (
    <section className={styles.versions}>
      <h2 className={styles.sectionTitle}>{t('versions.title')}</h2>
      <ul className={styles.versionList}>
        {song.recordings.map((rec) => {
          const isBand = rec.id === song.recording.id;
          const meta = [rec.missing ? t('missingFile') : null, rec.durationSec ? formatDuration(rec.durationSec) : null, rec.folder || t('rootFolder'), rec.label ? rec.fileName : null]
            .filter(Boolean)
            .join(' · ');
          return (
            <li key={rec.id} className={styles.version} data-missing={rec.missing || undefined}>
              <button
                type="button"
                className={styles.versionMain}
                onClick={() => {
                  onSelect(rec);
                  play(song, rec);
                }}
                disabled={rec.missing}
                aria-label={`${t('versions.play')}: ${recordingName(rec)}`}
              >
                <span className={styles.versionName}>
                  {recordingName(rec)}
                  {isBand && (
                    <span className={styles.bandBadge}>
                      <Star size={12} fill="currentColor" aria-hidden="true" />
                      {t('versions.band')}
                    </span>
                  )}
                </span>
                <span className={styles.versionMeta}>{meta}</span>
              </button>
              <Menu
                label={t('versions.menu')}
                items={[
                  { label: t('versions.setBand'), onSelect: () => setConfirmBand(rec), hidden: isBand || rec.missing },
                  {
                    label: t('versions.rename'),
                    onSelect: () => {
                      setLabel(rec.label ?? '');
                      setRenaming(rec);
                    },
                  },
                  {
                    label: t('versions.split'),
                    hidden: rec.originSongId === song.id,
                    onSelect: () =>
                      void store
                        .split(song.id, rec.id)
                        .then(() => notify({ message: t('versions.splitDone', { title: recordingName(rec) }) }))
                        .catch(fail),
                  },
                ]}
              />
            </li>
          );
        })}
      </ul>
      {song.recordings.length > 1 && setBy && song.bandVersionSetAt && (
        <p className={styles.hint}>{t('versions.setBy', { name: setBy.displayName, date: formatDateWithYear(song.bandVersionSetAt) })}</p>
      )}

      {suggestions.length > 0 && (
        <div className={styles.suggestions}>
          <h3 className={styles.subTitle}>{t('versions.suggestions')}</h3>
          <p className={styles.hint}>{t('versions.suggestionHint')}</p>
          <ul className={styles.versionList}>
            {suggestions.map((other) => (
              <li key={other.id} className={styles.version}>
                <span className={styles.versionMain}>
                  <span className={styles.versionName}>{other.title}</span>
                  <span className={styles.versionMeta}>{other.recording.folder || t('rootFolder')}</span>
                </span>
                <Button
                  icon={<Layers size={18} />}
                  onClick={() =>
                    void store
                      .mergeInto(other.id, song.id)
                      .then(() => notify({ message: t('versions.merged', { source: other.title, target: song.title }) }))
                      .catch(fail)
                  }
                >
                  {t('versions.addAsVersion')}
                </Button>
              </li>
            ))}
          </ul>
        </div>
      )}

      <ConfirmDialog
        open={confirmBand !== null}
        title={t('versions.setBandConfirmTitle', { version: confirmBand ? recordingName(confirmBand) : '' })}
        text={t('versions.setBandConfirm')}
        confirmLabel={t('versions.setBand')}
        cancelLabel={t('common:actions.cancel')}
        onCancel={() => setConfirmBand(null)}
        onConfirm={() => {
          const rec = confirmBand;
          setConfirmBand(null);
          if (rec) void store.setBandVersion(song.id, rec.id).catch(fail);
        }}
      />

      <Dialog open={renaming !== null} title={t('versions.rename')} closeLabel={t('common:actions.close')} onClose={() => setRenaming(null)}>
        <form
          className={styles.renameForm}
          onSubmit={(event) => {
            event.preventDefault();
            const rec = renaming;
            setRenaming(null);
            if (rec) void store.setRecordingLabel(song.id, rec.id, label).catch(fail);
          }}
        >
          <TextField
            label={t('versions.renameLabel')}
            placeholder={t('versions.renamePlaceholder')}
            value={label}
            onChange={(event) => setLabel(event.target.value)}
            maxLength={60}
            autoFocus
          />
          <div className={styles.noteFormActions}>
            <Button type="submit" variant="primary">
              {t('common:actions.save')}
            </Button>
          </div>
        </form>
      </Dialog>
    </section>
  );
}
