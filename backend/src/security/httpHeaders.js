/** Shared response headers for API JSON endpoints. */
export function apiJsonHeaders(extra = {}) {
  return {
    "Content-Type": "application/json; charset=utf-8",
    "X-Content-Type-Options": "nosniff",
    "Cache-Control": "no-store",
    ...extra,
  };
}

/** Icecast-style status document (path ends in .xsl but body is XML JSON). */
export function icecastStatusHeaders(extra = {}) {
  return {
    "Content-Type": "text/xml; charset=utf-8",
    "X-Content-Type-Options": "nosniff",
    "Cache-Control": "no-store",
    ...extra,
  };
}

export function staticFileHeaders(ext, extra = {}) {
  const contentTypes = {
    ".html": "text/html; charset=utf-8",
    ".js": "application/javascript; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".webp": "image/webp",
    ".svg": "image/svg+xml",
    ".json": "application/json; charset=utf-8",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".txt": "text/plain; charset=utf-8",
    ".woff2": "font/woff2",
  };

  const headers = {
    "X-Content-Type-Options": "nosniff",
    "Content-Type": contentTypes[ext] || "application/octet-stream",
    ...extra,
  };

  if (ext === ".html") {
    headers["Cache-Control"] = "no-cache";
  } else if (ext === ".js" || ext === ".css" || ext === ".webp" || ext === ".svg") {
    headers["Cache-Control"] = "public, max-age=31536000, immutable";
  }

  return headers;
}
