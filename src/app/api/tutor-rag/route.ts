import { NextRequest, NextResponse } from "next/server";
import { hybridSearch } from "@/lib/retriever";

type TutorRagRequest = {
  subject: "math"|"english"|"urdu"|"science"|"islamiat";
  language?: "en"|"ur";
  grade?: "K"|"1"|"2"|"3"|"4"|"5";
  input: string;
  mode?: "auto"|"chat"|"quiz"|"flashcards";
};

const POLICY = `
You are "EdKids RAG Tutor", a K-5, kid-safe teacher. Rules:
- Short sentences, simple words, warm & cheerful.
- Bilingual: use requested language ("en" or "ur").
- Stay age-appropriate; refuse adult topics and gently redirect.
- Use the retrieved notes ONLY (they are kid-safe content).
- Return JSON only with this shape:

{
  "intent": "explain" | "practice" | "encourage",
  "explanation_kid": "one or two short paragraphs",
  "hints": ["short hint 1","short hint 2"],
  "quiz": [{ "q": "question text", "a": "answer" }],
  "flashcards": [{ "front": "text", "back": "text" }],
  "followups": ["small next step 1","small next step 2"]
}
`;

function percentOfQuestionToAnswer(q: string): string | null {
  const m = q.match(/(\d+(?:\.\d+)?)\s*%\s*of\s*(\d+(?:\.\d+)?)/i);
  if (!m) return null;
  const pct = parseFloat(m[1]);
  const num = parseFloat(m[2]);
  const ans = (pct / 100) * num;
  return Number.isInteger(ans) ? String(ans) : ans.toFixed(2);
}

function fallbackFromChunks(chunks: {content:string}[], language: "en"|"ur") {
  const text = chunks.map(c => c.content).join("\n\n");

  const flashcards: {front:string;back:string}[] = [];
  const qaRegex = /Q:\s*(.+?)\s*A:\s*(.+?)(?:\n|$)/gis;
  let m;
  while ((m = qaRegex.exec(text)) && flashcards.length < 6) {
    flashcards.push({ front: m[1].trim(), back: m[2].trim() });
  }

  const quiz: { q: string; a: string }[] = [];
  for (const l of text.split(/\r?\n/).map(s => s.trim())) {
    if (/[?]\s*$/.test(l) && /% of/i.test(l)) {
      const ans = percentOfQuestionToAnswer(l.replace(/=.*$/, ""));
      if (ans) quiz.push({ q: l, a: ans });
      if (quiz.length >= 5) break;
    }
  }

  const explanation_kid = language === "ur"
    ? "چلو آسان طریقے سے سمجھیں: فیصد کا مطلب سو میں سے ہے۔ مثال: 10% یعنی ہر سو میں دس۔"
    : "Let’s learn it simply: Percent means out of 100. For example, 10% means 10 out of every 100.";
  const hints = language === "ur"
    ? ["10% کے لیے عدد کو 10 پر تقسیم کریں۔", "5% = 10% کا آدھا؛ 1% = 100 پر تقسیم۔"]
    : ["10% = divide by 10.", "5% is half of 10%; 1% = divide by 100."];
  const followups = language === "ur"
    ? ["مزید مثالیں آزمائیں؟", "ننھی سی پزل کھیلیں؟"]
    : ["Try more examples?", "Want a tiny puzzle?"];

  return { intent: "explain", explanation_kid, hints, quiz, flashcards, followups };
}

function buildPrompt(chunks: {content:string}[], language: "en"|"ur", grade: string, child: string) {
  const joined = chunks.map((c,i)=>`[Chunk ${i+1}]\n${c.content}`).join("\n\n");
  return [
    { role: "system", content: POLICY },
    { role: "system", content: `Language=${language}, Grade=${grade}` },
    { role: "system", content: `Retrieved notes:\n${joined}` },
    { role: "user", content: `Child said: "${child}"\nUse the notes to help. Generate explanation, 2 tiny hints, 3 quiz Q&A, and 3 flashcards.` }
  ];
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as TutorRagRequest;
    const subject = body.subject;
    const language = body.language ?? "en";
    const grade = body.grade ?? "3";
    const child = body.input?.trim() ?? "";

    const chunks = await hybridSearch(child || "basics", subject, 6);

    if (!chunks.length) {
      return NextResponse.json({
        intent: "encourage",
        explanation_kid: language === "ur"
          ? "ہم اس موضوع کے نوٹس نہیں ڈھونڈ سکے۔ آؤ ایک آسان قدم سے شروع کریں!"
          : "I couldn't find notes yet. Let's start with a simple step!",
        hints: [],
        quiz: [],
        flashcards: [],
        followups: [ language==="ur" ? "کیا تم ضرب یا فیصد سیکھنا چاہتے ہو؟" : "Would you like multiplication or percentages?" ]
      });
    }

    try {
      const rsp = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          model: "gpt-4o-mini",
          messages: buildPrompt(chunks, language as any, grade, child),
          response_format: {
            type: "json_schema",
            json_schema: {
              name: "tutor_rag_resp",
              schema: {
                type: "object",
                properties: {
                  intent: { type: "string", enum: ["explain","practice","encourage"] },
                  explanation_kid: { type: "string" },
                  hints: { type: "array", items: { type: "string" } },
                  quiz: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: { q: {type:"string"}, a: {type:"string"} },
                      required: ["q","a"], additionalProperties: false
                    }
                  },
                  flashcards: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: { front: {type:"string"}, back: {type:"string"} },
                      required: ["front","back"], additionalProperties: false
                    }
                  },
                  followups: { type: "array", items: { type: "string" } }
                },
                required: ["intent","explanation_kid","hints","quiz","flashcards","followups"],
                additionalProperties: false
              }
            }
          },
          temperature: 0.5
        })
      });

      if (!rsp.ok) throw new Error(`OpenAI error ${rsp.status}`);
      const data = await rsp.json();
      const content = data?.choices?.[0]?.message?.content;
      if (!content) throw new Error("No OpenAI content");
      return NextResponse.json(JSON.parse(content));
    } catch {
      const fb = fallbackFromChunks(chunks, language as any);
      return NextResponse.json(fb);
    }
  } catch (err: any) {
    return NextResponse.json({ error: err.message ?? "Error" }, { status: 500 });
  }
}
