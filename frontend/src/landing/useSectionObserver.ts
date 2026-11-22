import { RefObject, useEffect, useState } from 'react';

/**
 * Watches the landing sections.
 * - `entered[i]` turns true (once) when section i is 15% visible, which triggers the `.rv` reveal.
 * - `active` is the section that is more than half visible, used by the right rail.
 */
export function useSectionObserver(refs: RefObject<HTMLElement>[]) {
  const [entered, setEntered] = useState<boolean[]>(() => refs.map(() => false));
  const [active, setActive] = useState(0);

  useEffect(() => {
    const els = refs.map((r) => r.current);
    if (els.some((e) => !e) || !('IntersectionObserver' in window)) {
      setEntered(refs.map(() => true));
      return;
    }
    const reveal = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (!e.isIntersecting) return;
          const i = els.indexOf(e.target as HTMLElement);
          setEntered((prev) => (prev[i] ? prev : prev.map((v, k) => (k === i ? true : v))));
        });
      },
      { threshold: 0.15 },
    );
    const half = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting && e.intersectionRatio > 0.5) setActive(els.indexOf(e.target as HTMLElement));
        });
      },
      { threshold: [0.5, 0.51, 0.75] },
    );
    els.forEach((el) => {
      reveal.observe(el!);
      half.observe(el!);
    });
    return () => {
      reveal.disconnect();
      half.disconnect();
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return { entered, active };
}
