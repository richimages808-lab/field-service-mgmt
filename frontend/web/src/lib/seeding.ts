import { db } from '../firebase';
import { collection, addDoc, doc, setDoc, serverTimestamp, Timestamp, getDocs, writeBatch, query, where } from 'firebase/firestore';
import { UserProfile, Job, Invoice } from '../types';
import { addDays, setHours, setMinutes, startOfWeek, addMinutes } from 'date-fns';

const ORG_ID = 'demo-org';

// --- Hawaii Data (Geocoded) ---
interface Location {
    address: string;
    lat: number;
    lng: number;
}

const HAWAII_LOCATIONS: Location[] = [
    { address: '1450 Ala Moana Blvd, Honolulu, HI 96814', lat: 21.2909, lng: -157.8435 }, // Ala Moana Center
    { address: '2233 Kalakaua Ave, Honolulu, HI 96815', lat: 21.2785, lng: -157.8287 }, // Royal Hawaiian Center
    { address: '4211 Waialae Ave, Honolulu, HI 96816', lat: 21.2778, lng: -157.7854 }, // Kahala Mall
    { address: '98-1005 Moanalua Rd, Aiea, HI 96701', lat: 21.3833, lng: -157.9429 }, // Pearlridge Center
    { address: '91-5431 Kapolei Pkwy, Kapolei, HI 96707', lat: 21.3325, lng: -158.0519 }, // Ka Makana Alii
    { address: '66-111 Kamehameha Hwy, Haleiwa, HI 96712', lat: 21.5911, lng: -158.1033 }, // Haleiwa Town
    { address: '4-484 Kuhio Hwy, Kapaa, HI 96746', lat: 22.0716, lng: -159.3167 }, // Coconut Marketplace (Kauai - for variety)
    { address: '3221 Waialae Ave, Honolulu, HI 96816', lat: 21.2891, lng: -157.8014 }, // Kaimuki
    { address: '1000 Kamehameha Hwy, Pearl City, HI 96782', lat: 21.3972, lng: -157.9711 }, // Pearl City
    { address: '700 Keeaumoku St, Honolulu, HI 96814', lat: 21.2952, lng: -157.8419 }, // Walmart Honolulu
];

const PARTS_STORES: Location[] = [
    { address: 'Home Depot - Honolulu (421 Alakawa St)', lat: 21.3196, lng: -157.8735 },
    { address: 'Lowe\'s - Iwilei (411 Pacific St)', lat: 21.3170, lng: -157.8700 },
    { address: 'City Mill - Kaimuki (3086 Waialae Ave)', lat: 21.2850, lng: -157.8050 },
    { address: 'Ferguson Plumbing Supply - Sand Island', lat: 21.3250, lng: -157.8900 }
];

const TECHNICIANS = [
    { name: 'Kimo Akana', email: 'kimo.corp@example.com', type: 'corporate', specialties: ['HVAC', 'Plumbing'], startLoc: HAWAII_LOCATIONS[0] },
    { name: 'Leilani Kai', email: 'leilani.corp@example.com', type: 'corporate', specialties: ['Electrical', 'Security'], startLoc: HAWAII_LOCATIONS[3] },
    { name: 'Keanu Reeves', email: 'keanu.solo@example.com', type: 'solopreneur', specialties: ['General', 'Roofing'], startLoc: HAWAII_LOCATIONS[5] },
    { name: 'Nani Pelekai', email: 'nani.solo@example.com', type: 'solopreneur', specialties: ['Cleaning', 'Landscaping'], startLoc: HAWAII_LOCATIONS[4] },
    { name: 'Stitch Experiment', email: 'stitch.corp@example.com', type: 'corporate', specialties: ['Demolition', 'Heavy Machinery'], startLoc: HAWAII_LOCATIONS[1] },
];

const JOB_TYPES = [
    { title: 'AC Maintenance', type: 'HVAC', duration: 60, difficulty: 'low' },
    { title: 'Leaky Faucet Fix', type: 'Plumbing', duration: 45, difficulty: 'low' },
    { title: 'Main Line Repair', type: 'Plumbing', duration: 240, difficulty: 'high', needsParts: true },
    { title: 'Panel Upgrade', type: 'Electrical', duration: 180, difficulty: 'high', needsParts: true },
    { title: 'Roof Inspection', type: 'Roofing', duration: 90, difficulty: 'medium' },
    { title: 'Solar Panel Cleaning', type: 'Cleaning', duration: 120, difficulty: 'medium' },
    { title: 'Security Camera Install', type: 'Security', duration: 150, difficulty: 'medium', needsParts: true },
    { title: 'Emergency Generator Fix', type: 'Electrical', duration: 300, difficulty: 'high', needsParts: true },
];

