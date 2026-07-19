import mongoose from 'mongoose';

const { Schema, model, models } = mongoose;
const sourceId = { type: Number, required: true, unique: true, index: true, immutable: true };

const userSchema = new Schema({
  sqliteId: sourceId,
  username: { type: String, required: true, unique: true, trim: true },
  passwordHash: { type: String, required: true, select: false },
  sessionVersion: { type: Number, required: true, default: 0 },
  role: { type: String, required: true, enum: ['ADMIN', 'USER'] },
  enabled: { type: Boolean, required: true, default: true },
  fullName: { type: String, default: '' },
  businessName: { type: String, default: '' },
  businessTagline: { type: String, default: '' },
  registrationNumber: { type: String, default: '' },
  vatNumber: { type: String, default: '' },
  businessLogo: { type: String, default: '' },
  phone: { type: String, default: '' },
  phoneSriLanka: { type: String, default: '' },
  email: { type: String, default: '' },
  website: { type: String, default: '' },
  businessAddress: { type: String, default: '' },
  sriLankanAddress: { type: String, default: '' },
  defaultCurrency: { type: String, default: 'EUR' },
  invoicePrefix: { type: String, default: 'INV' },
  paymentTermsDays: { type: Number, default: 14, min: 0, max: 365 },
  invoiceAccentColor: { type: String, default: '#0D2B45' },
  bankName: { type: String, default: '' },
  accountHolder: { type: String, default: '' },
  iban: { type: String, default: '' },
  bic: { type: String, default: '' },
  createdAt: { type: Date, required: true }
}, { versionKey: false });

const containerSchema = new Schema({
  sqliteId: sourceId,
  name: { type: String, required: true },
  reference: { type: String, required: true, unique: true },
  status: { type: String, required: true, enum: ['OPEN', 'ACTIVE', 'ARCHIVED'] },
  createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  createdAt: { type: Date, required: true }
}, { versionKey: false });

const customerSchema = new Schema({
  sqliteId: sourceId,
  customerRef: { type: String, required: true, unique: true },
  name: { type: String, required: true },
  identityNumber: { type: String, default: '' },
  pickupContactName: { type: String, default: '' },
  germanAddress: { type: String, default: '' },
  deliveryContactName: { type: String, default: '' },
  sriLankanAddress: { type: String, default: '' },
  phoneDE: { type: String, default: '' },
  phoneLK: { type: String, default: '' },
  createdAt: { type: Date, required: true },
  updatedAt: { type: Date, required: true }
}, { versionKey: false });

const consignmentSchema = new Schema({
  sqliteId: sourceId,
  container: { type: Schema.Types.ObjectId, ref: 'Container', required: true },
  customer: { type: Schema.Types.ObjectId, ref: 'Customer', required: true },
  ratePerCubic: { type: Number, required: true, min: 0 },
  deliveryCharge: { type: Number, required: true, min: 0 },
  discount: { type: Number, required: true, min: 0, default: 0 },
  allItemsEntered: { type: Boolean, required: true },
  deliveryStatus: { type: String, required: true, enum: ['PENDING', 'DELIVERED'], default: 'PENDING' },
  deliveredAt: { type: Date, default: null },
  deliveredBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
  createdAt: { type: Date, required: true },
  updatedAt: { type: Date, required: true }
}, { versionKey: false });
consignmentSchema.index({ container: 1, customer: 1 }, { unique: true });

const boxItemSchema = new Schema({
  sqliteId: sourceId,
  consignment: { type: Schema.Types.ObjectId, ref: 'Consignment', required: true },
  heightCm: { type: Number, required: true, min: 0 },
  widthCm: { type: Number, required: true, min: 0 },
  depthCm: { type: Number, required: true, min: 0 },
  quantity: { type: Number, required: true, min: 1 },
  description: { type: String, default: '' },
  createdAt: { type: Date, required: true }
}, { versionKey: false });

const invoiceSchema = new Schema({
  sqliteId: sourceId,
  invoiceNumber: { type: String, required: true, unique: true },
  consignment: { type: Schema.Types.ObjectId, ref: 'Consignment', required: true },
  issuedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  publicToken: { type: String, required: true, unique: true },
  status: { type: String, required: true, enum: ['ISSUED', 'PAID', 'VOID'] },
  snapshot: { type: Schema.Types.Mixed, required: true },
  issuedDate: { type: Date, required: true }
}, { versionKey: false });

const documentSchema = new Schema({
  sqliteId: sourceId,
  consignment: { type: Schema.Types.ObjectId, ref: 'Consignment', required: true },
  filePath: { type: String, required: true },
  documentType: { type: String, required: true },
  createdAt: { type: Date, required: true }
}, { versionKey: false });

const paymentSchema = new Schema({
  sqliteId: sourceId,
  consignment: { type: Schema.Types.ObjectId, ref: 'Consignment', required: true, index: true },
  amount: { type: Number, required: true, min: 0.01 },
  method: { type: String, required: true, enum: ['BANK_TRANSFER', 'CASH', 'CARD', 'OTHER'] },
  paymentDate: { type: Date, required: true },
  reference: { type: String, default: '' },
  notes: { type: String, default: '' },
  status: { type: String, required: true, enum: ['ACTIVE', 'VOID'], default: 'ACTIVE' },
  recordedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  voidedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
  voidedAt: { type: Date, default: null },
  voidReason: { type: String, default: '' },
  createdAt: { type: Date, required: true }
}, { versionKey: false });

const shipmentTrackingSchema = new Schema({
  sqliteId: sourceId,
  containerNumber: { type: String, required: true, unique: true },
  carrier: { type: String, required: true },
  trackingUrl: { type: String, default: '' },
  origin: { type: String, default: '' },
  destination: { type: String, default: '' },
  vessel: { type: String, default: '' },
  latestStatus: { type: String, default: 'Not updated' },
  status: { type: String, required: true, enum: ['NOT_UPDATED', 'IN_TRANSIT', 'DELAYED', 'ARRIVING_SOON', 'DELIVERED'], default: 'NOT_UPDATED' },
  eta: { type: Date, default: null },
  createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  createdAt: { type: Date, required: true },
  updatedAt: { type: Date, required: true }
}, { versionKey: false });

const counterSchema = new Schema({
  _id: { type: String, required: true },
  sequence: { type: Number, required: true, default: 0 }
}, { versionKey: false });

export const User = models.User || model('User', userSchema);
export const Container = models.Container || model('Container', containerSchema);
export const Shipment = Container;
export const Customer = models.Customer || model('Customer', customerSchema);
export const Consignment = models.Consignment || model('Consignment', consignmentSchema);
export const BoxItem = models.BoxItem || model('BoxItem', boxItemSchema);
export const Invoice = models.Invoice || model('Invoice', invoiceSchema);
export const Document = models.Document || model('Document', documentSchema);
export const Payment = models.Payment || model('Payment', paymentSchema);
export const ShipmentTracking = models.ShipmentTracking || model('ShipmentTracking', shipmentTrackingSchema);
export const Counter = models.Counter || model('Counter', counterSchema);

export async function nextMongoSourceId(Model) {
  const counter = await Counter.findOneAndUpdate(
    { _id: Model.collection.collectionName },
    { $inc: { sequence: -1 } },
    { upsert: true, new: true, setDefaultsOnInsert: false }
  );
  return counter.sequence;
}

export const migrationModels = { User, Container, Customer, Consignment, BoxItem, Document, Invoice, Payment };
