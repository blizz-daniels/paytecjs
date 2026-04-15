import { LegacyPageScripts } from "@/components/legacy-page-scripts";
import { PageDataAttribute } from "@/components/page-data-attribute";

export default function LecturerPage() {
  return (
    <>
      <PageDataAttribute page="lecturer" />
      <p className="home-greeting" hidden>
        Hello, <span id="homeGreetingName">Lecturer</span>!
      </p>
      <section className="page-title">
        <h1>Lecturer Upload Dashboard</h1>
        <p>Publish notifications, shared files, and handouts for students.</p>
      </section>

      <section className="grid two-col">
        <article className="card">
          <h2>Post Notification</h2>
          <p id="notificationStatus" className="auth-subtitle"></p>
          <form id="notificationForm" className="auth-form">
            <label htmlFor="notificationTitle">Title</label>
            <input id="notificationTitle" name="title" type="text" maxLength={120} required />
            <label htmlFor="notificationCategory">Category</label>
            <input id="notificationCategory" name="category" type="text" maxLength={40} defaultValue="General" />
            <label htmlFor="notificationBody">Message</label>
            <textarea id="notificationBody" name="body" rows={5} maxLength={2000} required></textarea>
            <label>
              <input id="notificationUrgent" name="isUrgent" type="checkbox" /> Mark as urgent
            </label>
            <label>
              <input id="notificationPinned" name="isPinned" type="checkbox" /> Pin this notice
            </label>
            <button type="submit" className="btn">
              Publish Notification
            </button>
          </form>
        </article>

        <article className="card">
          <h2>Upload Shared File</h2>
          <p id="sharedFileStatus" className="auth-subtitle"></p>
          <form id="sharedFileForm" className="auth-form">
            <label htmlFor="sharedFileTitle">Title</label>
            <input id="sharedFileTitle" name="title" type="text" maxLength={120} required />
            <label htmlFor="sharedFileDescription">Description</label>
            <textarea id="sharedFileDescription" name="description" rows={4} maxLength={2000} required></textarea>
            <label htmlFor="sharedFileInput">File (PNG or Video)</label>
            <input id="sharedFileInput" name="file" type="file" required />
            <button type="submit" className="btn">
              Publish File
            </button>
          </form>
        </article>

        <article className="card">
          <h2>Upload Handout File</h2>
          <p id="handoutStatus" className="auth-subtitle"></p>
          <form id="handoutForm" className="auth-form">
            <label htmlFor="handoutTitle">Title</label>
            <input id="handoutTitle" name="title" type="text" maxLength={120} required />
            <label htmlFor="handoutDescription">Description</label>
            <textarea id="handoutDescription" name="description" rows={5} maxLength={2000} required></textarea>
            <label htmlFor="handoutFileInput">File (PDF, Word, Excel)</label>
            <input id="handoutFileInput" name="file" type="file" required />
            <button type="submit" className="btn">
              Save Handout
            </button>
          </form>
        </article>
      </section>

      <section id="lecturerPayoutSection" className="card payout-card" hidden>
        <div className="payout-card__header">
          <div>
            <h2>Lecturer Payouts</h2>
            <p className="auth-subtitle">Track earnings, bank status, and payout history in one place.</p>
          </div>
          <span id="lecturerPayoutBadge" className="status-badge status-badge--warning">
            Loading
          </span>
        </div>
        <p id="lecturerPayoutStatus" className="auth-subtitle"></p>
        <div id="lecturerPayoutStats" className="payout-stats" aria-live="polite"></div>
        <section className="grid two-col" style={{ marginTop: "1rem" }}>
          <article className="payout-subcard">
            <h3>Linked Bank Account</h3>
            <div id="lecturerPayoutAccount" className="payout-account"></div>
          </article>
          <article className="payout-subcard">
            <h3>Request Payout</h3>
            <p className="auth-subtitle">Manual payouts send your available balance to the linked account.</p>
            <form id="lecturerPayoutRequestForm" className="auth-form payout-form">
              <label htmlFor="lecturerPayoutAmount">Amount to request</label>
              <input id="lecturerPayoutAmount" name="amount" type="number" min="0" step="0.01" />
              <button type="submit" className="btn">
                Request payout
              </button>
            </form>
          </article>
        </section>
        <section className="payout-history-block">
          <h3>Payout History</h3>
          <div className="table-wrap">
            <table className="data-table payout-history-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Reference</th>
                  <th>Amount</th>
                  <th>Status</th>
                  <th>Review</th>
                </tr>
              </thead>
              <tbody id="lecturerPayoutHistoryBody">
                <tr>
                  <td colSpan={5}>Loading payout history...</td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>
      </section>

      <section className="page-title" style={{ marginTop: "2rem" }}>
        <h2>Manage Posted Content</h2>
        <p>Edit or remove items you posted. Admins can manage all items.</p>
      </section>
      <section className="grid two-col">
        <article className="card">
          <h3>Notifications</h3>
          <p id="manageNotificationStatus" className="auth-subtitle"></p>
          <section id="manageNotificationList" className="stack"></section>
        </article>
        <article className="card">
          <h3>Shared Files</h3>
          <p id="manageSharedFileStatus" className="auth-subtitle"></p>
          <section id="manageSharedFileList" className="stack"></section>
        </article>
        <article className="card">
          <h3>Handouts</h3>
          <p id="manageHandoutStatus" className="auth-subtitle"></p>
          <section id="manageHandoutList" className="stack"></section>
        </article>
      </section>
      <LegacyPageScripts scripts={["/assets/lecturer.js"]} />
    </>
  );
}
