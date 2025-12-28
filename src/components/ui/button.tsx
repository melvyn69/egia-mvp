import { forwardRef } from "react";
import { cn } from "../../lib/utils";

type ButtonVariant = "default" | "secondary" | "outline" | "ghost";
type ButtonSize = "sm" | "md" | "lg";

type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
};

const variantStyles: Record<ButtonVariant, string> = {
  default:
    "bg-ink text-white shadow-sm hover:bg-slate-900 focus-visible:ring-2 focus-visible:ring-ink/40",
  secondary:
    "bg-clay text-slate-900 hover:bg-[#e9dfd0] focus-visible:ring-2 focus-visible:ring-ink/30",
  outline:
    "border border-slate-300 text-slate-900 hover:bg-slate-100 focus-visible:ring-2 focus-visible:ring-ink/30",
  ghost:
    "text-slate-700 hover:bg-slate-100 focus-visible:ring-2 focus-visible:ring-ink/20"
};

const sizeStyles: Record<ButtonSize, string> = {
  sm: "h-9 px-3 text-sm",
  md: "h-10 px-4 text-sm",
  lg: "h-12 px-5 text-base"
};

const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = "default", size = "md", ...props }, ref) => (
    <button
      ref={ref}
      className={cn(
        "inline-flex items-center justify-center gap-2 rounded-full font-medium transition focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-60",
        variantStyles[variant],
        sizeStyles[size],
        className
      )}
      {...props}
    />
  )
);

Button.displayName = "Button";

export { Button };
