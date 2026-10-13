"use client";

import { useEffect, useState } from "react";
import { scents } from "@/lib/scents";
import { links } from "@/lib/links";
import { driver } from "@/lib/lenisDriver";

type Option = { label: string; picks: string[] };

const questions: { q: string; options: Option[] }[] = [
  {
    q: "What does your day usually look like?",
    options: [
      { label: "Lectures, errands, always moving", picks: ["powerful-defense", "turbo"] },
      { label: "Hot, crowded, outside all day", picks: ["cool-breeze", "fresh-mint"] },
      { label: "Calm and low-key", picks: ["sensitive-skin", "whitening"] },
      { label: "Dressed up, going out later", picks: ["romantic-charm", "whitening"] },
    ],
  },
  {
    q: "Pick a vibe.",
    options: [
      { label: "Cold and sharp", picks: ["fresh-mint", "cool-breeze"] },
      { label: "Dark and bold", picks: ["turbo", "powerful-defense"] },
      { label: "Soft and sweet", picks: ["romantic-charm", "sensitive-skin"] },
      { label: "Clean and bright", picks: ["whitening", "cool-breeze"] },
    ],
  },
  {
    q: "What matters most to you?",
    options: [
      { label: "All-day protection", picks: ["powerful-defense", "turbo"] },
      { label: "Gentle on my skin", picks: ["sensitive-skin", "whitening"] },
      { label: "Smelling amazing", picks: ["romantic-charm", "fresh-mint"] },
      { label: "Staying cool and dry", picks: ["cool-breeze", "fresh-mint"] },
    ],
  },
];

function pickWinner(scores: Record<string, number>) {
  let best = scents[0];
  let bestScore = -1;
  for (const s of scents) {
    const v = scores[s.slug] ?? 0;
    if (v > bestScore) {
      best = s;
      bestScore = v;
    }
  }
  return best;
}

/** "Find your scent" quiz. Any element with a data-open-quiz attribute opens it. */
export default function Quiz() {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(0);
  const [scores, setScores] = useState<Record<string, number>>({});

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      const t = (e.target as HTMLElement | null)?.closest("[data-open-quiz]");
      if (t) {
        e.preventDefault();
        setStep(0);
        setScores({});
        setOpen(true);
      }
    };
    document.addEventListener("click", onClick);
    return () => document.removeEventListener("click", onClick);
  }, []);

  useEffect(() => {
    if (!open) return;
    driver.lenis?.stop();
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
      driver.lenis?.start();
    };
  }, [open]);

  if (!open) return null;

  const done = step >= questions.length;
  const winner = done ? pickWinner(scores) : null;

  const answer = (o: Option) => {
    const next = { ...scores };
    o.picks.forEach((p) => {
      next[p] = (next[p] ?? 0) + 1;
    });
    setScores(next);
    setStep(step + 1);
  };

  const goTo = (slug: string) => {
    setOpen(false);
    setTimeout(() => {
      const el = document.getElementById(`scent-${slug}`);
      if (!el) return;
      if (driver.lenis) driver.lenis.scrollTo(el);
      else el.scrollIntoView({ behavior: "smooth" });
    }, 150);
  };

  return (
    <div
      className="quiz-overlay"
      role="dialog"
      aria-modal="true"
      aria-label="Find your TAG fragrance"
      onClick={(e) => {
        if (e.target === e.currentTarget) setOpen(false);
      }}
    >
      <div className="quiz-card">
        <button className="quiz-close" aria-label="Close" onClick={() => setOpen(false)}>
          ×
        </button>
        {!done || !winner ? (
          <>
            <div className="quiz-step">
              QUESTION {step + 1} / {questions.length}
            </div>
            <h3>{questions[Math.min(step, questions.length - 1)].q}</h3>
            <div className="quiz-options">
              {questions[Math.min(step, questions.length - 1)].options.map((o) => (
                <button key={o.label} onClick={() => answer(o)}>
                  {o.label}
                </button>
              ))}
            </div>
          </>
        ) : (
          <>
            <div className="quiz-step">YOUR MATCH</div>
            <h3>{winner.name}</h3>
            <p>{winner.description}</p>
            <div className="quiz-actions">
              <button className="btn-primary quiz-primary" onClick={() => goTo(winner.slug)}>
                See {winner.name}
              </button>
              <a className="quiz-link" href={links.jumia} target="_blank" rel="noopener noreferrer">
                Buy on Jumia
              </a>
              <button
                className="quiz-link"
                onClick={() => {
                  setStep(0);
                  setScores({});
                }}
              >
                Retake
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
