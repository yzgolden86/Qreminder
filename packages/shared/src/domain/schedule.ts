export interface LocalScheduleOccurrence {
  scheduledLocalDate: string;
  scheduledLocalTime: string;
  timeZone: string;
  scheduledInstantUtc: string;
}

export interface LocalScheduleDecision extends LocalScheduleOccurrence {
  due: boolean;
  reason: string;
}

const localTimeRegex = /^\d{2}:\d{2}$/;

export function isValidLocalTime(value: string): boolean {
  if (!localTimeRegex.test(value)) return false;
  const parts = value.split(":");
  const h = Number(parts[0]);
  const m = Number(parts[1]);
  return h >= 0 && h <= 23 && m >= 0 && m <= 59;
}

export function isValidDateOnly(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parts = value.split("-");
  const y = Number(parts[0]);
  const mo = Number(parts[1]);
  const d = Number(parts[2]);
  const dt = new Date(Date.UTC(y, mo - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === mo - 1 && dt.getUTCDate() === d;
}

export function todayDateOnly(now: Date, timezone: string): string {
  return formatLocalDate(now, timezone);
}

export function addDateOnly(date: string, days: number): string {
  const parts = date.split("-");
  const y = Number(parts[0]);
  const m = Number(parts[1]);
  const d = Number(parts[2]);
  const next = new Date(Date.UTC(y, m - 1, d + days));
  return next.toISOString().slice(0, 10);
}

function formatLocalDate(now: Date, timezone: string): string {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: safeTimezone(timezone),
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  return fmt.format(now);
}

function safeTimezone(tz: string): string {
  try {
    new Intl.DateTimeFormat("en-CA", { timeZone: tz });
    return tz;
  } catch {
    return "UTC";
  }
}

export function getScheduleInstant(localDate: string, localTime: string, timezone: string): Date {
  const tz = safeTimezone(timezone);
  if (!isValidDateOnly(localDate) || !isValidLocalTime(localTime)) {
    return new Date(NaN);
  }
  const timeParts = localTime.split(":");
  const h = Number(timeParts[0]);
  const m = Number(timeParts[1]);
  const utcGuess = Date.UTC(
    Number(localDate.slice(0, 4)),
    Number(localDate.slice(5, 7)) - 1,
    Number(localDate.slice(8, 10)),
    h,
    m,
  );
  const offsetMs = tzOffsetMs(new Date(utcGuess), tz);
  return new Date(utcGuess - offsetMs);
}

function tzOffsetMs(at: Date, timezone: string): number {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const parts = fmt.formatToParts(at).reduce<Record<string, string>>((acc, part) => {
    if (part.type !== "literal") acc[part.type] = part.value;
    return acc;
  }, {});
  const asUtc = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour),
    Number(parts.minute),
    Number(parts.second),
  );
  return asUtc - at.getTime();
}

export function buildScheduleDecision(
  now: Date,
  localDate: string,
  localTime: string,
  timezone: string,
  windowMinutes: number,
): LocalScheduleDecision {
  const instant = getScheduleInstant(localDate, localTime, timezone);
  if (Number.isNaN(instant.getTime())) {
    return {
      scheduledLocalDate: localDate,
      scheduledLocalTime: localTime,
      timeZone: timezone,
      scheduledInstantUtc: "",
      due: false,
      reason: "invalid_schedule",
    };
  }
  const deltaMinutes = Math.floor((now.getTime() - instant.getTime()) / 60_000);
  const due = deltaMinutes >= 0 && deltaMinutes <= Math.max(windowMinutes, 0);
  const reason = deltaMinutes < 0
    ? "before_scheduled_time"
    : `not_in_time_window(delta=${deltaMinutes}m)`;
  return {
    scheduledLocalDate: localDate,
    scheduledLocalTime: localTime,
    timeZone: timezone,
    scheduledInstantUtc: instant.toISOString(),
    due,
    reason: due ? "due" : reason,
  };
}

export function getLocalScheduleDecision(
  now: Date,
  timezone: string,
  localTime: string,
  windowMinutes: number,
  force: boolean,
): LocalScheduleDecision {
  const tz = safeTimezone(timezone);
  const time = isValidLocalTime(localTime) ? localTime : "08:00";
  const today = todayDateOnly(now, tz);
  if (force) {
    const instant = getScheduleInstant(today, time, tz);
    return {
      scheduledLocalDate: today,
      scheduledLocalTime: time,
      timeZone: tz,
      scheduledInstantUtc: Number.isNaN(instant.getTime()) ? "" : instant.toISOString(),
      due: true,
      reason: "force",
    };
  }
  const todayDecision = buildScheduleDecision(now, today, time, tz, windowMinutes);
  if (todayDecision.due) return todayDecision;
  const yesterday = addDateOnly(today, -1);
  const yesterdayDecision = buildScheduleDecision(now, yesterday, time, tz, windowMinutes);
  if (yesterdayDecision.due) return yesterdayDecision;
  return todayDecision;
}

export function getNextLocalScheduleOccurrence(
  now: Date,
  timezone: string,
  localTime: string,
): LocalScheduleOccurrence {
  const tz = safeTimezone(timezone);
  const time = isValidLocalTime(localTime) ? localTime : "08:00";
  const today = todayDateOnly(now, tz);
  const todayInstant = getScheduleInstant(today, time, tz);
  const date = todayInstant.getTime() < now.getTime() ? addDateOnly(today, 1) : today;
  const instant = getScheduleInstant(date, time, tz);
  return {
    scheduledLocalDate: date,
    scheduledLocalTime: time,
    timeZone: tz,
    scheduledInstantUtc: instant.toISOString(),
  };
}
