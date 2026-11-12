# PayPilot AI

AI-powered invoicing and payment management for freelancers and small businesses. Built for the PayPal AI Hackathon 2026.

## Features
- Sign up / sign in, business profile and default currency
- Dashboard: revenue, paid, pending and overdue invoices, six-month cash-flow chart
- Invoices: multiple services, quantity, price, tax, discount, due date, edit, PDF download
- Customers: add and manage clients
- AI invoice creation: describe a job in plain words and the form is filled for review
- Secure share links: customers open `/i/<token>` without logging in
- PayPal Sandbox checkout with server-side capture; an invoice becomes **paid** only after PayPal confirms the exact amount
- Payments page: transaction ID, invoice, date, amount and status
- AI assistant: answers about your invoices and payments, using only your real records

## Tech stack
React 19, TypeScript, TanStack Start/Router/Query, Tailwind CSS, shadcn/ui, Supabase (database, auth, row-level security), jsPDF, PayPal Checkout (Sandbox, direct REST API), Google Gemini API.

## Security
- Row-level security on every table; users only see their own data
- Database guard: invoices cannot be marked paid except by a verified server-side payment
- Payment amounts always come from the database, never the browser
- No secrets in this repository; keys live in server environment variables

## Run locally
```sh
npm install
npm run dev
npm test
```
Create a `.env.local` file (never commit it) with:
```
SUPABASE_PROJECT_ID, SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, SUPABASE_SERVICE_ROLE_KEY
VITE_SUPABASE_PROJECT_ID, VITE_SUPABASE_URL, VITE_SUPABASE_PUBLISHABLE_KEY
AI_API_KEY (Google Gemini), optional AI_MODEL
PAYPAL_CLIENT_ID, PAYPAL_CLIENT_SECRET, VITE_PAYPAL_CLIENT_ID, PAYPAL_ENVIRONMENT=sandbox
```
Run the two SQL files in `drizzle/migrations` (in order) in your Supabase SQL Editor first.

## Project status (honest)
- Tested by hand: sign up / sign in, customers, invoices (create, edit, totals, PDF), public share link, payments page, data privacy between accounts.
- PayPal Sandbox checkout is fully coded (server-side order creation, capture and amount verification), but it could **not be tested end-to-end**: PayPal Developer sign-up is not available for Pakistan-based developers. Until keys are added, the share page shows "Online payment is not set up yet". Payments are never faked.

## Screenshots
| | |
|---|---|
| ![Dashboard](docs/screenshots/1-dashboard.png) | ![Invoices](docs/screenshots/2-invoices.png) |
| ![Invoice preview](docs/screenshots/3-invoice-preview.png) | ![Customer share page](docs/screenshots/4-share-page.png) |
| ![Customers](docs/screenshots/5-customers.png) | ![Payments](docs/screenshots/6-payments.png) |
| ![AI](docs/screenshots/7-ai.png) | |
