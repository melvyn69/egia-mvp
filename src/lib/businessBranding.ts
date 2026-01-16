import { supabase } from "./supabase";

type BrandingInfo = {
  logoUrl: string | null;
  companyName: string | null;
  logoPath: string | null;
  businessId: string | null;
};

const pickInitials = (value: string | null) => {
  if (!value) return "EG";
  const parts = value.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "EG";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
};

const getBusinessId = async (userId: string) => {
  if (!supabase) return null;
  const { data, error } = await supabase
    .from("business_settings")
    .select("business_id")
    .eq("user_id", userId)
    .maybeSingle();
  if (error || !data?.business_id) {
    return null;
  }
  return data.business_id as string;
};

const getSignedLogoUrl = async (path: string | null) => {
  if (!supabase || !path) return null;
  const { data, error } = await supabase.storage
    .from("brand-assets")
    .createSignedUrl(path, 60);
  if (error) {
    console.warn("[branding] signed url failed", error);
    return null;
  }
  return data?.signedUrl ?? null;
};

const getActiveLegalEntityLogo = async (userId: string): Promise<BrandingInfo> => {
  if (!supabase) {
    return { logoUrl: null, companyName: null, logoPath: null, businessId: null };
  }
  const businessId = await getBusinessId(userId);
  if (!businessId) {
    return { logoUrl: null, companyName: null, logoPath: null, businessId: null };
  }

  const { data: entities, error } = await supabase
    .from("legal_entities")
    .select("id, company_name, logo_path, logo_url, is_default, created_at")
    .eq("business_id", businessId)
    .order("is_default", { ascending: false })
    .order("created_at", { ascending: false });
  if (error) {
    console.warn("[branding] legal_entities load failed", error);
    return { logoUrl: null, companyName: null, logoPath: null, businessId };
  }

  const entity = (entities ?? [])[0] as
    | {
        company_name?: string | null;
        logo_path?: string | null;
        logo_url?: string | null;
      }
    | undefined;
  if (!entity) {
    return { logoUrl: null, companyName: null, logoPath: null, businessId };
  }

  const logoUrl =
    entity.logo_url ?? (await getSignedLogoUrl(entity.logo_path ?? null));

  return {
    logoUrl,
    companyName: entity.company_name ?? null,
    logoPath: entity.logo_path ?? null,
    businessId
  };
};

export { getActiveLegalEntityLogo, pickInitials };
