const admin = require('firebase-admin');

// Initialize outside the handler to keep it warm (Speed Hack)
if (!admin.apps.length && process.env.FIREBASE_SERVICE_ACCOUNT) {
    try {
        admin.initializeApp({
            credential: admin.credential.cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT))
        });
    } catch (e) {
        console.error("Initialization Error:", e.message);
    }
}

module.exports = async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,POST');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') return res.status(200).end();

    let toolCallId = "unknown";
    
    try {
        // Universal parser: Handles both Vapi "messages" and direct tool calls
        const body = req.body;
        const toolCall = (body.message && body.message.toolCalls) ? body.message.toolCalls[0] : 
                        (body.toolCalls ? body.toolCalls[0] : null);

        if (!toolCall) {
            return res.status(200).json({ status: "alive and ready" });
        }

        toolCallId = toolCall.id;
        const { name, parameters } = toolCall;
        const db = admin.firestore();

        if (name === 'check_availability') {
            const { date, time } = parameters;
            let searchTime = time;
            
            // Auto-format time (e.g. 9:00 -> 09:00)
            if (time && time.includes(':')) {
                let [h, m] = time.split(':');
                if (h.length === 1) h = '0' + h;
                searchTime = `${h}:${m}`;
            }

            console.log(`Checking: ${date} at ${searchTime}`);
            const snapshot = await db.collection("bookings")
                .where("dateString", "==", date)
                .where("selectedTime", "==", searchTime)
                .get();

            return res.status(200).json({
                results: [{
                    toolCallId: toolCallId,
                    result: snapshot.empty ? "Available" : "Taken"
                }]
            });
        }

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
                    toolCallId: toolCallId,
                    result: `Confirmed! ID: ${confNum}`
                }]
            });
        }

    } catch (error) {
        console.error("Bridge Logic Error:", error.message);
        // CRITICAL: Always return a result, never a 500, to prevent hang-ups
        return res.status(200).json({
            results: [{
                toolCallId: toolCallId,
                result: "I'm having a slight issue accessing the live calendar, but let me check my notes..."
            }]
        });
    }
};
