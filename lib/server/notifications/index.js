function createNotificationService(options = {}) {
  const all = options.all;
  const get = options.get;
  const run = options.run;
  const parseReactionDetails = options.parseReactionDetails;
  const normalizeIdentifier = options.normalizeIdentifier;
  const normalizeDepartment = options.normalizeDepartment;
  const departmentScopeMatchesStudent = options.departmentScopeMatchesStudent;
  const listStudentDepartmentRows = options.listStudentDepartmentRows;
  const ensureCanManageContent = options.ensureCanManageContent;
  const assertStudentContentAccess = options.assertStudentContentAccess;
  const logAuditEvent = options.logAuditEvent;
  const broadcastContentUpdate = options.broadcastContentUpdate;
  const allowedReactions = options.allowedReactions || new Set();

  function validateNotificationInput(input = {}) {
    const title = String(input.title || "").trim();
    const body = String(input.body || "").trim();
    const category = String(input.category || "General").trim() || "General";
    const isUrgent = input.isUrgent ? 1 : 0;
    const isPinned = input.isPinned ? 1 : 0;
    if (!title || !body) {
      throw { status: 400, error: "Title and body are required." };
    }
    if (title.length > 120 || body.length > 2000 || category.length > 40) {
      throw { status: 400, error: "Notification field length is invalid." };
    }
    return { title, body, category, isUrgent, isPinned };
  }

  async function listNotifications(input = {}) {
    const actorUsername = String(input.actorUsername || "").trim();
    const actorRole = String(input.actorRole || "").trim().toLowerCase();
    const actorDepartment = String(input.actorDepartment || "").trim();
    const isStudent = actorRole === "student";
    const whereClause = isStudent ? "WHERE (n.expires_at IS NULL OR CAST(n.expires_at AS timestamp) > CURRENT_TIMESTAMP)" : "";
    const rows = await all(
      `
        SELECT
          n.id,
          n.title,
          n.body,
          n.category,
          n.is_urgent,
          n.is_pinned,
          n.expires_at,
          n.related_payment_item_id,
          n.auto_generated,
          n.target_department,
          n.user_id,
          n.created_by,
          n.created_at,
          CASE WHEN nr.notification_id IS NULL THEN 0 ELSE 1 END AS is_read,
          user_reaction.reaction AS user_reaction
        FROM notifications n
        LEFT JOIN notification_reads nr
          ON nr.notification_id = n.id
         AND nr.username = ?
        LEFT JOIN notification_reactions user_reaction
          ON user_reaction.notification_id = n.id
         AND user_reaction.username = ?
        ${whereClause}
        ORDER BY n.is_pinned DESC, n.is_urgent DESC, n.created_at DESC, n.id DESC
      `,
      [actorUsername, actorUsername]
    );

    const scopedRows = isStudent
      ? rows.filter((row) => {
          const directUserMatch =
            !row.user_id || normalizeIdentifier(row.user_id || "") === normalizeIdentifier(actorUsername || "");
          return directUserMatch && departmentScopeMatchesStudent(row.target_department, actorDepartment);
        })
      : rows;

    const notificationIds = scopedRows.map((row) => Number(row.id)).filter((id) => Number.isFinite(id) && id > 0);
    let reactionCountRows = [];
    if (notificationIds.length) {
      const placeholders = notificationIds.map(() => "?").join(", ");
      reactionCountRows = await all(
        `
          SELECT notification_id, reaction, COUNT(*) AS total
          FROM notification_reactions
          WHERE notification_id IN (${placeholders})
          GROUP BY notification_id, reaction
        `,
        notificationIds
      );
    }
    const reactionsByNotification = new Map();
    reactionCountRows.forEach((row) => {
      const notificationId = Number(row.notification_id || 0);
      if (!reactionsByNotification.has(notificationId)) {
        reactionsByNotification.set(notificationId, {});
      }
      reactionsByNotification.get(notificationId)[String(row.reaction || "")] = Number(row.total || 0);
    });
    const rowsWithReactions = scopedRows.map((row) => ({
      ...row,
      reaction_counts: reactionsByNotification.get(Number(row.id || 0)) || {},
    }));

    if (actorRole !== "teacher" && actorRole !== "admin") {
      return rowsWithReactions;
    }

    const unreadById = new Map();
    if (notificationIds.length) {
      const students = await listStudentDepartmentRows();
      const placeholders = notificationIds.map(() => "?").join(", ");
      const readRows = await all(
        `
          SELECT notification_id, username
          FROM notification_reads
          WHERE notification_id IN (${placeholders})
        `,
        notificationIds
      );
      const readSetById = new Map();
      readRows.forEach((row) => {
        const key = Number(row.notification_id || 0);
        if (!readSetById.has(key)) {
          readSetById.set(key, new Set());
        }
        readSetById.get(key).add(normalizeIdentifier(row.username || ""));
      });

      rowsWithReactions.forEach((row) => {
        const notificationId = Number(row.id || 0);
        if (!notificationId) {
          return;
        }
        const directUser = normalizeIdentifier(row.user_id || "");
        const eligibleStudents = directUser
          ? students.filter((studentRow) => normalizeIdentifier(studentRow.auth_id || "") === directUser)
          : students.filter((studentRow) =>
              departmentScopeMatchesStudent(row.target_department, normalizeDepartment(studentRow.department || ""))
            );
        const readUsers = readSetById.get(notificationId) || new Set();
        let readEligibleCount = 0;
        eligibleStudents.forEach((studentRow) => {
          const username = normalizeIdentifier(studentRow.auth_id || "");
          if (username && readUsers.has(username)) {
            readEligibleCount += 1;
          }
        });
        unreadById.set(notificationId, Math.max(0, eligibleStudents.length - readEligibleCount));
      });
    }

    let reactionDetailRows = [];
    if (notificationIds.length) {
      const placeholders = notificationIds.map(() => "?").join(", ");
      reactionDetailRows = await all(
        `
          SELECT
            notification_id,
            GROUP_CONCAT(username || '|' || reaction, ',') AS reaction_details
          FROM notification_reactions
          WHERE notification_id IN (${placeholders})
          GROUP BY notification_id
        `,
        notificationIds
      );
    }
    const reactionDetailsById = new Map(
      reactionDetailRows.map((row) => [Number(row.notification_id || 0), parseReactionDetails(row.reaction_details)])
    );

    return rowsWithReactions.map((row) => ({
      ...row,
      unread_count: unreadById.has(row.id) ? unreadById.get(row.id) : 0,
      reaction_details: reactionDetailsById.get(Number(row.id || 0)) || [],
    }));
  }

  async function saveReaction(input = {}) {
    const id = Number(input.id || 0);
    const actorUsername = String(input.actorUsername || "").trim();
    const actorRole = String(input.actorRole || "").trim().toLowerCase();
    const actorDepartment = String(input.actorDepartment || "").trim();
    const rawReaction = String(input.reaction || "").trim().toLowerCase();
    if (!id) {
      throw { status: 400, error: "Invalid notification ID." };
    }
    if (rawReaction && !allowedReactions.has(rawReaction)) {
      throw { status: 400, error: "Invalid reaction." };
    }

    const row = await get(
      "SELECT id, auto_generated, related_payment_item_id, target_department, user_id FROM notifications WHERE id = ? LIMIT 1",
      [id]
    );
    if (!row) {
      throw { status: 404, error: "Notification not found." };
    }
    if (actorRole === "student") {
      assertStudentContentAccess({
        row,
        actorUsername,
        studentDepartment: actorDepartment,
        noun: "notification",
      });
    }
    if (Number(row.auto_generated || 0) === 1 || Number(row.related_payment_item_id || 0) > 0) {
      throw { status: 400, error: "Payment item notifications cannot be reacted to." };
    }
    if (!rawReaction) {
      await run("DELETE FROM notification_reactions WHERE notification_id = ? AND username = ?", [id, actorUsername]);
      broadcastContentUpdate("notification", "reaction", { id, reaction: null });
      return { ok: true, reaction: null };
    }

    await run(
      `
        INSERT INTO notification_reactions (notification_id, username, reaction, reacted_at)
        VALUES (?, ?, ?, CURRENT_TIMESTAMP)
        ON CONFLICT(notification_id, username) DO UPDATE SET
          reaction = excluded.reaction,
          reacted_at = CURRENT_TIMESTAMP
      `,
      [id, actorUsername, rawReaction]
    );
    broadcastContentUpdate("notification", "reaction", { id, reaction: rawReaction });
    return { ok: true, reaction: rawReaction };
  }

  async function createNotification(input = {}) {
    const actorUsername = String(input.actorUsername || "").trim();
    const validated = validateNotificationInput(input);
    const result = await run(
      `
        INSERT INTO notifications (title, body, category, is_urgent, is_pinned, target_department, created_by)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `,
      [validated.title, validated.body, validated.category, validated.isUrgent, validated.isPinned, input.targetDepartment, actorUsername]
    );
    await logAuditEvent(
      input.req,
      "create",
      "notification",
      result.lastID,
      actorUsername,
      `Created notification "${validated.title.slice(0, 80)}"`
    );
    broadcastContentUpdate("notification", "created", {
      id: Number(result.lastID || 0),
      created_by: actorUsername,
    });
    return { ok: true };
  }

  async function updateNotification(input = {}) {
    const id = Number(input.id || 0);
    if (!id) {
      throw { status: 400, error: "Invalid notification ID." };
    }
    const validated = validateNotificationInput(input);
    const access = await ensureCanManageContent({
      table: "notifications",
      id,
      actorUsername: input.actorUsername,
      isAdmin: !!input.isAdmin,
    });
    if (access.error === "not_found") {
      throw { status: 404, error: "Notification not found." };
    }
    if (access.error === "forbidden") {
      throw { status: 403, error: "You can only edit your own notification." };
    }

    await run(
      `
        UPDATE notifications
        SET title = ?, body = ?, category = ?, is_urgent = ?, is_pinned = ?, target_department = ?
        WHERE id = ?
      `,
      [validated.title, validated.body, validated.category, validated.isUrgent, validated.isPinned, input.targetDepartment, id]
    );
    await logAuditEvent(
      input.req,
      "edit",
      "notification",
      id,
      access.row.created_by,
      `Edited notification "${validated.title.slice(0, 80)}"`
    );
    broadcastContentUpdate("notification", "updated", { id });
    return { ok: true };
  }

  async function markNotificationRead(input = {}) {
    const id = Number(input.id || 0);
    const actorRole = String(input.actorRole || "").trim().toLowerCase();
    if (actorRole !== "student") {
      throw { status: 403, error: "Only students can mark notifications as read." };
    }
    if (!id) {
      throw { status: 400, error: "Invalid notification ID." };
    }

    const row = await get("SELECT id, target_department, user_id FROM notifications WHERE id = ? LIMIT 1", [id]);
    if (!row) {
      throw { status: 404, error: "Notification not found." };
    }
    assertStudentContentAccess({
      row,
      actorUsername: input.actorUsername,
      studentDepartment: input.actorDepartment,
      noun: "notification",
    });

    await run(
      `
        INSERT INTO notification_reads (notification_id, username)
        VALUES (?, ?)
        ON CONFLICT(notification_id, username) DO UPDATE SET
          read_at = CURRENT_TIMESTAMP
      `,
      [id, input.actorUsername]
    );
    broadcastContentUpdate("notification", "read", { id });
    return { ok: true };
  }

  async function deleteNotification(input = {}) {
    const id = Number(input.id || 0);
    if (!id) {
      throw { status: 400, error: "Invalid notification ID." };
    }
    const access = await ensureCanManageContent({
      table: "notifications",
      id,
      actorUsername: input.actorUsername,
      isAdmin: !!input.isAdmin,
    });
    if (access.error === "not_found") {
      throw { status: 404, error: "Notification not found." };
    }
    if (access.error === "forbidden") {
      throw { status: 403, error: "You can only delete your own notification." };
    }

    await run("DELETE FROM notification_reactions WHERE notification_id = ?", [id]);
    await run("DELETE FROM notifications WHERE id = ?", [id]);
    await logAuditEvent(
      input.req,
      "delete",
      "notification",
      id,
      access.row.created_by,
      `Deleted notification "${String(access.row.title || "").slice(0, 80)}"`
    );
    broadcastContentUpdate("notification", "deleted", { id });
    return { ok: true };
  }

  async function syncPaymentItemNotification(input = {}) {
    const paymentItem = input.paymentItem;
    if (!paymentItem || !paymentItem.id) {
      return;
    }
    const title = `New Payment Item: ${String(paymentItem.title || "").slice(0, 90)}`;
    const duePart = paymentItem.due_date ? `Due: ${paymentItem.due_date}. ` : "";
    let availabilityPart = "Available until removed by lecturer.";
    if (paymentItem.available_until) {
      const availableDate = new Date(paymentItem.available_until);
      if (!Number.isNaN(availableDate.getTime())) {
        availabilityPart = `Available until: ${availableDate.toISOString().slice(0, 10)}.`;
      }
    }
    const body = `${duePart}Amount: ${paymentItem.currency} ${Number(paymentItem.expected_amount || 0).toFixed(
      2
    )}. ${availabilityPart} ${String(paymentItem.description || "").trim()}`.trim();
    const existing = await get(
      "SELECT id FROM notifications WHERE related_payment_item_id = ? AND auto_generated = 1 LIMIT 1",
      [paymentItem.id]
    );
    if (existing) {
      await run(
        `
          UPDATE notifications
          SET title = ?,
              body = ?,
              category = 'Payments',
              is_urgent = 0,
              is_pinned = 0,
              expires_at = ?,
              target_department = ?,
              created_by = ?
          WHERE id = ?
        `,
        [
          title.slice(0, 120),
          body.slice(0, 2000),
          paymentItem.available_until || null,
          normalizeDepartment(paymentItem.target_department || "all") || "all",
          input.actorUsername,
          existing.id,
        ]
      );
      return existing.id;
    }
    const result = await run(
      `
        INSERT INTO notifications (
          title,
          body,
          category,
          is_urgent,
          is_pinned,
          expires_at,
          related_payment_item_id,
          auto_generated,
          target_department,
          created_by
        )
        VALUES (?, ?, 'Payments', 0, 0, ?, ?, 1, ?, ?)
      `,
      [
        title.slice(0, 120),
        body.slice(0, 2000),
        paymentItem.available_until || null,
        paymentItem.id,
        normalizeDepartment(paymentItem.target_department || "all") || "all",
        input.actorUsername,
      ]
    );
    return result.lastID;
  }

  return {
    listNotifications,
    saveReaction,
    createNotification,
    updateNotification,
    markNotificationRead,
    deleteNotification,
    syncPaymentItemNotification,
  };
}

module.exports = {
  createNotificationService,
};
