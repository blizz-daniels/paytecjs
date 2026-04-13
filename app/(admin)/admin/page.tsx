export default function AdminPage() {
  return (
    <>
      <section className="page-title">
        <h1>Admin Monitoring</h1>
        <p>Track users and login activity for the platform.</p>
        <p>Accounts are managed via roster CSV only.</p>
      </section>

      <section className="grid two-col">
        <article className="card">
          <h2>Total Users</h2>
          <p>0</p>
        </article>
        <article className="card">
          <h2>Total Students</h2>
          <p>0</p>
        </article>
        <article className="card">
          <h2>Total Lecturers</h2>
          <p>0</p>
        </article>
        <article className="card">
          <h2>Total Admins</h2>
          <p>0</p>
        </article>
      </section>

      <section className="card" style={{ marginTop: "1rem" }}>
        <h2>Recent Login Activity</h2>
        <p className="auth-subtitle">Login history will be wired into the App Router after the first migration slice.</p>
      </section>

      <section className="card" style={{ marginTop: "1rem" }}>
        <h2>Recent Content Audit Log</h2>
        <p className="auth-subtitle">Audit history stays on the legacy app for this phase.</p>
      </section>
    </>
  );
}
