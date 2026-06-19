// Handles every incoming message and drives the booking flow
//
// V1.1 States:
//   idle                → user sends "book" / "cancel" / "reschedule"
//   awaiting_date       → user picks date button (Today / Tomorrow)
//   awaiting_period     → user picks time-of-day button (Morning / Afternoon / Evening)
//   awaiting_slot       → user picks a 20-min slot from the list
//   awaiting_name       → user types full name
//   awaiting_action_id  → user types their 3-digit Booking ID (for cancel/reschedule)
//   awaiting_cancel_confirm → user confirms or keeps the booking via buttons

const { sendText, sendButtons, sendList } = require('../services/whatsapp');
const { getSession, setSession, clearSession } = require('../services/session');
const { getAvailableSlots } = require('../utils/slotGenerator');
const { createBooking, getBookingById, cancelBooking } = require('../services/booking');

// ── Date helpers ──────────────────────────────────────────────────────────────

function getTodayStr() {
    return new Date().toISOString().split('T')[0];
}

function getTomorrowStr() {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    return d.toISOString().split('T')[0];
}

function formatDateDisplay(dateStr) {
    const d = new Date(dateStr);
    return d.toLocaleDateString('en-IN', {
        weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'
    });
}

// Returns true if today's last bookable slot (6:40 PM) has already passed
function isBookingClosedForToday() {
    const now = new Date();
    return now.getHours() > 18 || (now.getHours() === 18 && now.getMinutes() >= 40);
}

// ── Period helpers ────────────────────────────────────────────────────────────

function splitSlotsByPeriod(slots) {
    const morning   = [];
    const afternoon = [];
    const evening   = [];

    for (const slot of slots) {
        const [time, period] = slot.split(' ');
        let [hour] = time.split(':').map(Number);
        if (period === 'PM' && hour !== 12) hour += 12;

        if (hour < 12 || hour === 12) {
            morning.push(slot);       // 10:00 AM – 12:40 PM
        } else if (hour >= 14 && hour < 17) {
            afternoon.push(slot);     // 2:00 PM – 4:40 PM
        } else {
            evening.push(slot);       // 5:00 PM – 6:40 PM
        }
    }

    return { morning, afternoon, evening };
}

// Only include periods that have at least one available slot
function buildPeriodButtons(periods) {
    const buttons = [];
    if (periods.morning.length > 0)   buttons.push({ id: 'period_morning',   title: `Morning (${periods.morning.length} slots)` });
    if (periods.afternoon.length > 0) buttons.push({ id: 'period_afternoon', title: `Afternoon (${periods.afternoon.length} slots)` });
    if (periods.evening.length > 0)   buttons.push({ id: 'period_evening',   title: `Evening (${periods.evening.length} slots)` });
    return buttons;
}

// ── Date selection helper (shared by Book and Reschedule) ─────────────────────

async function sendDateSelection(from, prefixMessage) {
    const closed = isBookingClosedForToday();

    const tomorrowDate = new Date();
    tomorrowDate.setDate(tomorrowDate.getDate() + 1);
    const tomorrowLabel = `Tomorrow (${tomorrowDate.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })})`;

    const buttons = [];
    let bodyText;

    if (!closed) {
        const todayLabel = `Today (${new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })})`;
        buttons.push({ id: 'date_today',    title: todayLabel });
        buttons.push({ id: 'date_tomorrow', title: tomorrowLabel });
        bodyText = (prefixMessage ? prefixMessage + '\n\n' : '') + 'Which day would you like?';
    } else {
        buttons.push({ id: 'date_tomorrow', title: tomorrowLabel });
        bodyText = (prefixMessage ? prefixMessage + '\n\n' : '') +
                   'Bookings for today are now closed (last slot was 6:40 PM).\nYou can book for tomorrow:';
    }

    await setSession(from, { step: 'awaiting_date' });
    await sendButtons(from, bodyText, buttons);
}

// ── Main handler ──────────────────────────────────────────────────────────────

