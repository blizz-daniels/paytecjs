import Link from "next/link";

import { LegacyPageScripts } from "@/components/legacy-page-scripts";
import { PageDataAttribute } from "@/components/page-data-attribute";

export default function StudentHomePage() {
  return (
    <>
      <PageDataAttribute page="home" />
      <section className="hero">
        <h1>Stay on top of school payments without missing updates</h1>
        <p>
          A simple student-first platform that makes semester payments, departmental updates, and learning handouts
          easier to track in one place.
        </p>
        <div className="cta-row">
          <Link className="btn" href="/notifications">
            View Updates
          </Link>
          <Link className="btn btn-secondary" href="/handouts">
            Open Handouts
          </Link>
        </div>
      </section>

      <p className="home-greeting" hidden>
        Hello, <span id="homeGreetingName">Student</span>!
      </p>

      <section className="grid two-col">
        <article className="card">
          <h2>Payment Reminder Flow (Coming Next)</h2>
          <ul>
            <li>See all semester payment deadlines in one timeline.</li>
            <li>Get reminders before due dates to avoid queue rush.</li>
            <li>Track which payments are done and pending.</li>
          </ul>
        </article>
        <article className="card">
          <h2>Built for Teens</h2>
          <ul>
            <li>Clean design and familiar mobile-friendly layout.</li>
            <li>Fast links to urgent notices and shared handouts.</li>
            <li>Simple language and easy navigation.</li>
          </ul>
        </article>
      </section>

      <section className="page-title">
        <h1>Latest Lecturer Uploads</h1>
        <p>Everything shared by lecturers appears here for students in real time.</p>
      </section>
      <p id="contentError" className="auth-error" hidden></p>

      <section className="grid two-col">
        <article className="card">
          <h2>Notifications</h2>
          <section id="homeNotificationsList" className="stack"></section>
        </article>
        <article className="card">
          <h2>Shared Files</h2>
          <section id="sharedFilesList" className="stack"></section>
        </article>
        <article className="card">
          <h2>Handout Files</h2>
          <section id="homeHandoutsList" className="stack"></section>
        </article>
      </section>
      <LegacyPageScripts scripts={["/assets/content.js"]} />
    </>
  );
}
