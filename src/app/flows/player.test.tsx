import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import { enterDemo } from '@/test/demo';

describe('Practising on the song screen (v1.1.0: song page and player in one)', () => {
  beforeEach(() => localStorage.clear());

  it('tempo, pitch and loop on "Üben"; "Songtext" shows the lyrics; ← returns to the list', async () => {
    const user = userEvent.setup();
    await enterDemo(user, '/songs');
    await screen.findByText('6 Songs');
    await user.click(screen.getByRole('link', { name: /^Midnight Engine(?! \()/ }));
    await screen.findByRole('heading', { level: 1, name: 'Midnight Engine' });
    await user.click(screen.getByRole('button', { name: 'Abspielen' }));

    await user.click(screen.getByRole('button', { name: 'Langsamer' }));
    expect(screen.getAllByText('95 %').length).toBeGreaterThan(0);
    await user.click(screen.getByRole('button', { name: 'Tiefer' }));
    expect(screen.getByText('−1 Halbton')).toBeInTheDocument();
    // the loop: A first, B only once A is set (jsdom plays nothing, so the position stays at 0 – the
    // engine tests cover the timing)
    expect(screen.getByRole('button', { name: 'A setzen' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'B setzen' })).toBeDisabled();
    expect(screen.getByText(/Tippe am Anfang der Stelle auf „A setzen“/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Tempo und Tonhöhe zurücksetzen' }));
    expect(screen.queryByText('95 %')).not.toBeInTheDocument();

    await user.click(screen.getByRole('radio', { name: 'Songtext' }));
    await user.click(await screen.findByRole('button', { name: 'Verknüpfen' }));
    expect(await screen.findByText(/Scheinwerfer im Regen/)).toBeInTheDocument();
    // the playback controls stay at the bottom on every tab
    expect(screen.getByRole('button', { name: 'Pause' })).toBeInTheDocument();
    expect(screen.getByRole('slider', { name: 'Position im Song' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Zurück' }));
    await waitFor(() => expect(document.querySelector('[data-song-screen]')).toBeNull()); // after the closing animation
    expect(screen.getByRole('heading', { level: 1, name: 'Songs' })).toBeInTheDocument();
  });

  it('old player addresses lead to the song screen; with nothing playing they say what to do', async () => {
    const user = userEvent.setup();
    await enterDemo(user, '/player');
    expect(await screen.findByText('Gerade läuft nichts.')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Zu den Songs' }));
    expect(await screen.findByRole('heading', { level: 1, name: 'Songs' })).toBeInTheDocument();
  });
});
