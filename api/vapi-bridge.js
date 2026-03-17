const admin = require('firebase-admin');

module.exports = async (req, res) => {
    // 1. CORS Headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,POST');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') return res.status(200).end();

    try {
        // 2. Wake-up Check
        if (!req.body || !req.body.message) {
            return res.status(200).json({ status: "alive and ready" });
        }

        // 3. Initialize Firebase inside the handler for safety
        if (!admin.apps.length) {
            const sa = process.env.FIREBASE_SERVICE_ACCOUNT;
            if (!sa) throw new Error("Missing FIREBASE_SERVICE_ACCOUNT variable");
            admin.initializeApp({
                credential: admin.credential.cert(JSON.parse(sa))
            });
        }
        const db = admin.firestore();

        const { message } = req.body;
        if (message.type !== 'tool-call') return res.status(200).json({ ok: true });

        const toolCall = message.toolCalls[0];
        const { name, parameters } = toolCall;

        // --- CHECK AVAILABILITY ---
        if (name === 'check_availability') {
            const { date, time } = parameters;
            let searchTime = time;
            // Normalize time: ensure HH:mm format (e.g., 9:00 -> 09:00)
            if (time && time.includes(':')) {
                let [h, m] = time.split(':');
                if (h.length === 1) h = '0' + h;
                searchTime = `${h}:${m}`;
            }

            const snapshot = await db.collection("bookings")
                .where("dateString", "==", date)
                .where("selectedTime", "==", searchTime)
                .get();

            return res.status(200).json({
                results: [{
                    toolCallId: toolCall.id,
                    result: snapshot.empty ? "Available" : "Taken"
                }]
            });
        }

        // --- CREATE BOOKING ---
        if (name === 'create_booking') {
            const { firstName, lastName, phone, serviceName, date, time } = parameters;
            const confNum = `SBL-${Math.floor(1000 + Math.random() * 9000)}`;

            await db.collection("bookings").add({
                firstName, lastName, phone, serviceName,
                dateString: date,
                selectedTime: time,
                confirmationNumber: confNum,
                status: 'confirmed',
                source: 'AI Assistant',
                createdAt: admin.firestore.FieldValue.serverTimestamp()
            });

            return res.status(200).json({
                results: [{
                    toolCallId: toolCall.id,
                    result: `Confirmed! ID: ${confNum}`
                }]
            });
        }

    } catch (error) {
        console.error("Bridge Error:", error.message);
        return res.status(500).json({
            error: "Bridge Failed",
            details: error.message
        });
    }
};
