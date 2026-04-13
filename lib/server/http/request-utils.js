function isValidHttpUrl(value) {
  return /^https?:\/\/\S+$/i.test(String(value || ""));
}

function parseResourceId(rawValue) {
  const value = Number.parseInt(rawValue, 10);
  if (!Number.isFinite(value) || value <= 0) {
    return null;
  }
  return value;
}

function parseBooleanEnv(rawValue, defaultValue = false) {
  if (rawValue === undefined || rawValue === null || String(rawValue).trim() === "") {
    return defaultValue;
  }
  const normalized = String(rawValue).trim().toLowerCase();
  return ["1", "true", "yes", "y", "on"].includes(normalized);
}

module.exports = {
  isValidHttpUrl,
  parseResourceId,
  parseBooleanEnv,
};
