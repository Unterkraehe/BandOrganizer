import { ArrowDown, ChevronDown, ChevronUp, GripVertical, MessageSquarePlus, Plus, Redo2, Trash2, Undo2 } from 'lucide-react';
import { useEffect, useReducer, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { useBlocker, useNavigate, useParams, useLocation } from 'react-router-dom';
import { useNotify } from '@/app/notify/NotifyProvider';
import { newId } from '@/core/data/ids';
import { formatDuration, formatMinutes } from '@/core/i18n/format';
import { useSession } from '@/core/session/BandSession';
import { ConflictError } from '@/core/storage';
import { Button, ConfirmDialog, Dialog, IconButton, Menu, Page, TextField } from '@/ui';
import { useIsWide } from '@/ui/useMediaQuery';
import { durations, NOTE_MAX, numbering, songEntries, type Entry, type Setlist } from './model';
import { SongPicker } from './SongPicker';
import { newBlock } from './store';
import { useSetlists } from './SetlistProvider';
import { useSetlistInfo } from './useSetlistInfo';
import styles from './Setlists.module.css';
import { useBack } from '@/ui/layout/navigation';

/* ---------------- draft with undo/redo (F7 §4.3) ---------------- */

interface Draft {
  setlist: Setlist;
  personal: Record<string, string>;
}
interface History {
  past: Draft[];
  present: Draft;
  future: Draft[];
}
type Action = { type: 'change'; draft: Draft } | { type: 'undo' } | { type: 'redo' } | { type: 'reset'; draft: Draft };

function reducer(h: History, a: Action): History {
  switch (a.type) {
    case 'change':
      return { past: [...h.past, h.present].slice(-100), present: a.draft, future: [] };
    case 'undo':
      return h.past.length ? { past: h.past.slice(0, -1), present: h.past.at(-1)!, future: [h.present, ...h.future] } : h;
    case 'redo':
      return h.future.length ? { past: [...h.past, h.present], present: h.future[0]!, future: h.future.slice(1) } : h;
    case 'reset':
      return { past: [], present: a.draft, future: [] };
  }
}

/** Pure edit helpers – each returns a new setlist */
function mapBlocks(s: Setlist, fn: (blocks: Setlist['blocks']) => Setlist['blocks']): Setlist {
  return { ...s, blocks: fn(s.blocks) };
}

function removeEntry(s: Setlist, entryId: string): { setlist: Setlist; entry: Entry | null } {
  let removed: Entry | null = null;
  const setlist = mapBlocks(s, (blocks) =>
    blocks.map((b) => ({
      ...b,
      entries: b.entries.filter((e) => {
        if (e.id === entryId) removed = e;
        return e.id !== entryId;
      }),
    })),
  );
  return { setlist, entry: removed };
}

/** Moves an entry before `beforeId` or to the end of `blockId`. */
function moveEntry(s: Setlist, entryId: string, target: { blockId: string; beforeId: string | null }): Setlist {
  if (target.beforeId === entryId) return s;
  const { setlist, entry } = removeEntry(s, entryId);
  if (!entry) return s;
  return mapBlocks(setlist, (blocks) =>
    blocks.map((b) => {
      if (b.id !== target.blockId) return b;
      const entries = [...b.entries];
      const index = target.beforeId ? entries.findIndex((e) => e.id === target.beforeId) : -1;
      entries.splice(index < 0 ? entries.length : index, 0, entry);
      return { ...b, entries };
    }),
  );
}

function updateEntry(s: Setlist, entryId: string, patch: Partial<Entry>): Setlist {
  return mapBlocks(s, (blocks) => blocks.map((b) => ({ ...b, entries: b.entries.map((e) => (e.id === entryId ? ({ ...e, ...patch } as Entry) : e)) })));
}

/* ---------------- page ---------------- */

export function SetlistEditorPage() {
  const { setlistId } = useParams();
  const { store, state } = useSetlists();
  const entry = setlistId ? store.get(setlistId) : undefined;
  const [personal, setPersonal] = useState<Record<string, string> | null>(null);
  useEffect(() => {
    if (setlistId) void store.loadPersonal(setlistId).then((p) => setPersonal(p?.notes ?? {}));
  }, [setlistId, store]);
  if (!entry || personal === null) return <Page title="">{state.status === 'loading' ? null : null}</Page>;
  return <Editor key={entry.value.id} initial={{ setlist: entry.value, personal }} version={entry.version} />;
}

function Editor({ initial, version: initialVersion }: { initial: Draft; version: string | undefined }) {
  const { t } = useTranslation('setlists');
  const navigate = useNavigate();
  const { goBack } = useBack();
  const location = useLocation();
  const notify = useNotify();
  const wide = useIsWide();
  const { store } = useSetlists();
  const { songById, eventsOf } = useSetlistInfo();
  const { members } = useSession();
  const [history, dispatch] = useReducer(reducer, { past: [], present: initial, future: [] });
  const [version, setVersion] = useState(initialVersion);
  const [saved, setSaved] = useState(initial);
  const [targetBlock, setTargetBlock] = useState(initial.setlist.blocks[0]?.id ?? '');
  const [expanded, setExpanded] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [conflict, setConflict] = useState<string | null>(null);
  const [deleteBlock, setDeleteBlock] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const draft = history.present;
  const s = draft.setlist;
  const dirty = draft !== saved;
  const change = (setlist: Setlist, personal = draft.personal) => dispatch({ type: 'change', draft: { setlist, personal } });

  const blocker = useBlocker(({ currentLocation, nextLocation }) => dirty && !saving && currentLocation.pathname !== nextLocation.pathname);

  const numbers = numbering(s);
  const d = durations(s, (id) => songById.get(id)?.recording?.durationSec);
  const inSetlist = new Set(songEntries(s).map((e) => songById.get(e.songId)?.id ?? e.songId));
  const linkedCount = eventsOf(s.id).length;
  const target = s.blocks.find((b) => b.id === targetBlock) ?? s.blocks[0];

  const addSongs = (ids: string[]) => {
    if (!target) return;
    change(
      mapBlocks(s, (blocks) =>
        blocks.map((b) => (b.id === target.id ? { ...b, entries: [...b.entries, ...ids.map((songId) => ({ id: newId('x'), type: 'song' as const, songId, note: null, segueToNext: false }))] } : b)),
      ),
    );
    if (ids.some((id) => inSetlist.has(id))) notify({ message: t('picker.alreadyIn') });
  };

  const save = async () => {
    setSaving(true);
    try {
      const result = await store.save(s, version);
      setVersion(result.version);
      if (JSON.stringify(draft.personal) !== JSON.stringify(initial.personal) || draft.personal !== saved.personal) await store.savePersonal(s.id, draft.personal);
      const next = { setlist: result.value, personal: draft.personal };
      dispatch({ type: 'reset', draft: next });
      setSaved(next);
      notify({ message: t('editor.saved') });
      // like every form: done → back where you came from; a new setlist shows its page (R-UX-06, v0.18.0)
      if ((location.state as { created?: boolean } | null)?.created) navigate(`/setlists/${s.id}`, { replace: true });
      else goBack();
    } catch (error) {
      if (error instanceof ConflictError) {
        await store.load();
        const latest = store.get(s.id)?.value;
        setConflict(members.find((m) => m.id === latest?.updatedBy)?.displayName ?? '?');
      } else notify({ message: t('editor.failed') });
    } finally {
      setSaving(false);
    }
  };

  /* ---------- pointer drag & drop (touch + mouse) ---------- */
  const drag = useRef<{ id: string; target: { blockId: string; beforeId: string | null } | null } | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const [dropBefore, setDropBefore] = useState<string | null>(null);

  const onHandleDown = (event: ReactPointerEvent, id: string) => {
    event.preventDefault();
    (event.target as HTMLElement).setPointerCapture?.(event.pointerId);
    drag.current = { id, target: null };
    setDragId(id);
  };
  const onHandleMove = (event: ReactPointerEvent) => {
    if (!drag.current) return;
    if (event.clientY < 90) window.scrollBy(0, -12);
    else if (event.clientY > window.innerHeight - 140) window.scrollBy(0, 12);
    const el = document.elementFromPoint(event.clientX, event.clientY) as HTMLElement | null;
    const row = el?.closest<HTMLElement>('[data-entry-id]');
    const block = el?.closest<HTMLElement>('[data-block-id]');
    if (row && block) {
      const rect = row.getBoundingClientRect();
      const after = event.clientY > rect.top + rect.height / 2;
      const entries = [...block.querySelectorAll<HTMLElement>('[data-entry-id]')];
      const idx = entries.indexOf(row);
      const beforeId = after ? (entries[idx + 1]?.dataset.entryId ?? null) : row.dataset.entryId!;
      drag.current.target = { blockId: block.dataset.blockId!, beforeId };
      setDropBefore(beforeId ?? `end:${block.dataset.blockId}`);
    } else if (block) {
      drag.current.target = { blockId: block.dataset.blockId!, beforeId: null };
      setDropBefore(`end:${block.dataset.blockId}`);
    }
  };
  const onHandleUp = () => {
    const current = drag.current;
    drag.current = null;
    setDragId(null);
    setDropBefore(null);
    if (current?.target) change(moveEntry(s, current.id, current.target));
  };

  const picker = <SongPicker inSetlist={inSetlist} onAdd={addSongs} rehearsal={s.kind === 'rehearsal'} targetLabel={target?.name ?? ''} />;

  return (
    <Page title={t('editor.title')} wide={wide}>
      <div className={`${styles.editor} ${wide ? styles.editorWide : ''}`}>
        {wide && <aside className={styles.pickerColumn}>{picker}</aside>}
        <div className={styles.editor}>
          <TextField label={t('editor.name')} value={s.name} onChange={(e) => change({ ...s, name: e.target.value })} maxLength={80} />
          <label style={{ display: 'grid', gap: 'var(--space-1)', fontWeight: 600 }}>
            {t('kind.label')}
            <select className={styles.select} value={s.kind} onChange={(e) => change({ ...s, kind: e.target.value as Setlist['kind'] })}>
              <option value="gig">{t('kind.gig')}</option>
              <option value="rehearsal">{t('kind.rehearsal')}</option>
            </select>
          </label>
          {linkedCount > 1 && <p className={styles.hint}>{t('editor.linkedMany', { count: linkedCount })}</p>}

          {s.blocks.map((block, bi) => (
            <section
              key={block.id}
              className={styles.editBlock}
              data-block-id={block.id}
              data-target={block.id === target?.id || undefined}
              onClick={() => setTargetBlock(block.id)}
            >
              <div className={styles.editBlockHead}>
                <TextField
                  label={t('editor.blockName')}
                  value={block.name}
                  onChange={(e) => change(mapBlocks(s, (bs) => bs.map((b) => (b.id === block.id ? { ...b, name: e.target.value } : b))))}
                  maxLength={40}
                />
                <span className={styles.meta}>{formatMinutes((d.blocks[bi]?.seconds ?? 0) / 60)}{d.blocks[bi]?.unknown ? ' +?' : ''}</span>
                <IconButton label={t('editor.moveUp')} icon={<ChevronUp size={18} />} disabled={bi === 0} onClick={() => change(mapBlocks(s, (bs) => { const c = [...bs]; [c[bi - 1], c[bi]] = [c[bi]!, c[bi - 1]!]; return c; }))} />
                <IconButton label={t('editor.moveDown')} icon={<ChevronDown size={18} />} disabled={bi === s.blocks.length - 1} onClick={() => change(mapBlocks(s, (bs) => { const c = [...bs]; [c[bi + 1], c[bi]] = [c[bi]!, c[bi + 1]!]; return c; }))} />
                <IconButton
                  label={t('editor.deleteBlock')}
                  icon={<Trash2 size={18} />}
                  disabled={s.blocks.length === 1}
                  onClick={() => (block.entries.length ? setDeleteBlock(block.id) : change(mapBlocks(s, (bs) => bs.filter((b) => b.id !== block.id))))}
                />
              </div>
              <ul className={styles.editEntries}>
                {block.entries.map((entry, ei) => {
                  const song = entry.type === 'song' ? songById.get(entry.songId) : undefined;
                  const nextIsSong = block.entries[ei + 1]?.type === 'song';
                  return (
                    <li key={entry.id} className={styles.editEntry} data-entry-id={entry.id} data-dragging={dragId === entry.id || undefined} data-drop-before={dropBefore === entry.id || undefined}>
                      <button
                        type="button"
                        className={styles.handle}
                        aria-label={t('editor.drag')}
                        onPointerDown={(e) => onHandleDown(e, entry.id)}
                        onPointerMove={onHandleMove}
                        onPointerUp={onHandleUp}
                        onPointerCancel={onHandleUp}
                      >
                        <GripVertical size={18} />
                      </button>
                      {entry.type === 'song' ? (
                        <button type="button" className={styles.entryMain} style={{ border: 'none', background: 'none', textAlign: 'left', cursor: 'pointer' }} onClick={() => setExpanded(expanded === entry.id ? null : entry.id)}>
                          <span className={styles.entryTitle}>
                            {numbers.get(entry.id)}. {song?.title ?? t('missingSong')}
                            {entry.segueToNext && <span className={styles.segueToggle}> ↓</span>}
                          </span>
                          <span className={styles.meta}>
                            {[song?.recording?.durationSec ? formatDuration(song.recording.durationSec) : '?', song?.archived ? t('archived') : null, !song?.recording ? t('noFile') : null, entry.note, draft.personal[entry.id] ? `(${draft.personal[entry.id]})` : null]
                              .filter(Boolean)
                              .join(' · ')}
                          </span>
                        </button>
                      ) : (
                        <div className={styles.entryMain}>
                          <input className={styles.inlineInput} aria-label={t('interlude')} placeholder={t('interludePlaceholder')} value={entry.text} maxLength={80} onChange={(e) => change(updateEntry(s, entry.id, { text: e.target.value }))} />
                          <input
                            className={styles.inlineInput}
                            style={{ width: 110 }}
                            type="number"
                            min={0}
                            max={60}
                            aria-label={t('interludeMinutes')}
                            placeholder={t('interludeMinutes')}
                            value={entry.durationMin ?? ''}
                            onChange={(e) => change(updateEntry(s, entry.id, { durationMin: e.target.value ? Number(e.target.value) : null }))}
                          />
                          <input
                            className={styles.inlineInput}
                            aria-label={t('interludeNote')}
                            placeholder={t('interludeNotePlaceholder')}
                            value={entry.note ?? ''}
                            maxLength={NOTE_MAX}
                            onChange={(e) => change(updateEntry(s, entry.id, { note: e.target.value || null }))}
                          />
                        </div>
                      )}
                      <Menu
                        label={t('editor.entryMenu')}
                        items={[
                          { label: t('note'), icon: <MessageSquarePlus size={18} />, onSelect: () => setExpanded(entry.id), hidden: entry.type !== 'song' },
                          { label: t('segue'), icon: <ArrowDown size={18} />, hidden: entry.type !== 'song' || !nextIsSong, onSelect: () => entry.type === 'song' && change(updateEntry(s, entry.id, { segueToNext: !entry.segueToNext })) },
                          { label: t('editor.moveUp'), hidden: ei === 0, onSelect: () => change(moveEntry(s, entry.id, { blockId: block.id, beforeId: block.entries[ei - 1]!.id })) },
                          { label: t('editor.moveDown'), hidden: ei === block.entries.length - 1, onSelect: () => change(moveEntry(s, entry.id, { blockId: block.id, beforeId: block.entries[ei + 2]?.id ?? null })) },
                          ...s.blocks.filter((b) => b.id !== block.id).map((b) => ({ label: t('editor.moveTo', { name: b.name }), onSelect: () => change(moveEntry(s, entry.id, { blockId: b.id, beforeId: null })) })),
                          { label: t('editor.remove'), danger: true, onSelect: () => change(removeEntry(s, entry.id).setlist) },
                        ]}
                      />
                      {expanded === entry.id && entry.type === 'song' && (
                        <div className={styles.entryFields}>
                          <input className={styles.inlineInput} aria-label={t('note')} placeholder={`${t('note')}: ${t('notePlaceholder')}`} value={entry.note ?? ''} maxLength={NOTE_MAX} onChange={(e) => change(updateEntry(s, entry.id, { note: e.target.value || null }))} />
                          <input
                            className={styles.inlineInput}
                            aria-label={t('myNote')}
                            placeholder={`${t('myNote')}: ${t('myNotePlaceholder')}`}
                            value={draft.personal[entry.id] ?? ''}
                            maxLength={NOTE_MAX}
                            onChange={(e) => change(s, { ...draft.personal, [entry.id]: e.target.value })}
                          />
                          {nextIsSong && (
                            <label className={styles.segueToggle}>
                              <input type="checkbox" checked={entry.segueToNext} onChange={(e) => change(updateEntry(s, entry.id, { segueToNext: e.target.checked }))} />
                              ↓ {t('segue')} – {t('segueHint')}
                            </label>
                          )}
                        </div>
                      )}
                    </li>
                  );
                })}
                <li data-entry-end={block.id} className={dropBefore === `end:${block.id}` ? styles.editEntry : undefined} style={{ minHeight: 8 }} data-drop-before={dropBefore === `end:${block.id}` || undefined} />
              </ul>
              <div className={styles.actions}>
                {!wide && (
                  <Button icon={<Plus size={18} />} onClick={() => { setTargetBlock(block.id); setPickerOpen(true); }}>
                    {t('editor.addSongs')}
                  </Button>
                )}
                <Button variant="ghost" icon={<Plus size={18} />} onClick={() => change(mapBlocks(s, (bs) => bs.map((b) => (b.id === block.id ? { ...b, entries: [...b.entries, { id: newId('x'), type: 'interlude', text: '', durationMin: null }] } : b))))}>
                  {t('editor.addInterlude')}
                </Button>
              </div>
              {bi < s.blocks.length - 1 && (
                <div className={styles.pauseFields}>
                  <label className={styles.meta} style={{ display: 'flex', gap: 'var(--space-2)', alignItems: 'center' }}>
                    {t('pauseLabel')}
                    <input className={styles.inlineInput} style={{ width: 90 }} type="number" min={0} max={120} value={block.pauseAfterMin ?? ''} onChange={(e) => change(mapBlocks(s, (bs) => bs.map((b) => (b.id === block.id ? { ...b, pauseAfterMin: e.target.value ? Number(e.target.value) : null } : b))))} />
                  </label>
                  <input
                    className={styles.inlineInput}
                    aria-label={t('pauseNote')}
                    placeholder={t('pauseNotePlaceholder')}
                    value={block.pauseNote ?? ''}
                    maxLength={NOTE_MAX}
                    onChange={(e) => change(mapBlocks(s, (bs) => bs.map((b) => (b.id === block.id ? { ...b, pauseNote: e.target.value || null } : b))))}
                  />
                </div>
              )}
            </section>
          ))}
          <div>
            <Button icon={<Plus size={18} />} onClick={() => {
              const block = newBlock(t('editor.blockNew', { n: s.blocks.length + 1 }));
              change(mapBlocks({ ...s, blocks: s.blocks.map((b, i) => (i === s.blocks.length - 1 && b.pauseAfterMin === null ? { ...b, pauseAfterMin: 20 } : b)) }, (bs) => [...bs, block]));
              setTargetBlock(block.id);
            }}>
              {t('editor.addBlock')}
            </Button>
          </div>

          <div className={styles.totals} data-no-print>
            <strong>{t('editor.total', { duration: formatMinutes(d.totalSeconds / 60) })}{d.unknown ? ' +?' : ''}</strong>
            <span style={{ display: 'flex', gap: 'var(--space-1)' }}>
              <IconButton label={t('editor.undo')} icon={<Undo2 size={18} />} disabled={!history.past.length} onClick={() => dispatch({ type: 'undo' })} />
              <IconButton label={t('editor.redo')} icon={<Redo2 size={18} />} disabled={!history.future.length} onClick={() => dispatch({ type: 'redo' })} />
              <Button variant="ghost" onClick={() => goBack()}>
                {t('common:actions.cancel')}
              </Button>
              <Button variant="primary" disabled={!dirty || saving || !s.name.trim()} onClick={() => void save()}>
                {t('editor.save')}
              </Button>
            </span>
          </div>
        </div>
      </div>

      {!wide && (
        <Dialog open={pickerOpen} title={t('picker.title')} closeLabel={t('common:actions.close')} onClose={() => setPickerOpen(false)} fullScreenOnPhone>
          {picker}
        </Dialog>
      )}
      <ConfirmDialog
        open={deleteBlock !== null}
        title={t('editor.deleteBlock')}
        text={t('editor.deleteBlockConfirm', { name: s.blocks.find((b) => b.id === deleteBlock)?.name ?? '', count: s.blocks.find((b) => b.id === deleteBlock)?.entries.length ?? 0 })}
        confirmLabel={t('editor.deleteBlock')}
        cancelLabel={t('common:actions.cancel')}
        danger
        onCancel={() => setDeleteBlock(null)}
        onConfirm={() => {
          const id = deleteBlock;
          setDeleteBlock(null);
          change(mapBlocks(s, (bs) => bs.filter((b) => b.id !== id)));
        }}
      />
      <ConfirmDialog
        open={conflict !== null}
        title={t('editor.conflictTitle')}
        text={t('editor.conflictText', { name: conflict ?? '' })}
        confirmLabel={t('editor.saveCopy')}
        cancelLabel={t('editor.loadTheirs')}
        onCancel={() => {
          setConflict(null);
          const latest = store.get(s.id);
          if (latest) {
            setVersion(latest.version);
            const next = { setlist: latest.value, personal: draft.personal };
            dispatch({ type: 'reset', draft: next });
            setSaved(next);
          }
        }}
        onConfirm={() => {
          setConflict(null);
          setSaving(true);
          void store
            .create(t('copyOf', { name: s.name }), s.kind, s.blocks, s.id)
            .then((copy) => {
              setSaved(draft);
              navigate(`/setlists/${copy.id}`, { replace: true });
            })
            .catch(() => notify({ message: t('editor.failed') }))
            .finally(() => setSaving(false));
        }}
      />
      <ConfirmDialog
        open={blocker.state === 'blocked'}
        title={t('editor.unsavedTitle')}
        text={t('editor.unsavedText')}
        confirmLabel={t('editor.discard')}
        cancelLabel={t('editor.keep')}
        danger
        onCancel={() => blocker.reset?.()}
        onConfirm={() => blocker.proceed?.()}
      />
    </Page>
  );
}
