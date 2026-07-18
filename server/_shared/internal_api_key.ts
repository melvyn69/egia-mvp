import { timingSafeEqual } from "node:crypto";

const SLOT_PATTERN = /^[A-Za-z0-9_-]{43,128}$/;

export type InternalApiKeyEnvironment = {
  [key: string]: string | undefined;
  INTERNAL_API_KEY_SLOT_A?: string;
  INTERNAL_API_KEY_SLOT_B?: string;
  INTERNAL_API_KEY_ACTIVE_SLOT?: string;
};

export const isValidInternalApiKey = (value: string) => SLOT_PATTERN.test(value);

export const configuredInternalApiKeySlots = (
  env: InternalApiKeyEnvironment
): readonly string[] => {
  const slots = [env.INTERNAL_API_KEY_SLOT_A, env.INTERNAL_API_KEY_SLOT_B];
  if (slots.some((slot) => slot !== undefined && slot !== "" && !isValidInternalApiKey(slot))) {
    return [];
  }
  return slots.filter((slot): slot is string => Boolean(slot));
};

const constantTimeEqual = (provided: string, expected: string) => {
  const providedBuffer = Buffer.from(provided, "utf8");
  const expectedBuffer = Buffer.from(expected, "utf8");
  if (providedBuffer.length !== expectedBuffer.length) {
    const padded = Buffer.alloc(expectedBuffer.length);
    providedBuffer.copy(padded, 0, 0, Math.min(providedBuffer.length, padded.length));
    timingSafeEqual(padded, expectedBuffer);
    return false;
  }
  return timingSafeEqual(providedBuffer, expectedBuffer);
};

export const authorizeInternalApiKey = (
  headerValue: string | undefined,
  env: InternalApiKeyEnvironment
) => {
  const provided = headerValue ?? "";
  if (!isValidInternalApiKey(provided)) return false;
  const slots = configuredInternalApiKeySlots(env);
  if (slots.length === 0) return false;
  let accepted = false;
  for (const slot of slots) {
    accepted = constantTimeEqual(provided, slot) || accepted;
  }
  return accepted;
};
