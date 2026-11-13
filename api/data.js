// Marketing HQ data API.
// Storage: Upstash Redis over its REST API (what Vercel's "Upstash for Redis" / KV integration provides).
// Each collection is a Redis hash: hq:<collection> -> { id: JSON document }.
// Without storage env vars the API serves the seed data read-only.
import seed from "../lib/seed.js";

const COLS = ["projects", "decisions", "requests", "updates", "vendors", "dates"];
const URL_ = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL || "";
const TOKEN = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN || "";
const EDIT_KEY = process.env.EDIT_KEY || "";
const MAX_DOC = 20000;

async function redis(path, body) {
  const r = await fetch(URL_.replace(/\/$/, "") + path, {
    method: "POST",
    headers: { Authorization: "Bearer " + TOKEN, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error("storage " + r.status);
  return r.json();
}
const cmd = (args) => redis("", args).then((j) => j.result);
const pipe = (cmds) => redis("/pipeline", cmds);

async function ensureSeeded() {
  const first = await cmd(["SET", "hq:seeded", new Date().toISOString(), "NX"]);
  if (first !== "OK") return;
  const cmds = [];
  for (const c of COLS) {
    const docs = seed[c] || [];
    if (!docs.length) continue;
    const args = ["HSET", "hq:" + c];
    for (const d of docs) { const { id, ...rest } = d; args.push(id, JSON.stringify(rest)); }
    cmds.push(args);
  }
  if (cmds.length) await pipe(cmds);
}

async function loadAll() {
  const res = await pipe(COLS.map((c) => ["HGETALL", "hq:" + c]));
  const out = {};
  COLS.forEach((c, i) => {
    const flat = res[i].result || [];
    const docs = [];
    for (let k = 0; k < flat.length; k += 2) {
      try { docs.push({ ...JSON.parse(flat[k + 1]), id: flat[k] }); } catch {}
    }
    out[c] = docs;
  });
  return out;
}

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
  const storage = Boolean(URL_ && TOKEN);
  try {
    if (req.method === "GET") {
      if (!storage) return res.status(200).json({ storage: false, needsKey: false, data: seed });
      await ensureSeeded();
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
