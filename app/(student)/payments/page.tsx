import { LegacyPageScripts } from "@/components/legacy-page-scripts";
import { PageDataAttribute } from "@/components/page-data-attribute";

export default function StudentPaymentsPage() {
  return (
    <>
      <PageDataAttribute page="payments" />
      <section className="page-title">
        <h1>Paystack Payments</h1>
        <p>Pay with Paystack and download approved receipts after confirmation.</p>
      </section>

      <p id="paymentsError" className="auth-error" hidden></p>

      <section id="studentPaymentsSection" className="grid two-col" hidden>
        <article className="card">
          <h2>My Payment Ledger</h2>
          <div className="grid two-col">
            <p>
              <strong>Total Due:</strong> <span id="ledgerTotalDue">-</span>
            </p>
            <p>
              <strong>Approved Paid:</strong> <span id="ledgerApprovedPaid">-</span>
            </p>
            <p>
              <strong>Pending Review:</strong> <span id="ledgerPendingPaid">-</span>
            </p>
            <p>
              <strong>Outstanding:</strong> <span id="ledgerOutstanding">-</span>
            </p>
            <p>
              <strong>Overdue Items:</strong> <span id="ledgerOverdueCount">0</span>
            </p>
            <p>
              <strong>Due Soon:</strong> <span id="ledgerDueSoonCount">0</span>
            </p>
          </div>
          <p>
            <strong>Next Due:</strong> <span id="ledgerNextDue">No upcoming due item.</span>
          </p>
        </article>

        <article className="card">
          <h2>Due-Date Reminder Calendar</h2>
          <p className="auth-subtitle">Auto-generated reminders based on payment due dates.</p>
          <p id="paystackCheckoutStatus" className="auth-subtitle"></p>
          <div id="paymentReminderRows" className="details-tile-list" aria-live="polite"></div>
        </article>

        <article className="card">
          <h2>Webhook Fallback</h2>
          <p id="postPaystackReferenceStatus" className="auth-subtitle">
            If your Paystack payment remains pending, post the reference directly to lecturers for manual
            verification.
          </p>
          <form id="postPaystackReferenceForm" className="auth-form">
            <label htmlFor="postPaystackReferenceInput">Paystack reference</label>
            <input id="postPaystackReferenceInput" type="text" maxLength={120} required />

            <label htmlFor="postPaystackReferenceNote">Note (optional)</label>
            <textarea id="postPaystackReferenceNote" rows={2} maxLength={300}></textarea>

            <button id="postPaystackReferenceButton" type="submit" className="btn btn-secondary">
              Post Reference to Lecturer
            </button>
          </form>
          <div id="myPaystackReferenceRequestRows" className="details-tile-list" aria-live="polite"></div>
        </article>

        <article className="card">
          <h2>Payment Timeline</h2>
          <p className="auth-subtitle">Recent reconciliation status updates.</p>
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>When</th>
                  <th>Payment Item</th>
                  <th>Action</th>
                  <th>Note</th>
                </tr>
              </thead>
              <tbody id="paymentTimelineRows"></tbody>
            </table>
          </div>
        </article>

        <article className="card">
          <h2>My Approved Receipts</h2>
          <div id="myReceiptRows" className="details-tile-list" aria-live="polite"></div>
        </article>
      </section>

      <section id="reviewPaymentsSection" className="grid two-col" hidden>
        <article className="card">
          <h2>Create Payment Item</h2>
          <p id="paymentItemStatus" className="auth-subtitle"></p>
          <form id="paymentItemForm" className="auth-form">
            <label htmlFor="paymentItemTitle">Title</label>
            <input id="paymentItemTitle" type="text" maxLength={120} required />

            <label htmlFor="paymentItemDescription">Description</label>
            <textarea id="paymentItemDescription" rows={3}></textarea>

            <label htmlFor="paymentItemAmount">Expected Amount</label>
            <input id="paymentItemAmount" type="number" min="0.01" step="0.01" required />

            <label htmlFor="paymentItemCurrency">Currency</label>
            <input id="paymentItemCurrency" type="text" maxLength={3} defaultValue="NGN" required />

            <label htmlFor="paymentItemDueDate">Due Date (optional)</label>
            <input id="paymentItemDueDate" type="date" />

            <label htmlFor="paymentItemAvailabilityDays">Available for (days, optional)</label>
            <input id="paymentItemAvailabilityDays" type="number" min="1" step="1" />

            <button type="submit" className="btn">
              Save Payment Item
            </button>
          </form>
        </article>

        <article className="card">
          <h2>Manage Payment Items</h2>
          <div id="paymentItemRows" className="details-tile-list" aria-live="polite"></div>
        </article>

        <article className="card">
          <h2>Verify Paystack Reference</h2>
          <p id="verifyPaystackStatus" className="auth-subtitle">
            Use this when a successful Paystack payment has not reflected yet.
          </p>
          <form id="verifyPaystackForm" className="auth-form">
            <label htmlFor="verifyPaystackReference">Paystack reference</label>
            <input id="verifyPaystackReference" type="text" maxLength={120} required />
            <button id="verifyPaystackButton" type="submit" className="btn">
              Verify Reference
            </button>
          </form>
        </article>

        <article className="card" style={{ gridColumn: "1 / -1" }}>
          <h2>Paystack Reference Requests</h2>
          <p id="paystackReferenceRequestsStatus" className="auth-subtitle">
            Posted by students when webhook confirmation is delayed.
          </p>
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>
                    <input id="paystackReferenceRequestsSelectAll" type="checkbox" />
                  </th>
                  <th>Requested</th>
                  <th>Student</th>
                  <th>Item</th>
                  <th>Reference</th>
                  <th>Note</th>
                  <th>Status</th>
                  <th>Result</th>
                </tr>
              </thead>
              <tbody id="paystackReferenceRequestRows"></tbody>
            </table>
          </div>
          <div style={{ display: "flex", gap: "0.6rem", alignItems: "center", flexWrap: "wrap", marginTop: "0.65rem" }}>
            <button id="verifySelectedPaystackRequestsButton" type="button" className="btn">
              Verify Selected References
            </button>
            <button id="refreshPaystackRequestsButton" type="button" className="btn btn-secondary">
              Refresh Requests
            </button>
          </div>
        </article>
      </section>

      <section id="receiptQueueSection" className="card" style={{ marginTop: "1rem" }} hidden>
        <h2>Approved Transactions</h2>
        <div className="recon-summary-tabs" style={{ marginBottom: "0.8rem" }}>
          <article className="card recon-summary-tab">
            <h3>Approved Transactions</h3>
            <p id="reconAutoApproved" className="auth-subtitle">
              0
            </p>
          </article>
          <article className="card recon-summary-tab">
            <h3>Exceptions</h3>
            <p id="reconExceptions" className="auth-subtitle">
              0
            </p>
          </article>
          <article className="card recon-summary-tab">
            <h3>Unresolved Obligations</h3>
            <p id="reconUnresolved" className="auth-subtitle">
              0
            </p>
          </article>
          <article className="card recon-summary-tab">
            <h3>Duplicates</h3>
            <p id="reconDuplicates" className="auth-subtitle">
              0
            </p>
          </article>
        </div>
        <form id="queueFilterForm" className="auth-form" style={{ marginBottom: "0.8rem" }}>
          <div className="filter-grid">
            <label>
              Student Name / Username
              <input id="queueStudent" type="text" />
            </label>
            <label>
              Paystack Reference
              <input id="queueReference" type="text" />
            </label>
            <label>
              Date From
              <input id="queueDateFrom" type="date" />
            </label>
            <label>
              Date To
              <input id="queueDateTo" type="date" />
            </label>
            <label>
              Payment Item
              <select id="queuePaymentItem">
                <option value="">All</option>
              </select>
            </label>
            <div className="filter-actions">
              <button type="submit" className="btn btn-secondary">
                Apply Filters
              </button>
            </div>
          </div>
        </form>
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Student Name</th>
                <th>Username</th>
                <th>Payment Item</th>
                <th>Amount</th>
                <th>Paystack Reference</th>
                <th>Approved Date/Time</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody id="receiptQueueRows"></tbody>
          </table>
        </div>
        <div style={{ display: "flex", gap: "0.6rem", alignItems: "center", marginTop: "0.65rem" }}>
          <button id="queuePrevPage" type="button" className="btn btn-secondary">
            Previous
          </button>
          <button id="queueNextPage" type="button" className="btn btn-secondary">
            Next
          </button>
          <span id="queuePageInfo" className="auth-subtitle">
            Page 1
          </span>
        </div>
      </section>
      <LegacyPageScripts scripts={["/assets/payments.js"]} />
    </>
  );
}
