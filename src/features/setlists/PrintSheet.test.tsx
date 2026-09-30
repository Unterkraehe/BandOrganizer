import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import '@/core/i18n';
import type { Song } from '@/features/songs/model';
import type { Setlist } from './model';
import { PrintSheet } from './PrintSheet';

const song = (id: string, title: string, artist: string | null) => ({ id, title, artist }) as unknown as Song;

describe('printed setlist in the band layout (v0.12.1)', () => {
  const setlist = {
    id: 's1',
    name: 'Beimerstetten',
    blocks: [
      {
        id: 'b1',
        name: 'Block 1',
        pauseAfterMin: 20,
        pauseNote: 'Pausenmusik!!!',
        entries: [
          { id: 'x1', type: 'song', songId: 'a', note: null, segueToNext: true },
          { id: 'x2', type: 'song', songId: 'b', note: 'KISS_Video', segueToNext: false },
          { id: 'x3', type: 'interlude', text: 'Begrüßung', durationMin: null, note: 'Overload_Logo' },
          { id: 'x4', type: 'song', songId: 'c', note: null, segueToNext: false },
        ],
      },
      { id: 'b2', name: 'Zugabe ???', pauseAfterMin: null, entries: [{ id: 'x5', type: 'song', songId: 'a', note: null, segueToNext: false }] },
    ],
  } as unknown as Setlist;
  const songs = new Map([
    ['a', song('a', 'Breaking the law', 'Accept')],
    ['b', song('b', 'Lick it up', 'Kiss')],
    ['c', song('c', 'Shine', null)],
  ]);

  it('shows blocks, numbers, artists, info, announcements, DIREKT and the pause box', () => {
    render(<PrintSheet setlist={setlist} songById={songs} personal={{ x2: 'Solo länger' }} showPersonal showArtists subtitle="Beimerstetten - Stand: 17.05.26" />);
    expect(screen.getAllByText('Beimerstetten - Stand: 17.05.26')).toHaveLength(2);
    const [block1] = screen.getAllByRole('table');
    const rows = within(block1!).getAllByRole('row');
    expect(rows[2]).toHaveTextContent('1Breaking the lawDIREKTAccept');
    expect(rows[3]).toHaveTextContent('2Lick it upKissKISS_Video · Solo länger');
    expect(rows[4]).toHaveTextContent('--- Begrüßung ---Overload_Logo');
    expect(rows[5]).toHaveTextContent('3Shine');
    expect(screen.getByText('Pausenmusik!!!')).toBeInTheDocument();
    expect(screen.getByText('Zugabe ???')).toBeInTheDocument();
    // no pause box after the last block, numbering continues across blocks
    expect(within(screen.getAllByRole('table')[1]!).getByText('4')).toBeInTheDocument();
  });

  it('can hide the artist column and personal notes', () => {
    render(<PrintSheet setlist={setlist} songById={songs} personal={{ x2: 'Solo länger' }} showPersonal={false} showArtists={false} subtitle="x" />);
    expect(screen.queryByText('Interpret:')).not.toBeInTheDocument();
    expect(screen.queryByText(/Solo länger/)).not.toBeInTheDocument();
  });
});
