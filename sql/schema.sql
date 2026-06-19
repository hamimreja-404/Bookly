-- ─────────────────────────────────────────────────────────────────────
-- OPTION A: Fresh setup — Run this if you have no existing tables
-- OPTION B: V1.1 Migration — Run the ALTER TABLE block at the bottom
--           if you already have V1.0 tables with data
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
    status          TEXT DEFAULT 'confirmed',
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
    updated_at          TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Index for fast reminder lookups
CREATE INDEX IF NOT EXISTS idx_bookings_slot_start
    ON bookings(slot_start)
    WHERE reminder_sent = FALSE AND status = 'confirmed';

-- 4. Index for fast date + status lookups
CREATE INDEX IF NOT EXISTS idx_bookings_date_status
    ON bookings(booking_date, status);

-- 5. Index for booking_id lookups
CREATE INDEX IF NOT EXISTS idx_bookings_booking_id
    ON bookings(booking_id);

-- ─────────────────────────────────────────────────────────────────────
-- V1.1 MIGRATION — Run only if upgrading from V1.0 (tables already exist)
-- ─────────────────────────────────────────────────────────────────────

ALTER TABLE bookings
    ADD COLUMN IF NOT EXISTS booking_id TEXT UNIQUE;

ALTER TABLE user_sessions
    ADD COLUMN IF NOT EXISTS slots_morning       TEXT,
    ADD COLUMN IF NOT EXISTS slots_afternoon     TEXT,
    ADD COLUMN IF NOT EXISTS slots_evening       TEXT,
    ADD COLUMN IF NOT EXISTS session_timeout_at  TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS pending_action      TEXT,
    ADD COLUMN IF NOT EXISTS pending_booking_id  TEXT;