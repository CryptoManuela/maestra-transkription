// Stellt die Transkription in die fal.ai-QUEUE (kein 504-Timeout).
// Der API-Key kommt aus der Server-Einstellung FAL_KEY (Netlify Env-Var),
// NICHT aus dem Browser. Die Teilnehmerin gibt nie einen Key ein.
export default async (req) => {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  const apiKey = process.env.FAL_KEY;
  if (!apiKey) {
    return json({ error: "Server nicht konfiguriert: FAL_KEY fehlt." }, 500);
  }

  try {
    const { model, input } = await req.json();
    if (!model || !input) {
      return json({ error: "model und input sind erforderlich" }, 400);
    }

    const response = await fetch(`https://queue.fal.run/${model}`, {
      method: "POST",
      headers: {
        Authorization: `Key ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(input),
    });

    const data = await response.text();
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

export const config = { path: "/api/fal-transcribe" };
