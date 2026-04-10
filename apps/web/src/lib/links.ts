export function normalizeExternalUrl(value: string | null | undefined) {
  const rawValue = value?.trim();
  if (!rawValue) {
    return null;
  }

  if (/^https?:\/\//i.test(rawValue)) {
    return rawValue;
  }

  if (rawValue.startsWith("//")) {
    return `https:${rawValue}`;
  }

  return `${isLocalAddress(rawValue) ? "http" : "https"}://${rawValue}`;
}

export function formatExternalUrlLabel(value: string | null | undefined) {
  const normalized = normalizeExternalUrl(value);
  if (!normalized) {
    return null;
  }

  return normalized.replace(/^https?:\/\//i, "");
}

function isLocalAddress(value: string) {
  return /^(localhost|(?:\d{1,3}\.){3}\d{1,3})(:\d+)?(\/.*)?$/i.test(value);
}
