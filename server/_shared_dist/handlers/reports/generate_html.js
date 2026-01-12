import { requireUser } from "../../../_shared_dist/_auth.js";
import { getRequestId, logRequest } from "../../../_shared_dist/api_utils.js";
import { renderPdfFromHtml } from "../../../_shared_dist/pdf_html.js";
const asOne = (value) => Array.isArray(value) ? value[0] ?? null : value ?? null;
const normalizePreset = (value) => {
    if (value === "last_7_days" ||
        value === "last_30_days" ||
        value === "custom" ||
        value === "this_month" ||
        value === "last_month" ||
        value === "last_year" ||
        value === "this_year" ||
        value === "all_time") {
        return value;
    }
    return "last_30_days";
};
const getRange = (preset, from, to) => {
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
const formatDate = (value) => value ? value.toISOString().slice(0, 10) : "—";
const formatRating = (value) => value === null ? "—" : value.toFixed(1).replace(".", ",");
const formatPercent = (value) => value === null ? "—" : `${Math.round(value)}%`;
const formatRatio = (value) => value === null ? "—" : `${Math.round(value * 100)}%`;
const normalizeLocationTitle = (value) => value.replace(/\s*-\s*/g, " - ").replace(/\s{2,}/g, " ").trim();
const cleanReviewText = (value) => value
    .replace(/\(?(Translated by Google)\)?/gi, "")
    .replace(/\(?(Traduit par Google)\)?/gi, "")
    .replace(/\s+/g, " ")
    .trim();
const escapeHtml = (value) => value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
const renderStars = (rating) => {
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
const buildHtml = (params) => {
    const tags = params.ai.topTags.slice(0, 10);
    const tagsLeft = tags.slice(0, Math.ceil(tags.length / 2));
    const tagsRight = tags.slice(Math.ceil(tags.length / 2));
    const renderReview = (review) => {
        const cleanLabel = cleanReviewText(review.label);
        const author = review.author ? cleanReviewText(review.author) : "";
        const showSnippet = cleanLabel &&
            cleanLabel.toLowerCase() !== author.toLowerCase();
        return `
      <div class="review">
        <div class="review-meta">
          <span class="review-rating">★ ${formatRating(review.rating)}</span>
          <span>${escapeHtml(review.date)}</span>
          ${author ? `<span>· ${escapeHtml(author)}</span>` : ""}
        </div>
        ${showSnippet
            ? `<div class="review-text">${escapeHtml(cleanLabel)}</div>`
            : ""}
      </div>
    `;
    };
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
              <div class="kpi-label">Volume d’avis</div>
              <div class="kpi-value">${params.kpis.reviewsTotal}</div>
            </div>
            <div>
              <div class="kpi-label">Taux de réponse</div>
              <div class="kpi-value">${formatRatio(params.kpis.responseRate)}</div>
            </div>
            <div>
              <div class="kpi-label">Sentiment positif</div>
              <div class="kpi-value">${formatPercent(params.kpis.sentimentPositive)}</div>
            </div>
            <div>
              <div class="kpi-label">Note moyenne</div>
              ${renderStars(params.kpis.avgRating)}
            </div>
          </div>
        </div>

        <h2 class="section-title">Analyse IA</h2>
        <div class="card">
          <div class="kpi-grid">
            <div>
              <div class="kpi-label">Score moyen</div>
              <div class="kpi-value">${formatRating(params.ai.avgScore)}</div>
            </div>
            <div>
              <div class="kpi-label">Avis critiques</div>
              <div class="kpi-value">${params.ai.criticalCount}</div>
            </div>
          </div>
          <div class="section-title" style="margin: 14px 0 8px;">Top tags</div>
          <div class="tags">
            ${tags.length === 0
        ? '<div class="tag">—</div>'
        : tagsLeft
            .map((tag) => `<div class="tag">${escapeHtml(tag.tag)}</div>`)
            .join("") +
            tagsRight
                .map((tag) => `<div class="tag">${escapeHtml(tag.tag)}</div>`)
                .join("")}
          </div>
        </div>

        <h2 class="section-title">Avis positifs</h2>
        <div class="reviews">
          ${params.positives.length > 0
        ? params.positives.map(renderReview).join("")
        : "<div class='review-text'>Aucun avis positif sur la période.</div>"}
        </div>

        <h2 class="section-title">Avis négatifs</h2>
        <div class="reviews">
          ${params.negatives.length > 0
        ? params.negatives.map(renderReview).join("")
        : "<div class='review-text'>Aucun avis négatif sur la période ✅</div>"}
        </div>
        ${params.notes
        ? `<h2 class="section-title">Notes</h2><div class="card">${escapeHtml(params.notes)}</div>`
        : ""}
        <div class="footer">Généré le ${formatDate(new Date())}</div>
      </div>
    </body>
  </html>
  `;
};
export default async function handler(req, res) {
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
    const reportId = payload?.report_id;
    if (!reportId) {
        return res.status(400).json({ error: "Missing report_id" });
    }
    logRequest("[reports]", { requestId, reportId, renderMode: "premium" });
    const { data: report, error: reportError } = await supabaseAdmin
        .from("reports")
        .select("id, user_id, name, locations, period_preset, from_date, to_date, notes")
        .eq("id", reportId)
        .eq("user_id", userId)
        .maybeSingle();
    if (reportError || !report) {
        return res.status(404).json({ error: "Report not found" });
    }
    let locationsLabel = "Établissements: Tous";
    if (Array.isArray(report.locations) && report.locations.length > 0) {
        const { data: locationRows } = await supabaseAdmin
            .from("google_locations")
            .select("location_resource_name, location_title")
            .eq("user_id", userId)
            .in("location_resource_name", report.locations);
        const titles = (locationRows ?? [])
            .map((row) => normalizeLocationTitle(row.location_title || "Établissement"))
            .filter(Boolean);
        const uniqueTitles = Array.from(new Set(titles));
        locationsLabel =
            uniqueTitles.length === 1
                ? `Établissement: ${uniqueTitles[0]}`
                : `${uniqueTitles.length} établissements`;
    }
    await supabaseAdmin
        .from("reports")
        .update({ status: "running", updated_at: new Date().toISOString() })
        .eq("id", reportId);
    try {
        const preset = normalizePreset(report.period_preset ?? "last_30_days");
        const { from, to } = getRange(preset, report.from_date, report.to_date);
        const periodLabel = preset === "all_time"
            ? "Période: Depuis toujours"
            : `Période: ${formatDate(from)} au ${formatDate(to)}`;
        let query = supabaseAdmin
            .from("google_reviews")
            .select("id, rating, comment, create_time, location_id, author_name, reply_text, replied_at, review_ai_insights(sentiment, sentiment_score), review_ai_tags(ai_tags(tag, category))")
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
        const reviews = (reviewsData ?? []);
        const reviewsTotal = reviews.length;
        const ratingValues = reviews
            .map((review) => (typeof review.rating === "number" ? review.rating : null))
            .filter((value) => typeof value === "number");
        const avgRating = ratingValues.length > 0
            ? ratingValues.reduce((acc, value) => acc + value, 0) / ratingValues.length
            : null;
        const replyable = reviews.filter((review) => typeof review.comment === "string" && review.comment.trim() !== "");
        const replied = replyable.filter((review) => (typeof review.reply_text === "string" && review.reply_text.trim() !== "") ||
            typeof review.replied_at === "string");
        const responseRate = replyable.length > 0 ? replied.length / replyable.length : null;
        let sentimentPositiveCount = 0;
        let sentimentSamples = 0;
        let aiScoreSum = 0;
        let aiScoreCount = 0;
        let criticalCount = 0;
        const tagCounts = new Map();
        reviews.forEach((review) => {
            const insight = asOne(review.review_ai_insights);
            if (insight) {
                if (insight.sentiment === "positive") {
                    sentimentPositiveCount += 1;
                }
                if (insight.sentiment) {
                    sentimentSamples += 1;
                }
                if (typeof insight.sentiment_score === "number") {
                    aiScoreSum += insight.sentiment_score;
                    aiScoreCount += 1;
                }
            }
            const tags = Array.isArray(review.review_ai_tags)
                ? review.review_ai_tags
                    .map((tagRow) => tagRow?.ai_tags)
                    .filter((tag) => Boolean(tag))
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
            if (insight?.sentiment === "negative" ||
                (typeof insight?.sentiment_score === "number" &&
                    insight.sentiment_score < 0.4) ||
                hasNegativeTag) {
                criticalCount += 1;
            }
        });
        const sentimentPositive = sentimentSamples > 0
            ? (sentimentPositiveCount / sentimentSamples) * 100
            : null;
        const avgAiScore = aiScoreCount > 0 ? aiScoreSum / aiScoreCount : null;
        const topTags = Array.from(tagCounts.entries())
            .sort((a, b) => b[1] - a[1])
            .slice(0, 5)
            .map(([tag, count]) => ({ tag, count }));
        const positives = reviews
            .filter((review) => {
            const insight = asOne(review.review_ai_insights);
            return ((typeof review.rating === "number" && review.rating >= 4) ||
                insight?.sentiment === "positive");
        })
            .slice(0, 3)
            .map((review) => ({
            label: review.comment || review.author_name || "Avis positif",
            date: review.create_time ? review.create_time.slice(0, 10) : "—",
            rating: review.rating,
            author: review.author_name ?? null
        }));
        const negatives = reviews
            .filter((review) => typeof review.rating === "number" && review.rating <= 2)
            .slice(0, 3)
            .map((review) => ({
            label: review.comment || review.author_name || "Avis négatif",
            date: review.create_time ? review.create_time.slice(0, 10) : "—",
            rating: review.rating,
            author: review.author_name ?? null
        }));
        const html = buildHtml({
            title: report.name,
            subtitle: periodLabel,
            locationsLabel,
            notes: report.notes ?? null,
            kpis: {
                reviewsTotal,
                avgRating,
                responseRate,
                sentimentPositive
            },
            ai: {
                avgScore: avgAiScore,
                criticalCount,
                topTags
            },
            positives,
            negatives
        });
        if (req.query?.html === "1" && process.env.NODE_ENV !== "production") {
            res.setHeader("Content-Type", "text/html; charset=utf-8");
            return res.status(200).send(html);
        }
        const pdfBytes = await renderPdfFromHtml({ html, requestId });
        const storagePath = `${userId}/${reportId}/${Date.now()}.pdf`;
        const { error: uploadError } = await supabaseAdmin.storage
            .from("reports")
            .upload(storagePath, pdfBytes, {
            contentType: "application/pdf",
            upsert: true
        });
        if (uploadError) {
            throw uploadError;
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
        res.setHeader("Content-Type", "application/pdf");
        return res.status(200).send(pdfBytes);
    }
    catch (error) {
        console.error("[reports] generate_html failed", error);
        await supabaseAdmin
            .from("reports")
            .update({ status: "error", updated_at: new Date().toISOString() })
            .eq("id", reportId);
        return res.status(500).json({ error: "Report generation failed" });
    }
}
