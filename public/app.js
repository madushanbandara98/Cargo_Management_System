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
  sidebarTop.insertAdjacentHTML('afterbegin', '<div class="dashboard-brand"><span class="dashboard-brand-mark" aria-hidden="true">◆</span><div><strong id="dashboard-business-name">Cargo Management</strong><small>Operations workspace</small></div></div>');
  try {
    const business = me.user.business_name || (await api('/api/public/business')).businessName;
    document.querySelector('#dashboard-business-name').textContent = business;
    document.title = `${business} · Dashboard`;
  } catch {}
  document.querySelector('#admin-name').textContent = me.user.username;
  document.querySelector('.profile-label').textContent = me.user.role === 'ADMIN' ? 'Administrator' : 'Team member';
  document.querySelector('.avatar').textContent = me.user.username.charAt(0).toUpperCase();
  document.querySelector('#logout').onclick = async () => { await api('/api/auth/logout', { method: 'POST' }); login(); };
  document.querySelector('#new-shipment').onclick = () => { setActiveNavigation('new-shipment'); showNewShipmentForm(); };
  document.querySelector('#current-shipment').onclick = () => { setActiveNavigation('current-shipment'); showCurrentShipments(); };
  document.querySelector('#settings').onclick = () => { setActiveNavigation('settings'); showProfileSettings(currentUser); };
  document.querySelector('#profile-settings-form').addEventListener('submit', saveProfileSettings);
  configureBusinessLogoUpload();
  document.querySelector('#cancel-business-settings').onclick = () => {
    fillProfileSettings(currentUser);
    showToast('Unsaved settings were reset.', 'success');
  };
  if (me.user.role === 'ADMIN') {
    const employeeButton = document.querySelector('#employees'); employeeButton.classList.remove('hidden'); employeeButton.onclick = () => { setActiveNavigation('employees'); showEmployeeManagement(); };
    const trackingButton = document.querySelector('#shipment-tracking'); trackingButton.classList.remove('hidden'); trackingButton.onclick = () => { setActiveNavigation('shipment-tracking'); showShipmentTracking(); };
    trackingButton.insertAdjacentHTML('afterend', '<button id="delivery-status" class="nav-button">Delivery status</button>');
    document.querySelector('#employees-panel').insertAdjacentHTML('beforebegin', '<section id="delivery-status-panel" class="hidden"><div class="page-heading"><h2>Delivery status</h2><p>Monitor customer deliveries updated by employees.</p></div><section class="card delivery-status-selector"><label>Shipment<select id="delivery-status-shipment"><option value="">Select shipment</option></select></label><span id="delivery-status-activation" class="delivery-status-activation hidden">Active</span></section><div id="delivery-status-content"><section class="card delivery-status-empty"><h3>Select a shipment</h3><p>Choose a shipment above to view its customer delivery progress.</p></section></div></section>');
    document.querySelector('#delivery-status').onclick = () => { setActiveNavigation('delivery-status'); showDeliveryStatus(); };
    const sidebarNavigation = document.querySelector('.sidebar-nav');
    sidebarNavigation.prepend(document.querySelector('#new-shipment'));
    sidebarNavigation.append(document.querySelector('#settings'));
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
  list.innerHTML = shipments.length ? shipments.map(s => `<article class="card shipment"><div><h3>${escapeHtml(s.name)}</h3><p>Created ${createdDate(s.created_at)} · ${s.consignment_count} ${s.consignment_count === 1 ? 'customer' : 'customers'}${currentUser?.role === 'ADMIN' ? ` · ${s.status === 'ACTIVE' ? 'Active' : 'Not active'}` : ''}</p></div><div class="shipment-actions"><button data-open-id="${s.id}">Open</button>${currentUser?.role === 'ADMIN' ? `<button class="shipment-activation ${s.status === 'ACTIVE' ? 'is-active' : ''}" data-status-id="${s.id}" data-next-status="${s.status === 'ACTIVE' ? 'OPEN' : 'ACTIVE'}">${s.status === 'ACTIVE' ? 'Deactivate' : 'Activate'}</button><button class="shipment-delete" data-delete-id="${s.id}" data-shipment-name="${escapeHtml(s.name)}">Delete</button>` : ''}</div></article>`).join('') : `<p>${currentUser?.role === 'ADMIN' ? 'No shipments yet. Create your first shipment.' : 'No active shipments are available.'}</p>`;
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
  if (currentUser?.role !== 'ADMIN') return openEmployeeShipment(shipment, pushHistory);
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
  panel.innerHTML = `<style>.shipment-page{padding:0;overflow:hidden}.customer-form{padding:1.5rem;background:#fff500}.customer-heading{text-align:center}.customer-heading h2{margin:0}.customer-heading p{margin:.25rem 0 1.25rem}.customer-grid{display:grid;grid-template-columns:repeat(6,minmax(0,1fr));gap:.8rem 1rem}.customer-grid .wide{grid-column:span 4}.customer-grid label:nth-child(5),.customer-grid label:nth-child(7){grid-column:span 2}.items-entered{display:flex;margin-top:1rem;align-items:center}.items-entered input{width:auto}.customer-actions{display:flex;justify-content:flex-end;gap:.75rem;margin-top:1rem}.saved-customers{padding:1rem 1.5rem;border-bottom:1px solid #d9dde5}.saved-customers h3,.delivery-items h3{margin:.1rem 0 .8rem}.saved-customers button{margin:0 .5rem .5rem 0}.customer-entry{display:inline-flex;align-items:center;margin:0 .5rem .5rem 0}.customer-entry button{margin:0}.customer-entry .remove-customer{border-radius:0 8px 8px 0;padding:.55rem .7rem;background:#f9dedc;color:#8a1c14}.customer-entry button:first-child{border-radius:8px 0 0 8px}.delivery-items{padding:1.5rem;background:#f4f5f7}.item-form{display:grid;grid-template-columns:repeat(4,minmax(100px,1fr)) 2fr auto;align-items:end;gap:.75rem}.item-form .description-field{grid-column:auto}.items-table{background:#fff;margin:1.25rem 0}.items-table th{white-space:nowrap}.empty-table{text-align:center;padding:1.25rem!important;color:#687086}.shipment-totals{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:1rem}.shipment-totals div{padding:.85rem;background:#fff;border:1px solid #cbd1dc;text-align:center}.shipment-totals span,.shipment-totals strong{display:block}.shipment-totals span{font-size:.82rem}.shipment-totals strong{margin-top:.3rem;font-size:1.15rem}@media(max-width:900px){.customer-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.customer-grid .wide,.customer-grid label:nth-child(5),.customer-grid label:nth-child(7){grid-column:span 1}.item-form{grid-template-columns:repeat(2,minmax(0,1fr))}.shipment-totals{grid-template-columns:repeat(2,minmax(0,1fr))}}@media(max-width:550px){.customer-grid,.item-form,.shipment-totals{grid-template-columns:1fr}.customer-actions{justify-content:stretch}.customer-actions button{flex:1}}</style><form id="consignment-form" class="customer-form"><div class="customer-heading"><h2>Customer delivery</h2><p>Add the customer and every item included in this shipment.</p></div><div class="customer-grid"><label>Customer reference<input name="customerRef" required></label><label>Customer name<input name="customerName" required></label><label>Customer ID<input name="customerId"></label><label class="wide">German address<input name="germanAddress"></label><label>Phone (DE)<input name="phoneDE"></label><label class="wide">Sri Lankan address<input name="sriLankanAddress"></label><label>Phone (LK)<input name="phoneLK"></label><label>Special price per m³ (€)<input name="ratePerCubic" type="number" min="0" step="0.01" value="530"></label><label>Delivery charge (€)<input name="deliveryCharge" type="number" min="0" step="0.01" value="0"></label></div><div class="customer-footer"><div class="customer-actions"><button>Save customer</button><button type="button" id="new-customer" class="secondary">New customer</button></div></div></form><section class="saved-customers"><h3>Customers in this shipment</h3><div id="consignments">${consignments.map(c => `<span class="customer-entry"><button class="secondary" data-consignment="${c.id}">${escapeHtml(c.customer_ref)} — ${escapeHtml(c.customer_name)}</button><button type="button" class="remove-customer" data-remove-consignment="${c.id}" data-customer-ref="${escapeHtml(c.customer_ref)}" aria-label="Remove ${escapeHtml(c.customer_ref)} from this shipment">Remove</button></span>`).join('') || '<p>No customers added yet.</p>'}</div></section><div id="item-editor"><p class="item-empty-state">Save or load a customer to add delivery items.</p></div><div class="shipment-completion"><label class="items-entered"><input name="allItemsEntered" form="consignment-form" type="checkbox"> All items are entered</label></div>`;
  panel.querySelector('#consignments').innerHTML = consignments.length ? `<details id="customer-list-panel" class="customer-list-panel" open><summary><span>Customer list <span class="customer-count">${consignments.length}</span></span><span class="list-chevron" aria-hidden="true">⌄</span></summary><div class="customer-list-content"><label class="customer-search">Search customers<input id="customer-search" type="search" placeholder="Reference or name"></label><div class="customer-list">${consignments.map(c => `<div class="customer-row" data-customer-search="${escapeHtml(`${c.customer_ref} ${c.customer_name}`.toLowerCase())}"><button type="button" class="customer-load" data-consignment="${c.id}"><span><strong>${escapeHtml(c.customer_ref)} — ${escapeHtml(c.customer_name)}</strong><small>Load customer delivery</small></span><span class="load-arrow" aria-hidden="true">›</span></button><details class="customer-menu"><summary aria-label="Actions for ${escapeHtml(c.customer_ref)}">⋮</summary><button type="button" data-remove-consignment="${c.id}" data-customer-ref="${escapeHtml(c.customer_ref)}">Remove from shipment</button></details></div>`).join('')}</div></div></details>` : '<p>No customers added yet.</p>';
  panel.querySelector('style').textContent += `.shipment-page{margin-top:1rem;border-radius:16px}.customer-form{display:block;padding:clamp(1rem,3vw,2rem)}.customer-heading{margin-bottom:1.5rem}.customer-heading p{margin-bottom:0}.customer-grid{gap:1rem 1.25rem}.customer-grid label:nth-child(-n+3){grid-column:span 2}.customer-grid label:nth-child(8),.customer-grid label:nth-child(9){grid-column:span 2}.items-entered{margin-top:1.25rem}.customer-actions{margin-top:1.5rem}.saved-customers{padding:1.25rem clamp(1rem,3vw,2rem)}.delivery-items{padding:clamp(1rem,3vw,2rem)}.item-form{margin-top:1rem}.shipment-totals{margin-top:1.25rem}.items-table{display:block;overflow-x:auto}.items-table th,.items-table td{white-space:nowrap}@media(max-width:900px){.customer-grid label:nth-child(-n+3),.customer-grid label:nth-child(8),.customer-grid label:nth-child(9),.customer-grid .wide,.customer-grid label:nth-child(5),.customer-grid label:nth-child(7){grid-column:span 1}}@media(max-width:600px){.shipment-page{margin-top:.5rem;border-radius:12px}.customer-grid,.item-form,.shipment-totals{grid-template-columns:1fr}.customer-actions{display:grid;grid-template-columns:1fr 1fr}.customer-actions button{width:100%}.items-table{font-size:.86rem}.items-table th,.items-table td{padding:.5rem}}`;
  panel.querySelector('style').textContent += `.customer-form,.customer-grid,.items-entered,.customer-actions{height:auto!important;min-height:0!important;align-content:start!important}.customer-grid{grid-auto-rows:auto!important;row-gap:1rem!important}.customer-grid label,.items-entered,.customer-actions{margin-bottom:0!important}.customer-actions{padding:0!important}.saved-customers{min-height:0!important}.saved-customers p{margin:.5rem 0 0}.delivery-items{margin-top:0!important}@media(min-width:901px){.customer-grid{column-gap:1.5rem!important}.customer-actions{margin-top:1.25rem!important}}`;
  panel.querySelector('style').textContent += `.item-form{display:grid!important;grid-template-columns:repeat(4,minmax(7rem,1fr)) minmax(14rem,2fr) max-content!important;column-gap:1.5rem!important;row-gap:1rem!important}.item-form label{min-width:0}.item-form button{align-self:end;white-space:nowrap}@media(max-width:1100px){.item-form{grid-template-columns:repeat(3,minmax(8rem,1fr))!important}.item-form .description-field{grid-column:span 2!important}}@media(max-width:700px){.item-form{grid-template-columns:repeat(2,minmax(0,1fr))!important;column-gap:1rem!important}.item-form .description-field{grid-column:span 2!important}.item-form button{grid-column:span 2;width:100%}}@media(max-width:420px){.item-form,.item-form .description-field,.item-form button{grid-template-columns:1fr!important;grid-column:span 1!important}}`;
  panel.querySelector('style').textContent += `.item-form input{width:100%!important;min-width:0!important}.item-form label{width:100%;overflow:hidden}@media(min-width:701px){.items-table{display:table!important;width:100%!important;overflow:visible!important;table-layout:auto}.items-table th,.items-table td{white-space:normal}}@media(max-width:700px){.items-table{display:block;width:100%;overflow-x:auto;white-space:nowrap}}`;
  panel.querySelector('style').textContent += `.customer-list{border:1px solid #d9dde5;border-radius:10px;overflow:visible}.customer-row{display:flex;align-items:center;border-bottom:1px solid #e7e9ef;background:#fff}.customer-row:last-child{border-bottom:0}.customer-load{flex:1;display:flex;align-items:center;justify-content:space-between;text-align:left;background:transparent;color:#1d2433;border-radius:0;margin:0!important;padding:.8rem 1rem}.customer-load:hover,.customer-load:focus-visible{background:#fff8c7}.customer-load small{display:block;margin-top:.15rem;color:#687086;font-weight:500}.load-arrow{font-size:1.75rem;color:#687086}.customer-menu{position:relative;margin-right:.5rem}.customer-menu summary{list-style:none;cursor:pointer;border-radius:7px;padding:.35rem .65rem;font-size:1.4rem;line-height:1;color:#4e5668}.customer-menu summary::-webkit-details-marker{display:none}.customer-menu[open] summary{background:#e8ebf0}.customer-menu button{position:absolute;z-index:2;right:0;top:2.4rem;width:max-content;margin:0!important;background:#fff;color:#a72a22;border:1px solid #f2c5c1;box-shadow:0 6px 18px #25304722}.customer-menu button:hover{background:#fce8e6}@media(max-width:600px){.customer-load{padding:.75rem}.customer-load small{font-size:.78rem}}`;
  panel.querySelector('style').textContent += `.customer-list-panel{border:1px solid #d9dde5;border-radius:10px;background:#fff}.customer-list-panel>summary{display:flex;justify-content:space-between;align-items:center;cursor:pointer;padding:.85rem 1rem;font-weight:700;list-style:none}.customer-list-panel>summary::-webkit-details-marker{display:none}.customer-list-panel[open]>summary{border-bottom:1px solid #d9dde5}.list-chevron{font-size:1.35rem;transition:transform .15s}.customer-list-panel[open] .list-chevron{transform:rotate(180deg)}.customer-count{display:inline-grid;place-items:center;min-width:1.5rem;height:1.5rem;margin-left:.35rem;border-radius:999px;background:#e8ebf0;font-size:.78rem}.customer-list-content{padding:1rem}.customer-search{display:grid;gap:.35rem;margin:0 0 .75rem;font-size:.85rem}.customer-search input{width:100%}`;
  showDraftItemStarter(panel);
  const customerActions = panel.querySelector('.customer-actions');
  customerActions.querySelector('button:not([type="button"])').setAttribute('form', 'consignment-form');
  const pageActionBar = document.createElement('footer');
  pageActionBar.className = 'page-action-bar';
  pageActionBar.append(customerActions);
  panel.append(pageActionBar);
  renderDocumentActions();
  enableCustomerAutofill(panel.querySelector('#consignment-form'));
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
      const values = { customerName:customer.customer_name, customerId:customer.customer_id, germanAddress:customer.german_address, sriLankanAddress:customer.sri_lankan_address, phoneDE:customer.phone_de, phoneLK:customer.phone_lk };
      Object.entries(values).forEach(([key, fieldValue]) => form.elements[key].value = fieldValue || '');
    } catch (error) {
      if (error.message !== 'Customer not found.') message(form, error.message);
    }
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
  const fields = ['customerRef', 'customerName', 'customerId', 'germanAddress', 'phoneDE', 'sriLankanAddress', 'phoneLK', 'ratePerCubic', 'deliveryCharge'].map(name => form.elements[name]);
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
  </form>`;
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

async function showEmployeeManagement() {
  stopDeliveryStatusRefresh();
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
    document.querySelector('#admin-name').textContent = user.username;
    document.querySelector('.avatar').textContent = user.username.charAt(0).toUpperCase();
    document.querySelector('#dashboard-business-name').textContent = user.business_name || 'Cargo Management';
    document.title = `${user.business_name || 'Cargo Management'} · Settings`;
    showToast('Business settings saved.');
  } catch (error) { message(form, error.message); }
}

function fillForm(c) { const form = document.querySelector('#consignment-form'); const values = { customerRef:c.customer_ref, customerName:c.customer_name, customerId:c.customer_identity, germanAddress:c.german_address, sriLankanAddress:c.sri_lankan_address, phoneDE:c.phone_de, phoneLK:c.phone_lk, ratePerCubic:c.rate_per_cubic, deliveryCharge:c.delivery_charge }; Object.entries(values).forEach(([key,value]) => form.elements[key].value = value || ''); if (form.elements.allItemsEntered) form.elements.allItemsEntered.checked = Boolean(c.all_items_entered); }

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
  editor.innerHTML = `<section class="delivery-items draft-delivery-items"><h3>Delivery items — Draft customer</h3><p class="draft-notice">These items will be saved together when you click <strong>Save customer</strong>.</p><form id="draft-item-form" class="item-form"><label>Height (cm)<input name="height" type="number" min="0.01" step="0.01" required value="${editingItem?.height ?? ''}"></label><label>Width (cm)<input name="width" type="number" min="0.01" step="0.01" required value="${editingItem?.width ?? ''}"></label><label>Depth (cm)<input name="depth" type="number" min="0.01" step="0.01" required value="${editingItem?.depth ?? ''}"></label><label>No. items<input name="quantity" type="number" min="1" step="1" required value="${editingItem?.quantity ?? ''}"></label><label class="description-field">Description<input name="description" value="${escapeHtml(editingItem?.description ?? '')}"></label><button>${editingItem ? 'Save item changes' : 'Add item'}</button>${editingItem ? '<button type="button" id="cancel-draft-edit" class="secondary">Cancel</button>' : ''}</form><table class="table items-table"><thead><tr><th>No.</th><th>Height</th><th>Width</th><th>Depth</th><th>Items</th><th>Cubic meter (m³)</th><th>Amount (€)</th><th>Description</th><th></th></tr></thead><tbody>${calculatedItems.map((item, index) => `<tr><td>${index + 1}</td><td>${item.height}</td><td>${item.width}</td><td>${item.depth}</td><td>${item.quantity}</td><td>${item.cubicPerItem.toFixed(3)}</td><td>€${item.amount.toFixed(2)}</td><td>${escapeHtml(item.description)}</td><td><button type="button" class="secondary" data-edit-draft-item="${index}">Edit</button> <button type="button" class="secondary" data-remove-draft-item="${index}">Remove</button></td></tr>`).join('') || '<tr><td colspan="9" class="empty-table">No draft items added yet.</td></tr>'}</tbody></table><div class="shipment-totals"><div><span>Total cubic (m³)</span><strong>${totalCubic.toFixed(3)}</strong></div><div><span>Total items</span><strong>${totalItems}</strong></div><div><span>Total (€)</span><strong>€${totalAmount.toFixed(2)}</strong></div><div><span>Delivery charge (€)</span><strong>€${deliveryCharge.toFixed(2)}</strong></div><div><span>Final total (€)</span><strong>€${(totalAmount + deliveryCharge).toFixed(2)}</strong></div></div></section>`;
  const completion = document.createElement('div');
  completion.className = 'shipment-completion';
  completion.innerHTML = `<label class="items-entered"><input name="allItemsEntered" form="consignment-form" type="checkbox" ${completionChecked ? 'checked' : ''}> All items are entered</label>`;
  editor.querySelector('.items-table').after(completion);
  renderDocumentActions();
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

function renderItems() { const editor = document.querySelector('#item-editor'); const c = activeConsignment; const editingItem = c.items.find(item => item.id === editingItemId); if (!editingItem) editingItemId = null; editor.innerHTML = `<section class="delivery-items"><h3>Delivery items — ${escapeHtml(c.customer_ref)}</h3><form id="item-form" class="item-form"><label>Height (cm)<input name="height" type="number" min="0.01" step="0.01" required value="${editingItem?.height_cm ?? ''}"></label><label>Width (cm)<input name="width" type="number" min="0.01" step="0.01" required value="${editingItem?.width_cm ?? ''}"></label><label>Depth (cm)<input name="depth" type="number" min="0.01" step="0.01" required value="${editingItem?.depth_cm ?? ''}"></label><label>No. items<input name="quantity" type="number" min="1" step="1" required value="${editingItem?.quantity ?? ''}"></label><label class="description-field">Description<input name="description" value="${escapeHtml(editingItem?.description ?? '')}"></label><button>${editingItem ? 'Save changes' : 'Add item'}</button>${editingItem ? '<button type="button" id="cancel-item-edit" class="secondary">Cancel</button>' : ''}</form><table class="table items-table"><thead><tr><th>No.</th><th>Height</th><th>Width</th><th>Depth</th><th>Items</th><th>Cubic meter (m³)</th><th>Amount (€)</th><th>Description</th><th></th></tr></thead><tbody>${c.items.map((i, index) => `<tr><td>${index + 1}</td><td>${i.height_cm}</td><td>${i.width_cm}</td><td>${i.depth_cm}</td><td>${i.quantity}</td><td>${i.cubic_per_item.toFixed(3)}</td><td>€${i.amount.toFixed(2)}</td><td>${escapeHtml(i.description)}</td><td><button class="secondary" data-edit-item="${i.id}">Edit</button> <button class="secondary" data-remove-item="${i.id}">Remove</button></td></tr>`).join('') || '<tr><td colspan="9" class="empty-table">No delivery items added yet.</td></tr>'}</tbody></table><div class="shipment-totals"><div><span>Total cubic (m³)</span><strong>${c.total_cubic.toFixed(3)}</strong></div><div><span>Total items</span><strong>${c.total_items}</strong></div><div><span>Total (€)</span><strong>€${c.total_amount.toFixed(2)}</strong></div><div><span>Delivery charge (€)</span><strong>€${c.delivery_charge.toFixed(2)}</strong></div><div><span>Final total (€)</span><strong>€${c.final_total.toFixed(2)}</strong></div></div></section>`;
  let completion = document.querySelector('.shipment-completion');
  if (!completion) {
    completion = document.createElement('div');
    completion.className = 'shipment-completion';
    completion.innerHTML = '<label class="items-entered"><input name="allItemsEntered" form="consignment-form" type="checkbox"> All items are entered</label>';
  }
  completion.querySelector('input').checked = Boolean(c.all_items_entered);
  editor.querySelector('.items-table').after(completion);
  renderDocumentActions(c);
  const itemForm = editor.querySelector('#item-form'); enableItemEnterNavigation(itemForm); itemForm.addEventListener('submit', async event => { event.preventDefault(); try { const path = editingItemId ? `/api/items/${editingItemId}` : `/api/consignments/${c.id}/items`; activeConsignment = await api(path, { method: editingItemId ? 'PUT' : 'POST', body:JSON.stringify(Object.fromEntries(new FormData(event.currentTarget))) }); editingItemId = null; renderItems(); } catch(error) { message(event.currentTarget,error.message); } }); editor.querySelector('#cancel-item-edit')?.addEventListener('click', () => { editingItemId = null; renderItems(); }); editor.querySelectorAll('[data-edit-item]').forEach(button => button.onclick = () => { editingItemId = button.dataset.editItem; renderItems(); }); editor.querySelectorAll('[data-remove-item]').forEach(button => button.onclick = async () => { activeConsignment = await api(`/api/items/${button.dataset.removeItem}`, { method:'DELETE' }); if (editingItemId === button.dataset.removeItem) editingItemId = null; renderItems(); }); }

function renderDocumentActions(consignment = null) {
  const pageActionBar = document.querySelector('.page-action-bar');
  if (!pageActionBar) return;
  pageActionBar.querySelector('.payment-information')?.remove();
  pageActionBar.querySelector('.invoice-actions')?.remove();
  renderPaymentInformation(pageActionBar, consignment);
  const invoiceActions = document.createElement('div');
  invoiceActions.className = 'invoice-actions';
  invoiceActions.innerHTML = `<button type="button" id="preview-invoice" class="secondary" ${consignment ? '' : 'disabled'}>Preview invoice</button><button type="button" id="download-packing-list" class="secondary" ${consignment ? '' : 'disabled'}>Download packing list</button><button type="button" id="issue-invoice" ${consignment ? '' : 'disabled'}>Print invoice</button>`;
  pageActionBar.append(invoiceActions);
  if (!consignment) return;
  invoiceActions.querySelector('#preview-invoice').onclick = () => openInvoice(consignment, false, document.querySelector('#item-editor'));
  invoiceActions.querySelector('#download-packing-list').onclick = () => window.open(`/api/consignments/${consignment.id}/packing-list`, '_blank');
  invoiceActions.querySelector('#issue-invoice').onclick = () => openInvoice(consignment, true, document.querySelector('#item-editor'));
}

function renderPaymentInformation(pageActionBar, consignment) {
  const payment = document.createElement('section');
  payment.className = 'payment-information';
  const total = Number(consignment?.final_total || 0);
  const paid = Number(consignment?.amount_paid || 0);
  const balance = Number(consignment?.balance_due ?? total);
  const status = consignment?.payment_status || 'UNPAID';
  const statusLabel = { UNPAID: 'Unpaid', PARTIALLY_PAID: 'Partially Paid', PAID: 'Paid' }[status];
  const today = new Date().toISOString().slice(0, 10);
  payment.innerHTML = `<h3>Payment Information</h3><form class="payment-form"><label>Payment Method<select name="method" ${!consignment || status === 'PAID' ? 'disabled' : ''}><option value="BANK_TRANSFER">Bank Transfer</option><option value="CASH">Cash</option><option value="CARD">Card</option><option value="OTHER">Other</option></select></label><label>Invoice Total<input value="€${total.toFixed(2)}" readonly></label><label>Amount Paid<input name="amount" type="number" min="0.01" max="${balance.toFixed(2)}" step="0.01" placeholder="€0.00" ${!consignment || status === 'PAID' ? 'disabled' : ''}></label><label>Balance Due<input value="€${balance.toFixed(2)}" readonly></label><label>Payment Status<span class="payment-status status-${status.toLowerCase()}">${statusLabel}</span></label><label>Payment Date<input name="paymentDate" type="date" value="${today}" ${!consignment || status === 'PAID' ? 'disabled' : ''}></label><label>Payment Reference<input name="reference" maxlength="100" placeholder="Transaction reference" ${!consignment || status === 'PAID' ? 'disabled' : ''}></label><button ${!consignment || status === 'PAID' ? 'disabled' : ''}>Record Payment</button></form><div class="payment-information-footer"><button type="button" class="payment-history-link" ${consignment ? '' : 'disabled'}>View payment history (${consignment?.payments?.length || 0})</button><span>Balance is calculated automatically.</span></div>`;
  pageActionBar.append(payment);
  if (!consignment) return;
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
async function openInvoice(consignment, issue, messageTarget) {
  const invoiceWindow = window.open('', '_blank');
  if (!invoiceWindow) return message(messageTarget, 'Allow pop-ups to preview or print an invoice.');
  invoiceWindow.document.write('<title>Preparing invoice…</title><p style="font-family:system-ui;padding:2rem">Preparing invoice…</p>');
  try {
    const invoice = issue ? await api(`/api/consignments/${consignment.id}/invoices`, { method: 'POST', body: '{}' }) : await api(`/api/consignments/${consignment.id}/invoice-preview`);
    renderInvoiceWindow(invoiceWindow, invoice.snapshot, invoice.invoiceNumber || 'DRAFT PREVIEW', issue, invoice.qrDataUrl);
  } catch (error) { invoiceWindow.close(); message(messageTarget, error.message); }
}

function renderInvoiceWindow(target, snapshot, invoiceNumber, printAfterLoad, qrDataUrl = null) {
  const money = value => new Intl.NumberFormat('en-IE', { style: 'currency', currency: snapshot.currency || 'EUR' }).format(value);
  const lines = snapshot.items.map((item, index) => `<tr><td>${index + 1}</td><td>${escapeHtml(item.description || 'Cargo item')}</td><td>${item.height_cm} × ${item.width_cm} × ${item.depth_cm} cm</td><td>${item.quantity}</td><td>${item.cubic_per_item.toFixed(3)}</td><td>${money(item.amount)}</td></tr>`).join('');
  const customerAddress = escapeHtml(snapshot.customer.address || '—').replace(/\n/g, '<br>');
  const businessAddress = escapeHtml(snapshot.business.address || '').replace(/\n/g, '<br>');
  target.document.open();
  const qrSection = qrDataUrl ? `<div class="qr"><img src="${qrDataUrl}" alt="Delivery details QR code"><div><strong>Delivery details</strong><br>Scan for customer and item information.</div></div>` : '';
  target.document.write(`<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Invoice ${escapeHtml(invoiceNumber)}</title><style>@page{size:A4;margin:14mm}*{box-sizing:border-box}body{font-family:Arial,sans-serif;color:#20283a;margin:0;font-size:12px}.invoice{max-width:182mm;margin:auto}.header{display:flex;justify-content:space-between;gap:2rem;padding-bottom:18px;border-bottom:5px solid #f0d405}.brand{font-size:26px;font-weight:800}.brand span{color:#d6ae00}.tagline{color:#687086;margin-top:5px}.title{text-align:right}.title h1{margin:0;font-size:32px;letter-spacing:.05em}.meta{margin-top:8px;line-height:1.7}.info{display:grid;grid-template-columns:1fr 1fr;gap:18px;margin:22px 0}.info h2{font-size:14px;margin:0 0 8px}.box{border:1px solid #d9dde5;border-radius:8px;padding:12px;min-height:108px}.box p{margin:3px 0;line-height:1.4}.table{width:100%;border-collapse:collapse;margin-top:10px}.table th{background:#f2f3f5;text-align:left}.table th,.table td{padding:8px;border:1px solid #d9dde5}.table td:nth-child(4),.table td:nth-child(5),.table td:nth-child(6){text-align:right}.summary{margin:18px 0 0 auto;width:48%;border:1px solid #d9dde5}.summary div{display:flex;justify-content:space-between;padding:8px 10px;border-bottom:1px solid #d9dde5}.summary div:last-child{border:0;background:#f0d405;font-size:16px;font-weight:800}.notes{display:flex;justify-content:space-between;gap:1rem;margin-top:28px;padding-top:14px;border-top:1px solid #d9dde5}.notes h3{margin:0 0 6px;font-size:13px}.qr{display:flex;align-items:center;gap:10px;text-align:right}.qr img{width:72px;height:72px}.footer{text-align:center;color:#687086;margin-top:25px;font-size:11px}</style></head><body><main class="invoice"><header class="header"><div><div class="brand"><span>${escapeHtml(snapshot.business.name)}</span></div><div class="tagline">Cargo delivery invoice</div></div><div class="title"><h1>INVOICE</h1><div class="meta"><strong>${escapeHtml(invoiceNumber)}</strong><br>Issue date: ${escapeHtml(snapshot.issuedDate)}<br>Terms: ${escapeHtml(snapshot.paymentTerms)}</div></div></header><section class="info"><div class="box"><h2>Bill to</h2><p><strong>${escapeHtml(snapshot.customer.name)}</strong></p><p>Customer ref: ${escapeHtml(snapshot.customer.reference)}</p><p>${customerAddress}</p><p>${escapeHtml(snapshot.customer.phone || '')}</p></div><div class="box"><h2>Shipment details</h2><p><strong>${escapeHtml(snapshot.shipment.name)}</strong></p><p>Shipment ref: ${escapeHtml(snapshot.shipment.reference)}</p><p>Total items: ${snapshot.totalItems}</p><p>Total volume: ${Number(snapshot.totalCubic).toFixed(3)} m³</p></div></section><table class="table"><thead><tr><th>#</th><th>Description</th><th>Dimensions</th><th>Qty</th><th>m³/item</th><th>Amount</th></tr></thead><tbody>${lines}</tbody></table><section class="summary"><div><span>Items total</span><strong>${money(snapshot.itemsTotal)}</strong></div><div><span>Delivery charge</span><strong>${money(snapshot.deliveryCharge)}</strong></div><div><span>Total due</span><strong>${money(snapshot.finalTotal)}</strong></div></section><section class="notes"><div><h3>Payment instructions</h3><p>${escapeHtml(snapshot.paymentTerms)}. Please include invoice number <strong>${escapeHtml(invoiceNumber)}</strong> as your payment reference.</p><p>${businessAddress}${snapshot.business.phone ? `<br>${escapeHtml(snapshot.business.phone)}` : ''}${snapshot.business.email ? `<br>${escapeHtml(snapshot.business.email)}` : ''}</p></div>${qrSection}</section><footer class="footer">Thank you for choosing ${escapeHtml(snapshot.business.name)}.</footer></main>${printAfterLoad ? '<script>window.onload=()=>window.print()</script>' : ''}</body></html>`);
  target.document.close();
}

window.addEventListener('popstate', () => dashboard());
dashboard();
