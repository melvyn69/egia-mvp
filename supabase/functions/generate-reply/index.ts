// Follow this setup guide to integrate the Deno language server with your editor:
// https://deno.land/manual/getting_started/setup_your_environment
// This enables autocomplete, go to definition, etc.

// Setup type definitions for built-in Supabase Runtime APIs
import "jsr:@supabase/functions-js/edge-runtime.d.ts";

type GenerateReplyPayload = {
  reviewText?: string;
  rating?: number;
  authorName?: string;
  locationName?: string;
  platform?: string;
  tone?: string;
  length?: string;
};

const jsonResponse = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "authorization, apikey, content-type"
    }
  });

const buildUserPrompt = (payload: GenerateReplyPayload): string => {
  const parts = [
    `Avis: ${payload.reviewText ?? ""}`,
    `Note: ${payload.rating ?? ""}`,
    `Auteur: ${payload.authorName ?? ""}`,
    `Lieu: ${payload.locationName ?? ""}`,
    `Plateforme: ${payload.platform ?? ""}`,
    `Ton souhaité: ${payload.tone ?? ""}`,
    `Longueur souhaitée: ${payload.length ?? ""}`
  ];
  return parts.join("\n");
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "authorization, apikey, content-type"
      }
    });
  }

  let payload: GenerateReplyPayload;
  try {
    payload = (await req.json()) as GenerateReplyPayload;
  } catch {
    return jsonResponse(400, { error: "Invalid JSON body." });
  }

  if (!payload.reviewText || typeof payload.rating !== "number") {
    return jsonResponse(400, { error: "Missing reviewText or rating." });
  }

  const apiKey = Deno.env.get("OPENAI_API_KEY");
  if (!apiKey) {
    return jsonResponse(500, { error: "OPENAI_API_KEY is missing." });
  }

  const systemPrompt =
    "Tu es un assistant qui rédige des réponses aux avis clients. Réponds en français, ton professionnel et poli, concis. Ne mentionne jamais l'IA ni de remboursement. Personnalise avec le prénom et le lieu si disponibles. Inclure un remerciement et une invitation à revenir.";

  const model = "gpt-5-mini";

  try {
    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model,
        input: [
          {
            role: "system",
            content: [{ type: "text", text: systemPrompt }]
          },
          {
            role: "user",
            content: [{ type: "text", text: buildUserPrompt(payload) }]
          }
        ]
      })
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error("OpenAI error:", response.status, errText);
      return jsonResponse(500, { error: "OpenAI request failed." });
    }

    const data = (await response.json()) as {
      output_text?: string;
      output?: Array<{ content?: Array<{ text?: string }> }>;
    };

    const reply =
      data.output_text ??
      data.output?.[0]?.content?.[0]?.text ??
      "";

    if (!reply) {
      return jsonResponse(500, { error: "Empty reply from OpenAI." });
    }

    return jsonResponse(200, { reply });
  } catch (error) {
    console.error("generate-reply error:", error);
    return jsonResponse(500, { error: "Unexpected server error." });
  }
});

/* To invoke locally:

  1. Run `supabase start` (see: https://supabase.com/docs/reference/cli/supabase-start)
  2. Make an HTTP request:

  curl -i --location --request POST 'http://127.0.0.1:54321/functions/v1/generate-reply' \
    --header 'Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0' \
    --header 'Content-Type: application/json' \
    --data '{"name":"Functions"}'

*/