async function handleIncoming(from, messageType, messageBody) {
    try {
        const session = await getSession(from);

        // Notify user if their session expired mid-flow
        if (session._timedOut) {
            await sendText(from,
                'Your session expired after 5 minutes of inactivity.\n\n' +
                'Send *Book* to make a new booking, *Cancel* to cancel, or *Reschedule* to change a booking.'
            );
            return;
        }

        console.log(`\nMessage From: ${from} | Step: ${session.step} | Type: ${messageType}`);
        console.log(`   Message: "${messageBody}"`);

        // ── STEP 0: idle ──────────────────────────────────────────────────────
        if (session.step === 'idle') {
            const text = (messageBody || '').toLowerCase().trim();

            if (text === 'book' || text === 'book appointment' || text === 'hi' || text === 'hello') {
                await sendDateSelection(from, 'Book an Appointment');
            } else if (text === 'cancel') {
                await setSession(from, { step: 'awaiting_action_id', pending_action: 'cancel' });
                await sendText(from,
                    'To cancel a booking, please type your *3-digit Booking ID*.\n\n' +
                    'Your Booking ID was included in your booking confirmation message.'
                );
            } else if (text === 'reschedule') {
                await setSession(from, { step: 'awaiting_action_id', pending_action: 'reschedule' });
                await sendText(from,
                    'To reschedule a booking, please type your *3-digit Booking ID*.\n\n' +
                    'Your Booking ID was included in your booking confirmation message.'
                );
            } else {
                await sendText(from,
                    'Hi! Here is what you can do:\n\n' +
                    '- Send *Book* to book an appointment\n' +
                    '- Send *Cancel* to cancel a booking\n' +
                    '- Send *Reschedule* to reschedule a booking'
                );
            }
            return;
        }

        // ── STEP 1: waiting for date button ───────────────────────────────────
        if (session.step === 'awaiting_date') {
            if (messageType !== 'interactive') {
                await sendText(from, 'Please tap one of the date buttons shown above to continue. Do not type a message.');
                return;
            }
            const buttonId = messageBody;
            if (buttonId === 'date_today' || buttonId === 'date_tomorrow') {
                const dateStr = buttonId === 'date_today' ? getTodayStr() : getTomorrowStr();
                await handleDateSelected(from, dateStr);
                return;
            }
            await sendText(from, 'Please tap one of the date buttons shown above to continue.');
            return;
        }

        // ── STEP 2: waiting for period button ─────────────────────────────────
        if (session.step === 'awaiting_period') {
            if (messageType !== 'interactive') {
                await sendText(from, 'Please tap one of the time period buttons shown above. Do not type a message.');
                return;
            }
            const buttonId = messageBody;
            if (['period_morning', 'period_afternoon', 'period_evening'].includes(buttonId)) {
                const period = buttonId.replace('period_', '');
                await handlePeriodSelected(from, session, period);
                return;
            }
            await sendText(from, 'Please tap one of the time period buttons shown above.');
            return;
        }

        // ── STEP 3: waiting for slot list selection ───────────────────────────
        if (session.step === 'awaiting_slot') {
            if (messageType !== 'interactive') {
                await sendText(from, 'Please open the slot list by tapping *View Slots* and choose a time. Do not type a message.');
                return;
            }
            if (!messageBody.startsWith('slot_')) {
                await sendText(from, 'Please open the slot list by tapping *View Slots* and choose a time.');
                return;
            }
            const slotTime = messageBody.replace('slot_', '');
            await handleSlotSelected(from, session, slotTime);
            return;
        }

        // ── STEP 4: waiting for name (text only) ──────────────────────────────
        if (session.step === 'awaiting_name') {
            if (messageType !== 'text') {
                await sendText(from, 'Please type your full name as a text message to confirm the booking.');
                return;
            }
            const name = (messageBody || '').trim();
            if (name.length < 2) {
                await sendText(from, 'Please enter your full name (at least 2 characters).');
                return;
            }
            await handleNameReceived(from, session, name);
            return;
        }

        // ── STEP 5: waiting for 3-digit Booking ID (cancel / reschedule) ──────
        if (session.step === 'awaiting_action_id') {
            if (messageType !== 'text') {
                await sendText(from, 'Please type your 3-digit Booking ID as a text message.');
                return;
            }
            const rawId = (messageBody || '').trim();
            await handleActionId(from, session, rawId);
            return;
        }

        // ── STEP 6: waiting for cancel confirmation button ────────────────────
        if (session.step === 'awaiting_cancel_confirm') {
            if (messageType !== 'interactive') {
                await sendText(from, 'Please tap *Confirm Cancel* or *Keep Booking* from the buttons shown above. Do not type a message.');
                return;
            }
            if (messageBody === 'confirm_cancel') {
                await handleConfirmCancel(from, session);
                return;
            }
            if (messageBody === 'keep_booking') {
                await clearSession(from);
                await sendText(from,
                    'Your booking has been kept.\n\n' +
                    'Send *Book* for a new booking or *Reschedule* to change your time.'
                );
                return;
            }
            await sendText(from, 'Please tap *Confirm Cancel* or *Keep Booking* from the buttons shown above.');
            return;
        }

    } catch (err) {
        console.error('Flow handler error:', err.message, err.stack);
        try {
            await sendText(from, 'Something went wrong on our end. Please send *Book* to start again.');
            await clearSession(from);
        } catch (sendErr) {
            console.error('Failed to send error message:', sendErr.message);
        }
    }
}

