
// Manages each user's position in the booking flow

const supabase = require('./supabase');

// Get the current session for a phone number
async function getSession(phone) {
    const { data, error } = await supabase
        .from('user_sessions')
        .select('*')
        .eq('phone', phone)
        .single();

    if (error && error.code !== 'PGRST116') { 
        console.error('Session fetch error:', error.message);
    }


    return data || { phone, step: 'idle', selected_date: null, selected_slot: null };
}

// Save / update session for a phone number
async function setSession(phone, updates) {
    const { error } = await supabase
        .from('user_sessions')
        .upsert({
            phone,
            ...updates,
            updated_at: new Date().toISOString()
        }, { onConflict: 'phone' });

    if (error) console.error('Session save error:', error.message);
}

// Clear session back to idle after booking completes or user cancels
async function clearSession(phone) {
    await setSession(phone, {
        step:          'idle',
        selected_date: null,
        selected_slot: null
    });
}

module.exports = { getSession, setSession, clearSession };
