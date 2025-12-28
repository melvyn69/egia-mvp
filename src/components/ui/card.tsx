import { cn } from "../../lib/utils";

type CardProps = React.HTMLAttributes<HTMLDivElement>;

const Card = ({ className, ...props }: CardProps) => (
  <div
    className={cn(
      "rounded-2xl border border-slate-200 bg-white shadow-card",
      className
    )}
    {...props}
  />
);

const CardHeader = ({ className, ...props }: CardProps) => (
  <div className={cn("flex flex-col gap-2 p-6", className)} {...props} />
);

const CardTitle = ({
  className,
  ...props
}: React.HTMLAttributes<HTMLHeadingElement>) => (
  <h3 className={cn("text-lg font-semibold text-slate-900", className)} {...props} />
);

const CardDescription = ({
  className,
  ...props
}: React.HTMLAttributes<HTMLParagraphElement>) => (
  <p className={cn("text-sm text-slate-500", className)} {...props} />
);

const CardContent = ({ className, ...props }: CardProps) => (
  <div className={cn("px-6 pb-6", className)} {...props} />
);

export { Card, CardHeader, CardTitle, CardDescription, CardContent };
