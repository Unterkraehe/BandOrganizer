import { ChevronRight, FileImage, Folder } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { isLogoFileName, LOGO_MAX_BYTES, readLogo, type LogoVariant } from '@/core/band/logo';
import { basename, dirname, isWithin, type FileEntry, type SafeStorage } from '@/core/storage';
import { Button, Dialog } from '@/ui';
import pickerStyles from './LogoFilePicker.module.css';
import styles from './Settings.module.css';

interface FolderContent {
  folders: FileEntry[];
  images: FileEntry[];
  error?: boolean;
}

interface LogoFilePickerProps {
  storage: SafeStorage;
  home: string;
  appRoot: string;
  variant: LogoVariant;
  onSelect: (path: string) => void;
  onClose: () => void;
}

const byName = (a: FileEntry, b: FileEntry) => a.name.localeCompare(b.name, 'de', { numeric: true });

/**
 * Picks an existing SVG/PNG from the HiDrive as band logo (design system §8): step into folders
 * (all of the home except _BandApp and hidden ones), tap an image, see it on the logo's background, confirm.
 */
export function LogoFilePicker({ storage, home, appRoot, variant, onSelect, onClose }: LogoFilePickerProps) {
  const { t } = useTranslation('band');
  const [current, setCurrent] = useState(home);
  const [content, setContent] = useState<Record<string, FolderContent>>({});
  const [selected, setSelected] = useState<string | null>(null);
  const [preview, setPreview] = useState<string | null>(null);

  useEffect(() => {
    if (content[current]) return;
    let cancelled = false;
    void storage
      .list(current)
      .then((entries): FolderContent => {
        const visible = entries.filter((e) => !e.name.startsWith('.') && !isWithin(e.path, appRoot));
        return {
          folders: visible.filter((e) => e.type === 'folder').sort(byName),
          images: visible.filter((e) => e.type === 'file' && isLogoFileName(e.name)).sort(byName),
        };
      })
      .catch((): FolderContent => ({ folders: [], images: [], error: true }))
      .then((result) => {
        if (!cancelled) setContent((c) => ({ ...c, [current]: result }));
      });
    return () => {
      cancelled = true;
    };
  }, [appRoot, content, current, storage]);

  useEffect(() => {
    setPreview(null);
    if (!selected) return;
    let url: string | null = null;
    let cancelled = false;
    void readLogo(storage, selected)
      .then((blob) => {
        if (cancelled) return;
        url = URL.createObjectURL(blob);
        setPreview(url);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
      if (url) URL.revokeObjectURL(url);
    };
  }, [selected, storage]);

  const crumbs = useMemo(() => {
    const list: string[] = [];
    for (let p = current; isWithin(p, home); p = dirname(p)) {
      list.unshift(p);
      if (p === home) break;
    }
    return list;
  }, [current, home]);

  const open = (path: string) => {
    setCurrent(path);
    setSelected(null);
  };

  const folder = content[current];
  const name = (path: string) => (path === home ? t('uploads:home') : basename(path));

  return (
    <Dialog open title={t('settings.logoPickTitle')} closeLabel={t('common:actions.close')} onClose={onClose} fullScreenOnPhone>
      <div className={pickerStyles.picker}>
        <nav className={pickerStyles.crumbs} aria-label={t('settings.logoPickFolder')}>
          {crumbs.map((p, i) => (
            <span key={p} className={pickerStyles.crumb}>
              {i > 0 && <ChevronRight size={14} aria-hidden="true" />}
              <button type="button" onClick={() => open(p)} aria-current={p === current || undefined}>
                {name(p)}
              </button>
            </span>
          ))}
        </nav>

        <ul className={pickerStyles.list}>
          {!folder && <li className={pickerStyles.hint}>{t('uploads:loadingFolders')}</li>}
          {folder?.error && <li className={pickerStyles.hint}>{t('uploads:folderError')}</li>}
          {folder && !folder.error && folder.folders.length + folder.images.length === 0 && <li className={pickerStyles.hint}>{t('settings.logoPickEmpty')}</li>}
          {folder?.folders.map((entry) => (
            <li key={entry.path}>
              <button type="button" className={pickerStyles.row} onClick={() => open(entry.path)}>
                <Folder size={20} aria-hidden="true" />
                <span className={pickerStyles.name}>{entry.name}</span>
                <ChevronRight size={18} aria-hidden="true" />
              </button>
            </li>
          ))}
          {folder?.images.map((entry) => {
            const tooLarge = entry.size !== undefined && entry.size > LOGO_MAX_BYTES;
            return (
              <li key={entry.path}>
                <button
                  type="button"
                  className={pickerStyles.row}
                  onClick={() => setSelected(entry.path)}
                  aria-pressed={entry.path === selected}
                  disabled={tooLarge}
                >
                  <FileImage size={20} aria-hidden="true" />
                  <span className={pickerStyles.name}>{entry.name}</span>
                  {tooLarge && <span className={pickerStyles.note}>{t('settings.logoPickTooLarge')}</span>}
                </button>
              </li>
            );
          })}
        </ul>

        <div className={pickerStyles.footer}>
          {selected ? (
            <div className={variant === 'dark' ? styles.logoPreviewDark : styles.logoPreviewLight}>
              {preview ? <img src={preview} alt="" /> : <span>{basename(selected)}</span>}
            </div>
          ) : (
            <p className={pickerStyles.hint}>{t('settings.logoPickHint')}</p>
          )}
          <Button variant="primary" disabled={!selected} onClick={() => selected && onSelect(selected)}>
            {t('settings.logoPickUse')}
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
