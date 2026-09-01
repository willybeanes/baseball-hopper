"use client";

import { useEffect, useRef, useState } from "react";
import { COMPONENT_DESC } from "@/lib/hitting-plus/copy";
import BatterAnimation from "./BatterAnimation";

interface Step {
  id: string;
  kicker: string;
  title: string;
  body: string;
  stage?: 0 | 1 | 2 | 3;
}

const STEPS: Step[] = [
  {
    id: "intro",
    kicker: "How Hitting+ works",
    title: "A swing happens in order",
    body: "Decision+, Timing+, Contact+ and Power+ each grade one part of the same swing, in the sequence it actually happens: whether to swing, when the bat arrived, whether it found the ball, and what it brought when it did. Scroll to walk through each one.",
  },
  {
    id: "decision",
    kicker: "Step 1 of 4 · whether to swing",
    title: "Decision+",
    body: COMPONENT_DESC["Decision+"],
    stage: 0,
  },
  {
    id: "timing",
    kicker: "Step 2 of 4 · when the bat arrived",
    title: "Timing+",
    body: COMPONENT_DESC["Timing+"],
    stage: 1,
  },
  {
    id: "contact",
    kicker: "Step 3 of 4 · did the bat find it",
    title: "Contact+",
    body: COMPONENT_DESC["Contact+"],
    stage: 2,
  },
  {
    id: "power",
    kicker: "Step 4 of 4 · what the swing brought",
    title: "Power+",
    body: COMPONENT_DESC["Power+"],
    stage: 3,
  },
  {
    id: "hitting",
    kicker: "The headline",
    title: "Hitting+ is a refit, not an average",
    body: "Once all four are graded, Hitting+ is built by refitting a regression on all four component features together, not by averaging their scores. The components correlate with each other, so a simple average would count the same underlying tendency more than once. The refit weighs each one by how much it actually explains.",
  },
  {
    id: "scale",
    kicker: "Reading the numbers",
    title: "100 is average, 15 is one standard deviation",
    body: "Every grade here, including Hitting+ itself, is scaled the same way: 100 is league average and 15 points is one standard deviation. That is the same convention as wRC+ and Stuff+, so a 130 is exactly as far above average here as a 130 wRC+ is anywhere else.",
  },
  {
    id: "limits",
    kicker: "Two limitations",
    title: "What Hitting+ can't see",
    body: "It grades the swing, not the result, so it cannot see baserunning: a hitter who stretches singles into doubles beats his grade by design. And because bat speed carries the most weight in the fit, a hitter well below expected bat speed can grade in the bottom few percent even when his outcomes are league average.",
  },
];

const REVEAL_AT: Record<string, number> = {
  intro: 0,
  decision: 1,
  timing: 2,
  contact: 3,
  power: 4,
  hitting: 5,
  scale: 5,
  limits: 5,
};

const BARS = [
  { key: "decision", label: "Decision+", revealAt: 1, pct: 58 },
  { key: "timing", label: "Timing+", revealAt: 2, pct: 70 },
  { key: "contact", label: "Contact+", revealAt: 3, pct: 50 },
  { key: "power", label: "Power+", revealAt: 4, pct: 82 },
];

const HITTING_PCT = 74;

