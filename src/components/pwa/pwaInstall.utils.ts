type PlatformType = "ios" | "android" | "desktop";

const detectPlatform = (): PlatformType => {
  if (typeof navigator === "undefined") return "desktop";
  const ua = navigator.userAgent.toLowerCase();
  if (/iphone|ipad|ipod/.test(ua)) return "ios";
  if (/android/.test(ua)) return "android";
  return "desktop";
};

export { detectPlatform };
export type { PlatformType };
