/** Default source and license allowlists for new installs — reported metadata only, not a legal guarantee. */
export const DEFAULT_ALLOWED_ARTISTS = [];

export const DEFAULT_ALLOWED_SOURCES = ["freemusicarchive.org"];

/**
 * Standard Creative Commons licenses suitable for non-commercial community radio
 * when streaming reported tracks without modification. CollabFM itself is CC BY-NC 4.0.
 * One canonical name per kind; the policy matcher accepts spacing/dash/URL variants.
 */
export const DEFAULT_ALLOWED_LICENSES = [
  "CC BY",
  "CC BY-SA",
  "CC BY-NC",
  "CC BY-NC-SA",
  "CC BY-ND",
  "CC BY-NC-ND",
  "CC0",
];
