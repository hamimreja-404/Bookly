-- ─────────────────────────────────────────────────────────────────────
-- OPTION A: Fresh setup — Run this if you have no existing tables
-- OPTION B: V2.0 Migration — Run the ALTER TABLE block at the bottom
--           if you already have V1.x tables with data
-- ─────────────────────────────────────────────────────────────────────

-- 1. Bookings table
CREATE TABLE IF NOT EXISTS bookings (
    id              SERIAL PRIMARY KEY,
    booking_id      TEXT UNIQUE,
    phone           TEXT NOT NULL,
    name            TEXT NOT NULL,
    booking_date    DATE NOT NULL,
    slot_time       TEXT NOT NULL,
    slot_start      TIMESTAMPTZ NOT NULL,
    status          TEXT DEFAULT 'confirmed',   -- confirmed | cancelled
    cancelled_reason TEXT,                       -- user_request | admin_block
    reminder_sent   BOOLEAN DEFAULT FALSE,
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- 2. User sessions table
CREATE TABLE IF NOT EXISTS user_sessions (
    phone               TEXT PRIMARY KEY,
    step                TEXT DEFAULT 'idle',
    selected_date       DATE,
    selected_slot       TEXT,
    slots_morning       TEXT,
    slots_afternoon     TEXT,
    slots_evening       TEXT,
    session_timeout_at  TIMESTAMPTZ,
    pending_action      TEXT,
    pending_booking_id  TEXT,
    reschedule_name     TEXT,
    updated_at          TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Blocked slots table (V2.0)
--    slot_time = NULL means the entire day is blocked
CREATE TABLE IF NOT EXISTS blocked_slots (
    id          SERIAL PRIMARY KEY,
    block_date  DATE NOT NULL,
    slot_time   TEXT,          -- NULL = full day blocked
    period      TEXT,          -- morning | afternoon | evening | NULL (full day)
    created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- 4. Admin users table (V2.0)
CREATE TABLE IF NOT EXISTS admin_users (
    id          SERIAL PRIMARY KEY,
    username    TEXT UNIQUE NOT NULL,
    password    TEXT NOT NULL,
    created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- Insert default admin (run once)
INSERT INTO admin_users (username, password)
VALUES ('Admin_1', 'Admin@01')
ON CONFLICT (username) DO NOTHING;

-- ─────────────────────────────────────────────────────────────────────
-- Indexes
-- ─────────────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_bookings_slot_start
    ON bookings(slot_start)
    WHERE reminder_sent = FALSE AND status = 'confirmed';

CREATE INDEX IF NOT EXISTS idx_bookings_date_status
    ON bookings(booking_date, status);

CREATE INDEX IF NOT EXISTS idx_bookings_booking_id
    ON bookings(booking_id);

CREATE INDEX IF NOT EXISTS idx_blocked_slots_date
    ON blocked_slots(block_date);

-- ─────────────────────────────────────────────────────────────────────
-- V2.0 MIGRATION — Run only if upgrading from V1.x (tables already exist)
-- ─────────────────────────────────────────────────────────────────────

ALTER TABLE bookings
    ADD COLUMN IF NOT EXISTS cancelled_reason TEXT;

ALTER TABLE user_sessions
    ADD COLUMN IF NOT EXISTS reschedule_name TEXT;

CREATE TABLE IF NOT EXISTS blocked_slots (
    id          SERIAL PRIMARY KEY,
    block_date  DATE NOT NULL,
    slot_time   TEXT,
    period      TEXT,
    created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_blocked_slots_date
    ON blocked_slots(block_date);

CREATE TABLE IF NOT EXISTS admin_users (
    id          SERIAL PRIMARY KEY,
    username    TEXT UNIQUE NOT NULL,
    password    TEXT NOT NULL,
    created_at  TIMESTAMPTZ DEFAULT NOW()
);

INSERT INTO admin_users (username, password)
VALUES ('Admin_1', 'Admin@01')
ON CONFLICT (username) DO NOTHING;