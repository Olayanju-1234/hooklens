"use client";

import { useEffect, useRef, useState } from "react";

const CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789@#$%&";

interface DecodeTextProps {
  text: string;
  className?: string;
  delay?: number;
  speed?: number;
  as?: "h1" | "h2" | "h3" | "p" | "span" | "div";
}

export default function DecodeText({
  text,
  className = "",
  delay = 0,
  speed = 30,
  as: Tag = "span",
}: DecodeTextProps) {
  const [display, setDisplay] = useState("");
  const [started, setStarted] = useState(false);
  const ref = useRef<HTMLElement>(null);

  // Trigger on intersection
  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setTimeout(() => setStarted(true), delay);
          observer.unobserve(el);
        }
      },
      { threshold: 0.3 },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [delay]);

  // Decode animation
  useEffect(() => {
    if (!started) return;

    let resolved = 0;
    const length = text.length;

    const interval = setInterval(() => {
      let result = "";
      for (let i = 0; i < length; i++) {
        if (text[i] === " " || text[i] === "\n") {
          result += text[i];
        } else if (i < resolved) {
          result += text[i];
        } else {
          result += CHARS[Math.floor(Math.random() * CHARS.length)];
        }
      }

      resolved += 1;
      setDisplay(result);

      if (resolved > length) {
        clearInterval(interval);
        setDisplay(text);
      }
    }, speed);

    return () => clearInterval(interval);
  }, [started, text, speed]);

  return (
    <Tag ref={ref as React.RefObject<never>} className={className}>
      {started ? display : "\u00A0".repeat(text.length)}
    </Tag>
  );
}
