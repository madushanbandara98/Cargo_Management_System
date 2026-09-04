# Cargo Management Web Application

The web application uses a React/Vite production build, an Express API, and
MongoDB Atlas. On Vercel, Express runs as a serverless Function from
`api/index.js`. The retained SQLite database is used only by the one-time local
migration and is not read by the deployed application.

## Native mobile development

This branch also contains Capacitor projects for Android and iOS. The native
applications reuse the Vite frontend and communicate with the deployed Express
API; they must never connect directly to MongoDB.

Set the public HTTPS API address when producing a native build:

```bash
npm run build:native
```

Then open a generated native project:

```bash
npm run native:android
npm run native:ios
```

Android development requires Android Studio. iOS development requires Xcode
on macOS. The API must explicitly allow the native application origin, and its
authentication flow must be tested on real devices before distribution.
Capacitor's native cookie bridge is enabled so the existing HTTP-only session
cookie can be shared with native API requests. For iOS, add the deployed API
hostname to `WKAppBoundDomains` in `ios/App/App/Info.plist` after the final API
domain is known. This branch currently targets
`https://cargo-management-system-ten.vercel.app` through `.env.native`.
Native bearer sessions are stored with `@aparajita/capacitor-secure-storage`,
which uses iOS Keychain and Android Keystore. The web build continues to use
HTTP-only cookies and does not use the plugin's web storage fallback.

## Local development

1. Copy `.env.example` to `.env`.
2. Set `MONGODB_URI` and a random `JWT_SECRET` of at least 32 characters.
3. Install packages with `npm install`.
4. Start the API in one terminal with `npm run dev:api`.
5. Start Vite in another terminal with `npm run dev`.
6. Open the URL printed by Vite (normally `http://localhost:5173`).

The default `TRACKING_PROVIDER=manual` enables a complete confirmed/planned journey timeline without external credentials. Set a strong `TRACKING_WEBHOOK_SECRET` before testing the webhook endpoint. The optional `mock` provider is for clearly labeled demonstrations only. Production tracking additionally requires an installed provider adapter and credentials from that provider; unsupported provider names fail closed instead of falling back to simulated data.

Vite proxies `/api` and `/delivery` to the local Express server. Frontend code
uses relative `/api/...` URLs, so no localhost API URL is built into production.

## Deploy to Vercel

1. Push the project to a private Git repository. Confirm `.env`, `data/`, and
   `node_modules/` are not committed.
2. Import the repository in Vercel and keep the framework preset as **Vite**.
   The included `vercel.json` supplies the build output and API rewrites.
3. In **Project Settings → Environment Variables**, add these server variables:

   - `MONGODB_URI`: the MongoDB Atlas connection string.
   - `JWT_SECRET`: a cryptographically random value of at least 32 characters.
   - `MONGODB_DB` (optional): an explicit Atlas database name.
   - `TRACKING_PROVIDER`: keep `manual` until a production adapter is installed; `mock` is available only for labeled demonstrations.
   - `TRACKING_WEBHOOK_SECRET`: a random secret used to authenticate incoming tracking updates.

   Add them to Production and any Preview environments that need database
   access. Never prefix these values with `VITE_`; `VITE_` variables are exposed
   to browser code.
4. In MongoDB Atlas **Network Access**, allow connections from Vercel. Atlas does
   not provide fixed Vercel Function IPs on standard deployments, so commonly
   this is `0.0.0.0/0` together with a strong database username/password and
   least-privilege database permissions. Use a private networking option if your
   Vercel and Atlas plans support one.
5. Deploy. Verify the login page, sign-in, shipment list, customer saving, invoice
   preview, and packing-list download on the Vercel URL.

Generate a suitable JWT secret locally without committing it:

```bash
openssl rand -base64 48
```

## One-time SQLite to MongoDB migration

Run this locally, not in Vercel:

```bash
npm run migrate:mongo
```

The migration opens SQLite read-only and upserts by unique `sqliteId`, making it
safe to rerun. It does not delete or modify SQLite. Verify collection counts in
Atlas for users, containers, customers, consignments, box items, documents, and
invoices. Invoice `issuedDate` is stored as a native BSON Date.

## Production checks

```bash
npm run check
npm run build
```

Server errors are logged without returning stack traces or database details to
the browser. Authentication is stored in a signed, HTTP-only, secure cookie in
production and uses `JWT_SECRET` only inside the Express API.
