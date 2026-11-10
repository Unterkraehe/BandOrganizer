import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { enterDemo, type User } from '@/test/demo';

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
    await user.click(screen.getByRole('button', { name: 'Infos zum Song' }));
    expect(within(screen.getByRole('dialog', { name: 'Infos' })).getByText(/Proben\/2026-09-17/)).toBeInTheDocument();
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
    await user.click(await screen.findByRole('button', { name: 'Weitere Aktionen für Open Road' }));
    await user.click(screen.getByRole('menuitem', { name: 'Bearbeiten' }));
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
    // the notes are part of "Üben", the first tab – no extra tap
    expect(screen.getByRole('radio', { name: 'Üben' })).toBeChecked();
    expect(screen.getByRole('radio', { name: 'Für alle' })).toBeChecked();
    await user.click(screen.getByRole('button', { name: 'Notiz hinzufügen' }));
    await user.type(screen.getByRole('textbox', { name: 'Notiz für die Band …' }), 'Bridge ab jetzt 2×');
    await user.click(screen.getByRole('checkbox', { name: /Position übernehmen/ }));
    await user.click(screen.getByRole('button', { name: 'Notiz speichern' }));
    expect(await screen.findByText('Bridge ab jetzt 2×')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /springen/ })).toBeInTheDocument();

    await user.click(screen.getByRole('radio', { name: 'Nur für mich' }));
    expect(screen.getByRole('radio', { name: 'Für alle (1)' })).toBeInTheDocument();
    expect(screen.getByText('Nur für dich sichtbar in der App')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Notiz hinzufügen' }));
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
    await user.click(await screen.findByRole('button', { name: 'Infos zum Song' }));
    await user.click(await screen.findByRole('button', { name: 'Als Version hinzufügen' }));
    expect(await screen.findByText(/ist jetzt eine Version/)).toBeInTheDocument();
    const versions = screen.getByRole('heading', { name: 'Versionen' }).closest('section')!;
    const live = within(versions).getByRole('button', { name: /Midnight Engine \(Live\)/ }).closest('li')!;
    await user.click(within(live).getByRole('button', { name: 'Aktionen für diese Version' }));
    await user.click(screen.getByRole('menuitem', { name: 'Als Band-Version festlegen' }));
    await user.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Als Band-Version festlegen' }));
    expect(await within(live).findByText('Band-Version')).toBeInTheDocument();
    await user.click(within(screen.getByRole('dialog', { name: 'Infos' })).getByRole('button', { name: 'Schließen' }));
    await user.click(screen.getByRole('button', { name: 'Zurück' }));
    expect(await screen.findByText('5 Songs')).toBeInTheDocument();
    expect(screen.getByText(/2 Versionen/)).toBeInTheDocument();
  });
});

describe('Member suggestions (v0.13.2)', () => {
  beforeEach(() => localStorage.clear());

  it('keeps songs from "Vorschläge" folders out of the main list', async () => {
    const user = userEvent.setup();
    await enterDemo(user, '/songs');
    expect(await screen.findByText('6 Songs')).toBeInTheDocument();
    expect(screen.queryByText('Velvet Horizon')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Vorschläge anzeigen (2)' }));
    expect(await screen.findByText('Velvet Horizon')).toBeInTheDocument();
    expect(screen.getByText('Paper Crown')).toBeInTheDocument();
    expect(localStorage.getItem('bandapp.songs.showSuggested')).toBe('1');
    await user.click(screen.getByRole('button', { name: 'Vorschläge ausblenden' }));
    expect(screen.queryByText('Velvet Horizon')).not.toBeInTheDocument();
  });
});

describe('Adopting a suggestion (v0.13.3)', () => {
  beforeEach(() => localStorage.clear());

  it('copies the Band-Version out of "Vorschläge" and the song joins the main list', async () => {
    const user = userEvent.setup();
    await enterDemo(user, '/songs');
    expect(await screen.findByText('6 Songs')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Vorschläge anzeigen (2)' }));
    await user.click(await screen.findByRole('button', { name: 'Weitere Aktionen für Velvet Horizon' }));
    await user.click(screen.getByRole('menuitem', { name: 'In die Songliste übernehmen' }));
    const dialog = await screen.findByRole('dialog', { name: 'In die Songliste übernehmen' });
    expect(within(dialog).getByText('Band-App Uploads')).toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: 'Übernehmen' }));
    expect(await screen.findByText('„Velvet Horizon“ steht jetzt in der Songliste')).toBeInTheDocument();
    await user.click(screen.getByRole('link', { name: 'Songs' }));
    expect(await screen.findByText('7 Songs')).toBeInTheDocument();
    // the section stays open (remembered) – only "Paper Crown" is left in it
    await user.click(screen.getByRole('button', { name: 'Vorschläge ausblenden' }));
    expect(screen.getByRole('button', { name: 'Vorschläge anzeigen (1)' })).toBeInTheDocument();
    expect(screen.getByText('Velvet Horizon')).toBeInTheDocument();
  });
});

