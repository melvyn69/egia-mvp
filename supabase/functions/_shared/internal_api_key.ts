const SLOT_PATTERN = /^[A-Za-z0-9_-]{43,128}$/;

export type InternalApiKeySlot = "A" | "B";

export const isValidInternalApiKey = (value: string) => SLOT_PATTERN.test(value);

export const selectInternalApiKey = (
  readEnv: (name: string) => string | undefined
): { slot: InternalApiKeySlot; value: string } => {
  const activeSlot = readEnv("INTERNAL_API_KEY_ACTIVE_SLOT") ?? "";
  if (activeSlot !== "A" && activeSlot !== "B") {
    throw new Error("Internal API key configuration is invalid");
  }
  const value = readEnv(`INTERNAL_API_KEY_SLOT_${activeSlot}`) ?? "";
  if (!isValidInternalApiKey(value)) {
    throw new Error("Internal API key configuration is invalid");
  }
  return { slot: activeSlot, value };
};
