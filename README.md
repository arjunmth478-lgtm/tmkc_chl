# Shopnix — Cloudflare-ready ecommerce starter

A complete starter project for a Shopnix storefront with a Worker API, Cloudflare D1 schema, optional R2 product-image storage, customer email/password auth, admin product/order management, and WhatsApp/Telegram checkout handoff.

## Important before going live
This ZIP contains working source code and setup instructions, but it is **not live until deployed and configured**. You must create Cloudflare resources and set secrets/environment variables. Google sign-in is shown as an optional integration point and needs Google OAuth credentials before it can work. Telegram direct messages cannot reliably prefill a checkout message; WhatsApp checkout does.

## Included
- Responsive storefront (search, category filters, product cards, cart)
- API backed by Cloudflare Worker + D1
- Password hashing using Web Crypto PBKDF2
- Bearer-token sessions stored in D1
- Separate admin role via `ADMIN_EMAIL`
- Admin products CRUD, orders list/status update
- WhatsApp and Telegram contact settings
- D1 migration with products, users, sessions, orders, order items, settings
- Seed script and Wrangler config
- Basic validation, errors, and security headers

## Deploy
1. Install Node.js 20+ and npm.
2. Install dependencies: `npm install`
3. Create D1 database: `npx wrangler d1 create shopnix-db`
4. Copy the returned `database_id` into `wrangler.toml`.
5. Apply schema: `npm run db:migrate`
6. Apply the seed migration to add demo products/settings: `npx wrangler d1 migrations apply shopnix-db --local` (use `--remote` for production).
7. Set admin email and a long random session secret:
   - `npx wrangler secret put ADMIN_EMAIL`
   - `npx wrangler secret put SESSION_SECRET`
8. For local development, create `.dev.vars` with:
   ```
   ADMIN_EMAIL=you@example.com
   SESSION_SECRET=replace-with-a-long-random-secret
   ```
   Never commit `.dev.vars`.
9. Run locally: `npm run dev`
10. Deploy: `npm run deploy`
11. Configure `WHATSAPP_NUMBER` (digits with country code, no `+`) and `TELEGRAM_USERNAME` in Worker vars/secrets or `wrangler.toml`.
12. For product image uploads, create an R2 bucket and bind it as `IMAGES`; use `wrangler r2 bucket create shopnix-images`, then uncomment the R2 binding in `wrangler.toml` and deploy again.

## API summary
- `GET /api/health`
- `GET /api/products`
- `GET /api/settings`
- `POST /api/auth/register`
- `POST /api/auth/login`
- `GET /api/auth/me`
- `POST /api/auth/logout`
- `POST /api/orders` (signed-in customer)
- `GET /api/orders` (customer's own orders; admin sees all)
- `PATCH /api/orders/:id/status` (admin)
- `POST /api/products` (admin)
- `PATCH /api/products/:id` (admin)
- `DELETE /api/products/:id` (admin)
- `PATCH /api/settings` (admin)

## Security notes
- Set a strong `SESSION_SECRET`, use HTTPS, and configure Cloudflare rate limiting/WAF before public launch.
- For production, configure Turnstile or another anti-abuse control and email verification/password reset provider.
- This starter intentionally does not fake Google login. Configure OAuth with valid Google client credentials before exposing a Google login button.


## Admin account
The account whose email exactly matches `ADMIN_EMAIL` receives the admin role at registration time. Set `ADMIN_EMAIL` before creating that account. If an account with that email already exists as a customer, this starter does not silently elevate it; change its role only with a trusted database admin operation.

## Current scope and production checklist
This starter includes the D1 schema and a SQL seed migration. It does not yet include Google OAuth, email verification, email-based password reset, customer-management screens, coupon engine, R2 upload UI, or an automated database backup schedule. Do not present those as implemented until you add and test them. Before launch, test all routes in a staging environment and configure Cloudflare rate limits and a privacy/returns policy.
