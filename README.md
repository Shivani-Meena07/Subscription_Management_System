# SubSight
### Subscription Management & Billing Automation Platform

**SubSight** is a unified subscription management and billing platform developed for Brightloop Software. It streamlines subscription operations, automates recurring invoicing, centralises payment records, and provides real-time visibility into financial activity.

Designed to bring the complete subscription lifecycle into one workspace, SubSight connects customer management, plan configuration, quotations, billing, payments, and financial reporting through integrated workflows.

---

## Overview

Managing recurring subscriptions across disconnected spreadsheets and manual processes can lead to missed renewals, billing inconsistencies, delayed payments, and limited financial visibility.

SubSight addresses these operational challenges through a centralised system that connects subscription records with automated billing workflows and financial monitoring.

## Core Modules

| Module | Capabilities |
|---|---|
| **Dashboard** | Revenue metrics, active subscriptions, outstanding balances, and billing overview |
| **Customer Management** | Centralised customer records and role-based access |
| **Products & Plans** | Product configuration, pricing, variants, and billing frequencies |
| **Subscriptions** | Subscription lifecycle management, renewals, pauses, and closures |
| **Quotations** | Quotation creation and validity management |
| **Invoicing** | Recurring invoice generation, tax calculation, and discount application |
| **Payments** | Full and partial payment recording and balance tracking |
| **Reports** | Financial summaries and subscription analytics |
| **Audit & Checks** | Monitoring and reviewing subscription and billing records |

## Platform Capabilities

### Subscription Lifecycle Management
Manage subscriptions through structured stages:

`Draft → Quotation → Confirmed → Active → Closed`

Configure billing frequencies, quantities, subscription pricing, availability dates, and lifecycle operations.

Customers may submit pause, cancellation, and renewal requests from their subscription list. Admins and staff review pending requests in the **Customer requests** section on the Subscriptions page. Requests remain in the subscription history with their status, submission time, review time, and reviewer. A pending request of the same type cannot be submitted twice. Renewal is available only for closed or expired subscriptions whose plan permits renewal; cancellation approval follows the plan's early-closure and expiry rules.

### Automated Recurring Billing
- Generate invoices from active subscriptions.
- Run scheduled daily billing.
- Trigger invoice generation manually.
- Prevent duplicate invoices for the same subscription and billing period.
- Maintain consistent billing records across recurring cycles.

### Flexible Pricing & Financial Rules
- Configure fixed and percentage-based discounts.
- Define discount eligibility, validity periods, usage limits, and scope.
- Apply configurable tax rules.
- Preserve tax rates and calculated amounts on individual invoices.

### Payment & Receivables Management
- Record payments against invoices.
- Support full and partial payments.
- Track paid, outstanding, and overdue balances.
- Maintain payment methods, transaction dates, amounts, and notes.

### Financial Intelligence
- Monitor active subscriptions and monthly recurring revenue.
- Track revenue through successful recorded payments.
- Review outstanding balances and overdue invoices.
- Access financial summaries derived from persisted application records.

## Technology Stack

| Component | Technology |
|---|---|
| Frontend | React, Vite |
| UI & Styling | Tailwind CSS |
| Backend | Node.js, Express.js |
| Database | MongoDB |
| Authentication | JSON Web Tokens (JWT) |
| API Architecture | REST APIs |
| Development Tools | npm, Vite |

## Application Architecture

SubSight uses a client-server architecture with a React-based frontend and an Express backend.

```text
             SUBSIGHT
                 |
       React + Vite Frontend
                 |
           REST API
                 |
        Node.js + Express
                 |
          Business Logic
                 |
             MongoDB
```

The backend manages authentication, access control, subscription operations, invoice generation, payment records, and financial calculations.

A shared billing service handles both scheduled invoice generation and manual billing requests.

## Billing & Calculation Logic

SubSight applies consistent financial rules across its billing workflows.

**Invoice calculation**
- Eligible discounts are applied before tax.
- Applicable tax rates and calculated amounts are stored with each invoice.
- Payments are recorded against invoice totals.

**Recurring invoice integrity**

Each recurring invoice is associated with a unique subscription-and-billing-period key. This prevents duplicate invoice creation when billing generation is executed more than once.

**Monthly Recurring Revenue (MRR)**

Active subscription values are normalised to a monthly equivalent:

| Billing Frequency | Monthly Normalisation |
|---|---|
| Daily | Value × 365 ÷ 12 |
| Weekly | Value × 52 ÷ 12 |
| Monthly | Value |
| Yearly | Value ÷ 12 |

MRR calculations use pre-tax recurring prices, account for seat quantities and subscription-level discounts, and exclude paused subscriptions.

**Financial calculations**
- Invoice revenue is calculated from successful recorded payments.
- Outstanding balance is calculated as invoice total minus successful payments.

All billing amounts are represented in Indian Rupees (INR).

---

## Getting Started

### Prerequisites

- Node.js 20.19+ or 22.12+ (Node.js 24 is supported)
- MongoDB (local or hosted)
- npm

### 1. Clone the repository

```bash
git clone https://github.com/Shivani-Meena07/Subscription_Management_System.git
cd Subscription_Management_System
```

### 2. Configure environment variables

Navigate to the backend directory:

```bash
cd backend
```

Install backend dependencies and generate local configuration and the initial admin:

```bash
npm install
npm run setup
```

Setup creates a private random JWT secret and initial administrator password when they are missing. Read `ADMIN_EMAIL` and `ADMIN_PASSWORD` in the ignored `backend/.env` file to sign in. Existing accounts and their passwords are not overwritten. MongoDB must be running; edit `MONGODB_URI` first when using a hosted database.

