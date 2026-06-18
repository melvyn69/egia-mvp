import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createClient } from "@supabase/supabase-js";
import { getRequestId, sendError } from "../../api_utils";

type QueryResult<T = unknown> = {
  data: T;
  error: Error | null;
};

type QueryBuilder<T = unknown> = PromiseLike<QueryResult<T>> & {
  select: (columns?: string) => QueryBuilder<T>;
  eq: (column: string, value: unknown) => QueryBuilder<T>;
  in: (column: string, values: unknown[]) => QueryBuilder<T>;
  order: (column: string, options?: Record<string, unknown>) => QueryBuilder<T>;
  limit: (count: number) => QueryBuilder<T>;
  maybeSingle: () => Promise<QueryResult<T | null>>;
  single: () => Promise<QueryResult<T>>;
  upsert: (payload: unknown, options?: Record<string, unknown>) => QueryBuilder<T>;
};

type SupabaseAdmin = {
  from: <T = unknown>(table: string) => QueryBuilder<T>;
};

type WalletPassRow = {
  id: string;
  program_id: string;
  member_id: string;
  user_id: string;
  location_id: string;
  provider: string;
  status: string;
  serial_number: string;
  public_token: string;
};

type LoyaltyMemberRow = {
  id: string;
  first_name: string;
  member_code: string;
  points_balance: number;
  lifetime_points: number;
  visits_count: number;
};

type LoyaltyProgramRow = {
  id: string;
  name: string;
  points_per_visit: number;
  reward_threshold_points: number;
  reward_label: string;
  is_enabled: boolean;
};

type GoogleLocationRow = {
  id: string;
  location_title: string | null;
  location_resource_name: string;
};

type LoyaltyRewardRow = {
  id: string;
  reward_label: string;
  status: string;
};

type PassContext = {
  walletPass: WalletPassRow;
  applePass: WalletPassRow;
  member: LoyaltyMemberRow;
  program: LoyaltyProgramRow;
  location: GoogleLocationRow;
  reward: LoyaltyRewardRow | null;
};

const fallbackPng = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=",
  "base64"
);

const getEnv = (keys: string[]) => {
  for (const key of keys) {
    const value = process.env[key]?.trim();
    if (value) return value;
  }
  return "";
};

const normalizeCertificate = (value: string) => {
  const normalized = value.replace(/\\n/g, "\n").trim();
  if (normalized.includes("-----BEGIN")) return normalized;
  try {
    return Buffer.from(normalized, "base64").toString("utf8").trim();
  } catch {
    return normalized;
  }
};

const splitCertificateBundle = (certificate: string) => {
  const certMatch = certificate.match(
    /-----BEGIN CERTIFICATE-----[\s\S]+?-----END CERTIFICATE-----/
  );
  const keyMatch = certificate.match(
    /-----BEGIN (?:RSA |EC |)PRIVATE KEY-----[\s\S]+?-----END (?:RSA |EC |)PRIVATE KEY-----/
  );
  return {
    signerCert: certMatch?.[0] ?? certificate,
    signerKey: keyMatch?.[0] ?? ""
  };
};

const getAppleWalletConfig = () => {
  const passTypeIdentifier = getEnv(["APPLE_PASS_TYPE_IDENTIFIER"]);
  const teamIdentifier = getEnv(["APPLE_TEAM_IDENTIFIER"]);
  const certificateRaw = getEnv(["APPLE_PASS_CERTIFICATE"]);
  const privateKeyRaw = getEnv(["APPLE_PASS_PRIVATE_KEY"]);
  const wwdrRaw = getEnv(["APPLE_WWDR_CERTIFICATE"]);
  const publicUrl = getEnv([
    "APP_PUBLIC_URL",
    "APP_BASE_URL",
    "VITE_APP_BASE_URL",
    "VERCEL_PROJECT_PRODUCTION_URL",
    "VERCEL_URL"
  ]);

  const certificate = certificateRaw
    ? normalizeCertificate(certificateRaw)
    : "";
  const privateKey = privateKeyRaw ? normalizeCertificate(privateKeyRaw) : "";
  const wwdr = wwdrRaw ? normalizeCertificate(wwdrRaw) : "";
  const split = certificate ? splitCertificateBundle(certificate) : null;
  const signerCert = split?.signerCert ?? "";
  const signerKey = privateKey || split?.signerKey || "";

  const missing = [
    !passTypeIdentifier ? "APPLE_PASS_TYPE_IDENTIFIER" : null,
    !teamIdentifier ? "APPLE_TEAM_IDENTIFIER" : null,
    !signerCert ? "APPLE_PASS_CERTIFICATE" : null,
    !signerKey ? "APPLE_PASS_PRIVATE_KEY" : null,
    !wwdr ? "APPLE_WWDR_CERTIFICATE" : null,
    !publicUrl ? "APP_PUBLIC_URL|APP_BASE_URL" : null
  ].filter((value): value is string => Boolean(value));

  const baseUrl =
    publicUrl && !publicUrl.startsWith("http")
      ? `https://${publicUrl}`
      : publicUrl;

  return {
    configured: missing.length === 0,
    missing,
    passTypeIdentifier,
    teamIdentifier,
    signerCert,
    signerKey,
    signerKeyPassphrase:
      process.env.APPLE_PASS_CERTIFICATE_PASSWORD?.trim() || undefined,
    wwdr,
    publicUrl: baseUrl
  };
};

