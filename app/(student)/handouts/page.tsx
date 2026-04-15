import { LegacyPageScripts } from "@/components/legacy-page-scripts";
import { PageDataAttribute } from "@/components/page-data-attribute";

export default function StudentHandoutsPage() {
  return (
    <>
      <PageDataAttribute page="handouts" />
      <section className="page-title">
        <h1>Department Handouts</h1>
        <p>Digital handouts shared by lecturers for easy student access.</p>
      </section>

      <p id="contentError" className="auth-error" hidden></p>
      <section id="handoutsList" className="grid"></section>
      <LegacyPageScripts scripts={["/assets/content.js"]} />
    </>
  );
}
