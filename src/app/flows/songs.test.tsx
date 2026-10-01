import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
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
