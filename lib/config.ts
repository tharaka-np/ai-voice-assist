/**
 * Tunable application limits.
 *
 * Kept in one place so a threshold change is a single edit rather than a search
 * across the codebase.
 */

/**
 * At or above this many contact matches, the flow stays in refinement mode and
 * asks the user for another identifying detail. Below it, the remaining matches
 * are shown for manual selection.
 *
 * The comparison is `matches >= MATCH_THRESHOLD`, so a threshold of 5 means five
 * matches still asks for refinement and four offers selection.
 */
export const MATCH_THRESHOLD = 3;

/**
 * Hard cap on rows returned for display. Independent of the threshold: the total
 * count is always reported accurately, but only this many rows travel to the
 * browser so a broad first turn cannot ship the whole directory.
 */
export const MAX_CONTACT_RESULTS = 25;

/**
 * Minimum trigram similarity for a fuzzy field match. Below this a match is
 * noise rather than a candidate.
 */
export const MIN_FIELD_SIMILARITY = 0.35;
