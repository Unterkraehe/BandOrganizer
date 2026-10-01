# Device test checklist

> Things automated tests and the demo mode cannot prove: real HiDrive, real phones, real band use. Tick them off in the band test phase
> (`03-roadmap.md` M9); put findings into the roadmap or a GitHub issue. Spike names (S1–S6) are explained in `00-overview.md` §12.

## A. Real HiDrive (one person, any device)

- [ ] **Updates stick:** change a setlist twice, a song's key twice, your answer to an event, edit a chat message – each change is still there after a reload (v0.9.1 fix: `PUT /file` by `dir` + `name`).
- [ ] **S1/S2 – file IDs:** rename or move a song file in the HiDrive web interface, tap "Neu suchen" → the song and its notes are still together (F4 §6.1).
- [ ] **Conflicts:** open the same song on two devices, change the key on both, save one after the other → the second shows who changed it (F4 §4.4).
- [ ] **S6 – large uploads:** upload a WAV > 50 MB, ideally over mobile data; interrupt the connection once → retries / "Erneut versuchen" work (F10 §5.6).
- [ ] **Copy:** "In die Songliste übernehmen" on a suggestion → the copy is in the chosen folder, the original is still in "Vorschläge" (`POST /file/copy`, F4).
- [ ] **S4 – calendar subscription:** create the link (Kalender → ⋯ → Kalender abonnieren), open it once in a browser: text starting with `BEGIN:VCALENDAR` or a `band.ics` download = works; a HiDrive page = needs the token-helper fallback (F5 §6.5b). Then subscribe on a phone; change an event → it shows up after the calendar app refreshes.
- [ ] **S5 – .ics export:** "Zum Kalender hinzufügen" on an event on iPhone and Android → arrives in the calendar with the right time.

## B. Phones

- [ ] **iPhone, tempo/pitch:** play a song at 80 % and −2 semitones: clean sound, keeps playing with the screen locked, A–B loop jumps back cleanly, "Original" without a gap (F9).
- [ ] **Chat with keyboard (iPhone and Android):** the input sits right above the keyboard and returns to its place after closing it (R-UI-12).
- [ ] **Touch:** pinch zoom does nothing in the installed app; swiping switches between Start/Songs/Kalender/Chat/Mehr without being triggered by accident; **Back** after swiping goes through the screens instead of closing the app.
- [ ] **Songs tab with ~300 songs**, also while music plays: opens at once, scrolling is smooth (R-UI-13).
- [ ] **Push notifications:** set up the token helper (`token-helper/README.md`, push section); turn them on (Einstellungen → Benachrichtigungen) → "Test-Benachrichtigung senden" arrives; a chat message from a second phone arrives; a cancelled event arrives; tapping opens the message. iPhone: iOS 16.4+, app installed on the home screen.
- [ ] **Event reminders:** token helper with KV + Cron Trigger (`token-helper/README.md`, reminders section). Set "15 Min." under "Meine Erinnerung" on an event starting in ~25 minutes, wait a few seconds in the app, close it → the reminder arrives (at most 5 minutes late), tapping opens the event. Then: answer "Nein" or cancel the event → no reminder. Check the entry `schedule` in KV holds only the next 8 weeks.
- [ ] **Back after a long time:** leave the app in the background for an hour (or overnight), open it → new chat messages / events appear without a manual reload.

## C. Band test phase (1–2 weeks, decides 1.0.0)

1. Everyone installs the app, creates a profile, switches on the calendar subscription and notifications.
2. Enter the next rehearsals and the next gig; everybody answers.
3. Build the gig's setlist, print it (compare with the paper sheet), use the stage view on stage.
4. Practice with the app: lyrics, tempo/pitch, loops.
5. Use the chat for band matters instead of WhatsApp.
6. Collect everything odd – bugs and "that's awkward" – with: what you did, what you expected, what happened, device + OS version, screenshot.

Done when the band gets through a full rehearsal-and-gig cycle without falling back to the old way.
