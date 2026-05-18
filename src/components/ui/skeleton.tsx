import { cn } from "../../lib/utils";

type SkeletonProps = React.HTMLAttributes<HTMLDivElement>;

const Skeleton = ({ className, ...props }: SkeletonProps) => (
  <div
    className={cn(
      "animate-pulse rounded-xl bg-gradient-to-r from-slate-100 via-slate-200/70 to-slate-100",
      className
    )}
    {...props}
  />
);

export { Skeleton };