Configuration in `backend/.env`:

| Variable | Purpose |
|---|---|
| `MONGODB_URI` | MongoDB connection string |
| `JWT_SECRET` | Private authentication secret (minimum 32 characters) |
| `ADMIN_PASSWORD` | Initial administrator password |
| `HOST` | Listening address; defaults to `127.0.0.1` |
| `BILLING_TIMEZONE` | Daily billing timezone; defaults to `Asia/Kolkata` |
| `SMTP_*` | SMTP configuration for password reset emails |

### 3. Install dependencies and initialise the database

```bash
npm install
npm run seed
```

The seed command creates the configured initial administrator account. Use it when you have configured `.env` manually; `npm run setup` already runs this step. In PowerShell, use `npm.cmd` if the `npm.ps1` execution policy blocks the `npm` command.

### 4. Start the backend

```bash
npm run dev
```

The API runs on port `4000` by default.

### 5. Start the frontend

Open a separate terminal:

```bash
cd frontend
npm install
npm run dev
```

### 6. Open SubSight

Access the Vite development URL displayed in your terminal and sign in using the configured administrator credentials.

The frontend development server proxies `/api` requests to the backend.

### Tests

Run backend unit tests and the optional isolated-database API tests:

```bash
cd backend
npm test
```

Set `TEST_MONGODB_URI` to a disposable MongoDB test instance to run the API integration tests; without it, those tests are skipped. The frontend can be checked with `cd frontend && npm run lint && npm run build`.

PowerShell example:

```powershell
cd backend
$env:TEST_MONGODB_URI = 'mongodb://127.0.0.1:27017'
npm.cmd test
```

The test suite creates a randomly named database and deletes only that database during cleanup. It does not clear your configured application database.

## Completed Application Workflows

- Admin and staff can create, edit and deactivate customer login accounts used by the same subscription and billing APIs.
- Admins can edit products, variants, plans, taxes, discounts and team member names. Staff can read the catalogue, manage customers, subscriptions, quotations, invoices and payment records, and review customer requests.
- All list screens load complete API pagination and provide searchable, 25-row pages. Dropdown lists are not limited to the first 50 records.
- Invoice and quotation details show captured line prices, discounts, tax, paid amounts and balances, with browser printing / Save as PDF.
- Reports provide date-filtered revenue, invoiced totals, top customers, monthly revenue and CSV exports. Report date boundaries and monthly grouping use Indian time. Current outstanding balances and active subscriptions are explicitly separate from date-filtered totals.
- Audit & checks provides activity history, payment synchronization and read-only consistency checks against invoice balances. Activity logging is best-effort and excludes passwords, tokens and request bodies; it is not a compliance-grade audit trail.
- Expired login sessions return users to sign-in. A temporary network failure during session restoration preserves the token and offers a retry. Profile name changes update the workspace immediately.

## Billing Reliability

Monthly/yearly date arithmetic clamps to the last day available in the target month. Subsequent periods advance from the stored billing date. A daily job runs at 02:00 in `BILLING_TIMEZONE`; manual billing and the job share the same service. One run catches up at most 365 periods per subscription and reports how many subscriptions remain due. The backend must be running for scheduled work to execute.

New invoice lines capture prices and tax rates. Existing subscription lines continue billing from their saved values even when a referenced catalogue product is removed. Zero-value invoices are settled immediately. Paused subscriptions are not billed; resuming advances an overdue next-billing date to the resume time. Renewing a subscription with an expiry date establishes a new expiry one billing period ahead.

Manual payments use an invoice-embedded payment journal: the amount, payment entry and invoice status are saved in one atomic MongoDB document update. Payment history is a recoverable projection of those saved entries. A failed history write keeps the committed entry; startup, periodic synchronization, financial reads or the Audit screen can repair it. Synchronization runs every minute while the backend is up.

The UI generates a `requestKey` for each payment submission and retains it for retries. API clients must resend the same `requestKey` (or `Idempotency-Key` header) for retries of the same payment. Reusing a key with different details returns `409`. Requests without a key are treated as new payments. Older invoices and payment records remain readable; pre-existing inconsistencies are reported, not silently rewritten.

## Production Build

Build `frontend` with `npm run build`, then start the backend with `NODE_ENV=production`. It serves the built UI and React route fallback from the same origin. Set `HOST=0.0.0.0` only when the application should listen beyond the local machine; configure HTTPS and deployment-specific network access on your hosting platform. Keep `.env` private.

This completes the repository's local MVP workflows. Real automatic payment collection, payment-provider webhooks and refunds need a payment provider and credentials; this application records payments manually. Password reset email delivery is implemented through Nodemailer but requires valid `SMTP_*` configuration. No live gateway charge or external email delivery has been simulated as a successful production integration.

For the implementation review and verification details, see [completion notes](docs/COMPLETION.md).

---

## Project Structure

```text
SubSight/
│
├── backend/
│   ├── .env.example
│   ├── package.json
│   └── ...
│
├── frontend/
│   ├── package.json
│   └── ...
│
└── README.md
```

## Security & Access Control

- JWT-based authentication.
- Server-side role-based authorisation.
- Password hashing.
- Customer-specific data access.
- Environment-based configuration for application secrets.

## Project Information

**Product:** SubSight  
**Organisation:** Brightloop Software  
**Category:** Subscription Management, Billing Automation & Financial Operations  
**Architecture:** Client–Server  
**Currency:** INR (₹)

---

**SubSight — Bringing subscriptions, billing, and financial operations together.**
