export default function LecturerAnalyticsPage() {
  return (
    <>
      <section className="page-title">
        <h1>Advanced Analytics and Visual Dashboards</h1>
        <p>Track collections, reconciliation flow, and Paystack outcomes with role-scoped insights.</p>
      </section>

      <section className="card analytics-controls">
        <h2>Filters</h2>
        <p className="auth-subtitle">Filter controls will mirror the existing analytics page in the next step.</p>
      </section>

      <section className="grid analytics-kpis">
        <article className="card kpi-card">
          <h3>Total Collected</h3>
          <p className="kpi-value">-</p>
        </article>
        <article className="card kpi-card">
          <h3>Outstanding Amount</h3>
          <p className="kpi-value">-</p>
        </article>
        <article className="card kpi-card">
          <h3>Collection Rate</h3>
          <p className="kpi-value">-</p>
        </article>
        <article className="card kpi-card">
          <h3>Open Exceptions</h3>
          <p className="kpi-value">-</p>
        </article>
      </section>

      <section className="analytics-chart-grid">
        <article className="card chart-card">
          <h3>Revenue Trend</h3>
          <p className="auth-subtitle">Charts remain in the legacy app until the data layer lands here.</p>
        </article>
        <article className="card chart-card">
          <h3>Transaction Status Breakdown</h3>
          <p className="auth-subtitle">This panel is kept as a visual placeholder for now.</p>
        </article>
      </section>
    </>
  );
}
