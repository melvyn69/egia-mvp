import { useLocation } from "react-router-dom";

const MobileRouteProgress = () => {
  const { pathname } = useLocation();

  return (
    <div
      className="pointer-events-none fixed inset-x-0 top-0 z-[70] h-[2px] overflow-hidden bg-transparent lg:hidden"
      aria-hidden="true"
    >
      <style>
        {`
          @keyframes egia-mobile-route-progress {
            0% { opacity: 0; transform: scaleX(0); }
            20% { opacity: 0.8; transform: scaleX(0.34); }
            100% { opacity: 0; transform: scaleX(1); }
          }
        `}
      </style>
      <div
        key={pathname}
        className="h-full w-full origin-left bg-gradient-to-r from-[#68e0cf] via-[#8fd7ff] to-[#9b7cff]"
        style={{ animation: "egia-mobile-route-progress 220ms ease-out forwards" }}
      />
    </div>
  );
};

export { MobileRouteProgress };
