/** Resolve a saved palette ID through the current appearance without changing data. */
export function displayColor(color?: string): string | undefined {
  return color && /^#[0-9a-f]{6}$/i.test(color) ? `var(--palette-${color.slice(1).toLowerCase()}, ${color})` : color;
}
