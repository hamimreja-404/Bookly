# WhatsApp Appointment Booking Bot

An automated scheduling assistant built with Node.js, Express, the Meta WhatsApp Cloud API, and Supabase. The system allows users to book, reschedule, or cancel 20-minute appointment slots on WhatsApp, and provides administrators with a web-based dashboard and text-based controls.

---

## Key Features

* **Conversational Scheduling Flow**: Guides users to choose a date, period (Morning, Afternoon, Evening), and individual 20-minute slots via interactive buttons and list menus.
* **Rescheduling and Cancellations**: Users can manage their appointments using a unique 3-digit Booking ID. The rescheduling flow remembers the user's name to speed up the process.
* **Indian Standard Time (IST) Support**: Dynamically handles slots and past-slot filtering correctly, regardless of host server time-zones (e.g., Render's UTC).
* **Automated Reminders**: A background cron job scans the database every minute and sends a reminder to users 20 minutes before their appointment.
* **Real-time Admin Alerts**: The bot automatically notifies the administrator via WhatsApp whenever a new booking is confirmed.
* **WhatsApp Schedule Query**: Administrators can text "List" or "schedule" to the bot to instantly retrieve all upcoming appointments.
* **Admin Dashboard**: A clean web interface to monitor bookings, view statistics, and block slots.
* **Slot Block System**: Administrators can block entire days or specific periods. Creating a block automatically cancels conflicting bookings, releases the slots, and sends WhatsApp cancellation alerts to affected users.

---

## Project Structure

* `V1.0.md` - Core architecture and booking flow baseline.
* `V1.1.md` - Timezone synchronization improvements, cancellation & rescheduling flow fixes.
* `V2.0.md` - Admin features including the web dashboard, block system, and WhatsApp alerts.
* `sql/schema.sql` - Database structure containing the tables for bookings, session states, active blocks, and admin users.
* `src/server.js` - Main entry point setting up Express, routing webhooks, and starting the cron job.
* `src/handlers/flowHandler.js` - Conversational state machine processing incoming user messages.
* `src/admin/` - Code and UI HTML for the secure web dashboard.

---

## Quick Setup

### 1. Database Configuration
Run the scripts in `sql/schema.sql` in your Supabase SQL Editor. This sets up the following tables:
* `bookings`: Holds all reservation logs and statuses.
* `user_sessions`: Stores intermediate state during active chats.
* `blocked_slots`: Logs admin-created schedule blocks.
* `admin_users`: Credentials fallback for dashboard login.

### 2. Environment Variables
Create a `.env` file in the root directory and configure the following variables:

```env
# Meta WhatsApp Cloud API Configuration
PHONE_NUMBER_ID=your_whatsapp_phone_number_id
ACCESS_TOKEN=your_meta_system_user_access_token
VERIFY_TOKEN=your_webhook_verification_token

# Supabase Database Configuration
SUPABASE_URL=your_supabase_project_url
SUPABASE_KEY=your_supabase_anon_or_service_role_key

# Admin Credentials and Settings
ADMIN_PHONE=919382426273
ADMIN_SESSION_SECRET=a_secure_session_secret_for_cookies
ADMIN_USERNAME=Admin_1
ADMIN_PASSWORD=Admin@01
```

### 3. Installation and Running
Install dependencies and run the application:

```bash
# Install dependencies
npm install

# Start the application
npm start
```

For development mode, run:
```bash
npm run dev
```

The server runs on port `3000` (or `PORT` from environment). The admin dashboard will be accessible at `http://localhost:3000/admin`.
