const admin = require('firebase-admin');

// 1. Initialize Firebase Admin
if (!admin.apps.length) {
    try {
        const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
        admin.initializeApp({
            credential: admin.credential.cert(serviceAccount)
        });
    } catch (e) {
        console.error("Firebase Init Error:", e.message);
    }
}

const db = admin.firestore();

/**
 * Helper to normalize time format (Ensures 9:00 AM and 09:00 are treated the same)
 */
function normalizeTime(timeStr) {
    if (!timeStr) return "";
    // If it's 9:00, make it 09:00
    let [hours, minutes] = timeStr.split(':');
    if (hours.length === 1) hours = '0' + hours;
    return `${hours}:${minutes}`;
}

module.exports = async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,POST');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') return res.status(200).end();

    try {
        const { message } = req.body;
        if (!message || message.type !== 'tool-call') {
            return res.status(200).json({ status: "alive" });
        }

        const toolCall = message.toolCalls[0];
        const { name, parameters } = toolCall;
        
        // --- TOOL: Check Availability ---
        if (name === 'check_availability') {
            const { date, time } = parameters;
            const searchTime = normalizeTime(time);
            
            console.log(`Checking: ${date} at ${searchTime}`);

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

        // --- TOOL: Create Booking ---
        if (name === 'create_booking') {
            const { firstName, lastName, phone, serviceName, date, time } = parameters;
            const finalTime = normalizeTime(time);
            const confNum = `SBL-${Math.floor(1000 + Math.random() * 9000)}`;

            await db.collection("bookings").add({
                firstName, lastName, phone, serviceName,
                dateString: date,
                selectedTime: finalTime,
                confirmationNumber: confNum,
                status: 'confirmed',
                source: 'AI Assistant',
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
        console.error("Bridge Error:", error.message);
        return res.status(200).json({
            results: [{
                toolCallId: req.body.message.toolCalls[0].id,
                result: "Error connecting to calendar. Please check manually."
            }]
        });
    }
};
