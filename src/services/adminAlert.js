// adminAlert.js — Sends WhatsApp alerts to the admin when a booking is made (V2.0)
// NOTE on WhatsApp API rules:
//   Free-form text messages can ONLY be sent to a number that has messaged
//   this bot within the last 24 hours (the "customer service window").
//   For the admin alert to always work:
//     Option A (quick): Admin sends any message to the bot once per day to open the window.
//     Option B (permanent): Create an approved "booking_alert" template in Meta Business Manager
//                          and switch to sendTemplate() below.

const { sendText } = require('./whatsapp');

// Read at startup time — restart server after changing .env
const ADMIN_PHONE = process.env.ADMIN_PHONE;

function formatDateDisplay(dateStr) {
    const d = new Date(dateStr + 'T00:00:00');
    return d.toLocaleDateString('en-IN', {
        weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'
    });
}

// Called after a successful booking — fires and forgets
async function sendNewBookingAlert(booking, todayCount) {
    if (!ADMIN_PHONE) {
        console.warn('[Admin Alert] ADMIN_PHONE not set in .env — skipping alert');
        return;
    }

    console.log(`[Admin Alert] Sending booking alert to ${ADMIN_PHONE} for booking [${booking.booking_id}]`);

    const message =
        '🔔 New Booking Alert\n\n' +
        `Booking ID : ${booking.booking_id}\n` +
        `Name       : ${booking.name}\n` +
        `Phone      : +${booking.phone}\n` +
        `Date       : ${formatDateDisplay(booking.booking_date)}\n` +
        `Time       : ${booking.slot_time}\n\n` +
        `Total booked today: ${todayCount}`;

    try {
        const result = await sendText(ADMIN_PHONE, message);
        if (result) {
            console.log(`[Admin Alert] ✅ Alert sent successfully for booking [${booking.booking_id}]`);
        } else {
            console.warn(`[Admin Alert] ⚠️ Alert may have failed — no result returned. Check WhatsApp error above.`);
            console.warn(`[Admin Alert] Fix: Admin must send a message to the bot first to open the 24-hr window.`);
        }
    } catch (err) {
        console.error('[Admin Alert] Send error:', err.message);
    }
}

module.exports = { sendNewBookingAlert };
