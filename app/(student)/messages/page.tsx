export default function StudentMessagesPage() {
  return (
    <div className="messages-layout">
      <section className="page-title">
        <h1>Direct Messaging</h1>
        <p>Secure conversations between lecturers and students.</p>
      </section>

      <section className="messages-grid">
        <article className="card messages-thread-card">
          <div className="messages-thread-card__header">
            <h2>Threads</h2>
            <div className="messages-thread-card__actions">
              <span className="status-badge">Unread: 0</span>
              <button type="button" className="btn btn-secondary">
                Refresh
              </button>
            </div>
          </div>
          <p className="auth-subtitle">This keeps the same split-panel layout as the legacy page.</p>
          <div className="messages-thread-list">
            <button type="button" className="messages-thread-item messages-thread-item--active">
              <div className="messages-thread-item__head">
                <p className="messages-thread-item__subject">Welcome to the new shell</p>
                <span className="status-badge status-badge--success">Open</span>
              </div>
              <p className="messages-thread-item__preview">
                Messages will continue to use the legacy back end until this route is fully migrated.
              </p>
            </button>
          </div>
        </article>

        <article className="card messages-panel-card">
          <section>
            <header className="messages-panel-header">
              <h2>Conversation</h2>
              <p className="auth-subtitle">Select a thread to read and reply.</p>
            </header>
            <div className="messages-body-list">
              <article className="message-bubble">
                <p className="message-bubble__meta">System</p>
                <p className="message-bubble__body">
                  The App Router version is showing the same visual structure while the data layer stays on the
                  legacy app.
                </p>
                <p className="message-bubble__time">Just now</p>
              </article>
            </div>
          </section>
        </article>
      </section>
    </div>
  );
}
