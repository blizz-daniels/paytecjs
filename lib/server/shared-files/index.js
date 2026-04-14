function createSharedFileService(options = {}) {
  const all = options.all;
  const run = options.run;
  const parseReactionDetails = options.parseReactionDetails;
  const normalizeIdentifier = options.normalizeIdentifier;
  const ensureCanManageContent = options.ensureCanManageContent;
  const logAuditEvent = options.logAuditEvent;
  const broadcastContentUpdate = options.broadcastContentUpdate;
  const removeStoredContentFile = options.removeStoredContentFile;
  const isValidHttpUrl = options.isValidHttpUrl;
  const isValidLocalContentUrl = options.isValidLocalContentUrl;
  const departmentScopeMatchesStudent = options.departmentScopeMatchesStudent;

  async function listSharedFiles(input = {}) {
    const rows = await all(
      `
        SELECT id, title, description, file_url, target_department, created_by, created_at
        FROM shared_files
        ORDER BY created_at DESC, id DESC
      `
    );
    const actorRole = String(input.actorRole || "")
      .trim()
      .toLowerCase();
    const actorDepartment = String(input.actorDepartment || "").trim();
    const actorUsername = String(input.actorUsername || "").trim();
    const scopedRows =
      actorRole === "student"
        ? rows.filter((row) => departmentScopeMatchesStudent(row.target_department, actorDepartment))
        : rows;
    const ids = scopedRows.map((row) => Number(row.id)).filter((id) => Number.isFinite(id) && id > 0);
    if (!ids.length) {
      return scopedRows;
    }

    const placeholders = ids.map(() => "?").join(", ");
    const countRows = await all(
      `
        SELECT shared_file_id, reaction, COUNT(*) AS total
        FROM shared_file_reactions
        WHERE shared_file_id IN (${placeholders})
        GROUP BY shared_file_id, reaction
      `,
      ids
    );
    const userRows = await all(
      `
        SELECT shared_file_id, reaction
        FROM shared_file_reactions
        WHERE username = ? AND shared_file_id IN (${placeholders})
      `,
      [actorUsername, ...ids]
    );

    const countsById = new Map();
    countRows.forEach((row) => {
      const key = Number(row.shared_file_id || 0);
      if (!countsById.has(key)) {
        countsById.set(key, {});
      }
      countsById.get(key)[String(row.reaction || "")] = Number(row.total || 0);
    });
    const userById = new Map(userRows.map((row) => [Number(row.shared_file_id || 0), String(row.reaction || "")]));

    let detailsById = new Map();
    if (actorRole === "teacher" || actorRole === "admin") {
      const detailRows = await all(
        `
          SELECT
            shared_file_id,
            GROUP_CONCAT(username || '|' || reaction, ',') AS reaction_details
          FROM shared_file_reactions
          WHERE shared_file_id IN (${placeholders})
          GROUP BY shared_file_id
        `,
        ids
      );
      detailsById = new Map(
        detailRows.map((row) => [Number(row.shared_file_id || 0), parseReactionDetails(row.reaction_details)])
      );
    }

    return scopedRows.map((row) => ({
      ...row,
      user_reaction: userById.get(Number(row.id || 0)) || null,
      reaction_counts: countsById.get(Number(row.id || 0)) || {},
      reaction_details: detailsById.get(Number(row.id || 0)) || [],
    }));
  }

  async function createSharedFile(input = {}) {
    const title = String(input.title || "").trim();
    const description = String(input.description || "").trim();
    const fileUrl = String(input.fileUrl || "").trim();
    if (!title || !description || !fileUrl) {
      throw { status: 400, error: "Title, description, and file URL are required." };
    }
    if (title.length > 120 || description.length > 2000 || fileUrl.length > 500) {
      throw { status: 400, error: "Shared file field length is invalid." };
    }
    const result = await run(
      `
        INSERT INTO shared_files (title, description, file_url, target_department, created_by)
        VALUES (?, ?, ?, ?, ?)
      `,
      [title, description, fileUrl, input.targetDepartment, input.actorUsername]
    );
    await logAuditEvent(
      input.req,
      "create",
      "shared_file",
      result.lastID,
      input.actorUsername,
      `Created shared file "${title.slice(0, 80)}"`
    );
    broadcastContentUpdate("shared", "created", {
      id: Number(result.lastID || 0),
      created_by: input.actorUsername,
    });
    return { ok: true };
  }

  async function updateSharedFile(input = {}) {
    const id = Number(input.id || 0);
    const title = String(input.title || "").trim();
    const description = String(input.description || "").trim();
    const fileUrl = String(input.fileUrl || "").trim();
    if (!id) {
      throw { status: 400, error: "Invalid shared file ID." };
    }
    if (!title || !description || !fileUrl) {
      throw { status: 400, error: "Title, description, and file URL are required." };
    }
    if (title.length > 120 || description.length > 2000 || fileUrl.length > 500) {
      throw { status: 400, error: "Shared file field length is invalid." };
    }
    if (!isValidHttpUrl(fileUrl) && !isValidLocalContentUrl(fileUrl)) {
      throw { status: 400, error: "File URL must start with http://, https://, or /content-files/." };
    }

    const access = await ensureCanManageContent({
      table: "shared_files",
      id,
      actorUsername: input.actorUsername,
      isAdmin: !!input.isAdmin,
    });
    if (access.error === "not_found") {
      throw { status: 404, error: "Shared file not found." };
    }
    if (access.error === "forbidden") {
      throw { status: 403, error: "You can only edit your own shared file." };
    }

    await run(
      `
        UPDATE shared_files
        SET title = ?, description = ?, file_url = ?, target_department = ?
        WHERE id = ?
      `,
      [title, description, fileUrl, input.targetDepartment, id]
    );
    await logAuditEvent(
      input.req,
      "edit",
      "shared_file",
      id,
      access.row.created_by,
      `Edited shared file "${title.slice(0, 80)}"`
    );
    broadcastContentUpdate("shared", "updated", { id });
    return { ok: true };
  }

  async function deleteSharedFile(input = {}) {
    const id = Number(input.id || 0);
    if (!id) {
      throw { status: 400, error: "Invalid shared file ID." };
    }
    const access = await ensureCanManageContent({
      table: "shared_files",
      id,
      actorUsername: input.actorUsername,
      isAdmin: !!input.isAdmin,
    });
    if (access.error === "not_found") {
      throw { status: 404, error: "Shared file not found." };
    }
    if (access.error === "forbidden") {
      throw { status: 403, error: "You can only delete your own shared file." };
    }

    await run("DELETE FROM shared_file_reactions WHERE shared_file_id = ?", [id]);
    await run("DELETE FROM shared_files WHERE id = ?", [id]);
    await Promise.resolve(removeStoredContentFile(access.row.file_url));
    await logAuditEvent(
      input.req,
      "delete",
      "shared_file",
      id,
      access.row.created_by,
      `Deleted shared file "${String(access.row.title || "").slice(0, 80)}"`
    );
    broadcastContentUpdate("shared", "deleted", { id });
    return { ok: true };
  }

  async function saveReaction(input = {}) {
    const id = Number(input.id || 0);
    const actorUsername = normalizeIdentifier(input.actorUsername || "");
    const actorRole = String(input.actorRole || "").trim().toLowerCase();
    const actorDepartment = String(input.actorDepartment || "").trim();
    const rawReaction = String(input.reaction || "").trim().toLowerCase();
    if (!id) {
      throw { status: 400, error: "Invalid shared file ID." };
    }
    const allowedReactions = input.allowedReactions || new Set(["like", "love", "haha", "wow", "sad"]);
    if (rawReaction && !allowedReactions.has(rawReaction)) {
      throw { status: 400, error: "Invalid reaction." };
    }

    const rows = await all("SELECT id, target_department FROM shared_files WHERE id = ? LIMIT 1", [id]);
    const row = rows && rows[0];
    if (!row) {
      throw { status: 404, error: "Shared file not found." };
    }
    if (actorRole === "student" && !departmentScopeMatchesStudent(row.target_department, actorDepartment)) {
      throw { status: 403, error: "You do not have access to this shared file." };
    }
    if (!rawReaction) {
      await run("DELETE FROM shared_file_reactions WHERE shared_file_id = ? AND username = ?", [id, actorUsername]);
      return { ok: true, reaction: null };
    }
    await run(
      `
        INSERT INTO shared_file_reactions (shared_file_id, username, reaction, reacted_at)
        VALUES (?, ?, ?, CURRENT_TIMESTAMP)
        ON CONFLICT(shared_file_id, username) DO UPDATE SET
          reaction = excluded.reaction,
          reacted_at = CURRENT_TIMESTAMP
      `,
      [id, actorUsername, rawReaction]
    );
    return { ok: true, reaction: rawReaction };
  }

  return {
    listSharedFiles,
    createSharedFile,
    updateSharedFile,
    deleteSharedFile,
    saveReaction,
  };
}

module.exports = {
  createSharedFileService,
};
