import { LegacyPageScripts } from "@/components/legacy-page-scripts";
import { PageDataAttribute } from "@/components/page-data-attribute";

export default function StudentProfilePage() {
  return (
    <>
      <PageDataAttribute page="profile" />
      <section className="page-title">
        <h1>My Profile</h1>
        <p>Your account details and department checklist.</p>
      </section>

      <p id="profilePageError" className="auth-error" hidden></p>

      <section className="card profile-page-card">
        <div className="profile-page__photo-row">
          <div className="profile-page__photo" data-profile-photo>
            <img data-profile-image alt="Profile picture" hidden />
            <span data-profile-initial></span>
          </div>
        </div>
        <dl className="profile-page__details">
          <div>
            <dt>Full name</dt>
            <dd id="profilePageName">-</dd>
          </div>
          <div>
            <dt>Matric number</dt>
            <dd id="profilePageUsername">-</dd>
          </div>
          <div>
            <dt>Role</dt>
            <dd id="profilePageRole">-</dd>
          </div>
          <div>
            <dt>Department</dt>
            <dd id="profilePageDepartment">-</dd>
          </div>
          <div>
            <dt>Email</dt>
            <dd id="profilePageEmail">-</dd>
          </div>
        </dl>
      </section>

      <section className="card">
        <h2>Security</h2>
        <p className="auth-subtitle">
          Students can create one stronger password once. After that, reset it from login using email OTP
          verification.
        </p>
        <p id="passwordStatus" className="auth-subtitle"></p>
        <form id="profilePasswordForm" className="auth-form">
          <label htmlFor="profileCurrentPassword">Current password</label>
          <input id="profileCurrentPassword" name="currentPassword" type="password" minLength={2} maxLength={72} required />

          <label htmlFor="profileNewPassword">New password</label>
          <input id="profileNewPassword" name="newPassword" type="password" minLength={10} maxLength={72} required />

          <label htmlFor="profileConfirmPassword">Confirm new password</label>
          <input
            id="profileConfirmPassword"
            name="confirmPassword"
            type="password"
            minLength={10}
            maxLength={72}
            required
          />

          <button type="submit" className="btn">
            Update password
          </button>
        </form>
      </section>

      <section id="profilePayoutSection" className="card payout-card" hidden>
        <div className="payout-card__header">
          <div>
            <h2>Lecturer Payout Account</h2>
            <p className="auth-subtitle">
              Manage the bank account used for lecturer payouts. Bank details are never shown in full after saving.
            </p>
          </div>
          <span id="profilePayoutBadge" className="status-badge status-badge--warning">
            Loading
          </span>
        </div>
        <p id="profilePayoutStatus" className="auth-subtitle"></p>
        <div id="profilePayoutStats" className="payout-stats" aria-live="polite"></div>

        <section className="grid two-col" style={{ marginTop: "1rem" }}>
          <article className="payout-subcard">
            <h3>Linked Bank Account</h3>
            <div id="profilePayoutAccount" className="payout-account"></div>
          </article>

          <article className="payout-subcard">
            <h3>Update Bank Details</h3>
            <form id="profilePayoutForm" className="auth-form payout-form">
              <label htmlFor="profilePayoutBankName">Bank name</label>
              <input id="profilePayoutBankName" name="bankName" type="text" maxLength={80} autoComplete="off" />

              <label htmlFor="profilePayoutBankCode">Bank code</label>
              <input id="profilePayoutBankCode" name="bankCode" type="text" maxLength={10} autoComplete="off" />

              <label htmlFor="profilePayoutAccountName">Account name</label>
              <input id="profilePayoutAccountName" name="accountName" type="text" maxLength={100} autoComplete="off" />

              <label htmlFor="profilePayoutAccountNumber">Account number</label>
              <input
                id="profilePayoutAccountNumber"
                name="accountNumber"
                type="text"
                maxLength={10}
                inputMode="numeric"
                autoComplete="off"
              />

              <label className="payout-toggle">
                <input id="profilePayoutAutoEnabled" name="autoPayoutEnabled" type="checkbox" defaultChecked />
                Auto payout when earnings are available
              </label>

              <label className="payout-toggle">
                <input id="profilePayoutReviewRequired" name="reviewRequired" type="checkbox" />
                Mark for admin review
              </label>

              <p className="auth-subtitle payout-inline-note">
                Leave the bank fields blank if you only want to update payout preferences.
              </p>

              <button type="submit" className="btn">
                Save payout account
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
              <tbody id="profilePayoutHistoryBody">
                <tr>
                  <td colSpan={5}>Loading payout history...</td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>
      </section>

      <section className="card profile-checklist-card">
        <h2>Department Checklist</h2>
        <p className="auth-subtitle">make sure your done with your task before checking.</p>
        <p id="checklistStatus" className="auth-subtitle"></p>
        <div id="departmentChecklistList" className="profile-checklist-list"></div>
      </section>
      <LegacyPageScripts scripts={["/assets/profile-page.js"]} />
    </>
  );
}
