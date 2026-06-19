// handles every incoming message and drives the booking flow

const { sendText, sendButtons, sendList } = require('../services/whatsapp');
const { getSession, setSession, clearSession } = require('../services/session');
const { getAvailableSlots } = require('../utils/slotGenerator');
const { createBooking } = require('../services/booking');

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

// ── Split slots into Morning / Afternoon / Evening

function splitSlotsByPeriod(slots) {
    const morning   = [];
    const afternoon = [];
    const evening   = [];

    for (const slot of slots) {
        const [time, period] = slot.split(' ');
        let [hour] = time.split(':').map(Number);
        if (period === 'PM' && hour !== 12) hour += 12;

        if (hour < 12) {
            morning.push(slot);           
        } else if (hour === 12) {
            morning.push(slot);           
        } else if (hour >= 14 && hour < 17) {
            afternoon.push(slot);         
        } else {
            evening.push(slot);          
        }
    }

    return { morning, afternoon, evening };
}

// Build period buttons — only show periods that have available slots
function buildPeriodButtons(periods) {
    const buttons = [];
    if (periods.morning.length > 0)   buttons.push({ id: 'period_morning',   title: `Morning (${periods.morning.length} slots)` });
    if (periods.afternoon.length > 0) buttons.push({ id: 'period_afternoon', title: `Afternoon (${periods.afternoon.length} slots)` });
    if (periods.evening.length > 0)   buttons.push({ id: 'period_evening',   title: `Evening (${periods.evening.length} slots)` });
    return buttons; 
}

// ── Main handler 
async function handleIncoming(from, messageType, messageBody) {
    const session = await getSession(from);

    console.log(`\n Message From: ${from} | Step: ${session.step} | Type: ${messageType}`);
    console.log(`   Message: "${messageBody}"`);

    // STEP 0: idle
    if (session.step === 'idle') {
        const text = (messageBody || '').toLowerCase().trim();
        if (text === 'book' || text === 'book appointment' || text === 'hi' || text === 'hello') {
            await handleStart(from);
        } else {
            await sendText(from, `Hi! Send *Book* to book an appointment.\n\nOr type *Book* anytime to start.`);
        }
        return;
    }

    // STEP 1: waiting for date
    if (session.step === 'awaiting_date') {
        if (messageType === 'interactive') {
            const buttonId = messageBody;
            if (buttonId === 'date_today' || buttonId === 'date_tomorrow') {
                const dateStr = buttonId === 'date_today' ? getTodayStr() : getTomorrowStr();
                await handleDateSelected(from, dateStr);
                return;
            }
        }
        await sendText(from, 'Please tap one of the date buttons above to continue.');
        return;
    }

    // STEP 2: waiting for time period (morning / afternoon / evening)
    if (session.step === 'awaiting_period') {
        if (messageType === 'interactive') {
            const buttonId = messageBody;
            if (['period_morning', 'period_afternoon', 'period_evening'].includes(buttonId)) {
                const period = buttonId.replace('period_', ''); 
                await handlePeriodSelected(from, session, period);
                return;
            }
        }
        await sendText(from, 'Please tap one of the time period buttons above.');
        return;
    }

    // STEP 3: waiting for slot
    if (session.step === 'awaiting_slot') {
        if (messageType === 'interactive') {
            const slotTime = messageBody.replace('slot_', '');
            await handleSlotSelected(from, session, slotTime);
            return;
        }
        await sendText(from, 'Please tap *View Slots* and choose a time from the list.');
        return;
    }

    // STEP 4: waiting for name
    if (session.step === 'awaiting_name') {
        const name = (messageBody || '').trim();
        if (name.length < 2) {
            await sendText(from, 'Please enter your full name.');
            return;
        }
        await handleNameReceived(from, session, name);
        return;
    }
}


