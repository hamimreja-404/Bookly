// Handles saving and reading bookings from Supabase

const supabase = require('./supabase');
const { buildSlotDatetime } = require('../utils/slotGenerator');

// Generate a unique 3-digit zero-padded booking ID (001 – 999)
async function generateBookingId() {
    const { data: existing } = await supabase
        .from('bookings')
        .select('booking_id')
        .not('booking_id', 'is', null);

    const usedIds = new Set((existing || []).map(b => b.booking_id));

    // Try random candidates first for speed
    for (let i = 0; i < 500; i++) {
        const candidate = String(Math.floor(Math.random() * 999) + 1).padStart(3, '0');
        if (!usedIds.has(candidate)) return candidate;
    }

    // Sequential fallback if random keeps hitting used IDs
    for (let n = 1; n <= 999; n++) {
        const candidate = String(n).padStart(3, '0');
        if (!usedIds.has(candidate)) return candidate;
    }

    return null; // All 999 IDs exhausted
}

// Save a new confirmed booking
async function createBooking({ phone, name, date, slot }) {
    const slotStart = buildSlotDatetime(date, slot);
    const bookingId = await generateBookingId();

    if (!bookingId) {
        console.error('Booking ID generation failed: all IDs exhausted');
        return null;
    }

    const { data, error } = await supabase
        .from('bookings')
        .insert([{
            phone,
            name,
            booking_date:  date,
            slot_time:     slot,
            slot_start:    slotStart,
            booking_id:    bookingId,
            status:        'confirmed',
            reminder_sent: false
        }])
        .select()
        .single();

    if (error) {
        console.error('Booking save error:', error.message);
        return null;
    }

    console.log(`Booking saved: [${bookingId}] ${name} | ${date} | ${slot}`);
    return data;
}

// Fetch a booking by its 3-digit booking_id AND the user's phone
// so users can only look up their own bookings
async function getBookingById(bookingId, phone) {
    const { data, error } = await supabase
        .from('bookings')
        .select('*')
        .eq('booking_id', bookingId)
        .eq('phone', phone)
        .eq('status', 'confirmed')
        .single();

    if (error && error.code !== 'PGRST116') {
        console.error('Booking lookup error:', error.message);
    }

    return data || null;
}

// Cancel a booking by its internal numeric id (releases the slot)
async function cancelBooking(id) {
    const { error } = await supabase
        .from('bookings')
        .update({ status: 'cancelled', cancelled_reason: 'user_request' })
        .eq('id', id);

    if (error) {
        console.error('Booking cancel error:', error.message);
        return false;
    }

    return true;
}

// Mark reminder as sent so the cron does not fire twice
async function markReminderSent(id) {
    const { error } = await supabase
        .from('bookings')
        .update({ reminder_sent: true })
        .eq('id', id);

    if (error) console.error('Reminder mark error:', error.message);
}

// Fetch all confirmed bookings whose appointment is within the next 20 minutes
// and have not had a reminder sent yet
async function getUpcomingReminders() {
    const now      = new Date();
    const in20mins = new Date(now.getTime() + 20 * 60 * 1000);

    const { data, error } = await supabase
        .from('bookings')
        .select('*')
        .eq('status', 'confirmed')
        .eq('reminder_sent', false)
        .gte('slot_start', now.toISOString())
        .lte('slot_start', in20mins.toISOString());

    if (error) {
        console.error('Reminder fetch error:', error.message);
        return [];
    }

    return data || [];
}

// ── V2.0: Get all confirmed bookings for a specific date ─────────────────────
async function getBookingsByDate(dateStr) {
    const { data, error } = await supabase
        .from('bookings')
        .select('*')
        .eq('booking_date', dateStr)
        .eq('status', 'confirmed')
        .order('slot_time', { ascending: true });

    if (error) {
        console.error('Bookings by date error:', error.message);
        return [];
    }
    return data || [];
}

