# Showzy to-do

Target: working product by the first week of December 2026, tested on New Year events.

## Payments (split routing)
- [ ] Email Cashfree and PhonePe sales with the same five questions:
  1. Will you onboard a proprietorship or individual with no turnover history as a marketplace?
  2. Can splits go to individual vendors on PAN only, given the ₹40 lakh rule?
  3. Exact fee and offer terms, in writing?
  4. Can a split be held 72 hours, released later, or reversed on dispute?
  5. How do refunds work against a vendor's share?
- [ ] Ask PayU and Easebuzz for written quotes (backup)
- [ ] Fallback if both say no: venues collect ticket money directly (Showzy only collects its fee); artist booking waits
- [ ] Razorpay Route is out for now (₹40 lakh turnover gate). Revisit once turnover allows.
- [ ] Do not use the "collect in our account, pay out by hand" model beyond a short pilot without accountant and lawyer sign-off

## Business and legal (you)
- [ ] Register a business (proprietorship is the lightest) and open a current account
- [ ] Accountant call: GST on the ₹19 fee, GST exemption for tickets under a per-ticket price, TDS duties, how ticket money reaches venues
- [ ] Fill the legal placeholders: company name, address, grievance officer, GSTIN
- [ ] Privacy policy and a support contact route

## Product
- [ ] Wait for the backend green flag from your colleague, agree the API contract first (migrations, field names)
- [ ] End-to-end run of the web app on a phone: sign up, find an event, buy, get ticket, scan at the door; keep a bug list
- [ ] Integrate the chosen payment gateway, then a real-world run
- [ ] Artist booking: payouts, KYC, TDS, disputes (second milestone, after ticketing)
- [ ] Real email service for sign-in codes (not Gmail SMTP)
- [ ] Production hosting: server, database, domain with HTTPS, task worker, file storage, backups, error alerts
- [ ] Review the unreviewed console pages (host Events/Bookings, booking chat, artist and admin consoles)
- [ ] Kannada: translate and review, then set `KANNADA_ENABLED` to true in `apps/frontend/src/lib/features.ts`
- [ ] Split the GST on the combined order tax figure (fee tax vs ticket tax) before the first payout

## Go-to-market
- [ ] Line up 5–10 venues listing New Year events by mid-November
- [ ] Marketing budget decision: venue onboarding first, paid social only once there are about 10 events