// ── Step handlers ─────────────────────────────────────────────────────────────

// User picked a date — fetch available future slots, split by period, show buttons
async function handleDateSelected(from, dateStr) {
    await sendText(from, `Checking available slots for ${formatDateDisplay(dateStr)}, please wait...`);

    const slots = await getAvailableSlots(dateStr);
    // getAvailableSlots already filters out past slots for today

    if (slots.length === 0) {
        await sendText(from,
            `No slots are available for ${formatDateDisplay(dateStr)}.\n\nSend *Book* to try another day.`
        );
        await clearSession(from);
        return;
    }

    const periods = splitSlotsByPeriod(slots);
    const buttons = buildPeriodButtons(periods);
    // Only periods with available future slots are shown as buttons (max 3 — fits WhatsApp limit exactly)

    if (buttons.length === 0) {
        await sendText(from, 'No slots available. Send *Book* to try again.');
        await clearSession(from);
        return;
    }

    await setSession(from, {
        step:            'awaiting_period',
        selected_date:   dateStr,
        slots_morning:   JSON.stringify(periods.morning),
        slots_afternoon: JSON.stringify(periods.afternoon),
        slots_evening:   JSON.stringify(periods.evening)
    });

    await sendButtons(from,
        `*${formatDateDisplay(dateStr)}*\n\nChoose a time of day:`,
        buttons
    );
}

// User picked a period — show slots for that period only
async function handlePeriodSelected(from, session, period) {
    let slots = [];
    if (period === 'morning')   slots = JSON.parse(session.slots_morning   || '[]');
    if (period === 'afternoon') slots = JSON.parse(session.slots_afternoon || '[]');
    if (period === 'evening')   slots = JSON.parse(session.slots_evening   || '[]');

    if (slots.length === 0) {
        await sendText(from, 'No slots are available for that period. Please choose another.');
        return; // stay on awaiting_period
    }

    const periodLabel = { morning: 'Morning', afternoon: 'Afternoon', evening: 'Evening' }[period];

    await setSession(from, { step: 'awaiting_slot' });

    await sendList(
        from,
        `*${periodLabel} slots* on ${formatDateDisplay(session.selected_date)}\n\nEach appointment is 20 minutes.`,
        'View Slots',
        periodLabel,
        slots.slice(0, 10).map(s => ({ id: `slot_${s}`, title: s }))
    );
}

// User picked a slot — ask for their name (or skip if rescheduling with existing name)
async function handleSlotSelected(from, session, slotTime) {
    await setSession(from, { step: 'awaiting_name', selected_slot: slotTime });

    // If rescheduling, we already have the customer's name — skip asking again
    if (session.reschedule_name) {
        await handleNameReceived(from, { ...session, selected_slot: slotTime }, session.reschedule_name);
        return;
    }

    await sendText(from,
        `You selected *${slotTime}* on *${formatDateDisplay(session.selected_date)}*\n\n` +
        `Please type your *full name* to confirm the booking.`
    );
}

