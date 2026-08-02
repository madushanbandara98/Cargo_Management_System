const app = document.querySelector('#app');
let activeShipment = null;
let activeConsignment = null;
let editingItemId = null;
let draftItems = [];
let editingDraftItemIndex = null;
let currentUser = null;
let trackingRecords = [];
let deliveryStatusRefreshTimer = null;

const carrierTrackingUrls = {
  Maersk: 'https://www.maersk.com/tracking/',
  MSC: 'https://www.msc.com/track-a-shipment',
  'Hapag-Lloyd': 'https://www.hapag-lloyd.com/en/online-business/track/track-by-container-solution.html',
  'CMA CGM': 'https://www.cma-cgm.com/ebusiness/tracking',
  ONE: 'https://ecomm.one-line.com/one-ecom/manage-shipment/cargo-tracking',
  Evergreen: 'https://ct.shipmentlink.com/servlet/TDB1_CargoTracking.do',
  COSCO: 'https://elines.coscoshipping.com/ebusiness/cargotracking',
  OOCL: 'https://www.oocl.com/eng/ourservices/eservices/cargotracking/Pages/cargotracking.aspx'
};

async function api(path, options = {}) {
  const response = await fetch(path, { headers: { 'Content-Type': 'application/json', ...(options.headers || {}) }, ...options });
  if (response.status === 204) return null;
  const body = await response.json();
  if (!response.ok) throw new Error(body.error || 'Request failed.');
  return body;
}
function message(node, text, kind = 'error') { node.querySelector('.message')?.remove(); node.insertAdjacentHTML('afterbegin', `<p class="message ${kind}">${text}</p>`); }

function showToast(text, kind = 'success') {
  document.querySelector('.app-toast')?.remove();
  const toast = document.createElement('div');
  toast.className = `app-toast ${kind}`;
  toast.setAttribute('role', 'status');
  toast.setAttribute('aria-live', 'polite');
  toast.innerHTML = '<span class="app-toast-icon" aria-hidden="true">✓</span><span class="app-toast-message"></span><button type="button" aria-label="Dismiss notification">×</button>';
  toast.querySelector('.app-toast-message').textContent = text;
  document.body.append(toast);
  requestAnimationFrame(() => toast.classList.add('visible'));
  const dismiss = () => {
    if (!toast.isConnected) return;
    toast.classList.remove('visible');
    toast.addEventListener('transitionend', () => toast.remove(), { once: true });
    window.setTimeout(() => toast.remove(), 250);
  };
  toast.querySelector('button').onclick = dismiss;
  window.setTimeout(dismiss, 4500);
}

function identityInitials(value) {
  return String(value || '').trim().split(/\s+/).filter(Boolean).slice(0, 2).map(part => part[0]).join('').toUpperCase() || 'CM';
}

function hasAdministratorAccess(user = currentUser) {
  return ['OWNER', 'ADMIN'].includes(user?.role);
}

function updateSidebarIdentity(user) {
  const businessName = user.business_name || 'Cargo Management';
  const brandMark = document.querySelector('.dashboard-brand-mark');
  brandMark.replaceChildren();
  brandMark.classList.toggle('has-logo', Boolean(user.business_logo));
  if (user.business_logo) {
    const logo = document.createElement('img');
    logo.src = user.business_logo;
    logo.alt = '';
    brandMark.append(logo);
  } else brandMark.textContent = identityInitials(businessName);
  document.querySelector('#dashboard-business-name').textContent = businessName;
  const displayName = user.full_name || user.username;
  const adminName = document.querySelector('#admin-name');
  adminName.textContent = displayName;
  adminName.parentElement.prepend(adminName);
  document.querySelector('.profile-label').textContent = user.role === 'OWNER' ? 'System Owner' : user.role === 'ADMIN' ? 'Administrator' : 'Team member';
  document.querySelector('.avatar').textContent = identityInitials(displayName);
}

async function login() {
  app.innerHTML = document.querySelector('#login-template').innerHTML;
  const form = document.querySelector('#login-form');
  form.addEventListener('submit', async event => { event.preventDefault(); try { await api('/api/auth/login', { method: 'POST', body: JSON.stringify(Object.fromEntries(new FormData(form))) }); dashboard(); } catch (error) { message(form, error.message); } });
  const password = form.elements.password;
  const passwordToggle = form.querySelector('.password-toggle');
  passwordToggle.addEventListener('click', () => {
    const showing = password.type === 'text';
    password.type = showing ? 'password' : 'text';
    passwordToggle.setAttribute('aria-label', showing ? 'Show password' : 'Hide password');
    passwordToggle.setAttribute('aria-pressed', String(!showing));
  });
  try {
    const { businessName } = await api('/api/public/business');
    document.querySelector('#login-business-name').textContent = businessName;
    document.querySelector('#login-mobile-business-name').textContent = businessName;
    document.title = `${businessName} · Sign in`;
  } catch {
    document.querySelector('#login-business-name').textContent = 'Cargo Management';
    document.querySelector('#login-mobile-business-name').textContent = 'Cargo Management';
    document.title = 'Cargo Management · Sign in';
  }
}

async function dashboard() {
  let me;
  try { me = await api('/api/auth/me'); } catch { return login(); }
  currentUser = me.user;
  app.innerHTML = document.querySelector('#dashboard-template').innerHTML;
  initializeBusinessSettingsPanel();
  const sidebarTop = document.querySelector('.sidebar-top');
  sidebarTop.insertAdjacentHTML('afterbegin', '<div class="dashboard-brand"><span class="dashboard-brand-mark" aria-hidden="true">CM</span><div><strong id="dashboard-business-name">Cargo Management</strong><small>Cargo management</small></div></div>');
  let business = me.user.business_name || 'Cargo Management';
  try {
    business = me.user.business_name || (await api('/api/public/business')).businessName;
    document.title = `${business} · Dashboard`;
  } catch {}
  updateSidebarIdentity({ ...me.user, business_name: business });
  document.querySelector('#logout').onclick = async () => { await api('/api/auth/logout', { method: 'POST' }); login(); };
  document.querySelector('#new-shipment').onclick = () => { setActiveNavigation('new-shipment'); showNewShipmentForm(); };
  document.querySelector('#current-shipment').onclick = () => { setActiveNavigation('current-shipment'); showCurrentShipments(); };
  document.querySelector('#settings').onclick = () => { setActiveNavigation('settings'); showProfileSettings(currentUser); };
  document.querySelector('#profile-settings-form').addEventListener('submit', saveProfileSettings);
  document.querySelector('#change-password-form').addEventListener('submit', changeAdministratorPassword);
  configureBusinessLogoUpload();
  document.querySelector('#cancel-business-settings').onclick = () => {
    fillProfileSettings(currentUser);
    showToast('Unsaved settings were reset.', 'success');
  };
  if (hasAdministratorAccess(me.user)) {
    const customerButton = document.createElement('button');
    customerButton.id = 'customers';
    customerButton.className = 'nav-button';
    customerButton.textContent = 'Customers';
    document.querySelector('#current-shipment').after(customerButton);
    document.querySelector('#employees-panel').insertAdjacentHTML('beforebegin', '<section id="customers-panel" class="hidden"></section>');
    customerButton.onclick = () => { setActiveNavigation('customers'); showCustomerDirectory(); };
    const employeeButton = document.querySelector('#employees'); employeeButton.classList.remove('hidden'); employeeButton.onclick = () => { setActiveNavigation('employees'); showEmployeeManagement(); };
    const trackingButton = document.querySelector('#shipment-tracking'); trackingButton.classList.remove('hidden'); trackingButton.onclick = () => { setActiveNavigation('shipment-tracking'); showShipmentTracking(); };
    trackingButton.insertAdjacentHTML('afterend', '<button id="delivery-status" class="nav-button">Delivery status</button>');
    document.querySelector('#employees-panel').insertAdjacentHTML('beforebegin', '<section id="delivery-status-panel" class="hidden"><div class="page-heading"><h2>Delivery status</h2><p>Monitor customer deliveries updated by employees.</p></div><section class="card delivery-status-selector"><label>Shipment<select id="delivery-status-shipment"><option value="">Select shipment</option></select></label><span id="delivery-status-activation" class="delivery-status-activation hidden">Active</span></section><div id="delivery-status-content"><section class="card delivery-status-empty"><h3>Select a shipment</h3><p>Choose a shipment above to view its customer delivery progress.</p></section></div></section>');
    document.querySelector('#delivery-status').onclick = () => { setActiveNavigation('delivery-status'); showDeliveryStatus(); };
    const sidebarNavigation = document.querySelector('.sidebar-nav');
    document.querySelector('#current-shipment').textContent = 'Shipments';
    const navigationSection = label => { const heading = document.createElement('span'); heading.className = 'sidebar-section-label'; heading.textContent = label; return heading; };
    sidebarNavigation.replaceChildren(
      navigationSection('Operations'),
      document.querySelector('#current-shipment'),
      document.querySelector('#new-shipment'),
      document.querySelector('#delivery-status'),
      document.querySelector('#shipment-tracking'),
      navigationSection('Customers'),
      document.querySelector('#customers'),
      navigationSection('Administration'),
      document.querySelector('#employees'),
      document.querySelector('#settings')
    );
    if (me.user.role === 'OWNER') {
      const administratorsButton = document.createElement('button');
      administratorsButton.id = 'administrators';
      administratorsButton.className = 'nav-button';
      administratorsButton.textContent = 'Administrators';
      document.querySelector('#employees').before(administratorsButton);
      document.querySelector('#employees-panel').insertAdjacentHTML('beforebegin', '<section id="administrators-panel" class="hidden"></section>');
      administratorsButton.onclick = () => { setActiveNavigation('administrators'); showAdministratorManagement(); };
      const systemHealthButton = document.createElement('button');
      systemHealthButton.id = 'system-health';
      systemHealthButton.className = 'nav-button';
      systemHealthButton.textContent = 'System Health';
      administratorsButton.after(systemHealthButton);
      document.querySelector('#administrators-panel').insertAdjacentHTML('beforebegin', '<section id="system-health-panel" class="hidden"></section>');
      systemHealthButton.onclick = () => { setActiveNavigation('system-health'); showSystemHealth(); };
    }
    if (!document.querySelector('#sidebar-section-styles')) document.head.insertAdjacentHTML('beforeend', '<style id="sidebar-section-styles">.sidebar-nav::before{display:none}.sidebar-section-label{display:block;margin:.9rem 0 .2rem;padding:.9rem .8rem 0;border-top:1px solid #30394a;color:#8f99aa;font-size:.66rem;font-weight:800;letter-spacing:.1em;text-transform:uppercase}.sidebar-section-label:first-child{margin-top:0;padding-top:0;border-top:0}#customers::before{content:"▤"}#administrators::before{content:"♛"}#system-health::before{content:"◒"}@media(max-width:700px){.sidebar-section-label{display:none}}</style>');
  } else {
    document.querySelector('#new-shipment').classList.add('hidden');
    document.querySelector('#settings').classList.add('hidden');
  }
  document.querySelector('#cancel-shipment').onclick = showCurrentShipments;
  document.querySelector('#create-shipment').addEventListener('submit', async event => { event.preventDefault(); const form = event.currentTarget; try { const shipment = await api('/api/shipments', { method: 'POST', body: JSON.stringify(Object.fromEntries(new FormData(form))) }); form.reset(); document.querySelector('#shipment-form').classList.add('hidden'); await loadShipments(); openShipment(shipment); } catch (error) { message(form, error.message); } });
  await loadShipments();
  setActiveNavigation('current-shipment');
}

function setActiveNavigation(id) {
  if (id !== 'system-health') document.querySelector('#system-health-panel')?.classList.add('hidden');
  document.querySelectorAll('.sidebar-nav .nav-button').forEach(button => {
    const active = button.id === id;
    button.classList.toggle('active', active);
    if (active) button.setAttribute('aria-current', 'page');
    else button.removeAttribute('aria-current');
  });
}

async function loadShipments() {
  const shipments = await api('/api/shipments'); const list = document.querySelector('#shipment-list');
  const createdDate = value => new Intl.DateTimeFormat(undefined, { year: 'numeric', month: 'short', day: 'numeric' }).format(new Date(value));
  list.innerHTML = shipments.length ? shipments.map(s => `<article class="card shipment"><div><h3>${escapeHtml(s.name)}</h3><p>Created ${createdDate(s.created_at)} · ${s.consignment_count} ${s.consignment_count === 1 ? 'customer' : 'customers'}${hasAdministratorAccess() ? ` · ${s.status === 'ACTIVE' ? 'Active' : 'Not active'}` : ''}</p></div><div class="shipment-actions"><button data-open-id="${s.id}">Open</button>${hasAdministratorAccess() ? `<button class="shipment-activation ${s.status === 'ACTIVE' ? 'is-active' : ''}" data-status-id="${s.id}" data-next-status="${s.status === 'ACTIVE' ? 'OPEN' : 'ACTIVE'}">${s.status === 'ACTIVE' ? 'Deactivate' : 'Activate'}</button><button class="shipment-delete" data-delete-id="${s.id}" data-shipment-name="${escapeHtml(s.name)}">Delete</button>` : ''}</div></article>`).join('') : `<p>${hasAdministratorAccess() ? 'No shipments yet. Create your first shipment.' : 'No active shipments are available.'}</p>`;
  list.querySelectorAll('[data-open-id]').forEach(button => button.onclick = () => openShipment(shipments.find(s => s.id === button.dataset.openId)));
  list.querySelectorAll('[data-status-id]').forEach(button => button.onclick = async () => {
    const activating = button.dataset.nextStatus === 'ACTIVE';
    button.disabled = true;
    button.textContent = activating ? 'Activating…' : 'Deactivating…';
    try {
      await api(`/api/shipments/${button.dataset.statusId}/status`, { method: 'PATCH', body: JSON.stringify({ status: button.dataset.nextStatus }) });
      showToast(`Shipment ${activating ? 'activated' : 'deactivated'}.`);
      await loadShipments();
    } catch (error) {
      button.disabled = false;
      button.textContent = activating ? 'Activate' : 'Deactivate';
      message(list, error.message);
    }
  });
  list.querySelectorAll('[data-delete-id]').forEach(button => button.onclick = () => showDeleteShipmentDialog({ id: button.dataset.deleteId, name: button.dataset.shipmentName }));
}

function showDeleteShipmentDialog(shipment) {
  const dialog = document.createElement('dialog');
  dialog.className = 'confirm-dialog';
  dialog.innerHTML = `<form id="delete-shipment-form"><div class="confirm-dialog-icon" aria-hidden="true">!</div><h2>Delete shipment and its records?</h2><p>Permanently delete <strong>${escapeHtml(shipment.name)}</strong>, including its customer deliveries, box items, invoices, and document records. Saved customer profiles will remain available.</p><label>Enter your administrator password<input name="password" type="password" autocomplete="current-password" required autofocus></label><div class="confirm-dialog-actions"><button type="button" class="secondary" data-cancel>Cancel</button><button class="danger-button">Delete everything</button></div></form>`;
  document.body.append(dialog);
  const form = dialog.querySelector('#delete-shipment-form');
  dialog.querySelector('[data-cancel]').onclick = () => dialog.close();
  dialog.addEventListener('click', event => { if (event.target === dialog) dialog.close(); });
  dialog.addEventListener('close', () => dialog.remove());
  form.addEventListener('submit', async event => {
    event.preventDefault();
    const submit = form.querySelector('.danger-button');
    submit.disabled = true;
    submit.textContent = 'Deleting…';
    try {
      await api(`/api/shipments/${shipment.id}`, { method: 'DELETE', body: JSON.stringify(Object.fromEntries(new FormData(form))) });
      dialog.close();
      await loadShipments();
    } catch (error) {
      submit.disabled = false;
      submit.textContent = 'Delete everything';
      message(form, error.message);
    }
  });
  dialog.showModal();
}

