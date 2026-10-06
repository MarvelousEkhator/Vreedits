// lib/screenTime.js

// Works out the person's local date and minute of the day from the server
// clock plus their time zone offset (from the browser's getTimezoneOffset()).
export function localTime(tzRaw) {
  let tz = Number(tzRaw);
  if (!Number.isFinite(tz) || tz < -840 || tz > 840) tz = 0;
  const local = new Date(Date.now() - Math.round(tz) * 60000);
  return {
    day: local.toISOString().slice(0, 10),
    minute: local.getUTCHours() * 60 + local.getUTCMinutes(),
  };
}

// Quiet hours can cross midnight (for example 22:00 to 07:00).
export function inQuietWindow(start, end, minute) {
  if (!Number.isInteger(start) || !Number.isInteger(end) || start === end) return false;
  return start < end ? minute >= start && minute < end : minute >= start || minute < end;
}

export function buildStatus(settings, row, local) {
  const usedSeconds = row?.secondsUsed || 0;
  const bonusMinutes = row?.bonusMinutes || 0;
  const limit = settings.dailyLimitMinutes || null;
  const allowedSeconds = limit ? (limit + bonusMinutes) * 60 : null;
  const remainingSeconds = allowedSeconds === null ? null : Math.max(0, allowedSeconds - usedSeconds);
  const quiet =
    !!settings.quietEnabled && inQuietWindow(settings.quietStart, settings.quietEnd, local.minute);

  let blocked = null;
  if (quiet) blocked = "quiet";
  else if (remainingSeconds === 0) blocked = "limit";

  return {
    day: local.day,
    blocked,
    limitMinutes: limit,
    usedSeconds,
    bonusMinutes,
    remainingSeconds,
    quietEnd: settings.quietEnd,
    breakEveryMinutes: settings.breakEveryMinutes || null,
    hasPin: !!settings.guardianPinHash,
  };
}