import { supabase } from "../lib/supabase";

type DbError = {
  message?: string;
  code?: string;
  details?: string;
  hint?: string;
};

type QueryResult<T = unknown> = {
  data: T;
  error: DbError | null;
  count?: number | null;
};

type QueryBuilder<T = unknown> = PromiseLike<QueryResult<T>> & {
  select: (columns?: string, options?: Record<string, unknown>) => QueryBuilder<T>;
  eq: (column: string, value: unknown) => QueryBuilder<T>;
  order: (column: string, options?: Record<string, unknown>) => QueryBuilder<T>;
  limit: (count: number) => QueryBuilder<T>;
  maybeSingle: () => Promise<QueryResult<T | null>>;
  single: () => Promise<QueryResult<T>>;
  upsert: (payload: unknown, options?: Record<string, unknown>) => QueryBuilder<T>;
};

type LoyaltySupabaseClient = {
  from: <T = unknown>(table: string) => QueryBuilder<T>;
  rpc: <T = unknown>(
    functionName: string,
    args?: Record<string, unknown>
  ) => Promise<QueryResult<T>>;
};

const sb = supabase as unknown as LoyaltySupabaseClient;

export type LoyaltyProgram = {
  id: string;
  user_id: string;
  location_id: string;
  is_enabled: boolean;
  name: string;
  points_per_visit: number;
  reward_threshold_points: number;
  reward_label: string;
  public_token: string;
  created_at: string;
  updated_at: string;
};

export type LoyaltyProgramForm = {
  is_enabled: boolean;
  name: string;
  points_per_visit: number;
  reward_threshold_points: number;
  reward_label: string;
};

export type LoyaltyStats = {
  membersCount: number;
  visitsCount: number;
  pointsDistributed: number;
  rewardsAvailable: number;
};

export type LoyaltyMember = {
  id: string;
  first_name: string;
  email: string;
  member_code: string;
  points_balance: number;
  lifetime_points: number;
  visits_count: number;
  last_visit_at: string | null;
  created_at: string;
};

export type RecordLoyaltyVisitResult = {
  member_id: string;
  first_name?: string | null;
  member_code: string;
  points_balance: number;
  lifetime_points: number;
  visits_count: number;
  points_added: number;
  reward_available: boolean;
  reward_id: string | null;
  reward_label: string;
  duplicate_scan: boolean;
  last_visit_at: string | null;
};

export type PublicLoyaltyProgram = {
  program_id: string;
  location_id: string;
  location_name: string;
  program_name: string;
  points_per_visit: number;
  reward_threshold_points: number;
  reward_label: string;
};

export type JoinLoyaltyResult = {
  member_id: string;
  member_code: string;
  qr_token: string;
  wallet_public_token: string;
  points_balance: number;
  visits_count: number;
  program_name: string;
  points_per_visit: number;
  reward_threshold_points: number;
  reward_label: string;
  location_name: string;
};

export type LoyaltyMemberHighlight = LoyaltyMember & {
  progressPercent: number;
  pointsRemaining: number;
};

export type LoyaltyAvailableReward = {
  id: string;
  member_id: string;
  first_name: string;
  member_code: string;
  reward_label: string;
  unlocked_at: string;
};

export type LoyaltyHighlights = {
  nearRewardMembers: LoyaltyMemberHighlight[];
  availableRewards: LoyaltyAvailableReward[];
};

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const applyLocationFilter = <T>(
  query: QueryBuilder<T>,
  locationId: string | null
) =>
  locationId ? query.eq("location_id", locationId) : query;

