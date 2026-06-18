// Speichert Prompts + Profil serverseitig in Netlify Blobs (gehört zur eigenen
// Netlify-Seite der Teilnehmerin – übersteht Browser-/Gerätewechsel & Cache-Löschen).
// Kein Login, kein zusätzlicher Key. Daten gehören zu DIESER Seite.
import { getStore } from "@netlify/blobs";

export default async (req) => {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }
  try {
    const body = await req.json();
    const store = getStore("maestra-userdata");
    await store.setJSON("data", body);
    return json({ ok: true }, 200);
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

export const config = { path: "/api/data-save" };
