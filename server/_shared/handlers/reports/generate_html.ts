import type { VercelRequest, VercelResponse } from "@vercel/node";
import { requireUser } from "../../../_shared_dist/_auth.js";
import { getRequestId, logRequest } from "../../../_shared_dist/api_utils.js";
import { renderPdfFromHtml } from "../../../_shared_dist/pdf_html.js";

type ReportPreset =
  | "last_7_days"
  | "last_30_days"
  | "custom"
  | "this_month"
  | "last_month"
  | "last_year"
  | "this_year"
  | "all_time";

type ReviewRow = {
  id: string;
  rating: number | null;
  comment: string | null;
  create_time: string | null;
  location_id: string | null;
  author_name: string | null;
  reply_text: string | null;
  replied_at: string | null;
  review_ai_insights?:
    | { sentiment?: string | null; sentiment_score?: number | null }
    | Array<{ sentiment?: string | null; sentiment_score?: number | null }>
    | null;
  review_ai_tags?:
    | Array<{ ai_tags?: { tag?: string | null; category?: string | null } | null }>
    | null;
};

const asOne = <T,>(value: T | T[] | null | undefined): T | null =>
  Array.isArray(value) ? value[0] ?? null : value ?? null;

const normalizePreset = (value: unknown): ReportPreset => {
  if (
    value === "last_7_days" ||
    value === "last_30_days" ||
    value === "custom" ||
    value === "this_month" ||
    value === "last_month" ||
    value === "last_year" ||
    value === "this_year" ||
    value === "all_time"
  ) {
    return value;
  }
  return "last_30_days";
};

const getRange = (
  preset: ReportPreset,
  from?: string | null,
  to?: string | null
) => {
  const now = new Date();
  if (preset === "custom" && from && to) {
    return { from: new Date(from), to: new Date(to) };
  }
  if (preset === "last_7_days") {
    const start = new Date(now);
    start.setDate(start.getDate() - 6);
    return { from: start, to: now };
  }
  if (preset === "last_30_days") {
    const start = new Date(now);
    start.setDate(start.getDate() - 29);
    return { from: start, to: now };
  }
  if (preset === "last_month") {
    const start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const end = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999);
    return { from: start, to: end };
  }
  if (preset === "this_month") {
    const start = new Date(now.getFullYear(), now.getMonth(), 1);
    return { from: start, to: now };
  }
  if (preset === "last_year") {
    const start = new Date(now.getFullYear() - 1, 0, 1);
    const end = new Date(now.getFullYear() - 1, 11, 31, 23, 59, 59, 999);
    return { from: start, to: end };
  }
  if (preset === "this_year") {
    const start = new Date(now.getFullYear(), 0, 1);
    return { from: start, to: now };
  }
  if (preset === "all_time") {
    return { from: null, to: null };
  }
  const start = new Date(now);
  start.setDate(start.getDate() - 29);
  return { from: start, to: now };
};

const formatDate = (value: Date | null) =>
  value ? value.toISOString().slice(0, 10) : "—";

const formatRating = (value: number | null) =>
  value === null ? "—" : value.toFixed(1).replace(".", ",");

const formatRatio = (value: number | null) =>
  value === null ? "—" : `${Math.round(value * 100)}%`;

const normalizeLocationTitle = (value: string) =>
  value.replace(/\s*-\s*/g, " - ").replace(/\s{2,}/g, " ").trim();

const escapeHtml = (value: string) =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

const renderStars = (rating: number | null) => {
  const normalized = typeof rating === "number" ? Math.max(0, Math.min(5, rating)) : 0;
  const fullStars = Math.floor(normalized);
  const stars = Array.from({ length: 5 }, (_, index) => {
    const filled = index < fullStars;
    return `
      <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true">
        <path d="M12 2.5l2.9 6.1 6.7.6-5 4.3 1.5 6.6L12 16.8 5.9 20l1.5-6.6-5-4.3 6.7-.6L12 2.5z"
          fill="${filled ? "#1f2937" : "none"}"
          stroke="#1f2937" stroke-width="1"/>
      </svg>
    `;
  });
  return `<div class="stars">${stars.join("")}<span>${formatRating(rating)}</span></div>`;
};

