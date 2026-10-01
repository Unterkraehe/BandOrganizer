import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { enterDemo } from '@/test/demo';

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

  it('opens at the newest message instead of the top (v0.13.5)', async () => {
    const user = userEvent.setup();
    await enterDemo(user, '/chat');
    await user.type(await screen.findByRole('textbox', { name: 'Nachricht an die Band …' }), 'Probe am Freitag?');
    await user.click(screen.getByRole('button', { name: 'Senden' }));
    await screen.findByText('Probe am Freitag?');
    await user.click(screen.getByRole('link', { name: 'Start' }));

    const scrollTo = vi.spyOn(window, 'scrollTo');
    try {
      await user.click(await screen.findByRole('link', { name: 'Chat' }));
      // the router resets the page to the top (scrollTo(0, 0)); the chat must scroll down after that
      await waitFor(() => expect(scrollTo.mock.calls.at(-1)?.[0]).toEqual({ top: expect.any(Number) }));
    } finally {
      scrollTo.mockRestore();
    }
  });
});

describe('Notifications settings (v0.13)', () => {
  it('explains that the demo has no notifications', async () => {
    const user = userEvent.setup();
    await enterDemo(user, '/settings');
    expect(await screen.findByRole('heading', { name: 'Benachrichtigungen' })).toBeInTheDocument();
    expect(screen.getByText(/Demo-Modus gibt es keine Benachrichtigungen/)).toBeInTheDocument();
  });
});
