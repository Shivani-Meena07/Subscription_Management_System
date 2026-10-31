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

MRR normalizes active subscriptions' recurring value to a monthly value: monthly as-is, yearly ÷ 12, weekly × 52 ÷ 12, daily × 365 ÷ 12. It uses pre-tax line prices, includes seat quantity and the discount captured on the subscription, and excludes paused subscriptions. Invoice revenue means successful recorded payments; balances are invoice total less successful payments.

## MVP scope

Authentication and server-side role checks, customer/staff management, products and plans, subscriptions, recurring invoicing, manual/partial payment recording, quotations, discounts, taxes, and data-backed dashboards are implemented as connected API workflows. Password reset email delivery and payment gateway processing are not configured; do not use demo credentials in production.