async function openShipment(shipment, pushHistory = true) {
  if (!hasAdministratorAccess()) return openEmployeeShipment(shipment, pushHistory);
  activeShipment = shipment;
  activeConsignment = null;
  draftItems = [];
  editingDraftItemIndex = null;
  if (pushHistory) history.pushState({ view: 'shipment', shipmentId: shipment.id }, '', `#shipment-${shipment.id}`);
  app.innerHTML = `<style>.shipment-screen{min-height:100vh;background:#f7f8fb;padding:1.5rem}.shipment-screen-header{max-width:1400px;margin:0 auto 1rem;display:flex;justify-content:space-between;align-items:center;gap:1rem}.shipment-screen-header h1{margin:0;font-size:1.5rem}.shipment-screen-header p{margin:.25rem 0 0;color:#687086}.shipment-screen-main{max-width:1400px;margin:auto}@media(max-width:600px){.shipment-screen{padding:1rem}.shipment-screen-header{align-items:flex-start;flex-direction:column}}</style><main class="shipment-screen"><header class="shipment-screen-header"><div><h1>${escapeHtml(shipment.name)}</h1><p>${escapeHtml(shipment.reference)}</p></div><button id="back-to-dashboard" class="secondary">← Back to dashboard</button></header><section id="consignment-panel" class="card"></section></main>`;
  document.querySelector('#back-to-dashboard').onclick = () => { history.back(); };
  const panel = document.querySelector('#consignment-panel');
  const consignments = await api(`/api/shipments/${shipment.id}/consignments`);
  panel.className = 'card shipment-page';
  panel.innerHTML = `<style>.shipment-page{padding:0;overflow:hidden}.customer-form{padding:1.5rem;background:#fff500}.customer-heading{text-align:center}.customer-heading h2{margin:0}.customer-heading p{margin:.25rem 0 1.25rem}.customer-grid{display:grid;grid-template-columns:repeat(6,minmax(0,1fr));gap:.8rem 1rem}.customer-grid .wide{grid-column:span 4}.customer-grid label:nth-child(5),.customer-grid label:nth-child(7){grid-column:span 2}.items-entered{display:flex;margin-top:1rem;align-items:center}.items-entered input{width:auto}.customer-actions{display:flex;justify-content:flex-end;gap:.75rem;margin-top:1rem}.saved-customers{padding:1rem 1.5rem;border-bottom:1px solid #d9dde5}.saved-customers h3,.delivery-items h3{margin:.1rem 0 .8rem}.saved-customers button{margin:0 .5rem .5rem 0}.customer-entry{display:inline-flex;align-items:center;margin:0 .5rem .5rem 0}.customer-entry button{margin:0}.customer-entry .remove-customer{border-radius:0 8px 8px 0;padding:.55rem .7rem;background:#f9dedc;color:#8a1c14}.customer-entry button:first-child{border-radius:8px 0 0 8px}.delivery-items{padding:1.5rem;background:#f4f5f7}.item-form{display:grid;grid-template-columns:repeat(4,minmax(100px,1fr)) 2fr auto;align-items:end;gap:.75rem}.item-form .description-field{grid-column:auto}.items-table{background:#fff;margin:1.25rem 0}.items-table th{white-space:nowrap}.empty-table{text-align:center;padding:1.25rem!important;color:#687086}.shipment-totals{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:1rem}.shipment-totals div{padding:.85rem;background:#fff;border:1px solid #cbd1dc;text-align:center}.shipment-totals span,.shipment-totals strong{display:block}.shipment-totals span{font-size:.82rem}.shipment-totals strong{margin-top:.3rem;font-size:1.15rem}@media(max-width:900px){.customer-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.customer-grid .wide,.customer-grid label:nth-child(5),.customer-grid label:nth-child(7){grid-column:span 1}.item-form{grid-template-columns:repeat(2,minmax(0,1fr))}.shipment-totals{grid-template-columns:repeat(2,minmax(0,1fr))}}@media(max-width:550px){.customer-grid,.item-form,.shipment-totals{grid-template-columns:1fr}.customer-actions{justify-content:stretch}.customer-actions button{flex:1}}</style><form id="consignment-form" class="customer-form"><div class="customer-heading"><h2>Customer delivery</h2><p>Add the customer and every item included in this shipment.</p></div><div class="customer-grid"><label>Customer reference<input name="customerRef" placeholder="e.g. M-100" required></label><label>Customer name<input name="customerName" placeholder="e.g. Madushan Perera" required></label><label>Customer ID<input name="customerId" placeholder="e.g. Passport or ID number"></label><label class="wide">Pickup address<input name="germanAddress" placeholder="Name, street and house number, postcode, city"></label><label>Phone (DE)<input name="phoneDE" placeholder="+49 ..."></label><label class="wide">Delivery address<input name="sriLankanAddress" placeholder="Name, street and house number, postcode, city"></label><label>Phone (LK)<input name="phoneLK" placeholder="+94 ..."></label><label>Special price per m³ (€)<input name="ratePerCubic" type="number" min="0" step="0.01" value="530"></label><label>Delivery charge (€)<input name="deliveryCharge" type="number" min="0" step="0.01" value="0"></label></div><div class="customer-footer"><div class="customer-actions"><button>Save customer</button><button type="button" id="new-customer" class="secondary">New customer</button></div></div></form><section class="saved-customers"><h3>Customers in this shipment</h3><div id="consignments">${consignments.map(c => `<span class="customer-entry"><button class="secondary" data-consignment="${c.id}">${escapeHtml(c.customer_ref)} — ${escapeHtml(c.customer_name)}</button><button type="button" class="remove-customer" data-remove-consignment="${c.id}" data-customer-ref="${escapeHtml(c.customer_ref)}" aria-label="Remove ${escapeHtml(c.customer_ref)} from this shipment">Remove</button></span>`).join('') || '<p>No customers added yet.</p>'}</div></section><div id="item-editor"><p class="item-empty-state">Save or load a customer to add delivery items.</p></div><div class="shipment-completion"><label class="items-entered"><input name="allItemsEntered" form="consignment-form" type="checkbox"> All items are entered</label></div>`;
  panel.querySelector('#consignments').innerHTML = consignments.length ? `<details id="customer-list-panel" class="customer-list-panel" open><summary><span>Customer list <span class="customer-count">${consignments.length}</span></span><span class="list-chevron" aria-hidden="true">⌄</span></summary><div class="customer-list-content"><label class="customer-search">Search customers<input id="customer-search" type="search" placeholder="Reference or name"></label><div class="customer-list">${consignments.map(c => `<div class="customer-row" data-customer-search="${escapeHtml(`${c.customer_ref} ${c.customer_name}`.toLowerCase())}"><button type="button" class="customer-load" data-consignment="${c.id}"><span><strong>${escapeHtml(c.customer_ref)} — ${escapeHtml(c.customer_name)}</strong><small>Load customer delivery</small></span><span class="load-arrow" aria-hidden="true">›</span></button><details class="customer-menu"><summary aria-label="Actions for ${escapeHtml(c.customer_ref)}">⋮</summary><button type="button" data-remove-consignment="${c.id}" data-customer-ref="${escapeHtml(c.customer_ref)}">Remove from shipment</button></details></div>`).join('')}</div></div></details>` : '<p>No customers added yet.</p>';
  panel.querySelector('#customer-list-panel')?.removeAttribute('open');
  panel.querySelector('style').textContent += `.shipment-page{margin-top:1rem;border-radius:16px}.customer-form{display:block;padding:clamp(1rem,3vw,2rem)}.customer-heading{margin-bottom:1.5rem}.customer-heading p{margin-bottom:0}.customer-grid{gap:1rem 1.25rem}.customer-grid label:nth-child(-n+3){grid-column:span 2}.customer-grid label:nth-child(8),.customer-grid label:nth-child(9){grid-column:span 2}.items-entered{margin-top:1.25rem}.customer-actions{margin-top:1.5rem}.saved-customers{padding:1.25rem clamp(1rem,3vw,2rem)}.delivery-items{padding:clamp(1rem,3vw,2rem)}.item-form{margin-top:1rem}.shipment-totals{margin-top:1.25rem}.items-table{display:block;overflow-x:auto}.items-table th,.items-table td{white-space:nowrap}@media(max-width:900px){.customer-grid label:nth-child(-n+3),.customer-grid label:nth-child(8),.customer-grid label:nth-child(9),.customer-grid .wide,.customer-grid label:nth-child(5),.customer-grid label:nth-child(7){grid-column:span 1}}@media(max-width:600px){.shipment-page{margin-top:.5rem;border-radius:12px}.customer-grid,.item-form,.shipment-totals{grid-template-columns:1fr}.customer-actions{display:grid;grid-template-columns:1fr 1fr}.customer-actions button{width:100%}.items-table{font-size:.86rem}.items-table th,.items-table td{padding:.5rem}}`;
  panel.querySelector('style').textContent += `.customer-form,.customer-grid,.items-entered,.customer-actions{height:auto!important;min-height:0!important;align-content:start!important}.customer-grid{grid-auto-rows:auto!important;row-gap:1rem!important}.customer-grid label,.items-entered,.customer-actions{margin-bottom:0!important}.customer-actions{padding:0!important}.saved-customers{min-height:0!important}.saved-customers p{margin:.5rem 0 0}.delivery-items{margin-top:0!important}@media(min-width:901px){.customer-grid{column-gap:1.5rem!important}.customer-actions{margin-top:1.25rem!important}}`;
  const customerGrid = panel.querySelector('.customer-grid');
  customerGrid.querySelector('[name="customerId"]').closest('label').insertAdjacentHTML('afterend', '<label class="billing-email-field">Billing email<input name="billingEmail" type="email" placeholder="customer@example.com"><small>Invoice PDFs will be sent to this address.</small></label>');
  const pickupAddressLabel = customerGrid.querySelector('[name="germanAddress"]').closest('label');
  const deliveryAddressLabel = customerGrid.querySelector('[name="sriLankanAddress"]').closest('label');
  pickupAddressLabel.insertAdjacentHTML('beforebegin', '<label>Pickup contact name<input name="pickupContactName" placeholder="e.g. Madushan Perera"></label>');
  deliveryAddressLabel.insertAdjacentHTML('beforebegin', '<label>Delivery contact name<input name="deliveryContactName" placeholder="e.g. Nimal Perera"></label>');
  pickupAddressLabel.classList.remove('wide');
  deliveryAddressLabel.classList.remove('wide');
  pickupAddressLabel.querySelector('input').placeholder = 'Street and house number, postcode, city';
  deliveryAddressLabel.querySelector('input').placeholder = 'Street and house number, postcode, city';
  customerGrid.querySelector('[name="phoneDE"]').closest('label').firstChild.textContent = 'Pickup contact number';
  customerGrid.querySelector('[name="phoneLK"]').closest('label').firstChild.textContent = 'Delivery contact number';
  const fieldLabel = name => customerGrid.querySelector(`[name="${name}"]`).closest('label');
  const customerDetails = document.createElement('section');
  customerDetails.className = 'customer-form-section customer-details-section';
  customerDetails.innerHTML = '<div class="form-section-heading"><span class="form-section-icon" aria-hidden="true">👤</span><div><h3>Customer details</h3><p>Customer identity and invoice contact</p></div></div><div class="customer-identity-fields"></div>';
  const identityFields = customerDetails.querySelector('.customer-identity-fields');
  ['customerRef', 'customerName', 'customerId', 'billingEmail'].forEach(name => identityFields.append(fieldLabel(name)));

  const routeDetails = document.createElement('div');
  routeDetails.className = 'route-details-grid';
  const pickupSection = document.createElement('section');
  pickupSection.className = 'customer-form-section route-card pickup-card';
  pickupSection.innerHTML = '<div class="form-section-heading"><span class="form-section-icon" aria-hidden="true">↗</span><div><h3>Pickup details</h3><p>Germany</p></div></div><div class="route-fields"></div>';
  ['pickupContactName', 'germanAddress', 'phoneDE'].forEach(name => pickupSection.querySelector('.route-fields').append(fieldLabel(name)));
  const deliverySection = document.createElement('section');
  deliverySection.className = 'customer-form-section route-card route-delivery-card';
  deliverySection.innerHTML = '<div class="form-section-heading"><span class="form-section-icon" aria-hidden="true">⌂</span><div><h3>Delivery details</h3><p>Sri Lanka</p></div></div><div class="route-fields"></div>';
  ['deliveryContactName', 'sriLankanAddress', 'phoneLK'].forEach(name => deliverySection.querySelector('.route-fields').append(fieldLabel(name)));
  routeDetails.append(pickupSection, deliverySection);

  const pricingSection = document.createElement('section');
  pricingSection.className = 'customer-form-section pricing-section';
  pricingSection.innerHTML = '<div class="form-section-heading"><span class="form-section-icon" aria-hidden="true">€</span><div><h3>Pricing</h3><p>Shipment-specific charges</p></div></div><div class="pricing-fields"></div>';
  ['ratePerCubic', 'deliveryCharge'].forEach(name => pricingSection.querySelector('.pricing-fields').append(fieldLabel(name)));
  customerGrid.append(customerDetails, routeDetails, pricingSection);
  panel.querySelector('style').textContent += `.route-delivery-card{border-top:3px solid #64748b}`;
  panel.querySelector('style').textContent += `.shipment-page .customer-grid{display:flex!important;flex-direction:column!important;align-items:stretch!important;width:100%!important;gap:1rem!important;padding:0!important;border:0!important;background:transparent!important}.shipment-page .customer-grid>.customer-form-section,.shipment-page .customer-grid>.route-details-grid{width:100%!important;min-width:0!important;grid-column:1/-1!important}.customer-form-section{min-width:0;padding:1.25rem;border:1px solid #dfe3e8;border-radius:14px;background:#fff}.customer-form-section label,.customer-grid .customer-form-section label:nth-child(n){grid-column:auto!important;min-width:0;width:100%}.customer-form-section input{width:100%;min-width:0}.form-section-heading{display:flex;align-items:center;gap:.75rem;margin-bottom:1rem}.form-section-heading h3{margin:0;color:#202838;font-size:1rem}.form-section-heading p{margin:.15rem 0 0;color:#687086;font-size:.78rem}.form-section-icon{display:grid;place-items:center;flex:0 0 2.25rem;height:2.25rem;border-radius:10px;background:#fff4a8;color:#443d00;font-size:1rem;font-weight:850}.customer-identity-fields{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:1rem 1.25rem}.customer-grid .customer-form-section .billing-email-field{grid-column:1/-1!important}.billing-email-field small{color:#687086;font-size:.75rem;font-weight:500}.route-details-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:1rem}.route-card{background:#fbfcfe}.pickup-card{border-top:3px solid #d5bd00}.delivery-card{border-top:3px solid #64748b}.route-fields{display:grid;grid-template-columns:minmax(0,1fr);gap:1rem}.pricing-fields{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:1rem 1.25rem}@media(max-width:1050px){.customer-identity-fields{grid-template-columns:repeat(2,minmax(0,1fr))}.customer-grid .customer-form-section .billing-email-field{grid-column:1/-1!important}}@media(max-width:760px){.customer-form-section{padding:1rem}.customer-identity-fields,.route-details-grid,.pricing-fields{grid-template-columns:minmax(0,1fr)}.customer-grid .customer-form-section .billing-email-field{grid-column:auto!important}.form-section-heading{margin-bottom:.85rem}}`;
  panel.querySelector('style').textContent += `.item-form{display:grid!important;grid-template-columns:repeat(4,minmax(7rem,1fr)) minmax(14rem,2fr) max-content!important;column-gap:1.5rem!important;row-gap:1rem!important}.item-form label{min-width:0}.item-form button{align-self:end;white-space:nowrap}@media(max-width:1100px){.item-form{grid-template-columns:repeat(3,minmax(8rem,1fr))!important}.item-form .description-field{grid-column:span 2!important}}@media(max-width:700px){.item-form{grid-template-columns:repeat(2,minmax(0,1fr))!important;column-gap:1rem!important}.item-form .description-field{grid-column:span 2!important}.item-form button{grid-column:span 2;width:100%}}@media(max-width:420px){.item-form,.item-form .description-field,.item-form button{grid-template-columns:1fr!important;grid-column:span 1!important}}`;
  panel.querySelector('style').textContent += `.item-form input{width:100%!important;min-width:0!important}.item-form label{width:100%;overflow:hidden}@media(min-width:701px){.items-table{display:table!important;width:100%!important;overflow:visible!important;table-layout:auto}.items-table th,.items-table td{white-space:normal}}@media(max-width:700px){.items-table{display:block;width:100%;overflow-x:auto;white-space:nowrap}}`;
  panel.querySelector('style').textContent += `.customer-list{border:1px solid #d9dde5;border-radius:10px;overflow:visible}.customer-row{display:flex;align-items:center;border-bottom:1px solid #e7e9ef;background:#fff}.customer-row:last-child{border-bottom:0}.customer-load{flex:1;display:flex;align-items:center;justify-content:space-between;text-align:left;background:transparent;color:#1d2433;border-radius:0;margin:0!important;padding:.8rem 1rem}.customer-load:hover,.customer-load:focus-visible{background:#fff8c7}.customer-load small{display:block;margin-top:.15rem;color:#687086;font-weight:500}.load-arrow{font-size:1.75rem;color:#687086}.customer-menu{position:relative;margin-right:.5rem}.customer-menu summary{list-style:none;cursor:pointer;border-radius:7px;padding:.35rem .65rem;font-size:1.4rem;line-height:1;color:#4e5668}.customer-menu summary::-webkit-details-marker{display:none}.customer-menu[open] summary{background:#e8ebf0}.customer-menu button{position:absolute;z-index:2;right:0;top:2.4rem;width:max-content;margin:0!important;background:#fff;color:#a72a22;border:1px solid #f2c5c1;box-shadow:0 6px 18px #25304722}.customer-menu button:hover{background:#fce8e6}@media(max-width:600px){.customer-load{padding:.75rem}.customer-load small{font-size:.78rem}}`;
  panel.querySelector('style').textContent += `.customer-list-panel{border:1px solid #d9dde5;border-radius:10px;background:#fff}.customer-list-panel>summary{display:flex;justify-content:space-between;align-items:center;cursor:pointer;padding:.85rem 1rem;font-weight:700;list-style:none}.customer-list-panel>summary::-webkit-details-marker{display:none}.customer-list-panel[open]>summary{border-bottom:1px solid #d9dde5}.list-chevron{font-size:1.35rem;transition:transform .15s}.customer-list-panel[open] .list-chevron{transform:rotate(180deg)}.customer-count{display:inline-grid;place-items:center;min-width:1.5rem;height:1.5rem;margin-left:.35rem;border-radius:999px;background:#e8ebf0;font-size:.78rem}.customer-list-content{padding:1rem}.customer-search{display:grid;gap:.35rem;margin:0 0 .75rem;font-size:.85rem}.customer-search input{width:100%}`;
  showDraftItemStarter(panel);
  const customerActions = panel.querySelector('.customer-actions');
  customerActions.prepend(customerActions.querySelector('#new-customer'));
  customerActions.querySelector('button:not([type="button"])').setAttribute('form', 'consignment-form');
  const pageActionBar = document.createElement('footer');
  pageActionBar.className = 'page-action-bar';
  pageActionBar.append(customerActions);
  panel.append(pageActionBar);
  renderDocumentActions();
  enableCustomerAutofill(panel.querySelector('#consignment-form'));
  enableExistingCustomerSearch(panel.querySelector('#consignment-form'));
  enableCustomerEnterNavigation(panel.querySelector('#consignment-form'));
  panel.querySelector('#consignment-form').addEventListener('submit', async event => { event.preventDefault(); const values = Object.fromEntries(new FormData(event.currentTarget)); values.allItemsEntered = Boolean(event.currentTarget.elements.allItemsEntered?.checked); const wasNewCustomer = !activeConsignment; try { activeConsignment = await api(`/api/shipments/${shipment.id}/consignments`, { method: 'POST', body: JSON.stringify(values) }); while (draftItems.length) { activeConsignment = await api(`/api/consignments/${activeConsignment.id}/items`, { method: 'POST', body: JSON.stringify(draftItems[0]) }); draftItems.shift(); } editingDraftItemIndex = null; renderItems(); await refreshSavedCustomers(panel, shipment); showToast(`${activeConsignment.customer_ref} — ${activeConsignment.customer_name} ${wasNewCustomer ? 'saved' : 'updated'} successfully.`); } catch (error) { message(event.currentTarget, error.message); } });
  panel.querySelector('#customer-search')?.addEventListener('input', event => { const query = event.currentTarget.value.trim().toLowerCase(); panel.querySelectorAll('.customer-row').forEach(row => row.classList.toggle('hidden', !row.dataset.customerSearch.includes(query))); });
  panel.querySelectorAll('[data-consignment]').forEach(button => button.onclick = async () => { draftItems = []; editingDraftItemIndex = null; activeConsignment = await api(`/api/consignments/${button.dataset.consignment}`); fillForm(activeConsignment); renderItems(); panel.querySelector('#customer-list-panel')?.removeAttribute('open'); });
  panel.querySelectorAll('[data-remove-consignment]').forEach(button => button.onclick = () => showRemoveCustomerDialog(button.dataset.removeConsignment, button.dataset.customerRef));
  panel.querySelector('#new-customer').onclick = () => { activeConsignment = null; draftItems = []; editingDraftItemIndex = null; panel.querySelector('#consignment-form').reset(); panel.querySelector('#consignment-form').elements.ratePerCubic.value = '530'; panel.querySelector('#item-editor').innerHTML = '<p class="item-empty-state">Add delivery items before saving the customer.</p>'; showDraftItemStarter(panel); renderDocumentActions(); };
}

