import { screen, waitForElementToBeRemoved, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import { enterDemo } from '@/test/demo';

describe('Player (v0.16.0: replaces the practice view)', () => {
  beforeEach(() => localStorage.clear());

  it('"Üben" on the song page opens the player with tempo/pitch/loop, Songtext shows the lyrics, closing returns', async () => {
    const user = userEvent.setup();
    await enterDemo(user, '/songs');
    await screen.findByText('6 Songs');
    await user.click(screen.getByRole('link', { name: /^Midnight Engine(?! \()/ }));
    await user.click(await screen.findByRole('button', { name: 'Verknüpfen' }));
    await user.click(screen.getByRole('button', { name: 'Abspielen' }));
    await user.click(screen.getByRole('button', { name: 'Üben' }));

    const player = await screen.findByRole('dialog', { name: 'Player: Midnight Engine' });
    expect(within(player).getByRole('radio', { name: 'Üben' })).toBeChecked();
    await user.click(within(player).getByRole('button', { name: 'Langsamer' }));
    expect(within(player).getAllByText('95 %').length).toBeGreaterThan(0);
    await user.click(within(player).getByRole('button', { name: 'Tiefer' }));
    expect(within(player).getByText('−1 Halbton')).toBeInTheDocument();
    // A–B needs a known duration (jsdom plays nothing) – covered by the engine tests
    expect(within(player).getByRole('button', { name: 'A setzen' })).toBeInTheDocument();
    await user.click(within(player).getByRole('button', { name: 'Zurücksetzen' }));
    expect(within(player).queryByText('95 %')).not.toBeInTheDocument();

    await user.click(within(player).getByRole('radio', { name: 'Songtext' }));
    expect(await within(player).findByText(/Scheinwerfer im Regen/)).toBeInTheDocument();
    // one play button, ⏮/⏭ only while a setlist plays (they keep their place, hidden)
    expect(within(player).getByRole('button', { name: 'Pause' })).toBeInTheDocument();

    await user.click(within(player).getByRole('button', { name: 'Player schließen' }));
    await waitForElementToBeRemoved(player); // after the closing animation
    expect(screen.getByRole('heading', { level: 1, name: 'Midnight Engine' })).toBeInTheDocument();
  });

  it('the mini player opens the player; closing goes back to where you were', async () => {
    const user = userEvent.setup();
    await enterDemo(user, '/songs');
    await screen.findByText('6 Songs');
    await user.click(screen.getByRole('button', { name: 'Rust and Thunder abspielen' }));
    const mini = await screen.findByRole('region', { name: 'Läuft gerade' });
    await user.click(within(mini).getByRole('link', { name: 'Player öffnen: Rust and Thunder' }));

    const player = await screen.findByRole('dialog', { name: 'Player: Rust and Thunder' });
    expect(within(player).getByRole('radio', { name: 'Songtext' })).toBeChecked();
    expect(screen.queryByRole('region', { name: 'Läuft gerade' })).not.toBeInTheDocument(); // the mini player became the player
    await user.click(within(player).getByRole('button', { name: 'Player schließen' }));
    await waitForElementToBeRemoved(player);
    expect(screen.getByRole('heading', { level: 1, name: 'Songs' })).toBeInTheDocument();
    expect(await screen.findByRole('region', { name: 'Läuft gerade' })).toBeInTheDocument();
  });

  it('says what to do when nothing plays', async () => {
    const user = userEvent.setup();
    await enterDemo(user, '/player');
    expect(await screen.findByText('Gerade läuft nichts.')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Zu den Songs' }));
    expect(await screen.findByRole('heading', { level: 1, name: 'Songs' })).toBeInTheDocument();
  });
});
