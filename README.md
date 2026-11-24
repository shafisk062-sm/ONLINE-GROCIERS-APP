# GreenBasket — Smart Grocery Store

A responsive grocery storefront and admin studio backed by a real Express API and MongoDB. Product listings, inventory, customer accounts, saved addresses, carts, coupons, payments, and orders are database-backed; the included seed script supplies an initial catalog.

## What is included

- Search by product/brand, category browsing, price and availability filters, offers, and sorting.
- Product detail view, stock-aware cart, persistent carts for signed-in customers, saved addresses, coupons, and order history.
- Registration/login with bcrypt password hashing, JWT sessions, email-based password reset, and separate admin credentials/authorization.
- Checkout with cash on delivery and Razorpay order/signature verification. Online payments require Razorpay test credentials.
- Admin studio for products and inventory, customers, categories, orders/status, coupons, promotional banners, and sales/product performance.
- Optional signed direct image uploads to Cloudinary. Image URLs can also be entered manually.
- API request validation, rate limiting on authentication, Helmet headers, CORS allow-listing, and explicit API error responses.

## Requirements

- Node.js 20 or newer and npm.
- MongoDB locally or a MongoDB Atlas database.
- Optional: SMTP account for password reset, Razorpay test keys for online payment, and Cloudinary credentials for image uploads.

## Local setup

1. Copy `.env.example` to `.env` and set `MONGODB_URI` and a long random `JWT_SECRET`. Configure an admin email/password before seeding. Never commit `.env`.
2. Install and start:

   ```powershell
   npm install
   npm run seed
   npm run dev
   ```

3. Open `http://localhost:5173`. The API listens on `http://localhost:5000`.
4. Sign in as an admin using `ADMIN_EMAIL` / `ADMIN_PASSWORD` from `.env`; choose **Team login** in the footer. The seed command creates or updates this admin account and inserts 10 sample products, 14 categories, a `FRESH25` coupon, and an example banner.

MongoDB must be running and reachable before `npm run seed` or for real account, inventory, and checkout operations. In local development only, if the API is unreachable, the storefront shows a clearly labeled 10-product preview from the same shared catalog used by the seed script; it is for browsing/cart previews and cannot place orders. Production product results always come from MongoDB.

## Environment variables

| Variable | Purpose |
| --- | --- |
| `PORT` | Express port (default `5000`) |
| `MONGODB_URI` | MongoDB connection string |
| `JWT_SECRET` | Secret used to sign access tokens |
| `CLIENT_ORIGIN` | Exact storefront origin allowed by API CORS |
| `VITE_API_URL` | API base URL for the Vite frontend; use `/api` locally or the deployed API URL plus `/api` |
| `ADMIN_NAME`, `ADMIN_EMAIL`, `ADMIN_PASSWORD` | Initial/admin seed credentials; use a unique strong password |
| `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET` | Razorpay **test-mode** credentials in development |
| `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET` | Optional signed product-image uploads |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`, `SMTP_FROM` | Optional SMTP delivery for one-hour password-reset links |
| `APP_ORIGIN` | Public frontend origin used in password reset links |

Online checkout fails clearly when Razorpay is not configured; cash on delivery remains available. Password reset reports that email is unavailable until SMTP is configured. Do not expose server secrets as `VITE_*` variables.

## Deployment

### MongoDB Atlas

Create a database/user, configure network access for the deployed API service, and use the Atlas connection string for `MONGODB_URI`. Restrict network access to the API service where possible rather than opening the database broadly.

### API on Render or Railway

- Deploy the repository root as a Node service.
- Build command: `npm install`
- Start command: `npm start`
- Set the environment variables above in the hosting dashboard. Set `CLIENT_ORIGIN` and `APP_ORIGIN` to the exact deployed Vercel URL.
- Run `npm run seed` once from a trusted deployment shell after configuring the database/admin variables. Do not use the example admin credentials in production.

### Frontend on Vercel

- Import the repository and use the project root.
- Framework preset: Vite; build command: `npm run build`; output directory: `dist`.
- Set `VITE_API_URL` to `https://<your-api-host>/api`.
- Redeploy after changing frontend environment variables. Add the final Vercel origin to the API's `CLIENT_ORIGIN`.

### Integrations

Configure SMTP before enabling password reset in production. Use Razorpay test keys for development and switch to live credentials only after gateway account approval and production verification. Configure Cloudinary to enable the upload control in admin product editing; manual image URLs remain available.

## Data model notes

MongoDB collections include `Users`, `Admins`, `Addresses`, `Categories`, `Products`, `Carts`, `Orders`, `Payments`, `Coupons`, `Banners`, and `Reviews`. Cart items and order-item snapshots are embedded subdocuments so cart/order snapshots stay with their parent record. Order addresses are stored as checkout snapshots; saved addresses live in their own collection.

## API reference

See [docs/API.md](./docs/API.md) for routes, authentication, request shapes, and behavior.
