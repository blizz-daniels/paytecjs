function createPaymentDomain(options = {}) {
  const all = options.all;
  const get = options.get;
  const run = options.run;
  const isValidIsoLikeDate = options.isValidIsoLikeDate;
  const parseMoneyValue = options.parseMoneyValue;
  const parseCurrency = options.parseCurrency;
  const parseAvailabilityDays = options.parseAvailabilityDays;
  const computeAvailableUntil = options.computeAvailableUntil;
  const toDateOnly = options.toDateOnly;
  const sanitizeTransactionRef = options.sanitizeTransactionRef;
  const normalizeReference = options.normalizeReference;
  const normalizeWhitespace = options.normalizeWhitespace;
  const normalizeStatementName = options.normalizeStatementName;
  const normalizeIdentifier = options.normalizeIdentifier;
  const resolveContentTargetDepartment = options.resolveContentTargetDepartment;
  const ensureCanManageContent = options.ensureCanManageContent;
  const ensurePaymentObligationsForStudent = options.ensurePaymentObligationsForStudent;
  const ensurePaymentObligationsForPaymentItem = options.ensurePaymentObligationsForPaymentItem;
  const rowMatchesStudentDepartmentScope = options.rowMatchesStudentDepartmentScope;
  const syncPaymentItemNotification = options.syncPaymentItemNotification;
  const logAuditEvent = options.logAuditEvent;
  const parseResourceId = options.parseResourceId;
  const buildTransactionChecksum = options.buildTransactionChecksum;

  function getDaysUntilDue(dueDateValue) {
    if (!dueDateValue || !isValidIsoLikeDate(dueDateValue)) {
      return null;
    }
    const dueDate = new Date(String(dueDateValue));
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);
    const diffMs = dueDate.getTime() - startOfToday.getTime();
    return Math.floor(diffMs / (1000 * 60 * 60 * 24));
  }

  function getReminderMetadata(daysUntilDue, outstandingAmount) {
    if (!Number.isFinite(outstandingAmount) || outstandingAmount <= 0) {
      return { level: "settled", text: "Settled" };
    }
    if (!Number.isFinite(daysUntilDue)) {
      return { level: "no_due_date", text: "No due date" };
    }
    if (daysUntilDue < 0) {
      return { level: "overdue", text: `Overdue by ${Math.abs(daysUntilDue)} day(s)` };
    }
    if (daysUntilDue === 0) {
      return { level: "today", text: "Due today" };
    }
    if (daysUntilDue <= 3) {
      return { level: "urgent", text: `Due in ${daysUntilDue} day(s)` };
    }
    if (daysUntilDue <= 7) {
      return { level: "soon", text: `Due in ${daysUntilDue} day(s)` };
    }
    return { level: "upcoming", text: `Due in ${daysUntilDue} day(s)` };
  }

  function normalizeTransactionInput(input = {}) {
    const amount = parseMoneyValue(input.amount);
    const paidAtRaw = String(input.date || input.paid_at || input.paidAt || "").trim();
    const paidAt = paidAtRaw && isValidIsoLikeDate(paidAtRaw) ? new Date(paidAtRaw).toISOString() : "";
    const normalizedPaidDate = toDateOnly(paidAt || paidAtRaw);
    const txnRef = sanitizeTransactionRef(input.txn_ref || input.transactionRef || input.reference || "");
    const normalizedTxnRef = normalizeReference(txnRef);
    const payerName = normalizeWhitespace(input.payer_name || input.payerName || input.name || "");
    const normalizedPayerName = normalizeStatementName(payerName);
    const source = String(input.source || "statement_upload")
      .trim()
      .toLowerCase()
      .slice(0, 40);
    const sourceEventId = String(input.source_event_id || input.sourceEventId || "").trim().slice(0, 160);
    const sourceFileName = String(input.source_file_name || input.sourceFileName || "").trim().slice(0, 255);
    const studentHintUsername = normalizeIdentifier(input.student_username || input.studentUsername || "");
    const paymentItemHintId = parseResourceId(input.payment_item_id || input.paymentItemId || "");
    const rawPayload = input.raw_payload ?? input.rawPayload ?? input;
    const checksum = String(input.checksum || "").trim() || buildTransactionChecksum({
      source,
      txn_ref: txnRef,
      amount,
      date: normalizedPaidDate,
      payer_name: payerName,
    });
    if (!Number.isFinite(amount) || amount <= 0 || !normalizedPaidDate) {
      return null;
    }
    return {
      source,
      sourceEventId,
      sourceFileName,
      txnRef,
      amount,
      paidAt: paidAt || normalizedPaidDate,
      payerName,
      normalizedTxnRef,
      normalizedPaidDate,
      normalizedPayerName,
      studentHintUsername,
      paymentItemHintId,
      rawPayload,
      checksum: checksum || null,
    };
  }

  function toTransactionCandidateRow(normalized) {
    return {
      id: 0,
      source: normalized.source,
      amount: normalized.amount,
      paid_at: normalized.paidAt,
      normalized_paid_date: normalized.normalizedPaidDate,
      txn_ref: normalized.txnRef,
      normalized_txn_ref: normalized.normalizedTxnRef,
      payer_name: normalized.payerName,
      normalized_payer_name: normalized.normalizedPayerName,
      student_hint_username: normalized.studentHintUsername,
      payment_item_hint_id: normalized.paymentItemHintId,
    };
  }

  function validatePaymentItemInput(input = {}) {
    const title = String(input.title || "").trim();
    const description = String(input.description || "").trim();
    const expectedAmount = parseMoneyValue(input.expectedAmount);
    const currency = parseCurrency(input.currency || "NGN");
    const dueDateRaw = String(input.dueDate || "").trim();
    const dueDate = dueDateRaw || null;
    const hasAvailabilityDays = String(input.availabilityDays ?? "").trim() !== "";
    const availabilityDays = parseAvailabilityDays(input.availabilityDays);
    const availableUntil = hasAvailabilityDays ? computeAvailableUntil(availabilityDays) : null;

    if (!title || title.length > 120) {
      throw { status: 400, error: "Title is required and must be 120 characters or less." };
    }
    if (!Number.isFinite(expectedAmount) || expectedAmount <= 0) {
      throw { status: 400, error: "Expected amount must be greater than zero." };
    }
    if (!currency) {
      throw { status: 400, error: "Currency must be a 3-letter code (e.g. NGN)." };
    }
    if (dueDate && !isValidIsoLikeDate(dueDate)) {
      throw { status: 400, error: "Due date format is invalid." };
    }
    if (hasAvailabilityDays && !availabilityDays) {
      throw { status: 400, error: "Availability days must be a whole number between 1 and 3650." };
    }

    return {
      title,
      description,
      expectedAmount,
      currency,
      dueDate,
      availabilityDays,
      availableUntil,
    };
  }

  async function listPaymentItems(input = {}) {
    const actorRole = String(input.actorRole || "").trim().toLowerCase();
    const actorUsername = normalizeIdentifier(input.actorUsername || "");
    const actorDepartment = String(input.actorDepartment || "").trim();
    const isStudent = actorRole === "student";
    let rows = [];
    if (isStudent) {
      await ensurePaymentObligationsForStudent(actorUsername);
      rows = await all(
        `
          SELECT
            pi.id,
            pi.title,
            pi.description,
            pi.expected_amount,
            pi.currency,
            pi.due_date,
            pi.available_until,
            pi.availability_days,
            pi.target_department,
            pi.created_by,
            pi.created_at,
            po.payment_reference AS my_reference,
            po.status AS obligation_status,
            COALESCE(po.amount_paid_total, 0) AS amount_paid_total
          FROM payment_items pi
          LEFT JOIN payment_obligations po
            ON po.payment_item_id = pi.id
           AND po.student_username = ?
          WHERE (pi.available_until IS NULL OR CAST(pi.available_until AS timestamp) > CURRENT_TIMESTAMP)
          ORDER BY pi.created_at DESC, pi.id DESC
        `,
        [actorUsername]
      );
      rows = rows.filter((row) => rowMatchesStudentDepartmentScope(row, actorDepartment));
      return rows;
    }

    return all(
      `
        SELECT
          pi.id,
          pi.title,
          pi.description,
          pi.expected_amount,
          pi.currency,
          pi.due_date,
          pi.available_until,
          pi.availability_days,
          pi.target_department,
          pi.created_by,
          pi.created_at
        FROM payment_items pi
        ORDER BY pi.created_at DESC, pi.id DESC
      `
    );
  }

  async function createPaymentItem(input = {}) {
    const validated = validatePaymentItemInput(input);
    const targetDepartment = await resolveContentTargetDepartment(input.req, input.targetDepartment || "");
    const result = await run(
      `
        INSERT INTO payment_items (
          title,
          description,
          expected_amount,
          currency,
          due_date,
          available_until,
          availability_days,
          target_department,
          created_by
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      [
        validated.title,
        validated.description,
        validated.expectedAmount,
        validated.currency,
        validated.dueDate,
        validated.availableUntil,
        validated.availabilityDays,
        targetDepartment,
        input.actorUsername,
      ]
    );
    const inserted = await get("SELECT * FROM payment_items WHERE id = ? LIMIT 1", [result.lastID]);
    await syncPaymentItemNotification(input.req, inserted);
    await ensurePaymentObligationsForPaymentItem(result.lastID);
    await logAuditEvent(
      input.req,
      "create",
      "payment_item",
      result.lastID,
      input.actorUsername,
      `Created payment item "${validated.title.slice(0, 80)}" (${validated.currency} ${validated.expectedAmount})`
    );
    return { ok: true, id: result.lastID };
  }

  async function updatePaymentItem(input = {}) {
    const id = parseResourceId(input.id);
    if (!id) {
      throw { status: 400, error: "Invalid payment item ID." };
    }
    const validated = validatePaymentItemInput(input);
    const access = await ensureCanManageContent(input.req, "payment_items", id);
    if (access.error === "not_found") {
      throw { status: 404, error: "Payment item not found." };
    }
    if (access.error === "forbidden") {
      throw { status: 403, error: "You can only edit your own payment item." };
    }
    const targetDepartment = await resolveContentTargetDepartment(
      input.req,
      input.targetDepartment || access.row.target_department || ""
    );

    await run(
      `
        UPDATE payment_items
        SET title = ?,
            description = ?,
            expected_amount = ?,
            currency = ?,
            due_date = ?,
            available_until = ?,
            availability_days = ?,
            target_department = ?
        WHERE id = ?
      `,
      [
        validated.title,
        validated.description,
        validated.expectedAmount,
        validated.currency,
        validated.dueDate,
        validated.availableUntil,
        validated.availabilityDays,
        targetDepartment,
        id,
      ]
    );
    const updated = await get("SELECT * FROM payment_items WHERE id = ? LIMIT 1", [id]);
    await syncPaymentItemNotification(input.req, updated);
    await ensurePaymentObligationsForPaymentItem(id);
    await logAuditEvent(
      input.req,
      "edit",
      "payment_item",
      id,
      access.row.created_by,
      `Edited payment item "${validated.title.slice(0, 80)}" (${validated.currency} ${validated.expectedAmount})`
    );
    return { ok: true };
  }

  async function deletePaymentItem(input = {}) {
    const id = parseResourceId(input.id);
    if (!id) {
      throw { status: 400, error: "Invalid payment item ID." };
    }
    const access = await ensureCanManageContent(input.req, "payment_items", id);
    if (access.error === "not_found") {
      throw { status: 404, error: "Payment item not found." };
    }
    if (access.error === "forbidden") {
      throw { status: 403, error: "You can only delete your own payment item." };
    }

    const receiptCount = await get("SELECT COUNT(*) AS total FROM payment_receipts WHERE payment_item_id = ?", [id]);
    if (Number(receiptCount?.total || 0) > 0) {
      throw { status: 409, error: "Cannot delete a payment item that already has receipts." };
    }
    const reconciledCount = await get(
      `
        SELECT COUNT(*) AS total
        FROM payment_transactions pt
        JOIN payment_obligations po ON po.id = pt.matched_obligation_id
        WHERE po.payment_item_id = ?
      `,
      [id]
    );
    if (Number(reconciledCount?.total || 0) > 0) {
      throw { status: 409, error: "Cannot delete a payment item that already has reconciled transactions." };
    }

    await run("DELETE FROM payment_obligations WHERE payment_item_id = ?", [id]);
    await run("DELETE FROM payment_items WHERE id = ?", [id]);
    await run("DELETE FROM notifications WHERE related_payment_item_id = ? AND auto_generated = 1", [id]);
    await logAuditEvent(
      input.req,
      "delete",
      "payment_item",
      id,
      access.row.created_by,
      `Deleted payment item "${String(access.row.title || "").slice(0, 80)}"`
    );
    return { ok: true };
  }

  return {
    getDaysUntilDue,
    getReminderMetadata,
    normalizeTransactionInput,
    toTransactionCandidateRow,
    validatePaymentItemInput,
    listPaymentItems,
    createPaymentItem,
    updatePaymentItem,
    deletePaymentItem,
  };
}

module.exports = {
  createPaymentDomain,
};
