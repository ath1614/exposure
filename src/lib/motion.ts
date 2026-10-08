import { useEffect, useRef, useState } from 'react';

export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(
    () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches,
  );

  useEffect(() => {
    if (typeof matchMedia !== 'function') return;
    const query = matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => setReduced(query.matches);
    query.addEventListener('change', update);
    return () => query.removeEventListener('change', update);
  }, []);

  return reduced;
}

export function useReveal(): void {
  useEffect(() => {
    const targets = Array.from(document.querySelectorAll<HTMLElement>('[data-reveal]'));
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) {
      for (const node of targets) node.classList.add('is-in');
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          const el = entry.target as HTMLElement;
          const parent = el.parentElement;
          const siblings = parent
            ? Array.from(parent.querySelectorAll<HTMLElement>(':scope > [data-reveal]'))
            : [el];
          el.style.setProperty('--delay', `${Math.min(siblings.indexOf(el) * 80, 400)}ms`);
          el.classList.add('is-in');
          observer.unobserve(el);
        }
      },
      { rootMargin: '0px 0px -10% 0px', threshold: 0.12 },
    );

    for (const node of targets) observer.observe(node);
    return () => observer.disconnect();
  }, []);
}

/** Writes scroll progress for a section into --p, used by the burn seam. */
export function useBurnProgress<T extends HTMLElement>() {
  const ref = useRef<T | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let frame = 0;

    const update = () => {
      frame = 0;
      const rect = el.getBoundingClientRect();
      const span = rect.height + innerHeight;
      el.style.setProperty('--p', Math.min(1, Math.max(0, (innerHeight - rect.top) / span)).toFixed(4));
    };

    const onScroll = () => {
      if (frame) return;
      frame = requestAnimationFrame(update);
    };

    update();
    addEventListener('scroll', onScroll, { passive: true });
    addEventListener('resize', onScroll);
    return () => {
      removeEventListener('scroll', onScroll);
      removeEventListener('resize', onScroll);
      if (frame) cancelAnimationFrame(frame);
    };
  }, []);

  return ref;
}