const buildAiSummary = (params: {
  avgRating: number | null;
  responseRate: number | null;
  negativeCount: number;
  untreatedNegativeCount: number;
  reviewsTotal: number;
  topTags: Array<{ tag: string; count: number }>;
  aiCriticalCount: number;
}) => {
  if (params.reviewsTotal === 0) {
    return ["Aucun avis sur la période."];
  }
  const sentences: string[] = [];
  if (params.avgRating !== null) {
    sentences.push(`La note moyenne est ${formatRating(params.avgRating)}.`);
  }
  if (params.responseRate !== null) {
    sentences.push(`Le taux de réponse est de ${formatRatio(params.responseRate)}.`);
  }
  sentences.push(
    `${params.negativeCount} avis négatifs ont été recensés historiquement sur la période.`
  );
  if (params.untreatedNegativeCount > 0) {
    sentences.push(
      `${params.untreatedNegativeCount} avis négatifs nécessitent une réponse ; priorité à leur traitement.`
    );
  } else {
    sentences.push(
      "Aucun avis négatif en attente de réponse : la situation est maîtrisée."
    );
  }
  if (params.topTags.length > 0) {
    const tagList = params.topTags.slice(0, 3).map((tag) => tag.tag).join(", ");
    sentences.push(`Sujets récurrents : ${tagList}.`);
  }
  if (params.aiCriticalCount > 0) {
    sentences.push(
      `${params.aiCriticalCount} avis critiques IA surveillés, sans action obligatoire si déjà répondus.`
    );
  }
  return sentences.slice(0, 5);
};

