export default function LecturerPage() {
  return (
    <>
      <section className="page-title">
        <h1>Lecturer Upload Dashboard</h1>
        <p>Publish notifications, shared files, and handouts for students.</p>
      </section>

      <section className="grid two-col">
        <article className="card">
          <h2>Post Notification</h2>
          <p className="auth-subtitle">The same editor and upload flow from the legacy dashboard will slot in here.</p>
        </article>

        <article className="card">
          <h2>Upload Shared File</h2>
          <p className="auth-subtitle">Shared files will continue to use the existing storage pipeline.</p>
        </article>

        <article className="card">
          <h2>Upload Handout File</h2>
          <p className="auth-subtitle">Handouts will reuse the current lecturer workflow during migration.</p>
        </article>

        <article className="card">
          <h2>Manage Posted Content</h2>
          <p className="auth-subtitle">Edit and delete screens stay on the legacy app for this phase.</p>
        </article>
      </section>
    </>
  );
}