function showDraftItemStarter(panel) {
  const emptyState = panel.querySelector('#item-editor .item-empty-state');
  if (!emptyState || emptyState.querySelector('#start-draft-items')) return;
  emptyState.insertAdjacentHTML('beforeend', '<button type="button" id="start-draft-items" class="draft-items-start">Add items</button>');
  emptyState.querySelector('#start-draft-items').onclick = renderDraftItems;
}

async function refreshSavedCustomers(panel, shipment) {
  const consignments = await api(`/api/shipments/${shipment.id}/consignments`);
  const section = panel.querySelector('.saved-customers');
  section.innerHTML = `<h3>Customers in this shipment</h3><div id="consignments">${consignments.length ? `<details id="customer-list-panel" class="customer-list-panel" open><summary><span>Customer list <span class="customer-count">${consignments.length}</span></span><span class="list-chevron" aria-hidden="true">⌄</span></summary><div class="customer-list-content"><label class="customer-search">Search customers<input id="customer-search" type="search" placeholder="Reference or name"></label><div class="customer-list">${consignments.map(c => `<div class="customer-row" data-customer-search="${escapeHtml(`${c.customer_ref} ${c.customer_name}`.toLowerCase())}"><button type="button" class="customer-load" data-consignment="${c.id}"><span><strong>${escapeHtml(c.customer_ref)} — ${escapeHtml(c.customer_name)}</strong><small>Load customer delivery</small></span><span class="load-arrow" aria-hidden="true">›</span></button><details class="customer-menu"><summary aria-label="Actions for ${escapeHtml(c.customer_ref)}">⋮</summary><button type="button" data-remove-consignment="${c.id}" data-customer-ref="${escapeHtml(c.customer_ref)}">Remove from shipment</button></details></div>`).join('')}</div></div></details>` : '<p>No customers added yet.</p>'}</div>`;
  section.querySelector('#customer-list-panel')?.removeAttribute('open');
  section.querySelector('#customer-search')?.addEventListener('input', event => {
    const query = event.currentTarget.value.trim().toLowerCase();
    section.querySelectorAll('.customer-row').forEach(row => row.classList.toggle('hidden', !row.dataset.customerSearch.includes(query)));
  });
  section.querySelectorAll('[data-consignment]').forEach(button => button.onclick = async () => {
    draftItems = [];
    editingDraftItemIndex = null;
    activeConsignment = await api(`/api/consignments/${button.dataset.consignment}`);
    fillForm(activeConsignment);
    renderItems();
    section.querySelector('#customer-list-panel')?.removeAttribute('open');
  });
  section.querySelectorAll('[data-remove-consignment]').forEach(button => button.onclick = () => showRemoveCustomerDialog(button.dataset.removeConsignment, button.dataset.customerRef));
}

function decorateAdminDeliveryStatuses(panel, consignments, shipment) {
  const deliveredCount = consignments.filter(consignment => consignment.delivery_status === 'DELIVERED').length;
  const percentage = consignments.length ? Math.round(deliveredCount / consignments.length * 100) : 0;
  const heading = panel.querySelector('.saved-customers > h3');
  heading.insertAdjacentHTML('afterend', `<div class="admin-delivery-summary"><div><strong>${deliveredCount} of ${consignments.length}</strong><span>customers delivered</span></div><div class="admin-progress-track"><span style="width:${percentage}%"></span></div><div class="admin-delivery-filters" role="group" aria-label="Filter delivery status"><button class="active" data-admin-delivery-filter="ALL">All ${consignments.length}</button><button data-admin-delivery-filter="PENDING">Remaining ${consignments.length - deliveredCount}</button><button data-admin-delivery-filter="DELIVERED">Delivered ${deliveredCount}</button></div></div>`);

  panel.querySelectorAll('.customer-row').forEach(row => {
    const loadButton = row.querySelector('[data-consignment]');
    const consignment = consignments.find(item => item.id === loadButton.dataset.consignment);
    if (!consignment) return;
    const delivered = consignment.delivery_status === 'DELIVERED';
    row.dataset.deliveryStatus = consignment.delivery_status;
    row.classList.toggle('delivered', delivered);
    loadButton.querySelector('strong').insertAdjacentHTML('afterend', `<span class="delivery-badge ${delivered ? 'delivered' : 'pending'}">${delivered ? 'Delivered' : 'Remaining'}</span>`);
    loadButton.querySelector('small').textContent = delivered ? deliveredAudit(consignment) : 'Waiting for delivery';
    const menu = row.querySelector('.customer-menu');
    const statusButton = document.createElement('button');
    statusButton.type = 'button';
    statusButton.className = 'delivery-status-menu-action';
    statusButton.textContent = delivered ? 'Reopen delivery' : 'Mark as delivered';
    statusButton.onclick = event => {
      event.stopPropagation();
      if (delivered) reopenDelivery(consignment, () => openShipment(shipment, false));
      else confirmDelivery(consignment, () => openShipment(shipment, false));
    };
    menu.append(statusButton);
  });

  panel.querySelectorAll('[data-admin-delivery-filter]').forEach(button => button.onclick = () => {
    panel.querySelectorAll('[data-admin-delivery-filter]').forEach(filter => filter.classList.toggle('active', filter === button));
    panel.querySelectorAll('.customer-row').forEach(row => row.classList.toggle('hidden', button.dataset.adminDeliveryFilter !== 'ALL' && row.dataset.deliveryStatus !== button.dataset.adminDeliveryFilter));
  });
}

async function reopenDelivery(consignment, onSuccess) {
  if (!confirm(`Reopen delivery for ${consignment.customer_ref} — ${consignment.customer_name}?`)) return;
  try {
    await api(`/api/consignments/${consignment.id}/delivery-status`, { method: 'PATCH', body: JSON.stringify({ status: 'PENDING' }) });
    await onSuccess();
  } catch (error) { alert(error.message); }
}

function enableCustomerAutofill(form) {
  let lookupId = 0;
  const reference = form.elements.customerRef;
  reference.addEventListener('change', async () => {
    const value = reference.value.trim();
    if (!value) return;
    const requestId = ++lookupId;
    try {
      const customer = await api(`/api/customers/by-reference/${encodeURIComponent(value)}`);
      if (requestId !== lookupId || reference.value.trim() !== value) return;
      const values = { customerName:customer.customer_name, customerId:customer.customer_id, billingEmail:customer.billing_email, pickupContactName:customer.pickup_contact_name, germanAddress:customer.german_address, deliveryContactName:customer.delivery_contact_name, sriLankanAddress:customer.sri_lankan_address, phoneDE:customer.phone_de, phoneLK:customer.phone_lk };
      Object.entries(values).forEach(([key, fieldValue]) => form.elements[key].value = fieldValue || '');
    } catch (error) {
      if (error.message !== 'Customer not found.') message(form, error.message);
    }
  });
}

function customerFormValues(customer) {
  return { customerRef:customer.customer_ref, customerName:customer.customer_name, customerId:customer.customer_id, billingEmail:customer.billing_email, pickupContactName:customer.pickup_contact_name, germanAddress:customer.german_address, deliveryContactName:customer.delivery_contact_name, sriLankanAddress:customer.sri_lankan_address, phoneDE:customer.phone_de, phoneLK:customer.phone_lk };
}

function applyCustomerToForm(form, customer) {
  Object.entries(customerFormValues(customer)).forEach(([name, value]) => { if (form.elements[name]) form.elements[name].value = value || ''; });
}

function enableExistingCustomerSearch(form) {
  const search = document.createElement('section');
  search.className = 'existing-customer-search';
  search.innerHTML = '<label>Find existing customer<input type="search" placeholder="Search by name, reference, phone or customer ID" autocomplete="off"></label><div class="existing-customer-results hidden"></div>';
  form.querySelector('.customer-grid').before(search);
  form.closest('.shipment-page').querySelector('style').textContent += `.existing-customer-search{position:relative;margin:0 0 1.5rem;padding:1rem;border:1px solid #d9dde5;border-radius:10px;background:#f8f9fb}.existing-customer-search label{max-width:100%}.existing-customer-results{position:absolute;z-index:5;top:calc(100% - .6rem);left:1rem;right:1rem;overflow:auto;max-height:300px;border:1px solid #cbd1dc;border-radius:9px;background:#fff;box-shadow:0 10px 28px #25304722}.existing-customer-result{display:flex;width:100%;align-items:center;justify-content:space-between;border-radius:0;border-bottom:1px solid #e8ebf0;background:#fff;color:#1d2433;text-align:left}.existing-customer-result:last-child{border-bottom:0}.existing-customer-result:hover,.existing-customer-result:focus-visible{background:#fff8c7}.existing-customer-result span,.existing-customer-result small{display:block}.existing-customer-result small{margin-top:.2rem;color:#687086;font-weight:500}.existing-customer-empty{margin:0;padding:1rem;color:#687086}`;
  const input = search.querySelector('input');
  const results = search.querySelector('.existing-customer-results');
  let timer;
  let requestId = 0;
  input.addEventListener('input', () => {
    clearTimeout(timer);
    const query = input.value.trim();
    if (!query) { requestId += 1; results.classList.add('hidden'); results.innerHTML = ''; return; }
    timer = setTimeout(async () => {
      try {
        const id = ++requestId;
        const customers = await api(`/api/customers?search=${encodeURIComponent(query)}`);
        if (id !== requestId || input.value.trim() !== query) return;
        results.innerHTML = customers.length ? customers.map((customer, index) => `<button type="button" class="existing-customer-result" data-customer-index="${index}"><span><strong>${escapeHtml(customer.customer_ref)} — ${escapeHtml(customer.customer_name)}</strong><small>${escapeHtml(customer.phone_de || customer.phone_lk || 'No phone number')}</small></span><span aria-hidden="true">Select ›</span></button>`).join('') : '<p class="existing-customer-empty">No matching customer found. Continue below to add a new customer.</p>';
        results.classList.remove('hidden');
        results.querySelectorAll('[data-customer-index]').forEach(button => button.onclick = () => {
          applyCustomerToForm(form, customers[Number(button.dataset.customerIndex)]);
          input.value = `${customers[Number(button.dataset.customerIndex)].customer_ref} — ${customers[Number(button.dataset.customerIndex)].customer_name}`;
          results.classList.add('hidden');
          form.elements.ratePerCubic.focus();
        });
      } catch (error) { message(form, error.message); }
    }, 200);
  });
}

function showRemoveCustomerDialog(consignmentId, customerRef) {
  const dialog = document.createElement('dialog');
  dialog.style.cssText = 'border:0;border-radius:12px;padding:1.5rem;max-width:380px;width:calc(100% - 2rem);box-shadow:0 16px 48px #1d243366';
  dialog.innerHTML = `<form id="remove-customer-form"><h2>Remove customer?</h2><p>Remove <strong>${escapeHtml(customerRef)}</strong> from this shipment only. Their saved customer details will remain available for future shipments.</p><label>Enter your password to confirm<input name="password" type="password" autocomplete="current-password" required autofocus></label><div style="display:flex;justify-content:flex-end;gap:.75rem;margin-top:1.25rem"><button type="button" class="secondary" id="cancel-remove-customer">Cancel</button><button style="background:#b42318;color:#fff">Remove customer</button></div></form>`;
  document.body.append(dialog);
  const form = dialog.querySelector('#remove-customer-form');
  dialog.querySelector('#cancel-remove-customer').onclick = () => dialog.close();
  dialog.addEventListener('close', () => dialog.remove());
  form.addEventListener('submit', async event => {
    event.preventDefault();
    try {
      await api(`/api/consignments/${consignmentId}`, { method: 'DELETE', body: JSON.stringify(Object.fromEntries(new FormData(form))) });
      dialog.close();
      if (activeConsignment?.id === consignmentId) activeConsignment = null;
      await openShipment(activeShipment, false);
    } catch (error) { message(form, error.message); }
  });
  dialog.showModal();
}

function enableCustomerEnterNavigation(form) {
  const fields = ['customerRef', 'customerName', 'customerId', 'billingEmail', 'pickupContactName', 'germanAddress', 'phoneDE', 'deliveryContactName', 'sriLankanAddress', 'phoneLK', 'ratePerCubic', 'deliveryCharge'].map(name => form.elements[name]);
  const submitButton = form.querySelector('button:not([type="button"])');
  form.addEventListener('keydown', event => {
    if (!fields.includes(event.target)) return;
    const currentIndex = fields.indexOf(event.target);
    if (event.key === 'Enter') {
      event.preventDefault();
      const next = fields[currentIndex + 1] || submitButton;
      next?.focus();
    }
    if (event.key === 'Backspace' && event.target.value === '' && currentIndex > 0) {
      event.preventDefault();
      const previous = fields[currentIndex - 1];
      previous.focus();
      if (previous.type !== 'number') previous.setSelectionRange?.(previous.value.length, previous.value.length);
    }
  });
}

function showShipmentWorkspace() {
  stopDeliveryStatusRefresh();
  document.querySelector('#settings-panel').classList.add('hidden');
  document.querySelector('#employees-panel').classList.add('hidden');
  document.querySelector('#tracking-panel').classList.add('hidden');
  document.querySelector('#delivery-status-panel')?.classList.add('hidden');
  document.querySelector('#customers-panel')?.classList.add('hidden');
  document.querySelector('#administrators-panel')?.classList.add('hidden');
  document.querySelector('#shipment-workspace').classList.remove('hidden');
}

function showCurrentShipments() {
  showShipmentWorkspace();
  document.querySelector('#shipment-form').classList.add('hidden');
  document.querySelector('#consignment-panel').classList.add('hidden');
  document.querySelector('#shipment-list').classList.remove('hidden');
}

function showNewShipmentForm() {
  showShipmentWorkspace();
  document.querySelector('#shipment-list').classList.add('hidden');
  document.querySelector('#consignment-panel').classList.add('hidden');
  document.querySelector('#shipment-form').classList.remove('hidden');
}

function showProfileSettings(user) {
  stopDeliveryStatusRefresh();
  document.querySelector('#shipment-workspace').classList.add('hidden');
  document.querySelector('#employees-panel').classList.add('hidden');
  document.querySelector('#tracking-panel').classList.add('hidden');
  document.querySelector('#delivery-status-panel')?.classList.add('hidden');
  document.querySelector('#customers-panel')?.classList.add('hidden');
  document.querySelector('#administrators-panel')?.classList.add('hidden');
  document.querySelector('#settings-panel').classList.remove('hidden');
  fillProfileSettings(user);
}

function initializeBusinessSettingsPanel() {
  const panel = document.querySelector('#settings-panel');
  panel.className = 'hidden';
  panel.innerHTML = `<form id="profile-settings-form" class="business-settings-form">
    <header class="settings-heading"><div><h2>Business Settings</h2><p>Manage the business identity used across the application and on invoices.</p></div></header>
    <input name="username" type="hidden"><input name="fullName" type="hidden"><input name="businessLogo" type="hidden">
    <div class="settings-grid">
      <section class="card settings-card logo-settings-card"><h3><span>1</span> Business Logo</h3><div class="logo-settings-content"><div id="business-logo-preview" class="business-logo-preview" aria-label="Business logo preview"><span>MCS</span></div><div class="logo-settings-actions"><input id="business-logo-file" type="file" accept="image/png,image/jpeg" hidden><button id="upload-business-logo" type="button">Upload Logo</button><button id="remove-business-logo" type="button" class="secondary">Remove</button><small>PNG or JPG · Transparent background recommended · Maximum 2 MB</small></div></div><p class="settings-note">ⓘ Your logo will be available for invoices, receipts, reports, login and navigation.</p></section>
      <section class="card settings-card"><h3><span>2</span> Business Identity</h3><div class="settings-fields"><label>Business Name<input name="businessName" required></label><label>Tagline<input name="businessTagline"></label><label>Registration Number<input name="registrationNumber"></label><label>Tax / VAT Number<input name="vatNumber"></label></div></section>
      <section class="card settings-card"><h3><span>3</span> Contact Details</h3><div class="settings-fields"><label>German Phone<input name="phone" type="tel"></label><label>Sri Lankan Phone<input name="phoneSriLanka" type="tel"></label><label>Email<input name="email" type="email"></label><label>Website<input name="website" type="url" placeholder="https://"></label><label>German Address<input name="businessAddress"></label><label>Sri Lankan Address<input name="sriLankanAddress"></label></div></section>
      <section class="card settings-card"><h3><span>4</span> Invoice &amp; Payment Defaults</h3><div class="settings-fields settings-payment-fields"><label>Default Currency<select name="defaultCurrency"><option value="EUR">EUR — Euro</option></select></label><label>Invoice Prefix<input name="invoicePrefix" maxlength="10"></label><label>Default Payment Terms<select name="paymentTermsDays"><option value="0">Due on receipt</option><option value="7">7 days</option><option value="14">14 days</option><option value="30">30 days</option><option value="60">60 days</option></select></label><label>Invoice Accent Colour<span class="color-field"><input name="invoiceAccentColor" type="color" value="#0d2b45"><output id="invoice-accent-value">#0D2B45</output></span></label><label>Bank Name<input name="bankName"></label><label>Account Holder<input name="accountHolder"></label><label>IBAN<input name="iban"></label><label>BIC / SWIFT<input name="bic"></label></div></section>
    </div><footer class="settings-footer"><button type="button" id="cancel-business-settings" class="secondary">Cancel</button><button type="submit">Save Business Settings</button></footer>
  </form><form id="change-password-form" class="card settings-card password-settings-card"><h3><span>5</span> Administrator Password</h3><p class="password-settings-intro">Changing the password signs out every active administrator session.</p><div class="settings-fields password-settings-fields"><label>Current Password<input name="currentPassword" type="password" autocomplete="current-password" required></label><label>New Password<input name="newPassword" type="password" autocomplete="new-password" minlength="8" required></label><label>Confirm New Password<input name="confirmPassword" type="password" autocomplete="new-password" minlength="8" required></label></div><footer class="settings-footer"><button type="submit">Change Password</button></footer></form>`;
}

