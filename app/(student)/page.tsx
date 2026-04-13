import Link from "next/link";

export default function StudentHomePage() {
  return (
    <>
      <section className="page-title">
        <h1>Student Dashboard</h1>
        <p>Track payments, messages, and profile updates while the App Router rollout is in progress.</p>
      </section>

      <section className="grid two-col">
        <article className="card">
          <h2>Quick Links</h2>
          <div className="cta-row">
            <Link className="btn" href="/payments">
              Open Payments
            </Link>
            <Link className="btn btn-secondary" href="/messages">
              Open Messages
            </Link>
            <Link className="btn btn-secondary" href="/profile">
              Open Profile
            </Link>
          </div>
        </article>

        <article className="card">
          <h2>Migration Status</h2>
          <p className="auth-subtitle">
            Login and password recovery are now hosted in the App Router. Student content pages are still being
            ported with the same legacy styling.
          </p>
        </article>

        <article className="card">
          <h2>Payments</h2>
          <p className="auth-subtitle">View payment items, Paystack receipts, and outstanding balances.</p>
        </article>

        <article className="card">
          <h2>Messages</h2>
          <p className="auth-subtitle">Keep up with lecturer and student conversations.</p>
        </article>
      </section>
    </>
  );
}
