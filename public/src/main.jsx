import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import '../styles.css';
import '../login.css';
import '../landing.css';
import '../landing-theme.css';
import '../dashboard.css';
import '../shipment.css';

function LogoMark() {
  return <span className="showcase-logo" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M3 6.5 12 2l9 4.5v11L12 22l-9-4.5v-11Zm9 5.5 9-4.5M12 12 3 7.5M12 12v10M7.5 4.25l9 4.5" /></svg></span>;
}

const APPLICATION_NAME = 'Container Desk';

function LoginPage({ authenticate, onAuthenticated }) {
  const [error, setError] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    document.title = `${APPLICATION_NAME} · Sign in`;
  }, []);

  async function submit(event) {
    event.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      await authenticate(Object.fromEntries(new FormData(event.currentTarget)));
      await onAuthenticated();
    } catch (requestError) {
      setError(requestError.message || 'Sign in failed.');
      setSubmitting(false);
    }
  }

  return <section className="login-page">
    <aside className="login-showcase">
      <div className="showcase-brand"><LogoMark /><span className="showcase-business">{APPLICATION_NAME}</span></div>
      <div className="showcase-copy"><p className="showcase-kicker">Cargo operations, simplified</p><h1>Move every shipment forward with confidence.</h1><p>Manage customers, consignments, box details, and invoices from one secure workspace.</p></div>
      <div className="showcase-status"><span className="status-pulse" aria-hidden="true"></span><span>Secure cloud workspace</span></div>
    </aside>
    <main className="login-panel">
      <div className="login-card">
        <div className="mobile-brand"><LogoMark /><span>{APPLICATION_NAME}</span></div>
        <div className="login-heading"><p className="login-eyebrow">Welcome back</p><h2>Sign in to your account</h2><p>Enter your credentials to continue to the dashboard.</p></div>
        <form id="login-form" onSubmit={submit}>
          {error && <p className="message error">{error}</p>}
          <label htmlFor="login-username">Username</label>
          <div className="login-input-wrap"><svg aria-hidden="true" viewBox="0 0 24 24"><path d="M20 21a8 8 0 0 0-16 0M12 13a5 5 0 1 0 0-10 5 5 0 0 0 0 10Z" /></svg><input id="login-username" name="username" autoComplete="username" placeholder="Enter your username" required autoFocus /></div>
          <label htmlFor="login-password">Password</label>
          <div className="login-input-wrap"><svg aria-hidden="true" viewBox="0 0 24 24"><path d="M7 10V7a5 5 0 0 1 10 0v3M5 10h14v11H5V10Z" /></svg><input id="login-password" name="password" type={showPassword ? 'text' : 'password'} autoComplete="current-password" placeholder="Enter your password" required /><button className="password-toggle" type="button" aria-label={showPassword ? 'Hide password' : 'Show password'} aria-pressed={showPassword} onClick={() => setShowPassword(value => !value)}><svg aria-hidden="true" viewBox="0 0 24 24"><path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12Z" /><circle cx="12" cy="12" r="2.5" /></svg></button></div>
          <button className="login-submit" type="submit" disabled={submitting}>{submitting ? 'Signing in…' : <>Sign in <span aria-hidden="true">→</span></>}</button>
        </form>
        <p className="login-security"><svg aria-hidden="true" viewBox="0 0 24 24"><path d="M12 22s8-3.5 8-10V5l-8-3-8 3v7c0 6.5 8 10 8 10Z" /></svg>Your connection is secured and encrypted.</p>
      </div>
    </main>
  </section>;
}

function Icon({ children }) {
  return <svg aria-hidden="true" viewBox="0 0 24 24">{children}</svg>;
}

