// Marketing HQ data API.
// Without storage env vars the API serves the seed data read-only.
import { COLS, hasStorage, cmd, loadAll, seed } from "../lib/store.js";

const EDIT_KEY = process.env.EDIT_KEY || "";
const MAX_DOC = 20000;

function newId() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 8); }
function clean(doc) {
  const o = {};
  if (doc && typeof doc === "object") for (const [k, v] of Object.entries(doc)) {
    if (k === "id" || k.startsWith("__")) continue;
    if (v === null || ["string", "number", "boolean"].includes(typeof v)) o[k] = v;
  }
  return o;
}

export default async function handler(req, res) {
  const storage = hasStorage;
  try {
    if (req.method === "GET") {
      if (!storage) return res.status(200).json({ storage: false, needsKey: false, data: seed });
      return res.status(200).json({ storage: true, needsKey: Boolean(EDIT_KEY), data: await loadAll() });
    }
    if (req.method !== "POST") return res.status(405).json({ error: "method" });
    if (!storage) return res.status(503).json({ error: "no_storage" });
    if (EDIT_KEY && req.headers["x-edit-key"] !== EDIT_KEY) return res.status(401).json({ error: "bad_key" });

    const b = typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body || {};
    if (b.op === "check") return res.status(200).json({ ok: true });
    if (!COLS.includes(b.col)) return res.status(400).json({ error: "collection" });
    const key = "hq:" + b.col;
    const id = typeof b.id === "string" && b.id.length < 120 ? b.id : "";

    if (b.op === "delete") { if (!id) return res.status(400).json({ error: "id" }); await cmd(["HDEL", key, id]); return res.status(200).json({ ok: true }); }

    let doc = clean(b.doc);
    if (b.op === "update") {
      if (!id) return res.status(400).json({ error: "id" });
      const prev = await cmd(["HGET", key, id]);
      doc = { ...(prev ? JSON.parse(prev) : {}), ...doc };
    } else if (b.op !== "set" && b.op !== "add") return res.status(400).json({ error: "op" });
    const docId = b.op === "add" ? newId() : id;
    if (!docId) return res.status(400).json({ error: "id" });
    const json = JSON.stringify(doc);
    if (json.length > MAX_DOC) return res.status(413).json({ error: "too_big" });
    await cmd(["HSET", key, docId, json]);
    return res.status(200).json({ ok: true, id: docId, doc: { ...doc, id: docId } });
  } catch (e) {
    return res.status(500).json({ error: "server", detail: String(e && e.message || e) });
  }
}
