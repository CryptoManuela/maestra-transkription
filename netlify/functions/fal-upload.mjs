// Initiiert einen Einzel-Upload bei fal.ai (kleine Dateien bis 90 MB).
// Key aus Server-Einstellung FAL_KEY (nicht aus dem Browser).
export default async (req) => {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  const apiKey = process.env.FAL_KEY;
  if (!apiKey) {
    return json({ error: "Server nicht konfiguriert: FAL_KEY fehlt." }, 500);
  }

  try {
    const { file_name, content_type } = await req.json();
    if (!file_name) {
      return json({ error: "file_name ist erforderlich" }, 400);
    }

    const response = await fetch(
      "https://rest.fal.ai/storage/upload/initiate?storage_type=fal-cdn-v3",
      {
        method: "POST",
        headers: {
          Authorization: `Key ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          file_name,
          content_type: content_type || "application/octet-stream",
        }),
      }
    );

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

export const config = { path: "/api/fal-upload" };
