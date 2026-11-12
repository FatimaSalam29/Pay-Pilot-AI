# PayPilot AI — Roadmap

## Stage 1 — Foundation (done)
- [x] Design system, app shell with sidebar navigation
- [x] Accounts (email/password, Google, Lovable) + business profile
- [x] Dashboard: revenue, paid, pending, overdue + revenue chart
- [x] Invoice generator with customer, line items, tax, discount, due date, live preview
- [x] Invoice list + invoice detail page
- [x] Basic customer management (list, add)
- [x] Database guard: invoices can only be marked paid by verified server-side payment

## Stage 2 — Invoice improvements
- [ ] Real PDF download
- [ ] Customer share link (read-only, unguessable, revocable, drafts hidden)
- [ ] Edit existing invoices (atomic save)

## Stage 3 — AI invoice creation
- [ ] Natural language → structured invoice, fills the form for review, validated

## Stage 4 — PayPal Sandbox payments
- [ ] Server-side order create + capture, verified amount/currency before marking paid
- [ ] Cancelled / failed payments recorded, never simulated
- [ ] Link the PayPal sandbox connection (needs user's PayPal Developer sandbox app)
- [ ] Webhook verification (optional, needs a PayPal webhook ID)

## Stage 5 — Payments page
- [ ] History with transaction IDs, invoice links, dates, amounts, statuses

## Stage 6 — AI assistant
- [ ] Revenue/payment summaries, overdue detection, Q&A from real records

## Stage 7 — Final QA
- [ ] End-to-end checks; keep the John Doe test invoice

## Later
- [ ] Edit/delete customers, per-customer invoice history
