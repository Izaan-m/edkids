"use client";

import { useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

type Q = {
  id: string;
  prompt: string;
  choices: string[];
  answer: string; // correct
};

const QUESTIONS: Q[] = [
  { id: "q1", prompt: "What is 3 + 4 ?", choices: ["5", "7", "8"], answer: "7" },
  { id: "q2", prompt: "What is 6 + 2 ?", choices: ["7", "8", "9"], answer: "8" },
  { id: "q3", prompt: "What is 1 + 5 ?", choices: ["5", "6", "7"], answer: "6" },
];

export default function AdditionPractice() {
  const [email, setEmail] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [picked, setPicked] = useState<Record<string, string>>({});
  const [result, setResult] = useState<{correct: number; total: number} | null>(null);
  const [saving, setSaving] = useState(false);
  const startTs = useRef<number>(Date.now());

  // get user
  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getUser();
      setEmail(data.user?.email ?? null);
      setUserId(data.user?.id ?? null);
    })();
  }, []);

  function choose(qid: string, choice: string) {
    setPicked(p => ({ ...p, [qid]: choice }));
  }

  async function submit() {
    if (!userId) {
      alert("Please log in first.");
      return;
    }
    const elapsed = Math.round((Date.now() - startTs.current) / 1000);

    // compute score
    let correct = 0;
    for (const q of QUESTIONS) {
      if (picked[q.id] === q.answer) correct++;
    }
    setResult({ correct, total: QUESTIONS.length });

    // write attempts (one row per question)
    setSaving(true);
    const rows = QUESTIONS.map(q => ({
      user_id: userId,
      subject: "math",
      topic: "single_digit_addition",
      is_correct: picked[q.id] === q.answer,
      time_spent_s: elapsed, // rough total time for the set
    }));
    const { error } = await supabase.from("attempts").insert(rows);
    setSaving(false);
    if (error) {
      console.error(error);
      alert("Could not save attempts: " + error.message);
    } else {
      alert("Saved! 🎉");
    }
  }

  return (
    <main className="max-w-xl mx-auto p-6 space-y-6">
      <h1 className="text-2xl font-semibold">Single-digit Addition</h1>
      {email ? <p className="text-sm">Signed in as <b>{email}</b></p> : <p className="text-sm text-red-600">You are not signed in.</p>}

      {QUESTIONS.map(q => (
        <Card key={q.id} className="p-4 space-y-3">
          <div className="font-medium">{q.prompt}</div>
          <div className="flex flex-wrap gap-2">
            {q.choices.map(c => (
              <Button
                key={c}
                variant={picked[q.id] === c ? "default" : "secondary"}
                onClick={() => choose(q.id, c)}
              >
                {c}
              </Button>
            ))}
          </div>
        </Card>
      ))}

      <Button onClick={submit} disabled={saving} className="w-full">
        {saving ? "Saving..." : "Submit answers"}
      </Button>

      {result && (
        <p className="text-center">
          Score: <b>{result.correct}</b> / {result.total}
        </p>
      )}
    </main>
  );
}
