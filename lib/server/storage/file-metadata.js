function createFileMetadataService(options = {}) {
  const get = options.get;
  const run = options.run;
  const all = options.all;

  if (typeof get !== "function" || typeof run !== "function" || typeof all !== "function") {
    throw new Error("createFileMetadataService requires get/run/all database functions.");
  }

  async function upsertFileRecord(input = {}) {
    const legacyUrl = String(input.legacyUrl || "").trim();
    const bucket = String(input.bucket || "").trim();
    const objectPath = String(input.objectPath || "").trim();
    if (!legacyUrl || !bucket || !objectPath) {
      throw new Error("legacyUrl, bucket, and objectPath are required.");
    }

    const existing = await get("SELECT id FROM stored_files WHERE legacy_url = ? LIMIT 1", [legacyUrl]);
    const params = [
      input.provider || "supabase",
      bucket,
      objectPath,
      input.objectRef || "",
      input.category || "generic",
      input.ownerUsername || null,
      input.ownerRole || null,
      input.accessScope || "authenticated",
      input.contentType || null,
      Number(input.byteSize || 0),
      input.originalFilename || null,
      input.linkedTable || null,
      input.linkedId || null,
      legacyUrl,
    ];

    if (existing && existing.id) {
      await run(
        `
          UPDATE stored_files
          SET storage_provider = ?,
              bucket = ?,
              object_path = ?,
              object_ref = ?,
              category = ?,
              owner_username = ?,
              owner_role = ?,
              access_scope = ?,
              content_type = ?,
              byte_size = ?,
              original_filename = ?,
              linked_table = ?,
              linked_id = ?,
              deleted_at = NULL,
              updated_at = CURRENT_TIMESTAMP
          WHERE legacy_url = ?
        `,
        params
      );
    } else {
      await run(
        `
          INSERT INTO stored_files (
            storage_provider,
            bucket,
            object_path,
            object_ref,
            category,
            owner_username,
            owner_role,
            access_scope,
            content_type,
            byte_size,
            original_filename,
            linked_table,
            linked_id,
            legacy_url
          )
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `,
        params
      );
    }

    return get("SELECT * FROM stored_files WHERE legacy_url = ? LIMIT 1", [legacyUrl]);
  }

  async function getFileRecordByLegacyUrl(legacyUrl) {
    return get(
      `
        SELECT *
        FROM stored_files
        WHERE legacy_url = ?
          AND deleted_at IS NULL
        LIMIT 1
      `,
      [String(legacyUrl || "").trim()]
    );
  }

  async function softDeleteByLegacyUrl(legacyUrl) {
    await run(
      `
        UPDATE stored_files
        SET deleted_at = CURRENT_TIMESTAMP,
            updated_at = CURRENT_TIMESTAMP
        WHERE legacy_url = ?
          AND deleted_at IS NULL
      `,
      [String(legacyUrl || "").trim()]
    );
  }

  async function listByCategory(category) {
    return all(
      `
        SELECT *
        FROM stored_files
        WHERE category = ?
          AND deleted_at IS NULL
        ORDER BY created_at DESC, id DESC
      `,
      [String(category || "").trim()]
    );
  }

  return {
    upsertFileRecord,
    getFileRecordByLegacyUrl,
    softDeleteByLegacyUrl,
    listByCategory,
  };
}

module.exports = {
  createFileMetadataService,
};