export const parseLoyaltyScannerInput = (raw: string) => {
  let value = raw.trim();
  if (!value) {
    return { memberCode: null, qrToken: null };
  }

  try {
    const url = new URL(value);
    value =
      url.searchParams.get("token") ??
      url.searchParams.get("qr_token") ??
      url.searchParams.get("code") ??
      url.pathname.split("/").filter(Boolean).pop() ??
      value;
  } catch {
    value = value.replace(/^egia-loyalty:\/\/member\//i, "");
  }

  value = value.trim();
  if (UUID_RE.test(value)) {
    return { memberCode: null, qrToken: value };
  }
  return { memberCode: value.toUpperCase(), qrToken: null };
};

export const createLoyaltyIdempotencyKey = () => {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
};

export const fetchLoyaltyProgram = async (
  userId: string,
  locationId: string
): Promise<LoyaltyProgram | null> => {
  const { data, error } = await sb
    .from("loyalty_programs")
    .select("*")
    .eq("user_id", userId)
    .eq("location_id", locationId)
    .maybeSingle();
  if (error) throw error;
  return (data ?? null) as LoyaltyProgram | null;
};

export const saveLoyaltyProgram = async (params: {
  userId: string;
  locationId: string;
  form: LoyaltyProgramForm;
}): Promise<LoyaltyProgram> => {
  const payload = {
    user_id: params.userId,
    location_id: params.locationId,
    is_enabled: params.form.is_enabled,
    name: params.form.name.trim() || "Programme fidelite",
    points_per_visit: Math.max(1, Math.round(params.form.points_per_visit)),
    reward_threshold_points: Math.max(
      1,
      Math.round(params.form.reward_threshold_points)
    ),
    reward_label: params.form.reward_label.trim() || "Recompense disponible",
    updated_at: new Date().toISOString()
  };

  const { data, error } = await sb
    .from("loyalty_programs")
    .upsert(payload, { onConflict: "user_id,location_id" })
    .select("*")
    .single();
  if (error) throw error;
  return data as LoyaltyProgram;
};

export const fetchLoyaltyStats = async (
  userId: string,
  locationId: string | null
): Promise<LoyaltyStats> => {
  const membersQuery = applyLocationFilter(
    sb
      .from("loyalty_members")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId),
    locationId
  );
  const visitsQuery = applyLocationFilter(
    sb
      .from("loyalty_visits")
      .select("points_added", { count: "exact" })
      .eq("user_id", userId),
    locationId
  );
  const rewardsQuery = applyLocationFilter(
    sb
      .from("loyalty_rewards")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .eq("status", "available"),
    locationId
  );

  const [members, visits, rewards] = await Promise.all([
    membersQuery,
    visitsQuery,
    rewardsQuery
  ]);

  if (members.error) throw members.error;
  if (visits.error) throw visits.error;
  if (rewards.error) throw rewards.error;

  const visitRows = (visits.data ?? []) as Array<{
    points_added: number | null;
  }>;
  const pointsDistributed = visitRows.reduce(
    (sum, row) => sum + Number(row.points_added ?? 0),
    0
  );

  return {
    membersCount: members.count ?? 0,
    visitsCount: visits.count ?? visitRows.length,
    pointsDistributed,
    rewardsAvailable: rewards.count ?? 0
  };
};

export const fetchRecentLoyaltyMembers = async (
  userId: string,
  locationId: string | null
): Promise<LoyaltyMember[]> => {
  const query = applyLocationFilter(
    sb
      .from("loyalty_members")
      .select(
        "id, first_name, email, member_code, points_balance, lifetime_points, visits_count, last_visit_at, created_at"
      )
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(8),
    locationId
  );
  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []) as LoyaltyMember[];
};

