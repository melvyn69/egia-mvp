import { cn } from "../../lib/utils";

type BadgeVariant = "success" | "warning" | "neutral" | "destructive" | "secondary";

type BadgeProps = React.HTMLAttributes<HTMLSpanElement> & {
  variant?: BadgeVariant;
};

const variantStyles: Record<BadgeVariant, string> = {
  success: "bg-emerald-50 text-emerald-700 border-emerald-200",
  warning: "bg-amber-50 text-amber-700 border-amber-200",
  neutral: "bg-slate-100 text-slate-600 border-slate-200",
  destructive: "bg-rose-50 text-rose-700 border-rose-200",
  secondary: "bg-slate-100 text-slate-900 border-slate-200"
};

const Badge = ({ className, variant = "neutral", ...props }: BadgeProps) => (
  <span
    className={cn(
      "inline-flex items-center rounded-full border px-3 py-1 text-xs font-medium",
      variantStyles[variant],
      className
    )}
    {...props}
  />
);

export { Badge };
