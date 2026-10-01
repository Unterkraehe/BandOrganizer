# Device test checklist

> Things automated tests and the demo mode cannot prove: real HiDrive, real phones, real band use. Tick them off in the band test phase
> (`03-roadmap.md` M9); put findings into the roadmap or a GitHub issue. Spike names (S1–S6) are explained in `00-overview.md` §12.

## A. Real HiDrive (one person, any device)

- [ ] **Updates stick:** change a setlist twice, a song's key twice, your answer to an event, edit a chat message – each change is still there after a reload (v0.9.1 fix: `PUT /file` by `dir` + `name`).
- [ ] **S1/S2 – file IDs:** rename or move a song file in the HiDrive web interface, tap "Neu suchen" → the song and its notes are still together (F4 §6.1).
- [ ] **Conflicts:** open the same song on two devices, change the key on both, save one after the other → the second shows who changed it (F4 §4.4).
- [ ] **S6 – large uploads:** upload a WAV > 50 MB, ideally over mobile data; interrupt the connection once → retries / "Erneut versuchen" work (F10 §5.6).
- [ ] **Copy:** "In die Songliste übernehmen" on a suggestion → the copy is in the chosen folder, the original is still in "Vorschläge" (`POST /file/copy`, F4).
- [ ] **Calendar subscription (v0.19.1, via the token helper):** deploy the new `worker.js` (KV `REMINDERS` bound). Kalender → ⋯ → Kalender abonnieren → "Abo-Link erstellen" (an old HiDrive link shows the "funktioniert nicht mehr" notice). Open the link in a browser: a `.ics` download or text starting with `BEGIN:VCALENDAR`. Subscribe in Google Calendar (calendar.google.com → Weitere Kalender → + → Per URL) and on an iPhone; the events appear (Google: minutes to hours). Change an event → it shows up after the calendar app refreshes. ~~S4: HiDrive share link~~ – answered: unsuitable (expires, download limit).
- [ ] **S5 – .ics export:** "Zum Kalender hinzufügen" on an event on iPhone and Android → arrives in the calendar with the right time.

## B. Phones

- [ ] **iPhone, tempo/pitch:** play a song at 80 % and −2 semitones: clean sound, keeps playing with the screen locked, A–B loop jumps back cleanly, "Original" without a gap (F9).
- [ ] **Chat with keyboard (iPhone and Android):** the input sits right above the keyboard and returns to its place after closing it (R-UI-12).
- [ ] **Touch:** pinch zoom does nothing in the installed app; swiping switches between Start/Songs/Kalender/Chat/Mehr without being triggered by accident; **Back** after swiping goes through the screens instead of closing the app.
- [ ] **Songs tab with ~300 songs**, also while music plays: opens at once, scrolling is smooth (R-UI-13).
- [ ] **Push notifications:** set up the token helper (`token-helper/README.md`, push section); turn them on (Einstellungen → Benachrichtigungen) → "Test-Benachrichtigung senden" arrives; a chat message from a second phone arrives; a cancelled event arrives; tapping opens the message. iPhone: iOS 16.4+, app installed on the home screen.
- [ ] **Event reminders:** token helper with KV + Cron Trigger (`token-helper/README.md`, reminders section). Set "15 Min." under "Meine Erinnerung" on an event starting in ~25 minutes, wait a few seconds in the app, close it → the reminder arrives (at most 5 minutes late), tapping opens the event. Then: answer "Nein" or cancel the event → no reminder. Check the entry `schedule` in KV holds only the next 8 weeks.
- [ ] **"Aktualisieren":** after a deploy, the toast appears; tapping shows "Wird aktualisiert …" and the app reloads within a few seconds with the new version ("Was ist neu" shows it). Also with the app open twice (installed app + browser tab): tap in one, then in the other → it still reloads.
- [ ] **New events reach everyone:** two phones with the app open, one on the calendar; the other enters a rehearsal → it appears within ~20 s (calendar screen) / ~60 s (elsewhere), a chat line "… eingetragen" appears, and phones with the app closed get a notification "Neuer Termin".
- [ ] **Month view on the phone:** Kalender → Monat → tap a day with an event → a panel from the bottom shows it (answer buttons work, tapping the card opens the event); an empty day says "Keine Termine an diesem Tag."; a day with many events scrolls inside the panel.
- [ ] **← back and motion (v0.15.0):** every sub-screen has ← top left; open a song from the list → it slides in from the right, ← → the list slides in from the left at the old scroll position; open an event from a notification → ← leads to the calendar (not out of the app); tabs fade. iPhone and Android, also with "Bewegung reduzieren" (no animation).
- [ ] **Player (v0.16.0):** play a song, tap the mini player → the player grows out of it; Songtext / Üben / (Setlist) tabs; ⌄ and the back gesture close it and you are where you were; lock screen keeps playing; screen stays on while the player is open. "Setlist abspielen" on an event → plays, Setlist tab open, ⏭ moves on; the Songs tab still shows the normal list.
- [ ] **Song page (v0.17.0):** long titles wrap and are fully readable; "Abspielen" toggles, the mini player appears; "Üben" opens the player on Üben; all four tabs readable on the smallest phone in the band.
- [ ] **Setlists (v0.18.0):** on an event: "Neue Setlist für diesen Termin" → add songs → Speichern → the setlist page; ← → the event; tap the setlist card → the same page; "Setlist bearbeiten" → Abbrechen → the event.
- [ ] **Event page (v0.18.1):** answer with one tap; "Kommentar hinzufügen" opens the field; ⋯ → Absagen / Löschen; "Meine Erinnerung · Ändern" opens the choices.
- [ ] **Voice notes (v0.19.0):** record a voice note on an iPhone and on an Android phone (the microphone prompt appears once), listen before saving, save; the other phone plays both (MP4/AAC from both – if an Android phone records WebM, note the browser version: older iPhones can't play it). A song that plays pauses while recording and while a voice note plays. Denying the microphone shows the explanation.
- [ ] **Back after a long time:** leave the app in the background for an hour (or overnight), open it → new chat messages / events appear without a manual reload.

## C. Band test phase (1–2 weeks, decides 1.0.0)

1. Everyone installs the app, creates a profile, switches on the calendar subscription and notifications.
2. Enter the next rehearsals and the next gig; everybody answers.
3. Build the gig's setlist, print it (compare with the paper sheet), use the stage view on stage.
4. Practice with the app: lyrics, tempo/pitch, loops.
5. Use the chat for band matters instead of WhatsApp.
6. Collect everything odd – bugs and "that's awkward" – with: what you did, what you expected, what happened, device + OS version, screenshot.

Done when the band gets through a full rehearsal-and-gig cycle without falling back to the old way.
