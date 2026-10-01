import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import { enterDemo } from '@/test/demo';

describe('Practice view (M4 in demo mode)', () => {
  beforeEach(() => localStorage.clear());

  it('opens the practice view with lyrics, notes and tempo/pitch/loop controls', async () => {
    const user = userEvent.setup();
    await enterDemo(user, '/songs');
    await screen.findByText('6 Songs');
    await user.click(screen.getByRole('link', { name: /^Midnight Engine(?! \()/ }));
    await user.click(await screen.findByRole('button', { name: 'Verknüpfen' }));
    await user.click(screen.getByRole('button', { name: 'Abspielen' }));
    await user.click(screen.getAllByRole('button', { name: 'Übungsansicht' })[0]!);
    const view = await screen.findByRole('dialog', { name: /Üben: Midnight Engine/ });
    expect(await within(view).findByText(/Scheinwerfer im Regen/)).toBeInTheDocument();
    await user.click(within(view).getByRole('button', { name: 'Langsamer' }));
    expect(within(view).getAllByText('95 %').length).toBeGreaterThan(0);
    await user.click(within(view).getByRole('button', { name: 'Tiefer' }));
    expect(within(view).getByText('−1 Halbton')).toBeInTheDocument();
    // A–B needs a known duration (jsdom plays nothing) – covered by the engine tests
    expect(within(view).getByRole('button', { name: 'A setzen' })).toBeInTheDocument();
    await user.click(within(view).getByRole('button', { name: 'Zurücksetzen' }));
    expect(within(view).queryByText('95 %')).not.toBeInTheDocument();
    await user.click(within(view).getByRole('button', { name: 'Übungsansicht schließen' }));
    expect(await screen.findByRole('heading', { level: 1, name: 'Midnight Engine' })).toBeInTheDocument();
  });
});
