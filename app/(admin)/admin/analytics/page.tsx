import { LegacyPageScripts } from "@/components/legacy-page-scripts";
import { PageDataAttribute } from "@/components/page-data-attribute";

export default function AdminAnalyticsPage() {
  return (
    <>
      <PageDataAttribute page="analytics" />
      <section className="page-title">
        <h1>Advanced Analytics and Visual Dashboards</h1>
        <p>Track collections, reconciliation flow, and Paystack outcomes with role-scoped insights.</p>
      </section>

      <section className="card analytics-controls">
        <h2>Filters</h2>
        <p id="analyticsStatus" className="auth-subtitle">
          Choose filters and refresh to load analytics.
        </p>
        <form id="analyticsFiltersForm" className="auth-form">
          <div className="filter-grid analytics-filter-grid">
            <label>
              From
              <input id="analyticsFrom" type="date" required />
            </label>
            <label>
              To
              <input id="analyticsTo" type="date" required />
            </label>
            <label>
              Granularity
              <select id="analyticsGranularity">
                <option value="day">Day</option>
                <option value="week">Week</option>
                <option value="month">Month</option>
              </select>
            </label>
            <label>
              Payment Item (Optional)
              <select id="analyticsPaymentItem">
                <option value="">All payment items</option>
              </select>
            </label>
            <div className="filter-actions analytics-filter-actions">
              <button id="analyticsRefreshButton" type="submit" className="btn btn-secondary">
                Refresh
              </button>
              <button id="analyticsExportButton" type="button" className="btn">
                Export CSV
              </button>
            </div>
          </div>
        </form>
      </section>

      <section className="grid analytics-kpis">
        <article className="card kpi-card analytics-dynamic">
          <h3>Total Collected</h3>
          <p id="kpiTotalCollected" className="kpi-value">
            -
          </p>
        </article>
        <article className="card kpi-card analytics-dynamic">
          <h3>Outstanding Amount</h3>
          <p id="kpiOutstandingAmount" className="kpi-value">
            -
          </p>
        </article>
        <article className="card kpi-card analytics-dynamic">
          <h3>Collection Rate</h3>
          <p id="kpiCollectionRate" className="kpi-value">
            -
          </p>
        </article>
        <article className="card kpi-card analytics-dynamic">
          <h3>Open Exceptions</h3>
          <p id="kpiOpenExceptions" className="kpi-value">
            -
          </p>
        </article>
        <article className="card kpi-card analytics-dynamic">
          <h3>Auto-Approval Rate</h3>
          <p id="kpiAutoApprovalRate" className="kpi-value">
            -
          </p>
        </article>
        <article className="card kpi-card analytics-dynamic">
          <h3>Receipt Generation Success</h3>
          <p id="kpiReceiptSuccessRate" className="kpi-value">
            -
          </p>
        </article>
      </section>

      <section className="analytics-chart-grid">
        <article className="card chart-card analytics-dynamic">
          <h3>Revenue Trend</h3>
          <div className="chart-canvas-wrap">
            <canvas id="revenueChart" height={220}></canvas>
          </div>
          <div id="revenueFallback" className="analytics-fallback" hidden></div>
        </article>
        <article className="card chart-card analytics-dynamic">
          <h3>Transaction Status Breakdown</h3>
          <div className="chart-canvas-wrap">
            <canvas id="statusBreakdownChart" height={220}></canvas>
          </div>
          <div id="statusBreakdownFallback" className="analytics-fallback" hidden></div>
        </article>
        <article className="card chart-card analytics-dynamic">
          <h3>Reconciliation Funnel</h3>
          <div className="chart-canvas-wrap">
            <canvas id="reconciliationFunnelChart" height={220}></canvas>
          </div>
          <div id="reconciliationFunnelFallback" className="analytics-fallback" hidden></div>
        </article>
        <article className="card chart-card analytics-dynamic">
          <h3>Top Payment Items by Collections</h3>
          <div className="chart-canvas-wrap">
            <canvas id="topItemsChart" height={220}></canvas>
          </div>
          <div id="topItemsFallback" className="analytics-fallback" hidden></div>
        </article>
        <article className="card chart-card analytics-dynamic">
          <h3>Outstanding Aging Buckets</h3>
          <div className="chart-canvas-wrap">
            <canvas id="agingChart" height={220}></canvas>
          </div>
          <div id="agingFallback" className="analytics-fallback" hidden></div>
        </article>
        <article className="card chart-card analytics-dynamic">
          <h3>Paystack Session Funnel</h3>
          <div className="chart-canvas-wrap">
            <canvas id="paystackFunnelChart" height={220}></canvas>
          </div>
          <div id="paystackFunnelFallback" className="analytics-fallback" hidden></div>
        </article>
      </section>
      <LegacyPageScripts
        scripts={["https://cdn.jsdelivr.net/npm/chart.js@4.4.6/dist/chart.umd.min.js", "/assets/analytics.js"]}
      />
    </>
  );
}
