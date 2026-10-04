import { useEffect, useState } from 'react';

// Once the page scrolls, a soft band of blurred canvas settles under the
// status bar so rows never run under the clock or the space button sharply.
export function ScrollEdge() {
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const update = () => setScrolled(window.scrollY > 4);
    update();
    window.addEventListener('scroll', update, { passive: true });
    return () => window.removeEventListener('scroll', update);
  }, []);
  return <div className="scroll-edge" data-visible={scrolled || undefined} aria-hidden="true"/>;
}
