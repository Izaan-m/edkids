"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";

type TutorResp = {
  intent: "explain"|"practice"|"encourage";
  explanation_kid: string;
  hints: string[];
  quiz: { q: string; a: string }[];
  flashcards: { front: string; back: string }[];
  followups: string[];
};

export default function TutorPage() {
  const [subject, setSubject] = useState<"math"|"english"|"urdu"|"science"|"islamiat">("math");
  const [language, setLanguage] = useState<"en"|"ur">("en");
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<{role:"user"|"assistant"; text:string}[]>([]);
  const [listening, setListening] = useState(false);
  const recogRef = useRef<SpeechRecognition|null>(null);

  // Quiz/flashcard state from last RAG response
  const [quiz, setQuiz] = useState<{ q: string; a: string }[]>([]);
  const [currentQ, setCurrentQ] = useState<number>(0);
  const [answer, setAnswer] = useState("");
  const [feedback, setFeedback] = useState<string>("");

  const [cards, setCards] = useState<{ front: string; back: string }[]>([]);
  const [cardIdx, setCardIdx] = useState<number>(0);
  const [showBack, setShowBack] = useState<boolean>(false);

  // Init browser speech recognition
  useEffect(() => {
    const SR = (window as any).webkitSpeechRecognition || (window as any).SpeechRecognition;
    if (SR) {
      const recog = new SR();
      recog.lang = language === "ur" ? "ur-PK" : "en-US";
      recog.interimResults = false;
      recog.maxAlternatives = 1;
      recog.onresult = (e: SpeechRecognitionEvent) => {
        const text = e.results[0][0].transcript;
        setInput(text);
      };
      recog.onend = () => setListening(false);
      recogRef.current = recog;
    }
  }, [language]);

  function ttsSpeak(text: string) {
    if (!("speechSynthesis" in window)) return;
    const u = new SpeechSynthesisUtterance(text);
    u.lang = language === "ur" ? "ur-PK" : "en-US";
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(u);
  }

  function startMic() {
    if (!recogRef.current) return alert("Speech recognition not supported in this browser.");
    setListening(true);
    recogRef.current!.start();
  }

  async function askTutor(text: string) {
    setMessages(m => [...m, { role: "user", text }]);
    setInput("");

    const rsp = await fetch("/api/tutor-rag", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ subject, language, input: text })
    });

    const data = (await rsp.json()) as TutorResp | { error: string };
    if ((data as any).error) {
      const err = (data as any).error;
      setMessages(m => [...m, { role: "assistant", text: "Error: " + err }]);
      return;
    }

    const d = data as TutorResp;
    // store quiz & flashcards
    setQuiz(d.quiz ?? []);
    setCurrentQ(0);
    setFeedback("");
    setAnswer("");

    setCards(d.flashcards ?? []);
    setCardIdx(0);
    setShowBack(false);

    const reply = d.explanation_kid + (d.followups?.length ? "\n\nTry: " + d.followups[0] : "");
    setMessages(m => [...m, { role: "assistant", text: reply }]);
    ttsSpeak(reply);
  }

  function checkAnswer() {
    if (!quiz.length) return;
    const correct = (answer ?? "").trim().toLowerCase() === (quiz[currentQ].a ?? "").trim().toLowerCase();
    if (correct) {
      const line = language === "ur" ? "شاباش! بالکل درست۔" : "Great job! That’s correct.";
      setFeedback(line);
      ttsSpeak(line);
    } else {
      const hint = language === "ur"
        ? "ابھی نہیں — ایک چھوٹا اشارہ: آدھا، دس فیصد یا ایک فیصد سوچیں۔"
        : "Not yet — tiny hint: think halves, tens, or ones.";
      setFeedback(hint);
      ttsSpeak(hint);
    }
  }

  function nextQuestion() {
    if (!quiz.length) return;
    const next = (currentQ + 1) % quiz.length;
    setCurrentQ(next);
    setAnswer("");
    setFeedback("");
  }

  const currentCard = cards[cardIdx];

  return (
    <main className="max-w-2xl mx-auto p-6 space-y-6">
      <h1 className="text-2xl font-semibold">EdKids Tutor</h1>

      <div className="flex gap-2">
        <select className="border rounded px-2 py-1" value={subject} onChange={e => setSubject(e.target.value as any)}>
          <option value="math">Math</option>
          <option value="english">English</option>
          <option value="urdu">Urdu</option>
          <option value="science">Science</option>
          <option value="islamiat">Islamiat</option>
        </select>
        <select className="border rounded px-2 py-1" value={language} onChange={e => setLanguage(e.target.value as any)}>
          <option value="en">English</option>
          <option value="ur">Urdu</option>
        </select>
      </div>

      {/* Chat area */}
      <section className="border rounded-2xl p-4 space-y-2">
        {messages.length === 0 && <p className="text-sm text-gray-500">Say or type a question to start…</p>}
        {messages.map((m, i) => (
          <div key={i} className={m.role === "user" ? "text-right" : "text-left"}>
            <div className={"inline-block px-3 py-2 rounded-xl " + (m.role === "user" ? "bg-gray-200" : "bg-gray-100")}>
              {m.text}
            </div>
          </div>
        ))}
      </section>

      {/* Input row */}
      <div className="flex gap-2">
        <input
          className="flex-1 border rounded px-3 py-2"
          placeholder={language === "ur" ? "یہاں لکھیں…" : "Type here…"}
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && input.trim()) askTutor(input.trim()); }}
        />
        <Button onClick={() => input.trim() && askTutor(input.trim())}>Send</Button>
        <Button variant={listening ? "secondary" : "default"} onClick={startMic}>
          {listening ? "Listening…" : "🎤 Speak"}
        </Button>
      </div>

      {/* Quiz block */}
      {quiz.length > 0 && (
        <section className="border rounded-2xl p-4 space-y-3">
          <h2 className="font-semibold">Quick Quiz</h2>
          <p className="text-sm">{quiz[currentQ].q}</p>
          <div className="flex gap-2">
            <input
              className="flex-1 border rounded px-3 py-2"
              placeholder={language === "ur" ? "جواب لکھیں…" : "Type your answer…"}
              value={answer}
              onChange={e => setAnswer(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") checkAnswer(); }}
            />
            <Button onClick={checkAnswer}>Check</Button>
            <Button variant="secondary" onClick={nextQuestion}>Next</Button>
          </div>
          {!!feedback && <p className="text-sm">{feedback}</p>}
        </section>
      )}

      {/* Flashcards block */}
      {currentCard && (
        <section className="border rounded-2xl p-4 space-y-3">
          <h2 className="font-semibold">Flashcards</h2>
          <div
            className="border rounded-xl p-6 text-center cursor-pointer select-none"
            onClick={() => setShowBack(!showBack)}
            title="Click to flip"
          >
            <div className="text-lg">
              {showBack ? currentCard.back : currentCard.front}
            </div>
          </div>
          <div className="flex gap-2">
            <Button
              variant="secondary"
              onClick={() => { setCardIdx((cardIdx - 1 + cards.length) % cards.length); setShowBack(false); }}
            >
              ◀ Prev
            </Button>
            <Button
              onClick={() => { setCardIdx((cardIdx + 1) % cards.length); setShowBack(false); }}
            >
              Next ▶
            </Button>
          </div>
          <p className="text-xs text-gray-500">Tap the card to flip.</p>
        </section>
      )}

      <p className="text-xs text-gray-500">
        Kid-safe: no personal data, no adult topics. The tutor may gently refuse and redirect if off-topic.
      </p>
    </main>
  );
}
