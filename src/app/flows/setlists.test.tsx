import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import { enterDemo } from '@/test/demo';

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

    // playing the setlist opens the player on its queue (v0.16.0) – the Songs tab stays the song list
    await user.click(await screen.findByRole('button', { name: 'Abspielen' }));
    const player = await screen.findByRole('dialog', { name: 'Player: Open Road' });
    expect(within(player).getByRole('radio', { name: 'Setlist' })).toBeChecked();
    expect(within(player).getByRole('link', { name: 'Setlist: Stadtfest' })).toBeInTheDocument();
    expect(within(player).getByText(/Stadtfest · 1 \/ 2/)).toBeInTheDocument();
    await user.click(within(player).getByRole('button', { name: 'Nächster' }));
    expect(await within(screen.getByRole('dialog', { name: 'Player: Rust and Thunder' })).findByText(/Stadtfest · 2 \/ 2/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Player schließen' }));
    expect(await screen.findByRole('heading', { level: 1, name: 'Stadtfest' })).toBeInTheDocument();
    expect(await screen.findByRole('region', { name: 'Läuft gerade' })).toHaveTextContent('2 / 2');
    await user.click(within(screen.getByRole('navigation', { name: 'Hauptmenü' })).getByRole('link', { name: 'Songs' }));
    expect(await screen.findByText('6 Songs')).toBeInTheDocument();
  });
});

describe('One setlist page from every entry point (v0.18.0)', () => {
  beforeEach(() => localStorage.clear());

  it('event → new setlist → save shows it → back to the event → card opens the same page; edit returns too', async () => {
    const user = userEvent.setup();
    await enterDemo(user, '/calendar/new?type=gig');
    await user.type(await screen.findByLabelText('Titel'), 'Stadtfest');
    await user.click(screen.getByRole('button', { name: 'Speichern' }));
    await screen.findByRole('heading', { level: 1, name: 'Stadtfest' });

    await user.click(screen.getByRole('button', { name: 'Neue Setlist für diesen Termin' }));
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Neue Setlist' }));
    await user.click(await screen.findByRole('button', { name: 'Songs hinzufügen' }));
    const picker = screen.getByRole('dialog', { name: 'Songs hinzufügen' });
    await user.click(within(picker).getByRole('checkbox', { name: 'Open Road auswählen' }));
    await user.click(within(picker).getByRole('button', { name: 'Hinzufügen (1)' }));
    await user.click(within(picker).getByRole('button', { name: 'Schließen' }));
    await user.click(screen.getByRole('button', { name: 'Speichern' }));

    // saved → the new setlist's page (one action pair, the rest in ⋯)
    expect(await screen.findByRole('button', { name: 'Bühnenansicht' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Abspielen' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Drucken' })).not.toBeInTheDocument();
    const name = screen.getByRole('heading', { level: 1 }).textContent!;

    await user.click(screen.getByRole('button', { name: 'Zurück' }));
    expect(await screen.findByRole('heading', { level: 1, name: 'Stadtfest' })).toBeInTheDocument();
    await user.click(screen.getByRole('link', { name: new RegExp(name) }));
    expect(await screen.findByRole('heading', { level: 1, name })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Bühnenansicht' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Zurück' }));

    await user.click(await screen.findByRole('button', { name: 'Setlist bearbeiten' })); // not just "Bearbeiten" – the event has one too
    await user.click(await screen.findByRole('button', { name: 'Abbrechen' }));
    expect(await screen.findByRole('heading', { level: 1, name: 'Stadtfest' })).toBeInTheDocument();
  });
});