// User typed their name — save booking and send confirmation with Booking ID
async function handleNameReceived(from, session, name) {
    await sendText(from, 'Booking your appointment, please wait...');

    const booking = await createBooking({
        phone: from,
        name,
        date:  session.selected_date,
        slot:  session.selected_slot
    });

    if (!booking) {
        await sendText(from, 'Something went wrong saving your booking. Please send *Book* to try again.');
        await clearSession(from);
        return;
    }

    await clearSession(from);

    await sendText(from,
        'Booking Confirmed!\n\n' +
        `Booking ID : ${booking.booking_id}\n` +
        `Name       : ${name}\n` +
        `Date       : ${formatDateDisplay(session.selected_date)}\n` +
        `Time       : ${session.selected_slot}\n\n` +
        'You will receive a reminder 20 minutes before your appointment.\n\n' +
        'Keep your Booking ID safe — you will need it to Cancel or Reschedule.\n\n' +
        'Thank you! See you soon.'
    );

    console.log(`Booking confirmed: [${booking.booking_id}] ${name} | ${session.selected_date} | ${session.selected_slot}`);
}

// User typed a Booking ID for cancel or reschedule
async function handleActionId(from, session, rawId) {
    // Accept 1-3 digit numbers and zero-pad them
    if (!/^\d{1,3}$/.test(rawId)) {
        await sendText(from, 'Invalid format. Please enter a number between 1 and 999 (e.g. 42 or 042).');
        return; // stay on awaiting_action_id
    }

    const bookingId = rawId.padStart(3, '0');
    const booking   = await getBookingById(bookingId, from);

    if (!booking) {
        await sendText(from,
            `No active booking found with ID *${bookingId}* linked to your number.\n\n` +
            'Please check the ID and try again, or send *Book* to make a new booking.'
        );
        return; // stay on awaiting_action_id
    }

    if (session.pending_action === 'cancel') {
        await setSession(from, { step: 'awaiting_cancel_confirm', pending_booking_id: bookingId });

        await sendButtons(from,
            'Booking found:\n\n' +
            `Booking ID : ${booking.booking_id}\n` +
            `Name       : ${booking.name}\n` +
            `Date       : ${formatDateDisplay(booking.booking_date)}\n` +
            `Time       : ${booking.slot_time}\n\n` +
            'Do you want to cancel this booking?',
            [
                { id: 'confirm_cancel', title: 'Confirm Cancel' },
                { id: 'keep_booking',   title: 'Keep Booking'   }
            ]
        );

    } else if (session.pending_action === 'reschedule') {
        // Cancel old booking immediately to release the slot
        const cancelled = await cancelBooking(booking.id);
        if (!cancelled) {
            await sendText(from, 'Something went wrong cancelling your old booking. Please try again or send *Book*.');
            await clearSession(from);
            return;
        }

        await sendText(from,
            `Booking *${booking.booking_id}* has been cancelled and the slot released.\n\n` +
            'Let us find you a new time.'
        );

        // Store the customer's existing name so we don't ask again
        await setSession(from, {
            pending_action:     null,
            pending_booking_id: null,
            selected_date:      null,
            selected_slot:      null,
            reschedule_name:    booking.name   // ← carry over the name
        });
        await sendDateSelection(from, 'Book a New Appointment');
    }
}

// User confirmed the cancellation
async function handleConfirmCancel(from, session) {
    const booking = await getBookingById(session.pending_booking_id, from);

    if (!booking) {
        await sendText(from, 'Booking not found or already cancelled. Send *Book* for a new booking.');
        await clearSession(from);
        return;
    }

    const cancelled = await cancelBooking(booking.id);
    if (!cancelled) {
        await sendText(from, 'Something went wrong. Please try again by sending *Cancel*.');
        await clearSession(from);
        return;
    }

    await clearSession(from);

    await sendText(from,
        'Booking Cancelled.\n\n' +
        `Booking ID : ${booking.booking_id}\n` +
        `Name       : ${booking.name}\n` +
        `Date       : ${formatDateDisplay(booking.booking_date)}\n` +
        `Time       : ${booking.slot_time}\n\n` +
        'The slot has been released. Send *Book* to make a new booking.'
    );

    console.log(`Booking cancelled: [${booking.booking_id}] ${booking.name} | ${booking.booking_date} | ${booking.slot_time}`);
}

module.exports = { handleIncoming };