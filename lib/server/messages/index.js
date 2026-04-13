function createMessageService(options = {}) {
  const all = options.all;
  const get = options.get;
  const run = options.run;
  const withSqlTransaction = options.withSqlTransaction;
  const normalizeIdentifier = options.normalizeIdentifier;
  const isValidIdentifier = options.isValidIdentifier;
  const normalizeDepartment = options.normalizeDepartment;
  const departmentScopeMatchesStudent = options.departmentScopeMatchesStudent;
  const formatDepartmentLabel = options.formatDepartmentLabel;

  const MESSAGE_SUBJECT_MAX_LENGTH = 120;
  const MESSAGE_BODY_MAX_LENGTH = 4000;

  function sanitizeMessageSubject(value) {
    const text = String(value || "")
      .replace(/\s+/g, " ")
      .trim();
    return text.slice(0, MESSAGE_SUBJECT_MAX_LENGTH);
  }

  function sanitizeMessageBody(value) {
    return String(value || "").replace(/\r/g, "").trim();
  }

  function canCreateMessageThreads(role) {
    return role === "teacher" || role === "admin";
  }

  function validateMessageSubjectOrThrow(rawSubject) {
    const normalized = String(rawSubject || "")
      .replace(/\s+/g, " ")
      .trim();
    if (normalized.length > MESSAGE_SUBJECT_MAX_LENGTH) {
      throw { status: 400, error: `Subject cannot be longer than ${MESSAGE_SUBJECT_MAX_LENGTH} characters.` };
    }
    return sanitizeMessageSubject(normalized);
  }

  function validateMessageBodyOrThrow(rawBody, optionsInput = {}) {
    const allowEmpty = !!optionsInput.allowEmpty;
    const message = sanitizeMessageBody(rawBody);
    if (!allowEmpty && !message) {
      throw { status: 400, error: "Message body is required." };
    }
    if (message.length > MESSAGE_BODY_MAX_LENGTH) {
      throw { status: 400, error: `Message body cannot be longer than ${MESSAGE_BODY_MAX_LENGTH} characters.` };
    }
    return message;
  }

  function parseMessageParticipantsCsv(rawValue) {
    if (!rawValue) {
      return [];
    }
    return String(rawValue)
      .split(",")
      .map((entry) => String(entry || "").trim())
      .filter(Boolean)
      .map((entry) => {
        const [username, role] = entry.split("|");
        return {
          username: String(username || "").trim(),
          role: String(role || "").trim().toLowerCase() || "student",
        };
      })
      .filter((entry) => entry.username);
  }

  function normalizeMessageRecipients(rawRecipients) {
    if (!Array.isArray(rawRecipients)) {
      return [];
    }
    const unique = new Set();
    const recipients = [];
    rawRecipients.forEach((entry) => {
      const username = normalizeIdentifier(entry);
      if (!username || unique.has(username)) {
        return;
      }
      unique.add(username);
      recipients.push(username);
    });
    return recipients;
  }

  async function validateMessageRecipients(rawRecipients, actorContext = {}) {
    const recipients = normalizeMessageRecipients(rawRecipients);
    if (!recipients.length) {
      throw { status: 400, error: "At least one student recipient is required." };
    }
    if (recipients.length > 200) {
      throw { status: 400, error: "Too many recipients. Maximum is 200." };
    }
    const invalid = recipients.filter((username) => !isValidIdentifier(username));
    if (invalid.length) {
      throw { status: 400, error: "One or more recipient usernames are invalid." };
    }
    const placeholders = recipients.map(() => "?").join(",");
    const rows = await all(
      `SELECT auth_id, department FROM auth_roster WHERE role = 'student' AND auth_id IN (${placeholders})`,
      recipients
    );
    const existing = new Set(rows.map((row) => normalizeIdentifier(row.auth_id)));
    const missing = recipients.filter((username) => !existing.has(username));
    if (missing.length) {
      throw { status: 400, error: `Recipients must be valid student accounts: ${missing.join(", ")}` };
    }

    const actorRole = String(actorContext.actorRole || "")
      .trim()
      .toLowerCase();
    const actorDepartment = normalizeDepartment(actorContext.actorDepartment || "");
    if (actorRole === "teacher" && actorDepartment && actorDepartment !== "all") {
      const outOfScope = rows
        .filter((row) => !departmentScopeMatchesStudent(actorDepartment, normalizeDepartment(row.department || "")))
        .map((row) => normalizeIdentifier(row.auth_id || ""))
        .filter(Boolean);
      if (outOfScope.length) {
        throw {
          status: 403,
          error: `You can only message students in your department scope: ${outOfScope.join(", ")}`,
        };
      }
    }
    return recipients;
  }

  async function listMessageStudentDirectory(actorContext = {}) {
    const rows = await all(
      `
        SELECT
          ar.auth_id AS username,
          COALESCE(NULLIF(TRIM(up.display_name), ''), ar.auth_id) AS display_name,
          COALESCE(ar.department, '') AS department
        FROM auth_roster ar
        LEFT JOIN user_profiles up ON up.username = ar.auth_id
        WHERE ar.role = 'student'
        ORDER BY ar.auth_id ASC
      `
    );
    const actorRole = String(actorContext.actorRole || "")
      .trim()
      .toLowerCase();
    const actorDepartment = normalizeDepartment(actorContext.actorDepartment || "");
    const scopedRows =
      actorRole === "teacher" && actorDepartment && actorDepartment !== "all"
        ? rows.filter((row) => departmentScopeMatchesStudent(actorDepartment, normalizeDepartment(row.department || "")))
        : rows;
    return scopedRows.map((row) => ({
      username: String(row.username || ""),
      display_name: String(row.display_name || row.username || ""),
      department: normalizeDepartment(row.department || ""),
      department_label: formatDepartmentLabel(row.department || ""),
    }));
  }

  async function getMessageThreadAccess(threadId, username) {
    const thread = await get("SELECT * FROM message_threads WHERE id = ? LIMIT 1", [threadId]);
    if (!thread) {
      throw { status: 404, error: "Message thread not found." };
    }
    const participant = await get(
      `
        SELECT thread_id, username, role, joined_at, last_read_message_id, last_read_at
        FROM message_participants
        WHERE thread_id = ? AND username = ?
        LIMIT 1
      `,
      [threadId, username]
    );
    if (!participant) {
      throw { status: 403, error: "You do not have access to this thread." };
    }
    return { thread, participant };
  }

  async function listMessageThreadSummariesForUser(username) {
    const rows = await all(
      `
        SELECT
          mt.id,
          COALESCE(mt.subject, '') AS subject,
          mt.created_by,
          mt.created_at,
          mt.updated_at,
          COALESCE(last_msg.id, 0) AS last_message_id,
          COALESCE(last_msg.body, '') AS last_message_body,
          COALESCE(last_msg.created_at, '') AS last_message_at,
          COALESCE(last_msg.sender_username, '') AS last_message_sender_username,
          COALESCE(participant_rollup.participants_csv, '') AS participants_csv,
          COALESCE(unread_rollup.unread_count, 0) AS unread_count
        FROM message_participants mp_self
        JOIN message_threads mt ON mt.id = mp_self.thread_id
        LEFT JOIN messages last_msg ON last_msg.id = (
          SELECT m2.id
          FROM messages m2
          WHERE m2.thread_id = mt.id
          ORDER BY m2.id DESC
          LIMIT 1
        )
        LEFT JOIN (
          SELECT
            mp2.thread_id,
            GROUP_CONCAT(mp2.username || '|' || mp2.role, ',') AS participants_csv
          FROM message_participants mp2
          GROUP BY mp2.thread_id
        ) participant_rollup ON participant_rollup.thread_id = mt.id
        LEFT JOIN (
          SELECT
            mp3.thread_id,
            COUNT(m3.id) AS unread_count
          FROM message_participants mp3
          LEFT JOIN messages m3
            ON m3.thread_id = mp3.thread_id
           AND m3.id > COALESCE(mp3.last_read_message_id, 0)
           AND LOWER(COALESCE(m3.sender_username, '')) <> LOWER(mp3.username)
          WHERE mp3.username = ?
          GROUP BY mp3.thread_id
        ) unread_rollup ON unread_rollup.thread_id = mt.id
        WHERE mp_self.username = ?
        ORDER BY CAST(COALESCE(last_msg.created_at, mt.updated_at, mt.created_at) AS timestamp) DESC, mt.id DESC
      `,
      [username, username]
    );
    return rows.map((row) => ({
      id: Number(row.id || 0),
      subject: String(row.subject || ""),
      created_by: String(row.created_by || ""),
      created_at: row.created_at || "",
      updated_at: row.updated_at || "",
      unread_count: Math.max(0, Number.parseInt(row.unread_count, 10) || 0),
      last_message: {
        id: Number(row.last_message_id || 0),
        body: String(row.last_message_body || ""),
        created_at: row.last_message_at || "",
        sender_username: String(row.last_message_sender_username || ""),
      },
      participants: parseMessageParticipantsCsv(row.participants_csv || ""),
    }));
  }

  async function getMessageThreadPayloadForUser(threadId, username) {
    const access = await getMessageThreadAccess(threadId, username);
    const [participants, messages, unreadRow] = await Promise.all([
      all(
        `
          SELECT thread_id, username, role, joined_at, last_read_message_id, last_read_at
          FROM message_participants
          WHERE thread_id = ?
          ORDER BY
            CASE WHEN username = ? THEN 0 ELSE 1 END,
            username ASC
        `,
        [threadId, username]
      ),
      all(
        `
          SELECT id, thread_id, sender_username, sender_role, body, created_at
          FROM messages
          WHERE thread_id = ?
          ORDER BY id ASC
        `,
        [threadId]
      ),
      get(
        `
          SELECT COUNT(m.id) AS unread_count
          FROM message_participants mp
          LEFT JOIN messages m
            ON m.thread_id = mp.thread_id
           AND m.id > COALESCE(mp.last_read_message_id, 0)
           AND LOWER(COALESCE(m.sender_username, '')) <> LOWER(mp.username)
          WHERE mp.thread_id = ?
            AND mp.username = ?
        `,
        [threadId, username]
      ),
    ]);
    return {
      thread: {
        id: Number(access.thread.id || 0),
        subject: String(access.thread.subject || ""),
        created_by: String(access.thread.created_by || ""),
        created_at: access.thread.created_at || "",
        updated_at: access.thread.updated_at || "",
      },
      participants: participants.map((row) => ({
        thread_id: Number(row.thread_id || 0),
        username: String(row.username || ""),
        role: String(row.role || "").toLowerCase(),
        joined_at: row.joined_at || "",
        last_read_message_id: row.last_read_message_id ? Number(row.last_read_message_id) : null,
        last_read_at: row.last_read_at || null,
      })),
      messages: messages.map((row) => ({
        id: Number(row.id || 0),
        thread_id: Number(row.thread_id || 0),
        sender_username: String(row.sender_username || ""),
        sender_role: String(row.sender_role || "").toLowerCase(),
        body: String(row.body || ""),
        created_at: row.created_at || "",
      })),
      unread_count: Math.max(0, Number.parseInt(unreadRow?.unread_count, 10) || 0),
    };
  }

  async function markMessageThreadReadForUser(threadId, username) {
    const latest = await get(
      `
        SELECT id
        FROM messages
        WHERE thread_id = ?
        ORDER BY id DESC
        LIMIT 1
      `,
      [threadId]
    );
    const latestMessageId = latest ? Number(latest.id || 0) : 0;
    if (latestMessageId > 0) {
      await run(
        `
          UPDATE message_participants
          SET last_read_message_id = ?,
              last_read_at = CURRENT_TIMESTAMP
          WHERE thread_id = ?
            AND username = ?
        `,
        [latestMessageId, threadId, username]
      );
    } else {
      await run(
        `
          UPDATE message_participants
          SET last_read_at = CURRENT_TIMESTAMP
          WHERE thread_id = ?
            AND username = ?
        `,
        [threadId, username]
      );
    }
    return latestMessageId || null;
  }

  async function getMessageUnreadCounts(username) {
    const row = await get(
      `
        SELECT
          COALESCE(SUM(CASE WHEN unread_count > 0 THEN 1 ELSE 0 END), 0) AS unread_threads,
          COALESCE(SUM(unread_count), 0) AS unread_messages
        FROM (
          SELECT
            mp.thread_id,
            COUNT(m.id) AS unread_count
          FROM message_participants mp
          LEFT JOIN messages m
            ON m.thread_id = mp.thread_id
           AND m.id > COALESCE(mp.last_read_message_id, 0)
           AND LOWER(COALESCE(m.sender_username, '')) <> LOWER(mp.username)
          WHERE mp.username = ?
          GROUP BY mp.thread_id
        ) counts
      `,
      [username]
    );
    return {
      unread_threads: Math.max(0, Number.parseInt(row?.unread_threads, 10) || 0),
      unread_messages: Math.max(0, Number.parseInt(row?.unread_messages, 10) || 0),
    };
  }

  async function createThread(input = {}) {
    const actorRole = String(input.actorRole || "").trim().toLowerCase();
    const actorUsername = normalizeIdentifier(input.actorUsername || "");
    if (!canCreateMessageThreads(actorRole)) {
      throw { status: 403, error: "Only lecturers or admins can create message threads." };
    }
    if (!actorUsername || !isValidIdentifier(actorUsername)) {
      throw { status: 401, error: "Authentication required." };
    }

    const subject = validateMessageSubjectOrThrow(input.subject || "");
    const messageBody = validateMessageBodyOrThrow(input.message || "");
    const recipients = await validateMessageRecipients(input.recipients, {
      actorRole,
      actorDepartment: input.actorDepartment || "",
    });

    const result = await withSqlTransaction(async () => {
      const threadInsert = await run(
        `
          INSERT INTO message_threads (subject, created_by, created_at, updated_at)
          VALUES (?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
        `,
        [subject || null, actorUsername]
      );
      const threadId = Number(threadInsert.lastID || 0);

      const participants = [{ username: actorUsername, role: actorRole }];
      const seenParticipants = new Set([actorUsername]);
      recipients.forEach((username) => {
        if (seenParticipants.has(username)) {
          return;
        }
        seenParticipants.add(username);
        participants.push({ username, role: "student" });
      });

      for (const participant of participants) {
        await run(
          `
            INSERT INTO message_participants (thread_id, username, role, joined_at)
            VALUES (?, ?, ?, CURRENT_TIMESTAMP)
          `,
          [threadId, participant.username, participant.role]
        );
      }

      const messageInsert = await run(
        `
          INSERT INTO messages (thread_id, sender_username, sender_role, body, created_at)
          VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
        `,
        [threadId, actorUsername, actorRole, messageBody]
      );
      const messageId = Number(messageInsert.lastID || 0);

      await run(
        `
          UPDATE message_participants
          SET last_read_message_id = ?,
              last_read_at = CURRENT_TIMESTAMP
          WHERE thread_id = ?
            AND username = ?
        `,
        [messageId, threadId, actorUsername]
      );
      await run("UPDATE message_threads SET updated_at = CURRENT_TIMESTAMP WHERE id = ?", [threadId]);

      return { threadId, messageId };
    });

    const payload = await getMessageThreadPayloadForUser(result.threadId, actorUsername);
    return {
      ok: true,
      threadId: result.threadId,
      messageId: result.messageId,
      ...payload,
    };
  }

  async function createMessage(input = {}) {
    const threadId = Number(input.threadId || 0);
    const actorUsername = normalizeIdentifier(input.actorUsername || "");
    const actorRole = String(input.actorRole || "").trim().toLowerCase();
    if (!actorUsername || !isValidIdentifier(actorUsername)) {
      throw { status: 401, error: "Authentication required." };
    }

    const messageBody = validateMessageBodyOrThrow(input.message || "");
    await getMessageThreadAccess(threadId, actorUsername);
    const inserted = await withSqlTransaction(async () => {
      const messageInsert = await run(
        `
          INSERT INTO messages (thread_id, sender_username, sender_role, body, created_at)
          VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
        `,
        [threadId, actorUsername, actorRole, messageBody]
      );
      const messageId = Number(messageInsert.lastID || 0);
      await run("UPDATE message_threads SET updated_at = CURRENT_TIMESTAMP WHERE id = ?", [threadId]);
      await run(
        `
          UPDATE message_participants
          SET last_read_message_id = ?,
              last_read_at = CURRENT_TIMESTAMP
          WHERE thread_id = ?
            AND username = ?
        `,
        [messageId, threadId, actorUsername]
      );
      return messageId;
    });

    const messageRow = await get(
      `
        SELECT id, thread_id, sender_username, sender_role, body, created_at
        FROM messages
        WHERE id = ?
        LIMIT 1
      `,
      [inserted]
    );
    return {
      ok: true,
      message: {
        id: Number(messageRow?.id || 0),
        thread_id: Number(messageRow?.thread_id || threadId),
        sender_username: String(messageRow?.sender_username || actorUsername),
        sender_role: String(messageRow?.sender_role || actorRole),
        body: String(messageRow?.body || messageBody),
        created_at: messageRow?.created_at || "",
      },
    };
  }

  return {
    canCreateMessageThreads,
    validateMessageSubjectOrThrow,
    validateMessageBodyOrThrow,
    validateMessageRecipients,
    listMessageStudentDirectory,
    getMessageThreadAccess,
    listMessageThreadSummariesForUser,
    getMessageThreadPayloadForUser,
    markMessageThreadReadForUser,
    getMessageUnreadCounts,
    createThread,
    createMessage,
  };
}

module.exports = {
  createMessageService,
};