const buildHtml = (params: {
  title: string;
  subtitle: string;
  locationsLabel: string;
  notes?: string | null;
  kpis: {
    reviewsTotal: number;
    avgRating: number | null;
    responseRate: number | null;
    negativeCount: number;
    untreatedNegativeCount: number;
  };
  ai: {
    criticalCount: number;
    topTags: Array<{ tag: string; count: number }>;
  };
  untreatedNegatives: Array<{
    comment: string;
    rating: number | null;
    date: string;
    author: string | null;
    location: string;
  }>;
  aiSummary: string[];
  perLocation: Array<{
    name: string;
    reviewsTotal: number;
    avgRating: number | null;
    responseRate: number | null;
    untreatedNegativeCount: number;
    positiveCount: number;
    negativeCount: number;
  }>;
}) => {
  const tags = params.ai.topTags.slice(0, 10);
  const tagsLeft = tags.slice(0, Math.ceil(tags.length / 2));
  const tagsRight = tags.slice(Math.ceil(tags.length / 2));

  return `
  <!doctype html>
  <html lang="fr">
    <head>
      <meta charset="utf-8" />
      <style>
        @page { size: A4; margin: 18mm; }
        body {
          margin: 0;
          font-family: "Inter", "Helvetica", sans-serif;
          color: #0b0f14;
        }
        .page {
          font-size: 13px;
          line-height: 1.55;
        }
        .header {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          margin-bottom: 18px;
        }
        .brand {
          font-size: 11px;
          text-transform: uppercase;
          letter-spacing: 0.12em;
          color: #6b7280;
          margin-bottom: 6px;
        }
        h1 {
          font-size: 26px;
          margin: 0 0 4px 0;
        }
        .subtitle {
          color: #6b7280;
          font-size: 12px;
        }
        .divider {
          height: 1px;
          background: #e5e7eb;
          margin: 16px 0;
        }
        .card {
          border: 1px solid #e5e7eb;
          border-radius: 12px;
          padding: 14px;
          background: #fafafa;
        }
        .kpi-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 12px;
        }
        .kpi-label {
          font-size: 11px;
          text-transform: uppercase;
          letter-spacing: 0.08em;
          color: #6b7280;
        }
        .kpi-value {
          font-size: 20px;
          font-weight: 600;
        }
        .stars {
          display: flex;
          align-items: center;
          gap: 6px;
          margin-top: 4px;
        }
        .kpi-note {
          margin-top: 12px;
          padding-top: 12px;
          border-top: 1px solid #e5e7eb;
        }
        .section-title {
          font-size: 16px;
          margin: 18px 0 8px;
        }
        .tags {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 6px 20px;
          font-size: 12px;
          color: #374151;
        }
        .tag {
          display: flex;
          gap: 6px;
        }
        .tag::before {
          content: "•";
          color: #9ca3af;
        }
        .reviews {
          display: grid;
          gap: 12px;
        }
        .review {
          padding-bottom: 10px;
          border-bottom: 1px solid #eef2f7;
        }
        .review:last-child {
          border-bottom: none;
        }
        .review-meta {
          font-size: 11px;
          color: #6b7280;
          display: flex;
          gap: 8px;
          flex-wrap: wrap;
        }
        .review-rating {
          color: #111827;
          font-weight: 600;
        }
        .review-text {
          margin-top: 4px;
          color: #111827;
        }
        .summary {
          margin: 8px 0 0;
          padding-left: 16px;
          color: #111827;
        }
        .summary li {
          margin-bottom: 6px;
        }
        .table {
          width: 100%;
          border-collapse: collapse;
          font-size: 12px;
        }
        .table th,
        .table td {
          padding: 6px 8px;
          border-bottom: 1px solid #eef2f7;
          text-align: left;
        }
        .table th {
          color: #6b7280;
          font-weight: 600;
          text-transform: uppercase;
          font-size: 10px;
          letter-spacing: 0.06em;
        }
        .untreated-item {
          border-bottom: 1px solid #eef2f7;
          padding-bottom: 10px;
          margin-bottom: 10px;
        }
        .untreated-item:last-child {
          border-bottom: none;
          margin-bottom: 0;
          padding-bottom: 0;
        }
        .footer {
          margin-top: 18px;
          font-size: 10px;
          color: #9ca3af;
          text-align: right;
        }
      </style>
    </head>
    <body>
      <div class="page">
        <div class="header">
          <div>
            <div class="brand">EGIA</div>
            <h1>${escapeHtml(params.title)}</h1>
            <div class="subtitle">${escapeHtml(params.subtitle)}</div>
            <div class="subtitle">${escapeHtml(params.locationsLabel)}</div>
          </div>
        </div>
        <div class="divider"></div>
        <div class="card">
          <div class="kpi-grid">
            <div>
              <div class="kpi-label">Volume d’avis (période)</div>
              <div class="kpi-value">${params.kpis.reviewsTotal}</div>
            </div>
            <div>
              <div class="kpi-label">Avis négatifs (historique)</div>
              <div class="kpi-value">${params.kpis.negativeCount}</div>
            </div>
            <div>
              <div class="kpi-label">Taux de réponse</div>
              <div class="kpi-value">${formatRatio(params.kpis.responseRate)}</div>
            </div>
            <div>
              <div class="kpi-label">Avis négatifs non traités</div>
              <div class="kpi-value">${params.kpis.untreatedNegativeCount}</div>
            </div>
          </div>
          <div class="kpi-note">
            <div class="kpi-label">Note moyenne</div>
            ${renderStars(params.kpis.avgRating)}
          </div>
        </div>

        <h2 class="section-title">Analyse IA</h2>
        <div class="card">
          <div class="kpi-grid">
            <div>
              <div class="kpi-label">Avis critiques IA</div>
              <div class="kpi-value">${params.ai.criticalCount}</div>
            </div>
          </div>
          <div class="section-title" style="margin: 14px 0 8px;">Top tags</div>
          <div class="tags">
            ${
              tags.length === 0
                ? '<div class="tag">—</div>'
                : tagsLeft
                    .map(
                      (tag) =>
                        `<div class="tag">${escapeHtml(tag.tag)}</div>`
                    )
                    .join("") +
                  tagsRight
                    .map(
                      (tag) =>
                        `<div class="tag">${escapeHtml(tag.tag)}</div>`
                    )
                    .join("")
            }
          </div>
        </div>

        <h2 class="section-title">Résumé IA</h2>
        <div class="card">
          <ul class="summary">
            ${params.aiSummary.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}
          </ul>
        </div>

        <h2 class="section-title">Avis négatifs non traités</h2>
        <div class="card">
          ${
            params.untreatedNegatives.length > 0
              ? params.untreatedNegatives
                  .map(
                    (item) => `
              <div class="untreated-item">
                <div class="review-meta">
                  <span class="review-rating">★ ${formatRating(item.rating)}</span>
                  <span>${escapeHtml(item.date)}</span>
                  ${item.author ? `<span>· ${escapeHtml(item.author)}</span>` : ""}
                  <span>· ${escapeHtml(item.location)}</span>
                </div>
                <div class="review-text">${escapeHtml(item.comment)}</div>
              </div>
            `
                  )
                  .join("")
              : "<div class='review-text'>Aucun avis négatif non traité ✅</div>"
          }
        </div>

        ${
          params.perLocation.length > 1
            ? `
        <h2 class="section-title">Détail par établissement</h2>
        <div class="card">
          <table class="table">
            <thead>
              <tr>
                <th>Établissement</th>
                <th># Avis</th>
                <th>Note moy.</th>
                <th>Taux réponse</th>
                <th>Positifs</th>
                <th>Négatifs</th>
                <th>Négatifs non traités</th>
              </tr>
            </thead>
            <tbody>
              ${params.perLocation
                .slice(0, 8)
                .map(
                  (row) => `
                <tr>
                  <td>${escapeHtml(row.name)}</td>
                  <td>${row.reviewsTotal}</td>
                  <td>${formatRating(row.avgRating)}</td>
                  <td>${formatRatio(row.responseRate)}</td>
                  <td>${row.positiveCount}</td>
                  <td>${row.negativeCount}</td>
                  <td>${row.untreatedNegativeCount}</td>
                </tr>
              `
                )
                .join("")}
              ${
                params.perLocation.length > 8
                  ? `<tr><td colspan="6">+${params.perLocation.length - 8} autres…</td></tr>`
                  : ""
              }
            </tbody>
          </table>
        </div>
        `
            : ""
        }
        ${
          params.notes
            ? `<h2 class="section-title">Notes</h2><div class="card">${escapeHtml(
                params.notes
              )}</div>`
            : ""
        }
        <div class="footer">Généré le ${formatDate(new Date())}</div>
      </div>
    </body>
  </html>
  `;
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const auth = await requireUser(req, res);
  if (!auth) {
    return;
  }

  const { supabaseAdmin, userId } = auth;
  const requestId = getRequestId(req);
  const payload = typeof req.body === "string" ? JSON.parse(req.body) : req.body ?? {};
  const reportId = payload?.report_id as string | undefined;

  if (!reportId) {
    return res.status(400).json({ error: "Missing report_id" });
  }

  logRequest("[reports]", { requestId, reportId, renderMode: "premium" });

  const { data: report, error: reportError } = await supabaseAdmin
    .from("reports")
    .select(
      "id, user_id, name, locations, period_preset, from_date, to_date, notes"
    )
    .eq("id", reportId)
    .eq("user_id", userId)
    .maybeSingle();
  if (reportError || !report) {
    return res.status(404).json({ error: "Report not found" });
  }

  let locationsLabel = "Établissements: Tous";
  const locationNameByResource = new Map<string, string>();
  if (Array.isArray(report.locations) && report.locations.length > 0) {
    const { data: locationRows } = await supabaseAdmin
      .from("google_locations")
      .select("location_resource_name, location_title")
      .eq("user_id", userId)
      .in("location_resource_name", report.locations);
    const titles = (locationRows ?? [])
      .map((row) => {
        const label = normalizeLocationTitle(
          row.location_title || "Établissement"
        );
        if (row.location_resource_name) {
          locationNameByResource.set(row.location_resource_name, label);
        }
        return label;
      })
      .filter(Boolean) as string[];
    const uniqueTitles = Array.from(new Set(titles));
    locationsLabel =
      uniqueTitles.length === 1
        ? `Établissement: ${uniqueTitles[0]}`
        : `${uniqueTitles.length} établissements`;
  }

  await supabaseAdmin
    .from("reports")
    .update({ status: "processing", updated_at: new Date().toISOString() })
    .eq("id", reportId);

  try {
    const preset = normalizePreset(report.period_preset ?? "last_30_days");
    const { from, to } = getRange(preset, report.from_date, report.to_date);
    const periodLabel =
      preset === "all_time"
        ? "Période: Depuis toujours"
        : `Période: ${formatDate(from)} au ${formatDate(to)}`;

    let query = supabaseAdmin
      .from("google_reviews")
      .select(
        "id, rating, comment, create_time, location_id, author_name, reply_text, replied_at, review_ai_insights(sentiment, sentiment_score), review_ai_tags(ai_tags(tag, category))"
      )
      .eq("user_id", userId);
    if (Array.isArray(report.locations) && report.locations.length > 0) {
      query = query.in("location_id", report.locations);
    }
    if (from) {
      query = query.gte("create_time", from.toISOString());
    }
    if (to) {
      query = query.lte("create_time", to.toISOString());
    }

    const { data: reviewsData, error: reviewsError } = await query;
    if (reviewsError) {
      throw reviewsError;
    }

    const reviews = (reviewsData ?? []) as ReviewRow[];
    const reviewsTotal = reviews.length;
    const ratingValues = reviews
      .map((review) => (typeof review.rating === "number" ? review.rating : null))
      .filter((value): value is number => typeof value === "number");
    const avgRating =
      ratingValues.length > 0
        ? ratingValues.reduce((acc, value) => acc + value, 0) / ratingValues.length
        : null;

    const replyable = reviews.filter(
      (review) => typeof review.comment === "string" && review.comment.trim() !== ""
    );
    const replied = replyable.filter(
      (review) =>
        (typeof review.reply_text === "string" && review.reply_text.trim() !== "") ||
        typeof review.replied_at === "string"
    );
    const responseRate =
      replyable.length > 0 ? replied.length / replyable.length : null;

    let positiveCount = 0;
    let negativeCount = 0;
    let untreatedNegativeCount = 0;
    let aiCriticalCount = 0;
    const tagCounts = new Map<string, number>();
    const perLocationStats = new Map<
      string,
      {
        name: string;
        reviewsTotal: number;
        ratingSum: number;
        ratingCount: number;
        replyable: number;
        replied: number;
        positiveCount: number;
        negativeCount: number;
        untreatedNegativeCount: number;
      }
    >();
    const untreatedNegatives: Array<{
      comment: string;
      rating: number | null;
      date: string;
      dateValue: number;
      author: string | null;
      location: string;
    }> = [];

    reviews.forEach((review) => {
      const insight = asOne(review.review_ai_insights);
      const tags = Array.isArray(review.review_ai_tags)
        ? review.review_ai_tags
            .map((tagRow) => tagRow?.ai_tags)
            .filter(
              (tag): tag is { tag?: string | null; category?: string | null } =>
                Boolean(tag)
            )
        : [];
      let hasNegativeTag = false;
      tags.forEach((tag) => {
        if (typeof tag.tag === "string") {
          const key = tag.tag.toLowerCase();
          tagCounts.set(key, (tagCounts.get(key) ?? 0) + 1);
        }
        if (tag.category === "negative") {
          hasNegativeTag = true;
        }
      });
      const ratingValue =
        typeof review.rating === "number" ? review.rating : null;
      const isNegativeByRating = ratingValue !== null && ratingValue <= 2;
      const isAiCritical =
        insight?.sentiment === "negative" ||
        (typeof insight?.sentiment_score === "number" &&
          insight.sentiment_score < 0.4) ||
        hasNegativeTag;
      const isPositive =
        (ratingValue !== null && ratingValue >= 4) ||
        insight?.sentiment === "positive";
      if (isPositive) {
        positiveCount += 1;
      }
      if (isNegativeByRating) {
        negativeCount += 1;
      }
      if (isAiCritical) {
        aiCriticalCount += 1;
      }

      const isReplyable =
        typeof review.comment === "string" && review.comment.trim() !== "";
      const isReplied =
        (typeof review.reply_text === "string" &&
          review.reply_text.trim() !== "") ||
        typeof review.replied_at === "string";
      const isUntreated = isNegativeByRating && !isReplied;
      if (isUntreated) {
        untreatedNegativeCount += 1;
      }

      const locationKey = review.location_id ?? "unknown";
      const locationName =
        locationNameByResource.get(locationKey) ?? "Établissement";
      const stats =
        perLocationStats.get(locationKey) ??
        {
          name: locationName,
          reviewsTotal: 0,
          ratingSum: 0,
          ratingCount: 0,
          replyable: 0,
          replied: 0,
          positiveCount: 0,
          negativeCount: 0,
          untreatedNegativeCount: 0
        };
      stats.reviewsTotal += 1;
      if (ratingValue !== null) {
        stats.ratingSum += ratingValue;
        stats.ratingCount += 1;
      }
      if (isReplyable) stats.replyable += 1;
      if (isReplied) stats.replied += 1;
      if (isPositive) stats.positiveCount += 1;
      if (isNegativeByRating) stats.negativeCount += 1;
      if (isUntreated) stats.untreatedNegativeCount += 1;
      perLocationStats.set(locationKey, stats);

      if (isUntreated) {
        const commentText = (review.comment ?? "").trim();
        untreatedNegatives.push({
          comment: commentText || "Avis sans commentaire",
          rating: ratingValue,
          date: review.create_time ? review.create_time.slice(0, 10) : "—",
          dateValue: review.create_time
            ? new Date(review.create_time).getTime()
            : 0,
          author: review.author_name ?? null,
          location: locationName
        });
      }
    });

    const topTags = Array.from(tagCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([tag, count]) => ({ tag, count }));

    const perLocation = Array.from(perLocationStats.values()).map((row) => ({
      name: row.name,
      reviewsTotal: row.reviewsTotal,
      avgRating: row.ratingCount > 0 ? row.ratingSum / row.ratingCount : null,
      responseRate:
        row.replyable > 0 ? row.replied / row.replyable : null,
      untreatedNegativeCount: row.untreatedNegativeCount,
      positiveCount: row.positiveCount,
      negativeCount: row.negativeCount
    }));
    perLocation.sort((a, b) => b.reviewsTotal - a.reviewsTotal);
    const untreatedList = untreatedNegatives
      .sort((a, b) => b.dateValue - a.dateValue)
      .slice(0, 8)
      .map(({ dateValue, ...rest }) => rest);
    const aiSummary = buildAiSummary({
      avgRating,
      responseRate,
      negativeCount,
      untreatedNegativeCount,
      reviewsTotal,
      topTags,
      aiCriticalCount
    });

    const html = buildHtml({
      title: report.name,
      subtitle: periodLabel,
      locationsLabel,
      notes: report.notes ?? null,
      kpis: {
        reviewsTotal,
        avgRating,
        responseRate,
        negativeCount,
        untreatedNegativeCount
      },
      ai: {
        criticalCount: aiCriticalCount,
        topTags
      },
      untreatedNegatives: untreatedList,
      aiSummary,
      perLocation
    });

    if (req.query?.html === "1" && process.env.NODE_ENV !== "production") {
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      return res.status(200).send(html);
    }

    const pdfBytes = await renderPdfFromHtml(html);

    const storagePath = `${userId}/${reportId}/${Date.now()}.pdf`;
    const { error: uploadError } = await supabaseAdmin.storage
      .from("reports")
      .upload(storagePath, pdfBytes, {
        contentType: "application/pdf",
        upsert: true
      });
    if (uploadError) {
      await supabaseAdmin
        .from("reports")
        .update({ status: "failed", updated_at: new Date().toISOString() })
        .eq("id", reportId);
      throw uploadError;
    }

    const { data: signed, error: signError } = await supabaseAdmin.storage
      .from("reports")
      .createSignedUrl(storagePath, 60 * 60);
    if (signError) {
      await supabaseAdmin
        .from("reports")
        .update({ status: "failed", updated_at: new Date().toISOString() })
        .eq("id", reportId);
      throw signError;
    }

    await supabaseAdmin
      .from("reports")
      .update({
        status: "done",
        storage_path: storagePath,
        last_generated_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .eq("id", reportId);

    return res.status(200).json({
      ok: true,
      reportId,
      pdf: { path: storagePath, url: signed?.signedUrl ?? null }
    });
  } catch (error) {
    console.error("[reports] generate_html failed", error);
    await supabaseAdmin
      .from("reports")
      .update({ status: "failed", updated_at: new Date().toISOString() })
      .eq("id", reportId);
    return res.status(500).json({ error: "Report generation failed" });
  }
}