function configureBusinessLogoUpload() {
  const form = document.querySelector('#profile-settings-form');
  const fileInput = document.querySelector('#business-logo-file');
  document.querySelector('#upload-business-logo').onclick = () => fileInput.click();
  document.querySelector('#remove-business-logo').onclick = () => {
    form.elements.businessLogo.value = '';
    renderBusinessLogo('');
    fileInput.value = '';
  };
  fileInput.onchange = () => {
    const file = fileInput.files[0];
    if (!file) return;
    if (!['image/png', 'image/jpeg'].includes(file.type)) return showToast('Choose a PNG or JPG logo.', 'error');
    if (file.size > 2 * 1024 * 1024) return showToast('Logo must be no larger than 2 MB.', 'error');
    const reader = new FileReader();
    reader.onload = () => {
      form.elements.businessLogo.value = reader.result;
      renderBusinessLogo(reader.result);
    };
    reader.readAsDataURL(file);
  };
  form.elements.invoiceAccentColor.addEventListener('input', event => {
    document.querySelector('#invoice-accent-value').textContent = event.target.value.toUpperCase();
  });
}

function renderBusinessLogo(source) {
  const preview = document.querySelector('#business-logo-preview');
  preview.innerHTML = source ? `<img src="${source}" alt="Business logo">` : '<span>MCS</span>';
}

async function showCustomerDirectory() {
  stopDeliveryStatusRefresh();
  document.querySelector('#shipment-workspace').classList.add('hidden');
  document.querySelector('#settings-panel').classList.add('hidden');
  document.querySelector('#employees-panel').classList.add('hidden');
  document.querySelector('#tracking-panel').classList.add('hidden');
  document.querySelector('#delivery-status-panel')?.classList.add('hidden');
  document.querySelector('#administrators-panel')?.classList.add('hidden');
  const panel = document.querySelector('#customers-panel');
  panel.classList.remove('hidden');
  if (!document.querySelector('#customer-directory-styles')) document.head.insertAdjacentHTML('beforeend', '<style id="customer-directory-styles">.customer-directory-heading{display:flex;align-items:end;justify-content:space-between;gap:1rem;margin-bottom:1rem}.customer-directory-heading h2{margin:0}.customer-directory-heading p{margin:.35rem 0 0;color:#687086}.customer-directory-count{white-space:nowrap;color:#687086}.customer-directory-search{margin-bottom:1rem}.customer-directory-search input{width:100%}.customer-directory-table-wrap{overflow-x:auto}.customer-directory-table{margin:0}.customer-directory-table th:first-child,.customer-directory-table td:first-child{font-weight:800;white-space:nowrap}.customer-directory-empty{padding:2rem!important;color:#687086;text-align:center!important}@media(max-width:650px){.customer-directory-heading{align-items:start;flex-direction:column}}</style>');
  panel.innerHTML = '<header class="customer-directory-heading"><div><h2>Customers</h2><p>Find permanent customer references and contact details.</p></div><strong class="customer-directory-count">Loading…</strong></header><section class="card"><label class="customer-directory-search">Search customers<input type="search" placeholder="Name, reference, phone or customer ID" autocomplete="off" autofocus></label><div class="customer-directory-table-wrap"><table class="table customer-directory-table"><thead><tr><th>Reference</th><th>Customer name</th><th>German phone</th><th>Sri Lankan phone</th></tr></thead><tbody><tr><td colspan="4" class="customer-directory-empty">Loading customers…</td></tr></tbody></table></div></section>';
  const input = panel.querySelector('input');
  const body = panel.querySelector('tbody');
  const count = panel.querySelector('.customer-directory-count');
  let requestId = 0;
  const load = async () => {
    const id = ++requestId;
    try {
      const customers = await api(`/api/customers?search=${encodeURIComponent(input.value.trim())}`);
      if (id !== requestId) return;
      count.textContent = `${customers.length} ${customers.length === 1 ? 'customer' : 'customers'}`;
      body.innerHTML = customers.length ? customers.map(customer => `<tr><td>${escapeHtml(customer.customer_ref)}</td><td>${escapeHtml(customer.customer_name)}</td><td>${escapeHtml(customer.phone_de || '—')}</td><td>${escapeHtml(customer.phone_lk || '—')}</td></tr>`).join('') : '<tr><td colspan="4" class="customer-directory-empty">No matching customers found.</td></tr>';
    } catch (error) { message(panel, error.message); }
  };
  let timer;
  input.addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(load, 200); });
  await load();
}

async function showSystemHealth() {
  stopDeliveryStatusRefresh();
  document.querySelector('#shipment-workspace').classList.add('hidden');
  document.querySelector('#settings-panel').classList.add('hidden');
  document.querySelector('#employees-panel').classList.add('hidden');
  document.querySelector('#tracking-panel').classList.add('hidden');
  document.querySelector('#delivery-status-panel')?.classList.add('hidden');
  document.querySelector('#customers-panel')?.classList.add('hidden');
  document.querySelector('#administrators-panel')?.classList.add('hidden');
  const panel = document.querySelector('#system-health-panel');
  panel.classList.remove('hidden');
  if (!document.querySelector('#system-health-styles')) document.head.insertAdjacentHTML('beforeend', '<style id="system-health-styles">.health-heading{display:flex;align-items:center;justify-content:space-between;gap:1rem;margin-bottom:1.25rem}.health-heading h2{margin:0}.health-heading p{margin:.35rem 0 0;color:#697386}.health-summary,.health-records{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:1rem}.health-metric{padding:1.15rem}.health-metric span,.health-metric strong,.health-metric small{display:block}.health-metric span{color:#697386;font-size:.78rem;font-weight:750;text-transform:uppercase}.health-metric strong{margin:.4rem 0;font-size:1.35rem}.health-metric small{color:#697386}.health-status{color:#087443}.health-section{margin-top:1.25rem}.health-section h3{margin:0 0 .75rem}.health-records{grid-template-columns:repeat(5,minmax(0,1fr))}.health-record{padding:.85rem;text-align:center}.health-record span,.health-record strong{display:block}.health-record span{color:#697386;font-size:.76rem}.health-record strong{margin-top:.25rem;font-size:1.2rem}.health-errors{margin:0;padding:0;list-style:none}.health-errors li{display:flex;justify-content:space-between;gap:1rem;padding:.7rem 0;border-bottom:1px solid #e3e7ed}.health-errors li:last-child{border-bottom:0}.health-empty{color:#697386}@media(max-width:850px){.health-summary{grid-template-columns:1fr 1fr}.health-records{grid-template-columns:repeat(3,1fr)}}@media(max-width:560px){.health-heading{align-items:stretch;flex-direction:column}.health-summary{grid-template-columns:1fr}.health-records{grid-template-columns:1fr 1fr}}</style>');
  panel.innerHTML = '<header class="health-heading"><div><h2>System Health</h2><p>Read-only application and database usage information.</p></div><button type="button" id="refresh-system-health" class="secondary">Refresh</button></header><div id="system-health-content"><section class="card"><p>Checking system health…</p></section></div>';
  const content = panel.querySelector('#system-health-content');
  const formatBytes = value => {
    const bytes = Number(value || 0);
    if (!bytes) return '0 B';
    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    const unit = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
    return `${(bytes / (1024 ** unit)).toFixed(unit ? 2 : 0)} ${units[unit]}`;
  };
  const load = async () => {
    content.innerHTML = '<section class="card"><p>Checking system health…</p></section>';
    try {
      const health = await api('/api/system-health');
      const recordLabels = { users:'All users', administrators:'Administrators', employees:'Employees', shipments:'Shipments', customers:'Customers', consignments:'Consignments', items:'Box items', invoices:'Invoices', payments:'Payments' };
      const errors = health.recent_errors.length ? health.recent_errors.map(error => `<li><span><strong>${escapeHtml(error.type)}</strong> · ${escapeHtml(error.method)} ${escapeHtml(error.path)}</span><time>${new Date(error.occurred_at).toLocaleString()}</time></li>`).join('') : '<li class="health-empty">No recent server errors recorded since the API started.</li>';
      content.innerHTML = `<section class="health-summary"><article class="card health-metric"><span>Application</span><strong class="health-status">${escapeHtml(health.application.status)}</strong><small>Uptime ${Math.floor(health.application.uptime_seconds / 60)} minutes</small></article><article class="card health-metric"><span>Database</span><strong class="health-status">${escapeHtml(health.database.status)}</strong><small>${health.database.collections} collections · ${health.response_time_ms} ms check</small></article><article class="card health-metric"><span>Database usage</span><strong>${formatBytes(health.database.total_used_bytes)}</strong><small>${health.database.storage_limit_bytes ? `${health.database.usage_percent}% of ${formatBytes(health.database.storage_limit_bytes)}` : 'Atlas storage limit unavailable'}</small></article></section><section class="health-section"><h3>Storage details</h3><div class="health-summary"><article class="card health-metric"><span>Data size</span><strong>${formatBytes(health.database.data_size_bytes)}</strong><small>Logical document data</small></article><article class="card health-metric"><span>Allocated storage</span><strong>${formatBytes(health.database.storage_size_bytes)}</strong><small>Database storage files</small></article><article class="card health-metric"><span>Index size</span><strong>${formatBytes(health.database.index_size_bytes)}</strong><small>Database indexes</small></article></div></section><section class="health-section"><h3>Record counts</h3><div class="health-records">${Object.entries(health.records).map(([key, value]) => `<article class="card health-record"><span>${recordLabels[key] || escapeHtml(key)}</span><strong>${Number(value).toLocaleString()}</strong></article>`).join('')}</div></section><section class="card health-section"><h3>Recent server errors</h3><ul class="health-errors">${errors}</ul></section><p class="hint">Last checked ${new Date(health.checked_at).toLocaleString()}. Database credentials and connection details are never displayed.</p>`;
    } catch (error) { content.innerHTML = `<section class="card"><p class="error">${escapeHtml(error.message)}</p></section>`; }
  };
  panel.querySelector('#refresh-system-health').onclick = load;
  await load();
}

async function showAdministratorManagement() {
  stopDeliveryStatusRefresh();
  document.querySelector('#shipment-workspace').classList.add('hidden');
  document.querySelector('#settings-panel').classList.add('hidden');
  document.querySelector('#employees-panel').classList.add('hidden');
  document.querySelector('#tracking-panel').classList.add('hidden');
  document.querySelector('#delivery-status-panel')?.classList.add('hidden');
  document.querySelector('#customers-panel')?.classList.add('hidden');
  const panel = document.querySelector('#administrators-panel');
  panel.classList.remove('hidden');
  if (!document.querySelector('#administrator-management-styles')) document.head.insertAdjacentHTML('beforeend', '<style id="administrator-management-styles">#administrators-panel{padding:clamp(1.25rem,2.5vw,2rem)}.administrator-heading{margin-bottom:1.25rem}.administrator-heading h2{margin:0}.administrator-heading p{margin:.4rem 0 0;color:#697386}.administrator-create-form{display:grid;grid-template-columns:1fr 1fr 1fr auto;align-items:end;margin-bottom:1.25rem}.administrator-list{display:grid;gap:.75rem}.administrator-card{display:flex;align-items:center;justify-content:space-between;gap:1rem}.administrator-card p{margin:.3rem 0 0;color:#697386}.administrator-card-actions{display:flex;gap:.5rem}.administrator-edit-grid{display:grid;grid-template-columns:1fr 1fr;gap:.85rem}@media(max-width:850px){.administrator-create-form{grid-template-columns:1fr 1fr}.administrator-create-form button{width:100%}}@media(max-width:560px){.administrator-create-form,.administrator-edit-grid{grid-template-columns:1fr}.administrator-card{align-items:stretch;flex-direction:column}.administrator-card-actions button{width:100%}}</style>');
  panel.innerHTML = '<header class="administrator-heading"><h2>Administrators</h2><p>Create and manage administrator accounts. Only the System Owner can access this page.</p></header><form class="card administrator-create-form"><label>Full name<input name="fullName" required></label><label>Username<input name="username" required autocomplete="off"></label><label>Temporary password<input name="password" type="password" minlength="12" required autocomplete="new-password"></label><button>Create Administrator</button></form><div class="administrator-list"></div>';
  const list = panel.querySelector('.administrator-list');
  const render = async () => {
    const administrators = await api('/api/administrators');
    list.innerHTML = administrators.length ? administrators.map(administrator => `<article class="card administrator-card"><div><strong>${escapeHtml(administrator.full_name)}</strong><p>${escapeHtml(administrator.username)} · ${administrator.enabled ? 'Account enabled' : 'Account disabled'}</p></div><div class="administrator-card-actions"><button type="button" class="secondary" data-edit-administrator="${administrator.id}">Edit</button></div></article>`).join('') : '<p>No administrator accounts yet.</p>';
    list.querySelectorAll('[data-edit-administrator]').forEach(button => button.onclick = () => showEditAdministratorDialog(administrators.find(administrator => administrator.id === button.dataset.editAdministrator), render));
  };
  panel.querySelector('form').onsubmit = async event => {
    event.preventDefault();
    try {
      await api('/api/administrators', { method: 'POST', body: JSON.stringify(Object.fromEntries(new FormData(event.currentTarget))) });
      event.currentTarget.reset();
      await render();
      showToast('Administrator account created.');
    } catch (error) { message(event.currentTarget, error.message); }
  };
  await render();
}

function showEditAdministratorDialog(administrator, onSaved) {
  const dialog = document.createElement('dialog');
  dialog.className = 'confirm-dialog employee-edit-dialog';
  dialog.innerHTML = `<form><h2>Edit administrator</h2><p>Update ${escapeHtml(administrator.full_name)} or assign a new temporary password.</p><div class="administrator-edit-grid"><label>Full name<input name="fullName" value="${escapeHtml(administrator.full_name)}" required></label><label>Username<input name="username" value="${escapeHtml(administrator.username)}" required></label><label>Account status<select name="enabled"><option value="true" ${administrator.enabled ? 'selected' : ''}>Enabled</option><option value="false" ${administrator.enabled ? '' : 'selected'}>Disabled</option></select></label><label>New password<input name="password" type="password" minlength="12" autocomplete="new-password" placeholder="Leave blank to keep current"></label></div><div class="confirm-dialog-actions"><button type="button" class="secondary" data-cancel>Cancel</button><button>Save changes</button></div></form>`;
  document.body.append(dialog);
  dialog.querySelector('[data-cancel]').onclick = () => dialog.close();
  dialog.addEventListener('close', () => dialog.remove());
  dialog.querySelector('form').onsubmit = async event => {
    event.preventDefault();
    try {
      await api(`/api/administrators/${administrator.id}`, { method: 'PUT', body: JSON.stringify(Object.fromEntries(new FormData(event.currentTarget))) });
      dialog.close();
      await onSaved();
      showToast('Administrator account updated.');
    } catch (error) { message(event.currentTarget, error.message); }
  };
  dialog.showModal();
}

async function showEmployeeManagement() {
  stopDeliveryStatusRefresh();
  document.querySelector('#customers-panel')?.classList.add('hidden');
  document.querySelector('#administrators-panel')?.classList.add('hidden');
  document.querySelector('#shipment-workspace').classList.add('hidden'); document.querySelector('#settings-panel').classList.add('hidden'); document.querySelector('#tracking-panel').classList.add('hidden'); document.querySelector('#delivery-status-panel')?.classList.add('hidden');
  const panel = document.querySelector('#employees-panel'); panel.classList.remove('hidden');
  if (!document.querySelector('#employee-management-styles')) document.head.insertAdjacentHTML('beforeend', '<style id="employee-management-styles">.employee-card{display:flex;align-items:center;justify-content:space-between;gap:1rem}.employee-card p{margin:.35rem 0 0}.employee-actions{display:flex;gap:.5rem}.status-dot{display:inline-block;width:.65rem;height:.65rem;border-radius:50%;margin-right:.45rem;background:#aab1bd}.status-dot.enabled{background:#18a957;box-shadow:0 0 0 3px #18a95722}.employee-edit-dialog{width:min(540px,calc(100% - 2rem))}.employee-edit-grid{display:grid;grid-template-columns:1fr 1fr;gap:.85rem}.employee-edit-grid .wide{grid-column:1/-1}@media(max-width:600px){.employee-card{align-items:stretch;flex-direction:column}.employee-actions{display:grid;grid-template-columns:1fr 1fr}.employee-edit-grid{grid-template-columns:1fr}.employee-edit-grid .wide{grid-column:auto}}</style>');
  const list = panel.querySelector('#employee-list');
  const render = async () => {
    const employees = await api('/api/employees');
    list.innerHTML = employees.length ? employees.map(employee => `<article class="card employee-card"><div><strong><span class="status-dot ${employee.enabled ? 'enabled' : ''}" title="${employee.enabled ? 'Account enabled' : 'Account disabled'}"></span>${escapeHtml(employee.full_name)}</strong><p>${escapeHtml(employee.username)} · ${employee.enabled ? 'Account enabled' : 'Account disabled'}</p></div><div class="employee-actions"><button class="secondary" data-edit-employee="${employee.id}">Edit</button><button class="secondary" data-remove-employee="${employee.id}">Remove</button></div></article>`).join('') : '<p>No employee accounts yet.</p>';
    list.querySelectorAll('[data-edit-employee]').forEach(button => button.onclick = () => showEditEmployeeDialog(employees.find(employee => employee.id === button.dataset.editEmployee), render));
    list.querySelectorAll('[data-remove-employee]').forEach(button => button.onclick = async () => { if (!confirm('Remove this employee account?')) return; try { await api(`/api/employees/${button.dataset.removeEmployee}`, { method: 'DELETE' }); await render(); } catch (error) { message(panel, error.message); } });
  };
  panel.querySelector('#employee-form').onsubmit = async event => { event.preventDefault(); try { await api('/api/employees', { method: 'POST', body: JSON.stringify(Object.fromEntries(new FormData(event.currentTarget))) }); event.currentTarget.reset(); await render(); } catch (error) { message(event.currentTarget, error.message); } };
  await render();
}