export default function HowItWorks() {
  const [activeId, setActiveId] = useState<string>(STEPS[0].id);
  const [animProgress, setAnimProgress] = useState(0);
  const stepRefs = useRef<Record<string, HTMLDivElement | null>>({});

  // Picks whichever step's center is closest to the viewport center, so overlapping
  // tall steps never leave two candidates racing an IntersectionObserver callback.
  // Also computes scroll progress (0→1) within that step for driving animations.
  useEffect(() => {
    function update() {
      const vh = window.innerHeight;
      const viewportCenter = vh / 2;
      let closestId: string | null = null;
      let closestDist = Infinity;
      let closestProgress = 0;
      for (const step of STEPS) {
        const el = stepRefs.current[step.id];
        if (!el) continue;
        const rect = el.getBoundingClientRect();
        const center = rect.top + rect.height / 2;
        const dist = Math.abs(center - viewportCenter);
        if (dist < closestDist) {
          closestDist = dist;
          closestId = step.id;
          // 0 when step center is at 80% down viewport, 1 when at 20% down
          closestProgress = Math.max(0, Math.min(1, (0.8 * vh - center) / (0.6 * vh)));
        }
      }
      if (closestId) {
        setActiveId(closestId);
        setAnimProgress(closestProgress);
      }
    }

    update();
    window.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update);
    return () => {
      window.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
    };
  }, []);

  const level = REVEAL_AT[activeId] ?? 0;
  const activeIndex = STEPS.findIndex((s) => s.id === activeId);

  return (
    <div className="rounded-2xl border border-[var(--panel-border)] bg-[var(--panel)] p-4 shadow-[var(--panel-shadow)] sm:p-6">
      <div className="lg:grid lg:grid-cols-[360px_1fr] lg:items-start lg:gap-8">
        <div className="mb-6 lg:sticky lg:top-0 lg:mb-0 lg:flex lg:h-screen lg:items-center">
          <div className="w-full">
            <DiagramPanel activeId={activeId} level={level} />
          </div>
        </div>

        <div className="relative space-y-[18vh] py-1 pb-[12vh] pl-6">
          <div className="absolute bottom-0 left-[3px] top-2 w-px bg-[var(--rule)]" />
          {STEPS.map((s, sIndex) => {
            const active = s.id === activeId;
            const passed = REVEAL_AT[s.id] <= level;
            const stepProgress = sIndex < activeIndex ? 1 : sIndex === activeIndex ? animProgress : 0;
            return (
              <div
                key={s.id}
                data-step-id={s.id}
                ref={(el) => {
                  stepRefs.current[s.id] = el;
                }}
                className="relative scroll-mt-24"
              >
                <span
                  className="absolute -left-6 top-1.5 h-[7px] w-[7px] rounded-full border transition-colors duration-300"
                  style={{
                    background: passed ? "var(--accent)" : "var(--panel)",
                    borderColor: passed ? "var(--accent)" : "var(--dimmer)",
                  }}
                />
                <p
                  className="mb-2 text-[11px] font-bold uppercase tracking-[0.14em] transition-colors duration-300"
                  style={{ color: active ? "var(--accent)" : "var(--dimmer)" }}
                >
                  {s.kicker}
                </p>
                <h3 className="mb-3 text-2xl font-bold sm:text-[28px]">{s.title}</h3>
                <p className="max-w-[52ch] text-[15px] leading-relaxed text-[var(--dim)]">{s.body}</p>
                {s.stage !== undefined && (
                  <BatterAnimation stage={s.stage} progress={stepProgress} label={`${s.title}: ${s.kicker}`} />
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function DiagramPanel({ activeId, level }: { activeId: string; level: number }) {
  return (
    <div className="rounded-[14px] border border-[var(--rule)] bg-[var(--track)] p-5">
      <div className="space-y-4">
        {BARS.map((b, i) => {
          const revealed = level >= b.revealAt;
          return (
            <div key={b.key} className="transition-opacity duration-500 motion-reduce:transition-none" style={{ opacity: revealed ? 1 : 0.35 }}>
              <div className="mb-1.5 flex items-baseline gap-2">
                <span
                  className="inline-block h-[8px] w-[8px] rounded-full border"
                  style={{
                    background: revealed ? "var(--accent)" : "transparent",
                    borderColor: revealed ? "var(--accent)" : "var(--dimmer)",
                  }}
                />
                <span className="text-[13px] font-semibold">{b.label}</span>
                <span className="ml-auto text-[11px] tabular-nums text-[var(--dimmer)]">{i + 1}</span>
              </div>
              <div className="relative h-[8px] overflow-hidden rounded-full bg-white">
                <span
                  className="gauge-fill absolute bottom-0 left-0 top-0 rounded-full bg-[var(--accent)]"
                  style={{ width: revealed ? `${b.pct}%` : "0%", transition: "width 900ms ease-out" }}
                />
              </div>
            </div>
          );
        })}
      </div>

      <div className="my-4 border-t border-dashed border-[var(--rule)]" />

      <div className="transition-opacity duration-500 motion-reduce:transition-none" style={{ opacity: level >= 5 ? 1 : 0.35 }}>
        <div className="mb-1.5 flex items-baseline gap-2">
          <span className="text-[13px] font-bold">Hitting+</span>
          <span className="ml-auto text-[11px] text-[var(--dimmer)]">refit, not averaged</span>
        </div>
        <div className="relative h-[12px] overflow-hidden rounded-full bg-white">
          <span
            className="gauge-fill absolute bottom-0 left-0 top-0 rounded-full bg-[var(--text)]"
            style={{ width: level >= 5 ? `${HITTING_PCT}%` : "0%", transition: "width 900ms ease-out" }}
          />
        </div>
      </div>

      {(activeId === "scale" || activeId === "limits") && (
        <div className="mt-5 border-t border-[var(--rule)] pt-4">
          <div className="relative h-[36px]">
            <div className="absolute left-0 right-0 top-[16px] h-px bg-[var(--rule)]" />
            {[70, 85, 100, 115, 130].map((v) => (
              <div key={v} className="absolute top-0 flex -translate-x-1/2 flex-col items-center" style={{ left: `${((v - 70) / 60) * 100}%` }}>
                <span className={`text-[11px] font-semibold tabular-nums ${v === 100 ? "text-[var(--accent)]" : "text-[var(--dimmer)]"}`}>
                  {v}
                </span>
                <span className="mt-1 h-2 w-px bg-[var(--dimmer)]" />
              </div>
            ))}
          </div>
          <p className="mt-2 text-[11px] text-[var(--dimmer)]">
            League average sits at 100. Each 15 points is one standard deviation.
          </p>
        </div>
      )}

      {activeId === "limits" && (
        <div className="mt-5 space-y-3 border-t border-[var(--rule)] pt-4">
          <div className="rounded-lg border border-[var(--rule)] bg-white px-3 py-2.5 text-[11px] text-[var(--dim)]">
            <span className="font-semibold text-[var(--text)]">Baserunning: </span>
            not graded. Legs beat the grade by design.
          </div>
          <div className="rounded-lg border border-[var(--rule)] bg-white px-3 py-2.5 text-[11px] text-[var(--dim)]">
            <span className="font-semibold text-[var(--text)]">Weak bat speed: </span>
            over-punished even with average results.
          </div>
        </div>
      )}
    </div>
  );
}
