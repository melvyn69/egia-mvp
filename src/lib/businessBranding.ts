import { supabase } from "./supabase";

type BrandingInfo = {
  logoUrl: string | null;
  companyName: string | null;
  legalName: string | null;
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

const getBusinessBrandSeed = async (userId: string) => {
  if (!supabase) return null;
  const { data, error } = await supabase
    .from("business_settings")
    .select("business_id, business_name")
    .eq("user_id", userId)
    .maybeSingle();
  if (error || !data?.business_id) {
    return null;
  }
  return {
    businessId: data.business_id as string,
    businessName: (data.business_name as string | null | undefined) ?? null
  };
};

const getCanonicalLogoPath = (
  businessId: string,
  entityId: string,
  path: string | null
) => {
  const expectedPrefix = `business/${businessId}/legal_entities/${entityId}/logo.`;
  if (
    !path ||
    !path.startsWith(expectedPrefix) ||
    !["png", "jpg", "webp"].includes(path.slice(expectedPrefix.length))
  ) {
    return null;
  }
  return path;
};

const getSignedLogoUrl = async (
  businessId: string,
  entityId: string,
  path: string | null
) => {
  const canonicalPath = getCanonicalLogoPath(businessId, entityId, path);
  if (!supabase || !canonicalPath) return null;
  const { data, error } = await supabase.storage
    .from("brand-assets")
    .createSignedUrl(canonicalPath, 60);
  if (error) {
    console.warn("[branding] signed url failed", error);
    return null;
  }
  return data?.signedUrl ?? null;
};

const getActiveLegalEntityLogo = async (userId: string): Promise<BrandingInfo> => {
  if (!supabase) {
    return {
      logoUrl: null,
      companyName: null,
      legalName: null,
      logoPath: null,
      businessId: null
    };
  }
  const businessSeed = await getBusinessBrandSeed(userId);
  if (!businessSeed?.businessId) {
    return {
      logoUrl: null,
      companyName: null,
      legalName: null,
      logoPath: null,
      businessId: null
    };
  }
  const { businessId, businessName } = businessSeed;

  // NOTE: "legal_entities" not yet in generated Supabase types. Cast to a loose client until types are regenerated.
  const sb = supabase as unknown as {
    from: (table: string) => {
      select: (columns: string) => {
        eq: (column: string, value: string) => {
          order: (
            column: string,
            options?: { ascending?: boolean }
          ) => {
            order: (
              column: string,
              options?: { ascending?: boolean }
            ) => Promise<{ data: unknown; error: unknown }>;
          };
        };
      };
    };
  };
  const { data: entities, error } = await sb
    .from("legal_entities")
    .select("id, company_name, legal_name, logo_path, is_default, created_at")
    .eq("business_id", businessId)
    .order("is_default", { ascending: false })
    .order("created_at", { ascending: false });
  if (error) {
    console.warn("[branding] legal_entities load failed", error);
    return {
      logoUrl: null,
      companyName: businessName,
      legalName: null,
      logoPath: null,
      businessId
    };
  }

  const entitiesArr = Array.isArray(entities) ? entities : [];
  const entity = entitiesArr[0] as
    | {
        id?: string | null;
        company_name?: string | null;
        legal_name?: string | null;
        logo_path?: string | null;
      }
    | undefined;
  if (!entity) {
    return {
      logoUrl: null,
      companyName: businessName,
      legalName: null,
      logoPath: null,
      businessId
    };
  }

  const entityId = entity.id ?? "";
  const logoPath = entityId
    ? getCanonicalLogoPath(businessId, entityId, entity.logo_path ?? null)
    : null;
  const logoUrl = entityId
    ? await getSignedLogoUrl(businessId, entityId, logoPath)
    : null;

  return {
    logoUrl,
    companyName: entity.company_name ?? businessName,
    legalName: entity.legal_name ?? null,
    logoPath,
    businessId
  };
};

export { getActiveLegalEntityLogo, pickInitials };
