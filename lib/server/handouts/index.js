function createHandoutService(options = {}) {
  const all = options.all;
  const get = options.get;
  const run = options.run;
  const parseReactionDetails = options.parseReactionDetails;
  const departmentScopeMatchesStudent = options.departmentScopeMatchesStudent;
  const isValidHttpUrl = options.isValidHttpUrl;
  const isValidLocalContentUrl = options.isValidLocalContentUrl;
  const ensureCanManageContent = options.ensureCanManageContent;
  const assertStudentContentAccess = options.assertStudentContentAccess;
  const logAuditEvent = options.logAuditEvent;
  const broadcastContentUpdate = options.broadcastContentUpdate;
  const removeStoredContentFile = options.removeStoredContentFile;
  const allowedReactions = options.allowedReactions || new Set();

  async function listHandouts(input = {}) {
    const actorUsername = String(input.actorUsername || "").trim();
    const actorRole = String(input.actorRole || "").trim().toLowerCase();
    const actorDepartment = String(input.actorDepartment || "").trim();
    const rows = await all(
      `
        SELECT id, title, description, file_url, target_department, created_by, created_at
        FROM handouts
        ORDER BY created_at DESC, id DESC
      `
    );
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
        SELECT handout_id, reaction, COUNT(*) AS total
        FROM handout_reactions
        WHERE handout_id IN (${placeholders})
        GROUP BY handout_id, reaction
      `,
      ids
    );
    const userRows = await all(
      `
        SELECT handout_id, reaction
        FROM handout_reactions
        WHERE username = ? AND handout_id IN (${placeholders})
      `,
      [actorUsername, ...ids]
    );

    const countsById = new Map();
    countRows.forEach((row) => {
      const key = Number(row.handout_id || 0);
      if (!countsById.has(key)) {
        countsById.set(key, {});
      }
      countsById.get(key)[String(row.reaction || "")] = Number(row.total || 0);
    });
    const userById = new Map(userRows.map((row) => [Number(row.handout_id || 0), String(row.reaction || "")]));

    let detailsById = new Map();
    if (actorRole === "teacher" || actorRole === "admin") {
      const detailRows = await all(
        `
          SELECT
            handout_id,
            GROUP_CONCAT(username || '|' || reaction, ',') AS reaction_details
          FROM handout_reactions
          WHERE handout_id IN (${placeholders})
          GROUP BY handout_id
        `,
        ids
      );
      detailsById = new Map(
        detailRows.map((row) => [Number(row.handout_id || 0), parseReactionDetails(row.reaction_details)])
      );
    }

    return scopedRows.map((row) => ({
      ...row,
      user_reaction: userById.get(Number(row.id || 0)) || null,
      reaction_counts: countsById.get(Number(row.id || 0)) || {},
      reaction_details: detailsById.get(Number(row.id || 0)) || [],
    }));
  }

  function validateHandoutInput(input = {}) {
    const title = String(input.title || "").trim();
    const description = String(input.description || "").trim();
    const fileUrl = String(input.fileUrl || "").trim();
    if (!title || !description) {
      throw { status: 400, error: "Title and description are required." };
    }
    if (title.length > 120 || description.length > 2000 || fileUrl.length > 500) {
      throw { status: 400, error: "Handout field length is invalid." };
    }
    return { title, description, fileUrl };
  }

  async function createHandout(input = {}) {
    const actorUsername = String(input.actorUsername || "").trim();
    const validated = validateHandoutInput({
      title: input.title,
      description: input.description,
      fileUrl: input.fileUrl,
    });
    const result = await run(
      `
        INSERT INTO handouts (title, description, file_url, target_department, created_by)
        VALUES (?, ?, ?, ?, ?)
      `,
      [validated.title, validated.description, validated.fileUrl, input.targetDepartment, actorUsername]
    );
    await logAuditEvent(
      input.req,
      "create",
      "handout",
      result.lastID,
      actorUsername,
      `Created handout "${validated.title.slice(0, 80)}"`
    );
    broadcastContentUpdate("handout", "created", {
      id: Number(result.lastID || 0),
      created_by: actorUsername,
    });
    return { ok: true };
  }

  async function updateHandout(input = {}) {
    const id = Number(input.id || 0);
    if (!id) {
      throw { status: 400, error: "Invalid handout ID." };
    }
    const validated = validateHandoutInput(input);
    if (validated.fileUrl && !isValidHttpUrl(validated.fileUrl) && !isValidLocalContentUrl(validated.fileUrl)) {
      throw { status: 400, error: "File URL must start with http://, https://, or /content-files/." };
    }
    const access = await ensureCanManageContent({
      table: "handouts",
      id,
      actorUsername: input.actorUsername,
      isAdmin: !!input.isAdmin,
    });
    if (access.error === "not_found") {
      throw { status: 404, error: "Handout not found." };
    }
    if (access.error === "forbidden") {
      throw { status: 403, error: "You can only edit your own handout." };
    }

    await run(
      `
        UPDATE handouts
        SET title = ?, description = ?, file_url = ?, target_department = ?
        WHERE id = ?
      `,
      [validated.title, validated.description, validated.fileUrl || null, input.targetDepartment, id]
    );
    await logAuditEvent(
      input.req,
      "edit",
      "handout",
      id,
      access.row.created_by,
      `Edited handout "${validated.title.slice(0, 80)}"`
    );
    broadcastContentUpdate("handout", "updated", { id });
    return { ok: true };
  }

  async function deleteHandout(input = {}) {
    const id = Number(input.id || 0);
    if (!id) {
      throw { status: 400, error: "Invalid handout ID." };
    }
    const access = await ensureCanManageContent({
      table: "handouts",
      id,
      actorUsername: input.actorUsername,
      isAdmin: !!input.isAdmin,
    });
    if (access.error === "not_found") {
      throw { status: 404, error: "Handout not found." };
    }
    if (access.error === "forbidden") {
      throw { status: 403, error: "You can only delete your own handout." };
    }

    await run("DELETE FROM handout_reactions WHERE handout_id = ?", [id]);
    await run("DELETE FROM handouts WHERE id = ?", [id]);
    removeStoredContentFile(access.row.file_url);
    await logAuditEvent(
      input.req,
      "delete",
      "handout",
      id,
      access.row.created_by,
      `Deleted handout "${String(access.row.title || "").slice(0, 80)}"`
    );
    broadcastContentUpdate("handout", "deleted", { id });
    return { ok: true };
  }

  async function saveReaction(input = {}) {
    const id = Number(input.id || 0);
    const actorRole = String(input.actorRole || "").trim().toLowerCase();
    const actorDepartment = String(input.actorDepartment || "").trim();
    const actorUsername = String(input.actorUsername || "").trim();
    const rawReaction = String(input.reaction || "").trim().toLowerCase();
    if (!id) {
      throw { status: 400, error: "Invalid handout ID." };
    }
    if (rawReaction && !allowedReactions.has(rawReaction)) {
      throw { status: 400, error: "Invalid reaction." };
    }

    const row = await get("SELECT id, target_department FROM handouts WHERE id = ? LIMIT 1", [id]);
    if (!row) {
      throw { status: 404, error: "Handout not found." };
    }
    if (actorRole === "student") {
      assertStudentContentAccess({
        row,
        actorUsername,
        studentDepartment: actorDepartment,
        noun: "handout",
        directUserField: "__none__",
      });
    }
    if (!rawReaction) {
      await run("DELETE FROM handout_reactions WHERE handout_id = ? AND username = ?", [id, actorUsername]);
      return { ok: true, reaction: null };
    }
    await run(
      `
        INSERT INTO handout_reactions (handout_id, username, reaction, reacted_at)
        VALUES (?, ?, ?, CURRENT_TIMESTAMP)
        ON CONFLICT(handout_id, username) DO UPDATE SET
          reaction = excluded.reaction,
          reacted_at = CURRENT_TIMESTAMP
      `,
      [id, actorUsername, rawReaction]
    );
    return { ok: true, reaction: rawReaction };
  }

  return {
    listHandouts,
    createHandout,
    updateHandout,
    deleteHandout,
    saveReaction,
  };
}

module.exports = {
  createHandoutService,
};
