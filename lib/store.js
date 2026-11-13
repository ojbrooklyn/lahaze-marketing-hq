// Shared storage helpers: Upstash Redis over its REST API (Vercel's "Upstash for Redis" / KV integration).
// Each collection is a Redis hash: hq:<collection> -> { id: JSON document }.
import seed from "./seed.js";

export const COLS = ["projects", "decisions", "requests", "updates", "vendors", "dates"];
const URL_ = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL || "";
const TOKEN = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN || "";
export const hasStorage = Boolean(URL_ && TOKEN);
export { seed };

async function redis(path, body) {
  const r = await fetch(URL_.replace(/\/$/, "") + path, {
    method: "POST",
    headers: { Authorization: "Bearer " + TOKEN, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error("storage " + r.status);
  return r.json();
}
export const cmd = (args) => redis("", args).then((j) => j.result);
export const pipe = (cmds) => redis("/pipeline", cmds);

export async function ensureSeeded() {
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

// One-time data changes, each applied once per database.
async function migrate() {
  // 2026-11-13: link the 2027 marketing plan to Brand Guidelines v3 (OJ's request).
  if ((await cmd(["SET", "hq:mig:plan-brand-link", "1", "NX"])) === "OK") {
    const raw = await cmd(["HGET", "hq:projects", "plan-2027"]);
    if (raw) {
      const p = JSON.parse(raw);
      const r = Array.isArray(p.related) ? p.related : [];
      if (!r.includes("brand-guidelines-v3")) { p.related = r.concat(["brand-guidelines-v3"]); await cmd(["HSET", "hq:projects", "plan-2027", JSON.stringify(p)]); }
    }
  }
}

export async function loadAll() {
  if (!hasStorage) return seed;
  await ensureSeeded();
  await migrate();
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