function LandingPage({ onSignIn }) {
  const scrollToFeatures = event => {
    event.preventDefault();
    document.querySelector('#features')?.scrollIntoView({ behavior: 'smooth' });
  };
  return <main className="landing-page">
    <header className="landing-header">
      <a className="landing-brand" href="#top"><LogoMark /><span>Container Desk</span></a>
      <nav className="landing-nav"><a href="#features" onClick={scrollToFeatures}>Features</a><a href="#workflow">How it works</a></nav>
      <button className="landing-login" onClick={onSignIn}>Sign in <Icon><path d="M5 12h14m-6-6 6 6-6 6" /></Icon></button>
    </header>
    <section id="top" className="landing-hero">
      <div className="hero-copy">
        <p className="landing-eyebrow">Built for modern cargo operations</p>
        <h1>Every shipment.<br /><em>One clear view.</em></h1>
        <p className="hero-description">A focused workspace for managing customers, consignments, invoices, and delivery progress from first booking to final handover.</p>
        <div className="hero-actions"><button className="landing-primary" onClick={onSignIn}>Open your workspace <Icon><path d="M5 12h14m-6-6 6 6-6 6" /></Icon></button><a href="#features" onClick={scrollToFeatures}>Explore features ↓</a></div>
        <p className="hero-note">Secure workspace · Built for your team</p>
      </div>
      <div className="hero-visual" aria-label="Container Desk workspace preview">
        <div className="workspace-card"><div className="preview-bar"><b>CD</b><span></span><span></span><span></span><i>AM</i></div><div className="preview-layout"><aside><strong>Container Desk</strong><small className="active">Overview</small><small>Shipments</small><small>Customers</small><small>Invoices</small><small>Delivery status</small></aside><section><div className="preview-heading"><div><small>Operations overview</small><strong>Good morning, Alex</strong></div><button>+ New shipment</button></div><div className="preview-stats"><article><small>Active shipments</small><strong>12</strong><b>↑ 3 this month</b></article><article><small>Customers</small><strong>248</strong><b>↑ 18 this month</b></article><article><small>Invoices issued</small><strong>€48.2k</strong><b>↑ 12.5%</b></article></div><div className="preview-list"><div><strong>Shipment activity</strong><small>View all</small></div><article><i className="blue"></i><span><strong>Hamburg → Colombo</strong><small>Container MSKU 482 901 2</small></span><b>In transit</b></article><article><i className="orange"></i><span><strong>Berlin → Galle</strong><small>Invoice ready to send</small></span><b>Pending</b></article><article><i className="green"></i><span><strong>Munich → Kandy</strong><small>Delivery confirmed</small></span><b>Delivered</b></article></div></section></div></div>
        <div className="preview-toast"><b>✓</b><span><strong>Delivery confirmed</strong><small>Munich → Kandy</small></span></div>
      </div>
    </section>
    <section id="features" className="landing-features"><div className="section-heading"><p className="landing-eyebrow">Everything in one place</p><h2>Run the moving parts<br />without the busywork.</h2><p>One secure workspace connects your operation from a customer’s first enquiry to a completed delivery.</p></div><div className="feature-grid"><article className="feature-card dark"><div className="feature-symbol">□</div><h3>Shipment management</h3><p>Create shipments, organise consignments, and keep every cargo detail easy to find.</p><div className="route-preview"><span>DE</span><i></i><span>LK</span><b>Shipment active</b></div></article><article className="feature-card"><div className="feature-symbol">◉</div><h3>Customer records</h3><p>Keep contacts, delivery details, history, and important notes together in one record.</p><div className="customer-preview"><span>MR <b>Maria Rodriguez<small>Active customer</small></b></span><span>JD <b>James Davis<small>New enquiry</small></b></span></div></article><article className="feature-card"><div className="feature-symbol">↗</div><h3>Delivery visibility</h3><p>Follow each container’s journey and update customers with confidence at every stage.</p><div className="delivery-preview"><span>DE</span><i>··········</i><span>LK</span><b>On route</b></div></article><article className="feature-card wide"><div><div className="feature-symbol">▥</div><h3>Invoices that stay connected</h3><p>Turn completed consignment details into clear, professional invoices without entering the same information twice.</p></div><div className="invoice-preview"><small>INVOICE</small><strong>€ 4,775.00</strong><span>Shipment JUL-2026-01</span><b>Ready to send</b></div></article></div></section>
    <section id="workflow" className="landing-workflow"><div><p className="landing-eyebrow">A simpler workflow</p><h2>Less chasing.<br />More control.</h2></div><div className="workflow-steps"><article><span>01</span><h3>Create the shipment</h3><p>Set up the route and reference once.</p></article><article><span>02</span><h3>Add your customers</h3><p>Keep every consignment connected.</p></article><article><span>03</span><h3>Track the progress</h3><p>Stay ahead of every delivery.</p></article></div></section>
    <section className="landing-cta"><p className="landing-eyebrow">Your workspace is ready</p><h2>Bring clarity to<br /><em>every container.</em></h2><p>Sign in to manage your cargo operation in one secure place.</p><button className="landing-primary" onClick={onSignIn}>Sign in to Container Desk <Icon><path d="M5 12h14m-6-6 6 6-6 6" /></Icon></button></section>
    <footer className="landing-footer"><a className="landing-brand" href="#top"><LogoMark /><span>Container Desk</span></a><p>Built for cargo operations.</p><button onClick={onSignIn}>Sign in</button></footer>
  </main>;
}

