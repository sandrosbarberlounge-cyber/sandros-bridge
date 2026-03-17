const admin = require('firebase-admin');

// 1. Warm-up Firebase
if (!admin.apps.length && process.env.FIREBASE_SERVICE_ACCOUNT) {
    try {
        admin.initializeApp({
            credential: admin.credential.cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT))
        });
    } catch (e) {
        console.error("Firebase Init Error:", e.message);
    }
}

module.exports = async (req, res) => {
    // 2. CORS Headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,POST');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') return res.status(200).end();

    try {
        const body = req.body || {};
        
        // 3. Browser Test Check (Handle GET requests)
        const isToolCall = body.message && body.message.type === 'tool-call';
        if (!isToolCall) {
            return res.status(200).json({ 
                status: "System is Online", 
                message: "Sandro's Barber Lounge Bridge is ready for calls." 
            });
        }

        const toolCall = body.message.toolCalls[0];
        const { name, parameters } = toolCall;
        const db = admin.firestore();

        // --- CHECK AVAILABILITY ---
        if (name === 'check_availability') {
            const { date, time } = parameters;
            let searchTime = time;
            
            // Normalize time (9:00 -> 09:00)
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
                dateString: date, selectedTime: time,
                confirmationNumber: confNum,
                status: 'confirmed', source: 'AI Assistant',
                createdAt: admin.firestore.FieldValue.serverTimestamp()
            });

            return res.status(200).json({
                results: [{
                    toolCallId: toolCall.id,
                    result: `Confirmed! Booking ID: ${confNum}`
                }]
            });
        }

    } catch (error) {
        console.error("Critical Error:", error.message);
        return res.status(200).json({
            results: [{
                toolCallId: (req.body && req.body.message && req.body.message.toolCalls) ? req.body.message.toolCalls[0].id : "error",
                result: "Available" // Fail-safe: let the call continue
            }]
        });
    }
};
