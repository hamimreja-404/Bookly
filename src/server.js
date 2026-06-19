require('dotenv').config();
const express = require('express');
const { handleIncoming } = require('./handlers/flowHandler');
const { startReminderCron } = require('./handlers/reminderCron');

const app  = express();
app.use(express.json());

const VERIFY_TOKEN = process.env.VERIFY_TOKEN;

// 1. Meta Webhook Verification

app.get('/webhook', (req, res) => {
    const mode      = req.query['hub.mode'];
    const token     = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];

    if (mode === 'subscribe' && token === VERIFY_TOKEN) {
        console.log('Webhook verified by Meta!');
        return res.status(200).send(challenge);
    }
    console.log('Webhook verification failed — token mismatch');
    return res.sendStatus(403);
});

// 2. Receive Messages
app.post('/webhook', async (req, res) => {
    res.sendStatus(200); 

    try {
        const body  = req.body;
        const value = body?.entry?.[0]?.changes?.[0]?.value;

        if (!value || value.statuses) return;

        const messageData = value.messages?.[0];
        if (!messageData) return;

        const from        = messageData.from;         
        const messageType = messageData.type;         

        let messageBody = '';

        if (messageType === 'text') {
            messageBody = messageData.text?.body || '';
        } else if (messageType === 'interactive') {
            messageBody =
                messageData.interactive?.button_reply?.id ||
                messageData.interactive?.list_reply?.id   ||
                '';
        } else {
            const { sendText } = require('./services/whatsapp');
            await sendText(from,
                    'Sorry, I can only read text messages and button / list taps.\n\n' +
                    '- Send *Book* to book an appointment\n' +
                    '- Send *Cancel* to cancel a booking\n' +
                    '- Send *Reschedule* to reschedule a booking'
                );
            return;
        }

        await handleIncoming(from, messageType, messageBody);

    } catch (err) {
        console.error('Webhook handler error:', err.message);
    }
});


// 3. Health check
app.get('/', (req, res) => {
    res.json({ status: 'running', service: 'WhatsApp Booking Bot' });
});
// 4. Start server + reminder cron
const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
    console.log('\n WhatsApp Booking Bot running!');
    console.log(`   Port            : ${PORT}`);
    console.log(`   PHONE_NUMBER_ID : ${process.env.PHONE_NUMBER_ID ? 'Working' : 'MISSING'}`);
    console.log(`   ACCESS_TOKEN    : ${process.env.ACCESS_TOKEN    ? 'Working' : 'MISSING'}`);
    console.log(`   VERIFY_TOKEN    : ${process.env.VERIFY_TOKEN    ? 'Working' : 'MISSING'}`);
    console.log(`   SUPABASE_URL    : ${process.env.SUPABASE_URL    ? 'Working' : 'MISSING'}`);
    console.log(`   SUPABASE_KEY    : ${process.env.SUPABASE_KEY    ? 'Working' : 'MISSING'}`);
    console.log('');

    startReminderCron();
});
