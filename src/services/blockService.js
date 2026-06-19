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

// ── Return the next 7 days as { dateStr, label } objects ────────────────────
function getNext7Days() {
    const days = [];
    for (let i = 0; i <= 7; i++) {
        const d = new Date();
        d.setDate(d.getDate() + i);
        const dateStr = [
            d.getFullYear(),
            String(d.getMonth() + 1).padStart(2, '0'),
            String(d.getDate()).padStart(2, '0')
        ].join('-');
        const label = d.toLocaleDateString('en-IN', {
            weekday: 'short', day: 'numeric', month: 'short'
        });
        days.push({ dateStr, label, isToday: i === 0 });
    }
    return days;
}

// ── Create a block (full day or specific slot) ──────────────────────────────
// slot_time = null → full day block
// slot_time = "10:20 AM" → single slot block
// period = "morning" | "afternoon" | "evening" | null (full day)
async function createBlock({ block_date, slot_time = null, period = null }) {
    const { data, error } = await supabase
        .from('blocked_slots')
        .insert([{ block_date, slot_time, period }])
        .select()
        .single();

    if (error) {
        console.error('Block create error:', error.message);
        return null;
    }

    return data;
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
