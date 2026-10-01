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

    // setlist mode in Songs
    await user.click(await screen.findByRole('button', { name: 'Setlist üben' }));
    expect(await screen.findByText('Setlist: Stadtfest')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /Open Road/ }));
    expect(await screen.findByRole('region', { name: 'Läuft gerade' })).toHaveTextContent('1 / 2');
  });
});
