import * as admin from "firebase-admin";

export async function handleCalendarAvailabilityCheck(toolCallList: any[], orgId: string) {
    const results = [];
    const db = admin.firestore();

    for (const toolCallItem of toolCallList) {
        const callData = toolCallItem.toolCall;
        if (callData.function?.name === "checkCalendarAvailability") {
            try {
                const args = JSON.parse(callData.function.arguments);
                const requestedDate = args.date; // YYYY-MM-DD
                const timeContext = args.timeContext; // e.g., 'morning', 'afternoon'
                
                // 1. Get technicians for this organization
                const techsSnap = await db.collection("technicians")
                    .where("orgId", "==", orgId)
                    .where("status", "==", "active")
                    .get();

                if (techsSnap.empty) {
                    results.push({
                        toolCallId: callData.id,
                        result: "Sorry, I am not able to find any active technicians for this organization."
                    });
                    continue;
                }
                const totalTechs = techsSnap.size;

                // 2. Query jobs scheduled for this date for this organization
                // Note: We'll do a simple string prefix match on the date if it's stored as ISO string, 
                // or if scheduled_at is a timestamp, we define the start/end of day.
                const startOfDay = new Date(`${requestedDate}T00:00:00`);
                const endOfDay = new Date(`${requestedDate}T23:59:59`);
                
                const startTimestamp = admin.firestore.Timestamp.fromDate(startOfDay);
                const endTimestamp = admin.firestore.Timestamp.fromDate(endOfDay);

                const jobsSnap = await db.collection("jobs")
                    .where("org_id", "==", orgId)
                    .where("status", "==", "scheduled")
                    .where("scheduled_at", ">=", startTimestamp)
                    .where("scheduled_at", "<=", endTimestamp)
                    .get();

                let morningJobs = 0;
                let afternoonJobs = 0;

                jobsSnap.forEach(doc => {
                    const data = doc.data();
                    const jobDate = data.scheduled_at.toDate();
                    const hour = jobDate.getHours();
                    if (hour < 12) {
                        morningJobs++;
                    } else {
                        afternoonJobs++;
                    }
                });

                // 3. Simple Availability Logic
                // We assume each tech can do roughly 2 morning jobs and 2 afternoon jobs max.
                // You can adjust this capacity logic based on actual business needs.
                const maxMorningCapacity = totalTechs * 2;
                const maxAfternoonCapacity = totalTechs * 2;

                let explanation = "";

                const timeLower = timeContext.toLowerCase();
                if (timeLower.includes("morning") || timeLower.includes("am")) {
                    if (morningJobs < maxMorningCapacity) {
                        explanation = "There is availability in the morning.";
                    } else {
                        explanation = "The morning is fully booked.";
                    }
                } else if (timeLower.includes("afternoon") || timeLower.includes("pm") || timeLower.includes("evening")) {
                    if (afternoonJobs < maxAfternoonCapacity) {
                        explanation = "There is availability in the afternoon.";
                    } else {
                        explanation = "The afternoon is fully booked.";
                    }
                } else {
                    // General day check
                    if (morningJobs < maxMorningCapacity && afternoonJobs < maxAfternoonCapacity) {
                        explanation = "There is wide open availability all day.";
                    } else if (morningJobs < maxMorningCapacity) {
                        explanation = "There is only availability in the morning.";
                    } else if (afternoonJobs < maxAfternoonCapacity) {
                        explanation = "There is only availability in the afternoon.";
                    } else {
                        explanation = "That entire day is fully booked.";
                    }
                }

                results.push({
                    toolCallId: callData.id,
                    result: explanation
                });

            } catch (err) {
                console.error("[Vapi Tool] Error parsing or processing checkCalendarAvailability:", err);
                results.push({
                    toolCallId: callData.id,
                    result: "I ran into an error while checking the calendar."
                });
            }
        }
    }

    return results;
}
