import OpenAI from "openai";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export type RetrievedChunk = {
  chunk_id: number; doc_id: number; subject: string; topic_slug: string;
  content: string; vec_score: number|null; fts_score: number|null; final_score: number;
};

export async function getQueryEmbeddingOrNull(text: string) {
  try {
    const e = await openai.embeddings.create({ model: "text-embedding-3-small", input: text });
    return e.data[0].embedding;
  } catch { return null; }
}

export async function hybridSearch(query: string, subject: string, k = 6): Promise<RetrievedChunk[]> {
  const emb = await getQueryEmbeddingOrNull(query);
  const { data, error } = await supabase.rpc("hybrid_kb_search", {
    q_embedding: emb, q_text: query, q_subject: subject, k
  });
  if (error) throw error;
  return (data ?? []) as RetrievedChunk[];
}
