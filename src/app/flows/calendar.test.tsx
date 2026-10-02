import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { enterDemo } from '@/test/demo';
import { formatDate } from '@/core/i18n/format';
import { addDays, todayLocal } from '@/features/calendar/time';

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

    // rarer actions are in ⋯ (v0.18.1)
    await user.click(screen.getByRole('button', { name: /^Weitere Aktionen für/ }));
    await user.click(screen.getByRole('menuitem', { name: 'Absagen' }));
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

describe('Calendar subscription (M9 in demo mode)', () => {
  beforeEach(() => localStorage.clear());

  it('creates, renews and ends the subscription link', async () => {
    const user = userEvent.setup();
    await enterDemo(user, '/calendar/subscribe');
    await user.click(await screen.findByRole('button', { name: 'Abo-Link erstellen' }));
    const link = (await screen.findByRole('textbox', { name: 'Abo-Link' })) as HTMLInputElement;
    const first = link.value;
    expect(first).toMatch(/^https:\/\/beispiel\.invalid\/calendar\/[A-Za-z0-9_-]{32}\.ics$/); // demo: example address (v0.19.1)
    expect(screen.getByText(/Im Demo-Modus ist der Link nur ein Beispiel/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Neuen Link erstellen' }));
    await user.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Neuen Link erstellen' }));
    await waitFor(() => expect((screen.getByRole('textbox', { name: 'Abo-Link' }) as HTMLInputElement).value).not.toBe(first));
    await user.click(screen.getByRole('button', { name: 'Abo beenden' }));
    await user.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Abo beenden' }));
    expect(await screen.findByRole('button', { name: 'Abo-Link erstellen' })).toBeInTheDocument();
  });
});

describe('Reminders before events (v0.14)', () => {
  beforeEach(() => localStorage.clear());

  it('sets defaults per type in the settings and changes them for one event', async () => {
    const user = userEvent.setup();
    await enterDemo(user, '/settings');
    // one line per type; the choices open in a dialog (v0.18.1)
    expect(await screen.findByText('1 Tag und 3 Std. vorher')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Ändern: Auftritte' }));
    const gigs = within(screen.getByRole('dialog')).getByRole('group', { name: 'Erinnerung für Auftritte' });
    expect(within(gigs).getByRole('button', { name: '1 Tag' })).toHaveAttribute('aria-pressed', 'true');
    await user.click(within(gigs).getByRole('button', { name: '1 Tag' }));
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Schließen' }));
    expect(await screen.findByText('3 Std. vorher')).toBeInTheDocument();

    await user.click(screen.getByRole('link', { name: 'Kalender' }));
    await user.click((await screen.findAllByRole('button', { name: 'Termin anlegen' }))[0]!);
    await user.click(screen.getByRole('button', { name: 'Auftritt' }));
    await user.type(screen.getByLabelText('Titel'), 'Stadtfest');
    await user.click(screen.getByRole('button', { name: 'Speichern' }));

    expect(await screen.findByText(/3 Std\. vorher · Standard für Auftritte/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Ändern: Meine Erinnerung' }));
    const dialog = screen.getByRole('dialog', { name: 'Meine Erinnerung' });
    const reset = within(dialog).getByRole('button', { name: 'Standard für Auftritte verwenden' });
    expect(reset).toBeDisabled();
    await user.click(within(within(dialog).getByRole('group', { name: 'Meine Erinnerung' })).getByRole('button', { name: '30 Min.' }));
    expect(await within(dialog).findByText(/3 Std\. und 30 Min\. vorher · nur für diesen Termin/)).toBeInTheDocument();
    await user.click(reset);
    await user.click(within(dialog).getByRole('button', { name: 'Schließen' }));
    expect(await screen.findByText(/3 Std\. vorher · Standard für Auftritte/)).toBeInTheDocument();
  });
});

describe('Month view on a phone (v0.14.4)', () => {
  beforeEach(() => localStorage.clear());

  it('tapping a day opens its events in a panel from the bottom', async () => {
    const today = todayLocal();
    const user = userEvent.setup();
    await enterDemo(user, `/calendar/new?date=${today}`);
    await user.click(await screen.findByRole('button', { name: 'Auftritt' }));
    await user.type(screen.getByLabelText('Titel'), 'Stadtfest');
    await user.click(screen.getByRole('button', { name: 'Speichern' }));
    await screen.findByRole('heading', { level: 1, name: 'Stadtfest' });

    await user.click(screen.getByRole('link', { name: 'Kalender' }));
    await user.click(await screen.findByRole('radio', { name: 'Monat' }));
    const dayLabel = formatDate(`${today}T12:00:00Z`);
    await user.click(screen.getByRole('button', { name: `${dayLabel}, 1` }));
    const panel = await screen.findByRole('dialog', { name: dayLabel });
    expect(within(panel).getByText('Stadtfest')).toBeInTheDocument();
    expect(within(panel).getByRole('button', { name: `Termin am ${dayLabel} anlegen` })).toBeInTheDocument();
    await user.click(within(panel).getByRole('button', { name: 'Schließen' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

    // an empty day answers too
    const other = addDays(today, today.endsWith('-01') ? 1 : -1);
    const otherLabel = formatDate(`${other}T12:00:00Z`);
    await user.click(screen.getByRole('button', { name: otherLabel }));
    expect(within(await screen.findByRole('dialog', { name: otherLabel })).getByText('Keine Termine an diesem Tag.')).toBeInTheDocument();
  });
});

describe('Month view on desktop (v0.19.3)', () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => vi.restoreAllMocks());

  it("clicking a day shows its events beside the grid and doesn't scroll to the top", async () => {
    // a 1366 px window: tablet and desktop breakpoints match
    vi.spyOn(window, 'matchMedia').mockImplementation(
      (query: string) =>
        ({ matches: /min-width: (768|1200)px/.test(query), media: query, onchange: null, addEventListener: () => {}, removeEventListener: () => {}, addListener: () => {}, removeListener: () => {}, dispatchEvent: () => false }) as MediaQueryList,
    );
    const today = todayLocal();
    const user = userEvent.setup();
    await enterDemo(user, `/calendar/new?date=${today}`);
    await user.click(await screen.findByRole('button', { name: 'Auftritt' }));
    await user.type(screen.getByLabelText('Titel'), 'Stadtfest');
    await user.click(screen.getByRole('button', { name: 'Speichern' }));
    await screen.findByRole('heading', { level: 1, name: 'Stadtfest' });

    await user.click(screen.getByRole('link', { name: 'Kalender' }));
    const dayLabel = formatDate(`${today}T12:00:00Z`);
    await user.click(await screen.findByRole('button', { name: `${dayLabel}, 1` }));
    const other = addDays(today, today.endsWith('-01') ? 1 : -1);
    const otherLabel = formatDate(`${other}T12:00:00Z`);
    const scrollTo = vi.spyOn(window, 'scrollTo');
    await user.click(screen.getByRole('button', { name: otherLabel }));

    // no panel: the day's events replace the list beside the grid
    expect(await screen.findByRole('heading', { level: 2, name: otherLabel })).toBeInTheDocument();
    expect(screen.getByText('Keine Termine an diesem Tag.')).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    // picking a day is not a new screen: <ScrollRestoration> must not jump to the top
    expect(scrollTo).not.toHaveBeenCalledWith(0, 0);

    await user.click(screen.getByRole('button', { name: `${dayLabel}, 1` }));
    expect(await screen.findByRole('heading', { level: 2, name: dayLabel })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: `Termin am ${dayLabel} anlegen` })).toBeInTheDocument();
  });
});

describe('Calm event page (v0.18.1, R-UX-09)', () => {
  beforeEach(() => localStorage.clear());

  it('✎ and ⋯ in the top bar, comment and reminder on request', async () => {
    const user = userEvent.setup();
    await enterDemo(user, '/calendar/new?type=gig');
    await user.type(await screen.findByLabelText('Titel'), 'Stadtfest');
    await user.click(screen.getByRole('button', { name: 'Speichern' }));
    await screen.findByRole('heading', { level: 1, name: 'Stadtfest' });

    expect(screen.queryByRole('button', { name: 'Löschen' })).not.toBeInTheDocument();
    expect(screen.queryByRole('textbox', { name: /Kommentar/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '1 Tag' })).not.toBeInTheDocument(); // reminder chips only in their dialog

    await user.click(screen.getByRole('button', { name: 'Kommentar hinzufügen' }));
    expect(screen.getByRole('textbox', { name: /Kommentar/ })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Weitere Aktionen für Stadtfest' }));
    expect(screen.getAllByRole('menuitem').map((item) => item.textContent)).toEqual(['Zum Kalender hinzufügen', 'Absagen', 'Löschen']);
    await user.keyboard('{Escape}');
    await user.click(screen.getByRole('button', { name: 'Bearbeiten' }));
    expect(await screen.findByRole('button', { name: 'Abbrechen' })).toBeInTheDocument();
  });
});
