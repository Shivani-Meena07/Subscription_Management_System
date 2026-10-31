import { lazy, Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { BrowserRouter, Link, Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import {
  Activity, ArrowDownLeft, ArrowLeftRight, ArrowUpRight, BadgeIndianRupee, Boxes,
  BriefcaseBusiness, CalendarClock, Check, ChevronDown, CircleHelp, CreditCard, FileCheck2,
  FileText, LayoutDashboard, LogOut, Menu, Plus, Search, Settings2, ShieldCheck,
  Sparkles, Tag, UserRoundCog, Users, X
} from 'lucide-react';
import { request } from './api'
import Landing from './Landing.jsx';

const RevenueChart = lazy(() => import('./RevenueChart.jsx'));
const chartMonths = Array.from({ length: 6 }, (_, index) => {
  const monthDate = new Date();
  monthDate.setDate(1);
  monthDate.setMonth(monthDate.getMonth() - (5 - index));
  return {
    month: monthDate.toLocaleString('en-IN', { month: 'short' }),
    key: `${monthDate.getFullYear()}-${monthDate.getMonth() + 1}`
  };
});
const currentYear = new Date().getFullYear();
const money = (value) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(Number(value) || 0);
const date = (value) => value ? new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(value)) : '—';
const titleCase = (value = '') => value.replace(/([A-Z])/g, ' $1').replace(/[-_]/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
const navBase = [
  { title: 'Workspace', links: [{ label: 'Overview', path: '/dashboard', Icon: LayoutDashboard }] },
  { title: 'Manage', links: [
    { label: 'Subscriptions', path: '/subscriptions', Icon: ArrowLeftRight },
    { label: 'Invoices', path: '/invoices', Icon: FileText },
    { label: 'Payments', path: '/payments', Icon: CreditCard },
    { label: 'Quotations', path: '/quotations', Icon: FileCheck2 }
  ] },
  { title: 'Catalogue', links: [
    { label: 'Plans', path: '/plans', Icon: Boxes },
    { label: 'Products', path: '/products', Icon: BriefcaseBusiness }
  ] },
  { title: 'Company', links: [
    { label: 'Customers', path: '/customers', Icon: Users },
    { label: 'Discounts', path: '/discounts', Icon: Tag },
    { label: 'Tax rates', path: '/taxes', Icon: BadgeIndianRupee }
  ] },
  { title: 'Access', links: [{ label: 'Team members', path: '/team', Icon: UserRoundCog }] }
];

const listConfig = {
  subscriptions: { title: 'Subscriptions', subtitle: 'Keep renewals and customer access in sync.', endpoint: '/subscriptions', create: 'subscription', columns: [
    ['number', 'Subscription'], ['customer.name', 'Customer'], ['plan.name', 'Plan'], ['frequency', 'Billing'], ['total', 'Amount', 'money'], ['nextBillingDate', 'Next billing', 'date'], ['status', 'Status', 'status']
  ] },
  invoices: { title: 'Invoices', subtitle: 'Track billing, due dates and outstanding balances.', endpoint: '/invoices', create: 'invoice', columns: [
    ['number', 'Invoice'], ['customer.name', 'Customer'], ['invoiceDate', 'Issued', 'date'], ['dueDate', 'Due date', 'date'], ['total', 'Total', 'money'], ['outstanding', 'Outstanding', 'money'], ['status', 'Status', 'status']
  ] },
  payments: { title: 'Payments', subtitle: 'A clear record of every payment received.', endpoint: '/payments', columns: [
    ['invoice.number', 'Invoice'], ['customer.name', 'Customer'], ['method', 'Method'], ['amount', 'Amount', 'money'], ['reference', 'Reference'], ['paidAt', 'Received', 'date'], ['status', 'Status', 'status']
  ] },
  quotations: { title: 'Quotations', subtitle: 'Prepare an offer, then turn an accepted quote into a subscription.', endpoint: '/quotations', create: 'quotation', columns: [
    ['number', 'Quote'], ['customer.name', 'Customer'], ['plan.name', 'Plan'], ['createdAt', 'Created', 'date'], ['validUntil', 'Valid until', 'date'], ['total', 'Total', 'money'], ['status', 'Status', 'status']
  ] },
  plans: { title: 'Plans', subtitle: 'Choose a plan that fits the way your customers work.', endpoint: '/plans', create: 'plan', columns: [
    ['name', 'Plan'], ['description', 'Description'], ['frequency', 'Billing'], ['price', 'Price', 'money'], ['minimumQuantity', 'Min. seats'], ['active', 'Availability', 'boolean']
  ] },
  products: { title: 'Products', subtitle: 'The software and add-ons behind every subscription.', endpoint: '/products', create: 'product', columns: [
    ['name', 'Product'], ['type', 'Type'], ['description', 'Description'], ['salesPrice', 'Sales price', 'money'], ['active', 'Availability', 'boolean']
  ] },
  customers: { title: 'Customers', subtitle: 'The people and businesses you work with.', endpoint: '/users?role=customer', columns: [
    ['name', 'Customer'], ['email', 'Email'], ['createdAt', 'Joined', 'date'], ['active', 'Account', 'boolean']
  ] },
  discounts: { title: 'Discounts', subtitle: 'Manage promotional rules and their usage limits.', endpoint: '/discounts', create: 'discount', columns: [
    ['name', 'Discount'], ['kind', 'Type'], ['value', 'Value', 'discountValue'], ['usageCount', 'Used'], ['usageLimit', 'Limit'], ['active', 'Availability', 'boolean']
  ] },
  taxes: { title: 'Tax rates', subtitle: 'Configure the active rate used for new invoice lines.', endpoint: '/taxes', create: 'tax', columns: [
    ['name', 'Tax'], ['rate', 'Rate', 'percent'], ['active', 'Availability', 'boolean'], ['createdAt', 'Created', 'date']
  ] },
  team: { title: 'Team members', subtitle: 'Manage the people who help run your subscription operations.', endpoint: '/users?role=staff', create: 'staff', columns: [
    ['name', 'Name'], ['email', 'Email'], ['role', 'Role'], ['createdAt', 'Added', 'date'], ['active', 'Account', 'boolean']
  ] }
};

const fields = {
  product: [
    { name: 'name', label: 'Product name', required: true },
    { name: 'type', label: 'Product type', type: 'select', options: ['software', 'addon', 'service'] },
    { name: 'salesPrice', label: 'Sales price (₹)', type: 'number', required: true },
    { name: 'costPrice', label: 'Cost price (₹)', type: 'number' },
    { name: 'description', label: 'Description', type: 'textarea' },
    { name: 'variants', label: 'Variants (JSON)', placeholder: '[{"name":"Standard","additionalPrice":0}]' }
  ],
  plan: [
    { name: 'name', label: 'Plan name', required: true },
    { name: 'description', label: 'Description', type: 'textarea' },
    { name: 'price', label: 'Recurring price (₹)', type: 'number', required: true },
    { name: 'frequency', label: 'Billing frequency', type: 'select', options: ['monthly', 'yearly', 'weekly', 'daily'] },
    { name: 'products', label: 'Included products', type: 'products' },
    { name: 'minimumQuantity', label: 'Minimum seats', type: 'number' },
    { name: 'startDate', label: 'Available from', type: 'date' },
    { name: 'endDate', label: 'Available until', type: 'date' },
    { name: 'autoClose', label: 'Close subscriptions at expiry', type: 'checkbox' },
    { name: 'allowPause', label: 'Allow pause', type: 'checkbox' },
    { name: 'allowRenewal', label: 'Allow renewal', type: 'checkbox' },
    { name: 'allowEarlyClose', label: 'Allow early closure', type: 'checkbox' }
  ],
  staff: [
    { name: 'name', label: 'Full name', required: true }, { name: 'email', label: 'Work email', type: 'email', required: true },
    { name: 'role', label: 'Role', type: 'select', options: ['staff', 'admin'] },
    { name: 'password', label: 'Temporary password', type: 'password', required: true }
  ],
  subscription: [
    { name: 'customer', label: 'Customer', type: 'customer', required: true },
    { name: 'plan', label: 'Plan', type: 'plan', required: true },
    { name: 'product', label: 'Optional add-on', type: 'product' },
    { name: 'variant', label: 'Product variant', type: 'variant' },
    { name: 'quantity', label: 'Seats', type: 'number', required: true }
  ],
  portalSubscribe: [{ name: 'quantity', label: 'Seats', type: 'number', required: true }],
  quotation: [
    { name: 'customer', label: 'Customer', type: 'customer', required: true },
    { name: 'plan', label: 'Plan', type: 'plan', required: true },
    { name: 'product', label: 'Optional add-on', type: 'product' },
    { name: 'variant', label: 'Product variant', type: 'variant' },
    { name: 'quantity', label: 'Seats', type: 'number', required: true },
    { name: 'validityDays', label: 'Valid for (days)', type: 'number' }
  ],
  invoice: [
    { name: 'customer', label: 'Customer', type: 'customer', required: true },
    { name: 'description', label: 'Line item', required: true },
    { name: 'amount', label: 'Amount (₹)', type: 'number', required: true },
    { name: 'quantity', label: 'Quantity', type: 'number', required: true },
    { name: 'dueDate', label: 'Due date', type: 'date' }
  ],
  payment: [
    { name: 'invoice', label: 'Invoice', type: 'invoice', required: true },
    { name: 'amount', label: 'Amount received (₹)', type: 'number', required: true },
    { name: 'method', label: 'Payment method', type: 'select', options: ['upi', 'bank transfer', 'card', 'cash', 'other'] },
    { name: 'reference', label: 'Transaction reference' }, { name: 'notes', label: 'Notes', type: 'textarea' }
  ],
  discount: [
    { name: 'name', label: 'Discount name', required: true },
    { name: 'kind', label: 'Discount type', type: 'select', options: ['percentage', 'fixed'] },
    { name: 'value', label: 'Value', type: 'number', required: true },
    { name: 'minimumPurchase', label: 'Minimum purchase (₹)', type: 'number' },
    { name: 'minimumQuantity', label: 'Minimum quantity', type: 'number' },
    { name: 'usageLimit', label: 'Maximum uses', type: 'number' },
    { name: 'startsAt', label: 'Starts on', type: 'date' }, { name: 'endsAt', label: 'Ends on', type: 'date' }
  ],
  tax: [
    { name: 'name', label: 'Tax name', required: true },
    { name: 'rate', label: 'Rate (%)', type: 'number', required: true }
  ]
};

function AuthPage({ onLogin }) {
  const [mode, setMode] = useState('login');
  const [form, setForm] = useState({ name: '', email: '', password: '', token: '' });
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (key) => (event) => setForm((value) => ({ ...value, [key]: event.target.value }));
  async function submit(event) {
    event.preventDefault(); setError(''); setNotice(''); setBusy(true);
    try {
      if (mode === 'forgot') {
        const result = await request('post', '/auth/forgot-password', { email: form.email });
        setNotice(result.developmentResetToken ? `Development reset token: ${result.developmentResetToken}` : result.message);
        if (result.developmentResetToken) { setForm((v) => ({ ...v, token: result.developmentResetToken })); setMode('reset'); }
      } else if (mode === 'reset') {
        const result = await request('post', '/auth/reset-password', { token: form.token, password: form.password });
        setNotice(result.message); setMode('login');
      } else {
        const result = await request('post', mode === 'register' ? '/auth/register' : '/auth/login', form);
        localStorage.setItem('subsight-token', result.token);
        onLogin(result.user);
      }
    } catch (err) { setError(err.message); } finally { setBusy(false); }
  }
  return <main className="auth-page">
    <section className="auth-aside">
      <Brand />
      <div className="auth-story">
        <div className="eyebrow"><span className="eyebrow-dot" /> SUBSCRIPTION OPERATIONS, MADE CLEAR</div>
        <h1>Good business<br />runs on <em>good rhythm.</em></h1>
        <p>One steady view of every customer, renewal and payment.</p>
        <div className="auth-note"><Activity size={17} /> Built for the people behind recurring revenue.</div>
      </div>
      <div className="auth-aside-bottom">BRIGHTLOOP SOFTWARE <span>·</span> SUBSIGHT</div>
    </section>
    <section className="auth-form-side">
      <div className="auth-mobile-brand"><Brand /></div>
      <div className="auth-form-wrap">
        <p className="eyebrow muted-eyebrow">{mode === 'login' ? 'WELCOME BACK' : mode === 'register' ? 'GET STARTED' : 'ACCOUNT RECOVERY'}</p>
        <h2>{mode === 'login' ? 'Sign in to SubSight' : mode === 'register' ? 'Create your account' : mode === 'forgot' ? 'Reset your password' : 'Choose a new password'}</h2>
        <p className="auth-intro">{mode === 'register' ? 'Create a customer account to manage your subscriptions.' : mode === 'login' ? 'Enter your work email and password to continue.' : 'We’ll help you get back into your account securely.'}</p>
        {error && <div className="notice error-notice">{error}</div>}
        {notice && <div className="notice success-notice">{notice}</div>}
        <form className="auth-form" onSubmit={submit}>
          {mode === 'register' && <Field label="Full name" value={form.name} onChange={set('name')} required />}
          {mode === 'reset' && <Field label="Reset token" value={form.token} onChange={set('token')} required />}
          {(mode !== 'reset') && <Field label="Email address" type="email" autoComplete="email" value={form.email} onChange={set('email')} required />}
          {mode !== 'forgot' && <Field label={mode === 'reset' ? 'New password' : 'Password'} type="password" autoComplete={mode === 'login' ? 'current-password' : 'new-password'} value={form.password} onChange={set('password')} required />}
          <button className="button primary wide-button" disabled={busy}>{busy ? 'Please wait…' : mode === 'login' ? 'Sign in' : mode === 'register' ? 'Create account' : mode === 'forgot' ? 'Send reset instructions' : 'Update password'} <ArrowUpRight size={16} /></button>
        </form>
        {mode === 'login' && <button className="text-button forgot-link" onClick={() => { setError(''); setNotice(''); setMode('forgot'); }}>Forgot password?</button>}
        <div className="auth-switch">{mode === 'login' ? <>New to SubSight? <button onClick={() => setMode('register')}>Create an account</button></> : <>Already have an account? <button onClick={() => { setMode('login'); setError(''); }}>Sign in</button></>}</div>
        <div className="auth-secure"><ShieldCheck size={15} /> Your account is protected with secure, encrypted sign-in.</div>
      </div>
      <footer className="auth-footer">© {currentYear} Brightloop Software <span>·</span> Built for recurring business.</footer>
    </section>
  </main>;
}

function Brand() {
  return <Link to="/dashboard" className="brand"><span className="brand-mark"><span /><span /><span /></span><span className="brand-word">sub<span>sight</span></span></Link>;
}

function Field({ label, type = 'text', value, onChange, required, placeholder, autoComplete, readOnly = false }) {
  return <label className="field"><span>{label}{required && <i> *</i>}</span><input type={type} value={value ?? ''} onChange={onChange} required={required} placeholder={placeholder} autoComplete={autoComplete} min={type === 'number' ? '0' : undefined} step={type === 'number' ? 'any' : undefined} readOnly={readOnly} /></label>;
}

function Workspace({ user, onLogout }) {
  const location = useLocation();
  const role = user.role;
  const isCustomer = role === 'customer';
  const [mobileOpen, setMobileOpen] = useState(false);
  const [dashboard, setDashboard] = useState(null);
  const [loadError, setLoadError] = useState('');
  const [loadedPath, setLoadedPath] = useState('');
  const [modal, setModal] = useState('');
  const [modalData, setModalData] = useState({});
  const [requestReview, setRequestReview] = useState(null);
  const [reviewBusy, setReviewBusy] = useState(false);
  const [catalogues, setCatalogues] = useState({ customers: [], plans: [], products: [], invoices: [] });
  const [list, setList] = useState([]);
  const [filter, setFilter] = useState('');
  const [toast, setToast] = useState('');
  const [busy, setBusy] = useState(false);
  const current = location.pathname.replace(/^\//, '') || 'dashboard';
  const config = listConfig[current];
  const canManage = role === 'admin' || role === 'staff';

  const fetchDashboard = useCallback(async (path = current) => {
    try {
      const result = await request('get', isCustomer ? '/portal/dashboard' : '/dashboard/summary');
      setDashboard(result);
      setLoadError('');
    } catch (error) { setLoadError(error.message); }
    finally { setLoadedPath(path); }
  }, [current, isCustomer]);

  const fetchList = useCallback(async (path = current) => {
    if (!config) return;
    try {
      let result = await request('get', current === 'subscriptions' ? '/subscriptions?page=1&limit=100' : config.endpoint);
      let items = result.items || [];
      if (current === 'subscriptions' && result.pages > 1) {
        const pages = await Promise.all(Array.from({ length: result.pages - 1 }, (_, index) =>
          request('get', `/subscriptions?page=${index + 2}&limit=100`)
        ));
        items = items.concat(...pages.map((pageResult) => pageResult.items || []));
      }
      setList(items);
      setLoadError('');
    } catch (error) { setList([]); setLoadError(error.message); }
    finally { setLoadedPath(path); }
  }, [config, current]);

  useEffect(() => {
    if (current === 'profile') {
      request('get', '/profile').catch((error) => setLoadError(error.message));
      return;
    }
    if (current !== 'dashboard' && !config) return;
    const loadPage = async () => {
      try {
        const result = await request('get', current === 'dashboard' ? (isCustomer ? '/portal/dashboard' : '/dashboard/summary') : current === 'subscriptions' ? '/subscriptions?page=1&limit=100' : config.endpoint);
        if (current === 'dashboard') setDashboard(result);
        else {
          let items = result.items || [];
          if (current === 'subscriptions' && result.pages > 1) {
            const pages = await Promise.all(Array.from({ length: result.pages - 1 }, (_, index) =>
              request('get', `/subscriptions?page=${index + 2}&limit=100`)
            ));
            items = items.concat(...pages.map((pageResult) => pageResult.items || []));
          }
          setList(items);
        }
        setLoadError('');
      } catch (error) {
        if (current !== 'dashboard') setList([]);
        setLoadError(error.message);
      } finally { setLoadedPath(current); }
    };
    loadPage();
  }, [current, config, isCustomer]);

  const links = useMemo(() => {
    if (isCustomer) return [
      { title: 'My account', links: [
        { label: 'Overview', path: '/dashboard', Icon: LayoutDashboard },
        { label: 'My subscriptions', path: '/subscriptions', Icon: ArrowLeftRight },
        { label: 'Invoices', path: '/invoices', Icon: FileText },
        { label: 'Payments', path: '/payments', Icon: CreditCard }
      ] },
      { title: 'Explore', links: [{ label: 'Available plans', path: '/plans', Icon: Boxes }] },
      { title: 'Settings', links: [{ label: 'My profile', path: '/profile', Icon: Settings2 }] }
    ];
    return navBase.map((group) => ({
      ...group,
      links: group.links.filter(({ path }) => !(role === 'staff' && ['/discounts', '/taxes', '/team'].includes(path)))
    }));
  }, [isCustomer, role]);

  function notify(message) {
    setToast(message);
    window.setTimeout(() => setToast(''), 3500);
  }

  async function openCreate(type) {
    setModal(type); setModalData(type === 'product' ? { type: 'software' } : type === 'plan' ? { frequency: 'monthly', minimumQuantity: 1, allowPause: true, allowRenewal: true, allowEarlyClose: true, autoClose: true, products: [] } : type === 'subscription' || type === 'quotation' ? { quantity: 1, validityDays: 30 } : type === 'payment' ? { method: 'upi' } : type === 'discount' ? { kind: 'percentage', minimumQuantity: 1 } : {});
    try {
      const requests = [];
      if (['subscription', 'quotation', 'invoice', 'staff'].includes(type)) requests.push(request('get', '/users?role=customer').then((r) => setCatalogues((v) => ({ ...v, customers: r.items || [] }))));
      if (['subscription', 'quotation'].includes(type)) requests.push(request('get', '/plans').then((r) => setCatalogues((v) => ({ ...v, plans: r.items || [] }))));
      if (['subscription', 'quotation', 'plan'].includes(type)) requests.push(request('get', '/products').then((r) => setCatalogues((v) => ({ ...v, products: r.items || [] }))));
      if (type === 'payment') requests.push(request('get', '/invoices').then((r) => setCatalogues((v) => ({ ...v, invoices: (r.items || []).filter((item) => item.outstanding > 0) }))));
      await Promise.all(requests);
    } catch (error) { setModal(''); notify(error.message); }
  }

  async function submitModal(event) {
    event.preventDefault(); setBusy(true);
    try {
      const values = { ...modalData };
      Object.keys(values).forEach((key) => { if (values[key] === '' || values[key] === undefined) delete values[key]; });
      ['salesPrice', 'costPrice', 'price', 'minimumQuantity', 'quantity', 'validityDays', 'amount', 'value', 'minimumPurchase', 'usageLimit', 'rate'].forEach((key) => { if (values[key] !== undefined) values[key] = Number(values[key]); });
      if (modal === 'product' && values.variants) values.variants = JSON.parse(values.variants);
      if (modal === 'subscription' || modal === 'quotation') {
        const plan = catalogues.plans.find((item) => item._id === values.plan);
        if (!plan) throw new Error('Choose a plan.');
        values.items = [{ description: plan.name, unitPrice: plan.price, quantity: values.quantity }];
        if (values.product) {
          const product = catalogues.products.find((item) => item._id === values.product);
          if (!product) throw new Error('The selected add-on is unavailable.');
          const variant = product.variants?.find((item) => item.name === values.variant);
          values.items.push({
            product: product._id,
            variant: variant?.name,
            description: `${product.name}${variant ? ` · ${variant.name}` : ''}`,
            unitPrice: product.salesPrice + (variant?.additionalPrice || 0),
            quantity: values.quantity
          });
        }
      }
      if (modal === 'invoice') values.items = [{ description: values.description, unitPrice: values.amount, quantity: values.quantity || 1 }];
      const urls = { product: '/products', plan: '/plans', subscription: '/subscriptions', quotation: '/quotations', invoice: '/invoices', payment: '/payments', staff: '/users/staff', tax: '/taxes', discount: '/discounts', portalSubscribe: '/portal/subscriptions' };
      await request('post', urls[modal], values);
      setModal('');
      notify(modal === 'payment' ? 'Payment recorded and invoice balance updated.' : modal === 'quotation' ? 'Quotation created.' : 'Saved successfully.');
      if (current === 'dashboard') fetchDashboard(); else fetchList();
    } catch (error) {
      notify(error.message || 'Check the form values and try again.');
    } finally { setBusy(false); }
  }

  async function action(path, data, success) {
    try {
      await request('post', path, data);
      notify(success); fetchList();
    } catch (error) { notify(error.message); }
  }

  async function subscriptionAction(item, actionName) {
    try {
      const result = await request('patch', `/subscriptions/${item._id}/action`, { action: actionName });
      notify(result.message || 'Subscription updated.'); fetchList();
    } catch (error) { notify(error.message); }
  }

  async function submitRequestReview(status) {
    if (!requestReview) return;
    setReviewBusy(true);
    try {
      const { subscription, request: requestRecord } = requestReview;
      const result = await request('patch', `/subscriptions/${subscription._id}/requests/${requestRecord._id}`, { status });
      notify(result.message);
      setRequestReview(null);
      fetchList();
    } catch (error) {
      notify(error.message);
    } finally { setReviewBusy(false); }
  }

  async function toggleRecord(item) {
    const collection = { team: 'users', customers: 'users', products: 'products', plans: 'plans', discounts: 'discounts', taxes: 'taxes' }[current];
    try {
      await request('patch', `/${collection}/${item._id}`, { active: !item.active });
      notify(`${item.name || item.email} ${item.active ? 'deactivated' : 'reactivated'}.`);
      fetchList();
    } catch (error) { notify(error.message); }
  }

  const pageTitle = current === 'dashboard' ? 'Overview' : current === 'profile' ? 'My profile' : config?.title || titleCase(current);
  const pageSubtitle = current === 'dashboard' ? (isCustomer ? 'Your account, billing and subscriptions at a glance.' : 'A clear view of your recurring business.') : config?.subtitle || (current === 'profile' ? 'Update your SubSight account details.' : '');
  const filteredList = list.filter((item) => JSON.stringify(item).toLowerCase().includes(filter.toLowerCase()));

  if (!['dashboard', 'profile', ...Object.keys(listConfig)].includes(current)) return <Navigate to="/dashboard" replace />;
  if (isCustomer && ['customers', 'products', 'quotations', 'discounts', 'taxes'].includes(current)) return <Navigate to="/dashboard" replace />;
  if (role === 'staff' && ['discounts', 'taxes', 'team'].includes(current)) return <Navigate to="/dashboard" replace />;
  if (isCustomer && current === 'team') return <Navigate to="/dashboard" replace />;

  return <div className="workspace">
    <aside className={`sidebar ${mobileOpen ? 'sidebar-open' : ''}`}>
      <div className="sidebar-brand"><Brand /><button className="icon-button mobile-close" onClick={() => setMobileOpen(false)} aria-label="Close menu"><X size={18} /></button></div>
      <div className="workspace-switch"><span className="company-avatar">B</span><span className="company-label"><b>Brightloop Software</b><small>{isCustomer ? 'Customer account' : 'Subscription workspace'}</small></span><ChevronDown size={14} /></div>
      <nav className="side-nav">
        {links.map((group) => <div className="nav-group" key={group.title}>
          <div className="nav-heading">{group.title}</div>
          {group.links.map(({ label, path, Icon }) => <Link key={path} to={path} onClick={() => setMobileOpen(false)} className={`nav-link ${location.pathname === path ? 'nav-active' : ''}`}><Icon size={17} strokeWidth={1.8} /><span>{label}</span></Link>)}
        </div>)}
      </nav>
      <div className="sidebar-bottom">
        <div className="help-card"><span className="help-icon"><CircleHelp size={17} /></span><div><b>Workspace support</b><small>Talk to your account admin</small></div></div>
        <div className="sidebar-profile"><div className="avatar">{user.name?.slice(0, 1).toUpperCase()}</div><div className="profile-copy"><b>{user.name}</b><small>{titleCase(user.role)}</small></div><button className="icon-button logout-button" onClick={onLogout} aria-label="Sign out"><LogOut size={16} /></button></div>
      </div>
    </aside>
    {mobileOpen && <button className="sidebar-scrim" onClick={() => setMobileOpen(false)} aria-label="Close navigation" />}
    <main className="main-area">
      <header className="topbar">
        <button className="icon-button menu-button" onClick={() => setMobileOpen(true)} aria-label="Open menu"><Menu size={19} /></button>
        <div className="breadcrumbs"><span>Brightloop</span><span className="crumb-slash">/</span><b>{pageTitle}</b></div>
        <div className="topbar-actions"><div className="topbar-avatar">{user.name?.slice(0, 1).toUpperCase()}</div></div>
      </header>
      <div className="page-content">
        <div className="page-heading">
          <div><p className="eyebrow page-eyebrow">{isCustomer ? 'YOUR SUBSIGHT' : `${titleCase(role)} workspace`}</p><h1>{pageTitle}</h1><p className="page-subtitle">{pageSubtitle}</p></div>
          <div className="heading-actions">
            {current === 'invoices' && canManage && <button className="button secondary" onClick={async () => { try { const result = await request('post', '/invoices/generate-due'); notify(`${result.created} invoice${result.created === 1 ? '' : 's'} generated from ${result.checked} due subscription${result.checked === 1 ? '' : 's'}.`); fetchList(); } catch (error) { notify(error.message); } }}><CalendarClock size={16} /> Generate due invoices</button>}
            {current === 'invoices' && canManage && <button className="button primary" onClick={() => openCreate('invoice')}><Plus size={16} /> New invoice</button>}
            {current === 'subscriptions' && canManage && <button className="button primary" onClick={() => openCreate('subscription')}><Plus size={16} /> New subscription</button>}
            {current === 'quotations' && canManage && <button className="button primary" onClick={() => openCreate('quotation')}><Plus size={16} /> Create quote</button>}
            {current === 'payments' && !isCustomer && <button className="button primary" onClick={() => openCreate('payment')}><Plus size={16} /> Record payment</button>}
            {config?.create && canManage && !['invoice', 'subscription', 'quotation'].includes(config.create) && <button className="button primary" onClick={() => openCreate(config.create)}><Plus size={16} /> {config.create === 'product' ? 'Add product' : config.create === 'plan' ? 'New plan' : config.create === 'discount' ? 'Add discount' : config.create === 'staff' ? 'Add team member' : 'Add tax rate'}</button>}
            {current === 'plans' && isCustomer && <span className="small-note">Choose a plan to get started</span>}
          </div>
        </div>
        {loadError && <div className="notice error-notice inline-notice">{loadError}<button onClick={() => current === 'dashboard' ? fetchDashboard() : fetchList()}>Try again</button></div>}
        {current === 'dashboard' && <Dashboard data={dashboard} busy={loadedPath !== current && !loadError} customer={isCustomer} />}
        {current === 'profile' && <ProfilePanel user={user} onSave={async (name) => { try { const result = await request('patch', '/profile', { name }); notify('Profile updated.'); return result.user; } catch (error) { notify(error.message); return null; } }} />}
        {config && <ListPage
          config={config} rows={filteredList} busy={loadedPath !== current && !loadError} query={filter} setQuery={setFilter} role={role} page={current}
          onRefresh={fetchList} onAction={action} onSubscriptionAction={subscriptionAction} onToggle={toggleRecord} onReviewRequest={setRequestReview}
          onPayment={(invoice) => { setModalData({ invoice: invoice._id, amount: invoice.outstanding, method: 'upi' }); setModal('payment'); request('get', '/invoices').then((r) => setCatalogues((v) => ({ ...v, invoices: (r.items || []).filter((item) => item.outstanding > 0) }))).catch((error) => notify(error.message)); }}
          onSubscribe={(plan) => { setModalData({ plan: plan._id, quantity: plan.minimumQuantity || 1 }); setModal('portalSubscribe'); }}
        />}
      </div>
    </main>
    {modal && <Modal title={modal === 'portalSubscribe' ? 'Start a subscription' : modal === 'staff' ? 'Add team member' : modal === 'quotation' ? 'Prepare a quotation' : modal === 'payment' ? 'Record a payment' : modal === 'invoice' ? 'Create an invoice' : `Create ${titleCase(modal)}`} subtitle={modal === 'payment' ? 'Record the amount received against an open invoice.' : 'Add the details to keep your billing records accurate.'} onClose={() => setModal('')}>
      <form className="modal-form" onSubmit={submitModal}>
        {fields[modal].map((field) => <FormInput key={field.name} field={field} value={modalData[field.name]} options={field.type === 'customer' ? catalogues.customers : field.type === 'plan' ? catalogues.plans : field.type === 'invoice' ? catalogues.invoices : field.type === 'product' ? catalogues.products : field.type === 'variant' ? catalogues.products.find((product) => product._id === modalData.product)?.variants || [] : field.type === 'products' ? catalogues.products : null} onChange={(value) => setModalData((data) => ({ ...data, [field.name]: value, ...(field.name === 'product' ? { variant: '' } : {}) }))} />)}
        <div className="modal-actions"><button type="button" className="button secondary" onClick={() => setModal('')}>Cancel</button><button className="button primary" disabled={busy}>{busy ? 'Saving…' : modal === 'payment' ? 'Record payment' : modal === 'portalSubscribe' ? 'Start subscription' : 'Save'} <ArrowUpRight size={15} /></button></div>
      </form>
    </Modal>}
    {requestReview && <Modal
      title={`${requestReview.decision === 'approved' ? 'Approve' : 'Reject'} customer request`}
      subtitle={`${titleCase(requestReview.request.type)} request for ${requestReview.subscription.number}`}
      onClose={() => { if (!reviewBusy) setRequestReview(null); }}
    >
      <div className="request-confirmation">
        <p>Customer <b>{requestReview.subscription.customer?.name}</b> requested to {requestReview.request.type === 'cancel' ? 'cancel' : requestReview.request.type} this subscription on {date(requestReview.request.requestedAt)}.</p>
        <p>{requestReview.decision === 'approved' ? 'Approving this request will update the subscription status immediately.' : 'The subscription will remain unchanged.'}</p>
      </div>
      <div className="modal-actions"><button type="button" className="button secondary" disabled={reviewBusy} onClick={() => setRequestReview(null)}>Go back</button><button type="button" className={`button ${requestReview.decision === 'approved' ? 'primary' : 'danger'}`} disabled={reviewBusy} onClick={() => submitRequestReview(requestReview.decision)}>{reviewBusy ? 'Processing…' : `${requestReview.decision === 'approved' ? 'Approve' : 'Reject'} request`}</button></div>
    </Modal>}
    {toast && <div className="toast"><span><Check size={16} /></span>{toast}<button onClick={() => setToast('')} aria-label="Dismiss"><X size={15} /></button></div>}
  </div>;
}

function FormInput({ field, value, options, onChange }) {
  if (field.type === 'checkbox') return <label className="checkbox-field"><input type="checkbox" checked={Boolean(value)} onChange={(event) => onChange(event.target.checked)} /><span>{field.label}</span></label>;
  if (field.type === 'textarea') return <label className="field"><span>{field.label}</span><textarea rows="3" value={value ?? ''} onChange={(event) => onChange(event.target.value)} placeholder={field.placeholder} /></label>;
  if (field.type === 'products') return <label className="field"><span>{field.label}</span><select multiple value={value || []} onChange={(event) => onChange(Array.from(event.target.selectedOptions, (option) => option.value))}>{(options || []).map((option) => <option key={option._id} value={option._id}>{option.name}</option>)}</select><small className="field-hint">Select multiple products with Ctrl or Command.</small></label>;
  if (field.type === 'select' || options) return <label className="field"><span>{field.label}{field.required && <i> *</i>}</span><select required={field.required} value={value ?? ''} onChange={(event) => onChange(event.target.value)}><option value="">Select…</option>{(options || field.options || []).map((option) => <option key={option._id || option} value={option._id || option}>{option.name ? `${option.name}${option.frequency ? ` · ${option.frequency}` : ''}${option.outstanding !== undefined ? ` · ${money(option.outstanding)} due` : ''}` : titleCase(option)}</option>)}</select></label>;
  return <label className="field"><span>{field.label}{field.required && <i> *</i>}</span><input type={field.type || 'text'} required={field.required} min={field.type === 'number' ? '0' : undefined} step={field.type === 'number' ? 'any' : undefined} placeholder={field.placeholder} value={value ?? ''} onChange={(event) => onChange(event.target.value)} /></label>;
}

function Modal({ title, subtitle, onClose, children }) {
  useEffect(() => {
    const handler = (event) => { if (event.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);
  return <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><section className="modal" role="dialog" aria-modal="true" aria-labelledby="modal-heading">
    <div className="modal-heading"><div><p className="eyebrow page-eyebrow">SUBSIGHT WORKSPACE</p><h2 id="modal-heading">{title}</h2><p>{subtitle}</p></div><button className="icon-button" onClick={onClose} aria-label="Close dialog"><X size={18} /></button></div>
    {children}
  </section></div>;
}

function Dashboard({ data, busy, customer }) {
  const chartData = useMemo(() => {
    const monthMap = new Map((data?.revenueByMonth || []).map((item) => [`${item._id.year}-${item._id.month}`, item.revenue]));
    return chartMonths.map(({ month, key }) => ({ month, revenue: Number(monthMap.get(key) || 0) }));
  }, [data?.revenueByMonth]);
  if (busy) return <div className="loading-panel"><span className="spinner" /> Loading your records…</div>;
  if (!data) return <EmptyState title="Dashboard unavailable" description="Reconnect to the API to load current account data." />;
  if (customer) return <CustomerDashboard data={data} />;
  const m = data.metrics || {};
  const cards = [
    { label: 'Active subscriptions', value: m.activeSubscriptions ?? 0, icon: ArrowLeftRight, note: 'Currently billing' },
    { label: 'Revenue received', value: money(m.revenueReceived), icon: ArrowDownLeft, note: 'Successful payments', accent: true },
    { label: 'Outstanding', value: money(m.outstanding), icon: BadgeIndianRupee, note: 'Open invoice balance' },
    { label: 'Overdue invoices', value: m.overdueInvoices ?? 0, icon: CalendarClock, note: 'Past their due date' },
    { label: 'Customers', value: m.customers ?? 0, icon: Users, note: 'Active accounts' },
    { label: 'Monthly recurring', value: money(m.mrr), icon: Activity, note: 'Active subscriptions only', accent: true }
  ];
  const hasRevenue = chartData.some((entry) => entry.revenue > 0);
  return <div className="dashboard-stack">
    <div className="metric-grid">{cards.map(({ label, value, icon: Icon, note, accent }) => <div className={`metric-card ${accent ? 'metric-accent' : ''}`} key={label}>
      <div className="metric-top"><span>{label}</span><span className="metric-icon"><Icon size={17} strokeWidth={1.7} /></span></div>
      <strong>{value}</strong><small>{note}</small>
    </div>)}</div>
    <section className="panel revenue-panel">
      <div className="panel-heading"><div><h2>Revenue received</h2><p>Successful payments, by month</p></div><span className="chart-period">Last 6 months</span></div>
      {hasRevenue ? <Suspense fallback={<div className="chart-empty"><span className="spinner" /> Loading chart…</div>}><RevenueChart data={chartData} /></Suspense> : <div className="chart-empty"><span className="chart-empty-icon"><Activity size={19} /></span><b>No payment activity yet</b><p>Your monthly revenue will appear here as payments are recorded.</p></div>}
    </section>
    <div className="dashboard-lower">
      <section className="panel"><div className="panel-heading"><div><h2>Recent invoices</h2><p>Latest billing activity</p></div><Link to="/invoices" className="subtle-link">View all <ArrowUpRight size={14} /></Link></div>
        {data.recentInvoices?.length ? <div className="mini-list">{data.recentInvoices.map((invoice) => <div className="mini-row" key={invoice._id}><span className="mini-icon invoice-mini"><FileText size={16} /></span><span className="mini-main"><b>{invoice.number}</b><small>{invoice.customer?.name || 'Customer'} · {date(invoice.invoiceDate)}</small></span><span className="mini-end"><b>{money(invoice.total)}</b><Status value={invoice.status} /></span></div>)}</div> : <EmptyState title="No invoices yet" description="Invoices appear here when billing begins." compact />}</section>
      <section className="panel"><div className="panel-heading"><div><h2>Recent payments</h2><p>Money received</p></div><Link to="/payments" className="subtle-link">View all <ArrowUpRight size={14} /></Link></div>
        {data.recentPayments?.length ? <div className="mini-list">{data.recentPayments.map((payment) => <div className="mini-row" key={payment._id}><span className="mini-icon payment-mini"><ArrowDownLeft size={16} /></span><span className="mini-main"><b>{payment.customer?.name || 'Customer'}</b><small>{payment.invoice?.number || 'Invoice'} · {date(payment.paidAt)}</small></span><span className="mini-end"><b className="payment-amount">+{money(payment.amount)}</b><Status value={payment.status} /></span></div>)}</div> : <EmptyState title="No payments recorded" description="Recorded payments will show up here." compact />}</section>
    </div>
    <div className="dashboard-footnote"><Sparkles size={14} /> All figures are calculated from your SubSight records. MRR excludes paused subscriptions.</div>
  </div>;
}

function CustomerDashboard({ data }) {
  const metrics = data.metrics || {};
  return <div className="dashboard-stack">
    <section className="customer-welcome"><div><p className="eyebrow">YOUR SUBSIGHT ACCOUNT</p><h2>Everything in good order.</h2><p>Review your plan, upcoming billing and recent documents from one place.</p></div><div className="welcome-stamp"><Activity size={19} /><span>Account overview</span></div></section>
    <div className="metric-grid customer-metrics">
      <div className="metric-card"><div className="metric-top"><span>Active subscriptions</span><span className="metric-icon"><ArrowLeftRight size={17} /></span></div><strong>{metrics.activeSubscriptions ?? 0}</strong><small>Currently active</small></div>
      <div className="metric-card metric-accent"><div className="metric-top"><span>Outstanding balance</span><span className="metric-icon"><BadgeIndianRupee size={17} /></span></div><strong>{money(metrics.outstanding)}</strong><small>Across open invoices</small></div>
      <div className="metric-card"><div className="metric-top"><span>Next billing date</span><span className="metric-icon"><CalendarClock size={17} /></span></div><strong className="metric-date">{metrics.upcomingBilling ? date(metrics.upcomingBilling) : 'Nothing scheduled'}</strong><small>Upcoming renewal</small></div>
    </div>
    <div className="dashboard-lower">
      <section className="panel"><div className="panel-heading"><div><h2>Your invoices</h2><p>Recent billing statements</p></div><Link to="/invoices" className="subtle-link">View all <ArrowUpRight size={14} /></Link></div>
        {data.invoices?.length ? <div className="mini-list">{data.invoices.map((invoice) => <div className="mini-row" key={invoice._id}><span className="mini-icon invoice-mini"><FileText size={16} /></span><span className="mini-main"><b>{invoice.number}</b><small>Due {date(invoice.dueDate)}</small></span><span className="mini-end"><b>{money(invoice.total)}</b><Status value={invoice.status} /></span></div>)}</div> : <EmptyState title="No invoices yet" description="Your invoices will appear here." compact />}</section>
      <section className="panel"><div className="panel-heading"><div><h2>Recent payments</h2><p>Your payment history</p></div><Link to="/payments" className="subtle-link">View all <ArrowUpRight size={14} /></Link></div>
        {data.payments?.length ? <div className="mini-list">{data.payments.map((payment) => <div className="mini-row" key={payment._id}><span className="mini-icon payment-mini"><ArrowDownLeft size={16} /></span><span className="mini-main"><b>{payment.invoice?.number || 'Payment'}</b><small>{date(payment.paidAt)}</small></span><span className="mini-end"><b className="payment-amount">+{money(payment.amount)}</b></span></div>)}</div> : <EmptyState title="No payments yet" description="Your payment history will appear here." compact />}</section>
    </div>
  </div>;
}

function ListPage({ config, rows, busy, query, setQuery, role, page, onAction, onSubscriptionAction, onPayment, onSubscribe, onToggle, onReviewRequest }) {
  const customer = role === 'customer';
  const canManage = role === 'admin' || role === 'staff';
  const canReviewRequests = ['admin', 'staff'].includes(role);
  const requestRows = page === 'subscriptions'
    ? rows.flatMap((subscription) => (subscription.requests || []).map((request) => ({ subscription, request })))
      .sort((a, b) => new Date(b.request.requestedAt) - new Date(a.request.requestedAt))
    : [];
  const canToggle = role === 'admin' && ['customers', 'team', 'products', 'plans', 'discounts', 'taxes'].includes(page);
  const hasActionColumn = page === 'subscriptions' || page === 'invoices' || page === 'quotations' || (page === 'plans' && customer) || canToggle;
  const actions = (row) => {
    if (page === 'subscriptions') {
      if (customer) {
        const pending = new Set((row.requests || []).filter((request) => request.status === 'pending').map((request) => request.type));
        return <div className="row-actions">
          {row.status === 'active' && row.plan?.allowPause && !pending.has('pause') && <button className="small-action" onClick={() => onSubscriptionAction(row, 'pause-request')}>Request pause</button>}
          {['active', 'paused'].includes(row.status) && !pending.has('cancel') && <button className="small-action reject-action" onClick={() => onSubscriptionAction(row, 'cancel-request')}>Request cancellation</button>}
          {['closed', 'expired'].includes(row.status) && row.plan?.allowRenewal && !pending.has('renew') && <button className="small-action pay-action" onClick={() => onSubscriptionAction(row, 'renew-request')}>Request renewal</button>}
        </div>;
      }
      return <select className="row-select" value="" aria-label="Subscription action" onChange={(event) => { if (event.target.value) onSubscriptionAction(row, event.target.value); }}><option value="">Actions</option>{row.status === 'active' && row.plan?.allowPause && <option value="pause">Pause</option>}{row.status === 'paused' && <option value="resume">Resume</option>}{['draft', 'confirmed'].includes(row.status) && <option value="activate">Activate</option>}{(row.status === 'expired' || (row.status === 'active' && row.plan?.allowEarlyClose)) && <option value="close">Close</option>}{['closed', 'expired'].includes(row.status) && row.plan?.allowRenewal && <option value="renew">Renew</option>}</select>;
    }
    if (page === 'invoices' && canManage && row.outstanding > 0 && row.status !== 'cancelled') return <button className="small-action pay-action" onClick={() => onPayment(row)}>Record payment</button>;
    if (page === 'quotations' && canManage && ['sent', 'draft'].includes(row.status)) return <div className="row-actions"><button className="small-action" onClick={() => onAction(`/quotations/${row._id}/status`, { status: 'accepted' }, 'Quote accepted and subscription created.')}>Accept &amp; convert</button><button className="small-action reject-action" onClick={() => onAction(`/quotations/${row._id}/status`, { status: 'rejected' }, 'Quotation rejected.')}>Reject</button></div>;
    if (page === 'plans' && customer && row.active) return <button className="small-action pay-action" onClick={() => onSubscribe(row)}>Choose plan <ArrowUpRight size={13} /></button>;
    if (canToggle) return <button className={`small-action ${row.active ? 'reject-action' : 'pay-action'}`} onClick={() => onToggle(row)}>{row.active ? 'Deactivate' : 'Reactivate'}</button>;
    return null;
  };
  if (busy) return <div className="panel table-panel"><div className="loading-panel"><span className="spinner" /> Loading records…</div></div>;
  return <div className="list-page-stack">
  {page === 'subscriptions' && <CustomerRequestsPanel requests={requestRows} customer={customer} canReview={canReviewRequests} onReview={onReviewRequest} />}
  <section className="panel table-panel">
    <div className="table-toolbar"><div className="table-count">{rows.length} {rows.length === 1 ? 'record' : 'records'}</div><label className="table-search"><Search size={15} /><input placeholder={`Search ${config.title.toLowerCase()}…`} value={query} onChange={(event) => setQuery(event.target.value)} /><kbd>⌘ K</kbd></label></div>
    {rows.length ? <div className="table-scroll"><table><thead><tr>{config.columns.map(([, label]) => <th key={label}>{label}</th>)}{hasActionColumn && <th className="actions-head">Action</th>}</tr></thead><tbody>
      {rows.map((row) => <tr key={row._id}>{config.columns.map(([path, , type]) => {
        let value = path.split('.').reduce((result, part) => result?.[part], row);
        return <td key={path} className={type === 'money' ? 'money-cell' : ''}>
          {type === 'money' ? money(value) : type === 'date' ? date(value) : type === 'status' ? <Status value={value} /> : type === 'boolean' ? <span className={`availability ${value ? 'is-active' : ''}`}><i />{value ? 'Active' : 'Inactive'}</span> : type === 'discountValue' ? (row.kind === 'percentage' ? `${value}%` : money(value)) : type === 'percent' ? `${value}%` : value || <span className="muted-value">—</span>}
        </td>;
      })}{hasActionColumn && <td className="row-action-cell">{actions(row)}</td>}</tr>)}
    </tbody></table></div> : <EmptyState title={query ? 'No matching records' : `No ${config.title.toLowerCase()} yet`} description={query ? 'Try another search term.' : page === 'subscriptions' ? 'Subscriptions will appear once a plan is started.' : page === 'invoices' ? 'Invoices are created when subscriptions are billed.' : page === 'payments' ? 'Recorded payments will appear here.' : page === 'plans' ? 'Available plans will appear here.' : 'New records will appear here when they are created.'} />}
    <div className="table-footer"><span>Showing {rows.length} {rows.length === 1 ? 'record' : 'records'}</span><span>SubSight records update as changes are saved.</span></div>
  </section></div>;
}

function CustomerRequestsPanel({ requests, customer, canReview, onReview }) {
  const pendingCount = requests.filter(({ request }) => request.status === 'pending').length;
  return <section className="panel request-panel">
    <div className="panel-heading request-heading"><div><h2>{customer ? 'My requests' : 'Customer requests'}</h2><p>{customer ? 'Track decisions on your subscription requests.' : 'Review pause, cancellation and renewal requests from customers.'}</p></div>{canReview && <span className="request-count">{pendingCount} pending</span>}</div>
    {!requests.length
      ? <EmptyState title={customer ? 'No subscription requests' : 'No customer requests yet'} description={customer ? 'Requests you submit will appear here with their review status.' : 'Customer pause, cancellation and renewal requests will appear here.'} compact />
      : <div className="table-scroll"><table className="requests-table"><thead><tr><th>Subscription</th><th>Customer</th><th>Email</th><th>Plan</th><th>Request</th><th>Requested</th><th>Status</th>{canReview && <th>Review</th>}</tr></thead><tbody>
        {requests.map(({ subscription, request }) => <tr key={request._id}>
          <td className="request-number">{subscription.number}</td>
          <td>{subscription.customer?.name || '—'}</td>
          <td>{subscription.customer?.email || '—'}</td>
          <td>{subscription.plan?.name || '—'}</td>
          <td>{request.type === 'cancel' ? 'Cancellation' : titleCase(request.type)}</td>
          <td>{date(request.requestedAt)}</td>
          <td><Status value={request.status} /></td>
          {canReview && <td>{request.status === 'pending'
            ? <div className="row-actions"><button className="small-action pay-action" onClick={() => onReview({ subscription, request, decision: 'approved' })}>Approve</button><button className="small-action reject-action" onClick={() => onReview({ subscription, request, decision: 'rejected' })}>Reject</button></div>
            : <span className="reviewed-note">{request.reviewedBy?.name ? `By ${request.reviewedBy.name} · ` : ''}{request.reviewedAt ? date(request.reviewedAt) : 'Processed'}</span>}</td>}
        </tr>)}
      </tbody></table></div>}
  </section>;
}

function Status({ value = '' }) {
  const normalized = value.toLowerCase();
  return <span className={`status-badge status-${normalized}`}><i />{titleCase(normalized)}</span>;
}

function EmptyState({ title, description, compact = false }) {
  return <div className={`empty-state ${compact ? 'empty-compact' : ''}`}><span className="empty-icon"><FileText size={18} /></span><b>{title}</b><p>{description}</p></div>;
}

function ProfilePanel({ user, onSave }) {
  const [name, setName] = useState(user.name);
  const [busy, setBusy] = useState(false);
  async function submit(event) { event.preventDefault(); setBusy(true); await onSave(name); setBusy(false); }
  return <section className="panel profile-panel"><div className="panel-heading"><div><h2>Profile details</h2><p>Manage your personal information.</p></div></div><form onSubmit={submit}><Field label="Full name" value={name} onChange={(event) => setName(event.target.value)} required /><Field label="Email address" value={user.email} readOnly /><p className="field-hint">Email address is managed by your account and cannot be changed here.</p><button className="button primary" disabled={busy}>{busy ? 'Saving…' : 'Save changes'} <Check size={15} /></button></form></section>;
}

function AppFrame() {
  const [user, setUser] = useState(null);
  const [showLanding, setShowLanding] = useState(true);
  const [checking, setChecking] = useState(Boolean(localStorage.getItem('subsight-token')));
  const location = useLocation();
  useEffect(() => {
    if (!localStorage.getItem('subsight-token')) return;
    request('get', '/auth/me').then((result) => setUser(result.user)).catch(() => { localStorage.removeItem('subsight-token'); setUser(null); }).finally(() => setChecking(false));
  }, []);
  const navigate = useNavigate();
  useEffect(() => { if (user && location.pathname === '/') navigate('/dashboard', { replace: true }); }, [location.pathname, navigate, user]);
  function logout() {
    request('post', '/auth/logout').catch(() => {});
    localStorage.removeItem('subsight-token');
    setUser(null);
    navigate('/', { replace: true });
  }
  if (checking) return <div className="initial-loader"><span className="spinner" /> Connecting to SubSight…</div>;
  if (!user && showLanding) return <Landing onGetStarted={() => setShowLanding(false)} onSignIn={() => setShowLanding(false)} />; 
  if (!user) return <AuthPage onLogin={setUser} />;
  return <Workspace key={user.id} user={user} onLogout={logout} />;
}

export default function App() {
  return <BrowserRouter><Routes><Route path="*" element={<AppFrame />} /></Routes></BrowserRouter>;
}
