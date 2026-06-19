// adminRoutes.js — All /admin routes for the V2.0 Admin Dashboard

const express  = require('express');
const path     = require('path');
const supabase = require('../services/supabase');
const { createBlock, getBlocks, deleteBlock, getNext7Days } = require('../services/blockService');
const { cancelBookingsByBlock, getAllBookings, getBookingsByDate } = require('../services/booking');
const { sendText } = require('../services/whatsapp');
const { buildMasterSlots } = require('../utils/slotGenerator');

const router = express.Router();

// ── Helpers ──────────────────────────────────────────────────────────────────

function formatDateDisplay(dateStr) {
    const d = new Date(dateStr + 'T00:00:00');
    return d.toLocaleDateString('en-IN', {
        weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'
    });
}

// ── Auth Middleware ───────────────────────────────────────────────────────────
// Checks session cookie set at login. All /admin/api/* routes require this.

function requireAuth(req, res, next) {
    const sessionToken = req.cookies && req.cookies['admin_session'];
    if (!sessionToken || sessionToken !== process.env.ADMIN_SESSION_SECRET) {
        return res.status(401).json({ error: 'Unauthorized' });
    }
    next();
}

// ── POST /admin/login ─────────────────────────────────────────────────────────
router.post('/login', express.json(), async (req, res) => {
    const { username, password } = req.body || {};
    if (!username || !password) {
        return res.status(400).json({ error: 'Username and password required' });
    }

    const { data, error } = await supabase
        .from('admin_users')
        .select('id')
        .eq('username', username.trim())
        .eq('password', password.trim())
        .single();

    if (error || !data) {
        return res.status(401).json({ error: 'Invalid credentials' });
    }

    // Set a simple session cookie (HttpOnly, SameSite=Strict)
    res.cookie('admin_session', process.env.ADMIN_SESSION_SECRET, {
        httpOnly: true,
        sameSite: 'strict',
        maxAge: 8 * 60 * 60 * 1000  // 8 hours
    });

    return res.json({ success: true });
});

// ── POST /admin/logout ────────────────────────────────────────────────────────
router.post('/logout', (req, res) => {
    res.clearCookie('admin_session');
    res.json({ success: true });
});

// ── GET /admin/api/stats ──────────────────────────────────────────────────────
router.get('/api/stats', requireAuth, async (req, res) => {
    const now = new Date();
    const todayStr = [
        now.getFullYear(),
        String(now.getMonth() + 1).padStart(2, '0'),
        String(now.getDate()).padStart(2, '0')
    ].join('-');

    // Week start (Monday)
    const dayOfWeek = now.getDay(); // 0=Sun
    const monday = new Date(now);
    monday.setDate(now.getDate() - ((dayOfWeek + 6) % 7));
    const weekStart = [
        monday.getFullYear(),
        String(monday.getMonth() + 1).padStart(2, '0'),
        String(monday.getDate()).padStart(2, '0')
    ].join('-');

    const [todayRes, weekRes, cancelRes] = await Promise.all([
        supabase.from('bookings').select('id', { count: 'exact', head: true })
            .eq('booking_date', todayStr).eq('status', 'confirmed'),
        supabase.from('bookings').select('id', { count: 'exact', head: true })
            .gte('booking_date', weekStart).eq('status', 'confirmed'),
        supabase.from('bookings').select('id', { count: 'exact', head: true })
            .eq('booking_date', todayStr).eq('status', 'cancelled')
    ]);

    res.json({
        today:       todayRes.count  || 0,
        week:        weekRes.count   || 0,
        cancelToday: cancelRes.count || 0,
        todayStr
    });
});

// ── GET /admin/api/bookings ───────────────────────────────────────────────────
router.get('/api/bookings', requireAuth, async (req, res) => {
    const { date, status } = req.query;
    const bookings = await getAllBookings({ dateStr: date, status });
    res.json(bookings);
});

// ── GET /admin/api/blocks ─────────────────────────────────────────────────────
router.get('/api/blocks', requireAuth, async (req, res) => {
    const blocks = await getBlocks();
    res.json(blocks);
});

// ── GET /admin/api/next7days ──────────────────────────────────────────────────
router.get('/api/next7days', requireAuth, (req, res) => {
    res.json(getNext7Days());
});

// ── GET /admin/api/slots/:dateStr ─────────────────────────────────────────────
// Returns all master slots for a date (for slot-picker in block UI)
router.get('/api/slots/:dateStr', requireAuth, (req, res) => {
    const slots = buildMasterSlots();
    res.json(slots);
});

// ── POST /admin/api/blocks ────────────────────────────────────────────────────
// Body: { block_date, type: "day"|"period", period?: "morning"|"afternoon"|"evening" }
router.post('/api/blocks', requireAuth, express.json(), async (req, res) => {
    const { block_date, type, period } = req.body || {};

    if (!block_date) return res.status(400).json({ error: 'block_date required' });
    if (!['day', 'period'].includes(type)) return res.status(400).json({ error: 'type must be "day" or "period"' });
    if (type === 'period' && !['morning', 'afternoon', 'evening'].includes(period)) {
        return res.status(400).json({ error: 'period must be morning, afternoon, or evening' });
    }

    // 1. Create the block record
    const block = await createBlock({
        block_date,
        slot_time: null,          // V2.0 uses period-level blocks, not single-slot
        period:    type === 'day' ? null : period
    });

    if (!block) return res.status(500).json({ error: 'Failed to create block' });

    // 2. Cancel affected bookings
    const cancelledBookings = await cancelBookingsByBlock(
        block_date,
        type === 'period' ? period : null
    );

    // 3. Notify each cancelled patient via WhatsApp
    for (const booking of cancelledBookings) {
        const periodLabel = period
            ? ({ morning: 'Morning', afternoon: 'Afternoon', evening: 'Evening' }[period] || '')
            : '';

        const message =
            '⚠️ Appointment Cancelled\n\n' +
            'We\'re sorry, your appointment has been cancelled due to a schedule change.\n\n' +
            `Booking ID : ${booking.booking_id}\n` +
            `Name       : ${booking.name}\n` +
            `Date       : ${formatDateDisplay(booking.booking_date)}\n` +
            `Time       : ${booking.slot_time}\n\n` +
            'Please send *Book* to choose a new time.\n' +
            'We apologise for the inconvenience.';

        try {
            await sendText(booking.phone, message);
            console.log(`Block cancel notification sent to ${booking.name} (${booking.phone})`);
        } catch (err) {
            console.error(`Failed to notify ${booking.phone}:`, err.message);
        }
    }

    res.json({
        success:          true,
        block,
        cancelledCount:   cancelledBookings.length,
        notifiedPatients: cancelledBookings.map(b => ({ id: b.booking_id, name: b.name, phone: b.phone }))
    });
});

// ── DELETE /admin/api/blocks/:id ──────────────────────────────────────────────
router.delete('/api/blocks/:id', requireAuth, async (req, res) => {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) return res.status(400).json({ error: 'Invalid id' });

    const ok = await deleteBlock(id);
    if (!ok) return res.status(500).json({ error: 'Failed to delete block' });

    res.json({ success: true });
});

// ── GET /admin  ───────────────────────────────────────────────────────────────
// Serves the dashboard HTML (login gate is handled client-side)
router.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'admin.html'));
});

module.exports = router;
