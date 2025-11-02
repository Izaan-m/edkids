"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export default function LoginPage() {
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [grade, setGrade] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setMsg(null);
    try {
      if (mode === "signin") {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        location.href = "/"; // go home
      } else {
        // Sign up
        const { data, error } = await supabase.auth.signUp({ email, password });
        if (error) throw error;

        // If email confirmations are OFF, we’ll have a session immediately
        const userId = data.user?.id;
        if (userId) {
          const { error: insertErr } = await supabase
            .from("profiles")
            .insert({ id: userId, name: name || null, grade: grade || null });
          if (insertErr) console.warn("Profile insert warning:", insertErr.message);
        }
        setMsg("Account created! You can sign in now.");
        setMode("signin");
      }
    } catch (err: any) {
      setMsg(err.message || "Something went wrong.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen grid place-items-center p-6">
      <div className="w-full max-w-sm border rounded-2xl p-6 space-y-4">
        <div className="flex gap-2">
          <Button
            variant={mode === "signin" ? "default" : "secondary"}
            onClick={() => setMode("signin")}
          >
            Sign in
          </Button>
          <Button
            variant={mode === "signup" ? "default" : "secondary"}
            onClick={() => setMode("signup")}
          >
            Sign up
          </Button>
        </div>

        <form className="space-y-3" onSubmit={onSubmit}>
          {mode === "signup" && (
            <>
              <Input placeholder="Name (optional)" value={name} onChange={(e) => setName(e.target.value)} />
              <Input placeholder="Grade (optional)" value={grade} onChange={(e) => setGrade(e.target.value)} />
            </>
          )}
          <Input type="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          <Input type="password" placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} required />
          <Button className="w-full" type="submit" disabled={loading}>
            {loading ? "Please wait..." : mode === "signin" ? "Sign in" : "Create account"}
          </Button>
          {msg && <p className="text-sm text-center text-gray-600">{msg}</p>}
        </form>

        <p className="text-center text-sm">
          After sign in you’ll be redirected to Home. Use the Logout button there.
        </p>
      </div>
    </div>
  );
}
