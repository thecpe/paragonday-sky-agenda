# Paragonday — Sky Agenda

Interactive prototype of Concept 02: a calendar day view where the ruler is solar (Horizon Time / LHST), the background is the actual sky, and events can be anchored in tilset/pastrise so they ride the sun across seasons.

Open `index.html` through a local web server or visit the live page:
https://yatu.xyz/paragonday-sky-agenda/

Solar math: NOAA solar position algorithm (USNO −0.8333° convention), computed
client-side. The runtime remains a single HTML file and loads Google Identity
Services only when Google sign-in is used.

## Live Google Calendar

The Google Identity Services token flow keeps the access token in memory. Once
signed in, the app loads events from the selected Google calendars for the
visible day, week, month, or year. Confirmed natural-language drafts are inserted
into the primary calendar, with Paragonday solar-anchor data in private extended
properties.

One-time Google Cloud setup:

1. Enable the Google Calendar API for a Google Cloud project.
2. Configure the OAuth consent screen and add the Calendar events and calendar
   list read-only scopes.
3. Create an OAuth client ID for a Web application.
4. Add `https://yatu.xyz` as an Authorized JavaScript origin. Add
   `http://localhost:<port>` separately for local development.
5. In the app, open **Google Calendar → OAuth setup** and paste the client ID.
   A client ID is public configuration, not a client secret; the browser stores
   it in localStorage.

Google references:
[token-model OAuth](https://developers.google.com/identity/oauth2/web/guides/use-token-model),
[event listing](https://developers.google.com/workspace/calendar/api/v3/reference/events/list),
[event insertion](https://developers.google.com/workspace/calendar/api/v3/reference/events/insert),
[extended properties](https://developers.google.com/workspace/calendar/api/guides/extended-properties).

## Natural-language scheduling

The deterministic browser-side parser supports civil dates and times plus
Paragonday expressions such as:

- `dinner with sam@example.com tomorrow 30 min before tilset`
- `run friday at pastrise +0:30 for 45 min`
- `call Mom next Tuesday at 7pm`

Every parse produces a preview card; no event is written until the user
confirms. Bare guest names remain visible in the preview but only email
addresses are sent to Google Calendar.

Run the parser and Google event-shape tests with:

```sh
node --test tests/parser.test.mjs
```
