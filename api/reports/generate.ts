import type { VercelRequest, VercelResponse } from "@vercel/node";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import fs from "fs";
import path from "path";
import { requireUser } from "../../server/_shared_dist/_auth.js";

type ReportPreset = "last_7_days" | "last_30_days" | "custom" | "this_month" | "last_month";

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
    value === "last_month"
  ) {
    return value;
  }
  return "last_30_days";
};

const getRange = (preset: ReportPreset, from?: string | null, to?: string | null) => {
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
  const start = new Date(now);
  start.setDate(start.getDate() - 29);
  return { from: start, to: now };
};

const formatDate = (value: Date) => value.toISOString().slice(0, 10);

const formatPercent = (value: number | null) =>
  value === null ? "—" : `${Math.round(value)}%`;

const formatRating = (value: number | null) =>
  value === null ? "—" : value.toFixed(1);

const formatRatio = (value: number | null) =>
  value === null ? "—" : `${Math.round(value * 100)}%`;

const buildPdf = async (params: {
  title: string;
  subtitle: string;
  locationsLabel: string;
  notes?: string | null;
  kpis: {
    reviewsTotal: number;
    avgRating: number | null;
    responseRate: number | null;
    sentimentPositive: number | null;
  };
  ai: {
    avgScore: number | null;
    criticalCount: number;
    topTags: Array<{ tag: string; count: number }>;
  };
  positives: Array<{ label: string; date: string; rating: number | null }>;
  negatives: Array<{ label: string; date: string; rating: number | null }>;
}) => {
  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);
  const page = doc.addPage([595.28, 841.89]);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const fontBold = await doc.embedFont(StandardFonts.HelveticaBold);
  const unicodeFontPath = path.join(
    process.cwd(),
    "assets",
    "fonts",
    "NotoSans-Regular.ttf"
  );
  let unicodeFont: Awaited<ReturnType<typeof doc.embedFont>> | null = null;
  let unicodeBoldFont: Awaited<ReturnType<typeof doc.embedFont>> | null = null;
  try {
    const fontBytes = fs.readFileSync(unicodeFontPath);
    unicodeFont = await doc.embedFont(fontBytes);
    unicodeBoldFont = await doc.embedFont(fontBytes);
  } catch (error) {
    console.warn("[reports] unicode font unavailable", error);
  }
  let warnedFallback = false;
  const canRenderStars = () => {
    if (!unicodeFont) return false;
    try {
      page.drawText("★★★★★", {
        x: 0,
        y: 0,
        size: 1,
        font: unicodeFont,
        color: rgb(0, 0, 0)
      });
      return true;
    } catch {
      return false;
    }
  };
  const useUnicode = Boolean(unicodeFont) && canRenderStars();
  if (unicodeFont && !useUnicode) {
    console.warn("[reports] unicode font star test failed");
  }
  const safeText = (text: string) => {
    if (!useUnicode) {
      if (!warnedFallback) {
        console.warn("[reports] fallback text sanitization active");
        warnedFallback = true;
      }
      return text.replace(/★/g, "*");
    }
    return text;
  };
  let y = 780;
  const margin = 50;

  const drawText = (text: string, size = 12, bold = false) => {
    page.drawText(text, {
      x: margin,
      y,
      size,
      font: bold
        ? useUnicode && unicodeBoldFont
          ? unicodeBoldFont
          : fontBold
        : useUnicode && unicodeFont
        ? unicodeFont
        : font,
      color: rgb(0.08, 0.1, 0.12)
    });
    y -= size + 6;
  };

  drawText(safeText(params.title), 22, true);
  drawText(safeText(params.subtitle), 12);
  drawText(safeText(params.locationsLabel), 11);
  if (params.notes) {
    drawText(safeText(`Notes: ${params.notes}`), 11);
  }
  y -= 8;

  drawText("KPIs principaux", 14, true);
  drawText(safeText(`Volume avis: ${params.kpis.reviewsTotal}`), 12);
  drawText(
    safeText(`Note moyenne: ${formatRating(params.kpis.avgRating)}`),
    12
  );
  drawText(
    safeText(`Taux de réponse: ${formatRatio(params.kpis.responseRate)}`),
    12
  );
  drawText(
    safeText(`Sentiment positif: ${formatPercent(params.kpis.sentimentPositive)}`),
    12
  );
  y -= 8;

  drawText("Analyse IA", 14, true);
  drawText(
    safeText(`Score moyen IA: ${formatRating(params.ai.avgScore)}`),
    12
  );
  drawText(safeText(`Avis critiques: ${params.ai.criticalCount}`), 12);
  drawText(
    safeText(`Top tags: ${
      params.ai.topTags.length
        ? params.ai.topTags.map((tag) => `${tag.tag} (${tag.count})`).join(", ")
        : "—"
    }`),
    11
  );
  y -= 8;

  drawText("Top avis positifs", 14, true);
  if (params.positives.length === 0) {
    drawText("—", 11);
  } else {
    params.positives.forEach((item) => {
      drawText(
        safeText(`${item.label} · ${item.date} · ${item.rating ?? "—"}★`),
        11
      );
    });
  }
  y -= 4;

  drawText("Top avis negatifs", 14, true);
  if (params.negatives.length === 0) {
    drawText("—", 11);
  } else {
    params.negatives.forEach((item) => {
      drawText(
        safeText(`${item.label} · ${item.date} · ${item.rating ?? "—"}★`),
        11
      );
    });
  }

  page.drawText(
    safeText(`Genere le ${new Date().toISOString().slice(0, 16).replace("T", " ")}`),
    {
      x: margin,
      y: 30,
      size: 9,
      font: useUnicode && unicodeFont ? unicodeFont : font,
      color: rgb(0.4, 0.45, 0.5)
    }
  );

  return doc.save();
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
  const payload = typeof req.body === "string" ? JSON.parse(req.body) : req.body ?? {};
  const reportId = payload?.report_id as string | undefined;

  if (!reportId) {
    return res.status(400).json({ error: "Missing report_id" });
  }

  const { data: report, error: reportError } = await supabaseAdmin
    .from("reports")
    .select(
      "id, user_id, name, locations, period_preset, from_date, to_date, timezone, notes"
    )
    .eq("id", reportId)
    .eq("user_id", userId)
    .maybeSingle();
  if (reportError || !report) {
    return res.status(404).json({ error: "Report not found" });
  }

  await supabaseAdmin
    .from("reports")
    .update({ status: "running", updated_at: new Date().toISOString() })
    .eq("id", reportId);

  try {
    const preset = normalizePreset(report.period_preset ?? "last_30_days");
    const { from, to } = getRange(preset, report.from_date, report.to_date);

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

    let sentimentPositiveCount = 0;
    let sentimentSamples = 0;
    let aiScoreSum = 0;
    let aiScoreCount = 0;
    let criticalCount = 0;
    const tagCounts = new Map<string, number>();

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
      if (
        insight?.sentiment === "negative" ||
        (typeof insight?.sentiment_score === "number" &&
          insight.sentiment_score < 0.4) ||
        hasNegativeTag
      ) {
        criticalCount += 1;
      }
    });

    const sentimentPositive =
      sentimentSamples > 0
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
        return (
          (typeof review.rating === "number" && review.rating >= 4) ||
          insight?.sentiment === "positive"
        );
      })
      .slice(0, 3)
      .map((review) => ({
        label:
          review.comment?.slice(0, 120) ||
          review.author_name ||
          "Avis positif",
        date: review.create_time ? review.create_time.slice(0, 10) : "—",
        rating: review.rating
      }));

    const negatives = reviews
      .filter((review) => {
        const insight = asOne(review.review_ai_insights);
        return (
          (typeof review.rating === "number" && review.rating <= 2) ||
          insight?.sentiment === "negative"
        );
      })
      .slice(0, 3)
      .map((review) => ({
        label:
          review.comment?.slice(0, 120) ||
          review.author_name ||
          "Avis negatif",
        date: review.create_time ? review.create_time.slice(0, 10) : "—",
        rating: review.rating
      }));

    const pdfBytes = await buildPdf({
      title: report.name,
      subtitle: `Periode: ${formatDate(from)} au ${formatDate(to)}`,
      locationsLabel:
        report.locations.length > 0
          ? `Etablissements: ${report.locations.join(", ")}`
          : "Etablissements: Tous",
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

    return res.status(200).json({ ok: true, report_id: reportId, storage_path: storagePath });
  } catch (error) {
    console.error("[reports] generate failed", error);
    await supabaseAdmin
      .from("reports")
      .update({ status: "error", updated_at: new Date().toISOString() })
      .eq("id", reportId);
    return res.status(500).json({ error: "Report generation failed" });
  }
}
