import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import { enterDemo } from '@/test/demo';

describe('Lyrics, uploads and folder view (M3b in demo mode)', () => {
  beforeEach(() => localStorage.clear());

  const wav = (name: string) => new File([new Uint8Array([...'RIFF'].map((c) => c.charCodeAt(0)).concat([0, 0, 0, 0], [...'WAVE'].map((c) => c.charCodeAt(0))))], name, { type: 'audio/wav' });

  it('links a suggested lyrics file and shows the text', async () => {
    const user = userEvent.setup();
    await enterDemo(user, '/songs');
    await screen.findByText('6 Songs');
    await user.click(screen.getByRole('link', { name: /^Midnight Engine(?! \()/ }));
    expect(await screen.findByText(/Songtext gefunden/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Verknüpfen' }));
    expect(await screen.findByText(/Scheinwerfer im Regen/)).toBeInTheDocument();
  });

  it('types lyrics and saves them as a new file in the chosen folder', async () => {
    const user = userEvent.setup();
    await enterDemo(user, '/songs');
    await screen.findByText('6 Songs');
    await user.click(screen.getByRole('link', { name: /^Rust and Thunder/ }));
    await user.click(await screen.findByRole('button', { name: 'Songtext hinzufügen' }));
    await user.click(within(screen.getByRole('dialog', { name: 'Songtext hinzufügen' })).getByRole('button', { name: 'Songtext eintippen' }));
    await user.type(await screen.findByRole('textbox', { name: 'Songtext' }), 'Rost und Donner');
    expect(screen.getByText('Band-App Uploads')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Speichern' }));
    expect(await screen.findByText('Rost und Donner')).toBeInTheDocument();
    expect(screen.getByText('Rust and Thunder - Text.txt')).toBeInTheDocument();
  });

  it('creates a new song with an uploaded recording', async () => {
    const user = userEvent.setup();
    await enterDemo(user, '/songs');
    await screen.findByText('6 Songs');
    await user.click(screen.getByRole('button', { name: 'Neuer Song' }));
    const input = document.querySelector<HTMLInputElement>('input[type="file"]')!;
    await user.upload(input, wav('07_Neuer_Hit.wav'));
    expect(await screen.findByDisplayValue('Neuer Hit')).toBeInTheDocument();
    expect(screen.getByText('Band-App Uploads')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Song anlegen' }));
    expect(await screen.findByRole('heading', { level: 1, name: 'Neuer Hit' })).toBeInTheDocument();
    await user.click(screen.getByRole('tab', { name: /Versionen/ }));
    expect(await screen.findByText(/Band-App Uploads/)).toBeInTheDocument();
    await user.click(screen.getByRole('link', { name: 'Songs' }));
    expect(await screen.findByText('7 Songs')).toBeInTheDocument();
  });

  it('shows the folder view with compact paths and steps into folders', async () => {
    const user = userEvent.setup();
    await enterDemo(user, '/songs');
    await screen.findByText('6 Songs');
    await user.click(screen.getByRole('radio', { name: 'Ordner' }));
    const folder = await screen.findByRole('button', { name: /Live \/ 2025 Stadtfest/ });
    await user.click(folder);
    expect(await screen.findByRole('link', { name: /Midnight Engine \(Live\)/ })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Alle Ordner' }));
    expect(await screen.findByRole('button', { name: /Proben \/ 2026-09-17/ })).toBeInTheDocument();
  });
});
