// Fragt den Status eines fal.ai-Queue-Jobs ab; bei Fertigstellung kommt das
// Ergebnis mit. Key aus Server-Einstellung FAL_KEY (nicht aus dem Browser).
export default async (req) => {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  const apiKey = process.env.FAL_KEY;
  if (!apiKey) {
    return json({ error: "Server nicht konfiguriert: FAL_KEY fehlt." }, 500);
  }

  try {
    const { model, request_id } = await req.json();
    if (!model || !request_id) {
      return json({ error: "model und request_id sind erforderlich" }, 400);
    }

    const base = `https://queue.fal.run/${model}/requests/${request_id}`;

    const statusRes = await fetch(`${base}/status`, {
      headers: { Authorization: `Key ${apiKey}` },
    });
    const statusData = await statusRes.json();

    if (statusData.status !== "COMPLETED") {
      return json(
        {
          status: statusData.status,
          queue_position: statusData.queue_position ?? null,
        },
        200
      );
    }

    const resultRes = await fetch(base, {
      headers: { Authorization: `Key ${apiKey}` },
    });
    const resultData = await resultRes.json();

    return json({ status: "COMPLETED", result: resultData }, 200);
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

export const config = { path: "/api/fal-status" };
