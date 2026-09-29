import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { THEME_STORAGE_KEY } from '@/core/theme/theme';
import { isHiDriveConfigured } from '@/config';
import { App } from './App';

type User = ReturnType<typeof userEvent.setup>;

/** Demo mode: welcome → band setup → first profile → app shell. */
async function enterDemo(user: User, path = '/') {
  render(<App initialPath={path} autoStart={false} />);
  await user.click(screen.getByRole('button', { name: 'Demo ausprobieren' }));
  await user.type(await screen.findByRole('textbox', { name: 'Bandname' }), 'Overload');
  await user.click(screen.getByRole('radio', { name: 'Signalrot' }));
  await user.click(screen.getByRole('button', { name: 'Band einrichten' }));
  await user.type(await screen.findByRole('textbox', { name: 'Name' }), 'Lisa');
  await user.type(screen.getByRole('combobox', { name: /Instrument/ }), 'Gesang');
  await user.click(screen.getByRole('button', { name: "Los geht's" }));
}

describe('App (M1 flow in demo mode)', () => {
  beforeEach(() => localStorage.clear());

  it('shows the welcome screen when not connected', () => {
    render(<App initialPath="/" autoStart={false} />);
    expect(screen.getByRole('heading', { level: 1, name: 'Overload App' })).toBeInTheDocument();
    // HiDrive login is only enabled once the client ID is configured (src/config.ts)
    const connect = screen.getByRole('button', { name: 'Mit HiDrive verbinden' });
    if (isHiDriveConfigured()) expect(connect).toBeEnabled();
    else expect(connect).toBeDisabled();
  });

  it('sets up a band, creates the first profile and greets the member', async () => {
    const user = userEvent.setup();
    await enterDemo(user);
    expect(await screen.findByText(/, Lisa$/)).toBeInTheDocument();
    expect(screen.getByRole('note')).toHaveTextContent('Demo-Modus');
    const nav = screen.getByRole('navigation', { name: 'Hauptmenü' });
    expect(within(nav).getByRole('link', { name: 'Start' })).toHaveAttribute('aria-current', 'page');
    expect(within(nav).getByRole('link', { name: 'Mitglieder' })).toBeInTheDocument();
    // band color applied
    expect(document.getElementById('band-theme')?.textContent).toContain('#E30613');
  });

  it('switches profiles and prevents duplicate names', async () => {
    const user = userEvent.setup();
    await enterDemo(user, '/settings');
    await user.click(await screen.findByRole('button', { name: 'Profil wechseln' }));
    expect(await screen.findByRole('heading', { name: 'Wer bist du?' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Ich bin neu' }));
    await user.type(screen.getByRole('textbox', { name: 'Name' }), 'lisa');
    await user.click(screen.getByRole('button', { name: "Los geht's" }));
    expect(await screen.findByText('Diesen Namen gibt es schon. Bist du das?')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Zu diesem Profil' }));
    expect(await screen.findByRole('heading', { level: 1, name: 'Einstellungen' })).toBeInTheDocument();
  });

  it('marks a member as former and brings them back', async () => {
    const user = userEvent.setup();
    await enterDemo(user, '/settings');
    await user.click(await screen.findByRole('button', { name: 'Profil wechseln' }));
    await user.click(await screen.findByRole('button', { name: 'Ich bin neu' }));
    await user.type(screen.getByRole('textbox', { name: 'Name' }), 'Tom');
    await user.click(screen.getByRole('button', { name: "Los geht's" }));
    // Tom opens Lisa's page via the members list
    const nav = await screen.findByRole('navigation', { name: 'Hauptmenü' });
    await user.click(within(nav).getByRole('link', { name: 'Mitglieder' }));
    await user.click(await screen.findByRole('link', { name: /Lisa/ }));
    await user.click(screen.getByRole('button', { name: 'Ist nicht mehr in der Band' }));
    const dialog = screen.getByRole('alertdialog');
    await user.click(within(dialog).getByRole('button', { name: 'Als ehemalig markieren' }));
    expect(await screen.findByText('(ehemalig)')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Wieder aktivieren' }));
    expect(await screen.findByRole('button', { name: 'Ist nicht mehr in der Band' })).toBeInTheDocument();
  });

  it('switches the theme in the settings and remembers it', async () => {
    const user = userEvent.setup();
    await enterDemo(user, '/settings');
    await user.click(await screen.findByRole('radio', { name: 'Dunkel' }));
    expect(document.documentElement.dataset.theme).toBe('dark');
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe('dark');
  });

  it('highlights "Mehr" on phones for its screens and shows a helpful 404', async () => {
    const user = userEvent.setup();
    await enterDemo(user, '/gibt-es-nicht');
    expect(await screen.findByRole('button', { name: 'Zur Startseite' })).toBeInTheDocument();
  });
});

describe('Songs (M2 in demo mode)', () => {
  beforeEach(() => localStorage.clear());

  it('finds the demo songs, searches and plays one', async () => {
    const user = userEvent.setup();
    await enterDemo(user, '/songs');
    expect(await screen.findByText('6 Songs')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Midnight Engine \(Live\)/ })).toBeInTheDocument();
    // hidden folders are skipped
    expect(screen.queryByText(/nicht-scannen/)).not.toBeInTheDocument();

    await user.type(screen.getByRole('searchbox', { name: 'Songs durchsuchen' }), 'rust thund');
    expect(await screen.findByText('1 Song')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Rust and Thunder abspielen' }));
    expect(await screen.findByRole('region', { name: 'Läuft gerade' })).toHaveTextContent('Rust and Thunder');
    expect(screen.getByRole('button', { name: 'Rust and Thunder pausieren' })).toBeInTheDocument();

    // tapping the mini player opens the playing song (regression v0.5.0)
    await user.click(within(screen.getByRole('region', { name: 'Läuft gerade' })).getByRole('link'));
    expect(await screen.findByRole('heading', { level: 1, name: 'Rust and Thunder' })).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Läuft gerade' })).not.toBeInTheDocument();
  });

  it('filters new songs and opens the detail page', async () => {
    const user = userEvent.setup();
    await enterDemo(user, '/songs');
    await screen.findByText('6 Songs');
    await user.click(screen.getByRole('button', { name: 'Neu' }));
    expect(screen.getByText('1 Song')).toBeInTheDocument();
    await user.click(screen.getByRole('link', { name: /Slow Burn/ }));
    expect(await screen.findByRole('heading', { level: 1, name: 'Slow Burn (Probe)' })).toBeInTheDocument();
    expect(screen.getByText(/Proben\/2026-09-17/)).toBeInTheDocument();
  });
});

describe('Song library (M3a in demo mode)', () => {
  beforeEach(() => localStorage.clear());

  async function openSong(user: User, title: RegExp) {
    await enterDemo(user, '/songs');
    await screen.findByText('6 Songs');
    await user.click(screen.getByRole('link', { name: title }));
  }

  it('edits key, BPM and tuning', async () => {
    const user = userEvent.setup();
    await openSong(user, /^Open Road/);
    await user.click(await screen.findByRole('button', { name: 'Bearbeiten' }));
    await user.selectOptions(await screen.findByRole('combobox', { name: 'Tonart' }), 'A');
    await user.click(screen.getByRole('checkbox', { name: 'Moll' }));
    await user.type(screen.getByRole('textbox', { name: 'BPM' }), '104');
    await user.type(screen.getByRole('combobox', { name: 'Stimmung' }), 'Drop D');
    await user.click(screen.getByRole('button', { name: 'Speichern' }));
    expect(await screen.findByText('Am')).toBeInTheDocument();
    expect(screen.getByText('104 BPM')).toBeInTheDocument();
    expect(screen.getByText('Drop D')).toBeInTheDocument();
  });

  it('writes a public note with a time marker and a private note', async () => {
    const user = userEvent.setup();
    await openSong(user, /^Open Road/);
    await user.click(await screen.findByRole('button', { name: 'Abspielen' }));
    await user.click(screen.getByRole('tab', { name: /Notizen für alle/ }));
    await user.type(screen.getByRole('textbox', { name: 'Notiz für die Band …' }), 'Bridge ab jetzt 2×');
    await user.click(screen.getByRole('checkbox', { name: /Position übernehmen/ }));
    await user.click(screen.getByRole('button', { name: 'Notiz speichern' }));
    expect(await screen.findByText('Bridge ab jetzt 2×')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /springen/ })).toBeInTheDocument();

    await user.click(screen.getByRole('tab', { name: 'Meine Notizen' }));
    expect(screen.getByText('Nur für dich sichtbar in der App')).toBeInTheDocument();
    await user.type(screen.getByRole('textbox', { name: 'Notiz nur für dich …' }), 'Solo: Kapo 3');
    await user.click(screen.getByRole('button', { name: 'Notiz speichern' }));
    expect(await screen.findByText('Solo: Kapo 3')).toBeInTheDocument();
    expect(screen.queryByText('Bridge ab jetzt 2×')).not.toBeInTheDocument();
  });

  it('archives a song, finds it at the end and restores it', async () => {
    const user = userEvent.setup();
    await enterDemo(user, '/songs');
    await screen.findByText('6 Songs');
    await user.click(screen.getByRole('button', { name: 'Weitere Aktionen für Open Road' }));
    await user.click(screen.getByRole('menuitem', { name: 'Archivieren' }));
    expect(await screen.findByText('5 Songs')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Archivierte Songs anzeigen (1)' }));
    expect(screen.getByRole('heading', { name: 'Archiv' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Weitere Aktionen für Open Road' }));
    await user.click(screen.getByRole('menuitem', { name: 'Aus dem Archiv holen' }));
    expect(await screen.findByText('6 Songs')).toBeInTheDocument();
  });

  it('tags a song and filters by the tag', async () => {
    const user = userEvent.setup();
    await enterDemo(user, '/songs');
    await screen.findByText('6 Songs');
    await user.click(screen.getByRole('button', { name: 'Weitere Aktionen für Rust and Thunder' }));
    await user.click(screen.getByRole('menuitem', { name: 'Tags bearbeiten' }));
    await user.type(screen.getByRole('textbox', { name: 'Neuer Tag' }), 'Keyboard-Solo');
    await user.click(screen.getByRole('button', { name: '„Keyboard-Solo“ als neuen Tag anlegen' }));
    await user.click(await screen.findByRole('button', { name: 'Fertig' }));
    await user.click(within(screen.getByRole('group', { name: 'Nach Tags filtern' })).getByRole('button', { name: 'Keyboard-Solo' }));
    expect(await screen.findByText('1 Song')).toBeInTheDocument();
  });

  it('groups a similar file as version and makes it the Band-Version', async () => {
    const user = userEvent.setup();
    await openSong(user, /^Midnight Engine(?! \()/);
    await user.click(await screen.findByRole('button', { name: 'Als Version hinzufügen' }));
    expect(await screen.findByText(/ist jetzt eine Version/)).toBeInTheDocument();
    const versions = screen.getByRole('heading', { name: 'Versionen' }).closest('section')!;
    const live = within(versions).getByRole('button', { name: /Midnight Engine \(Live\)/ }).closest('li')!;
    await user.click(within(live).getByRole('button', { name: 'Aktionen für diese Version' }));
    await user.click(screen.getByRole('menuitem', { name: 'Als Band-Version festlegen' }));
    await user.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Als Band-Version festlegen' }));
    expect(await within(live).findByText('Band-Version')).toBeInTheDocument();
    await user.click(screen.getByRole('link', { name: 'Songs' }));
    expect(await screen.findByText('5 Songs')).toBeInTheDocument();
    expect(screen.getByText(/2 Versionen/)).toBeInTheDocument();
  });
});

describe('Lyrics, uploads and folder view (M3b in demo mode)', () => {
  beforeEach(() => localStorage.clear());

  const wav = (name: string) => new File([new Uint8Array([...'RIFF'].map((c) => c.charCodeAt(0)).concat([0, 0, 0, 0], [...'WAVE'].map((c) => c.charCodeAt(0))))], name, { type: 'audio/wav' });

  it('links a suggested lyrics file and shows the text', async () => {
    const user = userEvent.setup();
    await enterDemo(user, '/songs');
    await screen.findByText('6 Songs');
    await user.click(screen.getByRole('link', { name: /^Midnight Engine(?! \()/ }));
    expect(await screen.findByText(/Songtext gefunden/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Verknüpfen' }));
    expect(await screen.findByText(/Scheinwerfer im Regen/)).toBeInTheDocument();
  });

  it('types lyrics and saves them as a new file in the chosen folder', async () => {
    const user = userEvent.setup();
    await enterDemo(user, '/songs');
    await screen.findByText('6 Songs');
    await user.click(screen.getByRole('link', { name: /^Rust and Thunder/ }));
    await user.click(await screen.findByRole('button', { name: 'Songtext eintippen' }));
    await user.type(await screen.findByRole('textbox', { name: 'Songtext' }), 'Rost und Donner');
    expect(screen.getByText('Band-App Uploads')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Speichern' }));
    expect(await screen.findByText('Rost und Donner')).toBeInTheDocument();
    expect(screen.getByText('Rust and Thunder - Text.txt')).toBeInTheDocument();
  });

  it('creates a new song with an uploaded recording', async () => {
    const user = userEvent.setup();
    await enterDemo(user, '/songs');
    await screen.findByText('6 Songs');
    await user.click(screen.getByRole('button', { name: 'Neuer Song' }));
    const input = document.querySelector<HTMLInputElement>('input[type="file"]')!;
    await user.upload(input, wav('07_Neuer_Hit.wav'));
    expect(await screen.findByDisplayValue('Neuer Hit')).toBeInTheDocument();
    expect(screen.getByText('Band-App Uploads')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Song anlegen' }));
    expect(await screen.findByRole('heading', { level: 1, name: 'Neuer Hit' })).toBeInTheDocument();
    expect(await screen.findByText(/Band-App Uploads/)).toBeInTheDocument();
    await user.click(screen.getByRole('link', { name: 'Songs' }));
    expect(await screen.findByText('7 Songs')).toBeInTheDocument();
  });

  it('shows the folder view with compact paths and steps into folders', async () => {
    const user = userEvent.setup();
    await enterDemo(user, '/songs');
    await screen.findByText('6 Songs');
    await user.click(screen.getByRole('radio', { name: 'Ordner' }));
    const folder = await screen.findByRole('button', { name: /Live \/ 2025 Stadtfest/ });
    await user.click(folder);
    expect(await screen.findByRole('link', { name: /Midnight Engine \(Live\)/ })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Alle Ordner' }));
    expect(await screen.findByRole('button', { name: /Proben \/ 2026-09-17/ })).toBeInTheDocument();
  });
});

describe('Practice view (M4 in demo mode)', () => {
  beforeEach(() => localStorage.clear());

  it('opens the practice view with lyrics, notes and tempo/pitch/loop controls', async () => {
    const user = userEvent.setup();
    await enterDemo(user, '/songs');
    await screen.findByText('6 Songs');
    await user.click(screen.getByRole('link', { name: /^Midnight Engine(?! \()/ }));
    await user.click(await screen.findByRole('button', { name: 'Verknüpfen' }));
    await user.click(screen.getByRole('button', { name: 'Abspielen' }));
    await user.click(screen.getAllByRole('button', { name: 'Übungsansicht' })[0]!);
    const view = await screen.findByRole('dialog', { name: /Üben: Midnight Engine/ });
    expect(await within(view).findByText(/Scheinwerfer im Regen/)).toBeInTheDocument();
    await user.click(within(view).getByRole('button', { name: 'Langsamer' }));
    expect(within(view).getAllByText('95 %').length).toBeGreaterThan(0);
    await user.click(within(view).getByRole('button', { name: 'Tiefer' }));
    expect(within(view).getByText('−1 Halbton')).toBeInTheDocument();
    // A–B needs a known duration (jsdom plays nothing) – covered by the engine tests
    expect(within(view).getByRole('button', { name: 'A setzen' })).toBeInTheDocument();
    await user.click(within(view).getByRole('button', { name: 'Zurücksetzen' }));
    expect(within(view).queryByText('95 %')).not.toBeInTheDocument();
    await user.click(within(view).getByRole('button', { name: 'Übungsansicht schließen' }));
    expect(await screen.findByRole('heading', { level: 1, name: 'Midnight Engine' })).toBeInTheDocument();
  });
});

describe('Calendar (M5 in demo mode)', () => {
  beforeEach(() => localStorage.clear());

  it('creates a weekly rehearsal, answers and cancels one date', async () => {
    const user = userEvent.setup();
    await enterDemo(user, '/calendar');
    await user.click((await screen.findAllByRole('button', { name: 'Termin anlegen' }))[0]!);
    await user.click(screen.getByRole('button', { name: 'Probe' }));
    await user.clear(screen.getByLabelText('Ort'));
    await user.type(screen.getByLabelText('Ort'), 'Proberaum');
    await user.selectOptions(screen.getByRole('combobox', { name: 'Wiederholung' }), 'weekly');
    await user.click(screen.getByRole('button', { name: 'Speichern' }));

    // detail of the first date
    expect(await screen.findByText(/Jede Woche am/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Ich bin dabei' }));
    expect(await screen.findByText('Zugesagt (1)')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Absagen' }));
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Nur diesen Termin' }));
    expect(await screen.findByText('Fällt aus')).toBeInTheDocument();

    // start screen shows the next dates
    await user.click(screen.getByRole('link', { name: 'Start' }));
    expect(await screen.findByRole('heading', { name: 'Nächste Termine' })).toBeInTheDocument();
    expect(screen.getAllByText(/Proberaum/).length).toBeGreaterThan(1);
  });

  it('shows an absence as conflict on a gig', async () => {
    const user = userEvent.setup();
    await enterDemo(user, '/calendar/new?type=absence&date=2027-03-10');
    await user.click(await screen.findByRole('button', { name: 'Speichern' }));
    await screen.findByText(/Lisa abwesend/);
    await user.click(screen.getByRole('link', { name: 'Kalender' }));
    await user.click((await screen.findAllByRole('button', { name: 'Termin anlegen' }))[0]!);
    await user.click(screen.getByRole('button', { name: 'Auftritt' }));
    await user.type(screen.getByLabelText('Titel'), 'Stadtfest');
    const date = screen.getByLabelText('Datum');
    await user.clear(date);
    await user.type(date, '2027-03-10');
    await user.click(screen.getByRole('button', { name: 'Speichern' }));
    expect(await screen.findByText('Lisa ist abwesend')).toBeInTheDocument();
    expect(screen.getByText(/Treffpunkt 18:00/)).toBeInTheDocument();
  });
});

describe('Setlists (M6 in demo mode)', () => {
  beforeEach(() => localStorage.clear());

  it('builds a setlist, saves it, practices it and shows stage + print views', async () => {
    const user = userEvent.setup();
    await enterDemo(user, '/setlists');
    await user.click((await screen.findAllByRole('button', { name: 'Neue Setlist' }))[0]!);
    const dialog = screen.getByRole('dialog');
    const name = within(dialog).getByRole('textbox', { name: 'Name' });
    await user.clear(name);
    await user.type(name, 'Stadtfest');
    await user.click(within(dialog).getByRole('button', { name: 'Neue Setlist' }));

    // editor: add two songs via the picker (phone layout in tests)
    await user.click(await screen.findByRole('button', { name: 'Songs hinzufügen' }));
    const picker = screen.getByRole('dialog', { name: 'Songs hinzufügen' });
    await user.click(within(picker).getByRole('checkbox', { name: 'Open Road auswählen' }));
    await user.click(within(picker).getByRole('checkbox', { name: 'Rust and Thunder auswählen' }));
    await user.click(within(picker).getByRole('button', { name: 'Hinzufügen (2)' }));
    await user.click(within(picker).getByRole('button', { name: 'Schließen' }));
    expect(screen.getByText(/1\. Open Road/)).toBeInTheDocument();

    // direct transition from song 1 to song 2
    await user.click(screen.getAllByRole('button', { name: 'Aktionen' })[0]!);
    await user.click(screen.getByRole('menuitem', { name: 'Direkt weiter' }));
    await user.click(screen.getByRole('button', { name: 'Zwischenpunkt' }));
    await user.type(screen.getByRole('textbox', { name: 'Zwischenpunkt' }), 'Ansage: Merch');
    await user.click(screen.getByRole('button', { name: 'Speichern' }));
    expect(await screen.findByText('Setlist gespeichert')).toBeInTheDocument();

    // detail
    await user.click(within(screen.getByRole('navigation', { name: 'Hauptmenü' })).getByRole('link', { name: 'Setlists' }));
    await user.click(await screen.findByRole('link', { name: /Stadtfest/ }));
    expect(await screen.findByLabelText('Direkt weiter')).toBeInTheDocument();
    expect(screen.getByText('Ansage: Merch')).toBeInTheDocument();

    // stage view
    await user.click(screen.getByRole('button', { name: 'Bühnenansicht' }));
    expect(await screen.findByRole('dialog', { name: 'Stadtfest' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Bühnenansicht schließen' }));

    // setlist mode in Songs
    await user.click(await screen.findByRole('button', { name: 'Setlist üben' }));
    expect(await screen.findByText('Setlist: Stadtfest')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /Open Road/ }));
    expect(await screen.findByRole('region', { name: 'Läuft gerade' })).toHaveTextContent('1 / 2');
  });
});

describe('Chat (M7 in demo mode)', () => {
  beforeEach(() => localStorage.clear());

  it('sends, reacts, discusses an event and shows unread messages to other members', async () => {
    const user = userEvent.setup();
    await enterDemo(user, '/chat');
    const input = await screen.findByRole('textbox', { name: 'Nachricht an die Band …' });
    await user.type(input, 'Wer bringt die PA mit?');
    await user.click(screen.getByRole('button', { name: 'Senden' }));
    expect(await screen.findByText('Wer bringt die PA mit?')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Aktionen für diese Nachricht' }));
    await user.click(screen.getByRole('menuitem', { name: 'Reagieren mit 👍' }));
    expect(await screen.findByRole('button', { name: '👍 1' })).toBeInTheDocument();

    // event with discussion + cancel → info line
    await user.click(screen.getByRole('link', { name: 'Kalender' }));
    await user.click((await screen.findAllByRole('button', { name: 'Termin anlegen' }))[0]!);
    await user.click(screen.getByRole('button', { name: 'Auftritt' }));
    await user.type(screen.getByLabelText('Titel'), 'Stadtfest');
    await user.click(screen.getByRole('button', { name: 'Speichern' }));
    await user.click(await screen.findByRole('button', { name: 'Diskussion' }));
    await user.type(screen.getByRole('textbox', { name: 'Nachricht dazu …' }), 'Soundcheck um 17 Uhr?');
    await user.click(screen.getAllByRole('button', { name: 'Senden' }).at(-1)!);
    expect(await screen.findByText('Soundcheck um 17 Uhr?')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Absagen' }));
    await user.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Absagen' }));

    await user.click(screen.getByRole('link', { name: 'Chat' }));
    expect(await screen.findByText(/Lisa hat Stadtfest am .* abgesagt/)).toBeInTheDocument();
    expect(screen.getAllByText(/Stadtfest/).length).toBeGreaterThan(1); // context chip

    // another member sees the messages as unread
    await user.click(within(screen.getByRole('navigation', { name: 'Hauptmenü' })).getByRole('link', { name: 'Einstellungen' }));
    await user.click(await screen.findByRole('button', { name: 'Profil wechseln' }));
    await user.click(await screen.findByRole('button', { name: 'Ich bin neu' }));
    await user.type(screen.getByRole('textbox', { name: 'Name' }), 'Tom');
    await user.click(screen.getByRole('button', { name: "Los geht's" }));
    // the app returns to the chat: Tom sees the "Neue Nachrichten" divider, and reading marks them read
    expect(await screen.findByText('Neue Nachrichten')).toBeInTheDocument();
    await user.click(screen.getByRole('link', { name: 'Start' }));
    expect(await screen.findByText('Keine neuen Nachrichten')).toBeInTheDocument();
  });
});

describe('Search (M8 in demo mode)', () => {
  beforeEach(() => localStorage.clear());

  it('finds songs, lyrics lines, settings and dates – umlaut and typo tolerant', async () => {
    const user = userEvent.setup();
    await enterDemo(user, '/songs');
    await screen.findByText('6 Songs');
    // link the suggested lyrics so their text gets indexed
    await user.click(screen.getByRole('link', { name: /^Midnight Engine(?! \()/ }));
    await user.click(await screen.findByRole('button', { name: 'Verknüpfen' }));
    await screen.findByText(/Scheinwerfer im Regen/);
    // a rehearsal in October for the date search
    await user.click(screen.getByRole('link', { name: 'Kalender' }));
    await user.click((await screen.findAllByRole('button', { name: 'Termin anlegen' }))[0]!);
    await user.click(screen.getByRole('button', { name: 'Auftritt' }));
    await user.type(screen.getByLabelText('Titel'), 'Stadtfest');
    await user.clear(screen.getByLabelText('Datum'));
    await user.type(screen.getByLabelText('Datum'), '2027-10-16');
    await user.click(screen.getByRole('button', { name: 'Speichern' }));
    await screen.findByText(/Stadtfest/);

    await user.click(screen.getAllByRole('button', { name: 'Suche öffnen' })[0]!);
    const box = await screen.findByRole('searchbox', { name: 'Suchen …' });

    // lyrics are indexed in the background (throttled), so allow some time
    await user.type(box, 'scheinwerfr'); // typo
    expect(await screen.findByRole('heading', { name: /Songtexte/ }, { timeout: 6000 })).toBeInTheDocument();
    expect(screen.getAllByText(/Regen/).length).toBeGreaterThan(0);

    await user.clear(box);
    await user.type(box, 'dunkelmodus');
    expect(await screen.findByText('Darstellung (Hell / Dunkel)')).toBeInTheDocument();

    await user.clear(box);
    await user.type(box, 'stadtfst'); // typo
    expect(await screen.findByText('Stadtfest')).toBeInTheDocument();

    await user.clear(box);
    await user.type(box, 'okt');
    expect(await screen.findByRole('heading', { name: /Termine/ })).toBeInTheDocument();
    expect(screen.getAllByText(/Stadtfest/).length).toBeGreaterThan(0);

    await user.clear(box);
    await user.type(box, 'zzzzqq');
    expect(await screen.findByText(/Nichts gefunden für/)).toBeInTheDocument();
  }, 20_000);

  it('opens a song from the result list and remembers the search', async () => {
    const user = userEvent.setup();
    await enterDemo(user, '/search?q=open%20road');
    const result = await screen.findByRole('button', { name: /Open Road/ });
    await user.click(result);
    expect(await screen.findByRole('heading', { level: 1, name: 'Open Road' })).toBeInTheDocument();
    const key = Object.keys(localStorage).find((k) => k.startsWith('bandapp.recentSearches.'));
    expect(JSON.parse(localStorage.getItem(key ?? '') ?? '[]')).toEqual(['open road']);
  });
});

describe('Touch behaviour (phone)', () => {
  beforeEach(() => localStorage.clear());
  const original = window.matchMedia;
  afterEach(() => {
    window.matchMedia = original;
  });

  const asPhone = () => {
    window.matchMedia = ((query: string) => ({ ...original(query), matches: query.includes('max-width: 767px') })) as typeof window.matchMedia;
  };
  const swipe = (target: Element, from: number, to: number, dy = 10) => {
    fireEvent.touchStart(target, { touches: [{ clientX: from, clientY: 400 }] });
    fireEvent.touchEnd(target, { changedTouches: [{ clientX: to, clientY: 400 + dy }] });
  };

  it('swiping left/right moves through the bottom bar tabs', async () => {
    asPhone();
    const user = userEvent.setup();
    await enterDemo(user, '/');
    const main = screen.getByRole('main');
    swipe(main, 300, 100);
    expect(await screen.findByRole('heading', { level: 1, name: 'Songs' })).toBeInTheDocument();
    swipe(screen.getByRole('main'), 300, 100);
    expect(await screen.findByRole('heading', { level: 1, name: 'Kalender' })).toBeInTheDocument();
    swipe(screen.getByRole('main'), 100, 300);
    expect(await screen.findByRole('heading', { level: 1, name: 'Songs' })).toBeInTheDocument();
  });

  it('does not swipe on mostly vertical moves, near the screen edge or on inputs', async () => {
    asPhone();
    const user = userEvent.setup();
    await enterDemo(user, '/songs');
    const main = screen.getByRole('main');
    await screen.findByRole('heading', { level: 1, name: 'Songs' });
    swipe(main, 300, 100, 200); // diagonal scroll
    swipe(main, 8, 250); // starts at the system edge
    swipe(screen.getByRole('searchbox'), 300, 100); // text field
    await new Promise((r) => setTimeout(r, 100));
    expect(screen.getByRole('heading', { level: 1, name: 'Songs' })).toBeInTheDocument();
  });

  it('does not swipe away from screens that are not bottom bar tabs', async () => {
    asPhone();
    const user = userEvent.setup();
    await enterDemo(user, '/setlists');
    swipe(screen.getByRole('main'), 300, 100);
    await new Promise((r) => setTimeout(r, 100));
    expect(screen.getByRole('heading', { level: 1, name: 'Setlists' })).toBeInTheDocument();
  });
});

describe('Calendar subscription (M9 in demo mode)', () => {
  beforeEach(() => localStorage.clear());

  it('creates, renews and ends the subscription link', async () => {
    const user = userEvent.setup();
    await enterDemo(user, '/calendar/subscribe');
    await user.click(await screen.findByRole('button', { name: 'Abo-Link erstellen' }));
    const link = (await screen.findByRole('textbox', { name: 'Abo-Link' })) as HTMLInputElement;
    const first = link.value;
    expect(first).toMatch(/^https:\/\/share\.example\.invalid\/.*band\.ics$/);
    await user.click(screen.getByRole('button', { name: 'Neuen Link erstellen' }));
    await user.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Neuen Link erstellen' }));
    await waitFor(() => expect((screen.getByRole('textbox', { name: 'Abo-Link' }) as HTMLInputElement).value).not.toBe(first));
    await user.click(screen.getByRole('button', { name: 'Abo beenden' }));
    await user.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Abo beenden' }));
    expect(await screen.findByRole('button', { name: 'Abo-Link erstellen' })).toBeInTheDocument();
  });
});
