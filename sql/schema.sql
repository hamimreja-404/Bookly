-- 1. Bookings table 
CREATE TABLE IF NOT EXISTS bookings (
    id              SERIAL PRIMARY KEY,
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
    phone           TEXT PRIMARY KEY,
    step            TEXT DEFAULT 'idle',
    selected_date   DATE,
    selected_slot   TEXT,
    updated_at      TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Index for fast reminder lookups
CREATE INDEX IF NOT EXISTS idx_bookings_slot_start 
    ON bookings(slot_start) 
    WHERE reminder_sent = FALSE AND status = 'confirmed';

-- 4. Index for fast date + status lookups
CREATE INDEX IF NOT EXISTS idx_bookings_date_status 
    ON bookings(booking_date, status);