const CLIENTS = [
    'Aloha Tower Marketplace', 'Dole Plantation', 'Polynesian Cultural Center', 'Kualoa Ranch', 'Iolani Palace',
    'Bishop Museum', 'Honolulu Zoo', 'Waikiki Aquarium', 'Sea Life Park', 'Wet\'n\'Wild Hawaii'
];

const getRandomElement = (arr: any[]) => arr[Math.floor(Math.random() * arr.length)];

// --- Route Optimization Helpers ---

// Haversine Formula for distance in km
const calculateDistance = (loc1: Location, loc2: Location) => {
    const R = 6371; // Radius of the earth in km
    const dLat = deg2rad(loc2.lat - loc1.lat);
    const dLng = deg2rad(loc2.lng - loc1.lng);
    const a =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(deg2rad(loc1.lat)) * Math.cos(deg2rad(loc2.lat)) *
        Math.sin(dLng / 2) * Math.sin(dLng / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c; // Distance in km
};

const deg2rad = (deg: number) => deg * (Math.PI / 180);

// Estimate Drive Time: 2 min per km + Traffic Factor
const calculateDriveTime = (distanceKm: number, timeOfDay: Date) => {
    const hour = timeOfDay.getHours();
    let trafficMultiplier = 1.0;

    // Rush Hour Logic (Honolulu Traffic is bad!)
    if ((hour >= 7 && hour <= 9) || (hour >= 16 && hour <= 18)) {
        trafficMultiplier = 1.5; // 50% slower
    }

    const baseTimeMinutes = distanceKm * 2; // Assume 30km/h average speed in city
    return Math.ceil(baseTimeMinutes * trafficMultiplier);
};

// Re-export for DataManager
export const generateRandomJob = async (assignedTechId?: string, assignedTechName?: string) => {
    const jobTemplate = getRandomElement(JOB_TYPES);
    const clientName = getRandomElement(CLIENTS);
    const location = getRandomElement(HAWAII_LOCATIONS);

    const jobData: Partial<Job> = {
        org_id: ORG_ID,
        status: 'pending',
        priority: jobTemplate.difficulty === 'high' ? 'high' : 'medium',
        customer: {
            name: clientName,
            address: location.address,
            phone: '808-555-0123',
            email: `contact@${clientName.replace(/\s/g, '').toLowerCase()}.com`
        },
        request: {
            description: jobTemplate.title,
            type: jobTemplate.type,
            photos: [],
            availability: []
        },
        location: { lat: location.lat, lng: location.lng }, // Add coords
        assigned_tech_id: assignedTechId || 'unassigned',
        assigned_tech_name: assignedTechName || 'Unassigned',
        assigned_tech_email: 'unassigned', // Default
        estimated_duration: jobTemplate.duration,
        difficulty: jobTemplate.difficulty,
        createdAt: serverTimestamp()
    };

    return await addDoc(collection(db, 'jobs'), jobData);
};

// Detailed job request templates for pending intake
const PENDING_JOB_REQUESTS = [
    {
        type: 'HVAC',
        description: 'AC not cooling properly. Unit is running but only blowing warm air. We have a heat wave coming and need this fixed ASAP.',
        priority: 'high',
        source: 'phone' as const
    },
    {
        type: 'Plumbing',
        description: 'Kitchen sink is leaking underneath. Water pooling in cabinet. Tried tightening connections but still dripping.',
        priority: 'medium',
        source: 'email' as const
    },
    {
        type: 'Electrical',
        description: 'Breaker keeps tripping in master bedroom. Happens when we plug in the space heater. Could be dangerous.',
        priority: 'critical' as any,
        source: 'web' as const
    },
    {
        type: 'HVAC',
        description: 'Strange burning smell coming from furnace. Unit is making loud rattling noise. Haven\'t used it in months.',
        priority: 'high',
        source: 'sms' as const
    },
    {
        type: 'Plumbing',
        description: 'Toilet running constantly. Water bill is getting expensive. Need someone to look at it when available.',
        priority: 'low' as any,
        source: 'email' as const
    },
    {
        type: 'Electrical',
        description: 'Outlets not working in living room. Power went out during storm yesterday. Other rooms seem fine.',
        priority: 'medium',
        source: 'phone' as const
    },
    {
        type: 'General',
        description: 'Garbage disposal jammed and won\'t turn on. Made grinding noise then stopped. Already tried reset button.',
        priority: 'medium',
        source: 'web' as const
    },
    {
        type: 'HVAC',
        description: 'Thermostat display blank. Changed batteries but still not working. Can\'t control temperature.',
        priority: 'high',
        source: 'manual' as const
    }
];

// Generate pending job request (for intake workflow)
export const generatePendingJobRequest = async () => {
    const request = getRandomElement(PENDING_JOB_REQUESTS);
    const clientName = getRandomElement(CLIENTS);
    const location = getRandomElement(HAWAII_LOCATIONS);

    // Random communication preference
    const commPrefs: Array<'phone' | 'text' | 'email'> = ['phone', 'text', 'email'];
    const communicationPreference = getRandomElement(commPrefs);

    // Generate random availability windows (2-3 windows)
    const days = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday'];
    const times = [
        { start: '08:00', end: '12:00', pref: 'morning' },
        { start: '13:00', end: '17:00', pref: 'afternoon' },
        { start: '09:00', end: '16:00', pref: undefined }
    ];

    const numWindows = Math.floor(Math.random() * 2) + 2; // 2-3 windows
    const availabilityWindows = [];
    for (let i = 0; i < numWindows; i++) {
        const day = getRandomElement(days);
        const timeSlot = getRandomElement(times);
        const window = {
            day: day,
            startTime: timeSlot.start,
            endTime: timeSlot.end,
            ...(timeSlot.pref && { preferredTime: timeSlot.pref })
        };
        availabilityWindows.push(window);
    }

    // Build job data without undefined values (Firestore doesn't allow undefined)
    const jobData: any = {
        org_id: ORG_ID,
        status: 'pending',
        priority: request.priority,
        customer: {
            name: clientName,
            address: location.address,
            phone: '808-555-' + Math.floor(1000 + Math.random() * 9000),
            email: `contact@${clientName.replace(/\s/g, '').toLowerCase()}.com`
        },
        request: {
            description: request.description,
            photos: [],
            videos: [],
            availability: [],
            availabilityWindows
        },
        location: { lat: location.lat, lng: location.lng },
        assigned_tech_id: 'unassigned',
        assigned_tech_name: 'Unassigned',
        assigned_tech_email: 'unassigned',
        createdAt: serverTimestamp()
    };

    // Add optional fields only if they're defined
    if (request.type !== undefined) {
        jobData.request.type = request.type;
    }
    if (request.source !== undefined) {
        jobData.request.source = request.source;
    }
    if (communicationPreference !== undefined) {
        jobData.request.communicationPreference = communicationPreference;
    }

    // Deep clean: remove any undefined values recursively
    const removeUndefined = (obj: any): any => {
        if (Array.isArray(obj)) {
            return obj.map(removeUndefined);
        } else if (obj !== null && typeof obj === 'object') {
            const cleaned: any = {};
            for (const key in obj) {
                if (obj[key] !== undefined) {
                    cleaned[key] = removeUndefined(obj[key]);
                }
            }
            return cleaned;
        }
        return obj;
    };

    const cleanData = removeUndefined(jobData);
    return await addDoc(collection(db, 'jobs'), cleanData);
};

export const generateRandomInvoice = async (jobId?: string) => {
    const clientName = getRandomElement(CLIENTS);
    const amount = Math.floor(Math.random() * 500) + 100;

    const invoiceData: Partial<Invoice> = {
        org_id: ORG_ID,
        job_id: jobId || 'generated-id',
        customer_name: clientName,
        amount: amount,
        status: getRandomElement(['draft', 'sent', 'paid', 'overdue']),
        dueDate: Timestamp.fromDate(new Date(Date.now() + 86400000 * 7)),
        createdAt: serverTimestamp(),
        items: [
            { description: 'Service Call', quantity: 1, unit_price: amount * 0.4, total: amount * 0.4 },
            { description: 'Labor', quantity: 2, unit_price: amount * 0.3, total: amount * 0.6 }
        ]
    };

    return await addDoc(collection(db, 'invoices'), invoiceData);
};

export const clearData = async (orgId: string = ORG_ID) => {
    console.log('Clearing old data for org:', orgId);
    const batch = writeBatch(db);

    // 1. Clear Jobs
    const jobsRef = collection(db, 'jobs');
    const q = query(jobsRef, where('org_id', '==', orgId));
    const snapshot = await getDocs(q);
    snapshot.docs.forEach((doc) => {
        batch.delete(doc.ref);
    });

    // 2. Clear Users (Technicians) - but preserve test accounts
    const usersRef = collection(db, 'users');
    const usersQ = query(usersRef, where('org_id', '==', orgId));
    const usersSnapshot = await getDocs(usersQ);
    const testEmails = ['dispatcher@test.com', 'tech@test.com', 'solo@test.com'];
    usersSnapshot.docs.forEach((doc) => {
        const userData = doc.data();
        // Don't delete test accounts
        if (!testEmails.includes(userData.email)) {
            batch.delete(doc.ref);
        }
    });

    // 3. Clear Invoices
    const invoicesRef = collection(db, 'invoices');
    const invoicesQ = query(invoicesRef, where('org_id', '==', orgId));
    const invoicesSnapshot = await getDocs(invoicesQ);
    invoicesSnapshot.docs.forEach((doc) => {
        batch.delete(doc.ref);
    });

    await batch.commit();
    console.log('Data cleared for org:', orgId);
};

// --- Region-Based Optimization ---
// Simple clustering: Group locations by region to avoid cross-island travel

const getRegion = (address: string) => {
    if (address.includes('Honolulu') || address.includes('Waikiki') || address.includes('Ala Moana')) return 'TOWN';
    if (address.includes('Aiea') || address.includes('Pearl City') || address.includes('Kapolei')) return 'LEEWARD';
    if (address.includes('Haleiwa')) return 'NORTH_SHORE';
    if (address.includes('Kapaa')) return 'KAUAI'; // Special case
    return 'TOWN'; // Default
};

export const seedData = async (targetUserId?: string) => {
    await clearData();
    console.log('Starting Smart Seeding (Region-Based VRP)...');

    // 1. Seed Technicians
    const techMap = new Map<string, any>();

    // Restore Current User as Dispatcher (so they don't lose access)
    if (targetUserId) {
        const currentUserRef = doc(db, 'users', targetUserId);
        await setDoc(currentUserRef, {
            id: targetUserId,
            email: 'admin@example.com', // Placeholder, Auth will use actual email
            name: 'Admin User',
            role: 'dispatcher',
            org_id: ORG_ID,
            techType: 'corporate'
        });
        console.log('Restored current user as Dispatcher');
        // We do NOT add them to techMap, so they don't get assigned jobs
    }

    for (const tech of TECHNICIANS) {
        const techRef = doc(collection(db, 'users'));
        const techData: UserProfile = {
            id: techRef.id,
            email: tech.email,
            name: tech.name,
            role: 'technician',
            techType: tech.type as 'corporate' | 'solopreneur',
            org_id: ORG_ID,
            specialties: tech.specialties
        };
        await setDoc(techRef, techData);
        techMap.set(techRef.id, tech);
        console.log(`Created technician: ${tech.name}`);
    }

    // 2. Smart Schedule Generation
    const startDate = startOfWeek(new Date(), { weekStartsOn: 1 });
    const batch = writeBatch(db);

    for (const [techId, tech] of techMap.entries()) {
        let dailyFatigue = 0;
        let lastLocation = tech.startLoc;

        for (let dayOffset = 0; dayOffset < 5; dayOffset++) {
            const currentDate = addDays(startDate, dayOffset);
            let currentTime = setMinutes(setHours(currentDate, 8), 0);
            const endTime = setMinutes(setHours(currentDate, 17), 0);
            let jobsToday = 0;
            let hasHadLunch = false;

            // --- STRATEGY: Focus Region per Day ---
            // Assign a primary region for the day to minimize travel
            // Rotate regions: Town -> Leeward -> Town -> Windward -> Town
            const dailyRegions = ['TOWN', 'LEEWARD', 'TOWN', 'WINDWARD', 'TOWN'];
            const targetRegion = dailyRegions[dayOffset % dailyRegions.length];

            // Filter locations for this region
            const regionLocations = HAWAII_LOCATIONS.filter(loc => getRegion(loc.address) === targetRegion);
            // Fallback to all if no locations in region (shouldn't happen with good data)
            const availableLocations = regionLocations.length > 0 ? regionLocations : HAWAII_LOCATIONS;

            lastLocation = tech.startLoc; // Reset to home base

            while (currentTime < endTime && jobsToday < 8) {
                // 1. Lunch Logic
                const lunchStart = setMinutes(setHours(currentDate, 12), 0);
                if (!hasHadLunch && currentTime >= setMinutes(setHours(currentDate, 11), 30)) {
                    currentTime = setMinutes(setHours(currentDate, 13), 0);
                    hasHadLunch = true;
                    continue;
                }

                // 2. Pick Job in Target Region
                const suitableJobs = JOB_TYPES.filter(j =>
                    tech.specialties.includes(j.type) || tech.specialties.includes('General')
                );

                // Nearest Neighbor *within* the Target Region
                let bestLocation = getRandomElement(availableLocations);
                let bestDistance = calculateDistance(lastLocation, bestLocation);

                for (let i = 0; i < 5; i++) {
                    const candidateLoc = getRandomElement(availableLocations);
                    const dist = calculateDistance(lastLocation, candidateLoc);
                    if (dist < bestDistance) {
                        bestLocation = candidateLoc;
                        bestDistance = dist;
                    }
                }

                const jobTemplate = getRandomElement(suitableJobs.length > 0 ? suitableJobs : JOB_TYPES);

                // 3. Parts Grouping Logic
                // If this job needs parts, check if we should do a parts run NOW
                // Strategy: If it's the first job of the day or we just finished lunch, do a parts run
                // Otherwise, assume we have parts or pick a job that doesn't need them if possible?
                // For simplicity: If needs parts, do a parts run, but pick the store NEAREST to the JOB, not the tech
                // This simulates "On the way" better.

                if (jobTemplate.needsParts) {
                    let nearestStore = PARTS_STORES[0];
                    let minStoreDist = 9999;

                    // Find store nearest to the JOB SITE (Forward looking)
                    for (const store of PARTS_STORES) {
                        const d = calculateDistance(bestLocation, store); // Distance from Job to Store
                        if (d < minStoreDist) {
                            minStoreDist = d;
                            nearestStore = store;
                        }
                    }

                    // Check if we are already close to the store?
                    // Drive: Tech -> Store -> Job
                    const driveToStore = Math.ceil(calculateDriveTime(calculateDistance(lastLocation, nearestStore), currentTime) * 1.5) + 10;
                    const storeArrivalTime = addMinutes(currentTime, driveToStore);

                    const partsRef = doc(collection(db, 'jobs'));
                    batch.set(partsRef, {
                        org_id: ORG_ID,
                        status: 'scheduled',
                        priority: 'medium',
                        customer: {
                            name: nearestStore.address.split('(')[0].trim(),
                            address: nearestStore.address,
                            phone: 'N/A',
                            email: 'parts@store.com'
                        },
                        request: {
                            description: `Pick up parts for ${jobTemplate.title}`,
                            type: 'parts_run',
                            photos: [],
                            availability: []
                        },
                        location: { lat: nearestStore.lat, lng: nearestStore.lng },
                        assigned_tech_id: techId,
                        assigned_tech_name: tech.name,
                        assigned_tech_email: tech.email,
                        scheduled_at: Timestamp.fromDate(storeArrivalTime),
                        estimated_duration: 30,
                        type: 'parts_run',
                        createdAt: serverTimestamp()
                    });

                    currentTime = addMinutes(storeArrivalTime, 30 + 10);
                    lastLocation = nearestStore;
                    jobsToday++;
                }

                // 4. Create the Job
                const clientName = getRandomElement(CLIENTS);
                const jobRef = doc(collection(db, 'jobs'));

                const finalDriveTime = Math.ceil(calculateDriveTime(calculateDistance(lastLocation, bestLocation), currentTime) * 1.5) + 10;
                const finalArrivalTime = addMinutes(currentTime, finalDriveTime);

                // Check lunch again before committing
                if (!hasHadLunch && addMinutes(finalArrivalTime, jobTemplate.duration) > lunchStart) {
                    currentTime = setMinutes(setHours(currentDate, 13), 0);
                    hasHadLunch = true;
                    continue;
                }

                batch.set(jobRef, {
                    org_id: ORG_ID,
                    status: 'scheduled',
                    priority: jobTemplate.difficulty === 'high' ? 'high' : 'medium',
                    customer: {
                        name: clientName,
                        address: bestLocation.address,
                        phone: '808-555-0123',
                        email: `contact@${clientName.replace(/\s/g, '').toLowerCase()}.com`
                    },
                    request: {
                        description: jobTemplate.title,
                        type: jobTemplate.type,
                        photos: [],
                        availability: []
                    },
                    location: { lat: bestLocation.lat, lng: bestLocation.lng },
                    assigned_tech_id: techId,
                    assigned_tech_name: tech.name,
                    assigned_tech_email: tech.email,
                    scheduled_at: Timestamp.fromDate(finalArrivalTime),
                    estimated_duration: jobTemplate.duration,
                    difficulty: jobTemplate.difficulty,
                    createdAt: serverTimestamp()
                });

                currentTime = addMinutes(finalArrivalTime, jobTemplate.duration);
                lastLocation = bestLocation;
                dailyFatigue += (jobTemplate.duration / 60);
                jobsToday++;
            }
        }
    }

    await batch.commit();
    console.log(`Seeding complete!`);
};
