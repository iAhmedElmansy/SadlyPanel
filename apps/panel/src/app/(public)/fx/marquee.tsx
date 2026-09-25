"use client";

/**
 * An infinite horizontal marquee band, a studiors signature. The track holds two
 * identical copies of the word list and slides left by exactly one copy width,
 * so the loop is seamless. Pure CSS animation (no JS/observer needed) — it just
 * scrolls; under reduced motion the CSS pauses it and the words sit static.
 *
 * Decorative: the strip is aria-hidden. `reverse` flips direction so stacked
 * bands can counter-scroll.
 */
export function Marquee({
  items,
  reverse = false,
}: {
  items: string[];
  reverse?: boolean;
}) {
  const copy = (key: string) => (
    <div className="marquee__group" key={key}>
      {items.map((item, i) => (
        <span className="marquee__item" key={`${key}-${i}`}>
          {item}
          <i aria-hidden>✦</i>
        </span>
      ))}
    </div>
  );

  return (
    <div className="marquee" aria-hidden data-reverse={reverse ? "" : undefined}>
      <div className="marquee__track">
        {copy("a")}
        {copy("b")}
      </div>
    </div>
  );
}
