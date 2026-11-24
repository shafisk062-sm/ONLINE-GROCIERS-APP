# GreenBasket API

Base URL: `http://localhost:5000/api` locally. Send JSON unless noted. Authenticated calls use `Authorization: Bearer <JWT>`. Customer and admin tokens are separate roles.

## Public

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/health` | API health |
| GET | `/categories` | Categories |
| GET | `/banners` | Currently active promotional banners |
| GET | `/products` | Database catalog; optional `search`, `category` slug, `minPrice`, `maxPrice`, `available=true`, `discounted=true`, `featured=true`, and `sort=price-asc\|price-desc\|popular\|rating\|newest` |
| GET | `/products/:id` | Product detail |
| POST | `/auth/register` | `{ name, email, password }` (password: 8–128 chars) |
| POST | `/auth/login` | `{ email, password }` |
| POST | `/auth/admin/login` | Admin-only login endpoint |
| POST | `/auth/forgot-password` | `{ email }`; sends a one-hour, single-use reset link when SMTP is configured |
| POST | `/auth/reset-password` | `{ token, password }` |

## Customer (Bearer token)

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/auth/me` | Current customer/admin identity |
| GET / PUT | `/profile` | Read or update customer name/phone |
| POST / DELETE | `/profile/addresses` or `/profile/addresses/:id` | Save an address or delete an owned saved address |
| GET / PUT | `/cart` | Read cart or replace it with `{ items: [{ product, quantity }], coupon }`; stock is checked |
| POST | `/coupons/validate` | `{ code, subtotal }` |
| POST | `/orders` | `{ address: { recipient, phone, line1, line2?, city, postalCode }, paymentMethod: "cod"\|"razorpay", coupon? }` |
| GET | `/orders` | Customer order history/status |
| POST | `/payments/razorpay/verify` | Verify Razorpay order/payment/signature after gateway checkout |
| POST | `/reviews` | Create/update the signed-in customer's product rating |

Cash-on-delivery stock is decremented when the order is placed. Razorpay stock is decremented only after signature verification. Orders reject insufficient inventory; payment verification is idempotent for a completed payment. Delivery is free for subtotal of ₹499 or more; otherwise ₹39.

## Admin (admin Bearer token)

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/admin/overview` | Store metrics, recent orders, six-month sales, best sellers |
| GET | `/admin/products`, POST | List/create products |
| PATCH / DELETE | `/admin/products/:id` | Update/archive a product (archive preserves order references) |
| POST | `/admin/uploads/signature` | Create a short-lived signed Cloudinary upload request |
| GET / PATCH | `/admin/orders`, `/admin/orders/:id` | List orders and update delivery status |
| GET | `/admin/customers` | Customer list |
| GET / POST / DELETE | `/admin/categories` and `/admin/categories/:id` | List/create/delete categories; categories with active products cannot be deleted |
| GET / POST / PATCH | `/admin/coupons` and `/admin/coupons/:id` | Manage coupon validity |
| GET / POST / PATCH / DELETE | `/admin/banners` and `/admin/banners/:id` | Manage storefront promotions |

Successful API responses are JSON. Validation errors use 400, unauthenticated calls 401, role violations 403, unavailable/conflicting resources 404/409, and unavailable integrations 503. Unexpected server errors return 500 without exposing stack details.
