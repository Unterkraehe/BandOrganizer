import { FileUp } from 'lucide-react';
import { useId, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/ui';
import styles from './FolderPicker.module.css';

/** File chooser with the chosen name shown next to it (uses the system picker, F10 §8). */
export function FileInput({ label, accept, file, onFile, error, hint }: { label: string; accept: string; file: File | null; onFile: (file: File | null) => void; error?: string | null; hint?: string }) {
  const { t } = useTranslation('uploads');
  const input = useRef<HTMLInputElement>(null);
  const id = useId();
  return (
    <div className={styles.field}>
      <label htmlFor={id} className={styles.fieldLabel}>
        {label}
      </label>
      <div className={styles.fieldRow}>
        <span className={styles.fieldValue}>{file ? file.name : t('noFile')}</span>
        <Button variant="ghost" icon={<FileUp size={18} />} onClick={() => input.current?.click()}>
          {t('chooseFile')}
        </Button>
      </div>
      <input
        ref={input}
        id={id}
        type="file"
        accept={accept}
        hidden
        onChange={(event) => {
          onFile(event.target.files?.[0] ?? null);
          event.target.value = '';
        }}
      />
      {hint && !error && <span className={styles.target}>{hint}</span>}
      {error && (
        <span className={styles.warning} role="alert">
          {error}
        </span>
      )}
    </div>
  );
}

export const AUDIO_ACCEPT = '.mp3,.m4a,.wav,.ogg,.flac,.aac,audio/*';
export const LYRICS_ACCEPT = '.pdf,.docx,.txt,.doc,.odt,.rtf,.pages';
