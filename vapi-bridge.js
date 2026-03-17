const admin = require('firebase-admin');

// 1. Initialize Firebase Admin
// You will need to set the environment variable FIREBASE_SERVICE_ACCOUNT in your hosting provider (Vercel/Netlify)
if (!admin.apps.length) {
    const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
    admin.initializeApp({
        credential: admin.credential.cert(serviceAccount)
    });
}

const db = admin.firestore();

/**
 * VAPI BRIDGE: Handling AI Scheduling Requests
 */
module.exports = async (req, res) => {
    // Enable CORS
    res.setHeader('Access-Control-Allow-Credentials', true);
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
    res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version');

    if (req.method === 'OPTIONS') {
        res.status(200).end();
        return;
    }

    try {
        const { message } = req.body;
        
        // Vapi sends a "toolCall" message when the AI wants to use a tool
        if (message.type === 'tool-call') {
            const toolCall = message.toolCalls[0];
            const { name, parameters } = toolCall;

            console.log(`[Vapi] AI requesting tool: ${name}`, parameters);

            // --- TOOL 1: Check Availability ---
            if (name === 'check_availability') {
                const { date, time } = parameters; // date format: YYYY-MM-DD, time format: HH:mm
                
                const snapshot = await db.collection("bookings")
                    .where("dateString", "==", date)
                    .where("selectedTime", "==", time)
                    .get();

                const isAvailable = snapshot.empty;
                
                return res.status(200).json({
                    results: [
                        {
                            toolCallId: toolCall.id,
                            result: isAvailable ? "Available" : "Taken"
                        }
                    ]
                });
            }

            // --- TOOL 2: Create Booking ---
            if (name === 'create_booking') {
                const { firstName, lastName, phone, serviceName, date, time } = parameters;
                
                const confNum = `SBL-AI-${Date.now().toString().slice(-4)}`;
                
                await db.collection("bookings").add({
                    firstName,
                    lastName,
                    phone,
                    serviceName,
                    selectedDate: new Date(date),
                    dateString: date,
                    selectedTime: time,
                    confirmationNumber: confNum,
                    status: 'confirmed',
                    source: 'AI Receptionist',
                    createdAt: admin.firestore.FieldValue.serverTimestamp()
                });

                return res.status(200).json({
                    results: [
                        {
                            toolCallId: toolCall.id,
                            result: `Success. Confirmation Number: ${confNum}`
                        }
                    ]
                });
            }
        }

        res.status(400).json({ error: "Invalid request type" });

    } catch (error) {
        console.error("Bridge Error:", error);
        res.status(500).json({ error: error.message });
    }
};
