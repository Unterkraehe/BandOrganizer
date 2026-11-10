/** Feature registration (songsFeature): song list, song screen (song + player), edit, merge, new song, tag settings. */
import { Music } from 'lucide-react';
import { createElement } from 'react';
import type { FeatureRegistration } from '@/core/features/registry';
import { MergePage } from './MergePage';
import { SongEditPage } from './SongEditPage';
import { TagsSettingsPage } from './TagsSettingsPage';
import { LyricsEditorPage } from './lyrics/LyricsEditorPage';
import { NewSongPage } from './uploads/NewSongPage';
import { PlayerRedirect, PracticeRedirect, SongScreen } from './player/SongScreen';
import { SongsPage } from './SongsPage';

export const songsFeature: FeatureRegistration = {
  id: 'songs',
  labelKey: 'nav.songs',
  icon: Music,
  path: '/songs',
  order: 2,
  placement: 'bottomBar',
  element: createElement(SongsPage),
  routes: [
    { path: '/songs/new', element: createElement(NewSongPage) },
    // the one screen of a song: song page and player in one (v1.1.0)
    { path: '/songs/:songId', element: createElement(SongScreen) },
    { path: '/songs/:songId/lyrics', element: createElement(LyricsEditorPage) },
    // old addresses: the practice view (before v0.16.0) and the separate player (before v1.1.0)
    { path: '/songs/:songId/practice', element: createElement(PracticeRedirect) },
    { path: '/player', element: createElement(PlayerRedirect) },
    { path: '/songs/:songId/edit', element: createElement(SongEditPage) },
    { path: '/songs/:songId/merge', element: createElement(MergePage) },
    { path: '/settings/tags', element: createElement(TagsSettingsPage) },
  ],
};
