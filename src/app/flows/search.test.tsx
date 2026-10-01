import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import { enterDemo } from '@/test/demo';

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