function CreateShipmentForm({ createShipment, onCancel, onCreated }) {
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function submit(event) {
    event.preventDefault();
    const form = event.currentTarget;
    setError('');
    setSubmitting(true);
    try {
      const shipment = await createShipment(Object.fromEntries(new FormData(form)));
      form.reset();
      await onCreated(shipment);
    } catch (requestError) {
      setError(requestError.message || 'The shipment could not be created.');
    } finally {
      setSubmitting(false);
    }
  }

  return <>
    <h3>Create shipment</h3>
    <form id="create-shipment" onSubmit={submit}>
      {error && <p className="message error">{error}</p>}
      <label>Name<input name="name" required placeholder="July 2026 Germany–Sri Lanka" /></label>
      <label>Reference<input name="reference" required placeholder="JUL-2026-01" /></label>
      <button disabled={submitting}>{submitting ? 'Creating…' : 'Create'}</button>
      <button type="button" id="cancel-shipment" className="secondary" disabled={submitting} onClick={onCancel}>Cancel</button>
    </form>
  </>;
}

let createShipmentRoot = null;
let createShipmentRootNode = null;
window.renderCreateShipmentForm = (node, properties) => {
  if (createShipmentRootNode !== node) {
    createShipmentRoot?.unmount();
    createShipmentRootNode = node;
    createShipmentRoot = createRoot(node);
  }
  createShipmentRoot.render(<CreateShipmentForm {...properties} />);
};

function ShipmentIcon({ name }) {
  if (name === 'open') return <svg aria-hidden="true" viewBox="0 0 24 24"><path d="M14 5h5v5M19 5l-8 8M18 13v5a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5" /></svg>;
  if (name === 'activate') return <svg aria-hidden="true" viewBox="0 0 24 24"><circle cx="12" cy="12" r="9" /><path d="m10 8 6 4-6 4Z" /></svg>;
  if (name === 'deactivate') return <svg aria-hidden="true" viewBox="0 0 24 24"><circle cx="12" cy="12" r="9" /><path d="M10 9v6M14 9v6" /></svg>;
  if (name === 'edit') return <svg aria-hidden="true" viewBox="0 0 24 24"><path d="m4 20 4.5-1 10-10a2.1 2.1 0 0 0-3-3l-10 10L4 20Z" /><path d="m14 7 3 3" /></svg>;
  if (name === 'users') return <svg aria-hidden="true" viewBox="0 0 24 24"><circle cx="9" cy="7" r="4" /><path d="M2 21c.5-5.2 3-8 7-8s6.5 2.8 7 8M16 4a3 3 0 0 1 0 6M17 13c3 0 4.7 2.1 5 6" /></svg>;
  return <svg aria-hidden="true" viewBox="0 0 24 24"><path d="M4 7h16M9 7V4h6v3M7 7l1 13h8l1-13M10 11v5M14 11v5" /></svg>;
}

