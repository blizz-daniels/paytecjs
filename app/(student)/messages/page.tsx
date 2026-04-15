import { LegacyPageScripts } from "@/components/legacy-page-scripts";
import { PageDataAttribute } from "@/components/page-data-attribute";

export default function StudentMessagesPage() {
  return (
    <div className="messages-layout">
      <PageDataAttribute page="messages" />
      <section className="page-title">
        <h1>Direct Messaging</h1>
        <p>Secure conversations between lecturers and students.</p>
      </section>

      <section id="messageComposeCard" className="card" hidden>
        <h2>New Thread</h2>
        <p id="messageComposeStatus" className="auth-subtitle"></p>
        <form id="messageCreateForm" className="auth-form">
          <label htmlFor="messageSubjectInput">Subject (optional)</label>
          <input id="messageSubjectInput" type="text" maxLength={120} />

          <label htmlFor="messageRecipientsInput">Recipients (students)</label>
          <select id="messageRecipientsInput" multiple size={7} required></select>
          <p className="auth-subtitle">Hold Ctrl (Windows) or Cmd (Mac) to select multiple students.</p>

          <label htmlFor="messageInitialBodyInput">Message</label>
          <textarea id="messageInitialBodyInput" rows={4} maxLength={4000} required></textarea>

          <button id="messageCreateButton" type="submit" className="btn">
            Start Thread
          </button>
        </form>
      </section>

      <section className="messages-grid">
        <article className="card messages-thread-card">
          <div className="messages-thread-card__header">
            <h2>Threads</h2>
            <div className="messages-thread-card__actions">
              <span id="messagesUnreadBadge" className="status-badge">
                Unread: 0
              </span>
              <button id="messageRefreshButton" type="button" className="btn btn-secondary">
                Refresh
              </button>
            </div>
          </div>
          <p id="messagesListStatus" className="auth-subtitle"></p>
          <div id="messageThreadList" className="messages-thread-list" aria-live="polite"></div>
        </article>

        <article className="card messages-panel-card">
          <section id="messagePlaceholderState" className="messages-empty">
            Select a thread to read and reply.
          </section>
          <section id="messageThreadPanel" hidden>
            <header className="messages-panel-header">
              <h2 id="messageThreadTitle">Conversation</h2>
              <p id="messageThreadMeta" className="auth-subtitle"></p>
              <p id="messageThreadParticipants" className="auth-subtitle"></p>
            </header>
            <div id="messageBodyList" className="messages-body-list"></div>
            <form id="messageReplyForm" className="auth-form">
              <label htmlFor="messageReplyInput">Reply</label>
              <textarea id="messageReplyInput" rows={4} maxLength={4000} required></textarea>
              <div className="cta-row">
                <button id="messageReplyButton" type="submit" className="btn">
                  Send Reply
                </button>
              </div>
            </form>
          </section>
        </article>
      </section>
      <LegacyPageScripts scripts={["/assets/messages.js"]} />
    </div>
  );
}