// ── V2.0: Get confirmed bookings for a date filtered by period ───────────────
// period = "morning" | "afternoon" | "evening"
async function getBookingsByDateAndPeriod(dateStr, period) {
    const all = await getBookingsByDate(dateStr);
    if (!period) return all;

    return all.filter(b => {
        const [time, ampm] = b.slot_time.split(' ');
        let [hour] = time.split(':').map(Number);
        if (ampm === 'PM' && hour !== 12) hour += 12;
        if (ampm === 'AM' && hour === 12) hour = 0;

        if (period === 'morning')   return hour < 12 || hour === 12;
        if (period === 'afternoon') return hour >= 14 && hour < 17;
        if (period === 'evening')   return hour >= 17;
        return true;
    });
}

// ── V2.0: Cancel all confirmed bookings for a date (or period), mark admin_block ─
// Returns the list of cancelled bookings so caller can notify patients
async function cancelBookingsByBlock(dateStr, period = null) {
    const toCancel = period
        ? await getBookingsByDateAndPeriod(dateStr, period)
        : await getBookingsByDate(dateStr);

    if (toCancel.length === 0) return [];

    const ids = toCancel.map(b => b.id);

    // Try with cancelled_reason (V2.0 schema) — fall back without it (V1.x schema)
    let { error } = await supabase
        .from('bookings')
        .update({ status: 'cancelled', cancelled_reason: 'admin_block' })
        .in('id', ids);

    if (error) {
        // Column might not exist yet — retry with just status
        console.warn('cancelBookingsByBlock: retrying without cancelled_reason:', error.message);
        const retry = await supabase
            .from('bookings')
            .update({ status: 'cancelled' })
            .in('id', ids);
        if (retry.error) {
            console.error('Bulk cancel error:', retry.error.message);
            return [];
        }
    }

    console.log(`Admin block: cancelled ${toCancel.length} booking(s) on ${dateStr}${period ? ` (${period})` : ''}`);
    return toCancel;
}

// ── V2.0: Count today's confirmed bookings (for admin alert) ─────────────────
async function countTodayBookings() {
    // IST date
    const istNow   = new Date(Date.now() + 330 * 60 * 1000);
    const todayStr = istNow.toISOString().split('T')[0];

    const { count, error } = await supabase
        .from('bookings')
        .select('id', { count: 'exact', head: true })
        .eq('booking_date', todayStr)
        .eq('status', 'confirmed');

    if (error) return 0;
    return count || 0;
}

// ── V2.0: All confirmed bookings from today onward (for admin full schedule) ───
async function getUpcomingBookings() {
    const istNow   = new Date(Date.now() + 330 * 60 * 1000);
    const todayStr = istNow.toISOString().split('T')[0];

    const { data, error } = await supabase
        .from('bookings')
        .select('*')
        .eq('status', 'confirmed')
        .gte('booking_date', todayStr)
        .order('booking_date', { ascending: true })
        .order('slot_time',    { ascending: true });

    if (error) {
        console.error('getUpcomingBookings error:', error.message);
        return [];
    }
    return data || [];
}

// ── V2.0: Get all bookings for admin dashboard ───────────────────────────────
async function getAllBookings({ dateStr, status } = {}) {
    let query = supabase
        .from('bookings')
        .select('*')
        .order('booking_date', { ascending: false })
        .order('slot_time',    { ascending: true });

    if (dateStr) query = query.eq('booking_date', dateStr);
    if (status)  query = query.eq('status', status);

    const { data, error } = await query;
    if (error) {
        console.error('getAllBookings error:', error.message);
        return [];
    }
    return data || [];
}

module.exports = {
    createBooking,
    getBookingById,
    cancelBooking,
    markReminderSent,
    getUpcomingReminders,
    getBookingsByDate,
    getBookingsByDateAndPeriod,
    cancelBookingsByBlock,
    countTodayBookings,
    getUpcomingBookings,
    getAllBookings
};