export const fetchLoyaltyHighlights = async (params: {
  userId: string;
  locationId: string | null;
  rewardThresholdPoints: number;
}): Promise<LoyaltyHighlights> => {
  const threshold = Math.max(1, Math.round(params.rewardThresholdPoints));
  const membersQuery = applyLocationFilter(
    sb
      .from("loyalty_members")
      .select(
        "id, first_name, email, member_code, points_balance, lifetime_points, visits_count, last_visit_at, created_at"
      )
      .eq("user_id", params.userId)
      .order("points_balance", { ascending: false })
      .limit(12),
    params.locationId
  );

  const rewardsQuery = applyLocationFilter(
    sb
      .from("loyalty_rewards")
      .select(
        "id, member_id, reward_label, unlocked_at, loyalty_members(first_name, member_code)"
      )
      .eq("user_id", params.userId)
      .eq("status", "available")
      .order("unlocked_at", { ascending: false })
      .limit(6),
    params.locationId
  );

  const [members, rewards] = await Promise.all([membersQuery, rewardsQuery]);
  if (members.error) throw members.error;
  if (rewards.error) throw rewards.error;

  const nearRewardMembers = ((members.data ?? []) as LoyaltyMember[])
    .filter(
      (member) =>
        member.points_balance > 0 && member.points_balance < threshold
    )
    .slice(0, 5)
    .map((member) => ({
      ...member,
      progressPercent: Math.min(
        100,
        Math.round((member.points_balance / threshold) * 100)
      ),
      pointsRemaining: Math.max(0, threshold - member.points_balance)
    }));

  type RewardRow = {
    id: string;
    member_id: string;
    reward_label: string;
    unlocked_at: string;
    loyalty_members?:
      | {
          first_name?: string | null;
          member_code?: string | null;
        }
      | Array<{
          first_name?: string | null;
          member_code?: string | null;
        }>
      | null;
  };

  const availableRewards = ((rewards.data ?? []) as RewardRow[]).map((row) => {
    const member = Array.isArray(row.loyalty_members)
      ? row.loyalty_members[0]
      : row.loyalty_members;
    return {
      id: row.id,
      member_id: row.member_id,
      first_name: member?.first_name ?? "Membre",
      member_code: member?.member_code ?? "",
      reward_label: row.reward_label,
      unlocked_at: row.unlocked_at
    };
  });

  return { nearRewardMembers, availableRewards };
};

export const recordLoyaltyVisit = async (params: {
  locationId: string;
  scannerInput: string;
}): Promise<RecordLoyaltyVisitResult> => {
  const parsed = parseLoyaltyScannerInput(params.scannerInput);
  if (!parsed.memberCode && !parsed.qrToken) {
    throw new Error("Identifiant membre requis.");
  }

  const { data, error } = await sb.rpc("record_loyalty_visit", {
    p_location_id: params.locationId,
    p_member_code: parsed.memberCode,
    p_qr_token: parsed.qrToken,
    p_idempotency_key: createLoyaltyIdempotencyKey()
  });
  if (error) throw error;
  const row = Array.isArray(data) ? data[0] : data;
  if (!row) {
    throw new Error("Aucun membre trouve.");
  }
  const result = row as RecordLoyaltyVisitResult;
  const { data: member } = await sb
    .from<{ first_name: string | null }>("loyalty_members")
    .select("first_name")
    .eq("id", result.member_id)
    .maybeSingle();
  return {
    ...result,
    first_name: member?.first_name ?? null
  };
};

export const getPublicLoyaltyProgram = async (
  publicToken: string
): Promise<PublicLoyaltyProgram | null> => {
  const { data, error } = await sb.rpc("get_public_loyalty_program", {
    p_public_token: publicToken
  });
  if (error) throw error;
  const row = Array.isArray(data) ? data[0] : data;
  return (row ?? null) as PublicLoyaltyProgram | null;
};

export const joinLoyaltyProgram = async (params: {
  publicToken: string;
  firstName: string;
  email: string;
}): Promise<JoinLoyaltyResult> => {
  const { data, error } = await sb.rpc("join_loyalty_program", {
    p_public_token: params.publicToken,
    p_first_name: params.firstName,
    p_email: params.email
  });
  if (error) throw error;
  const row = Array.isArray(data) ? data[0] : data;
  if (!row) {
    throw new Error("Inscription impossible.");
  }
  return row as JoinLoyaltyResult;
};
