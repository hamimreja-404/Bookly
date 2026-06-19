// Handles saving and reading bookings from Supabase

const supabase = require('./supabase');
const { buildSlotDatetime } = require('../utils/slotGenerator');


async function createBooking({ phone, name, date, slot }) {
    const slotStart = buildSlotDatetime(date, slot); 

    const { data, error } = await supabase
        .from('bookings')
        .insert([{
            phone,
            name,
            booking_date:  date,
            slot_time:     slot,
            slot_start:    slotStart,
            status:        'confirmed',
            reminder_sent: false
        }])
        .select()
        .single();

    if (error) {
        console.error('Booking save error:', error.message);
        return null;
    }

    console.log(`Booking saved: ${name} | ${date} | ${slot}`);
    return data;
}

// Mark reminder as sent so cron doesn't fire twice
async function markReminderSent(bookingId) {
    const { error } = await supabase
        .from('bookings')
        .update({ reminder_sent: true })
        .eq('id', bookingId);

    if (error) console.error('Reminder mark error:', error.message);
}

// Fetch all confirmed bookings whose appointment is within the next 20 minutes and haven't had a reminder sent yet
async function getUpcomingReminders() {
    const now       = new Date();
    const in20mins  = new Date(now.getTime() + 20 * 60 * 1000);

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

module.exports = { createBooking, markReminderSent, getUpcomingReminders };
