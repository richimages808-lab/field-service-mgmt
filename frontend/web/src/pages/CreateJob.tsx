import React, { useState, useEffect } from 'react';
import DatePicker from 'react-datepicker';
import "react-datepicker/dist/react-datepicker.css";
import { db } from '../firebase';
import { collection, addDoc, serverTimestamp, query, where, getDocs } from 'firebase/firestore';
import { uploadFile } from '../lib/storage';
import { sendEmail } from '../lib/notifications';
import { useAuth } from '../auth/AuthProvider';
import { useNavigate } from 'react-router-dom';
import { Job, JobCategory, JOB_CATEGORIES } from '../types';
import { isSameDay, addMinutes, format, addDays, addWeeks, addMonths } from 'date-fns';
import { Wrench, Settings, Package, Search, Users, AlertTriangle, Shield, HelpCircle } from 'lucide-react';

export const CreateJob: React.FC = () => {
    const { user } = useAuth();
    const navigate = useNavigate();
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    // Form State
    const [customerName, setCustomerName] = useState('');
    const [address, setAddress] = useState('');
    const [phone, setPhone] = useState('');
    const [email, setEmail] = useState('');
    const [siteName, setSiteName] = useState('');
    const [description, setDescription] = useState('');
    const [availability, setAvailability] = useState<Date[]>([]);
    const [photos, setPhotos] = useState<File[]>([]);
    const [communicationPreference, setCommunicationPreference] = useState<'phone' | 'text' | 'email'>('email');
    const [priority, setPriority] = useState<'low' | 'medium' | 'high' | 'critical'>('medium');
    const [estimatedDuration, setEstimatedDuration] = useState(60); // minutes
    const [jobCategory, setJobCategory] = useState<JobCategory>('repair');
    const [isRecurring, setIsRecurring] = useState(false);
    const [recurringFrequency, setRecurringFrequency] = useState<'weekly' | 'biweekly' | 'monthly' | 'quarterly'>('monthly');

    // New Availability State
    const [tempDate, setTempDate] = useState<Date | null>(null);
    const [tempTime, setTempTime] = useState('09:00');
    const [scheduledJobs, setScheduledJobs] = useState<Job[]>([]);
    const [loadingSchedule, setLoadingSchedule] = useState(false);

    // Fetch scheduled jobs for the selected date to check availability
    useEffect(() => {
        const fetchScheduledJobs = async () => {
            if (!tempDate || !user) return;

            setLoadingSchedule(true);
            try {
                const orgId = (user as any)?.org_id || 'demo-org';
                const jobsQuery = query(
                    collection(db, 'jobs'),
                    where('org_id', '==', orgId),
                    where('assigned_tech_id', '==', user.uid)
                );

                const snapshot = await getDocs(jobsQuery);
                const jobs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Job));

                // Filter to jobs scheduled on the selected date
                const jobsOnDate = jobs.filter(job => {
                    if (!job.scheduled_at) return false;
                    return isSameDay((job.scheduled_at?.toDate?.() || new Date(job.scheduled_at)), tempDate);
                });

                setScheduledJobs(jobsOnDate);
            } catch (error) {
                console.error('Error fetching scheduled jobs:', error);
            } finally {
                setLoadingSchedule(false);
            }
        };

        fetchScheduledJobs();
    }, [tempDate, user]);

    // Check if a time slot is available (not conflicting with existing jobs)
    const isTimeSlotAvailable = (timeSlot: string): boolean => {
        if (!tempDate || scheduledJobs.length === 0) return true;

        const [hours, minutes] = timeSlot.split(':').map(Number);
        const slotTime = new Date(tempDate);
        slotTime.setHours(hours, minutes, 0, 0);

        // Check if this time conflicts with any scheduled job
        return !scheduledJobs.some(job => {
            if (!job.scheduled_at) return false;

            const jobStart = (job.scheduled_at?.toDate?.() || new Date(job.scheduled_at));
            const jobDuration = job.estimated_duration || 60; // Default 60 minutes
            const jobEnd = addMinutes(jobStart, jobDuration);

            // Check if the slot time falls within this job's time range
            // We'll consider 15 minutes before and after as buffer
            const slotEnd = addMinutes(slotTime, 15);

            return (slotTime >= jobStart && slotTime < jobEnd) ||
                (slotEnd > jobStart && slotEnd <= jobEnd) ||
                (slotTime <= jobStart && slotEnd >= jobEnd);
        });
    };

    // Generate 15-minute time slots
    const timeSlots = [];
    for (let i = 8; i <= 18; i++) {
        for (let j = 0; j < 60; j += 15) {
            const hour = i.toString().padStart(2, '0');
            const minute = j.toString().padStart(2, '0');
            timeSlots.push(`${hour}:${minute}`);
        }
    }

    const handleAddAvailability = () => {
        if (tempDate && tempTime) {
            const [hours, minutes] = tempTime.split(':').map(Number);
            const newDate = new Date(tempDate);
            newDate.setHours(hours, minutes, 0, 0);
            setAvailability(prev => [...prev, newDate]);
            setTempDate(null); // Reset date picker
            // Keep time as is for convenience
        }
    };

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files) {
            setPhotos(Array.from(e.target.files));
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setError('');

        console.log("Starting job submission...");
        try {
            if (!user) {
                console.error("User not authenticated");
                throw new Error("Not authenticated");
            }
            console.log("User authenticated:", user.uid);

            // 1. Get Org ID from user object (set by AuthProvider)
            const orgId = (user as any).org_id;

            if (!orgId) {
                // Fallback for dev/mock if org_id isn't set
                console.warn("No org_id found on user. Using 'demo-org'");
            }
            const finalOrgId = orgId || 'demo-org';
            console.log("Using org_id:", finalOrgId);

            // 2. Create Job Document Draft
            const jobsRef = collection(db, 'jobs');
            // Use a temporary ID for storage path
            const tempJobId = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

            // 3. Upload Photos
            console.log(`Uploading ${photos.length} photos...`);
            const photoUrls: string[] = [];
            for (const photo of photos) {
                try {
                    console.log(`Uploading ${photo.name}...`);
                    const path = `jobs/${finalOrgId}/${tempJobId}/${photo.name}`;
                    const url = await uploadFile(photo, path);
                    console.log(`Uploaded ${photo.name} to ${url}`);
                    photoUrls.push(url);
                } catch (photoErr) {
                    console.error(`Failed to upload ${photo.name}:`, photoErr);
                    // Continue or throw? Let's throw to be safe for now
                    throw new Error(`Photo upload failed: ${photo.name}`);
                }
            }
            console.log("All photos uploaded.");

            // 4. Save Job Document
            console.log("Saving job document...");
            const jobData: any = {
                org_id: finalOrgId,
                status: 'pending',
                quote_status: 'draft',
                priority,
                estimated_duration: estimatedDuration,
                category: jobCategory,
                site_name: siteName,
                customer: {
                    name: customerName,
                    address,
                    phone,
                    email
                },
                request: {
                    description,
                    photos: photoUrls,
                    availability: availability.map(d => d.toISOString()), // Keep for backwards compat
                    availabilityWindows: availability.map(d => ({
                        day: format(d, 'yyyy-MM-dd'),
                        startTime: format(d, 'HH:mm'),
                        endTime: format(addMinutes(d, 60), 'HH:mm'),
                        preferredTime: d.getHours() < 12 ? 'morning' : 'afternoon'
                    })),
                    communicationPreference
                },
                createdAt: serverTimestamp(),
                createdBy: user.uid
            };

            // If recurring, create recurring schedule
            if (isRecurring) {
                // Calculate initial nextRunAt
                const now = new Date();
                let nextRunAt = new Date();
                switch (recurringFrequency) {
                    case 'weekly':
                        nextRunAt = addWeeks(now, 1);
                        break;
                    case 'biweekly':
                        nextRunAt = addWeeks(now, 2);
                        break;
                    case 'monthly':
                        nextRunAt = addMonths(now, 1);
                        break;
                    case 'quarterly':
                        nextRunAt = addMonths(now, 3);
                        break;
                }

                const recurringData = {
                    org_id: finalOrgId,
                    frequency: recurringFrequency,
                    jobTemplate: {
                        priority,
                        estimated_duration: estimatedDuration,
                        category: jobCategory,
                        site_name: siteName,
                        customer: { name: customerName, address, phone, email },
                        request: { description, communicationPreference }
                    },
                    startDate: serverTimestamp(),
                    nextRunAt: nextRunAt,
                    isActive: true,
                    createdAt: serverTimestamp(),
                    createdBy: user.uid
                };
                const recurringRef = await addDoc(collection(db, 'recurring_schedules'), recurringData);
                jobData.recurring_schedule_id = recurringRef.id;
            }

            console.log("Job data:", jobData);
            await addDoc(jobsRef, jobData);
            console.log("Job document saved.");

            // 5. Send Confirmation Email to Customer
            if (email) {
                console.log("Sending confirmation email...");
                try {
                    await sendEmail(
                        email,
                        "Job Request Received",
                        `Hi ${customerName},\n\nWe have received your request: "${description}".\nWe will be in touch shortly to schedule a visit.\n\nThanks,\nField Service Team`
                    );
                    console.log("Email sent.");
                } catch (emailErr) {
                    console.error("Failed to send email:", emailErr);
                    // Don't block job creation on email failure
                }
            }

            navigate('/');
        } catch (err) {
            console.error(err);
            console.error("Job creation error:", err);
            setError('Failed to create job. Check console for details: ' + (err as Error).message);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="p-8 max-w-2xl mx-auto">
            <h1 className="text-3xl font-bold mb-6">New Job Request</h1>
            {error && <p className="text-red-500 mb-4">{error}</p>}

            <form onSubmit={handleSubmit} className="space-y-4">

                <div className="bg-white p-6 rounded shadow">
                    <h2 className="text-xl font-semibold mb-4">Customer Details</h2>
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm font-medium text-gray-700">Name</label>
                            <input type="text" required className="mt-1 block w-full border rounded p-2" value={customerName} onChange={e => setCustomerName(e.target.value)} />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700">Phone</label>
                            <input type="tel" required className="mt-1 block w-full border rounded p-2" value={phone} onChange={e => setPhone(e.target.value)} />
                        </div>
                        <div className="col-span-2">
                            <label className="block text-sm font-medium text-gray-700">Email</label>
                            <input type="email" className="mt-1 block w-full border rounded p-2" value={email} onChange={e => setEmail(e.target.value)} />
                        </div>
                        <div className="col-span-2">
                            <label className="block text-sm font-medium text-gray-700">Preferred Contact Method</label>
                            <select
                                className="mt-1 block w-full border rounded p-2 bg-white"
                                value={communicationPreference}
                                onChange={e => setCommunicationPreference(e.target.value as 'phone' | 'text' | 'email')}
                            >
                                <option value="email">Email</option>
                                <option value="text">Text Message (SMS)</option>
                                <option value="phone">Phone Call</option>
                            </select>
                            <p className="mt-1 text-xs text-gray-500">
                                How should we contact the customer about this job?
                            </p>
                        </div>
                        <div className="col-span-2">
                            <label className="block text-sm font-medium text-gray-700">Address</label>
                            <input type="text" required className="mt-1 block w-full border rounded p-2" value={address} onChange={e => setAddress(e.target.value)} />
                        </div>
                        <div className="col-span-2">
                            <label className="block text-sm font-medium text-gray-700">Site Name (Optional)</label>
                            <input type="text" className="mt-1 block w-full border rounded p-2" placeholder="e.g. Main Office" value={siteName} onChange={e => setSiteName(e.target.value)} />
                        </div>
                    </div>
                </div>

                <div className="bg-white p-6 rounded shadow">
                    <h2 className="text-xl font-semibold mb-4">Job Details</h2>
                    <div className="space-y-4">
                        {/* Job Category Selection */}
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-2">Job Type</label>
                            <div className="grid grid-cols-4 gap-2">
                                {JOB_CATEGORIES.map(cat => {
                                    const isSelected = jobCategory === cat.value;
                                    const IconComponent = cat.value === 'repair' ? Wrench :
                                        cat.value === 'maintenance' ? Settings :
                                            cat.value === 'installation' ? Package :
                                                cat.value === 'inspection' ? Search :
                                                    cat.value === 'consultation' ? Users :
                                                        cat.value === 'emergency' ? AlertTriangle :
                                                            cat.value === 'warranty' ? Shield : HelpCircle;
                                    return (
                                        <button
                                            key={cat.value}
                                            type="button"
                                            onClick={() => setJobCategory(cat.value)}
                                            className={`p-3 rounded-lg border-2 flex flex-col items-center gap-1 transition-all ${isSelected
                                                ? 'border-blue-500 bg-blue-50 text-blue-700'
                                                : 'border-gray-200 hover:border-gray-300 text-gray-600'
                                                }`}
                                        >
                                            <IconComponent className="w-5 h-5" />
                                            <span className="text-xs font-medium">{cat.label}</span>
                                        </button>
                                    );
                                })}
                            </div>
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-gray-700">Description</label>
                            <textarea required className="mt-1 block w-full border rounded p-2 h-32" value={description} onChange={e => setDescription(e.target.value)} />
                        </div>

                        {/* Priority and Duration Row */}
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700">Priority</label>
                                <select
                                    value={priority}
                                    onChange={(e) => setPriority(e.target.value as 'low' | 'medium' | 'high' | 'critical')}
                                    className="mt-1 block w-full border rounded p-2 bg-white"
                                >
                                    <option value="low">Low - Can wait</option>
                                    <option value="medium">Medium - Standard</option>
                                    <option value="high">High - Urgent</option>
                                    <option value="critical">Critical - Emergency</option>
                                </select>
                                <p className="mt-1 text-xs text-gray-500">How urgent is this job?</p>
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700">Estimated Duration</label>
                                <select
                                    value={estimatedDuration}
                                    onChange={(e) => setEstimatedDuration(parseInt(e.target.value))}
                                    className="mt-1 block w-full border rounded p-2 bg-white"
                                >
                                    <option value="15">15 minutes</option>
                                    <option value="30">30 minutes</option>
                                    <option value="45">45 minutes</option>
                                    <option value="60">1 hour</option>
                                    <option value="90">1.5 hours</option>
                                    <option value="120">2 hours</option>
                                    <option value="180">3 hours</option>
                                    <option value="240">4 hours</option>
                                    <option value="300">5 hours</option>
                                    <option value="360">6 hours</option>
                                    <option value="480">Full day (8 hours)</option>
                                </select>
                                <p className="mt-1 text-xs text-gray-500">Approximate time needed</p>
                            </div>
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-2">Availability (Select 3-5 windows)</label>
                            {tempDate && scheduledJobs.length > 0 && (
                                <div className="mb-2 p-2 bg-yellow-50 border border-yellow-200 rounded text-sm text-yellow-800">
                                    <strong>Note:</strong> {scheduledJobs.length} job(s) already scheduled for this date.
                                    Unavailable times are marked below.
                                </div>
                            )}
                            {tempDate && loadingSchedule && (
                                <div className="mb-2 p-2 bg-blue-50 border border-blue-200 rounded text-sm text-blue-800">
                                    Checking technician availability...
                                </div>
                            )}
                            <div className="flex flex-col space-y-2">
                                <div className="flex gap-2">
                                    <DatePicker
                                        selected={tempDate}
                                        onChange={(date: Date | null) => setTempDate(date)}
                                        dateFormat="MMMM d, yyyy"
                                        placeholderText="Select Date"
                                        className="block w-full border rounded p-2"
                                    />
                                    <select
                                        className="border rounded p-2 bg-white"
                                        value={tempTime}
                                        onChange={(e) => setTempTime(e.target.value)}
                                        disabled={loadingSchedule}
                                    >
                                        {timeSlots.map(time => {
                                            const available = isTimeSlotAvailable(time);
                                            return (
                                                <option
                                                    key={time}
                                                    value={time}
                                                    disabled={!available}
                                                    style={!available ? { color: '#999', textDecoration: 'line-through' } : {}}
                                                >
                                                    {time} {!available ? '(Unavailable - Tech Busy)' : ''}
                                                </option>
                                            );
                                        })}
                                    </select>
                                    <button
                                        type="button"
                                        onClick={handleAddAvailability}
                                        className="bg-green-600 text-white px-4 py-2 rounded hover:bg-green-700"
                                    >
                                        Add
                                    </button>
                                </div>
                                <div className="flex flex-wrap gap-2">
                                    {availability.map((date, idx) => (
                                        <span key={idx} className="bg-blue-100 text-blue-800 text-xs font-semibold px-2.5 py-0.5 rounded flex items-center">
                                            {date.toLocaleString()}
                                            <button
                                                type="button"
                                                onClick={() => setAvailability(prev => prev.filter((_, i) => i !== idx))}
                                                className="ml-2 text-blue-600 hover:text-blue-900"
                                            >
                                                ×
                                            </button>
                                        </span>
                                    ))}
                                </div>
                                {availability.length < 3 && <p className="text-xs text-red-500 mt-1">Please select at least 3 windows.</p>}
                            </div>
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700">Photos</label>
                            <input type="file" multiple accept="image/*" className="mt-1 block w-full" onChange={handleFileChange} />
                        </div>

                        {/* Recurring Job Option */}
                        <div className="border-t border-gray-200 pt-4 mt-4">
                            <label className="flex items-center gap-3 cursor-pointer">
                                <input
                                    type="checkbox"
                                    checked={isRecurring}
                                    onChange={(e) => setIsRecurring(e.target.checked)}
                                    className="w-5 h-5 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                                />
                                <div>
                                    <span className="text-sm font-medium text-gray-700">This is a recurring job</span>
                                    <p className="text-xs text-gray-500">Automatically create this job on a schedule</p>
                                </div>
                            </label>

                            {isRecurring && (
                                <div className="mt-3 ml-8 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                                    <label className="block text-sm font-medium text-gray-700 mb-2">Repeat Frequency</label>
                                    <select
                                        value={recurringFrequency}
                                        onChange={(e) => setRecurringFrequency(e.target.value as any)}
                                        className="w-full border rounded p-2 bg-white"
                                    >
                                        <option value="weekly">Weekly</option>
                                        <option value="biweekly">Every 2 Weeks</option>
                                        <option value="monthly">Monthly</option>
                                        <option value="quarterly">Quarterly (Every 3 Months)</option>
                                    </select>
                                    <p className="text-xs text-gray-500 mt-2">
                                        Future jobs will be created automatically based on this schedule.
                                    </p>
                                </div>
                            )}
                        </div>
                    </div>
                </div>

                <button
                    type="submit"
                    disabled={loading}
                    className={`w-full py-3 px-4 rounded text-white font-bold ${loading ? 'bg-gray-400' : 'bg-blue-600 hover:bg-blue-700'}`}
                >
                    {loading ? 'Creating...' : 'Submit Request'}
                </button>
            </form>
        </div>
    );
};
