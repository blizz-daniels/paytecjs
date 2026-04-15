import { LegacyPageScripts } from "@/components/legacy-page-scripts";

export default function AdminImportPage() {
  return (
    <>
      <section className="page-title">
        <h1>Roster CSV Import</h1>
        <p>Upload CSV files to provision student, lecturer, and departmental checklist data.</p>
        <p>
          Required columns: students (matric_number,surname,name,department), lecturers
          (teacher_code,surname,name,department).
        </p>
        <p>Checklist CSV required columns: department,task (optional: order).</p>
      </section>

      <section className="grid two-col">
        <article className="card">
          <h2>Import Student Roster</h2>
          <p id="studentImportStatus" className="auth-subtitle"></p>
          <form id="studentImportForm" className="auth-form">
            <label htmlFor="studentCsv">Student CSV File</label>
            <input id="studentCsv" name="studentCsv" type="file" accept=".csv,text/csv" required />
            <div className="cta-row">
              <button id="studentPreviewButton" type="button" className="btn btn-secondary">
                Preview Students
              </button>
              <button type="submit" className="btn">
                Import Students
              </button>
              <button id="studentDownloadReport" type="button" className="btn" hidden>
                Download Report
              </button>
            </div>
          </form>
          <div className="table-wrap" style={{ marginTop: "0.75rem" }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th>Row</th>
                  <th>Identifier</th>
                  <th>Status</th>
                  <th>Message</th>
                </tr>
              </thead>
              <tbody id="studentImportRows"></tbody>
            </table>
          </div>
        </article>

        <article className="card">
          <h2>Import Lecturer Roster</h2>
          <p id="lecturerImportStatus" className="auth-subtitle"></p>
          <form id="lecturerImportForm" className="auth-form">
            <label htmlFor="lecturerCsv">Lecturer CSV File</label>
            <input id="lecturerCsv" name="lecturerCsv" type="file" accept=".csv,text/csv" required />
            <div className="cta-row">
              <button id="lecturerPreviewButton" type="button" className="btn btn-secondary">
                Preview Lecturers
              </button>
              <button type="submit" className="btn">
                Import Lecturers
              </button>
              <button id="lecturerDownloadReport" type="button" className="btn" hidden>
                Download Report
              </button>
            </div>
          </form>
          <div className="table-wrap" style={{ marginTop: "0.75rem" }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th>Row</th>
                  <th>Identifier</th>
                  <th>Status</th>
                  <th>Message</th>
                </tr>
              </thead>
              <tbody id="lecturerImportRows"></tbody>
            </table>
          </div>
        </article>

        <article className="card">
          <h2>Import Department Checklist</h2>
          <p id="checklistImportStatus" className="auth-subtitle"></p>
          <form id="checklistImportForm" className="auth-form">
            <label htmlFor="checklistCsv">Checklist CSV File</label>
            <input id="checklistCsv" name="checklistCsv" type="file" accept=".csv,text/csv" required />
            <div className="cta-row">
              <button id="checklistPreviewButton" type="button" className="btn btn-secondary">
                Preview Checklist
              </button>
              <button type="submit" className="btn">
                Import Checklist
              </button>
              <button id="checklistDownloadReport" type="button" className="btn" hidden>
                Download Report
              </button>
            </div>
          </form>
          <div className="table-wrap" style={{ marginTop: "0.75rem" }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th>Row</th>
                  <th>Identifier</th>
                  <th>Status</th>
                  <th>Message</th>
                </tr>
              </thead>
              <tbody id="checklistImportRows"></tbody>
            </table>
          </div>
        </article>
      </section>
      <LegacyPageScripts scripts={["/assets/admin-import.js"]} />
    </>
  );
}
