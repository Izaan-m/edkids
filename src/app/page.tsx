"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function Home() {
  const [email, setEmail] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getUser();
      setEmail(data.user?.email ?? null);
    })();
  }, []);

  async function logout() {
    await supabase.auth.signOut();
    location.reload();
  }

  return (
    <main className="min-h-screen p-8 flex flex-col items-center justify-center gap-4">
      <h1 className="text-3xl font-semibold">Edkids</h1>

      {!email ? (
        <>
          <p>Welcome! Please log in to continue.</p>
          <Link href="/login">
            <Button>Go to Login</Button>
          </Link>
        </>
      ) : (
        <>
          <p>You’re signed in as <b>{email}</b></p>
          <div className="flex gap-2">
            <Button onClick={logout}>Logout</Button>
            <Link href="/login">
              <Button variant="secondary">Switch account</Button>
            </Link>
          </div>
        </>
      )}
    </main>
  );
}
