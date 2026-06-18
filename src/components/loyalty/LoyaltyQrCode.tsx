import { useMemo } from "react";
import { createQrMatrix } from "../../lib/qr";

type LoyaltyQrCodeProps = {
  value: string;
  label?: string;
  className?: string;
};

const QUIET_ZONE = 4;

const LoyaltyQrCode = ({ value, label, className }: LoyaltyQrCodeProps) => {
  const matrix = useMemo(() => {
    try {
      return createQrMatrix(value);
    } catch (error) {
      console.error("loyalty qr generation error:", error);
      return null;
    }
  }, [value]);

  if (!matrix) {
    return (
      <div className={className}>
        <div className="rounded-2xl border border-dashed border-slate-200 bg-white p-4 text-center text-sm text-slate-500">
          {value}
        </div>
      </div>
    );
  }

  const size = matrix.length + QUIET_ZONE * 2;

  return (
    <div className={className}>
      <svg
        viewBox={`0 0 ${size} ${size}`}
        role="img"
        aria-label={label ?? "QR fidelite"}
        className="h-full w-full rounded-2xl bg-white shadow-sm"
        shapeRendering="crispEdges"
      >
        <rect width={size} height={size} fill="white" />
        {matrix.map((row, y) =>
          row.map((dark, x) =>
            dark ? (
              <rect
                key={`${x}-${y}`}
                x={x + QUIET_ZONE}
                y={y + QUIET_ZONE}
                width="1"
                height="1"
                fill="#0f172a"
              />
            ) : null
          )
        )}
      </svg>
    </div>
  );
};

export { LoyaltyQrCode };
