import { ChevronDown, ChevronRight, Folder, FolderPlus, Home } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { basename, dirname, isWithin, joinPath, NotFoundError, type SafeStorage } from '@/core/storage';
import { sanitizeFileName } from '@/core/uploads/names';
import { Button, Dialog, TextField } from '@/ui';
import { useIsWide } from '@/ui/useMediaQuery';
import { folderLabel } from './folderLabel';
import styles from './FolderPicker.module.css';

interface FolderInfo {
  folders: string[];
  files: number;
  error?: boolean;
}

interface FolderPickerProps {
  storage: SafeStorage;
  home: string;
  appRoot: string;
  excluded: string[];
  initial: string;
  onSelect: (path: string) => void;
  onClose: () => void;
}

/**
 * Folder picker for uploads (F10 §4.2): all folders of the home except _BandApp and hidden ones,
 * no compact paths, "Neuer Ordner" (created only when the upload is saved).
 * Phone: step into folders; tablet/desktop: expandable tree.
 */
export function FolderPicker({ storage, home, appRoot, excluded, initial, onSelect, onClose }: FolderPickerProps) {
  const { t } = useTranslation('uploads');
  const wide = useIsWide();
  const [cache, setCache] = useState<Record<string, FolderInfo>>({});
  const [virtual, setVirtual] = useState<Record<string, string[]>>({});
  const [current, setCurrent] = useState(isWithin(initial, home) && !isWithin(initial, appRoot) ? initial : home);
  const [expanded, setExpanded] = useState<Set<string>>(() => {
    const set = new Set<string>([home]);
    for (let p = dirname(initial); isWithin(p, home) && p !== home; p = dirname(p)) set.add(p);
    return set;
  });
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [notice, setNotice] = useState<string | null>(null);
  const [confirmExcluded, setConfirmExcluded] = useState(false);

  const isVirtual = useCallback((path: string) => Object.values(virtual).some((list) => list.includes(path)), [virtual]);

  const load = useCallback(
    async (path: string) => {
      if (cache[path] || isVirtual(path)) return;
      try {
        const entries = await storage.list(path);
        const folders = entries
          .filter((e) => e.type === 'folder' && !e.name.startsWith('.') && !isWithin(e.path, appRoot))
          .map((e) => e.path)
          .sort((a, b) => basename(a).localeCompare(basename(b), 'de', { numeric: true }));
        setCache((c) => ({ ...c, [path]: { folders, files: entries.filter((e) => e.type === 'file').length } }));
      } catch (error) {
        // a suggested folder that doesn't exist yet (e.g. the standard upload folder) becomes a "new" folder
        if (error instanceof NotFoundError && path !== home) {
          setVirtual((v) => ({ ...v, [dirname(path)]: [...new Set([...(v[dirname(path)] ?? []), path])] }));
        } else setCache((c) => ({ ...c, [path]: { folders: [], files: 0, error: true } }));
      }
    },
    [appRoot, cache, home, isVirtual, storage],
  );

  // load what is visible
  useEffect(() => {
    const needed = wide ? [...expanded] : [current];
    for (let p = current; isWithin(p, home); p = dirname(p)) {
      needed.push(p);
      if (p === home) break;
    }
    needed.forEach((p) => void load(p));
  }, [wide, expanded, current, home, load]);

  const children = (path: string) => [...(cache[path]?.folders ?? []), ...(virtual[path] ?? []).filter((v) => !cache[path]?.folders.includes(v))];

  const createFolder = (event: FormEvent) => {
    event.preventDefault();
    const name = sanitizeFileName(newName);
    if (!name) return;
    const existing = children(current).find((p) => basename(p).toLocaleLowerCase('de') === name.toLocaleLowerCase('de'));
    const target = existing ?? joinPath(current, name);
    if (existing) setNotice(t('folderExists'));
    else setVirtual((v) => ({ ...v, [current]: [...(v[current] ?? []), target] }));
    setExpanded((s) => new Set([...s, current]));
    setCurrent(target);
    setCreating(false);
    setNewName('');
  };

  const isExcluded = excluded.some((e) => isWithin(current, e));
  const choose = () => {
    if (isExcluded && !confirmExcluded) {
      setConfirmExcluded(true);
      return;
    }
    onSelect(current);
  };

  const crumbs = useMemo(() => {
    const list: string[] = [];
    for (let p = current; isWithin(p, home); p = dirname(p)) {
      list.unshift(p);
      if (p === home) break;
    }
    return list;
  }, [current, home]);

  const name = (path: string) => (path === home ? t('home') : basename(path));

  const renderTree = (path: string, depth: number): ReactNode => {
    const open = expanded.has(path);
    const info = cache[path];
    return (
      <li key={path}>
        <div className={styles.treeRow} data-selected={path === current || undefined} style={{ paddingLeft: `${depth * 18 + 4}px` }}>
          <button
            type="button"
            className={styles.toggle}
            aria-label={open ? `${name(path)} zuklappen` : `${name(path)} aufklappen`}
            onClick={() => setExpanded((s) => (s.has(path) ? new Set([...s].filter((x) => x !== path)) : new Set([...s, path])))}
          >
            {open ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
          </button>
          <button type="button" className={styles.treeName} onClick={() => setCurrent(path)} aria-current={path === current || undefined}>
            {path === home ? <Home size={18} aria-hidden="true" /> : <Folder size={18} aria-hidden="true" />}
            <span>{name(path)}</span>
            {isVirtual(path) && <span className={styles.newBadge}>{t('newBadge')}</span>}
            {info && info.files > 0 && <span className={styles.count}>{t('files', { count: info.files })}</span>}
          </button>
        </div>
        {open && <ul className={styles.tree}>{children(path).map((child) => renderTree(child, depth + 1))}</ul>}
      </li>
    );
  };

  return (
    <Dialog open title={t('pickFolder')} closeLabel={t('close')} onClose={onClose} fullScreenOnPhone>
      <div className={styles.picker}>
        {wide ? (
          <ul className={`${styles.tree} ${styles.treeRoot}`}>{renderTree(home, 0)}</ul>
        ) : (
          <>
            <nav className={styles.crumbs} aria-label={t('saveIn')}>
              {crumbs.map((p, i) => (
                <span key={p} className={styles.crumb}>
                  {i > 0 && <ChevronRight size={14} aria-hidden="true" />}
                  <button type="button" onClick={() => setCurrent(p)} aria-current={p === current || undefined}>
                    {name(p)}
                  </button>
                </span>
              ))}
            </nav>
            <ul className={styles.list}>
              {cache[current]?.error && <li className={styles.hint}>{t('folderError')}</li>}
              {!cache[current] && !isVirtual(current) && <li className={styles.hint}>{t('loadingFolders')}</li>}
              {(cache[current] || isVirtual(current)) && !cache[current]?.error && children(current).length === 0 && <li className={styles.hint}>{t('noSubfolders')}</li>}
              {children(current).map((child) => (
                <li key={child}>
                  <button type="button" className={styles.listRow} onClick={() => setCurrent(child)}>
                    <Folder size={20} aria-hidden="true" />
                    <span className={styles.listName}>{basename(child)}</span>
                    {isVirtual(child) && <span className={styles.newBadge}>{t('newBadge')}</span>}
                    <ChevronRight size={18} aria-hidden="true" />
                  </button>
                </li>
              ))}
            </ul>
          </>
        )}

        {notice && <p className={styles.hint}>{notice}</p>}
        {creating ? (
          <form className={styles.newForm} onSubmit={createFolder}>
            <TextField label={t('newFolderName')} value={newName} onChange={(e) => setNewName(e.target.value)} maxLength={80} autoFocus />
            <Button type="submit" disabled={!newName.trim()}>
              {t('create')}
            </Button>
          </form>
        ) : (
          <Button variant="ghost" icon={<FolderPlus size={18} />} onClick={() => setCreating(true)}>
            {t('newFolder')}
          </Button>
        )}

        {isExcluded && <p className={styles.warning}>{t('excludedWarning')}</p>}
        <div className={styles.footer}>
          <span className={styles.target}>
            {t('saveIn')}: <strong>{folderLabel(current, home, t('home'))}</strong>
          </span>
          <Button variant="primary" onClick={choose}>
            {isExcluded && confirmExcluded ? t('saveAnyway') : t('saveHere')}
          </Button>
        </div>
      </div>
    </Dialog>
  );
}

interface FolderFieldProps {
  label: string;
  value: string;
  onChange: (path: string) => void;
  storage: SafeStorage;
  home: string;
  appRoot: string;
  excluded: string[];
}

/** "Speichern in: Band / Proben / 2026 · Ändern" (F10 §4.1). */
export function FolderField({ label, value, onChange, ...pickerProps }: FolderFieldProps) {
  const { t } = useTranslation('uploads');
  const [open, setOpen] = useState(false);
  return (
    <div className={styles.field}>
      <span className={styles.fieldLabel}>{label}</span>
      <div className={styles.fieldRow}>
        <Folder size={18} aria-hidden="true" />
        <span className={styles.fieldValue}>{folderLabel(value, pickerProps.home, t('home'))}</span>
        <Button variant="ghost" onClick={() => setOpen(true)} aria-label={`${label}: ${t('change')}`}>
          {t('change')}
        </Button>
      </div>
      {open && (
        <FolderPicker
          {...pickerProps}
          initial={value}
          onClose={() => setOpen(false)}
          onSelect={(path) => {
            onChange(path);
            setOpen(false);
          }}
        />
      )}
    </div>
  );
}
