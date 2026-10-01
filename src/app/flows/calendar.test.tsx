import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
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

describe('Reminders before events (v0.14)', () => {
  beforeEach(() => localStorage.clear());

  it('sets defaults per type in the settings and changes them for one event', async () => {
    const user = userEvent.setup();
    await enterDemo(user, '/settings');
    const gigs = await screen.findByRole('group', { name: 'Erinnerung für Auftritte' });
    expect(within(gigs).getByRole('button', { name: '1 Tag' })).toHaveAttribute('aria-pressed', 'true');
    await user.click(within(gigs).getByRole('button', { name: '1 Tag' }));
    expect(await screen.findByText(/– 3 Std\. vorher/)).toBeInTheDocument();

    await user.click(screen.getByRole('link', { name: 'Kalender' }));
    await user.click((await screen.findAllByRole('button', { name: 'Termin anlegen' }))[0]!);
    await user.click(screen.getByRole('button', { name: 'Auftritt' }));
    await user.type(screen.getByLabelText('Titel'), 'Stadtfest');
    await user.click(screen.getByRole('button', { name: 'Speichern' }));

    const mine = await screen.findByRole('group', { name: 'Meine Erinnerung' });
    expect(screen.getByText(/3 Std\. vorher · Standard für Auftritte/)).toBeInTheDocument();
    const reset = screen.getByRole('button', { name: 'Standard für Auftritte verwenden' });
    expect(reset).toBeDisabled();
    await user.click(within(mine).getByRole('button', { name: '30 Min.' }));
    expect(await screen.findByText(/3 Std\. und 30 Min\. vorher · nur für diesen Termin/)).toBeInTheDocument();
    await user.click(reset);
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