function showEditEmployeeDialog(employee, onSaved) {
  const dialog = document.createElement('dialog');
  dialog.className = 'confirm-dialog employee-edit-dialog';
  dialog.innerHTML = `<form><h2>Edit employee</h2><p>Update account details or set a new password for ${escapeHtml(employee.full_name)}.</p><div class="employee-edit-grid"><label>Employee name<input name="fullName" value="${escapeHtml(employee.full_name)}" required></label><label>Username<input name="username" value="${escapeHtml(employee.username)}" required></label><label>Account status<select name="enabled"><option value="true" ${employee.enabled ? 'selected' : ''}>Enabled</option><option value="false" ${employee.enabled ? '' : 'selected'}>Disabled</option></select></label><label>New password<input name="password" type="password" minlength="8" autocomplete="new-password" placeholder="Leave blank to keep current"></label></div><div class="confirm-dialog-actions"><button type="button" class="secondary" data-cancel>Cancel</button><button>Save changes</button></div></form>`;
  document.body.append(dialog);
  dialog.querySelector('[data-cancel]').onclick = () => dialog.close();
  dialog.addEventListener('close', () => dialog.remove());
  dialog.querySelector('form').onsubmit = async event => {
    event.preventDefault();
    try {
      await api(`/api/employees/${employee.id}`, { method: 'PUT', body: JSON.stringify(Object.fromEntries(new FormData(event.currentTarget))) });
      dialog.close(); await onSaved(); showToast('Employee account updated.');
    } catch (error) { message(event.currentTarget, error.message); }
  };
  dialog.showModal();
}

async function showShipmentTracking() {
  stopDeliveryStatusRefresh();
  document.querySelector('#customers-panel')?.classList.add('hidden');
  document.querySelector('#administrators-panel')?.classList.add('hidden');
  document.querySelector('#shipment-workspace').classList.add('hidden');
  document.querySelector('#employees-panel').classList.add('hidden');
  document.querySelector('#settings-panel').classList.add('hidden');
  document.querySelector('#delivery-status-panel')?.classList.add('hidden');
  const panel = document.querySelector('#tracking-panel');
  panel.classList.remove('hidden');
  const form = panel.querySelector('#tracking-search-form');
  const carrierSelect = form.elements.carrier;
  const customFields = form.querySelector('.custom-carrier-fields');
  const toggleCustomCarrier = () => {
    const custom = carrierSelect.value === 'OTHER';
    customFields.classList.toggle('hidden', !custom);
    form.elements.customCarrier.required = custom;
    form.elements.trackingUrl.required = custom;
  };
  carrierSelect.onchange = toggleCustomCarrier;
  toggleCustomCarrier();
  form.onsubmit = async event => {
    event.preventDefault();
    const data = Object.fromEntries(new FormData(form));
    const submit = form.querySelector('button');
    submit.disabled = true;
    submit.textContent = 'Saving…';
    try {
      const record = await api('/api/shipment-tracking', { method: 'POST', body: JSON.stringify(data) });
      form.reset();
      toggleCustomCarrier();
      await loadTrackingRecords(record.id);
      await openOfficialTracking(record);
    } catch (error) { message(form, error.message); }
    finally { submit.disabled = false; submit.textContent = 'Track shipment'; }
  };
  await loadTrackingRecords();
}

async function loadTrackingRecords(selectedId) {
  trackingRecords = await api('/api/shipment-tracking');
  renderTrackingSummary(trackingRecords.find(record => record.id === selectedId) || trackingRecords[0]);
  renderTrackingList();
}

function trackingStatusLabel(status) {
  return ({ NOT_UPDATED: 'Not updated', IN_TRANSIT: 'In transit', DELAYED: 'Delayed', ARRIVING_SOON: 'Arriving soon', DELIVERED: 'Delivered' })[status] || status;
}

function renderTrackingSummary(record) {
  const summary = document.querySelector('#tracking-summary');
  const counts = status => trackingRecords.filter(item => item.status === status).length;
  const stats = `<div class="tracking-stats"><article><span class="tracking-stat-icon in-transit">↗</span><div><small>In transit</small><strong>${counts('IN_TRANSIT')}</strong></div></article><article><span class="tracking-stat-icon delayed">!</span><div><small>Delayed</small><strong>${counts('DELAYED')}</strong></div></article><article><span class="tracking-stat-icon arriving">⌁</span><div><small>Arriving soon</small><strong>${counts('ARRIVING_SOON')}</strong></div></article><article><span class="tracking-stat-icon delivered">✓</span><div><small>Delivered</small><strong>${counts('DELIVERED')}</strong></div></article></div>`;
  if (!record) {
    summary.innerHTML = `${stats}<section class="card tracking-empty"><div class="tracking-empty-icon">⌖</div><h3>No containers tracked yet</h3><p>Enter a container number and carrier above to begin. You can then record updates from the carrier's official tracking page.</p></section>`;
    return;
  }
  const updated = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(record.updated_at));
  const eta = record.eta ? new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeZone: 'UTC' }).format(new Date(record.eta)) : 'Not set';
  summary.innerHTML = `${stats}<section class="card tracking-feature"><div class="tracking-feature-main"><div class="tracking-title"><h3>${escapeHtml(record.container_number)}</h3><span class="tracking-badge status-${record.status.toLowerCase()}">${escapeHtml(trackingStatusLabel(record.status))}</span></div><h4>${escapeHtml(record.origin || 'Origin not set')} <span>→</span> ${escapeHtml(record.destination || 'Destination not set')}</h4><p class="tracking-latest">⌖ ${escapeHtml(record.latest_status || 'Not updated')}</p><div class="tracking-meta"><div><small>Carrier</small><strong>${escapeHtml(record.carrier)}</strong></div><div><small>Vessel</small><strong>${escapeHtml(record.vessel || 'Not set')}</strong></div><div><small>Updated</small><strong>${escapeHtml(updated)}</strong></div><div><small>ETA</small><strong>${escapeHtml(eta)}</strong></div></div><div class="tracking-feature-actions"><button class="secondary" data-update-tracking="${record.id}">Update status</button><button data-open-carrier="${record.id}">Open carrier tracking ↗</button></div></div><div class="tracking-route"><div class="route-line"><span></span><i></i><span></span></div><div class="route-labels"><strong>${escapeHtml(record.origin || 'Origin')}</strong><strong>${escapeHtml(record.destination || 'Destination')}</strong></div><p>Manual tracking record</p><small>Use the official carrier page for the latest confirmed movement, then update this record.</small></div></section>`;
  bindTrackingActions(summary);
}

function renderTrackingList() {
  const list = document.querySelector('#tracking-list');
  if (!trackingRecords.length) { list.innerHTML = '<p class="tracking-list-empty">No tracked shipments yet.</p>'; return; }
  const date = value => value ? new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeZone: 'UTC' }).format(new Date(value)) : '—';
  list.innerHTML = `<div class="tracking-table-wrap"><table class="table tracking-table"><thead><tr><th>Container</th><th>Carrier</th><th>Route</th><th>Latest status</th><th>ETA</th><th>Action</th></tr></thead><tbody>${trackingRecords.map(record => `<tr><td><strong>${escapeHtml(record.container_number)}</strong></td><td>${escapeHtml(record.carrier)}</td><td>${escapeHtml(record.origin || '—')} → ${escapeHtml(record.destination || '—')}</td><td><span class="tracking-badge status-${record.status.toLowerCase()}">${escapeHtml(trackingStatusLabel(record.status))}</span><small>${escapeHtml(record.latest_status)}</small></td><td>${escapeHtml(date(record.eta))}</td><td><div class="tracking-row-actions"><button class="secondary" data-view-tracking="${record.id}">View status</button><button class="tracking-menu-button" data-update-tracking="${record.id}" aria-label="Update ${escapeHtml(record.container_number)}">✎</button><button class="tracking-remove-button" data-remove-tracking="${record.id}" aria-label="Remove ${escapeHtml(record.container_number)}">×</button></div></td></tr>`).join('')}</tbody></table></div>`;
  bindTrackingActions(list);
}

function bindTrackingActions(node) {
  node.querySelectorAll('[data-view-tracking]').forEach(button => button.onclick = () => renderTrackingSummary(trackingRecords.find(record => record.id === button.dataset.viewTracking)));
  node.querySelectorAll('[data-update-tracking]').forEach(button => button.onclick = () => showTrackingUpdateDialog(trackingRecords.find(record => record.id === button.dataset.updateTracking)));
  node.querySelectorAll('[data-open-carrier]').forEach(button => button.onclick = () => openOfficialTracking(trackingRecords.find(record => record.id === button.dataset.openCarrier)));
  node.querySelectorAll('[data-remove-tracking]').forEach(button => button.onclick = async () => {
    const record = trackingRecords.find(item => item.id === button.dataset.removeTracking);
    if (!confirm(`Stop tracking ${record.container_number}?`)) return;
    try { await api(`/api/shipment-tracking/${record.id}`, { method: 'DELETE' }); await loadTrackingRecords(); showToast('Tracking record removed.'); }
    catch (error) { message(document.querySelector('#tracking-panel'), error.message); }
  });
}

async function openOfficialTracking(record) {
  const url = record.tracking_url || carrierTrackingUrls[record.carrier];
  if (!url) return showToast('Official tracking page is not configured for this carrier.', 'error');
  try { await navigator.clipboard.writeText(record.container_number); } catch {}
  window.open(url, '_blank', 'noopener');
  showToast(`Container ${record.container_number} copied. Paste it into the carrier tracking page.`);
}

function showTrackingUpdateDialog(record) {
  if (!record) return;
  const dialog = document.createElement('dialog');
  dialog.className = 'confirm-dialog tracking-update-dialog';
  const eta = record.eta ? new Date(record.eta).toISOString().slice(0, 10) : '';
  dialog.innerHTML = `<form><h2>Update tracking status</h2><p>${escapeHtml(record.container_number)} · ${escapeHtml(record.carrier)}</p><div class="tracking-update-grid"><label>Status<select name="status" required>${['NOT_UPDATED', 'IN_TRANSIT', 'DELAYED', 'ARRIVING_SOON', 'DELIVERED'].map(status => `<option value="${status}" ${record.status === status ? 'selected' : ''}>${trackingStatusLabel(status)}</option>`).join('')}</select></label><label>ETA<input name="eta" type="date" value="${eta}"></label><label>Origin<input name="origin" value="${escapeHtml(record.origin)}" placeholder="Hamburg"></label><label>Destination<input name="destination" value="${escapeHtml(record.destination)}" placeholder="Colombo"></label><label>Vessel<input name="vessel" value="${escapeHtml(record.vessel)}" placeholder="Vessel name"></label><label class="wide">Latest status<input name="latestStatus" value="${escapeHtml(record.latest_status)}" placeholder="Vessel departed Hamburg"></label></div><div class="confirm-dialog-actions"><button type="button" class="secondary" data-cancel>Cancel</button><button>Save update</button></div></form>`;
  document.body.append(dialog);
  dialog.querySelector('[data-cancel]').onclick = () => dialog.close();
  dialog.addEventListener('close', () => dialog.remove());
  dialog.querySelector('form').onsubmit = async event => {
    event.preventDefault();
    try {
      const updated = await api(`/api/shipment-tracking/${record.id}`, { method: 'PUT', body: JSON.stringify(Object.fromEntries(new FormData(event.currentTarget))) });
      dialog.close(); await loadTrackingRecords(updated.id); showToast('Tracking status updated.');
    } catch (error) { message(event.currentTarget, error.message); }
  };
  dialog.showModal();
}

async function showDeliveryStatus() {
  document.querySelector('#customers-panel')?.classList.add('hidden');
  document.querySelector('#administrators-panel')?.classList.add('hidden');
  document.querySelector('#shipment-workspace').classList.add('hidden');
  document.querySelector('#employees-panel').classList.add('hidden');
  document.querySelector('#settings-panel').classList.add('hidden');
  document.querySelector('#tracking-panel').classList.add('hidden');
  const panel = document.querySelector('#delivery-status-panel');
  panel.classList.remove('hidden');
  const select = panel.querySelector('#delivery-status-shipment');
  const shipments = await api('/api/shipments');
  const previousSelection = select.value;
  select.innerHTML = `<option value="">Select shipment</option>${shipments.map(shipment => `<option value="${shipment.id}">${escapeHtml(shipment.name)} · ${escapeHtml(shipment.reference)}</option>`).join('')}`;
  select.value = shipments.some(shipment => shipment.id === previousSelection) ? previousSelection : (shipments[0]?.id || '');
  select.onchange = () => renderDeliveryStatusShipment(shipments.find(shipment => shipment.id === select.value));
  await renderDeliveryStatusShipment(shipments.find(shipment => shipment.id === select.value));
  stopDeliveryStatusRefresh();
  deliveryStatusRefreshTimer = window.setInterval(async () => {
    if (panel.classList.contains('hidden') || !select.value) return;
    const shipment = shipments.find(item => item.id === select.value);
    try { await renderDeliveryStatusShipment(shipment, true); } catch {}
  }, 15000);
}

function stopDeliveryStatusRefresh() {
  if (!deliveryStatusRefreshTimer) return;
  window.clearInterval(deliveryStatusRefreshTimer);
  deliveryStatusRefreshTimer = null;
}

async function renderDeliveryStatusShipment(shipment, silent = false) {
  const content = document.querySelector('#delivery-status-content');
  const activation = document.querySelector('#delivery-status-activation');
  if (!shipment) {
    activation.classList.add('hidden');
    content.innerHTML = '<section class="card delivery-status-empty"><h3>Select a shipment</h3><p>Choose a shipment above to view its customer delivery progress.</p></section>';
    return;
  }
  const sameShipment = content.dataset.shipmentId === shipment.id;
  const activeFilter = sameShipment ? (content.querySelector('[data-dashboard-delivery-filter].active')?.dataset.dashboardDeliveryFilter || 'ALL') : 'ALL';
  content.dataset.shipmentId = shipment.id;
  if (!silent) content.innerHTML = '<section class="card delivery-status-empty"><p>Loading delivery status…</p></section>';
  const customers = await api(`/api/shipments/${shipment.id}/consignments`);
  const delivered = customers.filter(customer => customer.delivery_status === 'DELIVERED').length;
  const remaining = customers.length - delivered;
  const percentage = customers.length ? Math.round(delivered / customers.length * 100) : 0;
  activation.textContent = shipment.status === 'ACTIVE' ? 'Active' : 'Not active';
  activation.classList.toggle('inactive', shipment.status !== 'ACTIVE');
  activation.classList.remove('hidden');
  content.innerHTML = `<div class="delivery-dashboard-stats"><article class="card"><span class="delivery-stat-icon customers">♟</span><div><small>Customers</small><strong>${customers.length}</strong></div></article><article class="card"><span class="delivery-stat-icon delivered">✓</span><div><small>Delivered</small><strong>${delivered}</strong></div></article><article class="card"><span class="delivery-stat-icon remaining">◷</span><div><small>Remaining</small><strong>${remaining}</strong></div></article><article class="card"><span class="delivery-progress-ring" style="--progress:${percentage}%"><strong>${percentage}%</strong></span><div><small>Progress</small><strong>${percentage}%</strong></div></article></div><section class="card delivery-dashboard-board"><div class="delivery-dashboard-heading"><div><h3>Customer deliveries</h3><p>${delivered} of ${customers.length} customers delivered</p></div><div class="delivery-dashboard-filters" role="group" aria-label="Filter delivery status"><button class="active" data-dashboard-delivery-filter="ALL">All ${customers.length}</button><button data-dashboard-delivery-filter="PENDING">Remaining ${remaining}</button><button data-dashboard-delivery-filter="DELIVERED">Delivered ${delivered}</button></div></div><div class="delivery-progress-track"><span style="width:${percentage}%"></span></div><div class="delivery-dashboard-list">${customers.map(customer => adminDeliveryStatusRow(customer)).join('') || '<p class="delivery-empty">No customers have been added to this shipment.</p>'}</div></section><p class="delivery-auto-note">ⓘ Updates appear automatically when employees mark deliveries complete.</p>`;
  content.querySelectorAll('[data-dashboard-delivery-filter]').forEach(button => button.onclick = () => {
    content.querySelectorAll('[data-dashboard-delivery-filter]').forEach(filter => filter.classList.toggle('active', filter === button));
    content.querySelectorAll('[data-dashboard-delivery-row]').forEach(row => row.classList.toggle('hidden', button.dataset.dashboardDeliveryFilter !== 'ALL' && row.dataset.status !== button.dataset.dashboardDeliveryFilter));
  });
  content.querySelector(`[data-dashboard-delivery-filter="${activeFilter}"]`)?.click();
  content.querySelectorAll('[data-delivery-details]').forEach(button => button.onclick = () => showAdminDeliveryDetails(button.dataset.deliveryDetails));
  content.querySelectorAll('[data-reopen-dashboard-delivery]').forEach(button => {
    const customer = customers.find(item => item.id === button.dataset.reopenDashboardDelivery);
    button.onclick = () => reopenDelivery(customer, () => renderDeliveryStatusShipment(shipment));
  });
}

