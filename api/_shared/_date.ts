type Preset =
  | "this_week"
  | "this_month"
  | "this_quarter"
  | "this_year"
  | "last_year"
  | "all_time"
  | "custom";

const getTzOffsetMinutes = (date: Date, timeZone: string): number => {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone,
    timeZoneName: "shortOffset",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  });
  const parts = formatter.formatToParts(date);
  const tzPart = parts.find((part) => part.type === "timeZoneName")?.value ?? "GMT";
  const match = tzPart.match(/GMT([+-]\d{1,2})(?::(\d{2}))?/);
  if (!match) {
    return 0;
  }
  const hours = Number(match[1] ?? 0);
  const minutes = Number(match[2] ?? 0);
  return hours * 60 + (hours >= 0 ? minutes : -minutes);
};

const getZonedParts = (date: Date, timeZone: string) => {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "short"
  });
  const parts = formatter.formatToParts(date);
  const get = (type: string) => parts.find((part) => part.type === type)?.value;
  return {
    year: Number(get("year")),
    month: Number(get("month")),
    day: Number(get("day")),
    weekday: get("weekday") ?? "Mon"
  };
};

const zonedDateToUtc = (
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  second: number,
  timeZone: string
) => {
  const utcGuess = new Date(Date.UTC(year, month - 1, day, hour, minute, second));
  const offsetMinutes = getTzOffsetMinutes(utcGuess, timeZone);
  return new Date(utcGuess.getTime() - offsetMinutes * 60000);
};

const weekdayIndex = (weekday: string): number => {
  const map: Record<string, number> = {
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
    Sun: 7
  };
  return map[weekday] ?? 1;
};

const addDays = (year: number, month: number, day: number, delta: number) => {
  const date = new Date(Date.UTC(year, month - 1, day + delta));
  return {
    year: date.getUTCFullYear(),
    month: date.getUTCMonth() + 1,
    day: date.getUTCDate()
  };
};

const resolveDateRange = (
  preset: Preset,
  from: string | undefined,
  to: string | undefined,
  timeZone: string
) => {
  const tz = timeZone || "UTC";
  const now = new Date();
  if (preset === "all_time") {
    return { from: new Date(0).toISOString(), to: now.toISOString() };
  }
  if (preset === "custom") {
    if (!from || !to) {
      throw new Error("Missing from/to for custom range.");
    }
    const fromDate = new Date(from);
    const toDate = new Date(to);
    if (Number.isNaN(fromDate.getTime()) || Number.isNaN(toDate.getTime())) {
      throw new Error("Invalid from/to date.");
    }
    return { from: fromDate.toISOString(), to: toDate.toISOString() };
  }

  const parts = getZonedParts(now, tz);
  let startYear = parts.year;
  let startMonth = parts.month;
  let startDay = parts.day;

  if (preset === "this_week") {
    const dayIndex = weekdayIndex(parts.weekday);
    const start = addDays(parts.year, parts.month, parts.day, -(dayIndex - 1));
    startYear = start.year;
    startMonth = start.month;
    startDay = start.day;
  } else if (preset === "this_month") {
    startDay = 1;
  } else if (preset === "this_quarter") {
    startMonth = Math.floor((parts.month - 1) / 3) * 3 + 1;
    startDay = 1;
  } else if (preset === "this_year") {
    startMonth = 1;
    startDay = 1;
  } else if (preset === "last_year") {
    startYear = parts.year - 1;
    startMonth = 1;
    startDay = 1;
  }

  const fromDate = zonedDateToUtc(startYear, startMonth, startDay, 0, 0, 0, tz);
  const toDate =
    preset === "last_year"
      ? zonedDateToUtc(parts.year, 1, 1, 0, 0, 0, tz)
      : now;

  return { from: fromDate.toISOString(), to: toDate.toISOString() };
};

export { resolveDateRange };
