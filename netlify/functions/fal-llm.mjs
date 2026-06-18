// Stellt eine LLM-Anfrage in die fal.ai-QUEUE (kein 504-Timeout).
// Nutzt denselben FAL_KEY wie die Transkription (Server-Einstellung, NIE im Browser).
// Gepollt wird über dieselbe /api/fal-status-Function (model = LLM_ENDPOINT).
//
// ── Endpoint zentral, Modell frei steuerbar ─────────────────────────────────
// Transport: openrouter/router (powered by OpenRouter, NICHT deprecated).
//   Vertrag: { prompt, system_prompt, model, temperature, max_tokens } -> { output }
// Das Modell ist ein FREIER String und kommt aus dem Browser (Einstellungen).
// Ändern sich die Claude-Modelle, reicht es, die Modell-ID im Frontend zu tippen –
// hier muss nichts angefasst werden.
const LLM_ENDPOINT = "openrouter/router";
const DEFAULT_MODEL = "anthropic/claude-sonnet-4.6";
// Fallback-Transport, falls openrouter/router je wegfällt: "fal-ai/any-llm"

export default async (req) => {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  const apiKey = process.env.FAL_KEY;
  if (!apiKey) {
    return json({ error: "Server nicht konfiguriert: FAL_KEY fehlt." }, 500);
  }

  try {
    const body = await req.json();
    const prompt = body.prompt;
    if (!prompt || typeof prompt !== "string") {
      return json({ error: "prompt ist erforderlich" }, 400);
    }

    const model =
      typeof body.model === "string" && body.model.trim()
        ? body.model.trim()
        : DEFAULT_MODEL;

    const input = {
      prompt,
      model,
      temperature: typeof body.temperature === "number" ? body.temperature : 0.4,
      max_tokens: typeof body.max_tokens === "number" ? body.max_tokens : 8000,
    };
    if (body.system_prompt && typeof body.system_prompt === "string") {
      input.system_prompt = body.system_prompt;
    }

    const response = await fetch(`https://queue.fal.run/${LLM_ENDPOINT}`, {
      method: "POST",
      headers: {
        Authorization: `Key ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(input),
    });

    const data = await response.text();
    // Den Queue-Endpoint mitschicken, damit der Client damit pollt (fal-status).
    if (response.ok) {
      try {
        const parsed = JSON.parse(data);
        parsed.llm_endpoint = LLM_ENDPOINT;
        return json(parsed, response.status);
      } catch {
        /* fällt unten auf Roh-Antwort zurück */
      }
    }
    return new Response(data, {
      status: response.status,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    return json({ error: err.message }, 500);
  }
};

function json(obj, status) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

export const config = { path: "/api/fal-llm" };
