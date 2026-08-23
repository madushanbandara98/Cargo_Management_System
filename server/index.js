import 'dotenv/config';
import crypto from 'node:crypto';
import express from 'express';
import cookieParser from 'cookie-parser';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import QRCode from 'qrcode';
import PDFDocument from 'pdfkit';
import { connectMongo } from './mongo/connection.js';
import { User, Container, Customer, Consignment, BoxItem, Invoice, Document, Payment, ShipmentTracking, TrackingEvent, nextMongoSourceId } from './mongo/models.js';
import { createTrackingProvider, normalizeTrackingStatus, trackingProviderName } from './tracking/providers.js';

const app = express();
const serverStartedAt = new Date();
const recentServerErrors = [];
app.set('trust proxy', 1);
app.use(express.json({ limit: '3mb' }));
app.use(cookieParser());
app.use(async (req, res, next) => {
  try {
    await connectMongo();
    next();
  } catch (error) { next(error); }
});

function jwtSecret() {
  const secret = process.env.JWT_SECRET?.trim();
  if (!secret || secret.length < 32) throw new Error('JWT_SECRET must be set to at least 32 characters.');
  return secret;
}

function publicUser(user) {
  return {
    id: user._id.toString(), username: user.username, role: user.role,
    full_name: user.fullName, business_name: user.businessName, phone: user.phone,
    business_tagline: user.businessTagline, registration_number: user.registrationNumber,
    vat_number: user.vatNumber, business_logo: user.businessLogo,
    phone_sri_lanka: user.phoneSriLanka, email: user.email, website: user.website,
    business_address: user.businessAddress, sri_lankan_address: user.sriLankanAddress,
    default_currency: user.defaultCurrency, invoice_prefix: user.invoicePrefix,
    payment_terms_days: user.paymentTermsDays, invoice_accent_color: user.invoiceAccentColor,
    bank_name: user.bankName, account_holder: user.accountHolder, iban: user.iban, bic: user.bic
  };
}

async function sessionUser(req) {
  const token = req.cookies.cargo_session;
  if (!token) return null;
  let payload;
  try { payload = jwt.verify(token, jwtSecret(), { algorithms: ['HS256'] }); }
  catch { return null; }
  const user = await User.findById(payload.sub);
  if (user && Number(payload.sessionVersion || 0) !== Number(user.sessionVersion || 0)) return null;
  return user && user.enabled !== false ? publicUser(user) : null;
}

async function requireAuth(req, res, next) {
  try {
    const user = await sessionUser(req);
    if (!user) return res.status(401).json({ error: 'Authentication required.' });
    req.user = user;
    next();
  } catch (error) { next(error); }
}

function requireAdmin(req, res, next) {
  if (!['OWNER', 'ADMIN'].includes(req.user.role)) return res.status(403).json({ error: 'Administrator access required.' });
  next();
}

function requireOwner(req, res, next) {
  if (req.user.role !== 'OWNER') return res.status(403).json({ error: 'System Owner access required.' });
  next();
}

function text(value, name, { required = false } = {}) {
  const result = String(value ?? '').trim();
  if (required && !result) throw new Error(`${name} is required.`);
  return result;
}

function email(value, name, { required = false } = {}) {
  const result = text(value, name, { required });
  if (result && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(result)) throw new Error(`${name} must be a valid email address.`);
  return result.toLowerCase();
}

function number(value, name, { min = 0, integer = false } = {}) {
  const result = Number(value);
  if (!Number.isFinite(result) || result < min || (integer && !Number.isInteger(result))) {
    throw new Error(`${name} must be a valid ${integer ? 'whole ' : ''}number.`);
  }
  return result;
}

function containerNumber(value) {
  const normalized = text(value, 'Container number', { required: true }).replace(/[\s-]/g, '').toUpperCase();
  if (!/^[A-Z]{4}\d{7}$/.test(normalized)) throw new Error('Enter a valid container number with 4 letters and 7 digits.');
  const letterValue = letter => {
    const raw = letter.charCodeAt(0) - 55;
    return raw + Math.floor((raw - 1) / 10);
  };
  const characters = normalized.slice(0, 10);
  const total = [...characters].reduce((sum, character, index) => {
    const value = /\d/.test(character) ? Number(character) : letterValue(character);
    return sum + value * (2 ** index);
  }, 0);
  const expected = (total % 11) % 10;
  if (expected !== Number(normalized[10])) throw new Error('The container number check digit is incorrect.');
  return normalized;
}

function presentTracking(row, events = []) {
  return {
    id: row._id.toString(), container_number: row.containerNumber, carrier: row.carrier, tracking_url: row.trackingUrl,
    origin: row.origin, destination: row.destination, vessel: row.vessel,
    latest_status: row.latestStatus, status: row.status, eta: row.eta,
    provider: row.provider || 'manual', provider_reference_id: row.providerReferenceId || '',
    carrier_code: row.carrierCode || '', sync_status: row.syncStatus || 'MANUAL',
    last_synced_at: row.lastSyncedAt || null, provider_error: row.providerError || '',
    created_at: row.createdAt, updated_at: row.updatedAt,
    events: events.map(event => ({
      id: event._id.toString(), provider_event_id: event.providerEventId,
      event_code: event.eventCode, status: event.normalizedStatus,
      description: event.description, sort_order: event.sortOrder, event_time: event.eventTime,
      is_estimated: event.isEstimated, location: event.location,
      facility: event.facility, vessel: event.vessel, voyage: event.voyage,
      transport_mode: event.transportMode
    }))
  };
}

async function trackingEventsFor(records) {
  const events = await TrackingEvent.find({ tracking: { $in: records.map(record => record._id) } }).sort({ sortOrder: 1, eventTime: 1, receivedAt: 1 }).lean();
  const grouped = new Map();
  events.forEach(event => {
    const key = event.tracking.toString();
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key).push(event);
  });
  return grouped;
}

async function updateTrackingProjection(record) {
  const events = await TrackingEvent.find({ tracking: record._id }).sort({ sortOrder: 1, eventTime: 1, receivedAt: 1 }).lean();
  const actualEvents = events.filter(event => !event.isEstimated);
  const latest = actualEvents.at(-1);
  const estimatedArrival = events.find(event => event.isEstimated && event.eventCode === 'ARRIVAL' && event.eventTime > new Date());
  const vesselEvent = [...actualEvents].reverse().find(event => event.vessel);
  const locations = events.filter(event => event.location);
  if (latest) {
    record.latestStatus = latest.description;
    record.status = latest.normalizedStatus;
  }
  record.origin = locations[0]?.location || record.origin;
  record.destination = locations.at(-1)?.location || record.destination;
  record.vessel = vesselEvent?.vessel || record.vessel;
  record.eta = estimatedArrival?.eventTime || record.eta;
  record.updatedAt = new Date();
  record.lastSyncedAt = new Date();
  record.syncStatus = record.provider === 'manual' ? 'MANUAL' : record.status === 'DELIVERED' ? 'COMPLETED' : 'ACTIVE';
  record.providerError = '';
  await record.save();
  return events;
}

async function ingestTrackingEvents(record, provider, events) {
  const receivedAt = new Date();
  for (const [index, source] of events.entries()) {
    const eventTime = new Date(source.eventTime);
    if (!source.providerEventId || !source.eventCode || !source.description || Number.isNaN(eventTime.getTime())) throw new Error('Tracking provider returned an invalid event.');
    await TrackingEvent.findOneAndUpdate({ provider, providerEventId: String(source.providerEventId) }, {
      tracking: record._id, provider, providerEventId: String(source.providerEventId),
      eventCode: String(source.eventCode).toUpperCase(), normalizedStatus: normalizeTrackingStatus(source),
      description: String(source.description), sortOrder: Number.isFinite(Number(source.sortOrder)) ? Number(source.sortOrder) : index,
      eventTime, isEstimated: Boolean(source.isEstimated),
      location: String(source.location || ''), facility: String(source.facility || ''),
      vessel: String(source.vessel || ''), voyage: String(source.voyage || ''),
      transportMode: String(source.transportMode || ''), rawPayload: source, receivedAt
    }, { upsert: true, new: true, runValidators: true });
  }
  return updateTrackingProjection(record);
}

function secureTokenMatches(actual, expected) {
  const left = Buffer.from(String(actual || ''));
  const right = Buffer.from(String(expected || ''));
  return left.length === right.length && left.length > 0 && crypto.timingSafeEqual(left, right);
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character]));
}

async function presentConsignment(id) {
  const summary = await Consignment.findById(id).populate('container customer deliveredBy').lean();
  if (!summary) return null;
  const rawItems = await BoxItem.find({ consignment: summary._id }).sort({ createdAt: 1, _id: 1 }).lean();
  const items = rawItems.map(item => {
    const cubic = item.heightCm * item.widthCm * item.depthCm / 1_000_000;
    return { id: item._id.toString(), height_cm: item.heightCm, width_cm: item.widthCm, depth_cm: item.depthCm, quantity: item.quantity, description: item.description, cubic_per_item: Number(cubic.toFixed(3)), amount: Number((cubic * item.quantity * summary.ratePerCubic).toFixed(2)) };
  });
  const totalAmount = items.reduce((sum, item) => sum + item.amount, 0);
  const totalCubic = items.reduce((sum, item) => sum + (item.height_cm * item.width_cm * item.depth_cm / 1_000_000 * item.quantity), 0);
  const totalItems = items.reduce((sum, item) => sum + item.quantity, 0);
  const grossTotal = Number((totalAmount + summary.deliveryCharge).toFixed(2));
  const discount = Number(Math.min(summary.discount || 0, grossTotal).toFixed(2));
  const finalTotal = Number((grossTotal - discount).toFixed(2));
  const [payments, latestInvoice] = await Promise.all([
    Payment.find({ consignment: summary._id }).populate('recordedBy voidedBy', 'username fullName').sort({ paymentDate: -1, createdAt: -1 }).lean(),
    Invoice.findOne({ consignment: summary._id, status: { $ne: 'VOID' } }).sort({ issuedDate: -1 }).lean()
  ]);
  const amountPaid = Number(payments.filter(payment => payment.status !== 'VOID').reduce((sum, payment) => sum + payment.amount, 0).toFixed(2));
  const balanceDue = Number(Math.max(0, finalTotal - amountPaid).toFixed(2));
  const paymentStatus = amountPaid <= 0 ? 'UNPAID' : balanceDue > 0 ? 'PARTIALLY_PAID' : 'PAID';
  return {
    id: summary._id.toString(), shipment_id: summary.container._id.toString(), customer_id: summary.customer._id.toString(),
    rate_per_cubic: summary.ratePerCubic, delivery_charge: summary.deliveryCharge, discount,
    all_items_entered: summary.allItemsEntered, delivery_status: summary.deliveryStatus || 'PENDING',
    delivered_at: summary.deliveredAt || null,
    delivered_by: summary.deliveredBy ? { id: summary.deliveredBy._id.toString(), username: summary.deliveredBy.username, full_name: summary.deliveredBy.fullName } : null,
    created_at: summary.createdAt, updated_at: summary.updatedAt,
    shipment_name: summary.container.name, shipment_reference: summary.container.reference,
    customer_ref: summary.customer.customerRef, customer_name: summary.customer.name,
    customer_identity: summary.customer.identityNumber,
    billing_email: summary.customer.billingEmail,
    pickup_contact_name: summary.customer.pickupContactName || summary.customer.name,
    german_address: summary.customer.germanAddress,
    delivery_contact_name: summary.customer.deliveryContactName || summary.customer.name,
    sri_lankan_address: summary.customer.sriLankanAddress, phone_de: summary.customer.phoneDE,
    phone_lk: summary.customer.phoneLK, total_cubic: Number(totalCubic.toFixed(3)), total_items: totalItems,
    items, total_amount: Number(totalAmount.toFixed(2)), gross_total: grossTotal, final_total: finalTotal,
    payment_status: paymentStatus, amount_paid: amountPaid, balance_due: balanceDue,
    latest_invoice: latestInvoice ? { id: latestInvoice._id.toString(), invoice_number: latestInvoice.invoiceNumber, status: latestInvoice.status, email_history: latestInvoice.emailHistory || [] } : null,
    payments: payments.map(payment => ({ id: payment._id.toString(), amount: payment.amount, method: payment.method, payment_date: payment.paymentDate, reference: payment.reference, notes: payment.notes, status: payment.status || 'ACTIVE', recorded_by: payment.recordedBy ? (payment.recordedBy.fullName || payment.recordedBy.username) : '', voided_by: payment.voidedBy ? (payment.voidedBy.fullName || payment.voidedBy.username) : '', voided_at: payment.voidedAt, void_reason: payment.voidReason, created_at: payment.createdAt }))
  };
}

