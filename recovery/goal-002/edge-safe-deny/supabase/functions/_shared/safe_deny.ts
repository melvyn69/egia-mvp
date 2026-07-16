const headers = {
  "Cache-Control": "no-store, max-age=0",
  "Content-Type": "application/json",
  "Retry-After": "120",
  "X-Content-Type-Options": "nosniff"
};

const createSafeDenyHandler =
  (functionName: string) => (request: Request): Response => {
    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: {
          ...headers,
          "Access-Control-Allow-Headers":
            "authorization, x-client-info, apikey, content-type, x-process-secret",
          "Access-Control-Allow-Methods": "POST, OPTIONS",
          "Access-Control-Allow-Origin": "*"
        }
      });
    }

    return Response.json(
      {
        ok: false,
        error: {
          code: "GOAL002_SAFE_DENY",
          message: "Service temporarily unavailable"
        },
        function: functionName
      },
      { status: 503, headers }
    );
  };

export { createSafeDenyHandler };
