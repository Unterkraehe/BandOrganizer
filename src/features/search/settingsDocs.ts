import type { TFunction } from 'i18next';
import type { SearchDoc } from './engine';

/** Navigation & settings with synonyms (F8 §4): "Dunkelmodus" finds the appearance settings. */
export function settingsDocs(t: TFunction): SearchDoc[] {
  const entries: [string, string, string][] = [
    ['settings', '/settings', ''],
    ['profile', '/profile', 'Name Farbe Instrument Rolle Profil wechseln abmelden'],
    ['band', '/settings/band', 'Bandname Logo Bandfarbe Farbe Design Upload Ordner Standard-Ordner'],
    ['appearance', '/settings', 'Darstellung Dunkelmodus dunkel dark Nachtmodus hell light Theme Design Textgröße Schriftgröße Schrift groß größer Zoom'],
    ['hidrive', '/settings', 'HiDrive Verbindung Konto trennen Songs finden Ordner ausschließen Scan'],
    ['tags', '/settings/tags', 'Tags verwalten Schlagworte'],
    ['members', '/members', 'Mitglieder Band Leute'],
    ['songs', '/songs', 'Songliste Repertoire'],
    ['calendar', '/calendar', 'Termine Kalender Proben Auftritte Abwesenheit'],
    ['subscription', '/calendar/subscribe', 'Kalender abonnieren Abo Handy-Kalender iCal ics Google Outlook synchronisieren'],
    ['setlists', '/setlists', 'Setlists Setliste'],
    ['chat', '/chat', 'Chat Nachrichten'],
    ['notifications', '/settings', 'Benachrichtigungen Push Mitteilungen Hinweise Handy Ton'],
    ['about', '/settings', 'Über die App Version Neuigkeiten'],
  ];
  return entries.map(([key, route, synonyms]) => ({
    id: `setting:${key}`,
    type: 'setting',
    title: t(`search:settings.${key}`),
    text: '',
    extra: synonyms,
    context: t('search:groups.settings'),
    route,
  }));
}
