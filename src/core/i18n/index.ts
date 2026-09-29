import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import auth from '@/locales/de/auth.json';
import calendar from '@/locales/de/calendar.json';
import chat from '@/locales/de/chat.json';
import band from '@/locales/de/band.json';
import common from '@/locales/de/common.json';
import members from '@/locales/de/members.json';
import profile from '@/locales/de/profile.json';
import pwa from '@/locales/de/pwa.json';
import search from '@/locales/de/search.json';
import settings from '@/locales/de/settings.json';
import setlists from '@/locales/de/setlists.json';
import songs from '@/locales/de/songs.json';
import start from '@/locales/de/start.json';
import uploads from '@/locales/de/uploads.json';
import whatsNew from '@/locales/de/whatsNew.json';

/**
 * i18n setup (R-I18N-01/02). German only for now; another language = another folder in
 * src/locales/<lang>/ with the same namespaces, registered here.
 */
export const resources = {
  de: { auth, band, calendar, chat, common, members, profile, pwa, search, settings, setlists, songs, start, uploads, whatsNew },
} as const;

export const defaultNS = 'common';
export const LOCALE = 'de-DE';
export const TIME_ZONE = 'Europe/Berlin';

void i18n.use(initReactI18next).init({
  resources,
  lng: 'de',
  fallbackLng: 'de',
  defaultNS,
  ns: Object.keys(resources.de),
  interpolation: { escapeValue: false },
  returnNull: false,
  showSupportNotice: false,
});

export default i18n;
