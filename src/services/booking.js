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
        .update({ status: 'cancelled' })
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

module.exports = {
    createBooking,
    getBookingById,
    cancelBooking,
    markReminderSent,
    getUpcomingReminders
};
