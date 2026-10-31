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

- Node.js 20+
- MongoDB (local or hosted)
- npm

### 1. Clone the repository

```bash
git clone <your-repository-url>
cd SubSight
```

### 2. Configure environment variables

Navigate to the backend directory:

```bash
cd backend
```

Copy the example environment file:

```bash
cp .env.example .env
```

Configure the following variables in `backend/.env`:

| Variable | Purpose |
|---|---|
| `MONGODB_URI` | MongoDB connection string |
| `JWT_SECRET` | Private authentication secret (minimum 32 characters) |
| `ADMIN_PASSWORD` | Initial administrator password |
| `SMTP_*` | SMTP configuration for password reset emails |

### 3. Install dependencies and initialise the database

```bash
npm install
npm run seed
```

The seed command creates the configured initial administrator account.

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
