/** "Band / Proben / 2026" relative to the home (F10 §4.1). */
export function folderLabel(path: string, home: string, rootLabel: string): string {
  if (path === home) return rootLabel;
  return path.startsWith(home + '/') ? path.slice(home.length + 1).split('/').join(' / ') : path;
}

