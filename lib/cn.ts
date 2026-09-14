/** Joins conditional class names. Keeps a `clsx` dependency out of the tree. */
export function cn(...values: Array<string | false | null | undefined>): string {
  return values.filter(Boolean).join(" ");
}