function adminDeliveryStatusRow(customer) {
  const delivered = customer.delivery_status === 'DELIVERED';
  return `<article class="delivery-dashboard-row ${delivered ? 'delivered' : ''}" data-dashboard-delivery-row data-status="${customer.delivery_status}"><span class="delivery-check" aria-hidden="true">${delivered ? '✓' : ''}</span><div class="delivery-dashboard-customer"><small>${escapeHtml(customer.customer_ref)}</small><strong>${escapeHtml(customer.customer_name)}</strong></div><span class="delivery-badge ${delivered ? 'delivered' : 'pending'}">${delivered ? 'Delivered' : 'Remaining'}</span><p>${escapeHtml(delivered ? deliveredAudit(customer) : 'Waiting for delivery')}</p><div class="delivery-dashboard-actions"><button class="secondary" data-delivery-details="${customer.id}">Open details</button>${delivered ? `<button class="secondary" data-reopen-dashboard-delivery="${customer.id}">Reopen delivery</button>` : ''}</div></article>`;
}

async function showAdminDeliveryDetails(consignmentId) {
  const delivery = await api(`/api/consignments/${consignmentId}`);
  const dialog = document.createElement('dialog');
  dialog.className = 'confirm-dialog delivery-details-dialog';
  dialog.innerHTML = `<section><div class="delivery-details-heading"><div><h2>${escapeHtml(delivery.customer_ref)} — ${escapeHtml(delivery.customer_name)}</h2><p>${escapeHtml(delivery.delivery_status === 'DELIVERED' ? deliveredAudit(delivery) : 'Waiting for delivery')}</p></div><button type="button" class="secondary" data-close>Close</button></div><div class="delivery-details-meta"><div><small>Total items</small><strong>${delivery.total_items}</strong></div><div><small>Total volume</small><strong>${delivery.total_cubic.toFixed(3)} m³</strong></div><div><small>Address</small><strong>${escapeHtml(delivery.sri_lankan_address || delivery.german_address || '—')}</strong></div></div><div class="tracking-table-wrap"><table class="table"><thead><tr><th>Description</th><th>Dimensions</th><th>Quantity</th></tr></thead><tbody>${delivery.items.map(item => `<tr><td>${escapeHtml(item.description || 'Cargo item')}</td><td>${item.height_cm} × ${item.width_cm} × ${item.depth_cm} cm</td><td>${item.quantity}</td></tr>`).join('') || '<tr><td colspan="3">No items added.</td></tr>'}</tbody></table></div></section>`;
  document.body.append(dialog);
  dialog.querySelector('[data-close]').onclick = () => dialog.close();
  dialog.addEventListener('close', () => dialog.remove());
  dialog.showModal();
}

async function openEmployeeShipment(shipment, pushHistory = true) {
  if (pushHistory) history.pushState({ view: 'shipment', shipmentId: shipment.id }, '', `#shipment-${shipment.id}`);
  const customers = await api(`/api/shipments/${shipment.id}/consignments`);
  const delivered = customers.filter(customer => customer.delivery_status === 'DELIVERED').length;
  app.innerHTML = `<main class="shipment-screen delivery-workspace"><header class="shipment-screen-header"><div><h1>${escapeHtml(shipment.name)}</h1><p>${escapeHtml(shipment.reference)}</p></div><button id="back-to-dashboard" class="secondary">← Back to shipments</button></header><section class="card delivery-board"><div class="delivery-board-heading"><div><p class="delivery-kicker">Delivery progress</p><h2>Customer deliveries</h2><p><strong>${delivered}</strong> of <strong>${customers.length}</strong> delivered</p></div><div class="delivery-progress-ring" style="--progress:${customers.length ? Math.round(delivered / customers.length * 100) : 0}%"><strong>${customers.length ? Math.round(delivered / customers.length * 100) : 0}%</strong></div></div><div class="delivery-progress-track"><span style="width:${customers.length ? delivered / customers.length * 100 : 0}%"></span></div><div class="delivery-filters" role="group" aria-label="Filter customer deliveries"><button class="active" data-delivery-filter="ALL">All <span>${customers.length}</span></button><button data-delivery-filter="PENDING">Remaining <span>${customers.length - delivered}</span></button><button data-delivery-filter="DELIVERED">Delivered <span>${delivered}</span></button></div><div class="cards delivery-cards">${customers.map(customer => employeeDeliveryCard(customer)).join('') || '<p class="delivery-empty">No customers in this shipment.</p>'}</div></section></main>`;
  document.querySelector('#back-to-dashboard').onclick = () => dashboard();
  app.querySelectorAll('[data-delivery]').forEach(button => button.onclick = () => openEmployeeDelivery(button.dataset.delivery, shipment));
  app.querySelectorAll('[data-mark-delivered]').forEach(button => button.onclick = () => confirmDelivery(customers.find(customer => customer.id === button.dataset.markDelivered), () => openEmployeeShipment(shipment, false)));
  app.querySelectorAll('[data-delivery-filter]').forEach(button => button.onclick = () => {
    app.querySelectorAll('[data-delivery-filter]').forEach(filter => filter.classList.toggle('active', filter === button));
    app.querySelectorAll('[data-delivery-card]').forEach(card => card.classList.toggle('hidden', button.dataset.deliveryFilter !== 'ALL' && card.dataset.status !== button.dataset.deliveryFilter));
  });
}

function employeeDeliveryCard(customer) {
  const delivered = customer.delivery_status === 'DELIVERED';
  const audit = delivered ? deliveredAudit(customer) : 'Waiting for delivery';
  return `<article class="card delivery-card ${delivered ? 'delivered' : ''}" data-delivery-card data-status="${customer.delivery_status}"><div class="delivery-card-main"><span class="delivery-check" aria-hidden="true">${delivered ? '✓' : ''}</span><div><div class="delivery-card-title"><h3>${escapeHtml(customer.customer_ref)} — ${escapeHtml(customer.customer_name)}</h3><span class="delivery-badge ${delivered ? 'delivered' : 'pending'}">${delivered ? 'Delivered' : 'Remaining'}</span></div><p>${escapeHtml(audit)}</p></div></div><div class="delivery-card-actions"><button class="secondary" data-delivery="${customer.id}">Open details</button>${delivered ? '' : `<button class="mark-delivered" data-mark-delivered="${customer.id}">Mark as delivered</button>`}</div></article>`;
}

function deliveredAudit(customer) {
  const person = customer.delivered_by?.full_name || customer.delivered_by?.username || 'Team member';
  const time = customer.delivered_at ? new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(customer.delivered_at)) : '';
  return `Delivered by ${person}${time ? ` · ${time}` : ''}`;
}

function confirmDelivery(customer, onSuccess) {
  const dialog = document.createElement('dialog');
  dialog.className = 'delivery-confirm-dialog';
  dialog.innerHTML = `<form><div class="delivery-confirm-icon" aria-hidden="true">✓</div><h2>Confirm delivery</h2><p>Confirm that all packages for this customer were delivered successfully.</p><div class="delivery-confirm-customer"><strong>${escapeHtml(customer.customer_ref)} — ${escapeHtml(customer.customer_name)}</strong></div><div class="delivery-confirm-actions"><button type="button" class="secondary" data-cancel>Cancel</button><button class="mark-delivered">Confirm delivered</button></div></form>`;
  document.body.append(dialog);
  dialog.querySelector('[data-cancel]').onclick = () => dialog.close();
  dialog.addEventListener('close', () => dialog.remove());
  dialog.addEventListener('click', event => { if (event.target === dialog) dialog.close(); });
  dialog.querySelector('form').onsubmit = async event => {
    event.preventDefault();
    const submit = event.currentTarget.querySelector('.mark-delivered');
    submit.disabled = true;
    submit.textContent = 'Saving…';
    try {
      await api(`/api/consignments/${customer.id}/delivery-status`, { method: 'PATCH', body: JSON.stringify({ status: 'DELIVERED' }) });
      dialog.close();
      await onSuccess();
    } catch (error) { submit.disabled = false; submit.textContent = 'Confirm delivered'; message(event.currentTarget, error.message); }
  };
  dialog.showModal();
}

async function openEmployeeDelivery(id, shipment) {
  const delivery = await api(`/api/consignments/${id}/delivery-sheet`);
  app.innerHTML = `<main class="shipment-screen"><header class="shipment-screen-header"><div><h1>Delivery details</h1><p>Total items: ${delivery.totalItems}</p></div><button id="back-to-customers" class="secondary">← Back to customers</button></header><section class="card"><h2>${escapeHtml(delivery.customer.name)}</h2><p>Reference: ${escapeHtml(delivery.customer.reference)}</p><p>${escapeHtml(delivery.customer.address || '—')}</p><table class="table"><thead><tr><th>Description</th><th>Dimensions</th><th>Quantity</th></tr></thead><tbody>${delivery.items.map(item => `<tr><td>${escapeHtml(item.description || 'Cargo item')}</td><td>${item.height} × ${item.width} × ${item.depth} cm</td><td>${item.quantity}</td></tr>`).join('')}</tbody></table><button id="download-delivery">Print / Save delivery sheet</button></section></main>`;
  document.querySelector('#back-to-customers').onclick = () => openEmployeeShipment(shipment, false);
  document.querySelector('#download-delivery').onclick = () => window.print();
}

function fillProfileSettings(user) {
  const form = document.querySelector('#profile-settings-form');
  const values = { username:user.username, fullName:user.full_name, businessName:user.business_name, businessTagline:user.business_tagline, registrationNumber:user.registration_number, vatNumber:user.vat_number, businessLogo:user.business_logo, phone:user.phone, phoneSriLanka:user.phone_sri_lanka, email:user.email, website:user.website, businessAddress:user.business_address, sriLankanAddress:user.sri_lankan_address, defaultCurrency:user.default_currency || 'EUR', invoicePrefix:user.invoice_prefix || 'INV', paymentTermsDays:String(user.payment_terms_days ?? 14), invoiceAccentColor:user.invoice_accent_color || '#0D2B45', bankName:user.bank_name, accountHolder:user.account_holder, iban:user.iban, bic:user.bic };
  Object.entries(values).forEach(([key, value]) => form.elements[key].value = value || '');
  renderBusinessLogo(values.businessLogo);
  document.querySelector('#invoice-accent-value').textContent = values.invoiceAccentColor.toUpperCase();
}

async function saveProfileSettings(event) {
  event.preventDefault();
  const form = event.currentTarget;
  try {
    const { user } = await api('/api/profile', { method: 'PUT', body: JSON.stringify(Object.fromEntries(new FormData(form))) });
    currentUser = user;
    updateSidebarIdentity(user);
    document.title = `${user.business_name || 'Cargo Management'} · Settings`;
    showToast('Business settings saved.');
  } catch (error) { message(form, error.message); }
}

async function changeAdministratorPassword(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const values = Object.fromEntries(new FormData(form));
  if (values.newPassword !== values.confirmPassword) return message(form, 'New password and confirmation do not match.');
  try {
    await api('/api/profile/password', { method: 'PUT', body: JSON.stringify(values) });
    form.reset();
    alert('Password changed successfully. Sign in again with your new password.');
    login();
  } catch (error) { message(form, error.message); }
}

function fillForm(c) { const form = document.querySelector('#consignment-form'); const values = { customerRef:c.customer_ref, customerName:c.customer_name, customerId:c.customer_identity, billingEmail:c.billing_email, pickupContactName:c.pickup_contact_name, germanAddress:c.german_address, deliveryContactName:c.delivery_contact_name, sriLankanAddress:c.sri_lankan_address, phoneDE:c.phone_de, phoneLK:c.phone_lk, ratePerCubic:c.rate_per_cubic, deliveryCharge:c.delivery_charge }; Object.entries(values).forEach(([key,value]) => form.elements[key].value = value || ''); if (form.elements.allItemsEntered) form.elements.allItemsEntered.checked = Boolean(c.all_items_entered); }

function renderDraftItems() {
  const editor = document.querySelector('#item-editor');
  const customerForm = document.querySelector('#consignment-form');
  const completionChecked = Boolean(customerForm.elements.allItemsEntered?.checked);
  document.querySelectorAll('.shipment-completion').forEach(completion => completion.remove());
  const rate = Number(customerForm.elements.ratePerCubic.value) || 0;
  const deliveryCharge = Number(customerForm.elements.deliveryCharge.value) || 0;
  const editingItem = editingDraftItemIndex === null ? null : draftItems[editingDraftItemIndex];
  const calculatedItems = draftItems.map(item => {
    const cubicPerItem = Number(item.height) * Number(item.width) * Number(item.depth) / 1_000_000;
    return { ...item, cubicPerItem, amount: cubicPerItem * Number(item.quantity) * rate };
  });
  const totalCubic = calculatedItems.reduce((sum, item) => sum + item.cubicPerItem * Number(item.quantity), 0);
  const totalItems = calculatedItems.reduce((sum, item) => sum + Number(item.quantity), 0);
  const totalAmount = calculatedItems.reduce((sum, item) => sum + item.amount, 0);
  editor.innerHTML = `<section class="delivery-items draft-delivery-items"><h3>Delivery items — Draft customer</h3><p class="draft-notice">These items will be saved together when you click <strong>Save customer</strong>.</p><form id="draft-item-form" class="item-form"><label>Height (cm)<input name="height" type="number" min="0.01" step="0.01" required value="${editingItem?.height ?? ''}"></label><label>Width (cm)<input name="width" type="number" min="0.01" step="0.01" required value="${editingItem?.width ?? ''}"></label><label>Depth (cm)<input name="depth" type="number" min="0.01" step="0.01" required value="${editingItem?.depth ?? ''}"></label><label>No. items<input name="quantity" type="number" min="1" step="1" required value="${editingItem?.quantity ?? ''}"></label><label class="description-field">Description<input name="description" value="${escapeHtml(editingItem?.description ?? '')}"></label><button>${editingItem ? 'Save item changes' : 'Add item'}</button>${editingItem ? '<button type="button" id="cancel-draft-edit" class="secondary">Cancel</button>' : ''}</form><div class="items-table-toolbar"><div><strong>Delivery items</strong><span class="items-row-count">${calculatedItems.length} items</span><small>Scroll inside the table to view all items</small></div><label>Search items<input class="items-table-search" type="search" placeholder="Description or dimensions"></label></div><p class="items-scroll-hint">Swipe left or right to view all columns and item actions.</p><div class="items-table-scroll" tabindex="0" role="region" aria-label="Scrollable delivery items table"><table class="table items-table"><thead><tr><th>No.</th><th>Height</th><th>Width</th><th>Depth</th><th>Items</th><th>Cubic meter (m³)</th><th>Amount (€)</th><th>Description</th><th>Actions</th></tr></thead><tbody>${calculatedItems.map((item, index) => `<tr><td>${index + 1}</td><td>${item.height}</td><td>${item.width}</td><td>${item.depth}</td><td>${item.quantity}</td><td>${item.cubicPerItem.toFixed(3)}</td><td>€${item.amount.toFixed(2)}</td><td>${escapeHtml(item.description)}</td><td><button type="button" class="secondary" data-edit-draft-item="${index}">Edit</button> <button type="button" class="secondary" data-remove-draft-item="${index}">Remove</button></td></tr>`).join('') || '<tr><td colspan="9" class="empty-table">No draft items added yet.</td></tr>'}</tbody></table></div><div class="shipment-totals"><div><span>Total cubic (m³)</span><strong>${totalCubic.toFixed(3)}</strong></div><div><span>Total items</span><strong>${totalItems}</strong></div><div><span>Total (€)</span><strong>€${totalAmount.toFixed(2)}</strong></div><div><span>Delivery charge (€)</span><strong>€${deliveryCharge.toFixed(2)}</strong></div><div><span>Final total (€)</span><strong>€${(totalAmount + deliveryCharge).toFixed(2)}</strong></div></div></section>`;
  const completion = document.createElement('div');
  completion.className = 'shipment-completion';
  completion.innerHTML = `<label class="items-entered"><input name="allItemsEntered" form="consignment-form" type="checkbox" ${completionChecked ? 'checked' : ''}> All items are entered</label>`;
  editor.querySelector('.items-table-scroll').after(completion);
  renderDocumentActions();
  configureItemsTable(editor);
  const form = editor.querySelector('#draft-item-form');
  enableItemEnterNavigation(form);
  form.onsubmit = event => {
    event.preventDefault();
    const item = Object.fromEntries(new FormData(form));
    if (editingDraftItemIndex === null) draftItems.push(item);
    else draftItems[editingDraftItemIndex] = item;
    editingDraftItemIndex = null;
    renderDraftItems();
  };
  editor.querySelector('#cancel-draft-edit')?.addEventListener('click', () => { editingDraftItemIndex = null; renderDraftItems(); });
  editor.querySelectorAll('[data-edit-draft-item]').forEach(button => button.onclick = () => { editingDraftItemIndex = Number(button.dataset.editDraftItem); renderDraftItems(); });
  editor.querySelectorAll('[data-remove-draft-item]').forEach(button => button.onclick = () => { draftItems.splice(Number(button.dataset.removeDraftItem), 1); editingDraftItemIndex = null; renderDraftItems(); });
}

