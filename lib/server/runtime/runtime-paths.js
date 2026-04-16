const path = require("path");

function normalizeNodeEnv(rawValue) {
  const normalized = String(rawValue || "").trim().toLowerCase();
  return normalized || "development";
}

function isPathInsideDirectory(parentDir, childPath) {
  const relativePath = path.relative(path.resolve(parentDir), path.resolve(childPath));
  return relativePath === "" || (!relativePath.startsWith("..") && !path.isAbsolute(relativePath));
}

function resolveWritableRuntimePath(options = {}) {
  const nodeEnv = normalizeNodeEnv(options.nodeEnv);
  const configuredPath = String(options.configuredPath || "").trim();
  const productionRoot = path.resolve(String(options.productionRoot || "/tmp"));
  const productionDefault = path.resolve(String(options.productionDefault || path.join(productionRoot, "paytec")));
  const developmentDefault = path.resolve(
    String(options.developmentDefault || options.productionDefault || process.cwd())
  );

  if (nodeEnv !== "production") {
    return path.resolve(configuredPath || developmentDefault);
  }

  if (!configuredPath) {
    return productionDefault;
  }

  const resolvedPath = path.resolve(configuredPath);
  if (!isPathInsideDirectory(productionRoot, resolvedPath)) {
    const envName = String(options.envName || "Runtime path");
    throw new Error(`${envName} must be inside ${productionRoot} in production.`);
  }

  return resolvedPath;
}

module.exports = {
  normalizeNodeEnv,
  isPathInsideDirectory,
  resolveWritableRuntimePath,
};