function ShipmentList({ shipments, administratorAccess, onOpen, onEdit, onDelete, onStatusChange }) {
  const [pendingStatusId, setPendingStatusId] = useState(null);
  const [error, setError] = useState('');
  const createdDate = value => new Intl.DateTimeFormat(undefined, { year: 'numeric', month: 'short', day: 'numeric' }).format(new Date(value));

  async function changeStatus(shipment) {
    const nextStatus = shipment.status === 'ACTIVE' ? 'OPEN' : 'ACTIVE';
    setError('');
    setPendingStatusId(shipment.id);
    try {
      await onStatusChange(shipment, nextStatus);
    } catch (requestError) {
      setError(requestError.message || 'The shipment status could not be changed.');
    } finally {
      setPendingStatusId(null);
    }
  }

  if (!shipments.length) return <p>{administratorAccess ? 'No shipments yet. Create your first shipment.' : 'No active shipments are available.'}</p>;

  return <>
    {error && <p className="message error">{error}</p>}
    {shipments.map(shipment => {
      const active = shipment.status === 'ACTIVE';
      const changingStatus = pendingStatusId === shipment.id;
      return <article className="card shipment" key={shipment.id}>
        <div>
          <div className="shipment-heading"><h3>{shipment.name.replaceAll('_', ' ')}</h3>{administratorAccess && <span className={`shipment-status ${active ? 'is-active' : ''}`}>{active ? '● Active' : '○ Inactive'}</span>}</div>
          <p>Created {createdDate(shipment.created_at)}</p>
          <div className="shipment-identifiers"><span className="shipment-metric shipment-customer-metric"><ShipmentIcon name="users" /><small>Customers</small><strong>{shipment.consignment_count}</strong></span><span className="shipment-metric"><small>Internal reference</small><strong>{shipment.reference}</strong></span>{administratorAccess && <span className="shipment-metric"><small>Container number</small><strong>{shipment.container_number || 'Not assigned yet'}</strong></span>}</div>
        </div>
        <div className="shipment-actions">
          <button data-open-id={shipment.id} onClick={() => onOpen(shipment)}><ShipmentIcon name="open" /><span>Open shipment</span></button>
          {administratorAccess && <>
            <button className={`shipment-activation ${active ? 'is-active' : ''}`} data-status-id={shipment.id} data-next-status={active ? 'OPEN' : 'ACTIVE'} disabled={changingStatus} onClick={() => changeStatus(shipment)}>{changingStatus ? <span>{active ? 'Deactivating…' : 'Activating…'}</span> : <><ShipmentIcon name={active ? 'deactivate' : 'activate'} /><span>{active ? 'Deactivate' : 'Activate'}</span></>}</button>
            <button className="shipment-delete" data-delete-id={shipment.id} data-shipment-name={shipment.name} aria-label={`Delete ${shipment.name}`} title="Delete shipment" onClick={() => onDelete(shipment)}><ShipmentIcon name="delete" /></button>
          </>}
        </div>
        {administratorAccess && <button type="button" className="shipment-edit" data-edit-id={shipment.id} title="Edit shipment details" aria-label={`Edit ${shipment.name} shipment details`} onClick={() => onEdit(shipment)}><ShipmentIcon name="edit" /></button>}
      </article>;
    })}
  </>;
}

let shipmentRoot = null;
let shipmentRootNode = null;
window.renderShipmentList = (node, properties) => {
  if (shipmentRootNode !== node) {
    shipmentRoot?.unmount();
    shipmentRootNode = node;
    shipmentRoot = createRoot(node);
  }
  shipmentRoot.render(<ShipmentList {...properties} />);
};

const root = createRoot(document.getElementById('react-root'));
window.renderLogin = properties => root.render(<LoginPage {...properties} />);
window.renderLanding = properties => root.render(<LandingPage {...properties} />);
window.clearReactView = () => root.render(null);

// The existing interface remains behavior-compatible while Vite owns the
// frontend build. New screens can now be migrated to React incrementally.
import('../app.js');
