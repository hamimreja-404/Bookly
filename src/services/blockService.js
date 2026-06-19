// blockService.js — CRUD for the blocked_slots table (V2.0)

const supabase = require('./supabase');

// ── Helper: local date string for "today + N days" ───────────────────────────
function getLocalDateStr(offsetDays = 0) {
    const d = new Date();
    d.setDate(d.getDate() + offsetDays);
    return [
        d.getFullYear(),
        String(d.getMonth() + 1).padStart(2, '0'),
        String(d.getDate()).padStart(2, '0')
    ].join('-');
}

// ── Return the next 7 days as { dateStr, label } objects (IST dates) ─────────
function getNext7Days() {
    const days = [];
    for (let i = 0; i <= 7; i++) {
        // Use IST (+5:30) so dates are correct on UTC servers like Render
        const ist = new Date(Date.now() + 330 * 60 * 1000);
        ist.setUTCDate(ist.getUTCDate() + i);
        const dateStr = ist.toISOString().split('T')[0];

        const DAYS   = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
        const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
        const label  = `${DAYS[ist.getUTCDay()]} ${ist.getUTCDate()} ${MONTHS[ist.getUTCMonth()]}`;

        days.push({ dateStr, label, isToday: i === 0 });
    }
    return days;
}

// ── Create a block (full day or period) ───────────────────────────────────────
// period = "morning" | "afternoon" | "evening" | null (full day)
async function createBlock({ block_date, slot_time = null, period = null }) {
    // Try with period column first (V2.0 full schema)
    const { data, error } = await supabase
        .from('blocked_slots')
        .insert([{ block_date, slot_time, period }])
        .select()
        .single();

    if (!error) return data;

    console.error('Block create error (with period):', error.message);

    // If the period column doesn't exist yet, retry without it
    if (error.message && (error.message.includes('period') || error.code === '42703')) {
        console.warn('Retrying block insert without period column (run V2.0 migration to add it)');
        const retry = await supabase
            .from('blocked_slots')
            .insert([{ block_date, slot_time }])
            .select()
            .single();

        if (!retry.error) return retry.data;
        console.error('Block create retry error:', retry.error.message);
    }

    return null;
}

// ── Get all active blocks ────────────────────────────────────────────────────
async function getBlocks() {
    const { data, error } = await supabase
        .from('blocked_slots')
        .select('*')
        .order('block_date', { ascending: true })
        .order('slot_time',  { ascending: true });

    if (error) {
        console.error('Block fetch error:', error.message);
        return [];
    }
    return data || [];
}

// ── Get blocks for a specific date ──────────────────────────────────────────
async function getBlocksForDate(dateStr) {
    const { data, error } = await supabase
        .from('blocked_slots')
        .select('*')
        .eq('block_date', dateStr);

    if (error) {
        console.error('Block fetch error:', error.message);
        return [];
    }
    return data || [];
}

// ── Delete a block by its id ─────────────────────────────────────────────────
async function deleteBlock(id) {
    const { error } = await supabase
        .from('blocked_slots')
        .delete()
        .eq('id', id);

    if (error) {
        console.error('Block delete error:', error.message);
        return false;
    }
    return true;
}

// ── Check if an entire date is blocked ───────────────────────────────────────
async function isDateFullyBlocked(dateStr) {
    const { data, error } = await supabase
        .from('blocked_slots')
        .select('id')
        .eq('block_date', dateStr)
        .is('slot_time', null)
        .limit(1);

    if (error) return false;
    return (data && data.length > 0);
}

// ── Get all blocked slot_times for a specific date ───────────────────────────
// Returns a Set of blocked slot strings e.g. {"10:00 AM", "2:00 PM"}
async function getBlockedSlotsForDate(dateStr) {
    const blocks = await getBlocksForDate(dateStr);

    // If any block has slot_time = null → entire day is blocked
    const dayBlocked = blocks.some(b => b.slot_time === null);
    if (dayBlocked) return { dayBlocked: true, slots: new Set() };

    const slots = new Set(blocks.map(b => b.slot_time).filter(Boolean));
    return { dayBlocked: false, slots };
}

module.exports = {
    getNext7Days,
    createBlock,
    getBlocks,
    getBlocksForDate,
    deleteBlock,
    isDateFullyBlocked,
    getBlockedSlotsForDate
};
