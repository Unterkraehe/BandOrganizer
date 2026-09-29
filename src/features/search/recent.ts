/** Recently opened songs for "Schnellzugriff" (F8 §3.2), device-local. */
const KEY = 'bandapp.recentSongs';

export function recentSongs(): string[] {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? '[]') as string[];
  } catch {
    return [];
  }
}

export function rememberSong(id: string) {
  try {
    localStorage.setItem(KEY, JSON.stringify([id, ...recentSongs().filter((x) => x !== id)].slice(0, 10)));
  } catch {
    // ignore
  }
}
