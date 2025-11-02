"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";

type Story = {
  id: number;
  user_id: string;
  title: string;
  subject: string | null;
  image_path: string | null;
  likes: number | null;
  original_story_id: number | null;
  created_at: string;
};

export default function StoriesPage() {
  const [userId, setUserId] = useState<string | null>(null);
  const [email, setEmail] = useState<string | null>(null);

  const [title, setTitle] = useState("");
  const [subject, setSubject] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  const [stories, setStories] = useState<Story[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getUser();
      setUserId(data.user?.id ?? null);
      setEmail(data.user?.email ?? null);
      await refresh();
    })();
  }, []);

  async function refresh() {
    const { data, error } = await supabase
      .from("stories")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(50);
    if (!error && data) setStories(data as Story[]);
  }

  function onPickFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0] ?? null;
    setFile(f || null);
    if (f) setPreviewUrl(URL.createObjectURL(f));
    else setPreviewUrl(null);
  }

  function extFromName(name: string) {
    const dot = name.lastIndexOf(".");
    return dot >= 0 ? name.slice(dot) : "";
  }

  async function uploadToStorage(): Promise<string | null> {
    if (!file || !userId) return null;
    const path = `stories/${userId}/${Date.now()}${extFromName(file.name) || ".jpg"}`;
    const { error } = await supabase.storage.from("stories").upload(path, file, {
      cacheControl: "3600",
      upsert: false,
    });
    if (error) {
      alert("Upload failed: " + error.message);
      return null;
    }
    return path; // we store the storage path in DB
  }

  async function createStory(e: React.FormEvent) {
    e.preventDefault();
    if (!userId) {
      alert("Please sign in first.");
      return;
    }
    setLoading(true);
    try {
      let image_path: string | null = null;
      if (file) {
        image_path = await uploadToStorage();
        if (!image_path) return; // upload failed
      }

      const { error } = await supabase.from("stories").insert({
        user_id: userId,
        title: title.trim(),
        subject: subject.trim() || null,
        image_path,
      });
      if (error) {
        alert("Could not post: " + error.message);
        return;
      }
      // reset
      setTitle(""); setSubject(""); setFile(null); setPreviewUrl(null);
      await refresh();
    } finally {
      setLoading(false);
    }
  }

  async function likeStory(id: number) {
    // With current RLS, only owner can update; we’ll open likes to all later.
    const { data } = await supabase.from("stories").select("likes").eq("id", id).single();
    const next = (data?.likes ?? 0) + 1;
    const { error } = await supabase.from("stories").update({ likes: next }).eq("id", id);
    if (!error) await refresh();
  }

  async function repostStory(s: Story) {
    if (!userId) { alert("Please sign in first."); return; }
    const { error } = await supabase.from("stories").insert({
      user_id: userId,
      title: s.title,
      subject: s.subject,
      image_path: s.image_path,
      original_story_id: s.id,
    });
    if (!error) await refresh();
  }

  function publicUrl(path: string | null) {
    if (!path) return null;
    // get a public URL for the storage object
    const { data } = supabase.storage.from("stories").getPublicUrl(path);
    return data.publicUrl || null;
  }

  return (
    <main className="max-w-2xl mx-auto p-6 space-y-6">
      <h1 className="text-2xl font-semibold">Stories</h1>
      {email ? <p className="text-sm">Signed in as <b>{email}</b></p> : <p className="text-sm text-red-600">Not signed in</p>}

      <form onSubmit={createStory} className="space-y-3 border rounded-2xl p-4">
        <Input placeholder="Title *" value={title} onChange={e => setTitle(e.target.value)} required />
        <Input placeholder="Subject (Math, English, Urdu…)" value={subject} onChange={e => setSubject(e.target.value)} />
        <div className="space-y-2">
          <input type="file" accept="image/*" onChange={onPickFile} />
          {previewUrl && (
            <img
              src={previewUrl}
              alt="preview"
              className="rounded-lg max-h-56 object-cover"
            />
          )}
        </div>
        <Button type="submit" disabled={loading} className="w-full">
          {loading ? "Posting..." : "Post story"}
        </Button>
      </form>

      <section className="space-y-3">
        {stories.length === 0 && <p className="text-sm text-gray-600">No stories yet.</p>}
        {stories.map(s => {
          const img = publicUrl(s.image_path);
          return (
            <Card key={s.id} className="p-4 space-y-2">
              <div className="flex items-center justify-between">
                <h3 className="font-medium">{s.title}</h3>
                <span className="text-xs text-gray-500">{new Date(s.created_at).toLocaleString()}</span>
              </div>
              {s.subject && <p className="text-sm">Subject: {s.subject}</p>}
              {img && <img src={img} alt={s.title} className="rounded-lg max-h-56 object-cover" />}
              <div className="flex items-center gap-2">
                <Button size="sm" variant="secondary" onClick={() => likeStory(s.id)}>👍 Like ({s.likes ?? 0})</Button>
                <Button size="sm" onClick={() => repostStory(s)}>🔁 Repost</Button>
              </div>
              {s.original_story_id && <p className="text-xs text-gray-500">Repost of #{s.original_story_id}</p>}
            </Card>
          );
        })}
      </section>
    </main>
  );
}
