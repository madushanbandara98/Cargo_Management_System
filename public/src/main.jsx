import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import '../styles.css';
import '../login.css';
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
window.clearReactView = () => root.render(null);
window.__CONTAINER_DESK_CONFIG__ = Object.freeze({
  apiBaseUrl: String(import.meta.env.VITE_API_BASE_URL || '').replace(/\/$/, '')
});

// The existing interface remains behavior-compatible while Vite owns the
// frontend build. New screens can now be migrated to React incrementally.
import('../app.js');
