const BENIGN_ERROR_NAMES = new Set(["AbortError", "NotAllowedError"]);

const getErrorName = (error: unknown) => {
  if (error instanceof DOMException || error instanceof Error) {
    return error.name;
  }
  return null;
};

const getErrorMessage = (error: unknown) => {
  if (error instanceof DOMException || error instanceof Error) {
    return error.message;
  }
  if (typeof error === "string") {
    return error;
  }
  return "";
};

const isBenignBrowserError = (error: unknown) => {
  const name = getErrorName(error);
  if (name && BENIGN_ERROR_NAMES.has(name)) {
    return true;
  }

  const message = getErrorMessage(error).toLowerCase();
  return (
    message.includes("aborterror") ||
    message.includes("aborted") ||
    message.includes("cancelled") ||
    message.includes("canceled") ||
    message.includes("user cancelled") ||
    message.includes("user canceled") ||
    message.includes("share cancelled") ||
    message.includes("share canceled") ||
    message.includes("interrupted by the browser") ||
    message.includes("interrupted by a new load request")
  );
};

const getFriendlyMobileError = (
  error: unknown,
  fallback = "Action indisponible sur ce navigateur."
) => {
  const name = getErrorName(error);
  const message = getErrorMessage(error);
  const lowerMessage = message.toLowerCase();

  if (lowerMessage.includes("clipboard")) {
    return "Copie indisponible sur ce navigateur.";
  }

  if (name === "SecurityError") {
    return "Action indisponible sur ce navigateur.";
  }

  if (isBenignBrowserError(error)) {
    return null;
  }

  return message.trim() || fallback;
};

export { getFriendlyMobileError, isBenignBrowserError };