// User said "book" → show today/tomorrow
async function handleStart(from) {
    const todayLabel   = `Today (${new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })})`;
    const tomorrowDate = new Date();
    tomorrowDate.setDate(tomorrowDate.getDate() + 1);
    const tomorrowLabel = `Tomorrow (${tomorrowDate.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })})`;

    await setSession(from, { step: 'awaiting_date' });

    await sendButtons(from,
        `*Book an Appointment*\n\nWhich day would you like?`,
        [
            { id: 'date_today',    title: todayLabel },
            { id: 'date_tomorrow', title: tomorrowLabel }
        ]
    );
}

// User picked a date → fetch all slots, split by period, show period buttons
async function handleDateSelected(from, dateStr) {
    await sendText(from, `Checking available slots for ${formatDateDisplay(dateStr)}, please wait...`);

    const slots = await getAvailableSlots(dateStr);

    if (slots.length === 0) {
        await sendText(from,
            `Sorry, no slots are available for ${formatDateDisplay(dateStr)}.\n\nSend *Book* to try another day.`
        );
        await clearSession(from);
        return;
    }

    const periods = splitSlotsByPeriod(slots);
    const buttons = buildPeriodButtons(periods);

    if (buttons.length === 0) {
        await sendText(from, `No slots available. Send *Book* to try again.`);
        await clearSession(from);
        return;
    }

    // Save the full slot list + date in session so we can filter later
    await setSession(from, {
        step:          'awaiting_period',
        selected_date: dateStr,
        // Store as JSON strings — Supabase text columns
        slots_morning:   JSON.stringify(periods.morning),
        slots_afternoon: JSON.stringify(periods.afternoon),
        slots_evening:   JSON.stringify(periods.evening)
    });

    await sendButtons(from,
        `*${formatDateDisplay(dateStr)}*\n\nChoose a time of day:`,
        buttons
    );
}

// User picked a period → show slots for that period
async function handlePeriodSelected(from, session, period) {
    // Retrieve the slots we saved in the session
    let slots = [];
    if (period === 'morning')   slots = JSON.parse(session.slots_morning   || '[]');
    if (period === 'afternoon') slots = JSON.parse(session.slots_afternoon || '[]');
    if (period === 'evening')   slots = JSON.parse(session.slots_evening   || '[]');

    if (slots.length === 0) {
        await sendText(from, `No slots available for that period. Please choose another time.`);
        return;
    }

    const periodLabel = {
        morning:   'Morning',
        afternoon: 'Afternoon',
        evening:   'Evening'
    }[period];

    await setSession(from, { step: 'awaiting_slot' });

    await sendList(
        from,
        `*${periodLabel} slots*\non ${formatDateDisplay(session.selected_date)}\n\nEach slot is 20 minutes.`,
        'View Slots',
        periodLabel,
        slots.slice(0, 10).map(s => ({ id: `slot_${s}`, title: s }))
    );
}

// User picked a slot → ask for name
async function handleSlotSelected(from, session, slotTime) {
    await setSession(from, { step: 'awaiting_name', selected_slot: slotTime });

    await sendText(from,
        `You selected *${slotTime}* on *${formatDateDisplay(session.selected_date)}*\n\nPlease type your *Full Name* to confirm the booking.`
    );
}

// User typed name → save booking and confirm
async function handleNameReceived(from, session, name) {
    await sendText(from, `Booking your appointment...`);

    const booking = await createBooking({
        phone: from,
        name,
        date:  session.selected_date,
        slot:  session.selected_slot
    });

    if (!booking) {
        await sendText(from, `Something went wrong. Please send *Book* to try again.`);
        await clearSession(from);
        return;
    }

    await clearSession(from);

    await sendText(from,
        `*Booking Confirmed!*\n\n` +
        `Name  : ${name}\n` +
        `Date  : ${formatDateDisplay(session.selected_date)}\n` +
        `Time  : ${session.selected_slot}\n\n` +
        `You will receive a reminder 20 minutes before your appointment.\n\n` +
        `Thank you! See you soon`
    );

    console.log(`\n Booking confirmed: ${name} | ${session.selected_date} | ${session.selected_slot}`);
}

module.exports = { handleIncoming };