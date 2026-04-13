export default function StudentProfilePage() {
  return (
    <>
      <section className="page-title">
        <h1>My Profile</h1>
        <p>Your account details and department checklist.</p>
      </section>

      <section className="grid two-col">
        <article className="card profile-page-card">
          <div className="profile-page__photo-row">
            <div className="profile-page__photo">
              <span>S</span>
            </div>
          </div>
          <dl className="profile-page__details">
            <div>
              <dt>Full name</dt>
              <dd>Student profile loading from legacy data</dd>
            </div>
            <div>
              <dt>Matric number</dt>
              <dd>-</dd>
            </div>
            <div>
              <dt>Role</dt>
              <dd>student</dd>
            </div>
            <div>
              <dt>Department</dt>
              <dd>-</dd>
            </div>
          </dl>
        </article>

        <article className="card">
          <h2>Security</h2>
          <p className="auth-subtitle">
            The profile page remains on the legacy app for now, including password and checklist actions.
          </p>
        </article>

        <article className="card profile-checklist-card">
          <h2>Department Checklist</h2>
          <p className="auth-subtitle">Checklist progress will be reused once the route is migrated.</p>
        </article>
      </section>
    </>
  );
}
