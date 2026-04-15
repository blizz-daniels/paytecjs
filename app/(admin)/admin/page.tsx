import { LegacyPageScripts } from "@/components/legacy-page-scripts";

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
          <p id="totalUsers">0</p>
        </article>
        <article className="card">
          <h2>Total Students</h2>
          <p id="totalStudents">0</p>
        </article>
        <article className="card">
          <h2>Total Lecturers</h2>
          <p id="totalLecturers">0</p>
        </article>
        <article className="card">
          <h2>Total Admins</h2>
          <p id="totalAdmins">0</p>
        </article>
        <article className="card">
          <h2>Total Login Events</h2>
          <p id="totalLogins">0</p>
        </article>
        <article className="card">
          <h2>Unique Users Logged In</h2>
          <p id="uniqueLoggedInUsers">0</p>
        </article>
        <article className="card">
          <h2>Today&apos;s Logins</h2>
          <p id="todayLogins">0</p>
        </article>
      </section>

      <section className="card" style={{ marginTop: "1rem" }}>
        <h2>Recent Login Activity</h2>
        <p id="adminError" className="auth-error" hidden></p>
        <div className="table-wrap">
          <table id="loginTable" className="data-table">
            <thead>
              <tr>
                <th>Username</th>
                <th>Source</th>
                <th>IP</th>
                <th>Time</th>
              </tr>
            </thead>
            <tbody id="loginRows"></tbody>
          </table>
        </div>
      </section>

      <section className="card" style={{ marginTop: "1rem" }}>
        <h2>Recent Content Audit Log</h2>
        <div className="table-wrap">
          <table id="auditTable" className="data-table">
            <thead>
              <tr>
                <th>Actor</th>
                <th>Role</th>
                <th>Action</th>
                <th>Type</th>
                <th>Target Owner</th>
                <th>Summary</th>
                <th>Time</th>
              </tr>
            </thead>
            <tbody id="auditRows"></tbody>
          </table>
        </div>
      </section>
      <LegacyPageScripts scripts={["/assets/admin.js"]} />
    </>
  );
}
