// White-panel contrast correction for border-beam 1.4.1's light Rotate preset.
// Keep its palette, masks, gradients and rotation. Its stock stroke alpha is
// .12 and inner alpha is .26 * .45; lift these to .60 and .351 respectively.
// This CSS is passed only to the statement import panel, not the Studio button.
export const importBeamCSS=`
[data-beam="{id}"] {
  --beam-stroke-opacity: 5;
  --beam-inner-opacity: 3;
}
[data-beam="{id}"][data-active]::after,
[data-beam="{id}"][data-fading]::after {
  padding: 2px;
}
@media (prefers-reduced-motion: reduce) {
  [data-beam="{id}"] { animation: none !important; }
  [data-beam="{id}"]::before, [data-beam="{id}"]::after,
  [data-beam="{id}"] [data-beam-bloom] { display: none !important; }
}`;