function renderItems() { const editor = document.querySelector('#item-editor'); const c = activeConsignment; const editingItem = c.items.find(item => item.id === editingItemId); if (!editingItem) editingItemId = null; editor.innerHTML = `<section class="delivery-items"><h3>Delivery items — ${escapeHtml(c.customer_ref)}</h3><form id="item-form" class="item-form"><label>Height (cm)<input name="height" type="number" min="0.01" step="0.01" required value="${editingItem?.height_cm ?? ''}"></label><label>Width (cm)<input name="width" type="number" min="0.01" step="0.01" required value="${editingItem?.width_cm ?? ''}"></label><label>Depth (cm)<input name="depth" type="number" min="0.01" step="0.01" required value="${editingItem?.depth_cm ?? ''}"></label><label>No. items<input name="quantity" type="number" min="1" step="1" required value="${editingItem?.quantity ?? ''}"></label><label class="description-field">Description<input name="description" value="${escapeHtml(editingItem?.description ?? '')}"></label><button>${editingItem ? 'Save changes' : 'Add item'}</button>${editingItem ? '<button type="button" id="cancel-item-edit" class="secondary">Cancel</button>' : ''}</form><div class="items-table-toolbar"><div><strong>Delivery items</strong><span class="items-row-count">${c.items.length} items</span><small>Scroll inside the table to view all items</small></div><label>Search items<input class="items-table-search" type="search" placeholder="Description or dimensions"></label></div><p class="items-scroll-hint">Swipe left or right to view all columns and item actions.</p><div class="items-table-scroll" tabindex="0" role="region" aria-label="Scrollable delivery items table"><table class="table items-table"><thead><tr><th>No.</th><th>Height</th><th>Width</th><th>Depth</th><th>Items</th><th>Cubic meter (m³)</th><th>Amount (€)</th><th>Description</th><th>Actions</th></tr></thead><tbody>${c.items.map((i, index) => `<tr><td>${index + 1}</td><td>${i.height_cm}</td><td>${i.width_cm}</td><td>${i.depth_cm}</td><td>${i.quantity}</td><td>${i.cubic_per_item.toFixed(3)}</td><td>€${i.amount.toFixed(2)}</td><td>${escapeHtml(i.description)}</td><td><button class="secondary" data-edit-item="${i.id}">Edit</button> <button class="secondary" data-remove-item="${i.id}">Remove</button></td></tr>`).join('') || '<tr><td colspan="9" class="empty-table">No delivery items added yet.</td></tr>'}</tbody></table></div><div class="shipment-totals"><div><span>Total cubic (m³)</span><strong>${c.total_cubic.toFixed(3)}</strong></div><div><span>Total items</span><strong>${c.total_items}</strong></div><div><span>Total (€)</span><strong>€${c.total_amount.toFixed(2)}</strong></div><div><span>Delivery charge (€)</span><strong>€${c.delivery_charge.toFixed(2)}</strong></div><div><span>Final total (€)</span><strong>€${c.final_total.toFixed(2)}</strong></div></div></section>`;
  let completion = document.querySelector('.shipment-completion');
  if (!completion) {
    completion = document.createElement('div');
    completion.className = 'shipment-completion';
    completion.innerHTML = '<label class="items-entered"><input name="allItemsEntered" form="consignment-form" type="checkbox"> All items are entered</label>';
  }
  completion.querySelector('input').checked = Boolean(c.all_items_entered);
  editor.querySelector('.items-table-scroll').after(completion);
  renderDocumentActions(c);
  configureItemsTable(editor);
  const itemForm = editor.querySelector('#item-form'); enableItemEnterNavigation(itemForm); itemForm.addEventListener('submit', async event => { event.preventDefault(); try { const path = editingItemId ? `/api/items/${editingItemId}` : `/api/consignments/${c.id}/items`; activeConsignment = await api(path, { method: editingItemId ? 'PUT' : 'POST', body:JSON.stringify(Object.fromEntries(new FormData(event.currentTarget))) }); editingItemId = null; renderItems(); } catch(error) { message(event.currentTarget,error.message); } }); editor.querySelector('#cancel-item-edit')?.addEventListener('click', () => { editingItemId = null; renderItems(); }); editor.querySelectorAll('[data-edit-item]').forEach(button => button.onclick = () => { editingItemId = button.dataset.editItem; renderItems(); }); editor.querySelectorAll('[data-remove-item]').forEach(button => button.onclick = async () => { activeConsignment = await api(`/api/items/${button.dataset.removeItem}`, { method:'DELETE' }); if (editingItemId === button.dataset.removeItem) editingItemId = null; renderItems(); }); }

function configureItemsTable(editor) {
  const search = editor.querySelector('.items-table-search');
  const count = editor.querySelector('.items-row-count');
  const rows = [...editor.querySelectorAll('.items-table tbody tr')].filter(row => !row.querySelector('.empty-table'));
  if (!search || !count) return;
  search.addEventListener('input', event => {
    const query = event.currentTarget.value.trim().toLowerCase();
    let visible = 0;
    rows.forEach(row => {
      const matches = !query || row.textContent.toLowerCase().includes(query);
      row.classList.toggle('items-filtered-out', !matches);
      if (matches) visible++;
    });
    count.textContent = query ? `${visible} of ${rows.length} items` : `${rows.length} items`;
  });
}

function renderDocumentActions(consignment = null) {
  const pageActionBar = document.querySelector('.page-action-bar');
  if (!pageActionBar) return;
  pageActionBar.querySelector('.payment-information')?.remove();
  pageActionBar.querySelector('.invoice-actions')?.remove();
  renderPaymentInformation(pageActionBar, consignment);
  const invoiceActions = document.createElement('div');
  invoiceActions.className = 'invoice-actions';
  const emailHistory = consignment?.latest_invoice?.email_history || [];
  const lastEmail = emailHistory[emailHistory.length - 1];
  const canSend = Boolean(consignment?.billing_email);
  invoiceActions.innerHTML = `<div class="document-buttons"><button type="button" id="preview-invoice" class="secondary" ${consignment ? '' : 'disabled'}>Preview invoice</button><button type="button" id="download-packing-list" class="secondary" ${consignment ? '' : 'disabled'}>Download packing list</button><button type="button" id="issue-invoice" ${consignment ? '' : 'disabled'}>Print invoice</button><button type="button" id="send-invoice" ${canSend ? '' : 'disabled'} title="${!consignment ? 'Save or load a customer first.' : !consignment.billing_email ? 'Add and save a billing email before sending.' : ''}">${lastEmail ? 'Resend Invoice' : 'Send Invoice'}</button></div>${lastEmail ? `<div class="invoice-email-status">✓ Sent to <span>${escapeHtml(lastEmail.recipient)}</span></div>` : ''}`;
  if (!document.querySelector('#invoice-email-styles')) document.head.insertAdjacentHTML('beforeend', '<style id="invoice-email-styles">.shipment-page .page-action-bar .invoice-actions{width:min(100%,1180px)!important;display:block!important}.document-buttons{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:.65rem;width:100%}.document-buttons button{width:100%;min-width:0!important}.invoice-email-status{display:flex;align-items:center;justify-content:center;gap:.3rem;width:100%;margin-top:.8rem;padding:.65rem .8rem;border:1px solid #a9dec8;border-radius:8px;color:#087443;background:#f1fbf6;font-size:.8rem;font-weight:700;overflow-wrap:anywhere}.invoice-email-dialog{width:min(560px,calc(100% - 2rem))}.invoice-email-summary{padding:.85rem;border:1px solid #e3e7ed;border-radius:9px;background:#f7f8fa}.invoice-email-summary span,.invoice-email-summary strong{display:block}.invoice-email-summary span{color:#697386;font-size:.76rem}.invoice-email-summary strong{margin-top:.2rem}.invoice-email-dialog textarea{width:100%;min-height:130px;resize:vertical;border:1px solid #cbd1dc;border-radius:7px;padding:.75rem;font:inherit;line-height:1.5}@media(max-width:850px){.document-buttons{grid-template-columns:repeat(2,minmax(0,1fr))}}@media(max-width:480px){.document-buttons{grid-template-columns:1fr}.invoice-email-status{align-items:flex-start;flex-direction:column}}</style>');
  pageActionBar.append(invoiceActions);
  if (!consignment) return;
  invoiceActions.querySelector('#preview-invoice').onclick = () => openInvoice(consignment, false, document.querySelector('#item-editor'));
  invoiceActions.querySelector('#download-packing-list').onclick = () => window.open(`/api/consignments/${consignment.id}/packing-list`, '_blank');
  invoiceActions.querySelector('#issue-invoice').onclick = () => printIssuedInvoice(consignment, document.querySelector('#item-editor'));
  invoiceActions.querySelector('#send-invoice').onclick = () => showSendInvoiceDialog(consignment);
}

function showSendInvoiceDialog(consignment) {
  const invoice = consignment.latest_invoice;
  const dialog = document.createElement('dialog');
  dialog.className = 'confirm-dialog invoice-email-dialog';
  const defaultMessage = invoice ? `Please find your invoice ${invoice.invoice_number} attached.` : 'Please find your invoice attached.';
  const invoiceLabel = invoice?.invoice_number || 'A permanent invoice number will be created';
  const attachmentLabel = invoice ? `Invoice-${invoice.invoice_number}.pdf` : 'The issued invoice PDF will be attached';
  dialog.innerHTML = `<form><h2>Send Invoice</h2><p>The same official invoice PDF used for printing will be sent to the saved billing email.</p><div class="invoice-email-summary"><span>Invoice</span><strong>${escapeHtml(invoiceLabel)}</strong></div><div class="invoice-email-summary"><span>Recipient</span><strong>${escapeHtml(consignment.billing_email)}</strong></div><div class="invoice-email-summary"><span>Attachment</span><strong>${escapeHtml(attachmentLabel)}</strong></div><label>Short message<textarea name="message" maxlength="1000">${escapeHtml(defaultMessage)}</textarea></label><div class="confirm-dialog-actions"><button type="button" class="secondary" data-cancel>Cancel</button><button>Send Invoice</button></div></form>`;
  document.body.append(dialog);
  dialog.querySelector('[data-cancel]').onclick = () => dialog.close();
  dialog.addEventListener('close', () => dialog.remove());
  dialog.querySelector('form').onsubmit = async event => {
    event.preventDefault();
    const button = event.currentTarget.querySelector('button:not([type="button"])');
    button.disabled = true;
    button.textContent = 'Sending…';
    try {
      if (!consignment.latest_invoice) {
        const issued = await api(`/api/consignments/${consignment.id}/invoices`, { method: 'POST', body: '{}' });
        consignment.latest_invoice = { id: issued.id, invoice_number: issued.invoiceNumber, status: 'ISSUED', email_history: [] };
      }
      const issuedInvoice = consignment.latest_invoice;
      const sent = await api(`/api/invoices/${issuedInvoice.id}/send`, { method: 'POST', body: JSON.stringify({ recipient: consignment.billing_email, message: event.currentTarget.elements.message.value }) });
      consignment.latest_invoice.email_history.push({ recipient: sent.recipient, message: sent.message, status: sent.status, sentAt: sent.sentAt });
      dialog.close();
      renderDocumentActions(consignment);
      showToast(`Invoice ${issuedInvoice.invoice_number} sent to ${sent.recipient}.`);
    } catch (error) {
      button.disabled = false;
      button.textContent = 'Send Invoice';
      message(event.currentTarget, error.message);
    }
  };
  dialog.showModal();
}

function renderPaymentInformation(pageActionBar, consignment) {
  const payment = document.createElement('section');
  payment.className = 'payment-information';
  const total = Number(consignment?.final_total || 0);
  const grossTotal = Number(consignment?.gross_total ?? total);
  const discount = Number(consignment?.discount || 0);
  const paid = Number(consignment?.amount_paid || 0);
  const balance = Number(consignment?.balance_due ?? total);
  const status = consignment?.payment_status || 'UNPAID';
  const statusLabel = { UNPAID: 'Unpaid', PARTIALLY_PAID: 'Partially Paid', PAID: 'Paid' }[status];
  const today = new Date().toISOString().slice(0, 10);
  payment.innerHTML = `<h3>Payment Information</h3><form class="payment-form"><label>Payment Method<select name="method" ${!consignment || status === 'PAID' ? 'disabled' : ''}><option value="BANK_TRANSFER">Bank Transfer</option><option value="CASH">Cash</option><option value="CARD">Card</option><option value="OTHER">Other</option></select></label><label>Invoice Total<input value="€${grossTotal.toFixed(2)}" readonly></label><label>Discount (€)<input class="payment-discount" type="number" min="0" max="${Math.max(0, grossTotal - paid).toFixed(2)}" step="0.01" value="${discount.toFixed(2)}" ${!consignment ? 'disabled' : ''}></label><label>Amount Paid<input name="amount" type="number" min="0.01" max="${balance.toFixed(2)}" step="0.01" placeholder="€0.00" ${!consignment || status === 'PAID' ? 'disabled' : ''}></label><label>Balance Due<input value="€${balance.toFixed(2)}" readonly></label><label>Payment Status<span class="payment-status status-${status.toLowerCase()}">${statusLabel}</span></label><label>Payment Date<input name="paymentDate" type="date" value="${today}" ${!consignment || status === 'PAID' ? 'disabled' : ''}></label><label>Payment Reference<input name="reference" maxlength="100" placeholder="Transaction reference" ${!consignment || status === 'PAID' ? 'disabled' : ''}></label><button ${!consignment || status === 'PAID' ? 'disabled' : ''}>Record Payment</button></form><div class="payment-information-footer"><button type="button" class="payment-history-link" ${consignment ? '' : 'disabled'}>View payment history (${consignment?.payments?.length || 0})</button><span>Discount and balance are calculated automatically.</span></div>`;
  pageActionBar.append(payment);
  if (!consignment) return;
  payment.querySelector('.payment-discount').onchange = async event => {
    const input = event.currentTarget;
    input.disabled = true;
    try {
      activeConsignment = await api(`/api/consignments/${consignment.id}/discount`, { method: 'PATCH', body: JSON.stringify({ discount: input.value }) });
      renderItems();
      showToast('Discount updated. Invoice total and balance were recalculated.');
    } catch (error) {
      input.disabled = false;
      input.value = discount.toFixed(2);
      message(payment, error.message);
    }
  };
  payment.querySelector('.payment-form').onsubmit = async event => {
    event.preventDefault();
    const button = event.currentTarget.querySelector('button');
    button.disabled = true;
    button.textContent = 'Recording…';
    try {
      activeConsignment = await api(`/api/consignments/${consignment.id}/payments`, { method: 'POST', body: JSON.stringify(Object.fromEntries(new FormData(event.currentTarget))) });
      renderItems();
      showToast('Payment recorded successfully.');
    } catch (error) {
      button.disabled = false;
      button.textContent = 'Record Payment';
      message(payment, error.message);
    }
  };
  payment.querySelector('.payment-history-link').onclick = () => showPaymentHistory(consignment);
}

function showPaymentHistory(consignment) {
  const methodLabels = { BANK_TRANSFER: 'Bank transfer', CASH: 'Cash', CARD: 'Card', OTHER: 'Other' };
  const dialog = document.createElement('dialog');
  dialog.className = 'payment-history-dialog';
  const rows = consignment.payments?.map(payment => `<tr class="${payment.status === 'VOID' ? 'void-payment-row' : ''}"><td>${new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(new Date(payment.payment_date))}</td><td>€${Number(payment.amount).toFixed(2)}</td><td>${methodLabels[payment.method] || escapeHtml(payment.method)}</td><td>${escapeHtml(payment.reference || '—')}</td><td>${escapeHtml(payment.recorded_by || '—')}</td><td><span class="payment-record-status ${payment.status === 'VOID' ? 'void' : 'active'}">${payment.status === 'VOID' ? 'Voided' : 'Active'}</span>${payment.status === 'VOID' ? `<small class="void-payment-reason">${escapeHtml(payment.void_reason)}<br>By ${escapeHtml(payment.voided_by || 'Administrator')}</small>` : ''}</td><td>${payment.status === 'VOID' ? '' : `<button type="button" class="void-payment-button" data-void-payment="${payment.id}">Void</button>`}</td></tr>`).join('');
  dialog.innerHTML = `<section><header><div><h2>Payment history</h2><p>${escapeHtml(consignment.customer_ref)} — ${escapeHtml(consignment.customer_name)}</p></div><button type="button" class="secondary" aria-label="Close">×</button></header>${rows ? `<div class="payment-history-table-wrap"><table class="table"><thead><tr><th>Date</th><th>Amount</th><th>Method</th><th>Reference</th><th>Recorded by</th><th>Status</th><th>Action</th></tr></thead><tbody>${rows}</tbody></table></div>` : '<p class="payment-history-empty">No payments have been recorded yet.</p>'}<footer><strong>Total active payments</strong><strong>€${Number(consignment.amount_paid || 0).toFixed(2)}</strong></footer></section>`;
  document.body.append(dialog);
  dialog.querySelector('header button').onclick = () => dialog.close();
  dialog.querySelectorAll('[data-void-payment]').forEach(button => button.onclick = () => {
    const payment = consignment.payments.find(item => item.id === button.dataset.voidPayment);
    dialog.close();
    showVoidPaymentDialog(payment, consignment);
  });
  dialog.addEventListener('click', event => { if (event.target === dialog) dialog.close(); });
  dialog.addEventListener('close', () => dialog.remove());
  dialog.showModal();
}

function showVoidPaymentDialog(payment, consignment) {
  const methodLabels = { BANK_TRANSFER: 'Bank transfer', CASH: 'Cash', CARD: 'Card', OTHER: 'Other' };
  const dialog = document.createElement('dialog');
  dialog.className = 'void-payment-dialog';
  dialog.innerHTML = `<form><div class="void-dialog-icon" aria-hidden="true">!</div><h2>Void Payment</h2><p class="void-dialog-intro">The original transaction will remain in payment history and the balance will be recalculated.</p><dl><div><dt>Payment amount</dt><dd>€${Number(payment.amount).toFixed(2)}</dd></div><div><dt>Payment date</dt><dd>${new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(new Date(payment.payment_date))}</dd></div><div><dt>Payment method</dt><dd>${methodLabels[payment.method] || escapeHtml(payment.method)}</dd></div><div><dt>Reference</dt><dd>${escapeHtml(payment.reference || '—')}</dd></div></dl><label>Reason for voiding<textarea name="reason" minlength="5" maxlength="300" required placeholder="Explain what was entered incorrectly"></textarea></label><label>Administrator Password<input name="password" type="password" autocomplete="current-password" required></label><p class="void-dialog-warning">This action preserves the payment as a voided audit record.</p><div class="void-dialog-actions"><button type="button" class="secondary" data-cancel>Cancel</button><button class="danger-button">Void Payment</button></div></form>`;
  document.body.append(dialog);
  dialog.querySelector('[data-cancel]').onclick = () => dialog.close();
  dialog.addEventListener('click', event => { if (event.target === dialog) dialog.close(); });
  dialog.addEventListener('close', () => dialog.remove());
  dialog.querySelector('form').onsubmit = async event => {
    event.preventDefault();
    const button = event.currentTarget.querySelector('.danger-button');
    button.disabled = true;
    button.textContent = 'Voiding…';
    try {
      activeConsignment = await api(`/api/payments/${payment.id}/void`, { method: 'PATCH', body: JSON.stringify(Object.fromEntries(new FormData(event.currentTarget))) });
      dialog.close();
      renderItems();
      showToast('Payment voided. Balance and status were recalculated.');
    } catch (error) {
      button.disabled = false;
      button.textContent = 'Void Payment';
      message(event.currentTarget, error.message);
    }
  };
  dialog.showModal();
}

