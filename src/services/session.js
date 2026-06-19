// Manages each user's position in the booking flow

const supabase = require('./supabase');

const SESSION_TIMEOUT_MINUTES = 5;

// Get the current session for a phone number.
// Automatically resets to idle if the session has timed out.
async function getSession(phone) {
    const { data, error } = await supabase
        .from('user_sessions')
        .select('*')
        .eq('phone', phone)
        .single();

    if (error && error.code !== 'PGRST116') {
        console.error('Session fetch error:', error.message);
    }

    if (!data) {
        return { phone, step: 'idle', selected_date: null, selected_slot: null };
    }

    // Lazy timeout check — if the user was mid-flow and went silent for 5 min
    if (data.session_timeout_at && data.step !== 'idle') {
        const timeoutAt = new Date(data.session_timeout_at);
        if (new Date() > timeoutAt) {
            console.log(`Session timed out for ${phone} (was on step: ${data.step})`);
            await clearSession(phone);
            // Return the idle session but flag it so the handler can notify the user
            return { phone, step: 'idle', selected_date: null, selected_slot: null, _timedOut: true };
        }
    }

    return data;
}

// Save / update session for a phone number.
// Always refreshes the 5-minute timeout window.
async function setSession(phone, updates) {
    const timeoutAt = new Date(Date.now() + SESSION_TIMEOUT_MINUTES * 60 * 1000).toISOString();

    const { error } = await supabase
        .from('user_sessions')
        .upsert({
            phone,
            ...updates,
            updated_at:         new Date().toISOString(),
            session_timeout_at: timeoutAt
        }, { onConflict: 'phone' });

    if (error) console.error('Session save error:', error.message);
}

// Hard-reset the session back to idle and clear all flow data.
async function clearSession(phone) {
    const { error } = await supabase
        .from('user_sessions')
        .upsert({
            phone,
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
        }, { onConflict: 'phone' });

    if (error) console.error('Session clear error:', error.message);
}

module.exports = { getSession, setSession, clearSession };