function invoiceSnapshot(consignment, user) {
  const issuedDate = new Date();
  const paymentTermsDays = Number(user.payment_terms_days ?? 14);
  const dueDate = new Date(issuedDate);
  dueDate.setUTCDate(dueDate.getUTCDate() + paymentTermsDays);
  return {
    business: {
      name: user.business_name || 'Asanka Cargo',
      tagline: user.business_tagline || 'Transport goods from Germany to Sri Lanka',
      logo: user.business_logo || '',
      contactName: user.full_name || user.username,
      phoneGermany: user.phone,
      phoneSriLanka: user.phone_sri_lanka,
      email: user.email,
      website: user.website,
      germanAddress: user.business_address,
      sriLankanAddress: user.sri_lankan_address,
      registrationNumber: user.registration_number,
      vatNumber: user.vat_number,
      bankName: user.bank_name,
      accountHolder: user.account_holder,
      iban: user.iban,
      bic: user.bic,
      accentColor: user.invoice_accent_color || '#0D2B45'
    },
    customer: {
      reference: consignment.customer_ref,
      name: consignment.customer_name,
      identity: consignment.customer_identity,
      billingEmail: consignment.billing_email,
      pickupContactName: consignment.pickup_contact_name || consignment.customer_name,
      germanAddress: consignment.german_address,
      deliveryContactName: consignment.delivery_contact_name || consignment.customer_name,
      sriLankanAddress: consignment.sri_lankan_address,
      phoneGermany: consignment.phone_de,
      phoneSriLanka: consignment.phone_lk
    },
    shipment: { name: consignment.shipment_name, reference: consignment.shipment_reference },
    items: consignment.items,
    totalCubic: consignment.total_cubic,
    totalItems: consignment.total_items,
    ratePerCubic: consignment.rate_per_cubic,
    deliveryCharge: consignment.delivery_charge,
    discount: consignment.discount,
    grossTotal: consignment.gross_total,
    itemsTotal: consignment.total_amount,
    finalTotal: consignment.final_total,
    amountPaid: consignment.amount_paid,
    balanceDue: consignment.balance_due,
    paymentStatus: consignment.payment_status,
    currency: user.default_currency || 'EUR',
    issuedDate,
    dueDate,
    paymentTerms: paymentTermsDays === 0 ? 'Due on receipt' : `${paymentTermsDays} days`
  };
}

