import { LegacyPageScripts } from "@/components/legacy-page-scripts";
import { PageDataAttribute } from "@/components/page-data-attribute";

export default function StudentNotificationsPage() {
  return (
    <>
      <PageDataAttribute page="notifications" />
      <section className="page-title">
        <h1>Department Notifications</h1>
        <p>Latest verified school and departmental updates in one place.</p>
      </section>

      <p id="contentError" className="auth-error" hidden></p>
      <section id="notificationsList" className="stack"></section>
      <LegacyPageScripts scripts={["/assets/content.js"]} />
    </>
  );
}
