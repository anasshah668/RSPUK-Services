# Printing Platform Backend

Backend API for Custom Printing & Product Personalization Platform built with Node.js, Express, and MongoDB.

## Features

- **Authentication**: JWT-based authentication with OAuth support (Google & Facebook)
- **Product Management**: CRUD operations for products with variants and pricing
- **Order Management**: Complete order processing system
- **Quote System**: Handle customer quote requests
- **Admin Dashboard**: Full admin panel for managing the platform
- **File Storage**: Cloudinary integration for image uploads
- **RESTful API**: Clean, modular API structure

## Tech Stack

- **Runtime**: Node.js (ES6 modules)
- **Framework**: Express.js
- **Database**: MongoDB with Mongoose
- **Authentication**: JWT, Passport.js (OAuth)
- **File Storage**: Cloudinary
- **Validation**: express-validator

## Setup Instructions

### 1. Install Dependencies

```bash
cd backend
npm install
```

### 2. Environment Variables

Create a `.env` file in the backend directory:

```env
# Server Configuration
PORT=5000
NODE_ENV=development

# MongoDB
MONGODB_URI=mongodb://localhost:27017/printing-platform

# JWT Secret
JWT_SECRET=your-super-secret-jwt-key-change-this-in-production
JWT_EXPIRE=7d

# OAuth - Google
GOOGLE_CLIENT_ID=your-google-client-id
GOOGLE_CLIENT_SECRET=your-google-client-secret

# OAuth - Facebook
FACEBOOK_APP_ID=your-facebook-app-id
FACEBOOK_APP_SECRET=your-facebook-app-secret

# Cloudinary (for image storage)
CLOUDINARY_CLOUD_NAME=your-cloudinary-cloud-name
CLOUDINARY_API_KEY=your-cloudinary-api-key
CLOUDINARY_API_SECRET=your-cloudinary-api-secret

# Frontend URL
FRONTEND_URL=http://localhost:5173

# Third-party API (v2/login)
THIRD_PARTY_BASE_URL=https://example-third-party.com
THIRD_PARTY_USERNAME=your-username
THIRD_PARTY_PASSWORD=your-password
# Optional fallback TTL when API response doesn't include expiry
THIRD_PARTY_TOKEN_TTL_SECONDS=3000

# Worldpay — copy `backend/.env.worldpay.example` into `.env` and fill values.
# Fill BOTH blocks once; to go live only change WORLDPAY_ENVIRONMENT to live
# (or set WORLDPAY_MODE=live). API host and checkout script follow automatically.
WORLDPAY_ENVIRONMENT=try

# Sandbox (Try)
WORLDPAY_TRY_CHECKOUT_ID=your-try-checkout-id
WORLDPAY_TRY_USERNAME=your-try-api-username
WORLDPAY_TRY_PASSWORD=your-try-api-password
WORLDPAY_TRY_ENTITY=default

# Production (Live) — same shape; used when WORLDPAY_ENVIRONMENT=live
WORLDPAY_LIVE_CHECKOUT_ID=your-live-checkout-id
WORLDPAY_LIVE_USERNAME=your-live-api-username
WORLDPAY_LIVE_PASSWORD=your-live-api-password
WORLDPAY_LIVE_ENTITY=your-live-entity

# Optional: use SERVICE_KEY instead of PASSWORD for Basic (or for Bearer — see below)
# WORLDPAY_TRY_SERVICE_KEY=
# WORLDPAY_LIVE_SERVICE_KEY=

# Optional: override API host (otherwise try → try.access.worldpay.com, live → access.worldpay.com)
# WORLDPAY_API_BASE_URL=https://try.access.worldpay.com
# WORLDPAY_AUTHORIZATION_PATH=/payments/authorizations
# WORLDPAY_API_VERSION=2024-06-01

# Legacy single-profile vars still work if you omit TRY_/LIVE_ (not recommended for prod cutover):
# WORLDPAY_CHECKOUT_ID=  WORLDPAY_USERNAME=  WORLDPAY_PASSWORD=  WORLDPAY_ENTITY=

# Bearer only if Worldpay docs require it (uses *_SERVICE_KEY from the active profile)
# WORLDPAY_AUTH_SCHEME=Bearer
```

### 3. Start MongoDB

Make sure MongoDB is running on your system:

```bash
# If using local MongoDB
mongod

# Or use MongoDB Atlas connection string in MONGODB_URI
```

### 4. Run the Server

```bash
# Development mode (with nodemon)
npm run dev

# Production mode
npm start
```

The server will start on `http://localhost:5000`

## API Endpoints

### Authentication
- `POST /api/auth/register` - Register new user
- `POST /api/auth/login` - Login user
- `GET /api/auth/me` - Get current user (protected)

### Products
- `GET /api/products` - Get all products
- `GET /api/products/:id` - Get single product
- `GET /api/products/category/:category` - Get products by category

### Orders
- `POST /api/orders` - Create new order (protected)
- `GET /api/orders` - Get user orders (protected)
- `GET /api/orders/:id` - Get single order (protected)

### Quotes
- `POST /api/quotes` - Create quote request
- `GET /api/quotes` - Get all quotes (admin only)
- `GET /api/quotes/:id` - Get single quote (admin only)
- `PUT /api/quotes/:id` - Update quote (admin only)

### Admin
- `GET /api/admin/analytics` - Get dashboard analytics (admin only)
- `GET /api/admin/orders` - Get all orders (admin only)
- `PUT /api/admin/orders/:id/status` - Update order status (admin only)
- `POST /api/admin/products` - Create product (admin only)
- `PUT /api/admin/products/:id` - Update product (admin only)
- `DELETE /api/admin/products/:id` - Delete product (admin only)

### Third-Party Integration
- `POST /api/third-party/auth/login` - Authenticate and refresh cached third-party token (admin only)
- `GET /api/third-party/auth/token` - Get/ensure cached token availability (admin only)
- `GET /api/third-party/products/attributes` - Proxy product attributes from third-party API (public backend endpoint for frontend consumption)

## Creating Admin User

To create an admin user, you can either:

1. Use MongoDB directly:
```javascript
db.users.updateOne(
  { email: "admin@example.com" },
  { $set: { role: "admin" } }
)
```

2. Or modify the registration to allow admin creation (for development only)

## Project Structure

```
backend/
├── config/
│   ├── database.js       # MongoDB connection
│   └── cloudinary.js      # Cloudinary configuration
├── middleware/
│   ├── auth.js           # Authentication middleware
│   └── errorHandler.js   # Error handling middleware
├── models/
│   ├── User.js           # User model
│   ├── Product.js        # Product model
│   ├── Order.js          # Order model
│   └── Quote.js          # Quote model
├── routes/
│   ├── auth.routes.js    # Authentication routes
│   ├── product.routes.js # Product routes
│   ├── order.routes.js   # Order routes
│   ├── quote.routes.js   # Quote routes
│   ├── user.routes.js    # User routes
│   └── admin.routes.js   # Admin routes
├── server.js             # Main server file
└── package.json          # Dependencies
```

## Notes

- All routes use ES6 import/export syntax
- JWT tokens are stored in localStorage on the frontend
- Admin routes require both authentication and admin role
- File uploads use Cloudinary for cloud storage
- CORS is configured to allow frontend requests
"# RSPUK-Services" 