export async function createInvoicePdf(invoice, baseUrl = '') {
  const snapshot = invoice.snapshot;
  const publicUrl = snapshot.publicUrl || `${baseUrl || 'http://localhost:3000'}/delivery/${invoice.publicToken}`;
  const qrDataUrl = await QRCode.toDataURL(publicUrl, { width: 360, margin: 1, errorCorrectionLevel: 'M' });
  const qrBuffer = Buffer.from(qrDataUrl.split(',')[1], 'base64');
  return new Promise((resolve, reject) => {
    const document = new PDFDocument({ size: 'A4', margin: 42, bufferPages: true });
    const chunks = [];
    document.on('data', chunk => chunks.push(chunk));
    document.on('end', () => resolve(Buffer.concat(chunks)));
    document.on('error', reject);
    document.rect(0, 0, document.page.width, document.page.height).fill('#FFFFFF');
    const accent = /^#[0-9a-f]{6}$/i.test(snapshot.business.accentColor || '') ? snapshot.business.accentColor : '#0D2B45';
    const accentChannels = [1, 3, 5].map(index => parseInt(accent.slice(index, index + 2), 16) / 255);
    const accentLuminance = accentChannels.map(channel => channel <= .03928 ? channel / 12.92 : ((channel + .055) / 1.055) ** 2.4).reduce((sum, channel, index) => sum + channel * [.2126, .7152, .0722][index], 0);
    const accentForeground = accentLuminance > .42 ? '#182536' : '#FFFFFF';
    const accentText = accentLuminance > .55 ? '#182536' : accent;
    const currency = snapshot.currency || 'EUR';
    const money = value => {
      const amount = new Intl.NumberFormat('en-IE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(value || 0));
      return currency === 'EUR' ? `€ ${amount}` : `${currency} ${amount}`;
    };
    const date = value => new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' }).format(new Date(value));
    if (snapshot.business.logo?.startsWith('data:image/')) {
      try {
        const logoBuffer = Buffer.from(snapshot.business.logo.split(',')[1], 'base64');
        document.image(logoBuffer, 42, 40, { fit: [58, 58] });
      } catch {}
    }
    document.fillColor(accentText).font('Helvetica-Bold').fontSize(19).text(snapshot.business.name, 112, 42, { width: 260 });
    document.fillColor('#536174').font('Helvetica').fontSize(7.5).text(snapshot.business.tagline || '', 112, 66, { width: 275 });
    document.fillColor('#657184').fontSize(7.2).text([snapshot.business.phoneGermany, snapshot.business.phoneSriLanka, snapshot.business.email, snapshot.business.website].filter(Boolean).join('  •  '), 112, 79, { width: 275 });
    document.fillColor(accentText).font('Helvetica-Bold').fontSize(27).text('INVOICE', 390, 42, { width: 160, align: 'right' });
    document.fillColor('#657184').font('Helvetica').fontSize(7.5).text(`Invoice No.  ${invoice.invoiceNumber}\nIssue Date  ${date(snapshot.issuedDate)}\nDue Date  ${date(snapshot.dueDate)}`, 390, 73, { width: 160, align: 'right', lineGap: 2 });
    const statusText = snapshot.paymentStatus === 'PARTIALLY_PAID' ? 'PARTIALLY PAID' : snapshot.paymentStatus || 'UNPAID';
    document.roundedRect(500, 110, 53, 16, 5).lineWidth(.8).strokeColor('#d5aa57').stroke();
    document.fillColor('#9b5900').font('Helvetica-Bold').fontSize(6.5).text(statusText, 503, 115, { width: 47, align: 'center' });
    document.moveTo(42, 135).lineTo(553, 135).lineWidth(1).strokeColor('#d9e0e6').stroke();
    document.roundedRect(42, 145, 511, 50, 6).fillColor('#f5f7f9').fill();
    document.roundedRect(42, 145, 5, 50, 3).fillColor(accent).fill();
    document.fillColor('#738095').font('Helvetica-Bold').fontSize(7.5).text('CUSTOMER REFERENCE', 56, 156);
    document.fillColor(accentText).fontSize(20).text(snapshot.customer.reference || '—', 56, 170);
    const partyTop = 210;
    document.roundedRect(42, partyTop, 248, 100, 6).lineWidth(1).strokeColor('#dce2e8').stroke();
    document.roundedRect(305, partyTop, 248, 100, 6).stroke();
    document.fillColor('#087d86').font('Helvetica-Bold').fontSize(8).text('BILL TO', 55, partyTop + 13);
    document.fillColor('#182536').fontSize(12).text(snapshot.customer.pickupContactName || snapshot.customer.name, 55, partyTop + 30, { width: 220 });
    document.fillColor('#526074').font('Helvetica').fontSize(8.5).text(`Customer ID: ${snapshot.customer.identity || '—'}\n${snapshot.customer.germanAddress || '—'}\n${snapshot.customer.phoneGermany || ''}`, 55, partyTop + 49, { width: 220, lineGap: 2 });
    document.fillColor('#087d86').font('Helvetica-Bold').fontSize(8).text('SHIP TO', 318, partyTop + 13);
    document.fillColor('#182536').fontSize(12).text(snapshot.customer.deliveryContactName || snapshot.customer.name, 318, partyTop + 30, { width: 220 });
    document.fillColor('#526074').font('Helvetica').fontSize(8.5).text(`${snapshot.customer.sriLankanAddress || '—'}\n${snapshot.customer.phoneSriLanka || ''}`, 318, partyTop + 49, { width: 220, lineGap: 2 });
    const stripTop = 322;
    const stripWidths = [160, 140, 97, 114];
    const stripLabels = [['ROUTE', 'Germany  >  Sri Lanka'], ['SHIPMENT', snapshot.shipment.name], ['CURRENCY', currency], ['PREPARED BY', snapshot.business.contactName]];
    let stripX = 42;
    stripLabels.forEach(([label, value], index) => {
      document.rect(stripX, stripTop, stripWidths[index], 35).fillColor('#f7f9fa').fill().strokeColor('#dce2e8').lineWidth(.7).stroke();
      document.fillColor('#778395').font('Helvetica').fontSize(6).text(label, stripX + 8, stripTop + 7, { width: stripWidths[index] - 16 });
      document.fillColor('#182536').font('Helvetica-Bold').fontSize(7.5).text(value || '—', stripX + 8, stripTop + 19, { width: stripWidths[index] - 16 });
      stripX += stripWidths[index];
    });
    let y = 368;
    const columns = [42, 64, 220, 310, 350, 405, 470];
    document.rect(42, y, 511, 24).fillColor(accent).fill();
    document.fillColor(accentForeground).font('Helvetica-Bold').fontSize(6.5);
    const headerWidths = [18, 150, 85, 36, 51, 60, 78];
    ['#', 'DESCRIPTION', 'DIMENSIONS (CM)', 'QTY', 'VOLUME (M³)', 'RATE', 'AMOUNT'].forEach((label, index) => document.text(label, columns[index] + 4, y + 8, { width: headerWidths[index], align: index > 2 ? 'right' : 'left' }));
    y += 24;
    document.font('Helvetica').fontSize(8).fillColor('#263246');
    snapshot.items.forEach((item, index) => {
      if (y > 690) { document.addPage(); y = 48; }
      const rowHeight = 28;
      if (index % 2) document.rect(42, y, 511, rowHeight).fillColor('#f7f9fa').fill();
      document.fillColor('#263246').text(String(index + 1), columns[0] + 4, y + 9, { width: 18 });
      document.text(item.description || 'Cargo item', columns[1] + 4, y + 9, { width: 150 });
      document.text(`${item.height_cm} × ${item.width_cm} × ${item.depth_cm}`, columns[2] + 4, y + 9, { width: 85 });
      document.text(String(item.quantity), columns[3] + 4, y + 9, { width: 36, align: 'right' });
      document.text((Number(item.cubic_per_item) * Number(item.quantity)).toFixed(3), columns[4] + 4, y + 9, { width: 51, align: 'right' });
      document.text(money(snapshot.ratePerCubic), columns[5] + 4, y + 9, { width: 60, align: 'right' });
      document.text(money(item.amount), columns[6] + 4, y + 9, { width: 78, align: 'right' });
      y += rowHeight;
    });
    y += 18;
    if (y > 560) { document.addPage(); y = 60; }
    const detailsY = y;
    document.fillColor('#087d86').font('Helvetica-Bold').fontSize(7.5).text('NOTES', 42, detailsY, { width: 280 });
    document.fillColor('#526074').font('Helvetica').fontSize(7.5).text(`Thank you for choosing ${snapshot.business.name}. Please quote invoice ${invoice.invoiceNumber} with your payment.\nPayment terms: ${snapshot.paymentTerms}.`, 42, detailsY + 14, { width: 280, lineGap: 3 });
    document.fillColor('#087d86').font('Helvetica-Bold').fontSize(7.5).text('PAYMENT DETAILS', 42, detailsY + 58, { width: 280 });
    const paymentLines = [
      snapshot.business.bankName && `Bank: ${snapshot.business.bankName}`,
      snapshot.business.accountHolder && `Account holder: ${snapshot.business.accountHolder}`,
      snapshot.business.iban && `IBAN: ${snapshot.business.iban}`,
      snapshot.business.bic && `BIC / SWIFT: ${snapshot.business.bic}`
    ].filter(Boolean);
    document.fillColor('#526074').font('Helvetica').fontSize(7.5).text(paymentLines.join('\n') || 'Payment details are available from the business.', 42, detailsY + 72, { width: 280, lineGap: 3 });
    const summaryX = 355;
    [['Subtotal', snapshot.itemsTotal], ['Delivery charge', snapshot.deliveryCharge], ['Discount', -Number(snapshot.discount || 0)], ['Tax', 0], ['Total', snapshot.finalTotal], ['Amount paid', snapshot.amountPaid], ['BALANCE DUE', snapshot.balanceDue]].forEach(([label, value], index, rows) => {
      const last = index === rows.length - 1;
      const rowHeight = last ? 28 : 20;
      document.rect(summaryX, y, 198, rowHeight).fillColor(last ? accent : '#FFFFFF').fill();
      if (!last) document.moveTo(summaryX, y + rowHeight).lineTo(summaryX + 198, y + rowHeight).lineWidth(.7).strokeColor('#dce2e8').stroke();
      document.fillColor(last ? accentForeground : '#526074').font(last ? 'Helvetica-Bold' : 'Helvetica').fontSize(last ? 11 : 8.2).text(label, summaryX + 10, y + (last ? 8 : 6.5), { width: 90 });
      document.text(money(value), summaryX + 105, y + (last ? 8 : 6.5), { width: 83, align: 'right' });
      y += rowHeight;
    });
    document.roundedRect(summaryX, detailsY, 198, y - detailsY, 6).lineWidth(.8).strokeColor('#d8dfe6').stroke();
    document.image(qrBuffer, 455, y + 12, { width: 52, height: 52 });
    document.fillColor('#536174').font('Helvetica').fontSize(6).text('Scan to view invoice', 511, y + 32, { width: 42 });
    document.moveTo(42, 690).lineTo(553, 690).lineWidth(.7).strokeColor('#dce2e8').stroke();
    const footerContacts = [snapshot.business.name, snapshot.business.phoneGermany, snapshot.business.phoneSriLanka, snapshot.business.email].filter(Boolean).join('  •  ');
    document.fillColor('#697688').font('Helvetica').fontSize(5.8).text(footerContacts, 42, 698, { width: 430 });
    document.text('Page 1 of 1', 500, 698, { width: 53, align: 'right' });

    const itemLabels = snapshot.items.flatMap((item, itemIndex) => Array.from({ length: Number(item.quantity || 0) }, (_, quantityIndex) => ({
      itemNumber: itemIndex + 1,
      quantityNumber: quantityIndex + 1,
      quantity: Number(item.quantity || 0),
      description: item.description || 'Cargo item'
    })));
    for (let firstLabel = 0; firstLabel < itemLabels.length; firstLabel += 9) {
      const labels = itemLabels.slice(firstLabel, firstLabel + 9);
      document.addPage({ size: 'A4', margin: 28 });
      document.rect(0, 0, document.page.width, document.page.height).fill('#FFFFFF');
      labels.forEach((label, labelIndex) => {
        const column = labelIndex % 3;
        const row = Math.floor(labelIndex / 3);
        const labelX = 28 + column * 180;
        const labelY = 28 + row * 252;
        const overallNumber = firstLabel + labelIndex + 1;
        document.roundedRect(labelX, labelY, 166, 238, 8).lineWidth(.9).strokeColor('#d6dbe3').stroke();
        document.fillColor('#111827').font('Helvetica-Bold').fontSize(9).text(String(snapshot.business.name || '').toUpperCase(), labelX + 10, labelY + 17, { width: 146, align: 'center' });
        document.fillColor('#687086').font('Helvetica').fontSize(7).text(label.description, labelX + 10, labelY + 32, { width: 146, align: 'center' });
        document.image(qrBuffer, labelX + 34, labelY + 51, { width: 98, height: 98 });
        document.fillColor('#111827').font('Helvetica-Bold').fontSize(21).text(snapshot.customer.reference || '—', labelX + 10, labelY + 161, { width: 146, align: 'center' });
        document.fontSize(10).text(`ITEM ${String(overallNumber).padStart(2, '0')}/${String(itemLabels.length).padStart(2, '0')}`, labelX + 10, labelY + 194, { width: 146, align: 'center' });
      });
    }
    document.end();
  });
}

app.get('/api/public/business', async (req, res, next) => {
  try {
    const administrator = await User.findOne({ role: { $in: ['OWNER', 'ADMIN'] }, businessName: { $nin: ['', null] } })
      .select('businessName')
      .sort({ createdAt: 1 })
      .lean();
    res.json({ businessName: administrator?.businessName || 'Cargo Management' });
  } catch (error) { next(error); }
});

app.post('/api/auth/login', async (req, res, next) => {
 try {
  const username = text(req.body.username, 'Username', { required: true });
  const password = String(req.body.password ?? '');
  const user = await User.findOne({ username: new RegExp(`^${username.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') }).select('+passwordHash');
  if (!user || user.enabled === false || !bcrypt.compareSync(password, user.passwordHash)) return res.status(401).json({ error: 'Invalid username or password.' });
  const token = jwt.sign({ sessionVersion: user.sessionVersion || 0 }, jwtSecret(), { algorithm: 'HS256', subject: user._id.toString(), expiresIn: '8h' });
  res.cookie('cargo_session', token, { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', maxAge: 8 * 60 * 60 * 1000 });
  res.json({ user: publicUser(user) });
 } catch (error) { next(error); }
});

app.post('/api/auth/logout', (req, res) => {
  res.clearCookie('cargo_session', { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production' });
  res.status(204).end();
});
app.get('/api/auth/me', requireAuth, (req, res) => res.json({ user: req.user }));

app.put('/api/profile', requireAuth, requireAdmin, async (req, res) => {
  try {
    const username = text(req.body.username, 'Username', { required: true });
    const logo = String(req.body.businessLogo ?? '');
    if (logo && !/^data:image\/(png|jpeg);base64,[A-Za-z0-9+/=]+$/.test(logo)) throw new Error('Logo must be a PNG or JPG image.');
    if (logo.length > 2_800_000) throw new Error('Logo must be no larger than 2 MB.');
    const accentColor = text(req.body.invoiceAccentColor, 'Invoice accent colour') || '#0D2B45';
    if (!/^#[0-9A-F]{6}$/i.test(accentColor)) throw new Error('Select a valid invoice accent colour.');
    const paymentTermsDays = number(req.body.paymentTermsDays ?? 14, 'Payment terms', { min: 0, integer: true });
    if (paymentTermsDays > 365) throw new Error('Payment terms cannot exceed 365 days.');
    const profile = {
      fullName: text(req.body.fullName, 'Full name'),
      businessName: text(req.body.businessName, 'Business name'),
      businessTagline: text(req.body.businessTagline, 'Business tagline'),
      registrationNumber: text(req.body.registrationNumber, 'Registration number'),
      vatNumber: text(req.body.vatNumber, 'Tax / VAT number'),
      businessLogo: logo,
      phone: text(req.body.phone, 'Phone'),
      phoneSriLanka: text(req.body.phoneSriLanka, 'Sri Lankan phone'),
      email: text(req.body.email, 'Email'),
      website: text(req.body.website, 'Website'),
      businessAddress: text(req.body.businessAddress, 'Business address'),
      sriLankanAddress: text(req.body.sriLankanAddress, 'Sri Lankan address'),
      defaultCurrency: text(req.body.defaultCurrency, 'Default currency') || 'EUR',
      invoicePrefix: text(req.body.invoicePrefix, 'Invoice prefix') || 'INV',
      paymentTermsDays,
      invoiceAccentColor: accentColor.toUpperCase(),
      bankName: text(req.body.bankName, 'Bank name'),
      accountHolder: text(req.body.accountHolder, 'Account holder'),
      iban: text(req.body.iban, 'IBAN'),
      bic: text(req.body.bic, 'BIC / SWIFT')
    };
    const user = await User.findByIdAndUpdate(req.user.id, { username, ...profile }, { new: true, runValidators: true });
    res.json({ user: publicUser(user) });
  } catch (error) {
    res.status(error.code === 11000 ? 409 : 400).json({ error: error.code === 11000 ? 'That username is already in use.' : error.message });
  }
});

app.put('/api/profile/password', requireAuth, requireAdmin, async (req, res) => {
  try {
    const currentPassword = String(req.body.currentPassword ?? '');
    const newPassword = String(req.body.newPassword ?? '');
    const confirmPassword = String(req.body.confirmPassword ?? '');
    const administrator = await User.findById(req.user.id).select('+passwordHash');
    if (!administrator || !bcrypt.compareSync(currentPassword, administrator.passwordHash)) {
      return res.status(403).json({ error: 'Current password is incorrect.' });
    }
    if (newPassword.length < 8) throw new Error('New password must have at least 8 characters.');
    if (newPassword !== confirmPassword) throw new Error('New password and confirmation do not match.');
    if (bcrypt.compareSync(newPassword, administrator.passwordHash)) throw new Error('New password must be different from the current password.');
    administrator.passwordHash = bcrypt.hashSync(newPassword, 12);
    administrator.sessionVersion = Number(administrator.sessionVersion || 0) + 1;
    await administrator.save();
    res.clearCookie('cargo_session', { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production' });
    res.status(204).end();
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.get('/api/employees', requireAuth, requireAdmin, async (req, res) => {
  const employees = await User.find({ role: 'USER' }).sort({ createdAt: -1 }).lean();
  res.json(employees.map(employee => ({ id: employee._id.toString(), username: employee.username, full_name: employee.fullName, created_at: employee.createdAt, enabled: employee.enabled !== false, active: false })));
});

app.post('/api/employees', requireAuth, requireAdmin, async (req, res) => {
  try {
    const username = text(req.body.username, 'Username', { required: true });
    const fullName = text(req.body.fullName, 'Employee name', { required: true });
    const password = String(req.body.password ?? '');
    if (password.length < 8) throw new Error('Password must have at least 8 characters.');
    const employee = await User.create({ sqliteId: await nextMongoSourceId(User), username, passwordHash: bcrypt.hashSync(password, 12), role: 'USER', fullName, createdAt: new Date() });
    res.status(201).json({ id: employee._id.toString(), username: employee.username, full_name: employee.fullName, created_at: employee.createdAt });
  } catch (error) {
    res.status(error.code === 11000 ? 409 : 400).json({ error: error.code === 11000 ? 'That username is already in use.' : error.message });
  }
});

app.put('/api/employees/:id', requireAuth, requireAdmin, async (req, res) => {
  try {
    const employee = await User.findOne({ _id: req.params.id, role: 'USER' }).select('+passwordHash');
    if (!employee) return res.status(404).json({ error: 'Employee not found.' });
    employee.fullName = text(req.body.fullName, 'Employee name', { required: true });
    employee.username = text(req.body.username, 'Username', { required: true });
    employee.enabled = String(req.body.enabled) === 'true';
    const password = String(req.body.password ?? '');
    if (password) {
      if (password.length < 8) throw new Error('Password must have at least 8 characters.');
      employee.passwordHash = bcrypt.hashSync(password, 12);
    }
    await employee.save();
    res.json({ id: employee._id.toString(), username: employee.username, full_name: employee.fullName, created_at: employee.createdAt, enabled: employee.enabled, active: false });
  } catch (error) {
    res.status(error.code === 11000 ? 409 : 400).json({ error: error.code === 11000 ? 'That username is already in use.' : error.message });
  }
});

app.delete('/api/employees/:id', requireAuth, requireAdmin, async (req, res) => {
  const employeeId = req.params.id;
  const employee = await User.findOne({ _id: employeeId, role: 'USER' });
  if (!employee) return res.status(404).json({ error: 'Employee not found.' });
  const referenced = await Promise.all([Container.exists({ createdBy: employeeId }), Invoice.exists({ issuedBy: employeeId }), Consignment.exists({ deliveredBy: employeeId })]);
  if (referenced.some(Boolean)) return res.status(409).json({ error: 'Employee cannot be removed because they created shipments or invoices.' });
  await employee.deleteOne();
  res.status(204).end();
});

app.get('/api/administrators', requireAuth, requireOwner, async (req, res) => {
  const administrators = await User.find({ role: 'ADMIN' }).sort({ createdAt: -1 }).lean();
  res.json(administrators.map(administrator => ({ id: administrator._id.toString(), username: administrator.username, full_name: administrator.fullName, created_at: administrator.createdAt, enabled: administrator.enabled !== false })));
});

app.post('/api/administrators', requireAuth, requireOwner, async (req, res) => {
  try {
    const username = text(req.body.username, 'Username', { required: true });
    const fullName = text(req.body.fullName, 'Administrator name', { required: true });
    const password = String(req.body.password ?? '');
    if (password.length < 12) throw new Error('Temporary password must have at least 12 characters.');
    const administrator = await User.create({ sqliteId: await nextMongoSourceId(User), username, passwordHash: bcrypt.hashSync(password, 12), role: 'ADMIN', enabled: true, fullName, createdAt: new Date() });
    res.status(201).json({ id: administrator._id.toString(), username: administrator.username, full_name: administrator.fullName, created_at: administrator.createdAt, enabled: true });
  } catch (error) {
    res.status(error.code === 11000 ? 409 : 400).json({ error: error.code === 11000 ? 'That username is already in use.' : error.message });
  }
});

app.put('/api/administrators/:id', requireAuth, requireOwner, async (req, res) => {
  try {
    const administrator = await User.findOne({ _id: req.params.id, role: 'ADMIN' }).select('+passwordHash');
    if (!administrator) return res.status(404).json({ error: 'Administrator not found.' });
    administrator.fullName = text(req.body.fullName, 'Administrator name', { required: true });
    administrator.username = text(req.body.username, 'Username', { required: true });
    administrator.enabled = String(req.body.enabled) === 'true';
    const password = String(req.body.password ?? '');
    if (password) {
      if (password.length < 12) throw new Error('New password must have at least 12 characters.');
      administrator.passwordHash = bcrypt.hashSync(password, 12);
      administrator.sessionVersion = Number(administrator.sessionVersion || 0) + 1;
    }
    await administrator.save();
    res.json({ id: administrator._id.toString(), username: administrator.username, full_name: administrator.fullName, created_at: administrator.createdAt, enabled: administrator.enabled });
  } catch (error) {
    res.status(error.code === 11000 ? 409 : 400).json({ error: error.code === 11000 ? 'That username is already in use.' : error.message });
  }
});

app.post('/api/tracking/webhooks/:provider', async (req, res) => {
  try {
    const secret = process.env.TRACKING_WEBHOOK_SECRET?.trim();
    if (!secret) return res.status(503).json({ error: 'Tracking webhooks are not configured.' });
    if (!secureTokenMatches(req.get('x-tracking-webhook-secret'), secret)) return res.status(401).json({ error: 'Invalid tracking webhook credentials.' });
    const provider = text(req.params.provider, 'Provider', { required: true }).toLowerCase();
    const referenceId = text(req.body.referenceId, 'Provider reference', { required: true });
    if (!Array.isArray(req.body.events) || !req.body.events.length) throw new Error('At least one tracking event is required.');
    const record = await ShipmentTracking.findOne({ provider, providerReferenceId: referenceId });
    if (!record) return res.status(404).json({ error: 'Tracking subscription not found.' });
    await ingestTrackingEvents(record, provider, req.body.events);
    res.status(202).json({ accepted: req.body.events.length });
  } catch (error) { res.status(400).json({ error: error.message }); }
});

app.get('/api/shipment-tracking', requireAuth, requireAdmin, async (req, res) => {
  const records = await ShipmentTracking.find().sort({ updatedAt: -1 }).lean();
  const events = await trackingEventsFor(records);
  res.json(records.map(record => presentTracking(record, events.get(record._id.toString()) || [])));
});

app.post('/api/shipment-tracking', requireAuth, requireAdmin, async (req, res) => {
  try {
    const normalized = containerNumber(req.body.containerNumber);
    let carrier = text(req.body.carrier, 'Carrier', { required: true });
    const supportedCarriers = ['Maersk', 'MSC', 'Hapag-Lloyd', 'CMA CGM', 'ONE', 'Evergreen', 'COSCO', 'OOCL'];
    let trackingUrl = '';
    if (carrier === 'OTHER') {
      carrier = text(req.body.customCarrier, 'Carrier name', { required: true });
      trackingUrl = text(req.body.trackingUrl, 'Official tracking URL', { required: true });
      let parsedUrl;
      try { parsedUrl = new URL(trackingUrl); } catch { throw new Error('Enter a valid official tracking URL.'); }
      if (parsedUrl.protocol !== 'https:') throw new Error('The official tracking URL must start with https://.');
      trackingUrl = parsedUrl.toString();
    } else if (!supportedCarriers.includes(carrier)) throw new Error('Select a supported carrier.');
    const existing = await ShipmentTracking.findOne({ containerNumber: normalized }).lean();
    if (existing) {
      const grouped = await trackingEventsFor([existing]);
      return res.json(presentTracking(existing, grouped.get(existing._id.toString()) || []));
    }
    const now = new Date();
    const providerName = carrier === 'OTHER' ? 'manual' : trackingProviderName();
    const record = await ShipmentTracking.create({
      sqliteId: await nextMongoSourceId(ShipmentTracking), containerNumber: normalized,
      carrier, trackingUrl, provider: providerName, syncStatus: providerName === 'manual' ? 'MANUAL' : 'SUBSCRIBING',
      createdBy: req.user.id, createdAt: now, updatedAt: now
    });
    let events = [];
    if (providerName !== 'manual') {
      try {
        const provider = createTrackingProvider(providerName);
        const subscription = await provider.subscribe({ containerNumber: normalized, carrier });
        record.providerReferenceId = subscription.referenceId;
        record.carrierCode = subscription.carrierCode;
        events = await ingestTrackingEvents(record, providerName, subscription.events || []);
      } catch (providerError) {
        record.syncStatus = 'ERROR';
        record.providerError = providerError.message;
        await record.save();
      }
    }
    res.status(201).json(presentTracking(record, events));
  } catch (error) {
    res.status(error.code === 11000 ? 409 : 400).json({ error: error.code === 11000 ? 'This container is already being tracked.' : error.message });
  }
});

app.post('/api/shipment-tracking/:id/simulate', requireAuth, requireAdmin, async (req, res) => {
  try {
    const record = await ShipmentTracking.findById(req.params.id);
    if (!record) return res.status(404).json({ error: 'Tracked shipment not found.' });
    if (record.provider !== 'mock') return res.status(409).json({ error: 'Simulation is available only for mock tracking subscriptions.' });
    const events = await TrackingEvent.find({ tracking: record._id }).sort({ sortOrder: 1, eventTime: 1 }).lean();
    const next = createTrackingProvider('mock').nextEvent(record.providerReferenceId, events);
    if (!next) return res.status(409).json({ error: 'The mock shipment has already completed its journey.' });
    const updatedEvents = await ingestTrackingEvents(record, 'mock', [next]);
    res.json(presentTracking(record, updatedEvents));
  } catch (error) { res.status(400).json({ error: error.message }); }
});

app.post('/api/shipment-tracking/:id/subscribe', requireAuth, requireAdmin, async (req, res) => {
  let record;
  try {
    record = await ShipmentTracking.findById(req.params.id);
    if (!record) return res.status(404).json({ error: 'Tracked shipment not found.' });
    const providerName = trackingProviderName();
    const provider = createTrackingProvider(providerName);
    record.provider = providerName;
    record.syncStatus = 'SUBSCRIBING';
    record.providerError = '';
    await record.save();
    const subscription = await provider.subscribe({ containerNumber: record.containerNumber, carrier: record.carrier });
    record.providerReferenceId = subscription.referenceId;
    record.carrierCode = subscription.carrierCode;
    const events = await ingestTrackingEvents(record, providerName, subscription.events || []);
    res.json(presentTracking(record, events));
  } catch (error) {
    if (record) {
      record.syncStatus = 'ERROR';
      record.providerError = error.message;
      await record.save().catch(() => {});
    }
    res.status(400).json({ error: error.message });
  }
});

app.put('/api/shipment-tracking/:id/journey', requireAuth, requireAdmin, async (req, res) => {
  try {
    const record = await ShipmentTracking.findById(req.params.id);
    if (!record) return res.status(404).json({ error: 'Tracked shipment not found.' });
    if (!Array.isArray(req.body.events) || !req.body.events.length || req.body.events.length > 50) throw new Error('Enter between 1 and 50 journey events.');
    const allowedCodes = ['GATE_OUT', 'GATE_IN', 'LOAD', 'DEPARTURE', 'ARRIVAL', 'DISCHARGE', 'TRANSSHIPMENT', 'DELAY', 'DELIVERY', 'CUSTOM'];
    const receivedAt = new Date();
    const events = req.body.events.map((source, index) => {
      const eventCode = text(source.eventCode, `Event ${index + 1} type`, { required: true }).toUpperCase();
      if (!allowedCodes.includes(eventCode)) throw new Error(`Event ${index + 1} has an unsupported type.`);
      const description = text(source.description, `Event ${index + 1} name`, { required: true });
      const location = text(source.location, `Event ${index + 1} location`, { required: true });
      const eventTime = new Date(source.eventTime);
      if (Number.isNaN(eventTime.getTime())) throw new Error(`Event ${index + 1} needs a valid date and time.`);
      const providerEventId = String(source.providerEventId || '').startsWith(`manual:${record._id}:`) ? source.providerEventId : `manual:${record._id}:${crypto.randomUUID()}`;
      return {
        tracking: record._id, provider: 'manual', providerEventId, eventCode,
        normalizedStatus: normalizeTrackingStatus({ eventCode }), description, sortOrder: index, eventTime,
        isEstimated: Boolean(source.isEstimated), location,
        vessel: text(source.vessel, `Event ${index + 1} transport`),
        voyage: text(source.voyage, `Event ${index + 1} voyage`),
        transportMode: text(source.transportMode, `Event ${index + 1} transport mode`),
        rawPayload: { source: 'manual', order: index }, receivedAt
      };
    });
    await TrackingEvent.deleteMany({ tracking: record._id });
    await TrackingEvent.insertMany(events);
    record.provider = 'manual';
    record.providerReferenceId = '';
    record.providerError = '';
    const savedEvents = await updateTrackingProjection(record);
    res.json(presentTracking(record, savedEvents));
  } catch (error) { res.status(400).json({ error: error.message }); }
});

app.put('/api/shipment-tracking/:id', requireAuth, requireAdmin, async (req, res) => {
  try {
    const allowedStatuses = ['NOT_UPDATED', 'IN_TRANSIT', 'DELAYED', 'ARRIVING_SOON', 'DELIVERED'];
    const status = text(req.body.status, 'Status', { required: true }).toUpperCase();
    if (!allowedStatuses.includes(status)) throw new Error('Select a valid tracking status.');
    const etaText = text(req.body.eta, 'ETA');
    const eta = etaText ? new Date(`${etaText}T00:00:00.000Z`) : null;
    if (etaText && Number.isNaN(eta.getTime())) throw new Error('Enter a valid ETA.');
    const record = await ShipmentTracking.findByIdAndUpdate(req.params.id, {
      origin: text(req.body.origin, 'Origin'), destination: text(req.body.destination, 'Destination'),
      vessel: text(req.body.vessel, 'Vessel'), latestStatus: text(req.body.latestStatus, 'Latest status') || 'Not updated',
      status, eta, updatedAt: new Date()
    }, { new: true, runValidators: true });
    if (!record) return res.status(404).json({ error: 'Tracked shipment not found.' });
    res.json(presentTracking(record));
  } catch (error) { res.status(400).json({ error: error.message }); }
});

app.delete('/api/shipment-tracking/:id', requireAuth, requireAdmin, async (req, res) => {
  const record = await ShipmentTracking.findByIdAndDelete(req.params.id);
  if (!record) return res.status(404).json({ error: 'Tracked shipment not found.' });
  await TrackingEvent.deleteMany({ tracking: record._id });
  res.status(204).end();
});

app.get('/api/shipments', requireAuth, async (req, res) => {
  const administratorAccess = ['OWNER', 'ADMIN'].includes(req.user.role);
  const filter = administratorAccess ? {} : { status: 'ACTIVE' };
  const shipments = await Container.find(filter).sort({ createdAt: -1 }).lean();
  const counts = await Consignment.aggregate([{ $group: { _id: '$container', count: { $sum: 1 } } }]);
  const countMap = new Map(counts.map(row => [row._id.toString(), row.count]));
  res.json(shipments.map(row => ({ id: row._id.toString(), name: row.name, reference: row.reference, ...(administratorAccess ? { container_number: row.containerNumber || '' } : {}), status: row.status, created_at: row.createdAt, created_by: row.createdBy.toString(), consignment_count: countMap.get(row._id.toString()) || 0 })));
});

app.get('/api/customers/by-reference/:reference', requireAuth, requireAdmin, async (req, res) => {
  const customer = await Customer.findOne({ customerRef: String(req.params.reference).trim() }).lean();
  if (!customer) return res.status(404).json({ error: 'Customer not found.' });
  res.json({ customer_ref: customer.customerRef, customer_name: customer.name, customer_id: customer.identityNumber, billing_email: customer.billingEmail, pickup_contact_name: customer.pickupContactName || customer.name, german_address: customer.germanAddress, delivery_contact_name: customer.deliveryContactName || customer.name, sri_lankan_address: customer.sriLankanAddress, phone_de: customer.phoneDE, phone_lk: customer.phoneLK });
});

app.get('/api/customers', requireAuth, requireAdmin, async (req, res) => {
  const query = String(req.query.search || '').trim();
  const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const filter = query ? { $or: [
    { customerRef: { $regex: escaped, $options: 'i' } },
    { name: { $regex: escaped, $options: 'i' } },
    { identityNumber: { $regex: escaped, $options: 'i' } },
    { billingEmail: { $regex: escaped, $options: 'i' } },
    { phoneDE: { $regex: escaped, $options: 'i' } },
    { phoneLK: { $regex: escaped, $options: 'i' } }
  ] } : {};
  const customers = await Customer.find(filter).sort({ name: 1, customerRef: 1 }).lean();
  res.json(customers.map(customer => ({
    id: customer._id.toString(), customer_ref: customer.customerRef, customer_name: customer.name,
    customer_id: customer.identityNumber, billing_email: customer.billingEmail, pickup_contact_name: customer.pickupContactName || customer.name,
    german_address: customer.germanAddress, delivery_contact_name: customer.deliveryContactName || customer.name,
    sri_lankan_address: customer.sriLankanAddress, phone_de: customer.phoneDE, phone_lk: customer.phoneLK
  })));
});

app.post('/api/shipments', requireAuth, requireAdmin, async (req, res) => {
  try {
    const name = text(req.body.name, 'Shipment name', { required: true });
    const reference = text(req.body.reference, 'Shipment reference', { required: true });
    const shipment = await Container.create({ sqliteId: await nextMongoSourceId(Container), name, reference, status: 'OPEN', createdBy: req.user.id, createdAt: new Date() });
    res.status(201).json({ id: shipment._id.toString(), name, reference, status: shipment.status, created_at: shipment.createdAt, created_by: req.user.id, consignment_count: 0 });
  } catch (error) {
    res.status(error.code === 11000 ? 409 : 400).json({ error: error.code === 11000 ? 'Shipment reference already exists.' : error.message });
  }
});

app.patch('/api/shipments/:id', requireAuth, requireAdmin, async (req, res) => {
  try {
    const name = text(req.body.name, 'Shipment name', { required: true });
    const reference = text(req.body.reference, 'Shipment reference', { required: true });
    const rawContainerNumber = text(req.body.containerNumber, 'Container number');
    const update = { $set: { name, reference } };
    if (rawContainerNumber) update.$set.containerNumber = rawContainerNumber;
    else update.$unset = { containerNumber: 1 };
    const shipment = await Container.findByIdAndUpdate(req.params.id, update, { new: true, runValidators: true });
    if (!shipment) return res.status(404).json({ error: 'Shipment not found.' });
    const consignmentCount = await Consignment.countDocuments({ container: shipment._id });
    res.json({
      id: shipment._id.toString(), name: shipment.name, reference: shipment.reference,
      container_number: shipment.containerNumber || '', status: shipment.status,
      created_at: shipment.createdAt, created_by: shipment.createdBy.toString(),
      consignment_count: consignmentCount
    });
  } catch (error) {
    res.status(error.code === 11000 ? 409 : 400).json({ error: error.code === 11000 ? 'Shipment reference or container number already exists.' : error.message });
  }
});

app.patch('/api/shipments/:id/status', requireAuth, requireAdmin, async (req, res) => {
  const status = text(req.body.status, 'Shipment status', { required: true }).toUpperCase();
  if (!['OPEN', 'ACTIVE'].includes(status)) {
    return res.status(400).json({ error: 'Shipment status must be OPEN or ACTIVE.' });
  }
  const shipment = await Container.findByIdAndUpdate(
    req.params.id,
    { status },
    { new: true, runValidators: true }
  );
  if (!shipment) return res.status(404).json({ error: 'Shipment not found.' });
  const consignmentCount = await Consignment.countDocuments({ container: shipment._id });
  res.json({
    id: shipment._id.toString(), name: shipment.name, reference: shipment.reference,
    status: shipment.status, created_at: shipment.createdAt,
    created_by: shipment.createdBy.toString(), consignment_count: consignmentCount
  });
});

app.delete('/api/shipments/:id', requireAuth, requireAdmin, async (req, res) => {
  const shipment = await Container.findById(req.params.id);
  if (!shipment) return res.status(404).json({ error: 'Shipment not found.' });
  const administrator = await User.findById(req.user.id).select('+passwordHash');
  if (!administrator || !bcrypt.compareSync(String(req.body.password ?? ''), administrator.passwordHash)) {
    return res.status(403).json({ error: 'Incorrect password.' });
  }
  const mongoSession = await Container.startSession();
  try {
    await mongoSession.withTransaction(async () => {
      const consignments = await Consignment.find({ container: shipment._id }, { _id: 1 }).session(mongoSession).lean();
      const consignmentIds = consignments.map(consignment => consignment._id);
      if (consignmentIds.length) {
        const related = { consignment: { $in: consignmentIds } };
        await BoxItem.deleteMany(related, { session: mongoSession });
        await Document.deleteMany(related, { session: mongoSession });
        await Invoice.deleteMany(related, { session: mongoSession });
        await Consignment.deleteMany({ _id: { $in: consignmentIds } }, { session: mongoSession });
      }
      await Container.deleteOne({ _id: shipment._id }, { session: mongoSession });
    });
  } finally {
    await mongoSession.endSession();
  }
  res.status(204).end();
});

app.get('/api/shipments/:shipmentId/consignments', requireAuth, async (req, res) => {
  const shipment = await Container.findById(req.params.shipmentId).lean();
  if (!shipment || (!['OWNER', 'ADMIN'].includes(req.user.role) && shipment.status !== 'ACTIVE')) {
    return res.status(404).json({ error: 'Shipment not found.' });
  }
  const rows = await Consignment.find({ container: req.params.shipmentId }).populate('customer deliveredBy').sort({ deliveryStatus: -1, updatedAt: -1 }).lean();
  res.json(rows.map(row => ({
    id: row._id.toString(), customer_ref: row.customer.customerRef, customer_name: row.customer.name,
    delivery_status: row.deliveryStatus || 'PENDING', delivered_at: row.deliveredAt || null,
    delivered_by: row.deliveredBy ? { id: row.deliveredBy._id.toString(), username: row.deliveredBy.username, full_name: row.deliveredBy.fullName } : null,
    updated_at: row.updatedAt
  })));
});

app.patch('/api/consignments/:id/delivery-status', requireAuth, async (req, res) => {
  const requestedStatus = text(req.body.status, 'Delivery status', { required: true }).toUpperCase();
  if (!['PENDING', 'DELIVERED'].includes(requestedStatus)) return res.status(400).json({ error: 'Delivery status must be PENDING or DELIVERED.' });
  if (requestedStatus === 'PENDING' && !['OWNER', 'ADMIN'].includes(req.user.role)) return res.status(403).json({ error: 'Only an administrator can reopen a delivered customer.' });
  const consignment = await Consignment.findById(req.params.id);
  if (!consignment) return res.status(404).json({ error: 'Customer delivery not found.' });
  if (!['OWNER', 'ADMIN'].includes(req.user.role) && !await Container.exists({ _id: consignment.container, status: 'ACTIVE' })) {
    return res.status(404).json({ error: 'Customer delivery not found.' });
  }
  if (requestedStatus === 'DELIVERED' && consignment.deliveryStatus === 'DELIVERED') {
    return res.json(await presentConsignment(consignment._id));
  }
  if (requestedStatus === 'DELIVERED') {
    consignment.deliveryStatus = 'DELIVERED';
    consignment.deliveredAt = new Date();
    consignment.deliveredBy = req.user.id;
  } else {
    consignment.deliveryStatus = 'PENDING';
    consignment.deliveredAt = null;
    consignment.deliveredBy = null;
  }
  consignment.updatedAt = new Date();
  await consignment.save();
  res.json(await presentConsignment(consignment._id));
});

app.post('/api/shipments/:shipmentId/consignments', requireAuth, requireAdmin, async (req, res) => {
  try {
    const shipmentId = req.params.shipmentId;
    if (!await Container.exists({ _id: shipmentId })) throw new Error('Shipment not found.');
    const customerRef = text(req.body.customerRef, 'Customer reference', { required: true });
    const customerName = text(req.body.customerName, 'Customer name', { required: true });
    let customer = await Customer.findOne({ customerRef });
    const details = { name: customerName, identityNumber: text(req.body.customerId, 'Customer ID'), billingEmail: email(req.body.billingEmail, 'Billing email'), pickupContactName: text(req.body.pickupContactName, 'Pickup contact name'), germanAddress: text(req.body.germanAddress, 'Pickup address'), deliveryContactName: text(req.body.deliveryContactName, 'Delivery contact name'), sriLankanAddress: text(req.body.sriLankanAddress, 'Delivery address'), phoneDE: text(req.body.phoneDE, 'Pickup contact number'), phoneLK: text(req.body.phoneLK, 'Delivery contact number'), updatedAt: new Date() };
    if (customer) {
      Object.assign(customer, details);
      await customer.save();
    } else {
      customer = await Customer.create({ sqliteId: await nextMongoSourceId(Customer), customerRef, ...details, createdAt: new Date() });
    }
    const rate = number(req.body.ratePerCubic ?? 530, 'Rate per cubic metre', { min: 0 });
    const delivery = number(req.body.deliveryCharge ?? 0, 'Delivery charge', { min: 0 });
    const existing = await Consignment.exists({ container: shipmentId, customer: customer._id });
    const consignment = existing
      ? await Consignment.findOneAndUpdate({ container: shipmentId, customer: customer._id }, { ratePerCubic: rate, deliveryCharge: delivery, allItemsEntered: Boolean(req.body.allItemsEntered), updatedAt: new Date() }, { new: true, runValidators: true })
      : await Consignment.create({ sqliteId: await nextMongoSourceId(Consignment), container: shipmentId, customer: customer._id, ratePerCubic: rate, deliveryCharge: delivery, allItemsEntered: Boolean(req.body.allItemsEntered), createdAt: new Date(), updatedAt: new Date() });
    res.status(existing ? 200 : 201).json(await presentConsignment(consignment._id));
  } catch (error) { res.status(error.message === 'Shipment not found.' ? 404 : 400).json({ error: error.message }); }
});

app.get('/api/consignments/:id', requireAuth, requireAdmin, async (req, res) => {
  const model = await presentConsignment(req.params.id);
  if (!model) return res.status(404).json({ error: 'Consignment not found.' });
  res.json(model);
});

app.get('/api/consignments/:id/delivery-sheet', requireAuth, async (req, res) => {
  const consignment = await presentConsignment(req.params.id);
  if (!consignment) return res.status(404).json({ error: 'Customer delivery not found.' });
  if (!['OWNER', 'ADMIN'].includes(req.user.role) && !await Container.exists({ _id: consignment.shipment_id, status: 'ACTIVE' })) {
    return res.status(404).json({ error: 'Customer delivery not found.' });
  }
  res.json({ id: consignment.id, deliveryStatus: consignment.delivery_status, deliveredAt: consignment.delivered_at, deliveredBy: consignment.delivered_by, customer: { name: consignment.customer_name, reference: consignment.customer_ref, address: consignment.sri_lankan_address || consignment.german_address }, totalItems: consignment.total_items, items: consignment.items.map(item => ({ description: item.description, height: item.height_cm, width: item.width_cm, depth: item.depth_cm, quantity: item.quantity })) });
});

app.get('/api/consignments/:id/packing-list', requireAuth, requireAdmin, async (req, res) => {
  const consignment = await presentConsignment(req.params.id);
  if (!consignment) return res.status(404).send('Customer delivery not found.');
  if (!consignment.items.length) return res.status(400).send('Add at least one delivery item before downloading a packing list.');

  const document = new PDFDocument({ size: 'A4', margin: 48 });
  const safeReference = consignment.customer_ref.replace(/[^a-z0-9_-]+/gi, '-');
  res.attachment(`packing-list-${safeReference}.pdf`);
  document.pipe(res);

  document.font('Helvetica-Bold').fontSize(22).fillColor('#20283a').text('PACKING LIST');
  document.moveTo(48, 82).lineTo(547, 82).strokeColor('#e3bd15').lineWidth(5).stroke();
  document.moveDown(1.5);

  const left = 48;
  const right = 310;
  const detailsY = document.y;
  document.font('Helvetica-Bold').fontSize(10).fillColor('#687086').text('SHIPPER', left, detailsY);
  document.font('Helvetica-Bold').fontSize(12).fillColor('#20283a').text(req.user.business_name || 'Cargo Management', left, detailsY + 17, { width: 225 });
  document.font('Helvetica').fontSize(9).fillColor('#4f596b');
  if (req.user.business_address) document.text(req.user.business_address, left, document.y + 3, { width: 225 });
  if (req.user.phone) document.text(req.user.phone, left, document.y + 3, { width: 225 });
  if (req.user.email) document.text(req.user.email, left, document.y + 3, { width: 225 });

  document.font('Helvetica-Bold').fontSize(10).fillColor('#687086').text('DOCUMENT DETAILS', right, detailsY);
  document.font('Helvetica').fontSize(10).fillColor('#20283a')
    .text(`Date: ${new Intl.DateTimeFormat('en-GB').format(new Date())}`, right, detailsY + 18)
    .text(`Shipment: ${consignment.shipment_name}`, right, detailsY + 35, { width: 237 })
    .text(`Shipment ref: ${consignment.shipment_reference}`, right, detailsY + 52, { width: 237 });

  document.y = Math.max(document.y, detailsY + 92);
  document.moveTo(48, document.y).lineTo(547, document.y).strokeColor('#dfe3e8').lineWidth(1).stroke();
  document.moveDown(1.1);
  const pickupAddress = consignment.german_address || 'Address not provided';
  const pickupPhone = consignment.phone_de || '';
  const deliveryAddress = consignment.sri_lankan_address || 'Address not provided';
  const deliveryPhone = consignment.phone_lk || '';
  const referenceY = document.y;
  document.roundedRect(48, referenceY, 499, 24, 5).fill('#f0d405');
  document.font('Helvetica-Bold').fontSize(9).fillColor('#302b00').text(`CUSTOMER REF  ${consignment.customer_ref}`, 62, referenceY + 7, { width: 471 });
  const addressY = referenceY + 36;
  const addressWidth = 237;
  const addressTextWidth = 209;
  const addressHeight = Math.max(
    125,
    document.heightOfString(pickupAddress, { width: addressTextWidth }) + (pickupPhone ? 94 : 80),
    document.heightOfString(deliveryAddress, { width: addressTextWidth }) + (deliveryPhone ? 94 : 80)
  );
  const drawAddressBox = ({ x, title, name, address, phone }) => {
    document.roundedRect(x, addressY, addressWidth, addressHeight, 9).fill('#fffdf0').strokeColor('#d9c219').lineWidth(1.2).stroke();
    document.roundedRect(x + 14, addressY + 13, 118, 22, 6).fill('#f0d405');
    document.font('Helvetica-Bold').fontSize(8).fillColor('#302b00').text(title, x + 24, addressY + 20, { width: 98 });
    document.font('Helvetica-Bold').fontSize(11).fillColor('#20283a').text(name, x + 14, addressY + 45, { width: addressTextWidth });
    document.font('Helvetica').fontSize(9.5).fillColor('#3f4958').text(address, x + 14, document.y + 9, { width: addressTextWidth, lineGap: 2 });
    if (phone) document.font('Helvetica').fontSize(9).fillColor('#5c6675').text(`Phone: ${phone}`, x + 14, document.y + 7, { width: addressTextWidth });
  };
  drawAddressBox({ x: 48, title: 'PICKUP DETAILS', name: consignment.pickup_contact_name || consignment.customer_name, address: pickupAddress, phone: pickupPhone });
  drawAddressBox({ x: 310, title: 'DELIVERY DETAILS', name: consignment.delivery_contact_name || consignment.customer_name, address: deliveryAddress, phone: deliveryPhone });
  document.y = addressY + addressHeight + 22;
  const columns = { no: 48, description: 75, dimensions: 260, quantity: 415, volume: 474 };
  const widths = { description: 175, dimensions: 145, quantity: 49, volume: 73 };
  const drawTableHeader = () => {
    const y = document.y;
    document.rect(48, y - 5, 499, 25).fill('#f0d405');
    document.font('Helvetica-Bold').fontSize(8).fillColor('#302b00')
      .text('#', columns.no, y, { width: 20 })
      .text('DESCRIPTION', columns.description, y, { width: widths.description })
      .text('DIMENSIONS', columns.dimensions, y, { width: widths.dimensions })
      .text('QTY', columns.quantity, y, { width: widths.quantity, align: 'right' })
      .text('VOLUME', columns.volume, y, { width: widths.volume, align: 'right' });
    document.y = y + 27;
  };
  drawTableHeader();

  consignment.items.forEach((item, index) => {
    if (document.y > 720) {
      document.addPage();
      drawTableHeader();
    }
    const y = document.y;
    const cubicTotal = item.height_cm * item.width_cm * item.depth_cm / 1_000_000 * item.quantity;
    document.font('Helvetica').fontSize(9).fillColor('#20283a')
      .text(String(index + 1), columns.no, y, { width: 20 })
      .text(item.description || 'Cargo item', columns.description, y, { width: widths.description })
      .text(`${item.height_cm} × ${item.width_cm} × ${item.depth_cm} cm`, columns.dimensions, y, { width: widths.dimensions })
      .text(String(item.quantity), columns.quantity, y, { width: widths.quantity, align: 'right' })
      .text(`${cubicTotal.toFixed(3)} m³`, columns.volume, y, { width: widths.volume, align: 'right' });
    document.y = Math.max(document.y, y + 25);
    document.moveTo(48, document.y).lineTo(547, document.y).strokeColor('#e7eaf0').stroke();
    document.moveDown(.65);
  });

  if (document.y > 680) document.addPage();
  document.moveDown(.7);
  const summaryY = document.y;
  document.roundedRect(310, summaryY, 237, 62, 8).fill('#fffbea').strokeColor('#dfca25').stroke();
  document.font('Helvetica').fontSize(10).fillColor('#5c6472').text('Total packages/items', 326, summaryY + 14, { width: 130 });
  document.font('Helvetica-Bold').fillColor('#20283a').text(String(consignment.total_items), 470, summaryY + 14, { width: 60, align: 'right' });
  document.font('Helvetica').fillColor('#5c6472').text('Total volume', 326, summaryY + 36, { width: 130 });
  document.font('Helvetica-Bold').fillColor('#20283a').text(`${consignment.total_cubic.toFixed(3)} m³`, 450, summaryY + 36, { width: 80, align: 'right' });
  document.y = summaryY + 75;
  document.end();
});

app.get('/api/consignments/:id/invoice-preview', requireAuth, requireAdmin, async (req, res) => {
  const consignment = await presentConsignment(req.params.id);
  if (!consignment) return res.status(404).json({ error: 'Customer delivery not found.' });
  res.json({ snapshot: invoiceSnapshot(consignment, req.user) });
});

app.get('/api/consignments/:id/payments', requireAuth, requireAdmin, async (req, res) => {
  const consignment = await presentConsignment(req.params.id);
  if (!consignment) return res.status(404).json({ error: 'Customer delivery not found.' });
  res.json({ status: consignment.payment_status, invoiceTotal: consignment.final_total, amountPaid: consignment.amount_paid, balanceDue: consignment.balance_due, payments: consignment.payments });
});

app.patch('/api/consignments/:id/discount', requireAuth, requireAdmin, async (req, res) => {
  try {
    const current = await presentConsignment(req.params.id);
    if (!current) return res.status(404).json({ error: 'Customer delivery not found.' });
    const discount = number(req.body.discount ?? 0, 'Discount', { min: 0 });
    const maximumDiscount = Number(Math.max(0, current.gross_total - current.amount_paid).toFixed(2));
    if (discount > maximumDiscount) throw new Error(`Discount cannot exceed €${maximumDiscount.toFixed(2)} while recorded payments remain active.`);
    await Consignment.findByIdAndUpdate(current.id, { discount, updatedAt: new Date() }, { runValidators: true });
    const updated = await presentConsignment(current.id);
    await Invoice.updateMany({ consignment: current.id, status: { $ne: 'VOID' } }, { $set: { status: updated.payment_status === 'PAID' ? 'PAID' : 'ISSUED', 'snapshot.discount': updated.discount, 'snapshot.grossTotal': updated.gross_total, 'snapshot.finalTotal': updated.final_total, 'snapshot.amountPaid': updated.amount_paid, 'snapshot.balanceDue': updated.balance_due, 'snapshot.paymentStatus': updated.payment_status } });
    res.json(updated);
  } catch (error) { res.status(400).json({ error: error.message }); }
});

app.post('/api/consignments/:id/payments', requireAuth, requireAdmin, async (req, res) => {
  try {
    const consignment = await presentConsignment(req.params.id);
    if (!consignment) return res.status(404).json({ error: 'Customer delivery not found.' });
    if (consignment.final_total <= 0) throw new Error('Add cargo charges before recording a payment.');
    if (consignment.balance_due <= 0) throw new Error('This customer delivery is already fully paid.');
    const amount = number(req.body.amount, 'Amount paid', { min: 0.01 });
    if (amount > consignment.balance_due) throw new Error(`Amount paid cannot exceed the remaining balance of €${consignment.balance_due.toFixed(2)}.`);
    const method = text(req.body.method, 'Payment method', { required: true });
    if (!['BANK_TRANSFER', 'CASH', 'CARD', 'OTHER'].includes(method)) throw new Error('Select a valid payment method.');
    const paymentDate = new Date(`${text(req.body.paymentDate, 'Payment date', { required: true })}T12:00:00.000Z`);
    if (Number.isNaN(paymentDate.getTime())) throw new Error('Enter a valid payment date.');
    await Payment.create({ sqliteId: await nextMongoSourceId(Payment), consignment: consignment.id, amount, method, paymentDate, reference: text(req.body.reference, 'Payment reference'), notes: text(req.body.notes, 'Payment notes'), recordedBy: req.user.id, createdAt: new Date() });
    const updated = await presentConsignment(consignment.id);
    await Invoice.updateMany({ consignment: consignment.id, status: { $ne: 'VOID' } }, { $set: { status: updated.payment_status === 'PAID' ? 'PAID' : 'ISSUED', 'snapshot.amountPaid': updated.amount_paid, 'snapshot.balanceDue': updated.balance_due, 'snapshot.paymentStatus': updated.payment_status } });
    res.status(201).json(updated);
  } catch (error) { res.status(400).json({ error: error.message }); }
});

app.patch('/api/payments/:id/void', requireAuth, requireAdmin, async (req, res) => {
  try {
    const payment = await Payment.findById(req.params.id);
    if (!payment) return res.status(404).json({ error: 'Payment record not found.' });
    if (payment.status === 'VOID') throw new Error('This payment has already been voided.');
    const reason = text(req.body.reason, 'Reason for voiding', { required: true });
    if (reason.length < 5) throw new Error('Provide a clear reason with at least 5 characters.');
    const account = await User.findById(req.user.id).select('+passwordHash');
    if (!account || !bcrypt.compareSync(String(req.body.password ?? ''), account.passwordHash)) return res.status(403).json({ error: 'Incorrect administrator password.' });
    payment.status = 'VOID';
    payment.voidReason = reason;
    payment.voidedBy = req.user.id;
    payment.voidedAt = new Date();
    await payment.save();
    const updated = await presentConsignment(payment.consignment);
    await Invoice.updateMany({ consignment: payment.consignment, status: { $ne: 'VOID' } }, { $set: { status: updated.payment_status === 'PAID' ? 'PAID' : 'ISSUED', 'snapshot.amountPaid': updated.amount_paid, 'snapshot.balanceDue': updated.balance_due, 'snapshot.paymentStatus': updated.payment_status } });
    res.json(updated);
  } catch (error) { res.status(error.message === 'Payment record not found.' ? 404 : 400).json({ error: error.message }); }
});

app.post('/api/consignments/:id/invoices', requireAuth, requireAdmin, async (req, res) => {
  const consignment = await presentConsignment(req.params.id);
  if (!consignment) return res.status(404).json({ error: 'Customer delivery not found.' });
  if (!consignment.items.length) return res.status(400).json({ error: 'Add at least one delivery item before issuing an invoice.' });
  const year = new Date().getFullYear();
  const prefix = String(req.user.invoice_prefix || 'INV').replace(/[^A-Za-z0-9_-]/g, '').toUpperCase() || 'INV';
  const numberPrefix = `${prefix}-${year}-`;
  const nextNumber = await Invoice.countDocuments({ invoiceNumber: new RegExp(`^${numberPrefix}`) }) + 1;
  const invoiceNumber = `${numberPrefix}${String(nextNumber).padStart(5, '0')}`;
  const publicToken = crypto.randomUUID();
  const publicUrl = `${req.protocol}://${req.get('host')}/delivery/${publicToken}`;
  const snapshot = invoiceSnapshot(consignment, req.user);
  snapshot.publicUrl = publicUrl;
  const invoice = await Invoice.create({ sqliteId: await nextMongoSourceId(Invoice), invoiceNumber, consignment: consignment.id, issuedBy: req.user.id, publicToken, status: consignment.payment_status === 'PAID' ? 'PAID' : 'ISSUED', snapshot, issuedDate: new Date() });
  const qrDataUrl = await QRCode.toDataURL(publicUrl, { width: 220, margin: 1, errorCorrectionLevel: 'M' });
  res.status(201).json({ id: invoice._id.toString(), invoiceNumber, snapshot, publicUrl, qrDataUrl });
});

app.get('/api/invoices/:id/pdf', requireAuth, requireAdmin, async (req, res) => {
  try {
    const invoice = await Invoice.findOne({ _id: req.params.id, status: { $ne: 'VOID' } });
    if (!invoice) return res.status(404).send('Issued invoice not found.');
    const pdf = await createInvoicePdf(invoice, `${req.protocol}://${req.get('host')}`);
    const filename = `Invoice-${invoice.invoiceNumber}.pdf`;
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="${filename}"`,
      'Content-Length': String(pdf.length),
      'Cache-Control': 'private, no-store'
    });
    res.send(pdf);
  } catch (error) {
    res.status(error.message === 'Issued invoice not found.' ? 404 : 500).send(error.message);
  }
});

app.post('/api/invoices/:id/send', requireAuth, requireAdmin, async (req, res) => {
  try {
    const invoice = await Invoice.findOne({ _id: req.params.id, status: { $ne: 'VOID' } });
    if (!invoice) return res.status(404).json({ error: 'Issued invoice not found.' });
    const consignment = await Consignment.findById(invoice.consignment).populate('customer').lean();
    if (!consignment) return res.status(404).json({ error: 'Customer delivery not found.' });
    const recipient = email(req.body.recipient || consignment.customer.billingEmail, 'Billing email', { required: true });
    const customMessage = text(req.body.message, 'Email message') || `Please find your invoice ${invoice.invoiceNumber} attached.`;
    if (customMessage.length > 1000) throw new Error('Email message cannot exceed 1000 characters.');
    const apiKey = process.env.RESEND_API_KEY?.trim();
    const from = process.env.RESEND_FROM_EMAIL?.trim();
    if (!apiKey || !from) return res.status(503).json({ error: 'Invoice email is not configured. Add RESEND_API_KEY and RESEND_FROM_EMAIL on the server.' });
    const pdf = await createInvoicePdf(invoice, `${req.protocol}://${req.get('host')}`);
    const snapshot = invoice.snapshot;
    const subject = `Invoice ${invoice.invoiceNumber} — ${snapshot.business.name}`;
    const emailResponse = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json', 'User-Agent': 'Asanka-Cargo-Invoice-Service/1.0' },
      body: JSON.stringify({
        from, to: [recipient], subject,
        html: `<div style="font-family:Arial,sans-serif;max-width:620px;color:#182536"><h2 style="color:#0D2B45">${escapeHtml(snapshot.business.name)}</h2><p>Hello ${escapeHtml(snapshot.customer.name)},</p><p>${escapeHtml(customMessage).replace(/\n/g, '<br>')}</p><p><strong>Invoice:</strong> ${escapeHtml(invoice.invoiceNumber)}<br><strong>Total:</strong> ${escapeHtml(new Intl.NumberFormat('en-IE', { style: 'currency', currency: snapshot.currency || 'EUR' }).format(snapshot.finalTotal))}<br><strong>Due date:</strong> ${escapeHtml(new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium', timeZone: 'UTC' }).format(new Date(snapshot.dueDate)))}</p><p>Kind regards,<br>${escapeHtml(snapshot.business.name)}</p></div>`,
        attachments: [{ filename: `Invoice-${invoice.invoiceNumber}.pdf`, content: pdf.toString('base64') }]
      })
    });
    const provider = await emailResponse.json().catch(() => ({}));
    if (!emailResponse.ok) throw new Error(provider.message || 'Resend could not send the invoice email.');
    const sent = { recipient, message: customMessage, status: 'SENT', providerId: provider.id, sentAt: new Date(), sentBy: req.user.id };
    invoice.emailHistory.push(sent);
    await invoice.save();
    res.json({ invoice_id: invoice._id.toString(), invoice_number: invoice.invoiceNumber, ...sent });
  } catch (error) {
    res.status(error.message === 'Issued invoice not found.' || error.message === 'Customer delivery not found.' ? 404 : 400).json({ error: error.message });
  }
});

app.get('/delivery/:token', async (req, res) => {
  const invoice = await Invoice.findOne({ publicToken: req.params.token, status: { $ne: 'VOID' } }).lean();
  if (!invoice) return res.status(404).type('html').send('<h1>Delivery details not found</h1>');
  const snapshot = invoice.snapshot;
  const deliveryAddress = snapshot.customer.sriLankanAddress || snapshot.customer.address || snapshot.customer.germanAddress || '—';
  const deliveryPhone = snapshot.customer.phoneSriLanka || snapshot.customer.phone || snapshot.customer.phoneGermany || '';
  const deliveryContactName = snapshot.customer.deliveryContactName || snapshot.customer.name;
  const rows = snapshot.items.map((item, index) => `<tr><td>${index + 1}</td><td>${escapeHtml(item.description || 'Cargo item')}</td><td>${item.quantity}</td></tr>`).join('');
  res.type('html').send(`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Customer delivery</title><style>body{margin:0;background:#f5f6f8;color:#20283a;font:16px system-ui,sans-serif}.page{max-width:760px;margin:0 auto;padding:1rem}.card{background:#fff;border:1px solid #e2e5ea;border-radius:14px;padding:1.25rem;margin:1rem 0}.heading{border-bottom:5px solid #0d2b45}.heading h1{margin:0;font-size:1.5rem}.download{display:inline-block;margin-top:1rem;padding:.65rem .9rem;border-radius:8px;background:#0d2b45;color:#fff;text-decoration:none;font-weight:700}h2{font-size:1rem;margin:0 0 .6rem}p{line-height:1.5;margin:.3rem 0}table{width:100%;border-collapse:collapse;font-size:.9rem}th,td{text-align:left;padding:.65rem;border-bottom:1px solid #e2e5ea}th{background:#f4f5f7}th:last-child,td:last-child{text-align:right}@media(max-width:520px){.page{padding:.5rem}.card{padding:1rem}table{font-size:.8rem}th,td{padding:.5rem}}</style></head><body><main class="page"><section class="card heading"><h1>${escapeHtml(snapshot.customer.name)}</h1><p>Customer reference: <strong>${escapeHtml(snapshot.customer.reference)}</strong></p><a class="download" href="/delivery/${encodeURIComponent(req.params.token)}/download">Download delivery sheet (PDF)</a></section><section class="card"><h2>Ship to</h2><p><strong>${escapeHtml(deliveryContactName)}</strong></p><p>${escapeHtml(deliveryAddress).replace(/\n/g, '<br>')}</p>${deliveryPhone ? `<p>${escapeHtml(deliveryPhone)}</p>` : ''}</section><section class="card"><h2>Items</h2><table><thead><tr><th>#</th><th>Description</th><th>Quantity</th></tr></thead><tbody>${rows}</tbody></table></section></main></body></html>`);
});

app.get('/delivery/:token/download', async (req, res) => {
  const invoice = await Invoice.findOne({ publicToken: req.params.token, status: { $ne: 'VOID' } }).lean();
  if (!invoice) return res.status(404).send('Delivery details not found.');
  const snapshot = invoice.snapshot;
  const deliveryAddress = snapshot.customer.sriLankanAddress || snapshot.customer.address || snapshot.customer.germanAddress || '—';
  const deliveryContactName = snapshot.customer.deliveryContactName || snapshot.customer.name;
  const deliveryPhone = snapshot.customer.phoneSriLanka || snapshot.customer.phone || snapshot.customer.phoneGermany || '';
  const document = new PDFDocument({ size: 'A4', margin: 48 });
  res.attachment('delivery-sheet.pdf');
  document.pipe(res);
  document.fontSize(22).fillColor('#20283a').text('DELIVERY SHEET');
  document.moveTo(48, 82).lineTo(547, 82).strokeColor('#e3bd15').lineWidth(4).stroke();
  document.moveDown(1.5).fillColor('#20283a').fontSize(13).text('Customer');
  document.fontSize(11).text(snapshot.customer.name).text(`Reference: ${snapshot.customer.reference}`);
  document.moveDown().fontSize(13).text('Ship to');
  document.fontSize(11).text(deliveryContactName).text(deliveryAddress);
  if (deliveryPhone) document.text(deliveryPhone);
  document.moveDown().fontSize(13).text('Items for delivery');
  document.moveDown(.5).fontSize(10);
  const columns = [48, 78, 470];
  document.font('Helvetica-Bold').text('#', columns[0]).text('Description', columns[1]).text('Quantity', columns[2]);
  document.moveDown(.5).moveTo(48, document.y).lineTo(547, document.y).strokeColor('#d9dde5').lineWidth(1).stroke();
  document.font('Helvetica');
  snapshot.items.forEach((item, index) => {
    if (document.y > 730) document.addPage();
    document.moveDown(.6);
    const y = document.y;
    document.text(String(index + 1), columns[0], y, { width: 22 });
    document.text(item.description || 'Cargo item', columns[1], y, { width: 360 });
    document.text(String(item.quantity), columns[2], y, { width: 76, align: 'right' });
    document.y = Math.max(document.y, y + 20);
    document.moveTo(48, document.y).lineTo(547, document.y).strokeColor('#e7e9ef').stroke();
  });
  document.end();
});

app.post('/api/consignments/:id/items', requireAuth, requireAdmin, async (req, res) => {
  try {
    const consignmentId = req.params.id;
    if (!await Consignment.exists({ _id: consignmentId })) throw new Error('Consignment not found.');
    await BoxItem.create({ sqliteId: await nextMongoSourceId(BoxItem), consignment: consignmentId, heightCm: number(req.body.height, 'Height', { min: Number.EPSILON }), widthCm: number(req.body.width, 'Width', { min: Number.EPSILON }), depthCm: number(req.body.depth, 'Depth', { min: Number.EPSILON }), quantity: number(req.body.quantity, 'Quantity', { min: 1, integer: true }), description: text(req.body.description, 'Description'), createdAt: new Date() });
    res.status(201).json(await presentConsignment(consignmentId));
  } catch (error) { res.status(error.message === 'Consignment not found.' ? 404 : 400).json({ error: error.message }); }
});

app.put('/api/items/:id', requireAuth, requireAdmin, async (req, res) => {
  try {
    const itemId = req.params.id;
    const item = await BoxItem.findById(itemId);
    if (!item) throw new Error('Item not found.');
    Object.assign(item, { heightCm: number(req.body.height, 'Height', { min: Number.EPSILON }), widthCm: number(req.body.width, 'Width', { min: Number.EPSILON }), depthCm: number(req.body.depth, 'Depth', { min: Number.EPSILON }), quantity: number(req.body.quantity, 'Quantity', { min: 1, integer: true }), description: text(req.body.description, 'Description') });
    await item.save();
    res.json(await presentConsignment(item.consignment));
  } catch (error) { res.status(error.message === 'Item not found.' ? 404 : 400).json({ error: error.message }); }
});

app.delete('/api/consignments/:id', requireAuth, requireAdmin, async (req, res) => {
  try {
    const consignmentId = req.params.id;
    const consignment = await Consignment.findById(consignmentId);
    if (!consignment) throw new Error('Customer delivery not found.');
    const account = await User.findById(req.user.id).select('+passwordHash');
    if (!bcrypt.compareSync(String(req.body.password ?? ''), account.passwordHash)) return res.status(403).json({ error: 'Incorrect password.' });
    if (await Invoice.exists({ consignment: consignmentId })) return res.status(409).json({ error: 'Customer delivery cannot be removed because it has invoices.' });
    if (await Payment.exists({ consignment: consignmentId })) return res.status(409).json({ error: 'Customer delivery cannot be removed because it has payment records.' });
    await BoxItem.deleteMany({ consignment: consignmentId });
    await consignment.deleteOne();
    res.status(204).end();
  } catch (error) { res.status(error.message === 'Customer delivery not found.' ? 404 : 400).json({ error: error.message }); }
});

app.delete('/api/items/:id', requireAuth, requireAdmin, async (req, res) => {
  const item = await BoxItem.findById(req.params.id);
  if (!item) return res.status(404).json({ error: 'Item not found.' });
  await item.deleteOne();
  res.json(await presentConsignment(item.consignment));
});

app.get('/api/system-health', requireAuth, requireOwner, async (req, res, next) => {
  const checkedAt = new Date();
  const started = Date.now();
  try {
    const connection = await connectMongo();
    const [stats, users, administrators, employees, shipments, customers, consignments, items, invoices, payments] = await Promise.all([
      connection.db.command({ dbStats: 1, scale: 1 }),
      User.estimatedDocumentCount(), User.countDocuments({ role: 'ADMIN' }), User.countDocuments({ role: 'USER' }),
      Container.estimatedDocumentCount(), Customer.estimatedDocumentCount(), Consignment.estimatedDocumentCount(),
      BoxItem.estimatedDocumentCount(), Invoice.estimatedDocumentCount(), Payment.estimatedDocumentCount()
    ]);
    const configuredLimit = Number(process.env.MONGODB_STORAGE_LIMIT_BYTES || 0) || null;
    const usedBytes = Number(stats.storageSize || 0) + Number(stats.indexSize || 0);
    res.json({
      checked_at: checkedAt, response_time_ms: Date.now() - started,
      application: { status: 'OPERATIONAL', started_at: serverStartedAt, uptime_seconds: Math.floor(process.uptime()) },
      database: {
        status: connection.readyState === 1 ? 'CONNECTED' : 'DISCONNECTED', collections: stats.collections,
        documents: stats.objects, data_size_bytes: stats.dataSize, storage_size_bytes: stats.storageSize,
        index_size_bytes: stats.indexSize, total_used_bytes: usedBytes, storage_limit_bytes: configuredLimit,
        usage_percent: configuredLimit ? Number(((usedBytes / configuredLimit) * 100).toFixed(2)) : null
      },
      records: { users, administrators, employees, shipments, customers, consignments, items, invoices, payments },
      recent_errors: recentServerErrors.slice(-10).reverse()
    });
  } catch (error) { next(error); }
});

app.use((error, req, res, next) => {
  recentServerErrors.push({ occurred_at: new Date(), method: req.method, path: req.path, type: error.name || 'Error' });
  if (recentServerErrors.length > 50) recentServerErrors.shift();
  console.error('Request failed', { method: req.method, path: req.path, message: error.message });
  if (res.headersSent) return next(error);
  const status = error.type === 'entity.parse.failed' ? 400 : 500;
  res.status(status).json({ error: status === 400 ? 'Invalid JSON request body.' : 'Unexpected server error.' });
});

export default app;
