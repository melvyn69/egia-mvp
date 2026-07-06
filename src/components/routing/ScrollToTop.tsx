import { useEffect } from "react";
import { useLocation } from "react-router-dom";
import { scrollToRouteTop } from "../../lib/scrollToRouteTop";

const ScrollToTop = () => {
  const { hash, pathname } = useLocation();

  useEffect(() => {
    if (hash) {
      return;
    }

    const frameId = window.requestAnimationFrame(scrollToRouteTop);
    return () => {
      window.cancelAnimationFrame(frameId);
    };
  }, [hash, pathname]);

  return null;
};

export { ScrollToTop };
