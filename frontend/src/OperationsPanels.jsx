import { useEffect, useState } from 'react';
import { Download, RefreshCw, ShieldCheck } from 'lucide-react';
import { downloadCsv, request, requestAll } from './api';

const money = (value) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(Number(value) || 0);

export function ReportsPanel() {
  const [range, setRange] = useState({ from: '', to: '' });
  const [applied, setApplied] = useState({ from: '', to: '' });
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(true);
  const [exporting, setExporting] = useState('');
  useEffect(() => {
    const controller = new AbortController();
    const query = new URLSearchParams(Object.entries(applied).filter(([, value]) => value));
    request('get', '/reports/summary?' + query, undefined, { signal: controller.signal })
      .then((result) => { setData(result); setError(''); })
      .catch((failure) => { if (!failure.cancelled) { setError(failure.message); setData(null); } })
      .finally(() => { if (!controller.signal.aborted) setBusy(false); });
    return () => controller.abort();
  }, [applied]);
  async function exportData(kind) {
    setExporting(kind);
    try { await downloadCsv(kind, Object.fromEntries(Object.entries(applied).filter(([, value]) => value))); }
    catch (failure) { setError(failure.message); }
    finally { setExporting(''); }
  }
  const metrics = data?.metrics || {};
  return <div className="dashboard-stack">
    <form className="panel report-filters" onSubmit={(event) => { event.preventDefault(); setBusy(true); setApplied({ ...range }); }}>
      <label className="field"><span>From</span><input type="date" value={range.from} onChange={(event) => setRange({ ...range, from: event.target.value })} /></label>
      <label className="field"><span>Through</span><input type="date" value={range.to} min={range.from || undefined} onChange={(event) => setRange({ ...range, to: event.target.value })} /></label>
      <button className="button primary" disabled={busy}>{busy ? 'Loading…' : 'Apply dates'}</button>
      <button type="button" className="button secondary" disabled={Boolean(exporting)} onClick={() => exportData('invoices')}><Download size={14} /> {exporting === 'invoices' ? 'Exporting…' : 'Invoices CSV'}</button>
      <button type="button" className="button secondary" disabled={Boolean(exporting)} onClick={() => exportData('payments')}><Download size={14} /> {exporting === 'payments' ? 'Exporting…' : 'Payments CSV'}</button>
    </form>
    {error && <div role="alert" className="notice error-notice">{error}</div>}
    <p className="small-note">Payment and invoice figures follow the selected issue/payment dates. Outstanding balances and active subscriptions show the current position. Leave dates blank for all records.</p>
    <div className="metric-grid">{[
      ['Revenue received', money(metrics.revenue)], ['Invoiced', money(metrics.invoiced)], ['Current outstanding', money(metrics.outstanding)],
      ['Current overdue', money(metrics.overdue)], ['Payments recorded', metrics.paymentCount || 0], ['Active subscriptions', metrics.activeSubscriptions || 0]
    ].map(([label, value]) => <div className="metric-card" key={label}><div className="metric-top">{label}</div><strong>{busy ? '…' : value}</strong></div>)}</div>
    <div className="dashboard-lower">
      <section className="panel"><div className="panel-heading"><h2>Monthly revenue</h2><span className="small-note">India time</span></div><div className="table-scroll"><table><thead><tr><th>Month</th><th>Payments</th><th>Revenue</th></tr></thead><tbody>{data?.revenueByMonth.map((row) => <tr key={row._id}><td>{row._id}</td><td>{row.count}</td><td>{money(row.revenue)}</td></tr>)}</tbody></table>{!data?.revenueByMonth.length && <p className="panel-empty">No successful payments in this date range.</p>}</div></section>
      <section className="panel"><div className="panel-heading"><h2>Invoice statuses</h2></div><div className="table-scroll"><table><thead><tr><th>Status</th><th>Invoices</th><th>Total</th></tr></thead><tbody>{data?.statuses.map((row) => <tr key={row._id}><td>{row._id}</td><td>{row.count}</td><td>{money(row.total)}</td></tr>)}</tbody></table>{!data?.statuses.length && <p className="panel-empty">No invoices in this date range.</p>}</div></section>
    </div>
    <section className="panel"><div className="panel-heading"><h2>Top customers by received revenue</h2></div><div className="table-scroll"><table><thead><tr><th>Customer</th><th>Email</th><th>Payments</th><th>Revenue</th></tr></thead><tbody>{data?.topCustomers.map((row) => <tr key={row._id}><td>{row.name || 'Unavailable customer'}</td><td>{row.email}</td><td>{row.payments}</td><td>{money(row.revenue)}</td></tr>)}</tbody></table>{!data?.topCustomers.length && <p className="panel-empty">Customers appear after a payment is recorded.</p>}</div></section>
  </div>;
}

