import { newId } from "@/core/data/ids";
import { useCallback, useEffect, useState } from "react";
import { useSession } from "@/core/session/BandSession";
import { useLibrary } from "./LibraryProvider";
import type { Song } from "./model";
import {
  createNote,
  listNotes,
  saveNote,
  type NewNoteAudio,
  type NoteEntry,
  type NoteScope,
} from "./repository";

/**
 * Voice notes recorded on this device, by note id: playable at once, before (and while) the upload
 * runs (optimistic, R-UX-07). Read by AudioNote before it loads the file from HiDrive.
 */
export const localNoteAudio = new Map<string, Blob>();

/** Notes of a song incl. merged songs (F4 §6.4, §6.8). Loaded when the song is opened. */
export function useSongNotes(song: Song | undefined) {
  const { store } = useLibrary();
  const { currentMember } = useSession();
  const memberId = currentMember?.id ?? "unknown";
  const [entries, setEntries] = useState<NoteEntry[]>([]);
  const [status, setStatus] = useState<"loading" | "ready" | "error">(
    "loading",
  );
  const songIds = song ? [song.id, ...song.mergedSongIds] : [];
  const key = songIds.join(",");

  const reload = useCallback(async () => {
    if (!key) return;
    try {
      setEntries(
        await listNotes(store.storage, store.appRoot, key.split(","), memberId),
      );
      setStatus("ready");
    } catch {
      setStatus("error");
    }
  }, [key, memberId, store]);

  useEffect(() => {
    setStatus("loading");
    void reload();
  }, [reload]);

  const replace = (next: NoteEntry) =>
    setEntries((list) => {
      const others = list.filter((e) => e.note.id !== next.note.id);
      return next.note.deletedAt ? others : [...others, next];
    });

  return {
    status,
    entries,
    memberId,
    // Optimistic (R-UX-07): the note appears/changes immediately and is saved in the background.
    add: async (
      scope: NoteScope,
      text: string,
      positionSec: number | null,
      recordingId: string | null,
      audio: NewNoteAudio | null = null,
    ) => {
      if (!song) return;
      const id = newId("n");
      if (audio) localNoteAudio.set(id, audio.blob);
      const now = new Date().toISOString();
      const pending: NoteEntry = {
        songId: song.id,
        scope,
        version: undefined,
        note: {
          id,
          schemaVersion: 1,
          text: text.trim(),
          positionSec,
          recordingId: positionSec !== null ? recordingId : null,
          pinned: false,
          audio: audio ? { file: "", durationSec: Math.round(audio.durationSec), mime: audio.mime } : null,
          createdAt: now,
          createdBy: memberId,
          updatedAt: now,
          updatedBy: memberId,
          deletedAt: null,
          deletedBy: null,
        },
      };
      replace(pending);
      try {
        replace(
          await createNote(
            store.storage,
            store.appRoot,
            song.id,
            scope,
            memberId,
            { text, positionSec, recordingId, audio },
            id,
          ),
        );
      } catch (error) {
        setEntries((list) => list.filter((e) => e.note.id !== id));
        localNoteAudio.delete(id);
        throw error;
      }
    },
    change: async (
      entry: NoteEntry,
      change: "edit" | "pin" | "unpin" | "delete" | "restore",
      text?: string,
    ) => {
      const now = new Date().toISOString();
      const n = entry.note;
      const local: NoteEntry = {
        ...entry,
        note:
          change === "edit"
            ? { ...n, text: (text ?? "").trim(), updatedAt: now }
            : change === "pin" || change === "unpin"
              ? { ...n, pinned: change === "pin", updatedAt: now }
              : change === "delete"
                ? { ...n, deletedAt: now, deletedBy: memberId }
                : { ...n, deletedAt: null, deletedBy: null },
      };
      replace(local);
      try {
        const saved = await saveNote(
          store.storage,
          store.appRoot,
          entry,
          memberId,
          change,
          text,
        );
        replace(saved);
        return saved;
      } catch (error) {
        replace(entry);
        throw error;
      }
    },
  };
}
