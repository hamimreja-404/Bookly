// All functions for sending messages back to WhatsApp

require('dotenv').config();
const axios = require('axios');

const BASE_URL = `https://graph.facebook.com/v20.0/${process.env.PHONE_NUMBER_ID}/messages`;
const HEADERS  = {
    'Authorization': `Bearer ${process.env.ACCESS_TOKEN}`,
    'Content-Type':  'application/json'
};

// ── Generic sender (internal) ─────────────────────────────────────────────────
async function send(payload) {
    try {
        const res = await axios.post(BASE_URL, payload, { headers: HEADERS });
        console.log(`Sent to ${payload.to}`);
        return res.data;
    } catch (err) {
        const errData = err.response?.data?.error;
        console.error(`WhatsApp send error: [${errData?.code}] ${errData?.message}`);
        if (errData?.code === 190)    console.error('Token expired — refresh it in Meta console');
        if (errData?.code === 131030) console.error('Number not whitelisted in Meta console');
    }
}

// ── 1. Plain text message ─────────────────────────────────────────────────────
async function sendText(to, text) {
    return send({
        messaging_product: 'whatsapp',
        to,
        type: 'text',
        text: { body: text }
    });
}

// ── 2. Button message (max 3 buttons) ─────────────────────────────────────────
// buttons = [{ id: 'btn_id', title: 'Button Label' }, ...]
async function sendButtons(to, bodyText, buttons) {
    return send({
        messaging_product: 'whatsapp',
        to,
        type: 'interactive',
        interactive: {
            type: 'button',
            body: { text: bodyText },
            action: {
                buttons: buttons.map(b => ({
                    type:  'reply',
                    reply: { id: b.id, title: b.title }
                }))
            }
        }
    });
}

// ── 3. List message (max 10 items — used for time slots) ──────────────────────
// items = [{ id: 'slot_10:00 AM', title: '10:00 AM' }, ...]
async function sendList(to, bodyText, buttonLabel, sectionTitle, items) {
    return send({
        messaging_product: 'whatsapp',
        to,
        type: 'interactive',
        interactive: {
            type: 'list',
            body: { text: bodyText },
            action: {
                button: buttonLabel,
                sections: [{
                    title: sectionTitle,
                    rows:  items.map(item => ({
                        id:    item.id,
                        title: item.title
                    }))
                }]
            }
        }
    });
}

module.exports = { sendText, sendButtons, sendList };
