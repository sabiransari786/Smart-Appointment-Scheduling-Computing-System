# Smart Appointment Scheduling System

MERN admin module for managing patients, providers, departments, appointments, schedules, reports, notifications, and audit activity.

## Run locally

1. Start MongoDB (local or Atlas).
2. Install dependencies: `npm install && npm run install:all`
3. Copy `server/.env.example` to `server/.env` and set `MONGO_URI`, `JWT_SECRET`, and admin credentials.
4. Run both applications with `npm run dev`.

The API runs on `http://localhost:5000` and the Vite client on `http://localhost:5173`.

The first server start creates the admin account from `ADMIN_EMAIL` and `ADMIN_PASSWORD`. Change the development defaults before deploying.

## Run without MongoDB

For local demos, set `MOCK_DATA=true` in `server/.env`. The API then starts with in-memory dummy patients, providers, appointments, reports, notifications, and activity data. The demo credentials are `admin@example.com` / `ChangeMe123!`.
