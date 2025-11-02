import fs from "fs";
import path from "path";
import OpenAI from "openai";
import { createClient } from "@supabase/supabase-js";

const KB_ROOT = path.join(process.cwd(), "kb");

// ---- Read env safely (no TS non-null assertions) ----
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE;
const openaiKey = process.env.OPENAI_API_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  console.error("Missing env: NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE");
  process.exit(1);
}

// ---- Supabase (service role for server-side inserts) ----
const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false }
});

// ---- OpenAI (may have zero quota; we handle it) ----
const openai = new OpenAI({ apiKey: openaiKey });

// chunker (~900 chars)
function chunkText(txt, max = 900) {
  const out = [];
  let buf = "";
  for (const para of txt.split(/\n{2,}/)) {
    if ((buf + "\n\n" + para).length > max) {
      if (buf) out.push(buf.trim());
      buf = para;
    } else {
      buf = buf ? buf + "\n\n" + para : para;
    }
  }
  if (buf.trim()) out.push(buf.trim());
  return out;
}

async function embedBatch(chunks) {
  if (!openaiKey) {
    // no key provided — skip embeddings
    return chunks.map(() => null);
  }
  try {
    const resp = await openai.embeddings.create({
      model: "text-embedding-3-small",
      input: chunks
    });
    return resp.data.map(d => d.embedding);
  } catch (e) {
    console.warn("Embedding failed; continuing without vectors:", e?.message ?? e);
    return chunks.map(() => null);
  }
}

async function upsertDoc(subject, topic_slug, title) {
  const { data, error } = await supabase
    .from("kb_docs")
    .insert({ subject, topic_slug, title })
    .select("id")
    .single();
  if (error) throw error;
  return data.id;
}

async function deleteOldChunks(doc_id) {
  const { error } = await supabase.from("kb_chunks").delete().eq("doc_id", doc_id);
  if (error) throw error;
}

async function insertChunks(doc_id, chunks, embeddings) {
  const rows = chunks.map((content, i) => ({
    doc_id,
    chunk_index: i,
    content,
    embedding: embeddings[i] ?? null
  }));
  const { error } = await supabase.from("kb_chunks").insert(rows);
  if (error) throw error;
}

async function ingestFile(subject, filePath) {
  const md = fs.readFileSync(filePath, "utf8");
  const base = path.basename(filePath).replace(/\.md$/i, "");
  const topic_slug = base.toLowerCase().replace(/[^a-z0-9\-]+/g, "-");
  const title = base.replace(/[-_]/g, " ");

  const chunks = chunkText(md);
  if (!chunks.length) return { inserted: 0 };

  const doc_id = await upsertDoc(subject, topic_slug, title);
  await deleteOldChunks(doc_id);

  const embeddings = await embedBatch(chunks); // may be all nulls
  await insertChunks(doc_id, chunks, embeddings);
  return { inserted: chunks.length };
}

async function main() {
  if (!fs.existsSync(KB_ROOT)) {
    console.log("No kb/ folder. Create kb/{subject}/*.md then re-run.");
    process.exit(0);
  }

  const subjects = fs.readdirSync(KB_ROOT).filter(d => fs.statSync(path.join(KB_ROOT, d)).isDirectory());
  if (!subjects.length) {
    console.log("No subjects under kb/. Create kb/math etc.");
    process.exit(0);
  }

  let total = 0;
  for (const subject of subjects) {
    const dir = path.join(KB_ROOT, subject);
    const files = fs.readdirSync(dir).filter(f => f.endsWith(".md"));
    for (const f of files) {
      const full = path.join(dir, f);
      const res = await ingestFile(subject, full);
      console.log(`→ ${subject}/${f.replace(/\.md$/,"")}: ${res.inserted} chunks`);
      total += res.inserted;
    }
  }
  console.log(`Done ingesting KB. Inserted ${total} chunks.`);
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
