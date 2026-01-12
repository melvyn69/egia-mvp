import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import fs from "fs";
import path from "path";
import { requireUser } from "../../../_shared_dist/_auth.js";
import { getRequestId, logRequest } from "../../../_shared_dist/api_utils.js";
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
const formatPercent = (value) => value === null ? "—" : `${Math.round(value)}%`;
const formatRating = (value) => value === null ? "—" : value.toFixed(1).replace(".", ",");
const formatRatio = (value) => value === null ? "—" : `${Math.round(value * 100)}%`;
const normalizeLocationTitle = (value) => value.replace(/\s*-\s*/g, " - ").replace(/\s{2,}/g, " ").trim();
const cleanReviewText = (value) => value
    .replace(/\(?(Translated by Google)\)?/gi, "")
    .replace(/\(?(Traduit par Google)\)?/gi, "")
    .replace(/\s+/g, " ")
    .trim();
const buildPdf = async (params) => {
    const doc = await PDFDocument.create();
    doc.registerFontkit(fontkit);
    let page = doc.addPage([595.28, 841.89]);
    const font = await doc.embedFont(StandardFonts.Helvetica);
    const fontBold = await doc.embedFont(StandardFonts.HelveticaBold);
    const unicodeFontPath = path.join(process.cwd(), "assets", "fonts", "NotoSans-Regular.ttf");
    const unicodeBoldPath = path.join(process.cwd(), "assets", "fonts", "NotoSans-Bold.ttf");
    let unicodeFont = null;
    let unicodeBoldFont = null;
    try {
        const fontBytes = fs.readFileSync(unicodeFontPath);
        unicodeFont = await doc.embedFont(fontBytes);
        try {
            const boldBytes = fs.readFileSync(unicodeBoldPath);
            unicodeBoldFont = await doc.embedFont(boldBytes);
        }
        catch {
            unicodeBoldFont = unicodeFont;
        }
    }
    catch (error) {
        console.warn("[reports] unicode font unavailable", error);
    }
    let warnedFallback = false;
    const canRenderStars = () => {
        if (!unicodeFont)
            return false;
        try {
            unicodeFont.widthOfTextAtSize("★★★★★", 10);
            return true;
        }
        catch {
            return false;
        }
    };
    const useUnicode = Boolean(unicodeFont) && canRenderStars();
    if (unicodeFont && !useUnicode) {
        console.warn("[reports] unicode font star test failed");
    }
    const safeText = (text) => {
        if (!useUnicode) {
            if (!warnedFallback) {
                console.warn("[reports] fallback text sanitization active");
                warnedFallback = true;
            }
            return text.replace(/★/g, "*");
        }
        return text;
    };
    const activeFont = useUnicode && unicodeFont ? unicodeFont : font;
    const activeBoldFont = useUnicode && unicodeBoldFont ? unicodeBoldFont : fontBold;
    let y = 780;
    const margin = 50;
    const pageWidth = 595.28;
    const contentWidth = pageWidth - margin * 2;
    const pages = [page];
    const drawDivider = () => {
        page.drawLine({
            start: { x: margin, y },
            end: { x: pageWidth - margin, y },
            thickness: 1,
            color: rgb(0.85, 0.87, 0.9)
        });
        y -= 14;
    };
    const finalizeLine = (value) => {
        let next = value.trim();
        while (next.endsWith("·")) {
            next = next.slice(0, -1).trim();
        }
        return next;
    };
    const wrapLines = (value, maxWidth, fontRef, size, maxLines = 3) => {
        const words = value.split(/\s+/).filter(Boolean);
        const lines = [];
        let current = "";
        let index = 0;
        while (index < words.length) {
            const word = words[index];
            const next = current ? `${current} ${word}` : word;
            if (fontRef.widthOfTextAtSize(next, size) <= maxWidth) {
                current = next;
                index += 1;
                continue;
            }
            if (current) {
                lines.push(finalizeLine(current));
                current = "";
                if (lines.length === maxLines) {
                    break;
                }
                continue;
            }
            lines.push(finalizeLine(word));
            index += 1;
            if (lines.length === maxLines) {
                break;
            }
        }
        if (lines.length < maxLines && current) {
            lines.push(finalizeLine(current));
        }
        const truncated = index < words.length;
        if (truncated && lines.length > 0) {
            const lastIndex = lines.length - 1;
            lines[lastIndex] = `${lines[lastIndex].replace(/…$/, "")}…`;
        }
        return { lines, truncated };
    };
    const drawText = (text, size = 12, bold = false) => {
        page.drawText(text, {
            x: margin,
            y,
            size,
            font: bold ? activeBoldFont : activeFont,
            color: rgb(0.08, 0.1, 0.12)
        });
        y -= size + 6;
    };
    const drawWrapped = (value, size, maxWidth, maxLines = 2, bold = false) => {
        const fontRef = bold ? activeBoldFont : activeFont;
        const { lines } = wrapLines(value, maxWidth, fontRef, size, maxLines);
        for (const line of lines) {
            page.drawText(line, {
                x: margin,
                y,
                size,
                font: fontRef,
                color: rgb(0.08, 0.1, 0.12)
            });
            y -= size + 4;
        }
    };
    const drawHeader = (compact) => {
        const brandSize = compact ? 9 : 10;
        const titleSize = compact ? 16 : 26;
        const subtitleSize = compact ? 10 : 12;
        const locationSize = compact ? 9 : 11;
        page.drawText("EGIA", {
            x: margin,
            y,
            size: brandSize,
            font: activeBoldFont,
            color: rgb(0.2, 0.26, 0.3)
        });
        y -= brandSize + 6;
        drawText(safeText(params.title), titleSize, true);
        drawText(safeText(params.subtitle), subtitleSize);
        drawText(safeText(params.locationsLabel), locationSize);
        if (!compact && params.notes) {
            drawWrapped(safeText(`Notes: ${params.notes}`), 10, contentWidth, 2);
        }
        y -= 6;
        drawDivider();
    };
    const ensureSpace = (minY) => {
        if (y >= minY) {
            return;
        }
        const newPage = doc.addPage([595.28, 841.89]);
        pages.push(newPage);
        page = newPage;
        y = 780;
        drawHeader(true);
    };
    const STAR_PATH = "M10 1.5L12.9 7.1L19 7.9L14.5 11.8L15.8 17.8L10 14.6L4.2 17.8L5.5 11.8L1 7.9L7.1 7.1L10 1.5Z";
    const renderStars = (x, yBase, rating, size = 10) => {
        const safeRating = typeof rating === "number" ? rating : 0;
        const fullStars = Math.round(safeRating);
        const gap = 4;
        for (let i = 0; i < 5; i += 1) {
            const fill = i < fullStars ? rgb(0.98, 0.77, 0.2) : rgb(0.86, 0.88, 0.9);
            page.drawSvgPath(STAR_PATH, {
                x: x + i * (size + gap),
                y: yBase,
                color: fill,
                scale: size / 20
            });
        }
        const ratingLabel = formatRating(typeof rating === "number" ? rating : null);
        page.drawText(ratingLabel, {
            x: x + 5 * (size + gap) + 6,
            y: yBase + 1,
            size: 10,
            font: activeBoldFont,
            color: rgb(0.2, 0.25, 0.3)
        });
    };
    const drawReviewItem = (item) => {
        ensureSpace(140);
        const ratingLabel = formatRating(item.rating);
        const line1 = item.author
            ? `★ ${ratingLabel} — ${item.date} · ${item.author}`
            : `★ ${ratingLabel} — ${item.date}`;
        drawText(safeText(line1), 11, true);
        const cleaned = cleanReviewText(item.label);
        const authorNorm = item.author ? cleanReviewText(item.author) : "";
        if (!cleaned || (authorNorm && cleaned.toLowerCase() === authorNorm.toLowerCase())) {
            y -= 2;
            return;
        }
        drawWrapped(safeText(cleaned), 10, contentWidth, 3);
        y -= 4;
    };
    drawHeader(false);
    ensureSpace(200);
    const cardHeight = 108;
    page.drawRectangle({
        x: margin,
        y: y - cardHeight + 18,
        width: contentWidth,
        height: cardHeight,
        color: rgb(0.96, 0.97, 0.99),
        borderColor: rgb(0.9, 0.91, 0.94),
        borderWidth: 1
    });
    const cardTop = y;
    const leftX = margin + 16;
    const rightX = margin + contentWidth / 2 + 8;
    const cardTitleY = cardTop - 8;
    page.drawText("KPIs clés", {
        x: leftX,
        y: cardTitleY,
        size: 12,
        font: activeBoldFont,
        color: rgb(0.1, 0.12, 0.15)
    });
    page.drawText("Note moyenne", {
        x: rightX,
        y: cardTitleY - 6,
        size: 12,
        font: activeBoldFont,
        color: rgb(0.1, 0.12, 0.15)
    });
    const kpiLineY = cardTitleY - 20;
    page.drawText("Volume avis", {
        x: leftX,
        y: kpiLineY,
        size: 10,
        font: activeFont,
        color: rgb(0.35, 0.4, 0.45)
    });
    page.drawText(String(params.kpis.reviewsTotal), {
        x: leftX,
        y: kpiLineY - 14,
        size: 18,
        font: activeBoldFont,
        color: rgb(0.08, 0.1, 0.12)
    });
    const responseY = kpiLineY - 36;
    page.drawText("Taux de réponse", {
        x: leftX,
        y: responseY,
        size: 10,
        font: activeFont,
        color: rgb(0.35, 0.4, 0.45)
    });
    page.drawText(formatRatio(params.kpis.responseRate), {
        x: leftX,
        y: responseY - 14,
        size: 14,
        font: activeBoldFont,
        color: rgb(0.08, 0.1, 0.12)
    });
    const sentimentY = responseY - 36;
    page.drawText("Sentiment positif", {
        x: leftX,
        y: sentimentY,
        size: 10,
        font: activeFont,
        color: rgb(0.35, 0.4, 0.45)
    });
    page.drawText(formatPercent(params.kpis.sentimentPositive), {
        x: leftX,
        y: sentimentY - 14,
        size: 14,
        font: activeBoldFont,
        color: rgb(0.08, 0.1, 0.12)
    });
    const ratingY = cardTitleY - 30;
    renderStars(rightX, ratingY, params.kpis.avgRating, 12);
    y = cardTop - cardHeight - 12;
    drawDivider();
    ensureSpace(200);
    drawText("Analyse IA", 14, true);
    drawText(safeText(`Score moyen IA: ${formatRating(params.ai.avgScore)}`), 12);
    drawText(safeText(`Avis critiques: ${params.ai.criticalCount}`), 12);
    const tagsText = params.ai.topTags.length
        ? params.ai.topTags
            .slice(0, 10)
            .map((tag) => `• ${tag.tag} (${tag.count})`)
        : ["—"];
    const half = Math.ceil(tagsText.length / 2);
    const leftTags = tagsText.slice(0, half);
    const rightTags = tagsText.slice(half);
    const tagsY = y;
    const colGap = 16;
    const colWidth = (contentWidth - colGap) / 2;
    const drawTagColumn = (items, startX, startY) => {
        let currentY = startY;
        items.forEach((item) => {
            page.drawText(safeText(item), {
                x: startX,
                y: currentY,
                size: 11,
                font: activeFont,
                color: rgb(0.12, 0.14, 0.18)
            });
            currentY -= 14;
        });
        return currentY;
    };
    const leftEnd = drawTagColumn(leftTags, margin, tagsY);
    const rightEnd = drawTagColumn(rightTags, margin + colWidth + colGap, tagsY);
    y = Math.min(leftEnd, rightEnd) - 10;
    drawDivider();
    ensureSpace(160);
    drawText("Avis positifs", 14, true);
    if (params.positives.length === 0) {
        drawText("—", 11);
    }
    else {
        params.positives.forEach(drawReviewItem);
    }
    y -= 4;
    ensureSpace(160);
    drawText("Avis négatifs", 14, true);
    if (params.negatives.length === 0) {
        drawText("Aucun avis négatif sur la période", 11);
    }
    else {
        params.negatives.forEach(drawReviewItem);
    }
    const generatedLabel = safeText(`Généré le ${new Date().toISOString().slice(0, 16).replace("T", " ")}`);
    pages.forEach((p, index) => {
        const pageNumber = `Page ${index + 1}`;
        p.drawText(generatedLabel, {
            x: margin,
            y: 30,
            size: 9,
            font: activeFont,
            color: rgb(0.4, 0.45, 0.5)
        });
        p.drawText(pageNumber, {
            x: pageWidth - margin - activeFont.widthOfTextAtSize(pageNumber, 9),
            y: 30,
            size: 9,
            font: activeFont,
            color: rgb(0.4, 0.45, 0.5)
        });
    });
    return doc.save();
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
    logRequest("[reports]", { requestId, reportId, renderMode: "classic" });
    const { data: report, error: reportError } = await supabaseAdmin
        .from("reports")
        .select("id, user_id, name, locations, period_preset, from_date, to_date, timezone, notes")
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
        const pdfBytes = await buildPdf({
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
    }
    catch (error) {
        console.error("[reports] generate failed", error);
        await supabaseAdmin
            .from("reports")
            .update({ status: "error", updated_at: new Date().toISOString() })
            .eq("id", reportId);
        return res.status(500).json({ error: "Report generation failed" });
    }
}
// DEV SMOKE TEST (non-exported)
const devSmokeTest = async () => {
    const doc = await PDFDocument.create();
    doc.registerFontkit(fontkit);
    const page = doc.addPage([200, 80]);
    const fontBytes = fs.readFileSync(path.join(process.cwd(), "assets", "fonts", "NotoSans-Regular.ttf"));
    const font = await doc.embedFont(fontBytes);
    page.drawText("★★★★★", { x: 10, y: 40, size: 14, font });
    await doc.save();
    return true;
};
if (process.env.NODE_ENV !== "production") {
    void devSmokeTest();
}
