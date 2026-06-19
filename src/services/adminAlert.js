// adminAlert.js — Sends WhatsApp alerts to the admin when a booking is made (V2.0)

const { sendText } = require('./whatsapp');

const ADMIN_PHONE = process.env.ADMIN_PHONE; // e.g. "919382426273"

function formatDateDisplay(dateStr) {
    const d = new Date(dateStr + 'T00:00:00'); // local midnight
    return d.toLocaleDateString('en-IN', {
        weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'
    });
}

// Called after a successful booking — fires and forgets (errors do not affect user flow)
async function sendNewBookingAlert(booking, todayCount) {
    if (!ADMIN_PHONE) {
        console.warn('ADMIN_PHONE not set — skipping admin alert');
        return;
    }

    const message =
        '🔔 New Booking Alert\n\n' +
        `Booking ID : ${booking.booking_id}\n` +
        `Name       : ${booking.name}\n` +
        `Phone      : +${booking.phone}\n` +
        `Date       : ${formatDateDisplay(booking.booking_date)}\n` +
        `Time       : ${booking.slot_time}\n\n` +
        `Total booked today: ${todayCount}`;

    try {
        await sendText(ADMIN_PHONE, message);
        console.log(`Admin alert sent for booking [${booking.booking_id}]`);
    } catch (err) {
        console.error('Admin alert send error:', err.message);
    }
}

module.exports = { sendNewBookingAlert };
