import Link from "next/link";

export default function StudentPaymentsPage() {
  return (
    <>
      <section className="page-title">
        <h1>Paystack Payments</h1>
        <p>Pay with Paystack and download approved receipts after confirmation.</p>
      </section>

      <section className="grid two-col">
        <article className="card">
          <h2>My Payment Ledger</h2>
          <div className="grid two-col">
            <p>
              <strong>Total Due:</strong> <span>-</span>
            </p>
            <p>
              <strong>Approved Paid:</strong> <span>-</span>
            </p>
            <p>
              <strong>Pending Review:</strong> <span>-</span>
            </p>
            <p>
              <strong>Outstanding:</strong> <span>-</span>
            </p>
          </div>
        </article>

        <article className="card">
          <h2>My Approved Receipts</h2>
          <p className="auth-subtitle">The legacy receipt flow stays in place while the Next.js shell is landing.</p>
          <div className="cta-row">
            <Link className="btn" href="/messages">
              Ask about a payment
            </Link>
          </div>
        </article>

        <article className="card">
          <h2>Webhook Fallback</h2>
          <p className="auth-subtitle">
            This area will mirror the existing Paystack reference posting flow in the next migration step.
          </p>
        </article>

        <article className="card">
          <h2>Payment Timeline</h2>
          <p className="auth-subtitle">Recent reconciliation status updates will appear here.</p>
        </article>
      </section>
    </>
  );
}
