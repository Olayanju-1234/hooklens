"use client";

import { useEffect, useRef } from "react";
import gsap from "gsap";

export function useStaggerIn<T extends HTMLElement>() {
  const ref = useRef<T>(null);

  useEffect(() => {
    if (!ref.current) return;
    const children = ref.current.children;
    if (children.length === 0) return;

    gsap.fromTo(
      children,
      { opacity: 0, y: 12 },
      {
        opacity: 1,
        y: 0,
        duration: 0.35,
        stagger: 0.04,
        ease: "power2.out",
      },
    );
  });

  return ref;
}

export function useFadeIn<T extends HTMLElement>(delay = 0) {
  const ref = useRef<T>(null);

  useEffect(() => {
    if (!ref.current) return;
    gsap.fromTo(
      ref.current,
      { opacity: 0, y: 8 },
      { opacity: 1, y: 0, duration: 0.4, delay, ease: "power2.out" },
    );
  }, [delay]);

  return ref;
}

export function useCountUp(target: number, duration = 0.8) {
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!ref.current) return;
    const obj = { val: 0 };
    gsap.to(obj, {
      val: target,
      duration,
      ease: "power2.out",
      onUpdate: () => {
        if (ref.current) {
          ref.current.textContent =
            typeof target === "number" && Number.isInteger(target)
              ? Math.round(obj.val).toLocaleString()
              : obj.val.toFixed(1);
        }
      },
    });
  }, [target, duration]);

  return ref;
}
