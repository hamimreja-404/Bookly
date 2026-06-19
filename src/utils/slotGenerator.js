const supabase = require('../services/supabase');

// ── All possible slots in a day (fixed master list) ──────────────────────────
function buildMasterSlots() {
    const slots = [];
    // 10:00 AM → 1:00 PM  (before break)
    let hour = 10, minute = 0;
    while (hour < 13) {
        slots.push(formatSlot(hour, minute));
        minute += 20;
        if (minute >= 60) { minute = 0; hour++; }
    }
    // 2:00 PM → 7:00 PM  (after break — last slot is 6:40 PM so appt ends by 7)
    hour = 14; minute = 0;
    while (hour < 19) {
        if (hour === 18 && minute > 40) break; 
        slots.push(formatSlot(hour, minute));
        minute += 20;
        if (minute >= 60) { minute = 0; hour++; }
    }
    return slots; 
}

function formatSlot(hour, minute) {
    const period = hour >= 12 ? 'PM' : 'AM';
    const displayHour = hour > 12 ? hour - 12 : hour;
    const displayMin  = minute === 0 ? '00' : minute;
    return `${displayHour}:${displayMin} ${period}`;
}

// Convert "10:20 AM" → { hour: 10, minute: 20 }
function parseSlot(slotStr) {
    const [time, period] = slotStr.split(' ');
    let [hour, minute]   = time.split(':').map(Number);
    if (period === 'PM' && hour !== 12) hour += 12;
    if (period === 'AM' && hour === 12) hour = 0;
    return { hour, minute };
}

// ── Main exported function
async function getAvailableSlots(dateStr) {
    // dateStr is "YYYY-MM-DD"
    const master = buildMasterSlots();
    const now    = new Date();

    // 1. If the date is today, filter out past slots
    // Use local date string comparison to avoid UTC vs IST timezone confusion
    const localTodayStr = [
        now.getFullYear(),
        String(now.getMonth() + 1).padStart(2, '0'),
        String(now.getDate()).padStart(2, '0')
    ].join('-');
    const isToday = (dateStr === localTodayStr);

    let filtered = master;
    if (isToday) {
        // Filter slots that are at least 40 minutes from now
        const nowMinutes = now.getHours() * 60 + now.getMinutes() + 40;
        filtered = master.filter(slot => {
            const { hour, minute } = parseSlot(slot);
            return (hour * 60 + minute) >= nowMinutes;
        });
    }

    // 2. Fetch already-booked slots from Supabase for this date
    const { data: booked, error } = await supabase
        .from('bookings')
        .select('slot_time')
        .eq('booking_date', dateStr)
        .eq('status', 'confirmed');

    if (error) {
        console.error('Supabase error fetching booked slots:', error.message);
        return filtered; 
    }

    const bookedTimes = new Set((booked || []).map(b => b.slot_time));

    // 3. Remove booked slots
    const available = filtered.filter(slot => !bookedTimes.has(slot));

    return available;
}

// Build a full slot datetime for storing in Supabase (for reminder cron)
function buildSlotDatetime(dateStr, slotStr) {
    // dateStr: "2026-06-20", slotStr: "10:20 AM"
    const { hour, minute } = parseSlot(slotStr);
    const dt = new Date(dateStr);
    dt.setHours(hour, minute, 0, 0);
    return dt.toISOString();
}

module.exports = { getAvailableSlots, buildSlotDatetime };
