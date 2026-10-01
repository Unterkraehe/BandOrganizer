/** Feature registration (songsFeature): song list, detail, edit, player, merge, new song, tag settings. */
import { Music } from 'lucide-react';
import { createElement } from 'react';
import type { FeatureRegistration } from '@/core/features/registry';
import { MergePage } from './MergePage';
import { SongDetailPage } from './SongDetailPage';
import { SongEditPage } from './SongEditPage';
import { TagsSettingsPage } from './TagsSettingsPage';
import { LyricsEditorPage } from './lyrics/LyricsEditorPage';
import { NewSongPage } from './uploads/NewSongPage';
import { PlayerPage, PracticeRedirect } from './player/PlayerPage';
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
    { path: '/songs/:songId', element: createElement(SongDetailPage) },
    { path: '/songs/:songId/lyrics', element: createElement(LyricsEditorPage) },
    // before v0.16.0 the practice view – now the player's "Üben" tab
    { path: '/songs/:songId/practice', element: createElement(PracticeRedirect) },
    { path: '/player', element: createElement(PlayerPage) },
    { path: '/songs/:songId/edit', element: createElement(SongEditPage) },
    { path: '/songs/:songId/merge', element: createElement(MergePage) },
    { path: '/settings/tags', element: createElement(TagsSettingsPage) },
  ],
};
