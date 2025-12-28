import { cn } from "../../lib/utils";

type SkeletonProps = React.HTMLAttributes<HTMLDivElement>;

const Skeleton = ({ className, ...props }: SkeletonProps) => (
  <div
    className={cn("animate-pulse rounded-xl bg-slate-200/70", className)}
    {...props}
  />
);

export { Skeleton };
