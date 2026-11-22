import React, { useEffect, useRef, useState } from 'react';

interface RevealProps {
  children: React.ReactNode;
  /** Stagger index: each step adds 0.1s delay. */
  step?: number;
  className?: string;
  as?: keyof JSX.IntrinsicElements;
}

/** Fades and lifts its children in the first time they scroll into view. */
export const Reveal: React.FC<RevealProps> = ({ children, step = 0, className = '', as = 'div' }) => {
  const ref = useRef<HTMLElement | null>(null);
  const [shown, setShown] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (!('IntersectionObserver' in window)) {
      setShown(true);
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setShown(true);
          io.disconnect();
        }
      },
      { threshold: 0.15 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  const Tag = as as React.ElementType;
  return (
    <Tag
      ref={ref}
      className={`transition-[opacity,transform] duration-1000 ease-editorial ${shown ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-[26px]'} ${className}`}
      style={{ transitionDelay: `${step * 0.1}s` }}
    >
      {children}
    </Tag>
  );
};
