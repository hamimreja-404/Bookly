// Finds bookings starting in the next 20 minutes and sends a reminder

const cron = require('node-cron');
const { getUpcomingReminders, markReminderSent } = require('../services/booking');
const { sendText } = require('../services/whatsapp');

function formatDateDisplay(dateStr) {
    const d = new Date(dateStr);
    return d.toLocaleDateString('en-IN', {
        weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'
    });
}

async function runReminderCheck() {
    const reminders = await getUpcomingReminders();

    if (reminders.length === 0) return; 

    console.log(`\nReminder check: ${reminders.length} reminder(s) to send`);

    for (const booking of reminders) {
        const message =
            `*Appointment Reminder*\n\n` +
            `Hi ${booking.name}! Your appointment is in *20 minutes*.\n\n` +
            `Date : ${formatDateDisplay(booking.booking_date)}\n` +
            `Time : ${booking.slot_time}\n\n` +
            `Please arrive on time. See you soon! `;

        await sendText(booking.phone, message);
        await markReminderSent(booking.id);

        console.log(`Reminder sent to ${booking.name} (${booking.phone}) for ${booking.slot_time}`);
    }
}

function startReminderCron() {
    // Run every minute 
    cron.schedule('* * * * *', async () => {
        try {
            await runReminderCheck();
        } catch (err) {
            console.error('Reminder cron error:', err.message);
        }
    });

    console.log('Reminder cron started (checks every minute)');
}

module.exports = { startReminderCron };