const createSupabaseAdmin = (): SupabaseAdmin => {
  const supabaseUrl = getEnv(["SUPABASE_URL", "VITE_SUPABASE_URL"]);
  const serviceRoleKey = getEnv(["SUPABASE_SERVICE_ROLE_KEY"]);
  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error("Missing Supabase service role env");
  }
  return createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false }
  }) as unknown as SupabaseAdmin;
};

const formatLocationName = (location: GoogleLocationRow) =>
  location.location_title ?? location.location_resource_name;

const formatProgress = (member: LoyaltyMemberRow, program: LoyaltyProgramRow) => {
  const remaining = Math.max(
    0,
    program.reward_threshold_points - member.points_balance
  );
  return remaining === 0
    ? "Récompense disponible"
    : `${remaining} points restants`;
};

const findWalletPass = async (
  supabaseAdmin: SupabaseAdmin,
  token: string
): Promise<WalletPassRow | null> => {
  const { data, error } = await supabaseAdmin
    .from<WalletPassRow>("wallet_passes")
    .select(
      "id, program_id, member_id, user_id, location_id, provider, status, serial_number, public_token"
    )
    .eq("public_token", token)
    .in("status", ["ready", "active"])
    .maybeSingle();
  if (error) throw error;
  return (data ?? null) as WalletPassRow | null;
};

