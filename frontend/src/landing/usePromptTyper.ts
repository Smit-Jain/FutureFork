import { useEffect, useState } from 'react';

const TYPE_MS = 38;
const HOLD_MS = 2600;
const DELETE_MS = 14;
const DELETE_STEP = 2;
const GAP_MS = 250;

/**
 * Types each prompt (38ms/char), holds 2.6s, deletes 2 chars per 14ms, waits 250ms, then types the next.
 * With reduced motion it shows the first prompt in full and never animates.
 */
export function usePromptTyper(prompts: string[], reduced: boolean) {
  const [index, setIndex] = useState(0);
  const [text, setText] = useState(reduced ? prompts[0] ?? '' : '');

  useEffect(() => {
    if (reduced || prompts.length === 0) {
      setText(prompts[0] ?? '');
      return;
    }
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    let i = 0;
    let pos = 0;

    const type = () => {
      if (cancelled) return;
      const full = prompts[i];
      pos += 1;
      setText(full.slice(0, pos));
      timer = pos < full.length ? setTimeout(type, TYPE_MS) : setTimeout(erase, HOLD_MS);
    };
    const erase = () => {
      if (cancelled) return;
      pos = Math.max(0, pos - DELETE_STEP);
      setText(prompts[i].slice(0, pos));
      if (pos > 0) {
        timer = setTimeout(erase, DELETE_MS);
      } else {
        i = (i + 1) % prompts.length;
        setIndex(i);
        timer = setTimeout(type, GAP_MS);
      }
    };

    setIndex(0);
    timer = setTimeout(type, 600);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [prompts, reduced]);

  return { text, index, next: prompts[(index + 1) % prompts.length] ?? '' };
}
