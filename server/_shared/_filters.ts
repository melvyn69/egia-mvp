type QueryFilters = {
  location_id?: string;
  preset:
    | "this_week"
    | "this_month"
    | "this_quarter"
    | "last_quarter"
    | "this_year"
    | "last_year"
    | "all_time"
    | "custom";
  from?: string;
  to?: string;
  tz: string;
  source?: string;
  rating_min?: number;
  rating_max?: number;
  sentiment?: string;
  tags?: string[];
  status?: string;
  reject: boolean;
};

const getParam = (
  value: string | string[] | undefined
): string | undefined => {
  if (Array.isArray(value)) {
    return value[0];
  }
  return value;
};

const parseNumber = (value: string | undefined): number | undefined => {
  if (!value) {
    return undefined;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
};

const parseTags = (value: string | undefined): string[] | undefined => {
  if (!value) {
    return undefined;
  }
  if (value === "all") {
    return undefined;
  }
  const list = value
    .split(",")
    .map((tag) => tag.trim().toLowerCase())
    .filter(Boolean);
  return list.length ? list : undefined;
};

const parseFilters = (query: Record<string, string | string[] | undefined>) => {
  const preset =
    (getParam(query.preset) as QueryFilters["preset"]) ?? "this_month";
  const tz = getParam(query.tz) ?? "Europe/Paris";
  const sentimentRaw = getParam(query.sentiment);
  const sentiment =
    sentimentRaw && sentimentRaw !== "all" ? sentimentRaw : undefined;
  const statusRaw = getParam(query.status);
  const status = statusRaw && statusRaw !== "all" ? statusRaw : undefined;
  const tags = parseTags(getParam(query.tags));
  const source = getParam(query.source);
  const reject = Boolean(source && source !== "google");

  return {
    location_id: getParam(query.location_id),
    preset,
    from: getParam(query.from),
    to: getParam(query.to),
    tz,
    source,
    rating_min: parseNumber(getParam(query.rating_min)),
    rating_max: parseNumber(getParam(query.rating_max)),
    sentiment,
    tags,
    status,
    reject
  } satisfies QueryFilters;
};

export { parseFilters };
