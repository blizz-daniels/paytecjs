const path = require("path");

function normalizeProvider(rawProvider, isProduction) {
  const normalized = String(rawProvider || "").trim().toLowerCase();
  if (normalized) {
    return normalized;
  }
  return isProduction ? "supabase" : "local";
}

function splitObjectPath(value) {
  return String(value || "")
    .replace(/\\/g, "/")
    .split("/")
    .map((segment) => segment.trim())
    .filter(Boolean);
}

function normalizeObjectPath(value) {
  return splitObjectPath(value).join("/");
}

function toEncodedObjectPath(value) {
  return splitObjectPath(value)
    .map((segment) => encodeURIComponent(segment))
    .join("/");
}

function parseObjectRef(ref) {
  const raw = String(ref || "").trim();
  const match = /^supabase:\/\/([^/]+)\/(.+)$/i.exec(raw);
  if (!match) {
    return null;
  }
  return {
    bucket: String(match[1] || "").trim(),
    objectPath: normalizeObjectPath(match[2]),
  };
}

function createObjectRef(bucket, objectPath) {
  return `supabase://${String(bucket || "").trim()}/${normalizeObjectPath(objectPath)}`;
}

function createObjectStorageService(options = {}) {
  const fs = options.fs;
  const crypto = options.crypto;
  const fetchImpl = options.fetchImpl || global.fetch;
  const isProduction = !!options.isProduction;
  const provider = normalizeProvider(options.provider || process.env.FILE_STORAGE_PROVIDER, isProduction);
  const supabaseUrl = String(options.supabaseUrl || process.env.SUPABASE_URL || "").trim().replace(/\/$/, "");
  const supabaseServiceRoleKey = String(
    options.supabaseServiceRoleKey || process.env.SUPABASE_SERVICE_ROLE_KEY || ""
  ).trim();
  const dataDir = path.resolve(String(options.dataDir || process.cwd()));
  const localStorageDir = path.resolve(String(options.localStorageDir || path.join(dataDir, "storage")));
  const buckets = {
    avatars: String(options.buckets?.avatars || process.env.SUPABASE_STORAGE_BUCKET_AVATARS || "avatars").trim(),
    statements: String(options.buckets?.statements || process.env.SUPABASE_STORAGE_BUCKET_STATEMENTS || "statements").trim(),
    handouts: String(options.buckets?.handouts || process.env.SUPABASE_STORAGE_BUCKET_HANDOUTS || "handouts").trim(),
    shared: String(options.buckets?.shared || process.env.SUPABASE_STORAGE_BUCKET_SHARED || "shared").trim(),
    approvedReceipts: String(
      options.buckets?.approvedReceipts || process.env.SUPABASE_STORAGE_BUCKET_APPROVED_RECEIPTS || "approved-receipts"
    ).trim(),
    exports: String(options.buckets?.exports || process.env.SUPABASE_STORAGE_BUCKET_EXPORTS || "exports").trim(),
  };

  if (!fs) {
    throw new Error("createObjectStorageService requires fs.");
  }
  if (!crypto) {
    throw new Error("createObjectStorageService requires crypto.");
  }
  if (!fetchImpl) {
    throw new Error("createObjectStorageService requires fetch support.");
  }
  if (provider === "supabase" && (!supabaseUrl || !supabaseServiceRoleKey)) {
    if (isProduction) {
      throw new Error("Supabase Storage requires SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in production.");
    }
  }
  if (isProduction && provider !== "supabase") {
    throw new Error("Production file storage provider must be set to 'supabase'.");
  }

  if (provider === "local") {
    fs.mkdirSync(localStorageDir, { recursive: true });
  }

  function resolveBucket(inputBucket) {
    const bucket = String(inputBucket || "").trim();
    if (bucket) {
      return bucket;
    }
    throw new Error("Storage bucket is required.");
  }

  function resolveBucketName(bucketKeyOrName) {
    const key = String(bucketKeyOrName || "").trim();
    if (!key) {
      throw new Error("Storage bucket key/name is required.");
    }
    return buckets[key] || key;
  }

  async function uploadBuffer(input = {}) {
    const bucket = resolveBucket(resolveBucketName(input.bucket || input.bucketKey));
    const objectPath = normalizeObjectPath(input.objectPath);
    const contentType = String(input.contentType || "application/octet-stream").trim() || "application/octet-stream";
    const upsert = input.upsert === undefined ? true : !!input.upsert;
    const body = Buffer.isBuffer(input.buffer) ? input.buffer : Buffer.from(input.buffer || "");

    if (!objectPath) {
      throw new Error("Storage objectPath is required.");
    }

    if (provider === "supabase") {
      const encodedPath = toEncodedObjectPath(objectPath);
      const response = await fetchImpl(`${supabaseUrl}/storage/v1/object/${bucket}/${encodedPath}`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${supabaseServiceRoleKey}`,
          apikey: supabaseServiceRoleKey,
          "x-upsert": upsert ? "true" : "false",
          "content-type": contentType,
        },
        body,
      });
      if (!response.ok) {
        const payload = await response.text().catch(() => "");
        throw new Error(`Supabase upload failed (${response.status}): ${payload || "unknown error"}`);
      }
    } else {
      const absolutePath = path.resolve(localStorageDir, bucket, objectPath);
      const bucketDir = path.resolve(localStorageDir, bucket);
      const relativeCheck = path.relative(bucketDir, absolutePath);
      if (!relativeCheck || relativeCheck.startsWith("..") || path.isAbsolute(relativeCheck)) {
        throw new Error("Refusing to write outside the configured local storage bucket.");
      }
      await fs.promises.mkdir(path.dirname(absolutePath), { recursive: true });
      await fs.promises.writeFile(absolutePath, body);
    }

    return {
      provider,
      bucket,
      objectPath,
      objectRef: createObjectRef(bucket, objectPath),
      size: body.length,
      contentType,
    };
  }

  async function downloadObject(input = {}) {
    const bucket = resolveBucket(resolveBucketName(input.bucket || input.bucketKey));
    const objectPath = normalizeObjectPath(input.objectPath);
    if (!objectPath) {
      throw new Error("Storage objectPath is required.");
    }

    if (provider === "supabase") {
      const encodedPath = toEncodedObjectPath(objectPath);
      const response = await fetchImpl(`${supabaseUrl}/storage/v1/object/${bucket}/${encodedPath}`, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${supabaseServiceRoleKey}`,
          apikey: supabaseServiceRoleKey,
        },
      });
      if (!response.ok) {
        const payload = await response.text().catch(() => "");
        const error = new Error(`Supabase download failed (${response.status}): ${payload || "unknown error"}`);
        error.status = response.status;
        throw error;
      }
      const arrayBuffer = await response.arrayBuffer();
      return {
        bucket,
        objectPath,
        buffer: Buffer.from(arrayBuffer),
        contentType: String(response.headers.get("content-type") || "application/octet-stream"),
      };
    }

    const absolutePath = path.resolve(localStorageDir, bucket, objectPath);
    const bucketDir = path.resolve(localStorageDir, bucket);
    const relativeCheck = path.relative(bucketDir, absolutePath);
    if (!relativeCheck || relativeCheck.startsWith("..") || path.isAbsolute(relativeCheck)) {
      const error = new Error("Invalid local storage path.");
      error.status = 400;
      throw error;
    }
    const buffer = await fs.promises.readFile(absolutePath);
    return {
      bucket,
      objectPath,
      buffer,
      contentType: "application/octet-stream",
    };
  }

  async function removeObject(input = {}) {
    const bucket = resolveBucket(resolveBucketName(input.bucket || input.bucketKey));
    const objectPath = normalizeObjectPath(input.objectPath);
    if (!objectPath) {
      return;
    }

    if (provider === "supabase") {
      const response = await fetchImpl(`${supabaseUrl}/storage/v1/object/${bucket}`, {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${supabaseServiceRoleKey}`,
          apikey: supabaseServiceRoleKey,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          prefixes: [objectPath],
        }),
      });
      if (!response.ok && response.status !== 404) {
        const payload = await response.text().catch(() => "");
        throw new Error(`Supabase delete failed (${response.status}): ${payload || "unknown error"}`);
      }
      return;
    }

    const absolutePath = path.resolve(localStorageDir, bucket, objectPath);
    await fs.promises.unlink(absolutePath).catch(() => {});
  }

  function buildObjectPath(prefix, inputFileName) {
    const cleanedPrefix = normalizeObjectPath(prefix);
    const safeName =
      String(inputFileName || "")
        .trim()
        .replace(/[^\w.-]+/g, "_")
        .replace(/^_+|_+$/g, "") || `${Date.now()}-${crypto.randomBytes(4).toString("hex")}.bin`;
    return cleanedPrefix ? `${cleanedPrefix}/${safeName}` : safeName;
  }

  return {
    provider,
    isSupabase: provider === "supabase",
    buckets,
    createObjectRef,
    parseObjectRef,
    resolveBucketName,
    uploadBuffer,
    downloadObject,
    removeObject,
    buildObjectPath,
  };
}

module.exports = {
  createObjectStorageService,
  parseObjectRef,
  createObjectRef,
};
