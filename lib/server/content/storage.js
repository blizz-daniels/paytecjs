function isValidLocalContentUrl(value) {
  return /^\/content-files\/(handouts|shared)\/[a-z0-9._-]+$/i.test(String(value || ""));
}

function parseReactionDetails(detailsString) {
  if (!detailsString) {
    return [];
  }

  return String(detailsString)
    .split(",")
    .map((entry) => String(entry || "").trim())
    .filter(Boolean)
    .map((entry) => {
      const [username, reaction] = entry.split("|");
      return {
        username: String(username || "").trim(),
        reaction: String(reaction || "").trim(),
      };
    })
    .filter((item) => item.username && item.reaction);
}

function createContentStorage(options = {}) {
  const fs = options.fs;
  const path = options.path;
  const contentFilesDir = options.contentFilesDir;
  const legacyPlainReceiptMaxBytes = Number.isFinite(options.legacyPlainReceiptMaxBytes)
    ? options.legacyPlainReceiptMaxBytes
    : 1500;

  if (!fs || !path) {
    throw new Error("createContentStorage requires fs and path.");
  }
  if (!contentFilesDir) {
    throw new Error("createContentStorage requires contentFilesDir.");
  }

  function resolveStoredContentPath(relativeUrl) {
    if (!relativeUrl || typeof relativeUrl !== "string") {
      return null;
    }

    const normalized = relativeUrl.replace(/\\/g, "/");
    if (!normalized.startsWith("/content-files/")) {
      return null;
    }

    const relativePath = normalized.slice("/content-files/".length);
    const absolute = path.resolve(contentFilesDir, relativePath);
    const relativeCheck = path.relative(contentFilesDir, absolute);
    if (!relativeCheck || relativeCheck.startsWith("..") || path.isAbsolute(relativeCheck)) {
      return null;
    }
    return absolute;
  }

  function isPathInsideDirectory(baseDir, candidatePath) {
    const resolvedBase = path.resolve(baseDir);
    const resolvedCandidate = path.resolve(String(candidatePath || ""));
    const relativeCheck = path.relative(resolvedBase, resolvedCandidate);
    return relativeCheck === "" || (!relativeCheck.startsWith("..") && !path.isAbsolute(relativeCheck));
  }

  function isLikelyLegacyPlainReceipt(filePath) {
    try {
      const stat = fs.statSync(filePath);
      const threshold = Math.max(400, legacyPlainReceiptMaxBytes);
      return stat.isFile() && stat.size > 0 && stat.size <= threshold;
    } catch (_err) {
      return false;
    }
  }

  function removeStoredContentFile(relativeUrl) {
    const absolutePath = resolveStoredContentPath(relativeUrl);
    if (!absolutePath) {
      return;
    }
    fs.unlink(absolutePath, () => {});
  }

  return {
    contentFilesDir,
    resolveStoredContentPath,
    isPathInsideDirectory,
    isLikelyLegacyPlainReceipt,
    removeStoredContentFile,
    isValidLocalContentUrl,
    parseReactionDetails,
  };
}

module.exports = {
  createContentStorage,
  isValidLocalContentUrl,
  parseReactionDetails,
};
