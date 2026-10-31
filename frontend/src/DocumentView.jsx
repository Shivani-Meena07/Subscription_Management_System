import { useEffect, useState } from 'react';
import { Printer } from 'lucide-react';
import { request } from './api';

const money = (value) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(Number(value) || 0);
const date = (value) => value ? new Date(value).toLocaleDateString('en-IN') : '—';

export default function DocumentView({ kind, recordId }) {
  const [item, setItem] = useState(null);
  const [error, setError] = useState('');
  useEffect(() => {
    const controller = new AbortController();
    request('get', '/' + kind + '/' + recordId, undefined, { signal: controller.signal })
      .then((result) => { setItem(result.item); setError(''); })
      .catch((failure) => { if (!failure.cancelled) setError(failure.message); });
    return () => controller.abort();
  }, [kind, recordId]);
  if (error) return <div role="alert" className="notice error-notice">{error}</div>;
  if (!item) return <p className="panel-empty">Loading document…</p>;
  return <div className="document-view">
    <div className="document-toolbar"><span className="status-badge">{item.status}</span><button className="button secondary" onClick={() => window.print()}><Printer size={14} /> Print / Save PDF</button></div>
    <div className="document-heading"><div><p className="eyebrow">BRIGHTLOOP SOFTWARE</p><h2>{kind === 'invoices' ? 'Invoice' : 'Quotation'}</h2><b>{item.number}</b></div><div><b>Bill to</b><p>{[item.customer?.name, item.customer?.company, item.customer?.email, item.customer?.phone, item.customer?.address].filter(Boolean).map((line, index) => <span key={index}>{line}<br /></span>)}</p></div></div>
    <div className="document-dates"><span>Issued: {date(item.invoiceDate || item.createdAt)}</span><span>{kind === 'invoices' ? 'Due: ' + date(item.dueDate) : 'Valid until: ' + date(item.validUntil)}</span>{item.subscription?.number && <span>Subscription: {item.subscription.number}</span>}</div>
    <div className="table-scroll"><table><thead><tr><th>Description</th><th>Qty</th><th>Unit price</th><th>Discount</th><th>Tax</th><th>Total</th></tr></thead><tbody>{item.items.map((line) => <tr key={line._id}><td>{line.description}{line.variant && !line.description.endsWith(' · ' + line.variant) && <small> · {line.variant}</small>}</td><td>{line.quantity}</td><td>{money(line.unitPrice)}</td><td>{money(line.discountAmount)}</td><td>{line.taxRate}% · {money(line.taxAmount)}</td><td>{money(line.amount)}</td></tr>)}</tbody></table></div>
    <dl className="document-totals"><div><dt>Subtotal</dt><dd>{money(item.subtotal)}</dd></div><div><dt>Discount</dt><dd>−{money(item.discountTotal)}</dd></div><div><dt>Tax</dt><dd>{money(item.taxTotal)}</dd></div><div className="document-total"><dt>Total</dt><dd>{money(item.total)}</dd></div>{kind === 'invoices' && <><div><dt>Paid</dt><dd>{money(item.paidAmount)}</dd></div><div><dt>Outstanding</dt><dd>{money(item.outstanding)}</dd></div></>}</dl>
    <p className="small-note">Amounts are in Indian Rupees (INR). This document reflects the saved billing record.</p>
  </div>;
}
