import { ChevronDown, ChevronRight, Folder, Home } from 'lucide-react';
import { useMemo, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { useSearchParams } from 'react-router-dom';
import { useIsWide } from '@/ui/useMediaQuery';
import type { Recording, Song } from './model';
import styles from './Songs.module.css';

/** Folder view of the song list (F4 §4.1a). */

interface Entry {
  song: Song;
  recording: Recording;
}

interface Node {
  /** relative path, "" = home */
  path: string;
  /** compact display name ("Band / Aufnahmen / 2025") */
  name: string;
  children: Node[];
  entries: Entry[];
  count: number;
  parent?: Node;
}

// eslint-disable-next-line react-refresh/only-export-components
export function buildFolderTree(songs: Song[]): Node {
  const root: Node = { path: '', name: '', children: [], entries: [], count: 0 };
  const byPath = new Map<string, Node>([['', root]]);
  const ensure = (path: string): Node => {
    const existing = byPath.get(path);
    if (existing) return existing;
    const parentPath = path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : '';
    const node: Node = { path, name: path.slice(path.lastIndexOf('/') + 1), children: [], entries: [], count: 0 };
    ensure(parentPath).children.push(node);
    byPath.set(path, node);
    return node;
  };
  for (const song of songs) {
    for (const recording of song.recordings) {
      if (recording.missing) continue;
      ensure(recording.folder).entries.push({ song, recording });
    }
  }
  const finish = (node: Node): Node => {
    node.children = node.children.map(finish).sort((a, b) => a.name.localeCompare(b.name, 'de', { numeric: true }));
    // compact paths: a folder without songs and exactly one subfolder merges with it
    while (node !== root && node.entries.length === 0 && node.children.length === 1) {
      const only = node.children[0]!;
      node.name = `${node.name} / ${only.name}`;
      node.path = only.path;
      node.entries = only.entries;
      node.children = only.children;
    }
    node.count = new Set([...node.entries.map((e) => e.song.id), ...node.children.flatMap((c) => collectIds(c))]).size;
    node.children.forEach((child) => (child.parent = node));
    return node;
  };
  return finish(root);
}

function flatten(node: Node): Node[] {
  return [node, ...node.children.flatMap(flatten)];
}

function collectIds(node: Node): string[] {
  return [...node.entries.map((e) => e.song.id), ...node.children.flatMap(collectIds)];
}

const EXPANDED_KEY = 'bandapp.songs.expandedFolders';

interface SongFoldersProps {
  songs: Song[];
  filtering: boolean;
  renderEntry: (song: Song, recording: Recording) => ReactNode;
}

export function SongFolders({ songs, filtering, renderEntry }: SongFoldersProps) {
  const { t } = useTranslation('songs');
  const wide = useIsWide();
  const tree = useMemo(() => buildFolderTree(songs), [songs]);
  const [params, setParams] = useSearchParams();
  const [expanded, setExpanded] = useState<Set<string>>(() => {
    try {
      return new Set(JSON.parse(localStorage.getItem(EXPANDED_KEY) ?? '[]') as string[]);
    } catch {
      return new Set();
    }
  });

  const toggle = (path: string) => {
    const next = new Set(expanded);
    if (next.has(path)) next.delete(path);
    else next.add(path);
    setExpanded(next);
    localStorage.setItem(EXPANDED_KEY, JSON.stringify([...next]));
  };

  const folderRow = (node: Node, open: boolean, onClick: () => void, depth = 0) => (
    <button type="button" className={styles.folderRow} onClick={onClick} aria-expanded={wide ? open : undefined} style={{ paddingLeft: `calc(var(--space-3) + ${depth * 20}px)` }}>
      {wide ? open ? <ChevronDown size={18} /> : <ChevronRight size={18} /> : null}
      <Folder size={20} aria-hidden="true" />
      <span className={styles.folderName}>{node.name}</span>
      <span className={styles.folderCount}>{t('count', { count: node.count })}</span>
      {!wide && <ChevronRight size={18} aria-hidden="true" />}
    </button>
  );

  // Tablet / desktop: expandable tree
  if (wide) {
    const renderNode = (node: Node, depth: number): ReactNode => {
      const open = filtering || expanded.has(node.path);
      return (
        <li key={node.path}>
          {folderRow(node, open, () => toggle(node.path), depth)}
          {open && (
            <ul className={styles.folderChildren}>
              {node.children.map((child) => renderNode(child, depth + 1))}
              {node.entries.map((e) => (
                <li key={`${e.song.id}-${e.recording.id}`} style={{ paddingLeft: `${(depth + 1) * 20}px` }}>
                  {renderEntry(e.song, e.recording)}
                </li>
              ))}
            </ul>
          )}
        </li>
      );
    };
    return (
      <ul className={styles.list}>
        {tree.children.map((child) => renderNode(child, 0))}
        {tree.entries.map((e) => (
          <li key={`${e.song.id}-${e.recording.id}`}>{renderEntry(e.song, e.recording)}</li>
        ))}
      </ul>
    );
  }

  // Phone: step into folders, breadcrumb back
  const currentPath = params.get('folder') ?? '';
  const current = flatten(tree).find((n) => n.path === currentPath) ?? tree;
  const go = (path: string) => {
    const next = new URLSearchParams(params);
    if (path) next.set('folder', path);
    else next.delete('folder');
    setParams(next);
  };
  const crumbs: Node[] = [];
  for (let node: Node | undefined = current; node; node = node.parent) crumbs.unshift(node);

  return (
    <div className={styles.sections}>
      <nav className={styles.crumbs} aria-label={t('folders.path')}>
        {crumbs.map((node, i) => (
          <span key={node.path || 'root'}>
            {i > 0 && <ChevronRight size={14} aria-hidden="true" />}
            <button type="button" onClick={() => go(node.path)} aria-current={node === current || undefined}>
              {node === tree ? <Home size={14} aria-hidden="true" /> : null}
              {node === tree ? t('folders.all') : node.name}
            </button>
          </span>
        ))}
      </nav>
      <ul className={styles.list}>
        {current.children.map((child) => (
          <li key={child.path}>{folderRow(child, false, () => go(child.path))}</li>
        ))}
        {current.entries.map((e) => (
          <li key={`${e.song.id}-${e.recording.id}`}>{renderEntry(e.song, e.recording)}</li>
        ))}
      </ul>
    </div>
  );
}
