function createReceiptService(options = {}) {
  const fs = options.fs;
  const path = options.path;
  const crypto = options.crypto;
  const get = options.get;
  const run = options.run;
  const all = options.all;
  const parseBooleanEnv = options.parseBooleanEnv;
  const parseResourceId = options.parseResourceId;
  const normalizeIdentifier = options.normalizeIdentifier;
  const sanitizeTransactionRef = options.sanitizeTransactionRef;
  const isValidIsoLikeDate = options.isValidIsoLikeDate;
  const parseJsonObject = options.parseJsonObject;
  const queueApprovedReceiptDispatch = options.queueApprovedReceiptDispatch;
  const generateApprovedStudentReceipts = options.generateApprovedStudentReceipts;
  const logReceiptEvent = options.logReceiptEvent;
  const createSystemActorRequest = options.createSystemActorRequest;
  const projectRoot = options.projectRoot;
  const dataDir = options.dataDir;
  const approvedReceiptsDir = options.approvedReceiptsDir;
  const rowMatchesStudentDepartmentScope = options.rowMatchesStudentDepartmentScope;
  const ensurePaymentObligationsForStudent = options.ensurePaymentObligationsForStudent;
  const getDaysUntilDue = options.getDaysUntilDue;
  const getReminderMetadata = options.getReminderMetadata;
  const isPathInsideDirectory = options.isPathInsideDirectory;
  const isLikelyLegacyPlainReceipt = options.isLikelyLegacyPlainReceipt;
  const objectStorage = options.objectStorage;
  const fileMetadataService = options.fileMetadataService;
  const resolveProfileImageBytes = options.resolveProfileImageBytes;
  const logger = options.logger || console;

  function buildAutoReceiptRefBase(transactionRow) {
    const txId = String(parseResourceId(transactionRow?.id) || "").trim();
    const paymentItemId = String(parseResourceId(transactionRow?.payment_item_id) || "").trim();
    const studentToken = normalizeIdentifier(transactionRow?.student_username || "").replace(/[^a-z0-9]/g, "");
    const parts = ["AUTO", "TXN", txId, paymentItemId, studentToken.slice(0, 20)].filter(Boolean);
    return sanitizeTransactionRef(parts.join("-")) || `AUTO-TXN-${txId || Date.now()}`;
  }

  async function resolveUniquePaymentReceiptReference(preferredReference, fallbackBase) {
    const maxLen = 120;
    const preferred = sanitizeTransactionRef(preferredReference || "").slice(0, maxLen);
    if (preferred) {
      const existing = await get("SELECT id FROM payment_receipts WHERE transaction_ref = ? LIMIT 1", [preferred]);
      if (!existing) {
        return preferred;
      }
    }

    const base = sanitizeTransactionRef(fallbackBase || "AUTO-TXN").slice(0, 96) || "AUTO-TXN";
    for (let i = 0; i < 100; i += 1) {
      const suffix = i === 0 ? "" : `-${i}`;
      const candidate = sanitizeTransactionRef(`${base}${suffix}`).slice(0, maxLen);
      if (!candidate) {
        continue;
      }
      const existing = await get("SELECT id FROM payment_receipts WHERE transaction_ref = ? LIMIT 1", [candidate]);
      if (!existing) {
        return candidate;
      }
    }

    return sanitizeTransactionRef(`AUTO-${Date.now()}-${crypto.randomBytes(2).toString("hex")}`).slice(0, maxLen);
  }

  async function upsertApprovedReceiptFromTransaction(transactionId, optionsInput = {}) {
    const id = parseResourceId(transactionId);
    if (!id) {
      return { ok: false, error: "Invalid transaction ID." };
    }

    const tx = await get(
      `
        SELECT
          pt.id,
          pt.txn_ref,
          pt.amount,
          pt.paid_at,
          pt.source,
          pt.source_event_id,
          pt.status,
          pt.matched_obligation_id,
          po.student_username,
          po.payment_item_id
        FROM payment_transactions pt
        LEFT JOIN payment_obligations po ON po.id = pt.matched_obligation_id
        WHERE pt.id = ?
        LIMIT 1
      `,
      [id]
    );
    if (!tx) {
      return { ok: false, error: "Transaction not found." };
    }
    if (String(tx.status || "").toLowerCase() !== "approved") {
      return { ok: false, skipped: true, reason: "Transaction is not approved." };
    }

    const paymentItemId = parseResourceId(tx.payment_item_id);
    const studentUsername = normalizeIdentifier(tx.student_username || "");
    if (!paymentItemId || !studentUsername) {
      return {
        ok: false,
        skipped: true,
        reason: "Approved transaction is not linked to a student payment item.",
      };
    }

    const actorReq =
      optionsInput.actorReq && optionsInput.actorReq.session && optionsInput.actorReq.session.user
        ? optionsInput.actorReq
        : createSystemActorRequest(optionsInput.actorUsername || "system-reconciliation", optionsInput.actorRole || "system-reconciliation");
    const actorUsername = normalizeIdentifier(actorReq.session.user.username);
    const sourceReason = String(optionsInput.reason || "approved_transaction").trim().slice(0, 120) || "approved_transaction";
    const preferredRef = sanitizeTransactionRef(tx.txn_ref || "");

    let existingReceipt = null;
    if (preferredRef) {
      const byReference = await get("SELECT * FROM payment_receipts WHERE transaction_ref = ? LIMIT 1", [preferredRef]);
      if (
        byReference &&
        normalizeIdentifier(byReference.student_username) === studentUsername &&
        Number(byReference.payment_item_id || 0) === paymentItemId
      ) {
        existingReceipt = byReference;
      }
    }

    if (!existingReceipt) {
      existingReceipt = await get(
        `
          SELECT *
          FROM payment_receipts
          WHERE payment_item_id = ?
            AND student_username = ?
            AND status = 'approved'
          ORDER BY COALESCE(reviewed_at, submitted_at) DESC, id DESC
          LIMIT 1
        `,
        [paymentItemId, studentUsername]
      );
    }

    if (existingReceipt) {
      const mergedNotes = {
        ...parseJsonObject(existingReceipt.verification_notes || "{}", {}),
        source_transaction_id: id,
        auto_generated_from_transaction: true,
        source: String(tx.source || "").trim().toLowerCase(),
        source_reason: sourceReason,
      };
      await run(
        `
          UPDATE payment_receipts
          SET status = 'approved',
              reviewed_by = COALESCE(reviewed_by, ?),
              reviewed_at = COALESCE(reviewed_at, CURRENT_TIMESTAMP),
              rejection_reason = NULL,
              verification_notes = ?
          WHERE id = ?
        `,
        [actorUsername || "system-reconciliation", JSON.stringify(mergedNotes), existingReceipt.id]
      );
      return { ok: true, receiptId: Number(existingReceipt.id), created: false };
    }

    const paidAtIso = isValidIsoLikeDate(tx.paid_at) ? new Date(String(tx.paid_at)).toISOString() : new Date().toISOString();
    const syntheticPath = `auto-generated://transaction/${id}`;

    const transactionRef = await resolveUniquePaymentReceiptReference(
      preferredRef,
      buildAutoReceiptRefBase({
        id,
        payment_item_id: paymentItemId,
        student_username: studentUsername,
      })
    );
    const notes = {
      source_transaction_id: id,
      auto_generated_from_transaction: true,
      source: String(tx.source || "").trim().toLowerCase(),
      source_event_id: String(tx.source_event_id || "").trim(),
      source_reason: sourceReason,
    };
    const insert = await run(
      `
        INSERT INTO payment_receipts (
          payment_item_id,
          student_username,
          amount_paid,
          paid_at,
          transaction_ref,
          receipt_file_path,
          status,
          submitted_at,
          reviewed_by,
          reviewed_at,
          rejection_reason,
          verification_notes,
          extracted_text
        )
        VALUES (?, ?, ?, ?, ?, ?, 'approved', ?, ?, CURRENT_TIMESTAMP, NULL, ?, '')
      `,
      [
        paymentItemId,
        studentUsername,
        Number(tx.amount || 0),
        paidAtIso,
        transactionRef,
        syntheticPath,
        paidAtIso,
        actorUsername || "system-reconciliation",
        JSON.stringify(notes),
      ]
    );
    await logReceiptEvent(
      insert.lastID,
      actorReq,
      "auto_generate_from_transaction",
      null,
      "approved",
      `Auto-generated from approved transaction #${id}.`
    );
    return { ok: true, receiptId: Number(insert.lastID), created: true };
  }

  async function triggerApprovedReceiptDispatchForReceipt(paymentReceiptId, optionsInput = {}) {
    const receiptId = parseResourceId(paymentReceiptId);
    if (!receiptId) {
      return {
        attempted: false,
        sent: false,
        failed: true,
        error: "Invalid receipt ID.",
      };
    }
    const immediateEnabled = optionsInput.forceEnabled
      ? true
      : parseBooleanEnv(process.env.RECEIPT_IMMEDIATE_ON_APPROVE, true);
    if (!immediateEnabled) {
      return {
        attempted: false,
        sent: false,
        failed: false,
        skipped: true,
        reason: "Immediate approved-receipt generation is disabled.",
      };
    }

    const templateHtmlPath = path.resolve(
      process.env.RECEIPT_TEMPLATE_HTML || path.join(projectRoot, "templates", "approved-student-receipt.html")
    );
    const templateCssPath = path.resolve(
      process.env.RECEIPT_TEMPLATE_CSS || path.join(projectRoot, "templates", "approved-student-receipt.css")
    );

    try {
      return await queueApprovedReceiptDispatch(receiptId, async () => {
        const summary = await generateApprovedStudentReceipts({
          db: { run, get, all },
          deliveryMode: "download",
          force: !!optionsInput.forceRegenerate,
          paymentReceiptId: receiptId,
          limit: 1,
        dataDir,
        outputDir: approvedReceiptsDir,
        templateHtmlPath,
        templateCssPath,
        objectStorage,
        fileMetadataService,
        resolveProfileImageBytes,
        logger,
      });
        return {
          attempted: true,
          mode: "download",
          eligible: Number(summary.eligible || 0),
          sent: Number(summary.sent || 0),
          failed: Number(summary.failed || 0),
        };
      });
    } catch (err) {
      const reason = String(err && err.message ? err.message : err || "Unknown error");
      logger.error(
        `[approved-receipts] immediate generation failed payment_receipt_id=${receiptId} actor=${String(
          optionsInput.actorUsername || "system"
        )} reason=${reason}`
      );
      return {
        attempted: true,
        mode: "download",
        eligible: 0,
        sent: 0,
        failed: 1,
        error: reason,
      };
    }
  }

  async function ensureApprovedReceiptGeneratedForTransaction(transactionId, optionsInput = {}) {
    const receipt = await upsertApprovedReceiptFromTransaction(transactionId, optionsInput);
    if (!receipt.ok || !receipt.receiptId) {
      return {
        ok: false,
        attempted: false,
        ...receipt,
      };
    }
    const delivery = await triggerApprovedReceiptDispatchForReceipt(receipt.receiptId, {
      actorUsername:
        optionsInput.actorReq?.session?.user?.username ||
        optionsInput.actorUsername ||
        "system-reconciliation",
      forceEnabled: true,
    });
    return {
      ok: !(delivery && delivery.failed > 0),
      attempted: true,
      receiptId: receipt.receiptId,
      createdReceipt: !!receipt.created,
      delivery,
    };
  }

  async function getApprovedReceiptDispatchByReceiptId(paymentReceiptId) {
    const receiptId = parseResourceId(paymentReceiptId);
    if (!receiptId) {
      return null;
    }
    const row = await get(
      `
        SELECT
          payment_receipt_id,
          COALESCE(receipt_sent, 0) AS receipt_sent,
          COALESCE(receipt_file_path, '') AS receipt_file_path,
          last_error
        FROM approved_receipt_dispatches
        WHERE payment_receipt_id = ?
        LIMIT 1
      `,
      [receiptId]
    );
    if (!row) {
      return null;
    }
    return {
      payment_receipt_id: parseResourceId(row.payment_receipt_id),
      receipt_sent: Number(row.receipt_sent || 0),
      receipt_file_path: String(row.receipt_file_path || "").trim(),
      last_error: row.last_error ? String(row.last_error) : "",
    };
  }

  async function listApprovedReceiptsForStudent(input = {}) {
    const rowsSql = `
      SELECT
        pr.id,
        pr.payment_item_id,
        pr.amount_paid,
        pr.paid_at,
        pr.transaction_ref,
        pr.status,
        pr.submitted_at,
        pr.reviewed_by,
        pr.reviewed_at,
        pr.rejection_reason,
        pr.verification_notes,
        COALESCE(ard.receipt_sent, 0) AS approved_receipt_sent,
        ard.receipt_generated_at AS approved_receipt_generated_at,
        ard.receipt_sent_at AS approved_receipt_sent_at,
        CASE
          WHEN COALESCE(ard.receipt_file_path, '') != '' THEN 1
          ELSE 0
        END AS approved_receipt_available,
        pi.title AS payment_item_title,
        pi.expected_amount,
        pi.currency,
        pi.due_date,
        pi.target_department
      FROM payment_receipts pr
      JOIN payment_items pi ON pi.id = pr.payment_item_id
      LEFT JOIN approved_receipt_dispatches ard ON ard.payment_receipt_id = pr.id
      WHERE pr.student_username = ?
        AND pr.status = 'approved'
      ORDER BY COALESCE(pr.reviewed_at, pr.submitted_at) DESC, pr.id DESC
    `;
    const queryRows = () => all(rowsSql, [input.studentUsername]);
    let rows = (await queryRows()).filter((row) => rowMatchesStudentDepartmentScope(row, input.studentDepartment));
    const pendingApprovedReceiptIds = rows
      .filter((row) => String(row.status || "").toLowerCase() === "approved" && Number(row.approved_receipt_available || 0) !== 1)
      .map((row) => parseResourceId(row.id))
      .filter(Boolean)
      .slice(0, 3);
    if (pendingApprovedReceiptIds.length) {
      for (const paymentReceiptId of pendingApprovedReceiptIds) {
        const delivery = await triggerApprovedReceiptDispatchForReceipt(paymentReceiptId, {
          actorUsername: input.actorUsername || input.studentUsername || "system-student",
          forceEnabled: true,
        });
        if (delivery && (delivery.error || Number(delivery.failed || 0) > 0)) {
          logger.error(
            `[approved-receipts] student receipt list backfill failed payment_receipt_id=${paymentReceiptId} reason=${
              delivery.error || "unknown"
            }`
          );
        }
      }
      rows = (await queryRows()).filter((row) => rowMatchesStudentDepartmentScope(row, input.studentDepartment));
    }
    return rows;
  }

  async function buildStudentLedgerPayload(input = {}) {
    await ensurePaymentObligationsForStudent(input.studentUsername);
    const rows = await all(
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
          po.id AS obligation_id,
          COALESCE(po.amount_paid_total, 0) AS approved_paid,
          (
            COALESCE(
              (
                SELECT SUM(pt.amount)
                FROM payment_transactions pt
                WHERE pt.matched_obligation_id = po.id
                  AND pt.status IN ('needs_review', 'needs_student_confirmation', 'unmatched')
              ),
              0
            )
          ) AS pending_paid,
          po.payment_reference AS my_reference,
          po.status AS obligation_status,
          (
            SELECT ps.status
            FROM paystack_sessions ps
            WHERE ps.obligation_id = po.id
              AND ps.student_id = ?
            ORDER BY ps.updated_at DESC, ps.id DESC
            LIMIT 1
          ) AS paystack_state,
          (
            SELECT ps.gateway_reference
            FROM paystack_sessions ps
            WHERE ps.obligation_id = po.id
              AND ps.student_id = ?
            ORDER BY ps.updated_at DESC, ps.id DESC
            LIMIT 1
          ) AS paystack_reference,
          (
            SELECT pr2.id
            FROM payment_receipts pr2
            JOIN approved_receipt_dispatches ard2 ON ard2.payment_receipt_id = pr2.id
            WHERE pr2.payment_item_id = pi.id
              AND pr2.student_username = ?
              AND pr2.status = 'approved'
              AND COALESCE(ard2.receipt_file_path, '') != ''
            ORDER BY COALESCE(pr2.reviewed_at, pr2.submitted_at) DESC, pr2.id DESC
            LIMIT 1
          ) AS approved_receipt_id,
          (
            SELECT pr3.id
            FROM payment_receipts pr3
            WHERE pr3.payment_item_id = pi.id
              AND pr3.student_username = ?
              AND pr3.status = 'approved'
            ORDER BY COALESCE(pr3.reviewed_at, pr3.submitted_at) DESC, pr3.id DESC
            LIMIT 1
          ) AS approved_receipt_candidate_id
        FROM payment_items pi
        LEFT JOIN payment_obligations po
          ON po.payment_item_id = pi.id
         AND po.student_username = ?
        WHERE (pi.available_until IS NULL OR CAST(pi.available_until AS timestamp) > CURRENT_TIMESTAMP)
        ORDER BY
          CASE WHEN pi.due_date IS NULL OR pi.due_date = '' THEN 1 ELSE 0 END ASC,
          pi.due_date ASC,
          pi.id ASC
      `,
      [
        input.studentUsername,
        input.studentUsername,
        input.studentUsername,
        input.studentUsername,
        input.studentUsername,
      ]
    );

    const scopedRows = rows.filter((row) => rowMatchesStudentDepartmentScope(row, input.studentDepartment));

    for (const row of scopedRows) {
      const paymentItemId = parseResourceId(row.id);
      const obligationId = parseResourceId(row.obligation_id);
      const expectedAmount = Number(row.expected_amount || 0);
      const approvedPaid = Number(row.approved_paid || 0);
      const isSettled = Number.isFinite(expectedAmount) && approvedPaid >= expectedAmount - 0.01;
      const hasDownloadableApprovedReceipt = !!parseResourceId(row.approved_receipt_id);
      if (!paymentItemId || !obligationId || !isSettled || hasDownloadableApprovedReceipt) {
        continue;
      }
      const candidateReceiptId = parseResourceId(row.approved_receipt_candidate_id);
      if (candidateReceiptId) {
        const delivery = await triggerApprovedReceiptDispatchForReceipt(candidateReceiptId, {
          actorUsername: "system-ledger",
          forceEnabled: true,
        });
        if (delivery && (delivery.error || Number(delivery.failed || 0) > 0)) {
          logger.error(
            `[approved-receipts] ledger candidate backfill failed payment_receipt_id=${candidateReceiptId} reason=${
              delivery.error || "unknown"
            }`
          );
        }
        const dispatch = await getApprovedReceiptDispatchByReceiptId(candidateReceiptId);
        if (dispatch && dispatch.receipt_file_path) {
          row.approved_receipt_id = candidateReceiptId;
          continue;
        }
      }
      const latestApprovedTransaction = await get(
        `
          SELECT id
          FROM payment_transactions
          WHERE matched_obligation_id = ?
            AND status = 'approved'
          ORDER BY COALESCE(reviewed_at, created_at) DESC, id DESC
          LIMIT 1
        `,
        [obligationId]
      );
      const approvedTransactionId = parseResourceId(latestApprovedTransaction?.id);
      if (!approvedTransactionId) {
        continue;
      }
      const receiptGeneration = await ensureApprovedReceiptGeneratedForTransaction(approvedTransactionId, {
        actorReq: createSystemActorRequest("system-ledger", "system-reconciliation"),
        reason: "student_ledger_backfill",
      });
      if (receiptGeneration && receiptGeneration.ok && receiptGeneration.receiptId) {
        row.approved_receipt_id = receiptGeneration.receiptId;
      }
    }

    const items = scopedRows.map((row) => {
      const expectedAmount = Number(row.expected_amount || 0);
      const approvedPaid = Number(row.approved_paid || 0);
      const pendingPaid = Number(row.pending_paid || 0);
      const outstanding = Math.max(0, expectedAmount - approvedPaid);
      const daysUntilDue = getDaysUntilDue(row.due_date);
      const reminder = getReminderMetadata(daysUntilDue, outstanding);
      const { approved_receipt_candidate_id: _approvedReceiptCandidateId, ...rowWithoutCandidate } = row;
      return {
        ...rowWithoutCandidate,
        expected_amount: expectedAmount,
        approved_paid: approvedPaid,
        pending_paid: pendingPaid,
        approved_receipt_id: parseResourceId(row.approved_receipt_id),
        outstanding,
        days_until_due: daysUntilDue,
        reminder_level: reminder.level,
        reminder_text: reminder.text,
      };
    });

    const summary = items.reduce(
      (acc, item) => {
        acc.totalDue += Number(item.expected_amount || 0);
        acc.totalApprovedPaid += Number(item.approved_paid || 0);
        acc.totalPendingPaid += Number(item.pending_paid || 0);
        acc.totalOutstanding += Number(item.outstanding || 0);
        if (item.reminder_level === "overdue") {
          acc.overdueCount += 1;
        }
        if (item.reminder_level === "urgent" || item.reminder_level === "today") {
          acc.dueSoonCount += 1;
        }
        return acc;
      },
      {
        totalDue: 0,
        totalApprovedPaid: 0,
        totalPendingPaid: 0,
        totalOutstanding: 0,
        overdueCount: 0,
        dueSoonCount: 0,
      }
    );

    const nextDueItem =
      items.find((item) => Number(item.outstanding || 0) > 0 && Number.isFinite(item.days_until_due) && item.days_until_due >= 0) ||
      null;

    const timeline = await all(
      `
        SELECT
          re.id,
          re.action,
          re.note,
          re.created_at,
          pi.title AS payment_item_title,
          pi.target_department
        FROM reconciliation_events re
        JOIN payment_obligations po ON po.id = re.obligation_id
        LEFT JOIN payment_items pi ON pi.id = po.payment_item_id
        WHERE po.student_username = ?
        ORDER BY re.created_at DESC, re.id DESC
        LIMIT 25
      `,
      [input.studentUsername]
    );
    const scopedTimeline = timeline.filter((row) => rowMatchesStudentDepartmentScope(row, input.studentDepartment));

    return {
      summary,
      nextDueItem,
      items,
      timeline: scopedTimeline,
      generatedAt: new Date().toISOString(),
    };
  }

  async function resolveApprovedReceiptFileAccess(input = {}) {
    const receiptId = parseResourceId(input.paymentReceiptId);
    if (!receiptId) {
      throw { status: 400, error: "Invalid receipt ID." };
    }
    const row = await get(
      `
        SELECT
          pr.id,
          pr.student_username,
          pr.receipt_file_path,
          ard.receipt_file_path AS approved_receipt_file_path
        FROM payment_receipts pr
        LEFT JOIN approved_receipt_dispatches ard ON ard.payment_receipt_id = pr.id
        WHERE pr.id = ?
        LIMIT 1
      `,
      [receiptId]
    );
    if (!row) {
      throw { status: 404, error: "Receipt not found." };
    }
    const canAccess = input.isAdmin || input.isTeacher || input.actorUsername === row.student_username;
    if (!canAccess) {
      throw { status: 403, error: "You do not have permission to view this receipt file." };
    }
    if (input.refreshRequested) {
      const forcedDelivery = await triggerApprovedReceiptDispatchForReceipt(receiptId, {
        actorUsername: input.actorUsername || "system-download",
        forceEnabled: true,
        forceRegenerate: true,
      });
      if (forcedDelivery && (forcedDelivery.error || Number(forcedDelivery.failed || 0) > 0)) {
        logger.error(
          `[approved-receipts] forced regeneration failed payment_receipt_id=${receiptId} reason=${
            forcedDelivery.error || "unknown"
          }`
        );
      }
    }
    let approvedReceiptPath = String(row.approved_receipt_file_path || "").trim();
    if (!approvedReceiptPath) {
      const delivery = await triggerApprovedReceiptDispatchForReceipt(receiptId, {
        actorUsername: input.actorUsername || "system-download",
        forceEnabled: true,
      });
      if (delivery && (delivery.error || Number(delivery.failed || 0) > 0)) {
        logger.error(
          `[approved-receipts] on-demand download generation failed payment_receipt_id=${receiptId} reason=${
            delivery.error || "unknown"
          }`
        );
      }
      const dispatch = await getApprovedReceiptDispatchByReceiptId(receiptId);
      approvedReceiptPath = String(dispatch?.receipt_file_path || "").trim();
    }
    if (!approvedReceiptPath) {
      throw { status: 404, error: "Approved receipt is not available yet. Please refresh and try again." };
    }

    const selectedPath = approvedReceiptPath;
    if (!selectedPath) {
      throw { status: 404, error: "Approved receipt file is missing." };
    }

    const parsedObjectRef =
      objectStorage && typeof objectStorage.parseObjectRef === "function"
        ? objectStorage.parseObjectRef(selectedPath)
        : null;
    if (parsedObjectRef && objectStorage) {
      try {
        const downloaded = await objectStorage.downloadObject({
          bucket: parsedObjectRef.bucket,
          objectPath: parsedObjectRef.objectPath,
        });
        const metadataRecord =
          fileMetadataService &&
          (await fileMetadataService.getFileRecordByLegacyUrl(`/api/payment-receipts/${receiptId}/file?variant=approved`));
        return {
          mode: "object_storage",
          contentType: downloaded.contentType || metadataRecord?.content_type || "application/pdf",
          buffer: downloaded.buffer,
          downloadName: `approved-receipt-${receiptId}.pdf`,
          objectRef: selectedPath,
        };
      } catch (_downloadErr) {
        throw { status: 404, error: "Approved receipt file is missing." };
      }
    }

    const absolutePath = path.resolve(selectedPath);
    if (!isPathInsideDirectory(approvedReceiptsDir, absolutePath) || !fs.existsSync(absolutePath)) {
      throw { status: 404, error: "Approved receipt file is missing." };
    }
    return {
      mode: "local_path",
      contentType: "application/pdf",
      absolutePath,
      downloadName: path.basename(absolutePath) || `approved-receipt-${receiptId}.pdf`,
    };
  }

  return {
    buildAutoReceiptRefBase,
    resolveUniquePaymentReceiptReference,
    upsertApprovedReceiptFromTransaction,
    triggerApprovedReceiptDispatchForReceipt,
    ensureApprovedReceiptGeneratedForTransaction,
    getApprovedReceiptDispatchByReceiptId,
    listApprovedReceiptsForStudent,
    buildStudentLedgerPayload,
    resolveApprovedReceiptFileAccess,
  };
}

module.exports = {
  createReceiptService,
};
