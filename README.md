# Cargo Management System

> A full-stack logistics platform for managing shipments, customers, cargo boxes, invoices, payments, and delivery documents from one secure workspace.

[![Node.js](https://img.shields.io/badge/Node.js-20.19%2B-339933?logo=nodedotjs&logoColor=white)](https://nodejs.org/)
[![Express](https://img.shields.io/badge/Express-5-000000?logo=express&logoColor=white)](https://expressjs.com/)
[![MongoDB](https://img.shields.io/badge/MongoDB-Mongoose-47A248?logo=mongodb&logoColor=white)](https://www.mongodb.com/)
[![React](https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=17202A)](https://react.dev/)
[![Vite](https://img.shields.io/badge/Vite-8-646CFF?logo=vite&logoColor=white)](https://vite.dev/)
[![Java](https://img.shields.io/badge/Legacy_Desktop-Java_Swing-ED8B00?logo=openjdk&logoColor=white)](https://www.java.com/)

## Why I built this

Cargo businesses often manage customer details, box measurements, invoices, and payment records across paper forms and disconnected spreadsheets. This project brings those workflows together in one application, reduces repeated data entry, and creates consistent documents for day-to-day operations.

I initially built the system as an offline Java Swing desktop application backed by SQLite. I later redesigned it as a deployable web platform using Node.js, Express, MongoDB, and Vite. The repository captures both versions and demonstrates how I evolve a working product as its requirements grow.

## Product capabilities

- **Shipment management** — create shipments, assign customers, and organize consignments and cargo boxes.
- **Customer records** — save reusable contact, billing, and delivery information without duplicating data between shipments.
- **Volume and pricing calculations** — record box dimensions and calculate cubic volume, shipping charges, and delivery costs.
- **Invoice workflow** — generate professional PDF invoices, preview them, email them to customers, and preserve document history.
- **Payment tracking** — record payments, calculate outstanding balances, and void incorrect transactions while retaining an audit trail.
- **Packing and delivery documents** — produce packing lists and QR-enabled delivery pages for operational use.
- **Shipment tracking workspace** — record container and carrier details with links to official carrier tracking services.
- **Provider-ready automatic tracking** — receive normalized milestone events through a webhook architecture, with a transparent mock provider for portfolio demonstrations.
- **Role-based administration** — separate owner, administrator, and employee permissions with account management controls.
- **Business settings** — maintain reusable company and account information for consistent customer-facing documents.

## Engineering highlights

This project demonstrates more than CRUD screens. It includes:

- Secure password hashing with BCrypt.
- JWT authentication stored in HTTP-only cookies.
- Role-based authorization enforced by the API.
- Session invalidation after security-sensitive account changes.
- MongoDB models and a one-time, repeatable SQLite-to-MongoDB migration.
- Server-side PDF generation and transactional email integration.
- QR-code generation for delivery workflows.
- Vercel-compatible serverless API routing.
- Environment-based configuration with secrets excluded from source control.
- Responsive interfaces for login, administration, shipments, and customer workflows.
- An incremental React migration that modernizes high-value screens without interrupting established business workflows.
- Backward-compatible preservation of the original Java/SQLite desktop implementation.

## Technology stack

| Layer | Technologies |
| --- | --- |
| Frontend | React 19, JavaScript, HTML5, CSS3, Vite 8 |
| Backend | Node.js, Express 5 |
| Database | MongoDB, Mongoose; SQLite for the original desktop app and migration source |
| Security | JWT, BCrypt, HTTP-only cookies, role-based access control |
| Documents | PDFKit, QRCode |
| Email | Resend transactional email API |
| Deployment | Vercel serverless functions |
| Original desktop app | Java Swing, JDBC, SQLite, Maven |

## Architecture

```text
Browser
  ├── Single-page operations interface
  ├── React components for login and shipment workflows
  ├── Compatibility layer for established operational screens
  └── Relative /api requests
          │
          ▼
Express API
  ├── Authentication and authorization
  ├── Shipment and customer workflows
  ├── Invoice, payment, and document services
  └── Email and QR generation
          │
          ▼
MongoDB Atlas
  └── Users, shipments, customers, boxes, invoices, and audit records
```

The production web application uses MongoDB. SQLite remains available only for the original desktop application and the local one-time data migration; it is not used by the deployed serverless application.

### Frontend modernization strategy

The web client is a single-page application. Its frontend is being migrated to React incrementally instead of through a high-risk rewrite. React currently owns the login screen, shipment list, and shipment-creation form. The compatibility layer in `public/app.js` continues to coordinate the mature customer, invoice, document, tracking, and administration workflows.

This approach keeps working functionality available while improving the codebase in reviewable stages:

1. Identify a screen with a clear responsibility and limited dependencies.
2. Move its rendering and local interaction state into a React component.
3. Preserve the existing API calls and domain workflow through explicit callbacks.
4. Run syntax checks and a production build before migrating another screen.

The result demonstrates practical modernization: reducing technical debt while managing regression risk and preserving business continuity.

### Manual journey tracking and provider-ready automation

The default workflow is manual, so it requires no paid carrier API. Administrators copy confirmed and planned milestones from the official carrier website into a collapsible journey table. Confirmed history uses a solid green timeline, planned milestones use a broken gray timeline, and the application derives the latest status, route, vessel, and ETA from those events.

```env
TRACKING_PROVIDER=manual
TRACKING_WEBHOOK_SECRET=replace-with-a-random-webhook-secret
```

The repository also retains a mock provider behind the same normalized event boundary intended for a future commercial integration. Setting `TRACKING_PROVIDER=mock` creates clearly labeled demonstration events, but manual mode is recommended for real operational records until a carrier-data subscription is available.

Moving to production tracking requires a provider adapter, provider credentials, webhook registration, and validation with real shipments. Changing `TRACKING_PROVIDER` alone is intentionally rejected unless that adapter is installed; the application never presents mock events as live carrier data.

## Run locally

### Prerequisites

- Node.js 20.19 or newer
- npm
- A MongoDB database

### Installation

```bash
git clone https://github.com/madushanbandara98/Cargo_Management_System.git
cd Cargo_Management_System
npm install
cp .env.example .env
```

Set at least these values in `.env`:

```env
MONGODB_URI=mongodb+srv://USERNAME:PASSWORD@CLUSTER.mongodb.net/cargo_management
JWT_SECRET=replace_with_a_random_secret_of_at_least_32_characters
```

Start the API:

```bash
npm run dev:api
```

In a second terminal, start the frontend:

```bash
npm run dev
```

Open the local URL printed by Vite, normally `http://localhost:5173`.

## Quality checks

```bash
npm run check
npm run build
```

`npm run check` validates the Node.js server, API, database, migration, administration, and compatibility-layer entry points. `npm run build` compiles the React client and creates the optimized production bundle.

## Project structure

```text
.
├── api/                    # Vercel serverless entry point
├── public/                 # SPA interface, React entry point, and frontend assets
│   ├── src/main.jsx        # React screens and incremental migration bridges
│   └── app.js              # Established application workflows and API coordination
├── scripts/                # Migration and administrator utilities
├── server/                 # Express API, persistence, and domain workflows
│   └── mongo/              # MongoDB connection and Mongoose models
├── src/main/java/          # Original Java Swing desktop application
├── .env.example            # Safe environment-variable template
├── vercel.json             # Build and serverless routing configuration
├── vite.config.js          # Local development and build configuration
└── pom.xml                 # Original Java/Maven project configuration
```

## Data migration

The migration utility imports existing SQLite records into MongoDB using stable source identifiers and upserts. It is designed to be safe to run more than once and opens the SQLite source in read-only mode.

```bash
npm run migrate:mongo
```

Run migrations locally and verify the imported collection counts before deploying. See [README-WEB.md](README-WEB.md) for the complete deployment and migration guide.

## What this project demonstrates

- Translating a real operational problem into maintainable software workflows.
- Modernizing a desktop application into a cloud-ready full-stack product.
- Designing relational and document-oriented data models.
- Building security-sensitive authentication and administration features.
- Generating business documents and integrating external services.
- Preserving data through an idempotent migration strategy.
- Incrementally modernizing a production-style frontend without discarding working domain logic.
- Separating React presentation state from API and business-workflow responsibilities.
- Taking ownership across product design, backend engineering, frontend development, and deployment.

## Suggested code-review path

For a focused technical review, start with:

1. [`public/src/main.jsx`](public/src/main.jsx) — React components and the incremental migration boundary.
2. [`public/app.js`](public/app.js) — cargo workflows, UI orchestration, and document interactions.
3. [`server/index.js`](server/index.js) — authentication, authorization, validation, and domain API routes.
4. [`server/mongo/models.js`](server/mongo/models.js) — MongoDB domain models and constraints.
5. [`scripts/migrate-to-mongo.js`](scripts/migrate-to-mongo.js) — repeatable SQLite-to-MongoDB migration.

## Author

### Madushan Bandara

Full-stack software developer focused on practical, secure, and user-friendly business applications.

- GitHub: [@madushanbandara98](https://github.com/madushanbandara98)

If this project interests you, feel free to explore the code, open an issue, or contact me through GitHub.

## License

This project currently has no open-source license. The source is available for portfolio and evaluation purposes; all rights are reserved unless a license is added later.
