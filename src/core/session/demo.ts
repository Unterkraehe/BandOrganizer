import { MemoryStorageProvider } from '@/core/storage';
import { createDemoSongs } from './demoAudio';

export const DEMO_HOME = '/users/demo';

/**
 * Demo mode: an in-memory HiDrive with generated songs and a few other "existing band files",
 * so the app can be tried without an account. Nothing is saved – reloading ends the demo.
 */
export function createDemoProvider(extraSongs = demoSongCountFromUrl()): MemoryStorageProvider {
  const provider = new MemoryStorageProvider();
  const short = import.meta.env.MODE === 'test';
  const daysAgo = (days: number) => new Date(Date.now() - days * 86_400_000).toISOString();
  const ages = [120, 90, 60, 3, 30, 200];
  Object.entries(createDemoSongs(short)).forEach(([path, blob], index) =>
    provider.seed(`${DEMO_HOME}/${path}`, blob, daysAgo(ages[index] ?? 100)),
  );
  provider.seed(`${DEMO_HOME}/Texte/Midnight Engine.txt`, MIDNIGHT_ENGINE);
  provider.seed(`${DEMO_HOME}/Texte/Open Road - Text.pdf`, makePdf('Open Road', OPEN_ROAD.split('\n')));
  provider.seed(`${DEMO_HOME}/Fotos/Proberaum.jpg`, 'demo photo');
  provider.seed(`${DEMO_HOME}/.versteckt/nicht-scannen.mp3`, 'hidden');
  seedManySongs(provider, extraSongs);
  return provider;
}

/** `?demo-songs=300` fills the demo with many songs – for testing list performance with a realistic repertoire. */
function demoSongCountFromUrl(): number {
  if (typeof location === 'undefined') return 0;
  const n = Number(new URLSearchParams(location.search).get('demo-songs'));
  return Number.isFinite(n) ? Math.min(2000, Math.max(0, Math.floor(n))) : 0;
}

function seedManySongs(provider: MemoryStorageProvider, count: number) {
  const words = ['Midnight', 'Rust', 'Thunder', 'Neon', 'Open', 'Road', 'Slow', 'Burn', 'Electric', 'Highway', 'Shadow', 'River', 'Broken', 'Glass', 'Silver', 'Storm', 'Golden', 'Fire', 'Lonely', 'Heart', 'Wild', 'Night', 'Iron', 'Sky'];
  const folders = ['Songs/Rock', 'Songs/Balladen', 'Songs/Cover', 'Proben/2024', 'Proben/2025', 'Live/2023/Stadtfest', 'Live/2024', 'Demos', 'Archiv/Alt', 'Neu'];
  for (let i = 0; i < count; i++) {
    const title = `${words[i % words.length]} ${words[(i * 7 + 3) % words.length]} ${Math.floor(i / words.length) + 1}`;
    const folder = folders[i % folders.length]!;
    provider.seed(`${DEMO_HOME}/${folder}/${String(i + 1).padStart(3, '0')} ${title}.mp3`, 'x', new Date(Date.now() - (i % 400) * 86_400_000).toISOString());
  }
}

// Invented demo lyrics (no copyrighted material)
const MIDNIGHT_ENGINE = `[Strophe 1]
Scheinwerfer im Regen, die Straße glänzt schwarz
Der Motor zählt die Stunden, das Radio spielt laut

[Refrain – alle]
Midnight Engine, lauf durch die Nacht
Midnight Engine, bis der Morgen erwacht

[Strophe 2]
Die Stadt schläft im Rückspiegel, vor uns nur das Licht
Wir fahren bis zum Ende, und wir halten nicht

[Refrain – Stimme 2 eine Terz höher]
Midnight Engine, lauf durch die Nacht
Midnight Engine, bis der Morgen erwacht
`;

const OPEN_ROAD = `Open Road
Staub auf den Stiefeln, die Sonne im Gesicht
Kein Ziel auf der Karte, nur Weite und Licht
Open road, nimm uns mit
Open road, Schritt für Schritt`;

/** Minimal one-page PDF with text lines (for the demo lyrics viewer). */
function makePdf(title: string, lines: string[]): Blob {
  const esc = (s: string) => s.replace(/[\\()]/g, (c) => `\\${c}`).replace(/[^\x20-\x7e\xa0-\xff]/g, '?');
  const text = [`BT /F1 20 Tf 60 780 Td (${esc(title)}) Tj ET`, ...lines.slice(1).map((line, i) => `BT /F1 13 Tf 60 ${740 - i * 22} Td (${esc(line)}) Tj ET`)].join('\n');
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>',
    `<< /Length ${text.length} >>\nstream\n${text}\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>',
  ];
  let pdf = '%PDF-1.4\n';
  const offsets: number[] = [];
  objects.forEach((obj, i) => {
    offsets.push(pdf.length);
    pdf += `${i + 1} 0 obj\n${obj}\nendobj\n`;
  });
  const xref = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.map((o) => `${String(o).padStart(10, '0')} 00000 n \n`).join('')}`;
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  // latin-1 bytes so umlauts stay single bytes (WinAnsi)
  return new Blob([Uint8Array.from(pdf, (c) => c.charCodeAt(0) & 0xff)], { type: 'application/pdf' });
}