describe('One song screen: song page and player in one (v1.1.0)', () => {
  beforeEach(() => localStorage.clear());

  it('opens on "Üben" with playback controls and notes; Songtext is the second tab; ⓘ shows the infos', async () => {
    const user = userEvent.setup();
    await enterDemo(user, '/songs');
    await screen.findByText('6 Songs');
    await user.click(screen.getByRole('link', { name: /^Open Road/ }));
    await screen.findByRole('heading', { level: 1, name: 'Open Road' });
    expect(screen.getAllByRole('radio', { name: /^(Üben|Songtext)$/ }).map((r) => (r as HTMLInputElement).value)).toEqual(['practice', 'lyrics']);
    expect(screen.getByRole('radio', { name: 'Üben' })).toBeChecked();
    expect(screen.queryByRole('tab')).not.toBeInTheDocument(); // the four tabs of the old song page are gone
    // nothing plays yet: the practice controls are there but wait for the song
    expect(screen.getByRole('button', { name: 'Langsamer' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'A setzen' })).toBeDisabled();
    expect(screen.getByRole('heading', { name: 'Notizen' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Abspielen' }));
    expect(await screen.findByRole('button', { name: 'Pause' })).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Läuft gerade' })).not.toBeInTheDocument(); // this screen is the player
    expect(screen.getByRole('button', { name: 'Langsamer' })).toBeEnabled();

    await user.click(screen.getByRole('button', { name: 'Infos zum Song' }));
    const infos = screen.getByRole('dialog', { name: 'Infos' });
    expect(within(infos).getByRole('heading', { name: 'Versionen' })).toBeInTheDocument();
    expect(within(infos).getByText(/Diskussion/)).toBeInTheDocument();
    await user.click(within(infos).getByRole('button', { name: 'Schließen' }));

    // leaving the screen: the song keeps playing in the mini player, which leads back to this same screen
    await user.click(screen.getByRole('button', { name: 'Zurück' }));
    expect(await screen.findByRole('heading', { level: 1, name: 'Songs' })).toBeInTheDocument();
    const mini = await screen.findByRole('region', { name: 'Läuft gerade' });
    await user.click(within(mini).getByRole('link', { name: 'Song öffnen: Open Road' }));
    expect(await screen.findByRole('heading', { level: 1, name: 'Open Road' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Pause' })).toBeInTheDocument();
  });
});

describe('Voice notes (v0.19.0)', () => {
  /** jsdom has no microphone: a recorder that "records" one chunk */
  class FakeRecorder {
    static isTypeSupported = (mime: string) => mime.startsWith('audio/mp4');
    state = 'inactive';
    mimeType: string;
    ondataavailable: ((event: { data: Blob }) => void) | null = null;
    onstop: (() => void) | null = null;
    constructor(_stream: unknown, options?: { mimeType?: string }) {
      this.mimeType = options?.mimeType ?? 'audio/mp4';
    }
    start() {
      this.state = 'recording';
    }
    stop() {
      this.state = 'inactive';
      this.ondataavailable?.({ data: new Blob(['voice'], { type: this.mimeType }) });
      this.onstop?.();
    }
  }
  let getUserMedia: () => Promise<unknown>;
  beforeEach(() => {
    localStorage.clear();
    vi.stubGlobal('MediaRecorder', FakeRecorder);
    getUserMedia = async () => ({ getTracks: () => [{ stop() {} }] });
    Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: { getUserMedia: () => getUserMedia() } });
  });
  afterEach(() => vi.unstubAllGlobals());

  it('records, previews and saves a voice note, which then plays', async () => {
    const user = userEvent.setup();
    await enterDemo(user, '/songs');
    await screen.findByText('6 Songs');
    await user.click(screen.getByRole('link', { name: /^Open Road/ }));
    await screen.findByRole('heading', { level: 1, name: 'Open Road' });
    await user.click(screen.getByRole('button', { name: 'Notiz hinzufügen' }));

    await user.click(screen.getByRole('button', { name: 'Sprachnotiz aufnehmen' }));
    expect(await screen.findByText(/Aufnahme läuft · 0:00 \/ 3:00/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Aufnahme beenden' }));
    expect(await screen.findByLabelText('Aufnahme anhören')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Text dazu (optional) …')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Notiz speichern' })); // no text needed

    const play = await screen.findByRole('button', { name: 'Sprachnotiz abspielen' });
    expect(screen.queryByLabelText('Aufnahme anhören')).not.toBeInTheDocument();
    await user.click(play);
    expect(await screen.findByRole('button', { name: 'Sprachnotiz anhalten' })).toBeInTheDocument();
  });

  it('explains a blocked microphone', async () => {
    getUserMedia = async () => {
      throw new DOMException('denied', 'NotAllowedError');
    };
    const user = userEvent.setup();
    await enterDemo(user, '/songs');
    await screen.findByText('6 Songs');
    await user.click(screen.getByRole('link', { name: /^Open Road/ }));
    await screen.findByRole('heading', { level: 1, name: 'Open Road' });
    await user.click(screen.getByRole('button', { name: 'Notiz hinzufügen' }));
    await user.click(screen.getByRole('button', { name: 'Sprachnotiz aufnehmen' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/Mikrofon ist für die App blockiert/);
  });
});