const resolvePassContext = async (
  supabaseAdmin: SupabaseAdmin,
  token: string
): Promise<PassContext | null> => {
  const walletPass = await findWalletPass(supabaseAdmin, token);
  if (!walletPass) return null;

  const [{ data: member, error: memberError }, { data: program, error: programError }, { data: location, error: locationError }] =
    await Promise.all([
      supabaseAdmin
        .from<LoyaltyMemberRow>("loyalty_members")
        .select("id, first_name, member_code, points_balance, lifetime_points, visits_count")
        .eq("id", walletPass.member_id)
        .eq("status", "active")
        .maybeSingle(),
      supabaseAdmin
        .from<LoyaltyProgramRow>("loyalty_programs")
        .select("id, name, points_per_visit, reward_threshold_points, reward_label, is_enabled")
        .eq("id", walletPass.program_id)
        .maybeSingle(),
      supabaseAdmin
        .from<GoogleLocationRow>("google_locations")
        .select("id, location_title, location_resource_name")
        .eq("id", walletPass.location_id)
        .maybeSingle()
    ]);

  if (memberError) throw memberError;
  if (programError) throw programError;
  if (locationError) throw locationError;
  if (!member || !program || !location || !program.is_enabled) return null;

  const { data: reward, error: rewardError } = await supabaseAdmin
    .from<LoyaltyRewardRow>("loyalty_rewards")
    .select("id, reward_label, status")
    .eq("member_id", walletPass.member_id)
    .eq("status", "available")
    .order("unlocked_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (rewardError) throw rewardError;

  const { data: applePass, error: applePassError } = await supabaseAdmin
    .from<WalletPassRow>("wallet_passes")
    .upsert(
      {
        program_id: walletPass.program_id,
        member_id: walletPass.member_id,
        user_id: walletPass.user_id,
        location_id: walletPass.location_id,
        provider: "apple",
        status: "ready",
        serial_number: `egia-${walletPass.member_id}-apple`,
        payload: {
          member_code: member.member_code,
          source_public_token: walletPass.public_token,
          updated_at: new Date().toISOString()
        }
      },
      { onConflict: "member_id,provider" }
    )
    .select(
      "id, program_id, member_id, user_id, location_id, provider, status, serial_number, public_token"
    )
    .single();
  if (applePassError) throw applePassError;

  return {
    walletPass,
    applePass: applePass as WalletPassRow,
    member: member as LoyaltyMemberRow,
    program: program as LoyaltyProgramRow,
    location: location as GoogleLocationRow,
    reward: (reward ?? null) as LoyaltyRewardRow | null
  };
};

const buildPassBuffer = async (context: PassContext) => {
  const { PKPass } = await import("passkit-generator");
  const config = getAppleWalletConfig();
  if (!config.configured) {
    return { buffer: null, missing: config.missing };
  }

  const locationName = formatLocationName(context.location);
  const rewardText =
    context.reward?.reward_label ?? formatProgress(context.member, context.program);
  const passUrl = new URL(
    `/api/loyalty/apple-pass?token=${context.applePass.public_token}`,
    config.publicUrl
  ).toString();

  const pass = new PKPass(
    {
      "icon.png": fallbackPng,
      "icon@2x.png": fallbackPng,
      "logo.png": fallbackPng,
      "logo@2x.png": fallbackPng,
      "pass.json": Buffer.from(
        JSON.stringify({
          formatVersion: 1,
          passTypeIdentifier: config.passTypeIdentifier,
          teamIdentifier: config.teamIdentifier,
          organizationName: "EGIA",
          description: `${context.program.name} - ${locationName}`,
          serialNumber: context.applePass.serial_number,
          logoText: context.program.name,
          foregroundColor: "rgb(15, 23, 42)",
          backgroundColor: "rgb(248, 250, 252)",
          labelColor: "rgb(100, 116, 139)",
          sharingProhibited: false,
          userInfo: {
            provider: "egia",
            walletPassToken: context.applePass.public_token,
            memberId: context.member.id
          },
          storeCard: {
            primaryFields: [
              {
                key: "member",
                label: locationName,
                value: context.member.first_name
              }
            ],
            secondaryFields: [
              {
                key: "points",
                label: "Points",
                value: context.member.points_balance,
                numberStyle: "PKNumberStyleDecimal"
              },
              {
                key: "visits",
                label: "Visites",
                value: context.member.visits_count,
                numberStyle: "PKNumberStyleDecimal"
              }
            ],
            auxiliaryFields: [
              {
                key: "reward",
                label: context.reward ? "Récompense disponible" : "Progression",
                value: rewardText
              },
              {
                key: "code",
                label: "Code membre",
                value: context.member.member_code
              }
            ],
            backFields: [
              {
                key: "program",
                label: "Programme",
                value: context.program.name
              },
              {
                key: "location",
                label: "Établissement",
                value: locationName
              },
              {
                key: "rule",
                label: "Fonctionnement",
                value: `1 visite = ${context.program.points_per_visit} points. Vos points sont liés à vos visites.`
              },
              {
                key: "reward_info",
                label: "Récompense",
                value: `${context.program.reward_threshold_points} points débloquent: ${context.program.reward_label}`
              },
              {
                key: "review_policy",
                label: "Avis Google",
                value: "Aucune récompense n’est liée à la note donnée."
              },
              {
                key: "update_url",
                label: "Carte",
                value: passUrl
              }
            ]
          }
        })
      )
    },
    {
      wwdr: config.wwdr,
      signerCert: config.signerCert,
      signerKey: config.signerKey,
      signerKeyPassphrase: config.signerKeyPassphrase
    }
  );

  pass.setBarcodes({
    format: "PKBarcodeFormatQR",
    message: context.applePass.public_token,
    messageEncoding: "iso-8859-1",
    altText: context.member.member_code
  });

  return { buffer: pass.getAsBuffer(), missing: [] };
};

const sendConfiguredStatus = async (
  req: VercelRequest,
  res: VercelResponse,
  requestId: string
) => {
  const token = typeof req.query.token === "string" ? req.query.token : null;
  const config = getAppleWalletConfig();

  if (!token) {
    return res.status(200).json({
      ok: true,
      configured: config.configured,
      missing: config.configured ? [] : config.missing,
      requestId
    });
  }

  const supabaseAdmin = createSupabaseAdmin();
  const walletPass = await findWalletPass(supabaseAdmin, token);
  return res.status(walletPass ? 200 : 404).json({
    ok: Boolean(walletPass),
    configured: config.configured,
    missing: config.configured ? [] : config.missing,
    requestId
  });
};

const handleApplePass = async (req: VercelRequest, res: VercelResponse) => {
  const requestId = getRequestId(req);
  if (req.method !== "GET") {
    return sendError(
      res,
      requestId,
      { code: "BAD_REQUEST", message: "Method not allowed" },
      405
    );
  }

  const statusParam = req.query.status;
  if (statusParam === "1" || statusParam === "true") {
    return sendConfiguredStatus(req, res, requestId);
  }

  const token = typeof req.query.token === "string" ? req.query.token : "";
  if (!token) {
    return sendError(
      res,
      requestId,
      { code: "BAD_REQUEST", message: "Missing wallet token" },
      400
    );
  }

  try {
    const config = getAppleWalletConfig();
    if (!config.configured) {
      return res.status(503).json({
        ok: false,
        error: {
          code: "WALLET_NOT_CONFIGURED",
          message: "Apple Wallet is not configured",
          missing: config.missing
        },
        requestId
      });
    }

    const supabaseAdmin = createSupabaseAdmin();
    const context = await resolvePassContext(supabaseAdmin, token);
    if (!context) {
      return sendError(
        res,
        requestId,
        { code: "NOT_FOUND", message: "Wallet pass not found" },
        404
      );
    }

    const { buffer, missing } = await buildPassBuffer(context);
    if (!buffer) {
      return res.status(503).json({
        ok: false,
        error: {
          code: "WALLET_NOT_CONFIGURED",
          message: "Apple Wallet is not configured",
          missing
        },
        requestId
      });
    }

    const filename = `${context.member.member_code}.pkpass`;
    res.setHeader("Content-Type", "application/vnd.apple.pkpass");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${filename}"`
    );
    res.setHeader("Cache-Control", "private, no-store");
    return res.status(200).send(buffer);
  } catch (error) {
    console.error("[loyalty/apple-pass]", {
      requestId,
      message: error instanceof Error ? error.message : String(error)
    });
    return sendError(
      res,
      requestId,
      { code: "INTERNAL", message: "Unable to generate Apple Wallet pass" },
      500
    );
  }
};

export default handleApplePass;