export function AuditPanel() {
  const [data, setData] = useState(null);
  const [events, setEvents] = useState([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [revision, setRevision] = useState(0);
  const [page, setPage] = useState(1);
  useEffect(() => {
    const controller = new AbortController();
    Promise.all([
      request('get', '/audit/checks', undefined, { signal: controller.signal }),
      requestAll('/audit/events', { signal: controller.signal })
    ]).then(([checks, history]) => { setData(checks); setEvents(history); setError(''); })
      .catch((failure) => { if (!failure.cancelled) setError(failure.message); })
      .finally(() => { if (!controller.signal.aborted) setBusy(false); });
    return () => controller.abort();
  }, [revision]);
  async function synchronize() {
    setBusy(true);
    try { await request('post', '/audit/reconcile', {}); setRevision((value) => value + 1); }
    catch (failure) { setError(failure.message); setBusy(false); }
  }
  const pages = Math.max(1, Math.ceil(events.length / 25));
  const currentPage = Math.min(page, pages);
  return <div className="dashboard-stack">
    {error && <div role="alert" className="notice error-notice">{error}</div>}
    <section className="panel"><div className="panel-heading"><div><h2><ShieldCheck size={17} /> Billing consistency</h2><p>Checks invoice balances against successful recorded payments.</p></div><button className="button secondary" disabled={busy} onClick={() => { setBusy(true); setRevision((value) => value + 1); }}><RefreshCw size={14} /> Refresh checks</button></div>
      <div className="audit-summary"><b>{data ? data.issueCount === 0 ? 'No balance mismatches found' : data.issueCount + ' invoice mismatches need review' : 'Loading checks…'}</b><span>{data?.checkedInvoices || 0} invoices checked · {data?.pendingPayments || 0} invoices awaiting payment-history sync</span><button className="button secondary" disabled={busy} onClick={synchronize}>{busy ? 'Working…' : 'Synchronize saved payments'}</button></div>
      {Boolean(data?.issueCount) && <div className="table-scroll"><table><thead><tr><th>Invoice</th><th>Invoice paid</th><th>Payment history</th><th>Outstanding</th></tr></thead><tbody>{data.issues.map((row) => <tr key={row._id}><td>{row.number}</td><td>{money(row.paidAmount)}</td><td>{money(row.recorded)}</td><td>{money(row.outstanding)}</td></tr>)}</tbody></table></div>}
      <p className="panel-empty">Synchronization recovers saved payment entries. Older mismatches need a person to review the original records; balances are never silently overwritten.</p>
    </section>
    <section className="panel"><div className="panel-heading"><div><h2>Activity history</h2><p>Successful actions by signed-in users. Passwords and tokens are excluded.</p></div></div><div className="table-scroll"><table><thead><tr><th>When</th><th>Person</th><th>Role</th><th>Action</th><th>Record</th></tr></thead><tbody>{events.slice((currentPage - 1) * 25, currentPage * 25).map((event) => <tr key={event._id}><td>{new Date(event.occurredAt).toLocaleString('en-IN')}</td><td>{event.actor?.name || 'Unavailable user'}</td><td>{event.actor?.role}</td><td>{event.action}</td><td>{event.recordId || '—'}</td></tr>)}</tbody></table>{!events.length && <p className="panel-empty">Actions appear here as records are created or updated.</p>}</div><div className="table-footer"><span>{events.length} recorded actions</span><div className="row-actions"><button className="small-action" disabled={currentPage === 1} onClick={() => setPage(currentPage - 1)}>Previous</button><span>Page {currentPage} of {pages}</span><button className="small-action" disabled={currentPage === pages} onClick={() => setPage(currentPage + 1)}>Next</button></div></div></section>
  </div>;
}
