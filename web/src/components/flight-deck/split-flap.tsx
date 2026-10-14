"use client";

import { useEffect, useRef, useState } from "react";

const CHARSET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789._/-";
const TICK_MS = 42;

interface FlapProps {
  text: string;
  width?: number;
  reduced?: boolean;
  enter?: boolean;
  className?: string;
}

/** Departure-board text: only characters that change flip, so the eye lands on what's new. */
export function Flap({ text, width, reduced = false, enter = false, className }: FlapProps) {
  const target = (width ? text.slice(0, width).padEnd(width, " ") : text).toUpperCase();
  const [shown, setShown] = useState(() => (enter && !reduced ? " ".repeat(target.length) : target));
  const from = useRef(enter && !reduced ? " ".repeat(target.length) : target);

  useEffect(() => {
    if (reduced) return;
    const start = from.current;
    if (start === target) return;
    const flips = Array.from(target, (c, i) => (start[i] === c ? 0 : 2 + ((i * 7 + c.charCodeAt(0)) % 5)));
    const total = Math.max(...flips, 0);
    let k = 0;
    const id = window.setInterval(() => {
      k++;
      const next = Array.from(target, (c, i) => {
        if (k >= flips[i] || c === " ") return c;
        return CHARSET[(i * 13 + k * 7 + c.charCodeAt(0)) % CHARSET.length];
      }).join("");
      setShown(next);
      if (k >= total) {
        window.clearInterval(id);
        from.current = target;
      }
    }, TICK_MS);
    return () => window.clearInterval(id);
  }, [target, reduced]);

  const display = reduced ? target : shown.length === target.length ? shown : target;
  return (
    <span className={`flap ${className ?? ""}`}>
      <span className="sr-only">{text}</span>
      {Array.from(display, (c, i) => (
        <span key={`${i}-${c}`} className="flap-cell" aria-hidden>
          {c === " " ? " " : c}
        </span>
      ))}
    </span>
  );
}
