# GharSeBite (MERN + Clerk + Razorpay)

Full-stack healthy Indian tiffin and home-food delivery project for hostellers, PG students, and people living away from home.

Built with:
- React + Vite frontend
- Separate React + Vite admin/chef app
- Node.js + Express backend
- MongoDB database
- Clerk authentication
- Razorpay payment integration
- Admin panel protection (email allowlist)

## Project Structure

```text
GharSeBite/
  admin/
  backend/
  frontend/
```

## Tech Stack

- Frontend: React, React Router, Clerk (`@clerk/clerk-react`)
- Backend: Express, Mongoose, Clerk (`@clerk/express`)
- Database: MongoDB Atlas
- Payments: Razorpay + webhook verification

## Features

- Browse food items
- Add to cart and place orders
- Separate admin/chef dashboard
- Admin can manage chef approvals, monitor orders, and track revenue
- Chefs can manage food listings and process incoming orders
- Order lifecycle stages such as preparing and delivered
- Razorpay checkout flow
- Payment signature verification
- Razorpay webhook processing (`payment.captured`, `payment.failed`)
- Clerk sign-in/sign-up
- Protected user routes (`/cart`, `/order`)
- Protected admin APIs and admin page
- Admin access only for configured emails

## Role-Based Architecture

The platform supports three roles: admin, chef, and customer.

- Admin: manages chef approvals, monitors platform orders, and tracks revenue.
- Chef: manages food listings and moves incoming orders through lifecycle stages such as preparing and delivered.
- Customer: browses food items, adds items to the cart, places orders, and completes payments.

This role-based architecture keeps responsibilities separated cleanly across the system and makes the platform easier to scale as new operational workflows are added.

## Prerequisites

- Node.js 18+ (recommended latest LTS)
- npm
- MongoDB Atlas URI
- Clerk app keys
- Razorpay test keys

## Environment Variables

### `frontend/.env`

```env
VITE_CLERK_PUBLISHABLE_KEY=pk_test_xxxxxxxxxxxxxxxxx
VITE_API_URL=http://localhost:5000
```

### `backend/.env`

```env
MONGO_URI=mongodb+srv://...
RAZORPAY_KEY_ID=rzp_test_xxxxxxxxx
RAZORPAY_KEY_SECRET=xxxxxxxxx
RAZORPAY_WEBHOOK_SECRET=whsec_xxxxxxxxx
CLERK_SECRET_KEY=sk_test_xxxxxxxxx
CLERK_PUBLISHABLE_KEY=pk_test_xxxxxxxxx
ADMIN_EMAILS=sonalirpatil361@gmail.com
PORT=5000
```

Notes:
- `ADMIN_EMAILS` is comma-separated if multiple admins.
- If `ADMIN_EMAILS` is empty, all signed-in users can access admin (dev convenience).

## Install Dependencies

From project root:

```bash
cd backend
npm install

cd ../frontend
npm install

cd ../admin
npm install
```

## Run Locally

Open 2 terminals:

### Terminal 1 (Backend)
```bash
cd backend
npm run dev
```

### Terminal 2 (Frontend)
```bash
cd frontend
npm run dev
```

### Terminal 3 (Admin / Chef App)
```bash
cd admin
npm run dev
```

Admin app runs on Vite port `5174` by default.

Frontend runs on Vite dev URL, backend on `http://localhost:5000`.

## Build for Production

### Frontend
```bash
cd frontend
npm run build
```

Output: `frontend/dist`

### Backend
No separate compile step needed.

```bash
cd backend
npm start
```

## Authentication Flow (Clerk)

- Public page: `/`
- Protected pages: `/cart`, `/order`, `/admin`
- Sign-in route: `/sign-in`
- Sign-up route: `/sign-up`

Backend verifies Clerk JWT on protected APIs.

## Admin Access

Admin APIs are protected by:
1. Signed-in Clerk user
2. Email in `ADMIN_EMAILS`

Current admin allowlist:
- `sonalirpatil361@gmail.com`

## Payment Flow (Razorpay)

1. Create app order: `POST /api/order/place`
2. Create Razorpay order: `POST /api/payment/create-session`
3. Client verifies payment: `POST /api/payment/verify`
4. Webhook updates final status: `POST /api/payment/webhook`

Webhook signature uses `RAZORPAY_WEBHOOK_SECRET`.

## API Overview

### Food
- `GET /api/food`
- `POST /api/food/add` (admin)
- `DELETE /api/food/:id` (admin)
- `PATCH /api/food/:id` (admin)

### Orders
- `POST /api/order/place` (auth)
- `GET /api/order/user/:id` (auth; own orders)
- `GET /api/order` (admin)
- `PATCH /api/order/:id/status` (admin)

### Payments
- `GET /api/payment/key`
- `POST /api/payment/create-session` (auth; own order)
- `POST /api/payment/verify` (auth; own order)
- `GET /api/payment/status/:orderId` (auth; own order)
- `POST /api/payment/webhook` (Razorpay server callback)

## Deployment Notes

- Keep frontend and backend env vars separate.
- Never expose `CLERK_SECRET_KEY`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET` to frontend.
- Configure CORS for your production frontend domain.
- Add production webhook URL in Razorpay dashboard:
  - `https://your-backend-domain/api/payment/webhook`

## Common Issues

### 1) `Admin access only`
- Check signed-in email matches `ADMIN_EMAILS`.
- Restart backend after env changes.

### 2) `Unauthorized` on protected API
- Ensure user is signed in.
- Frontend must send `Authorization: Bearer <Clerk token>`.

### 3) Razorpay key not configured
- Verify backend `.env` has key ID/secret.
- Restart backend.

### 4) Mongo connection errors
- Verify `MONGO_URI`.
- Check Atlas network access and credentials.

## Security Reminders

- Rotate any keys that were shared in plain text.
- Keep `.env` out of version control.
- Use separate test/live keys for Razorpay.

---


