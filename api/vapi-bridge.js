const admin = require('firebase-admin');

// 1. Initialize Firebase if needed
if (!admin.apps.length && process.env.FIREBASE_SERVICE_ACCOUNT) {
    try {
        admin.initializeApp({
            credential: admin.credential.cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT))
        });
    } catch (e) { console.error("Firebase Init Error:", e.message); }
}

module.exports = async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,POST');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') return res.status(200).end();

    console.log("--- REQUEST RECEIVED ---");
    const body = req.body || {};

    try {
        // 2. CHECK: Is this a tool call from Riley?
        if (!body.message || body.message.type !== 'tool-call') {
            return res.status(200).json({ status: "Online", info: "Use Vapi to call this bridge." });
        }

        const toolCall = body.message.toolCalls[0];
        const toolCallId = toolCall.id;
        
        // 3. SMART PARSER: Find name and arguments
        const name = toolCall.function ? toolCall.function.name : toolCall.name;
        let args = toolCall.function ? toolCall.function.arguments : toolCall.parameters;
        
        // If arguments are a string (Riley often sends them this way), turn them into an object
        if (typeof args === 'string') {
            args = JSON.parse(args);
        }

        console.log(`Tool identified: ${name}`, args);
        const db = admin.firestore();

        // --- CHECK AVAILABILITY ---
        if (name === 'check_availability') {
            const { date, time } = args;
            let searchTime = time;
            
            // Normalize time (e.g. 9:00 -> 09:00)
            if (time && time.includes(':')) {
                let [h, m] = time.split(':');
                if (h.length === 1) h = '0' + h;
                searchTime = `${h}:${m}`;
            }

            console.log(`Searching Firestore for ${date} at ${searchTime}`);
            const snapshot = await db.collection("bookings")
                .where("dateString", "==", date)
                .where("selectedTime", "==", searchTime)
                .get();

            const isTaken = !snapshot.empty;
            console.log(isTaken ? "STATUS: TAKEN" : "STATUS: AVAILABLE");

            return res.status(200).json({
                results: [{
                    toolCallId: toolCallId,
                    result: isTaken ? "Taken" : "Available"
                }]
            });
        }

        // --- CREATE BOOKING ---
        if (name === 'create_booking') {
            const { firstName, lastName, phone, serviceName, date, time } = args;
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
                    toolCallId: toolCallId,
                    result: `Confirmed! Booking ID: ${confNum}`
                }]
            });
        }

    } catch (error) {
        console.error("Bridge Error:", error.message);
        return res.status(200).json({
            results: [{
                toolCallId: (req.body.message && req.body.message.toolCalls) ? req.body.message.toolCalls[0].id : "error",
                result: "Available" // Fail-safe to keep call going
            }]
        });
    }
};
