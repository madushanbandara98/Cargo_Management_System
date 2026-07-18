import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import { connectMongo, disconnectMongo } from '../server/mongo/connection.js';
import { User, Container, Customer, Consignment, BoxItem, Document, Invoice, migrationModels } from '../server/mongo/models.js';

const sqlitePath = path.resolve(process.env.DATABASE_PATH || './data/cargo-web.db');

function sqliteDate(value, field) {
  if (!value) throw new Error(`Missing SQLite date in ${field}`);
  const normalized = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(value)
    ? `${value.replace(' ', 'T')}Z`
    : value;
  const date = new Date(normalized);
  if (Number.isNaN(date.getTime())) throw new Error(`Invalid SQLite date in ${field}: ${value}`);
  return date;
}

async function upsertMany(Model, rows) {
  if (!rows.length) return;
  await Model.bulkWrite(rows.map(({ sqliteId, ...data }) => ({
    updateOne: {
      filter: { sqliteId },
      update: { $set: data, $setOnInsert: { sqliteId } },
      upsert: true
    }
  })), { ordered: true });
}

async function idMap(Model) {
  const records = await Model.find({}, { sqliteId: 1 }).lean();
  return new Map(records.map(record => [record.sqliteId, record._id]));
}

function requireReference(map, sqliteId, description) {
  const objectId = map.get(sqliteId);
  if (!objectId) throw new Error(`Missing referenced ${description} with SQLite id ${sqliteId}`);
  return objectId;
}

async function migrate(sqlite) {
  const users = sqlite.prepare('SELECT * FROM users ORDER BY id').all();
  await upsertMany(User, users.map(row => ({
    sqliteId: row.id, username: row.username, passwordHash: row.password_hash, role: row.role,
    fullName: row.full_name || '', businessName: row.business_name || '', phone: row.phone || '',
    email: row.email || '', businessAddress: row.business_address || '',
    createdAt: sqliteDate(row.created_at, `users.${row.id}.created_at`)
  })));
  const userIds = await idMap(User);

  const shipments = sqlite.prepare('SELECT * FROM shipments ORDER BY id').all();
  await upsertMany(Container, shipments.map(row => ({
    sqliteId: row.id, name: row.name, reference: row.reference, status: row.status,
    createdBy: requireReference(userIds, row.created_by, 'user'),
    createdAt: sqliteDate(row.created_at, `shipments.${row.id}.created_at`)
  })));
  const containerIds = await idMap(Container);

  const customers = sqlite.prepare('SELECT * FROM customers ORDER BY id').all();
  await upsertMany(Customer, customers.map(row => ({
    sqliteId: row.id, customerRef: row.customer_ref, name: row.customer_name,
    identityNumber: row.customer_id || '', germanAddress: row.german_address || '',
    sriLankanAddress: row.sri_lankan_address || '', phoneDE: row.phone_de || '', phoneLK: row.phone_lk || '',
    createdAt: sqliteDate(row.created_at, `customers.${row.id}.created_at`),
    updatedAt: sqliteDate(row.updated_at, `customers.${row.id}.updated_at`)
  })));
  const customerIds = await idMap(Customer);

  const consignments = sqlite.prepare('SELECT * FROM consignments ORDER BY id').all();
  await upsertMany(Consignment, consignments.map(row => ({
    sqliteId: row.id, container: requireReference(containerIds, row.shipment_id, 'container'),
    customer: requireReference(customerIds, row.customer_id, 'customer'), ratePerCubic: row.rate_per_cubic,
    deliveryCharge: row.delivery_charge, allItemsEntered: Boolean(row.all_items_entered),
    createdAt: sqliteDate(row.created_at, `consignments.${row.id}.created_at`),
    updatedAt: sqliteDate(row.updated_at, `consignments.${row.id}.updated_at`)
  })));
  const consignmentIds = await idMap(Consignment);

  const items = sqlite.prepare('SELECT * FROM consignment_items ORDER BY id').all();
  await upsertMany(BoxItem, items.map(row => ({
    sqliteId: row.id, consignment: requireReference(consignmentIds, row.consignment_id, 'consignment'),
    heightCm: row.height_cm, widthCm: row.width_cm, depthCm: row.depth_cm,
    quantity: row.quantity, description: row.description || '',
    createdAt: sqliteDate(row.created_at, `consignment_items.${row.id}.created_at`)
  })));

  const documents = sqlite.prepare('SELECT * FROM documents ORDER BY id').all();
  await upsertMany(Document, documents.map(row => ({
    sqliteId: row.id, consignment: requireReference(consignmentIds, row.consignment_id, 'consignment'),
    filePath: row.file_path, documentType: row.document_type,
    createdAt: sqliteDate(row.created_at, `documents.${row.id}.created_at`)
  })));

  const invoices = sqlite.prepare('SELECT * FROM invoices ORDER BY id').all();
  await upsertMany(Invoice, invoices.map(row => {
    const snapshot = JSON.parse(row.snapshot_json);
    if (snapshot.issuedDate) snapshot.issuedDate = sqliteDate(snapshot.issuedDate, `invoices.${row.id}.snapshot.issuedDate`);
    return {
      sqliteId: row.id, invoiceNumber: row.invoice_number,
      consignment: requireReference(consignmentIds, row.consignment_id, 'consignment'),
      issuedBy: requireReference(userIds, row.issued_by, 'user'), publicToken: row.public_token,
      status: row.status, snapshot,
      issuedDate: sqliteDate(row.issued_at, `invoices.${row.id}.issued_at`)
    };
  }));

  return { users, shipments, customers, consignments, items, documents, invoices };
}

let sqlite;
try {
  if (!fs.existsSync(sqlitePath)) throw new Error(`SQLite database not found: ${sqlitePath}`);
  sqlite = new Database(sqlitePath, { readonly: true, fileMustExist: true });
  sqlite.pragma('query_only = ON');
  await connectMongo();
  await Promise.all(Object.values(migrationModels).map(Model => Model.init()));
  const migrated = await migrate(sqlite);
  console.log(`Migration complete (source: ${sqlitePath}, opened read-only).`);
  for (const [name, rows] of Object.entries(migrated)) console.log(`${name}: ${rows.length}`);
  console.log('Rerunning this command is safe: records are upserted by unique sqliteId.');
} catch (error) {
  console.error(`Migration failed: ${error.message}`);
  process.exitCode = 1;
} finally {
  sqlite?.close();
  await disconnectMongo().catch(() => {});
}
