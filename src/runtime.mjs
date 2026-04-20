export function parseBoolean(value) {
  return /^(1|true|yes|on)$/i.test(String(value || ""));
}

export function parsePositiveInteger(value, fallback) {
  const parsed = Number.parseInt(String(value || ""), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export function parseRequiredUrl(value, name) {
  try {
    return new URL(String(value));
  } catch {
    throw new Error(`Invalid ${name}`);
  }
}
