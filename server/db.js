import Database from 'better-sqlite3';
import bcrypt from 'bcryptjs';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const databasePath = path.resolve(process.env.DATABASE_PATH || './data/cargo-web.db');
fs.mkdirSync(path.dirname(databasePath), { recursive: true });

export const db = new Database(databasePath);
db.pragma('foreign_keys = ON');
db.pragma('journal_mode = WAL');

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY,
    username TEXT NOT NULL UNIQUE COLLATE NOCASE,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL CHECK(role IN ('ADMIN', 'USER')),
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS shipments (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    reference TEXT NOT NULL UNIQUE,
    status TEXT NOT NULL DEFAULT 'OPEN' CHECK(status IN ('OPEN', 'ARCHIVED')),
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    created_by INTEGER NOT NULL REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS customers (
    id INTEGER PRIMARY KEY,
    customer_ref TEXT NOT NULL UNIQUE,
    customer_name TEXT NOT NULL,
    customer_id TEXT,
    german_address TEXT,
    sri_lankan_address TEXT,
    phone_de TEXT,
    phone_lk TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS consignments (
    id INTEGER PRIMARY KEY,
    shipment_id INTEGER NOT NULL REFERENCES shipments(id) ON DELETE RESTRICT,
    customer_id INTEGER NOT NULL REFERENCES customers(id) ON DELETE RESTRICT,
    rate_per_cubic REAL NOT NULL DEFAULT 530 CHECK(rate_per_cubic >= 0),
    delivery_charge REAL NOT NULL DEFAULT 0 CHECK(delivery_charge >= 0),
    all_items_entered INTEGER NOT NULL DEFAULT 0 CHECK(all_items_entered IN (0, 1)),
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(shipment_id, customer_id)
  );

  CREATE TABLE IF NOT EXISTS consignment_items (
    id INTEGER PRIMARY KEY,
    consignment_id INTEGER NOT NULL REFERENCES consignments(id) ON DELETE CASCADE,
    height_cm REAL NOT NULL CHECK(height_cm > 0),
    width_cm REAL NOT NULL CHECK(width_cm > 0),
    depth_cm REAL NOT NULL CHECK(depth_cm > 0),
    quantity INTEGER NOT NULL CHECK(quantity > 0),
    description TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS documents (
    id INTEGER PRIMARY KEY,
    consignment_id INTEGER NOT NULL REFERENCES consignments(id) ON DELETE CASCADE,
    file_path TEXT NOT NULL,
    document_type TEXT NOT NULL DEFAULT 'INVOICE',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS invoices (
    id INTEGER PRIMARY KEY,
    invoice_number TEXT NOT NULL UNIQUE,
    consignment_id INTEGER NOT NULL REFERENCES consignments(id) ON DELETE RESTRICT,
    issued_by INTEGER NOT NULL REFERENCES users(id),
    public_token TEXT NOT NULL UNIQUE,
    status TEXT NOT NULL DEFAULT 'ISSUED' CHECK(status IN ('ISSUED', 'PAID', 'VOID')),
    snapshot_json TEXT NOT NULL,
    issued_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
`);

const userColumns = db.prepare('PRAGMA table_info(users)').all().map(column => column.name);
for (const [name, definition] of Object.entries({
  full_name: 'TEXT NOT NULL DEFAULT \'\'',
  business_name: 'TEXT NOT NULL DEFAULT \'\'',
  phone: 'TEXT NOT NULL DEFAULT \'\'',
  email: 'TEXT NOT NULL DEFAULT \'\'',
  business_address: 'TEXT NOT NULL DEFAULT \'\''
})) {
  if (!userColumns.includes(name)) db.exec(`ALTER TABLE users ADD COLUMN ${name} ${definition}`);
}

const invoiceColumns = db.prepare('PRAGMA table_info(invoices)').all().map(column => column.name);
if (!invoiceColumns.includes('public_token')) db.exec('ALTER TABLE invoices ADD COLUMN public_token TEXT');
const invoicesWithoutToken = db.prepare('SELECT id FROM invoices WHERE public_token IS NULL OR public_token = ?').all('');
const updateInvoiceToken = db.prepare('UPDATE invoices SET public_token = ? WHERE id = ?');
for (const invoice of invoicesWithoutToken) updateInvoiceToken.run(crypto.randomUUID(), invoice.id);
db.exec('CREATE UNIQUE INDEX IF NOT EXISTS invoices_public_token_unique ON invoices(public_token)');

const admin = db.prepare('SELECT id FROM users WHERE username = ?').get('admin');
if (!admin) {
  const defaultPassword = process.env.INITIAL_ADMIN_PASSWORD || 'admin123';
  db.prepare('INSERT INTO users (username, password_hash, role) VALUES (?, ?, ?)')
    .run('admin', bcrypt.hashSync(defaultPassword, 12), 'ADMIN');
  console.warn('Created initial admin user. Change its password immediately.');
}
db.prepare("UPDATE users SET business_name = 'Asanka Cargo' WHERE username = 'admin' AND business_name = ''").run();

export function consignmentSummary(consignmentId) {
  return db.prepare(`
    SELECT c.id, c.shipment_id, c.customer_id, c.rate_per_cubic, c.delivery_charge,
           c.all_items_entered, c.created_at, c.updated_at,
           s.name AS shipment_name, s.reference AS shipment_reference,
           cu.customer_ref, cu.customer_name, cu.customer_id AS customer_identity,
           cu.german_address, cu.sri_lankan_address, cu.phone_de, cu.phone_lk,
           COALESCE(SUM(i.height_cm * i.width_cm * i.depth_cm / 1000000.0 * i.quantity), 0) AS total_cubic,
           COALESCE(SUM(i.quantity), 0) AS total_items
      FROM consignments c
      JOIN shipments s ON s.id = c.shipment_id
      JOIN customers cu ON cu.id = c.customer_id
      LEFT JOIN consignment_items i ON i.consignment_id = c.id
     WHERE c.id = ?
     GROUP BY c.id
  `).get(consignmentId);
}

export function consignmentItems(consignmentId, ratePerCubic) {
  return db.prepare(`
    SELECT id, height_cm, width_cm, depth_cm, quantity, description,
      ROUND(height_cm * width_cm * depth_cm / 1000000.0, 3) AS cubic_per_item,
      ROUND(height_cm * width_cm * depth_cm / 1000000.0 * quantity * ?, 2) AS amount
    FROM consignment_items WHERE consignment_id = ? ORDER BY id
  `).all(ratePerCubic, consignmentId);
}
