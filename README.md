# SubSight

SubSight is a subscription and billing workspace for Brightloop Software, built with React, Vite, Tailwind CSS, Express, and MongoDB.

## Requirements

- Node.js 20+
- MongoDB (local or hosted)

## Run locally

1. Copy `backend/.env.example` to `backend/.env`, set `MONGODB_URI`, choose a private random `JWT_SECRET` of at least 32 characters, and set a strong `ADMIN_PASSWORD`.
2. From `backend`, run `npm install`, then `npm run seed` to create the configured initial admin, and `npm run dev`.
3. From `frontend`, run `npm install`, then `npm run dev`.
4. Open the Vite URL and sign in with the configured admin email and password.

The API listens on port 4000 by default; Vite proxies `/api` requests to it. Billing amounts use INR (₹). Dashboard metrics are derived from persisted records; a fresh database is intentionally empty. For real reset emails, configure the `SMTP_*` settings in `backend/.env`; in development, the reset token is returned by the API for manual testing.

## Billing rules

Invoice lines apply an eligible discount before tax. Tax rates and applied amounts are snapshotted on each invoice. Recurring invoice generation uses a unique subscription-and-period key, so rerunning billing cannot create a duplicate invoice for a billing period. The daily scheduler and the manual “Generate due invoices” action share the same billing service.

Monthly and yearly date arithmetic clamps to the last available day in the target month (for example, January 31 to February 28). Each later period advances from the stored billing date. Seat quantities must be positive whole numbers. Existing subscription line prices and tax rates remain usable even if a referenced product is removed from the catalogue. Zero-value invoices are immediately settled.

Quotation status changes accept both `PATCH` and the existing frontend's `POST` requests. A unique quotation reference prevents repeated acceptance from creating multiple subscriptions. On an existing database, resolve any duplicate quotation references before starting the API so the unique index can be built.

Payment balances and invoice status change together in one atomic invoice update, with two-decimal rounding. A failed payment-record write compensates the reserved amount without undoing other payments. Invoice and payment records still live in separate documents: a process crash or database outage between those writes requires reconciliation. This implementation does not provide a multi-document transaction or payment-request idempotency.

## Authentication behavior

Logout invalidates all existing login tokens for that user, across devices. Password reset atomically consumes the reset token and also invalidates previous login tokens. Reset credentials and the internal token version are excluded from ordinary user queries. The reset token still expires after 30 minutes; expiry is checked by the API and does not delete the user document.

## Backend tests

Run `npm test` from `backend` for the unit tests. Database integration tests run when `TEST_MONGODB_URI` is set. In PowerShell, with a local MongoDB instance running:

```powershell
$env:TEST_MONGODB_URI = 'mongodb://127.0.0.1:27017'
npm.cmd test
```

Integration tests create a randomly named `subsight_test_*` database and drop only that database during cleanup. They cover real HTTP requests, quotation conversion, concurrent payments, compensation, recurring billing retries, authorization and password resets. The API can be imported for testing without starting the scheduler or opening a database connection.

MRR normalizes active subscriptions' recurring value to a monthly value: monthly as-is, yearly ÷ 12, weekly × 52 ÷ 12, daily × 365 ÷ 12. It uses pre-tax line prices, includes seat quantity and the discount captured on the subscription, and excludes paused subscriptions. Invoice revenue means successful recorded payments; balances are invoice total less successful payments.

## MVP scope

Authentication and server-side role checks, customer/staff management, products and plans, subscriptions, recurring invoicing, manual/partial payment recording, quotations, discounts, taxes, and data-backed dashboards are implemented as connected API workflows. Password reset email delivery and payment gateway processing are not configured; do not use demo credentials in production.
