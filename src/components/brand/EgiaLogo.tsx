import { cn } from "../../lib/utils";

type EgiaLogoVariant = "dark" | "light" | "icon";
type EgiaLogoSize = "sm" | "md" | "lg";

type EgiaLogoProps = {
  variant?: EgiaLogoVariant;
  size?: EgiaLogoSize;
  showSuite?: boolean;
  className?: string;
};

const wordmarkSizeClasses: Record<EgiaLogoSize, string> = {
  sm: "text-[14px]",
  md: "text-[20px]",
  lg: "text-[48px]"
};

const suiteSizeClasses: Record<EgiaLogoSize, string> = {
  sm: "text-[10px]",
  md: "text-xs",
  lg: "text-sm"
};

const iconSizeClasses: Record<EgiaLogoSize, string> = {
  sm: "h-10 w-10 rounded-2xl",
  md: "h-12 w-12 rounded-[20px]",
  lg: "h-16 w-16 rounded-[24px]"
};

const iconWordmarkSizeClasses: Record<EgiaLogoSize, string> = {
  sm: "text-[8px]",
  md: "text-[9px]",
  lg: "text-xs"
};

const wordmarkGapClasses: Record<EgiaLogoSize, string> = {
  sm: "gap-[0.72em]",
  md: "gap-[0.78em]",
  lg: "gap-[0.82em]"
};

const iconWordmarkGapClasses: Record<EgiaLogoSize, string> = {
  sm: "gap-[0.48em]",
  md: "gap-[0.52em]",
  lg: "gap-[0.58em]"
};

const aMarkSizeClasses: Record<EgiaLogoSize, string> = {
  sm: "h-[1.12em] w-[0.78em]",
  md: "h-[1.15em] w-[0.8em]",
  lg: "h-[1.18em] w-[0.82em]"
};

const aStrokeWidthClasses: Record<EgiaLogoSize, string> = {
  sm: "1.45",
  md: "1.35",
  lg: "1.05"
};

const EgiaAMark = ({ size }: { size: EgiaLogoSize }) => (
  <svg
    className={cn("relative top-[0.04em] shrink-0", aMarkSizeClasses[size])}
    viewBox="0 0 28 40"
    fill="none"
    aria-hidden="true"
    focusable="false"
  >
    <defs>
      <linearGradient id="egia-a-gradient" x1="5" y1="4" x2="25" y2="38" gradientUnits="userSpaceOnUse">
        <stop stopColor="#FFFFFF" />
        <stop offset="0.42" stopColor="#78E6D7" />
        <stop offset="0.72" stopColor="#8EC9FF" />
        <stop offset="1" stopColor="#A27BFF" />
      </linearGradient>
    </defs>
    <path
      d="M3 38 L14 4"
      stroke="url(#egia-a-gradient)"
      strokeWidth={aStrokeWidthClasses[size]}
      strokeLinecap="butt"
    />
    <path
      d="M25 38 L14 4"
      stroke="url(#egia-a-gradient)"
      strokeWidth={aStrokeWidthClasses[size]}
      strokeLinecap="butt"
    />
  </svg>
);

const EgiaWordmark = ({
  variant,
  size
}: {
  variant: Exclude<EgiaLogoVariant, "icon">;
  size: EgiaLogoSize;
}) => {
  const textClass = variant === "dark" ? "text-white" : "text-slate-950";

  return (
    <span
      className={cn(
        "inline-flex items-baseline font-light leading-none",
        wordmarkSizeClasses[size],
        wordmarkGapClasses[size],
        textClass
      )}
      aria-label="EGIA"
    >
      <span aria-hidden="true">E</span>
      <span aria-hidden="true">G</span>
      <span aria-hidden="true">I</span>
      <EgiaAMark size={size} />
    </span>
  );
};

const EgiaLogo = ({
  variant = "light",
  size = "md",
  showSuite = false,
  className
}: EgiaLogoProps) => {
  if (variant === "icon") {
    return (
      <span
        className={cn(
          "inline-flex shrink-0 items-center justify-center bg-[#0B0F17] text-white",
          iconSizeClasses[size],
          className
        )}
        style={{
          background:
            "radial-gradient(circle at 68% 32%, rgba(142, 201, 255, 0.12), rgba(162, 123, 255, 0.08) 32%, rgba(11, 15, 23, 0) 64%), #0B0F17"
        }}
        aria-label="EGIA"
      >
        <span
          className={cn(
            "inline-flex items-baseline font-light leading-none",
            iconWordmarkSizeClasses[size],
            iconWordmarkGapClasses[size]
          )}
          aria-hidden="true"
        >
          <span>E</span>
          <span>G</span>
          <span>I</span>
          <EgiaAMark size={size} />
        </span>
      </span>
    );
  }

  const suiteClass = variant === "dark" ? "text-slate-300" : "text-slate-500";

  return (
    <span className={cn("inline-flex min-w-0 flex-col gap-1", className)}>
      <EgiaWordmark variant={variant} size={size} />
      {showSuite && (
        <span
          className={cn(
            "font-medium leading-none tracking-normal",
            suiteSizeClasses[size],
            suiteClass
          )}
        >
          Business Suite
        </span>
      )}
    </span>
  );
};

export { EgiaLogo };
