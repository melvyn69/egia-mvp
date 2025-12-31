// Follow this setup guide to integrate the Deno language server with your editor:
// https://deno.land/manual/getting_started/setup_your_environment
// This enables autocomplete, go to definition, etc.

// Setup type definitions for built-in Supabase Runtime APIs
import "jsr:@supabase/functions-js/edge-runtime.d.ts";

type GenerateReplyPayload = {
  reviewText?: string;
  rating?: number;
  authorName?: string;
  businessName?: string;
  locationName?: string;
  platform?: string;
  source?: string;
  tone?: string;
  length?: string;
};

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const buildUserPrompt = (payload: GenerateReplyPayload): string => {
  const parts = [
    `Avis: ${payload.reviewText ?? ""}`,
    `Note: ${payload.rating ?? ""}`,
    `Auteur: ${payload.authorName ?? ""}`,
    `Lieu: ${payload.locationName ?? payload.businessName ?? ""}`,
    `Plateforme: ${payload.source ?? payload.platform ?? ""}`,
    `Ton souhaité: ${payload.tone ?? ""}`,
    `Longueur souhaitée: ${payload.length ?? ""}`
  ];
  return parts.join("\n");
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: corsHeaders
    });
  }

  try {
    const payload = (await req.json()) as GenerateReplyPayload;

    if (!payload.reviewText || typeof payload.rating !== "number") {
      return new Response(
        JSON.stringify({ error: "Missing required fields: reviewText, rating." }),
        {
          status: 400,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
        }
      );
    }

    const apiKey = Deno.env.get("OPENAI_API_KEY");
    if (!apiKey) {
      return new Response(
        JSON.stringify({ error: "OPENAI_API_KEY is missing." }),
        {
          status: 500,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
        }
      );
    }

    const systemPrompt =
      "Tu rédiges des réponses aux avis clients. Réponds en français, ton professionnel, poli et concis. Ne mentionne jamais l'IA ni un remboursement. Personnalise avec le prénom et le lieu si disponibles. Remercie et invite à revenir. Adapte la réponse à la note.";

    const requestBody = (model: string) =>
      JSON.stringify({
        model,
        input: [
          {
            role: "system",
            content: [{ type: "input_text", text: systemPrompt }]
          },
          {
            role: "user",
            content: [{ type: "input_text", text: buildUserPrompt(payload) }]
          }
        ]
      });

    const requestInit = {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      }
    };

    let response = await fetch("https://api.openai.com/v1/responses", {
      ...requestInit,
      body: requestBody("gpt-5-mini")
    });

    if (response.status === 404) {
      response = await fetch("https://api.openai.com/v1/responses", {
        ...requestInit,
        body: requestBody("gpt-5")
      });
    }

    if (!response.ok) {
      const errText = await response.text();
      console.error("OpenAI error:", response.status, errText);
      return new Response(
        JSON.stringify({ error: "OpenAI request failed." }),
        {
          status: 500,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
        }
      );
    }

    const json = await response.json();
    const reply =
      json.output_text ??
      json.output?.flatMap((o: any) => o.content ?? [])
        ?.find((c: any) => c.type === "output_text")?.text;

    if (!reply) {
      console.error(
        "OpenAI response (no reply):",
        JSON.stringify(json).slice(0, 2000)
      );
      return new Response(
        JSON.stringify({ error: "OpenAI request failed." }),
        {
          status: 500,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
        }
      );
    }

    return new Response(JSON.stringify({ reply }), {
      status: 200,
      headers: {
        ...corsHeaders,
        "Content-Type": "application/json",
      },
    });
  } catch (error) {
    console.error(error);
    return new Response(
      JSON.stringify({ error: "OpenAI request failed." }),
      {
        status: 500,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
      }
    );
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
