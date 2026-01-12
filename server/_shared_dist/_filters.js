"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.parseFilters = void 0;
const getParam = (value) => {
    if (Array.isArray(value)) {
        return value[0];
    }
    return value;
};
const parseNumber = (value) => {
    if (!value) {
        return undefined;
    }
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
};
const parseTags = (value) => {
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
const parseFilters = (query) => {
    const preset = getParam(query.preset) ?? "this_month";
    const tz = getParam(query.tz) ?? "Europe/Paris";
    const sentimentRaw = getParam(query.sentiment);
    const sentiment = sentimentRaw && sentimentRaw !== "all" ? sentimentRaw : undefined;
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
    };
};
exports.parseFilters = parseFilters;
