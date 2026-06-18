// Lädt Prompts + Profil aus Netlify Blobs (serverseitig, gehört zur eigenen Seite).
// Gibt {} zurück, wenn noch nichts gespeichert wurde.
import { getStore } from "@netlify/blobs";

export default async (req) => {
  try {
    const store = getStore("maestra-userdata");
    const data = await store.get("data", { type: "json" });
    return json(data || {}, 200);
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

export const config = { path: "/api/data-load" };
