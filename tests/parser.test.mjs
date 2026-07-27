import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const start = html.indexOf('/* ================= natural-language scheduling ================= */');
const end = html.indexOf('/* ================= live Google Calendar ================= */');
assert.ok(start >= 0 && end > start, 'natural-language implementation is present');

const shiftISO = (dateISO, days) => {
  const [year, month, day] = dateISO.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day + days)).toISOString().slice(0, 10);
};
const weekdayOf = dateISO => new Date(`${dateISO}T12:00:00Z`).getUTCDay();
const context = vm.createContext({
  shiftISO,
  weekdayOf,
  hhmm(hours) {
    const minutes = Math.round(Math.abs(hours) * 60);
    return `${Math.floor(minutes / 60)}:${String(minutes % 60).padStart(2, '0')}`;
  },
  zonedMs(dateISO, hour, minute) {
    return Date.parse(`${dateISO}T${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:00Z`);
  },
  sunFor(dateISO) {
    const day = Date.parse(`${dateISO}T00:00:00Z`);
    return { rise: day + 6 * 3600000, set: day + 18 * 3600000, polar: null };
  },
  localHour(ms) {
    const date = new Date(ms);
    return date.getUTCHours() + date.getUTCMinutes() / 60;
  },
  localISO(ms) {
    return new Date(ms).toISOString().slice(0, 10);
  },
  htLabel(hour) {
    return [`solar-${hour}`];
  },
});
vm.runInContext(html.slice(start, end), context);
const googleStart = end;
const googleEnd = html.indexOf('/* ================= view plumbing ================= */');
assert.ok(googleEnd > googleStart, 'Google Calendar implementation is present');
vm.runInContext(html.slice(googleStart, googleEnd), context);

const parse = (input, referenceDate = '2026-07-26') =>
  JSON.parse(JSON.stringify(context.parseSchedule(input, referenceDate, ['Tokyo', 'Home'])));

test('parses a sunset-relative dinner with a named guest', () => {
  const draft = parse('dinner with Sam tomorrow 30 min before tilset');
  assert.equal(draft.title, 'dinner');
  assert.equal(draft.date, '2026-07-27');
  assert.deepEqual(draft.anchor, { type: 'tilset', offsetMinutes: -30 });
  assert.equal(draft.duration, 'PT1H');
  assert.deepEqual(draft.attendees, ['Sam']);
});

test('parses a sunrise-relative run and duration', () => {
  const draft = parse('run at pastrise +0:15 next tuesday for 45 min');
  assert.equal(draft.title, 'run');
  assert.equal(draft.date, '2026-07-28');
  assert.deepEqual(draft.anchor, { type: 'pastrise', offsetMinutes: 15 });
  assert.equal(draft.duration, 'PT45M');
});

test('parses a normal clock event without losing title words', () => {
  const draft = parse('call mom 7pm');
  assert.equal(draft.title, 'call mom');
  assert.equal(draft.date, '2026-07-26');
  assert.deepEqual(draft.anchor, { type: 'clock', time: '19:00' });
});

test('accepts a compact trailing duration without confusing solar offsets', () => {
  const draft = parse('call mom tomorrow at 7pm 2h');
  assert.equal(draft.title, 'call mom');
  assert.equal(draft.duration, 'PT2H');
  assert.deepEqual(draft.anchor, { type: 'clock', time: '19:00' });
});

test('treats tonight as the reference date and supplies an evening time', () => {
  const draft = parse('read tonight');
  assert.equal(draft.date, '2026-07-26');
  assert.deepEqual(draft.anchor, { type: 'clock', time: '19:00' });
});

test('returns an all-day draft when no time expression is present', () => {
  const draft = parse('renew passport in 3 days');
  assert.equal(draft.title, 'renew passport');
  assert.equal(draft.date, '2026-07-29');
  assert.equal(draft.allDay, true);
  assert.equal(draft.anchor, null);
});

