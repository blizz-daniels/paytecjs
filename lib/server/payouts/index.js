function createPayoutDomain(options = {}) {
  const crypto = options.crypto;
  const get = options.get;
  const run = options.run;
  const all = options.all;
  const withSqlTransaction = options.withSqlTransaction;
  const normalizeIdentifier = options.normalizeIdentifier;
  const sanitizeTransactionRef = options.sanitizeTransactionRef;
  const toKoboFromAmount = options.toKoboFromAmount;
  const toAmountFromKobo = options.toAmountFromKobo;
  const parseResourceId = options.parseResourceId;
  const getLecturerPayoutSummary = options.getLecturerPayoutSummary;
  const getLecturerPayoutAccount = options.getLecturerPayoutAccount;
  const updateLecturerPayoutAccount = options.updateLecturerPayoutAccount;
  const getLecturerPayoutTransfers = options.getLecturerPayoutTransfers;
  const getLecturerPayoutLedgerRows = options.getLecturerPayoutLedgerRows;
  const reserveLecturerPayoutBatch = options.reserveLecturerPayoutBatch;
  const queueLecturerPayoutDispatch = options.queueLecturerPayoutDispatch;
  const dispatchQueuedLecturerPayoutTransfer = options.dispatchQueuedLecturerPayoutTransfer;
  const getLecturerPayoutTransferById = options.getLecturerPayoutTransferById;
  const logLecturerPayoutEvent = options.logLecturerPayoutEvent;

  function maskBankAccountNumber(value) {
    const digits = String(value || "").replace(/\D/g, "");
    if (!digits) {
      return "";
    }
    const tail = digits.slice(-4);
    return `**** ${tail}`;
  }

  function normalizeBankCode(value) {
    return String(value || "")
      .trim()
      .toUpperCase()
      .replace(/\s+/g, "");
  }

  function normalizeBankAccountNumber(value) {
    return String(value || "").replace(/\D/g, "").trim();
  }

  function normalizePayoutStatus(value) {
    const status = String(value || "")
      .trim()
      .toLowerCase();
    if (["queued", "processing", "success", "failed", "reversed", "review", "paid", "reserved"].includes(status)) {
      return status;
    }
    return "queued";
  }

  function normalizePayoutReviewState(value) {
    const status = String(value || "")
      .trim()
      .toLowerCase();
    if (["not_required", "pending", "required", "approved", "rejected"].includes(status)) {
      return status;
    }
    return "not_required";
  }

  function roundCurrencyAmount(value) {
    const amount = Number(value || 0);
    if (!Number.isFinite(amount)) {
      return 0;
    }
    return Number(amount.toFixed(2));
  }

  function amountToKobo(amount) {
    return toKoboFromAmount(roundCurrencyAmount(amount));
  }

  function koboToAmount(kobo) {
    return toAmountFromKobo(Number(kobo || 0));
  }

  function buildLecturerPayoutTransferReference(lecturerUsername, ledgerIds = []) {
    const lecturerToken = normalizeIdentifier(lecturerUsername || "").replace(/[^a-z0-9]/g, "").slice(0, 18) || "lecturer";
    const ledgerToken = Array.isArray(ledgerIds) && ledgerIds.length ? ledgerIds.join("-").slice(0, 24) : "batch";
    const reference = sanitizeTransactionRef(`PAYOUT-${lecturerToken}-${ledgerToken}-${Date.now()}-${crypto.randomBytes(3).toString("hex")}`);
    return reference.slice(0, 120);
  }

  function summarizePayoutAccountRow(row) {
    if (!row) {
      return null;
    }
    return {
      id: Number(row.id || 0),
      lecturer_username: String(row.lecturer_username || ""),
      bank_name: String(row.bank_name || ""),
      bank_code: String(row.bank_code || ""),
      account_name: String(row.account_name || ""),
      account_last4: String(row.account_last4 || ""),
      account_masked: maskBankAccountNumber(row.account_last4 || row.account_number_encrypted || ""),
      recipient_type: String(row.recipient_type || "nuban"),
      recipient_status: String(row.recipient_status || "active"),
      auto_payout_enabled: Number(row.auto_payout_enabled || 0) === 1,
      review_required: Number(row.review_required || 0) === 1,
      verified_at: row.verified_at || null,
      created_at: row.created_at || null,
      updated_at: row.updated_at || null,
    };
  }

  function summarizePayoutTransferRow(row) {
    if (!row) {
      return null;
    }
    return {
      id: Number(row.id || 0),
      lecturer_username: String(row.lecturer_username || ""),
      payout_account_id: Number(row.payout_account_id || 0),
      transfer_reference: String(row.transfer_reference || ""),
      transfer_code: row.transfer_code || null,
      total_amount: roundCurrencyAmount(row.total_amount),
      currency: String(row.currency || "NGN").toUpperCase(),
      status: normalizePayoutStatus(row.status),
      trigger_source: String(row.trigger_source || "auto"),
      review_state: normalizePayoutReviewState(row.review_state),
      failure_reason: row.failure_reason || null,
      attempt_count: Number(row.attempt_count || 0),
      ledger_count: Number(row.ledger_count || 0),
      requested_by: row.requested_by || null,
      reviewed_by: row.reviewed_by || null,
      reviewed_at: row.reviewed_at || null,
      dispatched_at: row.dispatched_at || null,
      completed_at: row.completed_at || null,
      created_at: row.created_at || null,
      updated_at: row.updated_at || null,
    };
  }

  function summarizePayoutLedgerRow(row) {
    if (!row) {
      return null;
    }
    return {
      id: Number(row.id || 0),
      lecturer_username: String(row.lecturer_username || ""),
      payment_transaction_id: Number(row.payment_transaction_id || 0),
      payment_item_id: Number(row.payment_item_id || 0),
      obligation_id: row.obligation_id ? Number(row.obligation_id) : null,
      gross_amount: roundCurrencyAmount(row.gross_amount),
      share_bps: Number(row.share_bps || 0),
      payout_amount: roundCurrencyAmount(row.payout_amount),
      currency: String(row.currency || "NGN").toUpperCase(),
      status: normalizePayoutStatus(row.status),
      available_at: row.available_at || null,
      payout_transfer_id: row.payout_transfer_id ? Number(row.payout_transfer_id) : null,
      review_reason: row.review_reason || null,
      source_status: String(row.source_status || "approved"),
      created_at: row.created_at || null,
      updated_at: row.updated_at || null,
    };
  }

  function buildPayoutProviderResponseSnapshot(payload = {}) {
    const data = payload && typeof payload === "object" && !Array.isArray(payload) ? payload.data || payload : {};
    return {
      status: payload?.status === false ? false : true,
      message: String(payload?.message || "").slice(0, 200),
      data: {
        recipient_code: data?.recipient_code || data?.transfer_code || null,
        transfer_code: data?.transfer_code || null,
        status: data?.status || null,
        currency: data?.currency || null,
        amount: data?.amount || null,
        bank_name: data?.details?.bank_name || null,
        account_name: data?.details?.account_name || null,
        recipient_type: data?.type || null,
        active: typeof data?.active === "boolean" ? data.active : null,
      },
    };
  }

  async function getPayoutSummaryForLecturer(lecturerUsername) {
    return getLecturerPayoutSummary(lecturerUsername);
  }

  async function getPayoutAccountForLecturer(lecturerUsername) {
    const account = await getLecturerPayoutAccount(lecturerUsername);
    return {
      account: summarizePayoutAccountRow(account),
    };
  }

  async function savePayoutAccount(input = {}) {
    const account = await updateLecturerPayoutAccount(input.lecturerUsername, input.body || {}, {
      req: input.req,
    });
    return {
      ok: true,
      account,
    };
  }

  async function getPayoutHistory(input = {}) {
    const limit = Number.isFinite(Number(input.limit)) ? Number(input.limit) : 25;
    const offset = Number.isFinite(Number(input.offset)) ? Number(input.offset) : 0;
    const status = String(input.status || "").trim().toLowerCase();
    const [payout, transfers, ledger] = await Promise.all([
      getLecturerPayoutSummary(input.lecturerUsername),
      getLecturerPayoutTransfers({
        lecturerUsername: input.lecturerUsername,
        status,
        limit,
        offset,
      }),
      getLecturerPayoutLedgerRows({
        lecturerUsername: input.lecturerUsername,
        status,
        limit,
        offset,
      }),
    ]);
    return {
      account: payout.account,
      summary: payout.summary,
      transfers,
      ledger: ledger.map(summarizePayoutLedgerRow),
    };
  }

  async function requestPayout(input = {}) {
    const batch = await reserveLecturerPayoutBatch(input.lecturerUsername, {
      amount: input.amount,
      triggerSource: "manual",
      requestedBy: input.lecturerUsername,
      req: input.req,
    });
    if (batch?.activeTransfer?.id) {
      await queueLecturerPayoutDispatch(`transfer-${batch.activeTransfer.id}`, async () =>
        dispatchQueuedLecturerPayoutTransfer(batch.activeTransfer.id, { req: input.req })
      );
    }
    return {
      ok: true,
      ...batch,
      payout: await getLecturerPayoutSummary(input.lecturerUsername),
    };
  }

  async function listAdminPayoutTransfers(input = {}) {
    const lecturerUsername = normalizeIdentifier(input.lecturerUsername || "");
    const limit = Number.isFinite(Number(input.limit)) ? Number(input.limit) : 50;
    const offset = Number.isFinite(Number(input.offset)) ? Number(input.offset) : 0;
    const status = String(input.status || "").trim().toLowerCase();
    const [transfers, payout] = await Promise.all([
      getLecturerPayoutTransfers({
        lecturerUsername,
        status,
        limit,
        offset,
      }),
      lecturerUsername ? getLecturerPayoutSummary(lecturerUsername) : Promise.resolve(null),
    ]);
    return {
      payout: payout || null,
      transfers,
    };
  }

  async function markTransferForReview(input = {}) {
    const transferId = parseResourceId(input.transferId);
    if (!transferId) {
      throw { status: 400, error: "A payout transfer id is required.", code: "payout_transfer_review_invalid_id" };
    }
    const transfer = await getLecturerPayoutTransferById(transferId);
    if (!transfer) {
      throw { status: 404, error: "Payout transfer not found.", code: "payout_transfer_not_found" };
    }
    const note = String(input.note || input.reason || "manual_review").trim().slice(0, 500) || "manual_review";
    await withSqlTransaction(async () => {
      await run(
        `
          UPDATE lecturer_payout_transfers
          SET status = 'review',
              review_state = 'required',
              reviewed_by = ?,
              reviewed_at = CURRENT_TIMESTAMP,
              failure_reason = ?,
              updated_at = CURRENT_TIMESTAMP
          WHERE id = ?
        `,
        [input.actorUsername || "admin", note, transfer.id]
      );
      await run(
        `
          UPDATE lecturer_payout_ledger
          SET status = 'review',
              review_reason = ?,
              updated_at = CURRENT_TIMESTAMP
          WHERE payout_transfer_id = ?
        `,
        [note, transfer.id]
      );
    });
    await logLecturerPayoutEvent({
      transferId: transfer.id,
      req: input.req,
      eventType: "payout_transfer_reviewed",
      note: `Admin marked payout transfer ${transfer.transfer_reference} for review.`,
      payload: {
        lecturer_username: transfer.lecturer_username,
        transfer_reference: transfer.transfer_reference,
        reason: note,
      },
    });
    return {
      ok: true,
      transfer: await getLecturerPayoutTransferById(transferId),
    };
  }

  async function retryTransfer(input = {}) {
    const transferId = parseResourceId(input.transferId);
    if (!transferId) {
      throw { status: 400, error: "A payout transfer id is required.", code: "payout_transfer_retry_invalid_id" };
    }
    const transfer = await getLecturerPayoutTransferById(transferId);
    if (!transfer) {
      throw { status: 404, error: "Payout transfer not found.", code: "payout_transfer_not_found" };
    }
    const currentStatus = String(transfer.status || "").trim().toLowerCase();
    if (currentStatus === "success") {
      throw {
        status: 409,
        error: "Completed payout transfers cannot be retried.",
        code: "payout_transfer_retry_conflict",
      };
    }
    await run(
      `
        UPDATE lecturer_payout_transfers
        SET status = 'queued',
            review_state = 'not_required',
            failure_reason = NULL,
            reviewed_by = NULL,
            reviewed_at = NULL,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `,
      [transfer.id]
    );
    await run(
      `
        UPDATE lecturer_payout_ledger
        SET status = 'available',
            review_reason = NULL,
            updated_at = CURRENT_TIMESTAMP
        WHERE payout_transfer_id = ?
      `,
      [transfer.id]
    );
    await logLecturerPayoutEvent({
      transferId: transfer.id,
      req: input.req,
      eventType: "payout_transfer_retry_requested",
      note: `Admin retried payout transfer ${transfer.transfer_reference}.`,
      payload: {
        lecturer_username: transfer.lecturer_username,
        transfer_reference: transfer.transfer_reference,
      },
    });
    await queueLecturerPayoutDispatch(`transfer-${transfer.id}`, async () =>
      dispatchQueuedLecturerPayoutTransfer(transfer.id, { req: input.req })
    );
    return {
      ok: true,
      transfer: await getLecturerPayoutTransferById(transferId),
    };
  }

  return {
    maskBankAccountNumber,
    normalizeBankCode,
    normalizeBankAccountNumber,
    normalizePayoutStatus,
    normalizePayoutReviewState,
    roundCurrencyAmount,
    amountToKobo,
    koboToAmount,
    buildLecturerPayoutTransferReference,
    summarizePayoutAccountRow,
    summarizePayoutTransferRow,
    summarizePayoutLedgerRow,
    buildPayoutProviderResponseSnapshot,
    getPayoutSummaryForLecturer,
    getPayoutAccountForLecturer,
    savePayoutAccount,
    getPayoutHistory,
    requestPayout,
    listAdminPayoutTransfers,
    markTransferForReview,
    retryTransfer,
  };
}

module.exports = {
  createPayoutDomain,
};
