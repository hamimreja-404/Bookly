// Runs two background cron jobs:
//   1. Every minute — finds bookings within 20 minutes and sends reminders
//   2. Every minute — cleans up expired user sessions (idle them proactively)

const cron    = require('node-cron');
const supabase = require('../services/supabase');
const { getUpcomingReminders, markReminderSent } = require('../services/booking');
const { sendText } = require('../services/whatsapp');

function formatDateDisplay(dateStr) {
    const d = new Date(dateStr);
    return d.toLocaleDateString('en-IN', {
        weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'
    });
}

// ── Job 1: Appointment reminders ──────────────────────────────────────────────

async function runReminderCheck() {
    const reminders = await getUpcomingReminders();
    if (reminders.length === 0) return;

    console.log(`\nReminder check: ${reminders.length} reminder(s) to send`);

    for (const booking of reminders) {
        const message =
            'Appointment Reminder\n\n' +
            `Hi ${booking.name}, your appointment is in 20 minutes.\n\n` +
            `Booking ID : ${booking.booking_id}\n` +
            `Date       : ${formatDateDisplay(booking.booking_date)}\n` +
            `Time       : ${booking.slot_time}\n\n` +
            'Please arrive on time. See you soon.';

        await sendText(booking.phone, message);
        await markReminderSent(booking.id);

        console.log(`Reminder sent to ${booking.name} (${booking.phone}) for ${booking.slot_time}`);
    }
}

// ── Job 2: Expired session cleanup ────────────────────────────────────────────
// Proactively resets sessions that passed their timeout_at without user activity.
// This is a safety net — getSession also does a lazy check on each user message.

async function runSessionCleanup() {
    const { data, error } = await supabase
        .from('user_sessions')
        .update({
            step:               'idle',
            selected_date:      null,
            selected_slot:      null,
            slots_morning:      null,
            slots_afternoon:    null,
            slots_evening:      null,
            session_timeout_at: null,
            pending_action:     null,
            pending_booking_id: null,
            updated_at:         new Date().toISOString()
        })
        .neq('step', 'idle')
        .lt('session_timeout_at', new Date().toISOString())
        .select('phone');

    if (error) {
        console.error('Session cleanup error:', error.message);
        return;
    }

    if (data && data.length > 0) {
        console.log(`Session cleanup: reset ${data.length} expired session(s)`);
    }
}

// ── Start both crons ──────────────────────────────────────────────────────────

function startReminderCron() {
    // Reminders — every minute
    cron.schedule('* * * * *', async () => {
        try {
            await runReminderCheck();
        } catch (err) {
            console.error('Reminder cron error:', err.message);
        }
    });

    // Session cleanup — every minute
    cron.schedule('* * * * *', async () => {
        try {
            await runSessionCleanup();
        } catch (err) {
            console.error('Session cleanup cron error:', err.message);
        }
    });

    console.log('Reminder cron started (checks every minute)');
    console.log('Session cleanup cron started (checks every minute)');
}

module.exports = { startReminderCron };
