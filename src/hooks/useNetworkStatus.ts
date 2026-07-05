import { useEffect, useState } from "react";

const getOnlineStatus = () => {
  if (typeof navigator === "undefined") {
    return true;
  }
  return navigator.onLine;
};

const useNetworkStatus = () => {
  const [status, setStatus] = useState(() => ({
    isOnline: getOnlineStatus(),
    showOnlineToast: false
  }));

  useEffect(() => {
    let wasOffline = !getOnlineStatus();
    let toastTimeoutId: number | null = null;

    const clearToastTimeout = () => {
      if (toastTimeoutId) {
        window.clearTimeout(toastTimeoutId);
        toastTimeoutId = null;
      }
    };

    const hideOnlineToast = () => {
      setStatus((current) => ({
        ...current,
        showOnlineToast: false
      }));
    };

    const handleOnline = () => {
      const shouldToast = wasOffline;
      wasOffline = false;
      setStatus({
        isOnline: true,
        showOnlineToast: shouldToast
      });
      clearToastTimeout();
      if (shouldToast) {
        toastTimeoutId = window.setTimeout(hideOnlineToast, 3200);
      }
    };

    const handleOffline = () => {
      wasOffline = true;
      clearToastTimeout();
      setStatus({
        isOnline: false,
        showOnlineToast: false
      });
    };

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    return () => {
      clearToastTimeout();
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  const dismissOnlineToast = () => {
    setStatus((current) => ({
      ...current,
      showOnlineToast: false
    }));
  };

  return {
    ...status,
    dismissOnlineToast
  };
};

export { useNetworkStatus };
