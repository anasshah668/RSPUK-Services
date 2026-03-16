# Server Startup Scripts

These scripts help start the server in production and development modes.

## Usage

### Using npm scripts (Recommended)

```bash
# Start production server
npm start

# Start development server with nodemon
npm run dev
```

### Direct script usage

```bash
# Start production server
node scripts/start-server.js

# Start development server
node scripts/dev-server.js
```

## How it works

1. **start-server.js**: Starts the production server using Node.js
2. **dev-server.js**: Starts the development server with nodemon for automatic reloading

## Port Configuration

The scripts use the `PORT` environment variable from your `.env` file, or default to port `5000`.

To change the port, set it in your `backend/.env` file:
```env
PORT=5002
```