test('extracts email guests and a known parazone', () => {
  const draft = parse('planning with sam@example.com tomorrow at 9am in Tokyo');
  assert.equal(draft.title, 'planning');
  assert.deepEqual(draft.attendees, ['sam@example.com']);
  assert.equal(draft.location, 'Tokyo');
  assert.deepEqual(draft.anchor, { type: 'clock', time: '09:00' });
});

test('rolls an unstated-year month/day into the future', () => {
  const draft = parse('launch jan 2 at noon', '2026-07-26');
  assert.equal(draft.date, '2027-01-02');
  assert.deepEqual(draft.anchor, { type: 'clock', time: '12:00' });
});

test('resolves a solar anchor to an instant without network access', () => {
  const draft = context.parseSchedule('dinner tomorrow 30 min before sunset', '2026-07-26', []);
  const resolved = context.resolveDraft(draft, { name: 'Test', tz: 'UTC' });
  assert.equal(new Date(resolved.startMs).toISOString(), '2026-07-27T17:30:00.000Z');
  assert.equal(new Date(resolved.endMs).toISOString(), '2026-07-27T18:30:00.000Z');
});

test('maps timed Google Calendar events into live instances', () => {
  const instances = JSON.parse(JSON.stringify(context.googleEventInstances({
    id: 'event-1',
    summary: 'Design review',
    htmlLink: 'https://calendar.google.com/event?eid=example',
    status: 'confirmed',
    start: { dateTime: '2026-07-27T17:00:00Z' },
    end: { dateTime: '2026-07-27T18:00:00Z' },
  }, {
    summary: 'Work',
    backgroundColor: '#4285f4',
  })));
  assert.deepEqual(instances, [{
    title: 'Design review',
    src: 'google-live',
    googleId: 'event-1',
    htmlLink: 'https://calendar.google.com/event?eid=example',
    calendarName: 'Work',
    calendarColor: '#4285f4',
    status: 'confirmed',
    startMs: Date.parse('2026-07-27T17:00:00Z'),
    endMs: Date.parse('2026-07-27T18:00:00Z'),
  }]);
});

test('expands multi-day all-day Google events using exclusive end dates', () => {
  const instances = JSON.parse(JSON.stringify(context.googleEventInstances({
    id: 'event-2',
    summary: 'Retreat',
    start: { date: '2026-07-27' },
    end: { date: '2026-07-29' },
  }, { summary: 'Team' })));
  assert.deepEqual(instances.map(item => item.dateISO), ['2026-07-27', '2026-07-28']);
  assert.ok(instances.every(item => item.allDay && item.src === 'google-live'));
});

test('writes confirmed solar drafts with invite updates and anchor metadata', async () => {
  let request = null;
  context.LOCS = [{ name: 'Test', lat: 1, lon: 2, tz: 'UTC' }];
  context.state = { loc: 0 };
  context.googleFetch = async (path, options) => {
    request = { path, body: JSON.parse(options.body) };
    return { htmlLink: 'https://calendar.google.com/event?eid=created' };
  };
  context.loadGoogleEvents = async () => {};
  context.setDraftBusy = () => {};
  context.showDraftError = message => { throw new Error(message); };
  context.showDraftSuccess = () => {};
  const draft = context.parseSchedule(
    'dinner with sam@example.com tomorrow 30 min before tilset',
    '2026-07-26',
    [],
  );
  await context.createGoogleEvent(draft);
  assert.match(request.path, /sendUpdates=all$/);
  assert.equal(request.body.summary, 'dinner');
  assert.deepEqual(JSON.parse(JSON.stringify(request.body.attendees)), [{ email: 'sam@example.com' }]);
  assert.equal(request.body.extendedProperties.private.paragondayAnchorType, 'tilset');
  assert.equal(request.body.extendedProperties.private.paragondayAnchorOffsetMinutes, '-30');
  assert.equal(request.body.start.dateTime, '2026-07-27T17:30:00.000Z');
});