function enableItemEnterNavigation(form) {
  const fields = ['height', 'width', 'depth', 'quantity', 'description'].map(name => form.elements[name]);
  const submitButton = form.querySelector('button:not([type="button"])');
  form.addEventListener('keydown', event => {
    if (!fields.includes(event.target)) return;
    const currentIndex = fields.indexOf(event.target);
    if (event.key === 'Enter') {
      event.preventDefault();
      const next = fields[currentIndex + 1] || submitButton;
      next?.focus();
    }
    if (event.key === 'Backspace' && event.target.value === '' && currentIndex > 0) {
      event.preventDefault();
      const previous = fields[currentIndex - 1];
      previous.focus();
      if (previous.type !== 'number') previous.setSelectionRange?.(previous.value.length, previous.value.length);
    }
  });
}
function escapeHtml(value) { return String(value ?? '').replace(/[&<>'"]/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[char])); }
async function printIssuedInvoice(consignment, messageTarget) {
  const invoiceWindow = window.open('', '_blank');
  if (!invoiceWindow) return message(messageTarget, 'Allow pop-ups to print an invoice.');
  invoiceWindow.document.write('<title>Preparing invoice…</title><p style="font-family:system-ui;padding:2rem">Preparing official invoice PDF…</p>');
  try {
    if (!consignment.latest_invoice) {
      const issued = await api(`/api/consignments/${consignment.id}/invoices`, { method: 'POST', body: '{}' });
      consignment.latest_invoice = { id: issued.id, invoice_number: issued.invoiceNumber, status: 'ISSUED', email_history: [] };
      renderDocumentActions(consignment);
    }
    invoiceWindow.location.replace(`/api/invoices/${consignment.latest_invoice.id}/pdf`);
  } catch (error) {
    invoiceWindow.close();
    message(messageTarget, error.message);
  }
}
async function openInvoice(consignment, issue, messageTarget) {
  const invoiceWindow = window.open('', '_blank');
  if (!invoiceWindow) return message(messageTarget, 'Allow pop-ups to preview or print an invoice.');
  invoiceWindow.document.write('<title>Preparing invoice…</title><p style="font-family:system-ui;padding:2rem">Preparing invoice…</p>');
  try {
    const invoice = issue ? await api(`/api/consignments/${consignment.id}/invoices`, { method: 'POST', body: '{}' }) : await api(`/api/consignments/${consignment.id}/invoice-preview`);
    if (issue) {
      consignment.latest_invoice = { id: invoice.id, invoice_number: invoice.invoiceNumber, status: 'ISSUED', email_history: [] };
      renderDocumentActions(consignment);
    }
    renderInvoiceWindow(invoiceWindow, invoice.snapshot, invoice.invoiceNumber || 'DRAFT PREVIEW', issue, invoice.qrDataUrl);
  } catch (error) { invoiceWindow.close(); message(messageTarget, error.message); }
}

function renderInvoiceWindow(target, snapshot, invoiceNumber, printAfterLoad, qrDataUrl = null) {
  const money = value => new Intl.NumberFormat('en-IE', { style: 'currency', currency: snapshot.currency || 'EUR' }).format(value);
  const date = value => new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }).format(new Date(value));
  const lines = snapshot.items.map((item, index) => `<tr><td>${index + 1}</td><td><strong>${escapeHtml(item.description || 'Cargo item')}</strong></td><td>${item.height_cm} × ${item.width_cm} × ${item.depth_cm}</td><td>${item.quantity}</td><td>${(Number(item.cubic_per_item) * Number(item.quantity)).toFixed(3)}</td><td>${money(snapshot.ratePerCubic)}</td><td>${money(item.amount)}</td></tr>`).join('');
  const address = value => escapeHtml(value || '—').replace(/\n/g, '<br>');
  const pickup = { name: snapshot.customer.pickupContactName || snapshot.customer.name, address: snapshot.customer.germanAddress };
  const delivery = { name: snapshot.customer.deliveryContactName || snapshot.customer.name, address: snapshot.customer.sriLankanAddress };
  const accent = /^#[0-9a-f]{6}$/i.test(snapshot.business.accentColor || '') ? snapshot.business.accentColor : '#0D2B45';
  const accentRgb = [1, 3, 5].map(index => parseInt(accent.slice(index, index + 2), 16) / 255);
  const accentLuminance = accentRgb.map(channel => channel <= .03928 ? channel / 12.92 : ((channel + .055) / 1.055) ** 2.4).reduce((sum, channel, index) => sum + channel * [.2126, .7152, .0722][index], 0);
  const accentForeground = accentLuminance > .42 ? '#182536' : '#FFFFFF';
  const accentText = accentLuminance > .55 ? '#182536' : accent;
  const logo = snapshot.business.logo ? `<img class="business-logo" src="${escapeHtml(snapshot.business.logo)}" alt="${escapeHtml(snapshot.business.name)} logo">` : `<div class="logo-fallback">${escapeHtml(snapshot.business.name).slice(0, 3).toUpperCase()}</div>`;
  const statusLabel = { UNPAID: 'UNPAID', PARTIALLY_PAID: 'PARTIALLY PAID', PAID: 'PAID' }[snapshot.paymentStatus] || 'UNPAID';
  const businessContacts = [snapshot.business.phoneGermany, snapshot.business.phoneSriLanka, snapshot.business.email, snapshot.business.website].filter(Boolean).map(escapeHtml).join(' &nbsp;•&nbsp; ');
  const registration = [snapshot.business.registrationNumber && `Registration: ${escapeHtml(snapshot.business.registrationNumber)}`, snapshot.business.vatNumber && `VAT: ${escapeHtml(snapshot.business.vatNumber)}`].filter(Boolean).join(' &nbsp;•&nbsp; ');
  const bankDetails = [snapshot.business.bankName && `<p><span>Bank</span>${escapeHtml(snapshot.business.bankName)}</p>`, snapshot.business.accountHolder && `<p><span>Account holder</span>${escapeHtml(snapshot.business.accountHolder)}</p>`, snapshot.business.iban && `<p><span>IBAN</span>${escapeHtml(snapshot.business.iban)}</p>`, snapshot.business.bic && `<p><span>BIC / SWIFT</span>${escapeHtml(snapshot.business.bic)}</p>`].filter(Boolean).join('') || '<p>Payment details are available from the business.</p>';
  target.document.open();
  const qrSection = qrDataUrl ? `<div class="qr"><img src="${qrDataUrl}" alt="Invoice QR code"><span>Scan to view invoice</span></div>` : '<div class="preview-note">Draft preview</div>';
  const totalLabels = snapshot.items.reduce((sum, item) => sum + Number(item.quantity || 0), 0);
  const labelPages = qrDataUrl ? Array.from({ length: Math.ceil(totalLabels / 9) }, (_, pageIndex) => {
    const firstLabel = pageIndex * 9;
    const labels = Array.from({ length: Math.min(9, totalLabels - firstLabel) }, (_, labelIndex) => {
      const itemNumber = firstLabel + labelIndex + 1;
      return `<article class="qr-label"><strong class="qr-label-brand">${escapeHtml(snapshot.business.name)}</strong><img src="${qrDataUrl}" alt="QR code for customer ${escapeHtml(snapshot.customer.reference)} item ${itemNumber}"><strong class="qr-label-reference">${escapeHtml(snapshot.customer.reference)}</strong><strong class="qr-label-number">ITEM ${String(itemNumber).padStart(2, '0')}/${String(totalLabels).padStart(2, '0')}</strong></article>`;
    }).join('');
    return `<section class="qr-label-sheet" aria-label="QR labels ${firstLabel + 1} to ${Math.min(firstLabel + 9, totalLabels)}">${labels}</section>`;
  }).join('') : '';
  target.document.write(`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Invoice ${escapeHtml(invoiceNumber)}</title><style>
  .customer-reference{margin-top:18px;padding:11px 13px;border:1px solid #dce2e8;border-left:5px solid ${accent};border-radius:7px;background:#f7f9fa}.customer-reference small,.customer-reference strong{display:block}.customer-reference small{margin-bottom:4px;color:#778395;font-size:8px;font-weight:900;letter-spacing:.08em}.customer-reference strong{color:${accentText};font-size:22px}
  @page{size:A4;margin:10mm}*{box-sizing:border-box}body{margin:0;color:#182536;background:#eef1f4;font:11px Arial,sans-serif}.invoice{width:190mm;min-height:277mm;margin:18px auto;padding:12mm;background:#fff;box-shadow:0 5px 25px #1724381c}.header{display:grid;grid-template-columns:1.4fr .8fr;gap:22px;padding-bottom:18px;border-bottom:1px solid #d9e0e6}.brand-wrap{display:flex;gap:13px;align-items:flex-start}.business-logo,.logo-fallback{width:64px;height:64px;flex:0 0 64px;object-fit:contain}.logo-fallback{display:grid;place-items:center;color:${accentForeground};background:${accent};font-weight:900;clip-path:polygon(50% 0,95% 25%,95% 75%,50% 100%,5% 75%,5% 25%)}.business-name{margin:2px 0 3px;color:${accentText};font-size:21px;font-weight:900;letter-spacing:.02em;text-transform:uppercase}.tagline{margin-bottom:7px;color:#536174;font-size:10px}.contact{color:#536174;font-size:9px;line-height:1.55}.invoice-title{text-align:right}.invoice-title h1{margin:0;color:${accentText};font-size:34px;letter-spacing:.07em}.invoice-meta{display:grid;grid-template-columns:auto auto;gap:5px 13px;justify-content:end;margin-top:9px;line-height:1.4}.invoice-meta span:nth-child(odd){color:#758092}.status{display:inline-block;margin-top:10px;padding:5px 11px;border:1px solid ${snapshot.paymentStatus === 'PAID' ? '#66b991' : snapshot.paymentStatus === 'PARTIALLY_PAID' ? '#8fb8df' : '#d5aa57'};border-radius:6px;color:${snapshot.paymentStatus === 'PAID' ? '#087443' : snapshot.paymentStatus === 'PARTIALLY_PAID' ? '#2865a1' : '#9b5900'};font-size:9px;font-weight:900}.parties{display:grid;grid-template-columns:1fr 1fr;gap:13px;margin:18px 0 12px}.party{min-height:104px;padding:12px;border:1px solid #dce2e8;border-radius:7px}.eyebrow{margin:0 0 8px;color:#087d86;font-size:9px;font-weight:900;letter-spacing:.08em}.party h2{margin:0 0 6px;font-size:14px}.party p{margin:3px 0;color:#4f5d70;line-height:1.35}.shipment-strip{display:grid;grid-template-columns:1.25fr 1fr .7fr .9fr;margin-bottom:15px;border:1px solid #dce2e8;border-radius:7px;background:#f7f9fa}.shipment-strip div{padding:9px 11px;border-right:1px solid #dce2e8}.shipment-strip div:last-child{border:0}.shipment-strip small,.shipment-strip strong{display:block}.shipment-strip small{margin-bottom:3px;color:#778395;font-size:8px;text-transform:uppercase}.items{width:100%;border-collapse:collapse}.items th{padding:8px 6px;color:${accentForeground};background:${accent};font-size:8px;text-align:left;text-transform:uppercase}.items td{padding:8px 6px;border-bottom:1px solid #e1e6eb}.items tbody tr:nth-child(even){background:#f7f9fa}.items th:nth-child(n+3),.items td:nth-child(n+3){text-align:right}.bottom{display:grid;grid-template-columns:1fr .92fr;gap:22px;margin-top:18px}.bottom h3{margin:0 0 7px;color:#087d86;font-size:10px;letter-spacing:.07em}.notes p,.bank p{margin:4px 0;color:#526074;line-height:1.45}.bank{margin-top:15px}.bank p span{display:inline-block;width:86px;color:#758092}.summary{overflow:hidden;border:1px solid #d8dfe6;border-radius:7px}.summary div{display:flex;justify-content:space-between;padding:8px 11px;border-bottom:1px solid #e1e6eb}.summary .balance{padding:11px;color:${accentForeground};border:0;background:${accent};font-size:15px}.qr{display:flex;align-items:center;justify-content:flex-end;gap:8px;margin-top:12px;color:#536174;font-size:9px}.qr img{width:65px;height:65px}.preview-note{margin-top:12px;color:#8490a0;text-align:right}.footer{display:flex;justify-content:space-between;gap:15px;margin-top:22px;padding-top:9px;border-top:1px solid #dce2e8;color:#697688;font-size:8px}.footer span:last-child{text-align:right}@media print{html,body,.invoice,.invoice *{-webkit-print-color-adjust:exact!important;print-color-adjust:exact!important}body{background:#fff}.invoice{width:auto;min-height:auto;margin:0;padding:0;box-shadow:none}}@media(max-width:760px){.invoice{width:100%;min-height:100vh;margin:0;padding:20px}.header,.parties,.bottom{grid-template-columns:1fr}.invoice-title{text-align:left}.invoice-meta{justify-content:start}.shipment-strip{grid-template-columns:1fr 1fr}.items{font-size:9px}}
  .qr-label-sheet{display:grid;grid-template-columns:repeat(3,1fr);grid-template-rows:repeat(3,1fr);gap:4mm;width:190mm;min-height:277mm;margin:18px auto;padding:5mm;background:#fff;box-shadow:0 5px 25px #1724381c}.qr-label{display:flex;min-width:0;align-items:center;justify-content:center;flex-direction:column;padding:5mm 4mm;border:1px solid #d6d6d6;border-radius:3mm;text-align:center;break-inside:avoid}.qr-label-brand{margin-bottom:4mm;color:#111;font-size:11px;letter-spacing:.02em;text-transform:uppercase}.qr-label img{width:34mm;height:34mm;object-fit:contain}.qr-label-reference{margin-top:3mm;color:#050505;font-size:24px;line-height:1}.qr-label-number{margin-top:3mm;color:#111;font-size:13px;line-height:1}@media print{.qr-label-sheet,.qr-label-sheet *{-webkit-print-color-adjust:exact!important;print-color-adjust:exact!important}.qr-label-sheet{break-before:page;page-break-before:always;margin:0;box-shadow:none}}
  </style></head><body><main class="invoice"><header class="header"><div class="brand-wrap">${logo}<div><div class="business-name">${escapeHtml(snapshot.business.name)}</div><div class="tagline">${escapeHtml(snapshot.business.tagline)}</div><div class="contact">${businessContacts}<br>${[snapshot.business.germanAddress, snapshot.business.sriLankanAddress].filter(Boolean).map(escapeHtml).join(' &nbsp;•&nbsp; ')}${registration ? `<br>${registration}` : ''}</div></div></div><div class="invoice-title"><h1>INVOICE</h1><div class="invoice-meta"><span>Invoice No.</span><strong>${escapeHtml(invoiceNumber)}</strong><span>Issue Date</span><strong>${date(snapshot.issuedDate)}</strong><span>Due Date</span><strong>${date(snapshot.dueDate)}</strong></div><span class="status">${statusLabel}</span></div></header><section class="parties"><div class="party"><p class="eyebrow">BILL TO</p><h2>${escapeHtml(pickup.name)}</h2><p>${address(pickup.address)}</p><p>${escapeHtml(snapshot.customer.phoneGermany || '')}</p></div><div class="party"><p class="eyebrow">SHIP TO</p><h2>${escapeHtml(delivery.name)}</h2><p>${address(delivery.address)}</p><p>${escapeHtml(snapshot.customer.phoneSriLanka || '')}</p></div></section><section class="shipment-strip"><div><small>Route</small><strong>Germany → Sri Lanka</strong></div><div><small>Shipment</small><strong>${escapeHtml(snapshot.shipment.name)}</strong></div><div><small>Currency</small><strong>${escapeHtml(snapshot.currency)}</strong></div><div><small>Prepared By</small><strong>${escapeHtml(snapshot.business.contactName)}</strong></div></section><table class="items"><thead><tr><th>#</th><th>Description</th><th>Dimensions (cm)</th><th>Qty</th><th>Volume (m³)</th><th>Rate</th><th>Amount</th></tr></thead><tbody>${lines}</tbody></table><section class="bottom"><div><div class="notes"><h3>NOTES</h3><p>Thank you for choosing ${escapeHtml(snapshot.business.name)}. Please quote invoice <strong>${escapeHtml(invoiceNumber)}</strong> with your payment.</p><p>Payment terms: ${escapeHtml(snapshot.paymentTerms)}.</p></div><div class="bank"><h3>PAYMENT DETAILS</h3>${bankDetails}</div></div><div><section class="summary"><div><span>Subtotal</span><strong>${money(snapshot.itemsTotal)}</strong></div><div><span>Delivery charge</span><strong>${money(snapshot.deliveryCharge)}</strong></div><div><span>Discount</span><strong>−${money(snapshot.discount || 0)}</strong></div><div><span>Tax</span><strong>${money(0)}</strong></div><div><span>Total</span><strong>${money(snapshot.finalTotal)}</strong></div><div><span>Amount paid</span><strong>${money(snapshot.amountPaid || 0)}</strong></div><div class="balance"><span>BALANCE DUE</span><strong>${money(snapshot.balanceDue ?? snapshot.finalTotal)}</strong></div></section>${qrSection}</div></section><footer class="footer"><span>${escapeHtml(snapshot.business.name)}${businessContacts ? ` &nbsp;•&nbsp; ${businessContacts}` : ''}</span><span>Page 1 of 1</span></footer></main>${labelPages}${printAfterLoad ? '<script>window.onload=()=>window.print()</script>' : ''}</body></html>`);
  target.document.close();
  const referenceBox = target.document.createElement('section');
  referenceBox.className = 'customer-reference';
  referenceBox.innerHTML = `<small>CUSTOMER REFERENCE</small><strong>${escapeHtml(snapshot.customer.reference || '—')}</strong>`;
  target.document.querySelector('.parties').before(referenceBox);
  const customerId = target.document.createElement('p');
  customerId.innerHTML = `<strong>Customer ID:</strong> ${escapeHtml(snapshot.customer.identity || '—')}`;
  target.document.querySelector('.party h2').after(customerId);
}

window.addEventListener('popstate', () => dashboard());
dashboard();
