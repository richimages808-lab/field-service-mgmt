import React, { useState, useEffect } from 'react';
import DatePicker from 'react-datepicker';
import "react-datepicker/dist/react-datepicker.css";
import { db, functions } from '../firebase';
import { collection, addDoc, serverTimestamp, query, where, getDocs, Timestamp } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { uploadFile } from '../lib/storage';
import { sendEmail } from '../lib/notifications';
import { useAuth } from '../auth/AuthProvider';
import { useNavigate } from 'react-router-dom';
import { Job, JobCategory, JOB_CATEGORIES } from '../types';
import { resolveTimezoneFromAddress, getTimezoneAbbr } from '../lib/timezoneUtils';
import { isSameDay, addMinutes, format, addDays, addWeeks, addMonths, startOfDay, setHours, setMinutes as setDateMinutes } from 'date-fns';
import {
    Wrench, Settings, Package, Search, Users, AlertTriangle, Shield, HelpCircle,
    Sparkles, Loader2, Brain, Clock, DollarSign, ShieldAlert, Gauge, ChevronDown,
    ChevronUp, CheckCircle2, Zap, ListChecks, Truck, Plus, Minus, Pencil,
    CalendarDays, MapPin, Send, ToggleLeft, CalendarCheck, User
} from 'lucide-react';

interface AIEstimate {
    diagnosis: string;
    solution: string;
    partsNeeded: Array<{ name: string; estimatedCost?: number; quantity?: number }>;
    toolsNeeded?: string[];
    estimatedDuration: number;
    confidence: number;
    safetyWarnings?: string[];
}

interface EditablePart {
    id: string;
    name: string;
    quantity: number;
    baseCost: number;
    markupPercent: number;
    customerPrice: number;
}

interface CostSummary {
    estimatedMaterialCost: number;
    estimatedLaborMinutes: number;
    partsCount: number;
}

export const CreateJob: React.FC = () => {
    const { user, organization } = useAuth();
    const navigate = useNavigate();
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    // Org rate card values
    const hourlyRate = organization?.rateCard?.baseHourlyRate ?? 100;
    const materialMarkup = organization?.rateCard?.materialMarkup ?? 30;
    const orgDriveTimeCharge = organization?.rateCard?.driveTimeCharge ?? 0;

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

    // AI Estimate State
    const [aiEstimate, setAiEstimate] = useState<AIEstimate | null>(null);
    const [costSummary, setCostSummary] = useState<CostSummary | null>(null);
    const [aiLoading, setAiLoading] = useState(false);
    const [aiError, setAiError] = useState('');
    const [aiExpanded, setAiExpanded] = useState(true);

    // Editable estimate line items
    const [editableParts, setEditableParts] = useState<EditablePart[]>([]);
    const [laborHours, setLaborHours] = useState(1);
    const [laborRate, setLaborRate] = useState(hourlyRate);
    const [driveTimeEnabled, setDriveTimeEnabled] = useState(orgDriveTimeCharge > 0);
    const [driveTimeAmount, setDriveTimeAmount] = useState(orgDriveTimeCharge);

    // Scheduling Mode
    const [schedulingMode, setSchedulingMode] = useState<'schedule_now' | 'availability'>('schedule_now');
    const [scheduleDate, setScheduleDate] = useState<Date | null>(null);
    const [scheduleTime, setScheduleTime] = useState<string | null>(null);
    const [scheduleConfirmed, setScheduleConfirmed] = useState(false);
    const [selectedTechId, setSelectedTechId] = useState<string | null>(null);
    const [selectedTechName, setSelectedTechName] = useState<string>('');
    const [orgJobs, setOrgJobs] = useState<Job[]>([]);
    const [orgTechs, setOrgTechs] = useState<{ id: string; name: string; email?: string }[]>([]);
    const [loadingOrgSchedule, setLoadingOrgSchedule] = useState(false);
    const [sendingNotifications, setSendingNotifications] = useState(false);

    // Legacy Availability State (fallback mode)
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

    // Fetch ALL org jobs for the selected schedule date (Schedule Now mode)
    useEffect(() => {
        const fetchOrgSchedule = async () => {
            if (!scheduleDate || !user) return;

            setLoadingOrgSchedule(true);
            try {
                const orgId = (user as any)?.org_id || 'demo-org';
                const jobsQuery = query(
                    collection(db, 'jobs'),
                    where('org_id', '==', orgId)
                );

                const snapshot = await getDocs(jobsQuery);
                const jobs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Job));

                // Filter to jobs scheduled on the selected date
                const jobsOnDate = jobs.filter(job => {
                    if (!job.scheduled_at) return false;
                    const jobDate = job.scheduled_at?.toDate?.() || new Date(job.scheduled_at);
                    return isSameDay(jobDate, scheduleDate);
                });

                setOrgJobs(jobsOnDate);
            } catch (error) {
                console.error('Error fetching org schedule:', error);
            } finally {
                setLoadingOrgSchedule(false);
            }
        };

        fetchOrgSchedule();
    }, [scheduleDate, user]);

    // Fetch technicians for the org (once on mount)
    useEffect(() => {
        const fetchTechs = async () => {
            if (!user) return;
            try {
                const orgId = (user as any)?.org_id || 'demo-org';
                const techQuery = query(
                    collection(db, 'users'),
                    where('org_id', '==', orgId),
                    where('role', '==', 'technician')
                );
                const snapshot = await getDocs(techQuery);
                const techs = snapshot.docs.map(doc => ({
                    id: doc.id,
                    name: doc.data().displayName || doc.data().name || doc.data().email || 'Unnamed Tech',
                    email: doc.data().email
                }));
                setOrgTechs(techs);
            } catch (error) {
                console.error('Error fetching technicians:', error);
            }
        };

        fetchTechs();
    }, [user]);

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

    // Generate 30-minute schedule slots for Schedule Now mode
    // Uses org's operating hours and timezone for correct time display
    const opStart = (organization?.settings as any)?.operatingHoursStart ?? 8;
    const opEnd = (organization?.settings as any)?.operatingHoursEnd ?? 17;
    const orgTimezone = (organization?.settings as any)?.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone;
    // Resolve job-specific timezone from the customer's work address (falls back to org timezone)
    const jobTimezone = (address ? resolveTimezoneFromAddress(address) : null) || orgTimezone;
    const effectiveTimezone = jobTimezone;
    const scheduleSlots: string[] = [];
    for (let i = opStart; i < opEnd; i++) {
        for (let j = 0; j < 60; j += 30) {
            const hour = i.toString().padStart(2, '0');
            const minute = j.toString().padStart(2, '0');
            scheduleSlots.push(`${hour}:${minute}`);
        }
    }

    // Helper: format an hour as a timezone-abbreviated label
    const orgTzLabel = (() => {
        try {
            // Get the short timezone abbreviation (e.g., "EST", "HST", "PST")
            const parts = new Intl.DateTimeFormat('en-US', { timeZone: effectiveTimezone, timeZoneName: 'short' }).formatToParts(new Date());
            return parts.find(p => p.type === 'timeZoneName')?.value || '';
        } catch {
            return '';
        }
    })();

    // Check if a schedule-now slot conflicts with existing org jobs
    const isScheduleSlotAvailable = (timeSlot: string): boolean => {
        if (!scheduleDate || orgJobs.length === 0) return true;

        const [hours, minutes] = timeSlot.split(':').map(Number);
        const slotStart = new Date(scheduleDate);
        slotStart.setHours(hours, minutes, 0, 0);
        const slotEnd = addMinutes(slotStart, estimatedDuration || 60);

        // Filter jobs for selected tech (or all if unassigned)
        const relevantJobs = selectedTechId
            ? orgJobs.filter(j => j.assigned_tech_id === selectedTechId)
            : orgJobs;

        return !relevantJobs.some(job => {
            if (!job.scheduled_at) return false;
            const jobStart = job.scheduled_at?.toDate?.() || new Date(job.scheduled_at);
            const jobDuration = job.estimated_duration || 60;
            const jobEnd = addMinutes(jobStart, jobDuration);

            return (slotStart < jobEnd && slotEnd > jobStart);
        });
    };

    // Get jobs for the timeline visualization
    const getJobsForTimeline = (): Job[] => {
        if (selectedTechId) {
            return orgJobs.filter(j => j.assigned_tech_id === selectedTechId);
        }
        return orgJobs;
    };

    // Handle schedule slot selection
    const handleSelectScheduleSlot = (slot: string) => {
        if (!isScheduleSlotAvailable(slot)) return;
        setScheduleTime(slot);
        setScheduleConfirmed(true);
    };

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

    // ── AI Estimate Handler ──────────────────────────────────────────────
    const handleGenerateAIEstimate = async () => {
        if (!description.trim() || description.trim().length < 10) {
            setAiError('Please enter a more detailed description (at least 10 characters).');
            return;
        }

        setAiLoading(true);
        setAiError('');
        setAiEstimate(null);
        setCostSummary(null);

        try {
            const orgId = (user as any)?.org_id || 'demo-org';
            const generateEstimate = httpsCallable(functions, 'generateJobEstimate');
            const result = await generateEstimate({
                description: description.trim(),
                category: jobCategory,
                priority,
                address: address.trim() || undefined,
                siteName: siteName.trim() || undefined,
                orgId,
            });

            const data = result.data as any;
            if (data?.success && data.recommendation) {
                setAiEstimate(data.recommendation);
                setCostSummary(data.costSummary || null);

                // Build editable parts with markup applied
                const parts: EditablePart[] = (data.recommendation.partsNeeded || []).map((p: any, i: number) => {
                    const base = p.estimatedCost || 0;
                    const qty = p.quantity || 1;
                    const price = Math.round(base * (1 + materialMarkup / 100) * 100) / 100;
                    return {
                        id: `part-${Date.now()}-${i}`,
                        name: p.name,
                        quantity: qty,
                        baseCost: base,
                        markupPercent: materialMarkup,
                        customerPrice: price,
                    };
                });
                setEditableParts(parts);

                // Auto-fill the estimated duration dropdown with AI suggestion
                const aiDuration = data.recommendation.estimatedDuration;
                if (aiDuration) {
                    // Snap to nearest valid dropdown value
                    const validDurations = [15, 30, 45, 60, 90, 120, 180, 240, 300, 360, 480];
                    const closest = validDurations.reduce((prev, curr) =>
                        Math.abs(curr - aiDuration) < Math.abs(prev - aiDuration) ? curr : prev
                    );
                    setEstimatedDuration(closest);

                    // Set labor hours (minimum 1 hour)
                    const hrs = Math.max(1, Math.ceil(aiDuration / 60));
                    setLaborHours(hrs);
                }

                // Set labor rate from org
                setLaborRate(hourlyRate);

                // Drive time defaults from org settings
                setDriveTimeEnabled(orgDriveTimeCharge > 0);
                setDriveTimeAmount(orgDriveTimeCharge);

                setAiExpanded(true);
            } else {
                setAiError('AI estimate returned an unexpected response. Please try again.');
            }
        } catch (err: any) {
            console.error('AI estimate error:', err);
            setAiError(err?.message || 'Failed to generate AI estimate. Please try again.');
        } finally {
            setAiLoading(false);
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

            // Determine if we're scheduling now
            const isScheduleNow = schedulingMode === 'schedule_now' && scheduleDate && scheduleTime;
            let scheduledAtDate: Date | null = null;

            if (isScheduleNow) {
                const [hrs, mins] = scheduleTime!.split(':').map(Number);
                scheduledAtDate = new Date(scheduleDate!);
                scheduledAtDate.setHours(hrs, mins, 0, 0);
            }

            const jobData: any = {
                org_id: finalOrgId,
                status: isScheduleNow ? 'scheduled' : 'pending',
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
                createdBy: user.uid,
                timezone: resolveTimezoneFromAddress(address) || orgTimezone
            };

            // If scheduling now, attach scheduled time and tech
            if (isScheduleNow && scheduledAtDate) {
                jobData.scheduled_at = Timestamp.fromDate(scheduledAtDate);
                jobData.scheduledBy = user.uid;
                jobData.scheduledAt_iso = scheduledAtDate.toISOString();
            }

            if (selectedTechId && selectedTechName) {
                jobData.assigned_tech_id = selectedTechId;
                jobData.assigned_tech_name = selectedTechName;
            }

            // Attach AI estimate if generated
            if (aiEstimate) {
                jobData.aiRecommendation = aiEstimate;
                jobData.aiEstimatedAt = new Date().toISOString();

                // Save the full editable cost breakdown for display in job details
                jobData.costBreakdown = {
                    parts: editableParts.map(p => ({
                        name: p.name,
                        quantity: p.quantity,
                        baseCost: p.baseCost,
                        markupPercent: p.markupPercent,
                        customerPrice: p.customerPrice,
                        lineTotal: p.quantity * p.customerPrice
                    })),
                    labor: {
                        hours: laborHours,
                        rate: laborRate,
                        total: laborHours * laborRate
                    },
                    driveTime: driveTimeEnabled ? {
                        enabled: true,
                        amount: driveTimeAmount
                    } : { enabled: false, amount: 0 },
                    materialSubtotal: editableParts.reduce((sum, p) => sum + (p.quantity * p.customerPrice), 0),
                    laborTotal: laborHours * laborRate,
                    grandTotal: editableParts.reduce((sum, p) => sum + (p.quantity * p.customerPrice), 0)
                        + (laborHours * laborRate)
                        + (driveTimeEnabled ? driveTimeAmount : 0)
                };
            }

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
            const jobRef = await addDoc(jobsRef, jobData);
            console.log("Job document saved:", jobRef.id);

            // 5. Send Notifications
            const orgName = organization?.name || 'DispatchBox';

            if (isScheduleNow && scheduledAtDate) {
                // Schedule Now: send appointment confirmation
                const formattedDate = format(scheduledAtDate, 'EEEE, MMMM d, yyyy');
                const formattedTime = format(scheduledAtDate, 'h:mm a');

                // Send confirmation email
                if (email) {
                    try {
                        await sendEmail(
                            email,
                            `Appointment Confirmed — ${format(scheduledAtDate, 'MMM d')}`,
                            `Hi ${customerName},\n\nYour service appointment has been scheduled:\n\n📅 ${formattedDate}\n🕐 ${formattedTime}\n📍 ${address || 'Address on file'}\n\nService: ${description.slice(0, 100)}${description.length > 100 ? '...' : ''}\n\nIf you need to reschedule, please contact us.\n\nThanks,\n${orgName}`
                        );
                        console.log("Confirmation email sent.");
                    } catch (emailErr) {
                        console.error("Failed to send confirmation email:", emailErr);
                    }
                }

                // Send confirmation SMS if phone number available
                if (phone) {
                    try {
                        const smsMessage = `${orgName}: Your appointment is confirmed for ${formattedDate} at ${formattedTime}${address ? ` at ${address}` : ''}. Reply STOP to opt out.`;
                        const sendQuickNotification = httpsCallable(functions, 'sendQuickNotification');
                        await sendQuickNotification({
                            type: 'sms',
                            recipientPhone: phone.split(',')[0].trim(), // Use first phone number
                            message: smsMessage,
                            jobId: jobRef.id,
                            orgId: finalOrgId
                        });
                        console.log("Confirmation SMS sent.");
                    } catch (smsErr) {
                        console.error("Failed to send confirmation SMS:", smsErr);
                        // Don't block job creation on SMS failure
                    }
                }
            } else {
                // Standard mode: send generic "request received" email
                if (email) {
                    try {
                        await sendEmail(
                            email,
                            "Job Request Received",
                            `Hi ${customerName},\n\nWe have received your request: "${description}".\nWe will be in touch shortly to schedule a visit.\n\nThanks,\n${orgName}`
                        );
                        console.log("Email sent.");
                    } catch (emailErr) {
                        console.error("Failed to send email:", emailErr);
                    }
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

    // Helper to format duration
    const formatDuration = (minutes: number): string => {
        if (minutes < 60) return `${minutes} min`;
        const hrs = Math.floor(minutes / 60);
        const mins = minutes % 60;
        return mins > 0 ? `${hrs}h ${mins}m` : `${hrs}h`;
    };

    // Confidence color
    const getConfidenceColor = (confidence: number) => {
        if (confidence >= 0.8) return { bg: 'bg-emerald-100', text: 'text-emerald-700', bar: 'bg-emerald-500' };
        if (confidence >= 0.6) return { bg: 'bg-amber-100', text: 'text-amber-700', bar: 'bg-amber-500' };
        return { bg: 'bg-red-100', text: 'text-red-700', bar: 'bg-red-500' };
    };

    // ── Editable parts helpers ───────────────────────────────────────────
    const updatePart = (id: string, field: keyof EditablePart, value: any) => {
        setEditableParts(prev => prev.map(p => {
            if (p.id !== id) return p;
            const updated = { ...p, [field]: value };
            // Recalculate customer price when base cost or markup changes
            if (field === 'baseCost' || field === 'markupPercent') {
                updated.customerPrice = Math.round(updated.baseCost * (1 + updated.markupPercent / 100) * 100) / 100;
            }
            return updated;
        }));
    };

    const addPart = () => {
        setEditableParts(prev => [...prev, {
            id: `part-${Date.now()}`,
            name: '',
            quantity: 1,
            baseCost: 0,
            markupPercent: materialMarkup,
            customerPrice: 0,
        }]);
    };

    const removePart = (id: string) => {
        setEditableParts(prev => prev.filter(p => p.id !== id));
    };

    // ── Computed totals ──────────────────────────────────────────────────
    const materialsSubtotal = editableParts.reduce((sum, p) => sum + (p.customerPrice * p.quantity), 0);
    const laborSubtotal = laborHours * laborRate;
    const driveTimeSubtotal = driveTimeEnabled ? driveTimeAmount : 0;
    const grandTotal = materialsSubtotal + laborSubtotal + driveTimeSubtotal;

    const canGenerateEstimate = description.trim().length >= 10;

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
                            <label className="block text-sm font-medium text-gray-700">Phone Number(s)</label>
                            <input type="text" required className="mt-1 block w-full border rounded p-2 text-gray-900 bg-white" placeholder="e.g. 555-123-4567, 555-987-6543" value={phone} onChange={e => setPhone(e.target.value)} />
                            <p className="text-xs text-gray-500 mt-1">Separate multiple numbers with commas.</p>
                        </div>
                        <div className="col-span-2">
                            <label className="block text-sm font-medium text-gray-700">Email(s)</label>
                            <input type="text" className="mt-1 block w-full border rounded p-2 text-gray-900 bg-white" placeholder="e.g. email1@abc.com, email2@abc.com" value={email} onChange={e => setEmail(e.target.value)} />
                            <p className="text-xs text-gray-500 mt-1">Separate multiple emails with commas.</p>
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

                        {/* ── AI Estimate Button ─────────────────────────────────── */}
                        <div>
                            <button
                                type="button"
                                onClick={handleGenerateAIEstimate}
                                disabled={aiLoading || !canGenerateEstimate}
                                className={`w-full py-3 px-5 rounded-xl font-bold text-sm flex items-center justify-center gap-2.5 transition-all shadow-md ${
                                    aiLoading
                                        ? 'bg-gradient-to-r from-violet-400 to-purple-400 text-white cursor-wait'
                                        : canGenerateEstimate
                                            ? 'bg-gradient-to-r from-violet-600 to-purple-700 hover:from-violet-700 hover:to-purple-800 text-white hover:shadow-lg transform hover:scale-[1.01] active:scale-[0.99]'
                                            : 'bg-gray-200 text-gray-400 cursor-not-allowed'
                                }`}
                            >
                                {aiLoading ? (
                                    <>
                                        <Loader2 className="w-5 h-5 animate-spin" />
                                        Analyzing job details...
                                    </>
                                ) : (
                                    <>
                                        <Sparkles className="w-5 h-5" />
                                        Generate AI Estimate
                                    </>
                                )}
                            </button>
                            {!canGenerateEstimate && !aiEstimate && (
                                <p className="text-xs text-gray-400 text-center mt-1.5">
                                    Enter a job description above to enable AI estimation
                                </p>
                            )}
                            {aiError && (
                                <p className="text-xs text-red-500 text-center mt-1.5">{aiError}</p>
                            )}
                        </div>

                        {/* ── AI Estimate Loading Shimmer ──────────────────────── */}
                        {aiLoading && (
                            <div className="border-2 border-violet-200 rounded-2xl overflow-hidden animate-pulse">
                                <div className="bg-gradient-to-r from-violet-50 to-purple-50 p-5">
                                    <div className="flex items-center gap-3 mb-4">
                                        <div className="w-10 h-10 rounded-xl bg-violet-200" />
                                        <div className="flex-1">
                                            <div className="h-4 bg-violet-200 rounded w-48 mb-2" />
                                            <div className="h-3 bg-violet-100 rounded w-32" />
                                        </div>
                                    </div>
                                    <div className="space-y-3">
                                        <div className="h-3 bg-violet-100 rounded w-full" />
                                        <div className="h-3 bg-violet-100 rounded w-5/6" />
                                        <div className="h-3 bg-violet-100 rounded w-4/6" />
                                    </div>
                                    <div className="grid grid-cols-3 gap-3 mt-4">
                                        <div className="h-16 bg-violet-100 rounded-lg" />
                                        <div className="h-16 bg-violet-100 rounded-lg" />
                                        <div className="h-16 bg-violet-100 rounded-lg" />
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* ── AI Estimate Results Panel ────────────────────────── */}
                        {aiEstimate && !aiLoading && (
                            <div className="border-2 border-violet-200 rounded-2xl overflow-hidden shadow-lg">
                                {/* Header */}
                                <button
                                    type="button"
                                    onClick={() => setAiExpanded(!aiExpanded)}
                                    className="w-full bg-gradient-to-r from-violet-600 to-purple-700 p-4 flex items-center justify-between text-white cursor-pointer hover:from-violet-700 hover:to-purple-800 transition-all"
                                >
                                    <div className="flex items-center gap-3">
                                        <div className="w-9 h-9 bg-white/20 rounded-xl flex items-center justify-center">
                                            <Brain className="w-5 h-5" />
                                        </div>
                                        <div className="text-left">
                                            <h3 className="font-bold text-sm">AI Job Estimate</h3>
                                            <p className="text-violet-200 text-xs">
                                                {Math.round(aiEstimate.confidence * 100)}% confidence • {formatDuration(aiEstimate.estimatedDuration)} est.
                                                {grandTotal > 0 ? ` • $${grandTotal.toFixed(0)} total` : ''}
                                            </p>
                                        </div>
                                    </div>
                                    {aiExpanded ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
                                </button>

                                {aiExpanded && (
                                    <div className="bg-gradient-to-b from-violet-50/80 to-white p-5 space-y-5">
                                        {/* Quick Stats Row */}
                                        <div className="grid grid-cols-3 gap-3">
                                            <div className="bg-white rounded-xl p-3 border border-violet-100 shadow-sm text-center">
                                                <Clock className="w-4 h-4 text-violet-500 mx-auto mb-1" />
                                                <p className="text-lg font-bold text-gray-900">{formatDuration(aiEstimate.estimatedDuration)}</p>
                                                <p className="text-[10px] text-gray-500 uppercase tracking-wider font-medium">Duration</p>
                                            </div>
                                            <div className="bg-white rounded-xl p-3 border border-violet-100 shadow-sm text-center">
                                                <DollarSign className="w-4 h-4 text-emerald-500 mx-auto mb-1" />
                                                <p className="text-lg font-bold text-gray-900">
                                                    ${grandTotal.toFixed(0)}
                                                </p>
                                                <p className="text-[10px] text-gray-500 uppercase tracking-wider font-medium">Total Est.</p>
                                            </div>
                                            <div className="bg-white rounded-xl p-3 border border-violet-100 shadow-sm text-center">
                                                <Gauge className="w-4 h-4 text-blue-500 mx-auto mb-1" />
                                                <div className="flex items-center justify-center gap-1.5 mb-0.5">
                                                    <p className={`text-lg font-bold ${getConfidenceColor(aiEstimate.confidence).text}`}>
                                                        {Math.round(aiEstimate.confidence * 100)}%
                                                    </p>
                                                </div>
                                                <p className="text-[10px] text-gray-500 uppercase tracking-wider font-medium">Confidence</p>
                                                <div className="w-full bg-gray-200 rounded-full h-1 mt-1">
                                                    <div
                                                        className={`h-1 rounded-full transition-all ${getConfidenceColor(aiEstimate.confidence).bar}`}
                                                        style={{ width: `${aiEstimate.confidence * 100}%` }}
                                                    />
                                                </div>
                                            </div>
                                        </div>

                                        {/* Diagnosis */}
                                        <div>
                                            <h4 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                                                <Zap className="w-3.5 h-3.5 text-violet-500" />
                                                Diagnosis
                                            </h4>
                                            <p className="text-sm text-gray-700 leading-relaxed bg-white rounded-lg p-3 border border-gray-100">
                                                {aiEstimate.diagnosis}
                                            </p>
                                        </div>

                                        {/* Solution */}
                                        <div>
                                            <h4 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                                                <ListChecks className="w-3.5 h-3.5 text-violet-500" />
                                                Recommended Solution
                                            </h4>
                                            <div className="text-sm text-gray-700 leading-relaxed bg-white rounded-lg p-3 border border-gray-100 whitespace-pre-line">
                                                {aiEstimate.solution}
                                            </div>
                                        </div>

                                        {/* ── Editable Parts & Materials ────────────────────── */}
                                        <div>
                                            <h4 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                                                <Package className="w-3.5 h-3.5 text-emerald-500" />
                                                Parts & Materials
                                                <span className="text-[9px] font-normal text-gray-400 ml-1">(editable)</span>
                                            </h4>
                                            <div className="bg-white rounded-lg border border-gray-100 overflow-hidden">
                                                {/* Table header */}
                                                <div className="grid grid-cols-[1fr_50px_80px_65px_85px_32px] gap-1 px-3 py-2 bg-gray-50 text-[10px] font-bold text-gray-400 uppercase tracking-wider">
                                                    <span>Item</span>
                                                    <span className="text-center">Qty</span>
                                                    <span className="text-right">Base Cost</span>
                                                    <span className="text-center">Markup</span>
                                                    <span className="text-right">Price</span>
                                                    <span></span>
                                                </div>
                                                {/* Part rows */}
                                                {editableParts.map((part) => (
                                                    <div key={part.id} className="grid grid-cols-[1fr_50px_80px_65px_85px_32px] gap-1 px-3 py-1.5 items-center border-t border-gray-50 hover:bg-violet-50/30 transition-colors">
                                                        <input
                                                            type="text"
                                                            value={part.name}
                                                            onChange={(e) => updatePart(part.id, 'name', e.target.value)}
                                                            className="text-sm text-gray-700 bg-transparent border-b border-transparent hover:border-gray-300 focus:border-violet-400 focus:outline-none py-0.5 w-full"
                                                            placeholder="Part name"
                                                        />
                                                        <input
                                                            type="number"
                                                            value={part.quantity}
                                                            onChange={(e) => updatePart(part.id, 'quantity', parseInt(e.target.value) || 1)}
                                                            min="1"
                                                            className="text-sm text-gray-700 text-center bg-transparent border-b border-transparent hover:border-gray-300 focus:border-violet-400 focus:outline-none py-0.5 w-full"
                                                        />
                                                        <div className="relative">
                                                            <span className="absolute left-1 top-1/2 -translate-y-1/2 text-gray-400 text-xs">$</span>
                                                            <input
                                                                type="number"
                                                                value={part.baseCost}
                                                                onChange={(e) => updatePart(part.id, 'baseCost', parseFloat(e.target.value) || 0)}
                                                                min="0"
                                                                step="0.01"
                                                                className="text-sm text-gray-700 text-right bg-transparent border-b border-transparent hover:border-gray-300 focus:border-violet-400 focus:outline-none py-0.5 w-full pl-4"
                                                            />
                                                        </div>
                                                        <div className="relative">
                                                            <input
                                                                type="number"
                                                                value={part.markupPercent}
                                                                onChange={(e) => updatePart(part.id, 'markupPercent', parseFloat(e.target.value) || 0)}
                                                                min="0"
                                                                className="text-xs text-amber-600 text-center bg-transparent border-b border-transparent hover:border-gray-300 focus:border-violet-400 focus:outline-none py-0.5 w-full pr-3"
                                                            />
                                                            <span className="absolute right-0 top-1/2 -translate-y-1/2 text-amber-500 text-[10px]">%</span>
                                                        </div>
                                                        <span className="text-sm font-semibold text-gray-900 text-right">
                                                            ${(part.customerPrice * part.quantity).toFixed(2)}
                                                        </span>
                                                        <button
                                                            type="button"
                                                            onClick={() => removePart(part.id)}
                                                            className="text-gray-300 hover:text-red-500 transition-colors flex items-center justify-center"
                                                            title="Remove part"
                                                        >
                                                            <Minus className="w-3.5 h-3.5" />
                                                        </button>
                                                    </div>
                                                ))}
                                                {/* Add part button */}
                                                <div className="px-3 py-2 border-t border-gray-100">
                                                    <button
                                                        type="button"
                                                        onClick={addPart}
                                                        className="text-xs text-violet-600 hover:text-violet-800 font-medium flex items-center gap-1 transition-colors"
                                                    >
                                                        <Plus className="w-3 h-3" /> Add Part
                                                    </button>
                                                </div>
                                                {/* Materials subtotal */}
                                                <div className="flex items-center justify-between px-3 py-2.5 bg-gray-50 font-bold border-t border-gray-200">
                                                    <span className="text-sm text-gray-600">Materials Subtotal</span>
                                                    <span className="text-sm text-gray-900">
                                                        ${materialsSubtotal.toFixed(2)}
                                                    </span>
                                                </div>
                                            </div>
                                        </div>

                                        {/* ── Labor ────────────────────────────────────────── */}
                                        <div>
                                            <h4 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                                                <Clock className="w-3.5 h-3.5 text-blue-500" />
                                                Labor
                                            </h4>
                                            <div className="bg-white rounded-lg border border-gray-100 overflow-hidden">
                                                <div className="flex items-center justify-between px-3 py-2.5">
                                                    <div className="flex items-center gap-3">
                                                        <div className="flex items-center gap-1.5">
                                                            <input
                                                                type="number"
                                                                value={laborHours}
                                                                onChange={(e) => setLaborHours(Math.max(0.5, parseFloat(e.target.value) || 1))}
                                                                min="0.5"
                                                                step="0.5"
                                                                className="w-14 text-sm text-gray-700 text-center bg-transparent border-b border-gray-300 hover:border-violet-400 focus:border-violet-400 focus:outline-none py-0.5"
                                                            />
                                                            <span className="text-xs text-gray-500">hrs</span>
                                                        </div>
                                                        <span className="text-gray-300">×</span>
                                                        <div className="flex items-center gap-1">
                                                            <span className="text-xs text-gray-400">$</span>
                                                            <input
                                                                type="number"
                                                                value={laborRate}
                                                                onChange={(e) => setLaborRate(parseFloat(e.target.value) || 0)}
                                                                min="0"
                                                                className="w-16 text-sm text-gray-700 text-center bg-transparent border-b border-gray-300 hover:border-violet-400 focus:border-violet-400 focus:outline-none py-0.5"
                                                            />
                                                            <span className="text-xs text-gray-500">/hr</span>
                                                        </div>
                                                    </div>
                                                    <span className="text-sm font-semibold text-gray-900">
                                                        ${laborSubtotal.toFixed(2)}
                                                    </span>
                                                </div>
                                            </div>
                                        </div>

                                        {/* ── Drive Time / Service Call Fee ──────────────────── */}
                                        <div>
                                            <h4 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                                                <Truck className="w-3.5 h-3.5 text-orange-500" />
                                                Drive Time / Service Call Fee
                                            </h4>
                                            <div className="bg-white rounded-lg border border-gray-100 overflow-hidden">
                                                <div className="flex items-center justify-between px-3 py-2.5">
                                                    <div className="flex items-center gap-3">
                                                        <label className="relative inline-flex items-center cursor-pointer">
                                                            <input
                                                                type="checkbox"
                                                                checked={driveTimeEnabled}
                                                                onChange={(e) => setDriveTimeEnabled(e.target.checked)}
                                                                className="sr-only peer"
                                                            />
                                                            <div className="w-8 h-4.5 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border after:rounded-full after:h-3.5 after:w-3.5 after:transition-all peer-checked:bg-orange-500"></div>
                                                        </label>
                                                        {driveTimeEnabled ? (
                                                            <div className="flex items-center gap-1">
                                                                <span className="text-xs text-gray-400">$</span>
                                                                <input
                                                                    type="number"
                                                                    value={driveTimeAmount}
                                                                    onChange={(e) => setDriveTimeAmount(parseFloat(e.target.value) || 0)}
                                                                    min="0"
                                                                    step="5"
                                                                    className="w-16 text-sm text-gray-700 text-center bg-transparent border-b border-gray-300 hover:border-violet-400 focus:border-violet-400 focus:outline-none py-0.5"
                                                                />
                                                            </div>
                                                        ) : (
                                                            <span className="text-xs text-gray-400">Not included</span>
                                                        )}
                                                    </div>
                                                    <span className={`text-sm font-semibold ${driveTimeEnabled ? 'text-gray-900' : 'text-gray-300'}`}>
                                                        ${driveTimeSubtotal.toFixed(2)}
                                                    </span>
                                                </div>
                                                {orgDriveTimeCharge === 0 && (
                                                    <div className="px-3 py-1.5 bg-orange-50 border-t border-orange-100">
                                                        <p className="text-[10px] text-orange-500">
                                                            No default drive time charge set. Configure in Settings → Financial → Rate Card.
                                                        </p>
                                                    </div>
                                                )}
                                            </div>
                                        </div>

                                        {/* ── Tools Needed ──────────────────────────────────── */}
                                        {(aiEstimate as any).toolsNeeded && (aiEstimate as any).toolsNeeded.length > 0 && (
                                            <div>
                                                <h4 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                                                    <Wrench className="w-3.5 h-3.5 text-orange-500" />
                                                    Tools Needed
                                                </h4>
                                                <div className="bg-white rounded-lg border border-gray-100 p-3">
                                                    <div className="flex flex-wrap gap-1.5">
                                                        {(aiEstimate as any).toolsNeeded.map((tool: string, idx: number) => (
                                                            <span key={idx} className="inline-flex items-center gap-1 bg-orange-50 text-orange-700 border border-orange-200 text-xs px-2.5 py-1 rounded-full font-medium">
                                                                <Wrench className="w-2.5 h-2.5" /> {tool}
                                                            </span>
                                                        ))}
                                                    </div>
                                                    <p className="text-[10px] text-gray-400 mt-2">Recommended tools for this job — not charged to the customer.</p>
                                                </div>
                                            </div>
                                        )}

                                        {/* ── Total Cost Breakdown ──────────────────────────── */}
                                        <div className="bg-gradient-to-r from-violet-100/60 to-purple-100/60 rounded-xl p-4 border border-violet-200">
                                            <div className="space-y-1.5 mb-3">
                                                <div className="flex items-center justify-between text-sm">
                                                    <span className="text-gray-600">Materials ({editableParts.length} items)</span>
                                                    <span className="text-gray-700">${materialsSubtotal.toFixed(2)}</span>
                                                </div>
                                                <div className="flex items-center justify-between text-sm">
                                                    <span className="text-gray-600">Labor ({laborHours}h × ${laborRate}/hr)</span>
                                                    <span className="text-gray-700">${laborSubtotal.toFixed(2)}</span>
                                                </div>
                                                {driveTimeEnabled && (
                                                    <div className="flex items-center justify-between text-sm">
                                                        <span className="text-gray-600">Drive Time / Service Call</span>
                                                        <span className="text-gray-700">${driveTimeSubtotal.toFixed(2)}</span>
                                                    </div>
                                                )}
                                            </div>
                                            <div className="flex items-center justify-between pt-2.5 border-t-2 border-violet-300/50">
                                                <span className="text-base font-bold text-gray-800">Estimated Total</span>
                                                <span className="text-xl font-extrabold text-violet-700">${grandTotal.toFixed(2)}</span>
                                            </div>
                                        </div>

                                        {/* Safety Warnings */}
                                        {aiEstimate.safetyWarnings && aiEstimate.safetyWarnings.length > 0 && (
                                            <div>
                                                <h4 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                                                    <ShieldAlert className="w-3.5 h-3.5 text-red-500" />
                                                    Safety Warnings
                                                </h4>
                                                <div className="space-y-1.5">
                                                    {aiEstimate.safetyWarnings.map((warning, i) => (
                                                        <div key={i} className="flex items-start gap-2 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
                                                            <AlertTriangle className="w-3.5 h-3.5 text-red-500 mt-0.5 flex-shrink-0" />
                                                            <span className="text-xs text-red-700">{warning}</span>
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                        )}

                                        {/* AI Generated Badge */}
                                        <div className="flex items-center justify-between pt-2 border-t border-violet-100">
                                            <p className="text-[10px] text-gray-400 flex items-center gap-1">
                                                <CheckCircle2 className="w-3 h-3 text-violet-400" />
                                                AI estimate generated — all values editable. Review and adjust as needed.
                                            </p>
                                            <button
                                                type="button"
                                                onClick={handleGenerateAIEstimate}
                                                className="text-[10px] text-violet-500 hover:text-violet-700 font-medium flex items-center gap-1"
                                            >
                                                <Sparkles className="w-3 h-3" /> Regenerate
                                            </button>
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}

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
                                <label className="block text-sm font-medium text-gray-700">
                                    Estimated Duration
                                    {aiEstimate && (
                                        <span className="ml-1.5 inline-flex items-center gap-0.5 text-[10px] text-violet-600 font-normal bg-violet-100 px-1.5 py-0.5 rounded-full">
                                            <Sparkles className="w-2.5 h-2.5" /> AI
                                        </span>
                                    )}
                                </label>
                                <select
                                    value={estimatedDuration}
                                    onChange={(e) => setEstimatedDuration(parseInt(e.target.value))}
                                    className={`mt-1 block w-full border rounded p-2 bg-white ${aiEstimate ? 'border-violet-300 ring-1 ring-violet-200' : ''}`}
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

                        {/* ── Scheduling Section ─────────────────────── */}
                        <div className="border border-blue-200 rounded-lg overflow-hidden">
                            {/* Mode Toggle Header */}
                            <div className="bg-gradient-to-r from-blue-600 to-indigo-600 px-4 py-3 flex items-center justify-between">
                                <div className="flex items-center gap-2 text-white">
                                    <CalendarCheck className="w-5 h-5" />
                                    <span className="font-semibold text-sm">
                                        {schedulingMode === 'schedule_now' ? 'Schedule Appointment' : 'Availability Windows'}
                                    </span>
                                </div>
                                <button
                                    type="button"
                                    onClick={() => {
                                        setSchedulingMode(prev => prev === 'schedule_now' ? 'availability' : 'schedule_now');
                                        setScheduleConfirmed(false);
                                        setScheduleTime(null);
                                    }}
                                    className="text-xs text-blue-100 hover:text-white flex items-center gap-1 transition-colors"
                                >
                                    <ToggleLeft className="w-3.5 h-3.5" />
                                    {schedulingMode === 'schedule_now' ? 'Use availability windows instead' : 'Schedule now instead'}
                                </button>
                            </div>

                            <div className="p-4">
                                {schedulingMode === 'schedule_now' ? (
                                    /* ── Schedule Now Mode ──────────────────── */
                                    <div className="space-y-4">
                                        {/* Date + Tech Row */}
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                            <div>
                                                <label className="block text-xs font-medium text-gray-600 mb-1">Select Date</label>
                                                <DatePicker
                                                    selected={scheduleDate}
                                                    onChange={(date: Date | null) => {
                                                        setScheduleDate(date);
                                                        setScheduleTime(null);
                                                        setScheduleConfirmed(false);
                                                    }}
                                                    dateFormat="EEEE, MMMM d, yyyy"
                                                    minDate={new Date()}
                                                    placeholderText="Pick a date..."
                                                    className="block w-full border border-gray-300 rounded-lg p-2.5 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                                                />
                                            </div>
                                            <div>
                                                <label className="block text-xs font-medium text-gray-600 mb-1">Assign Technician (optional)</label>
                                                <select
                                                    value={selectedTechId || ''}
                                                    onChange={(e) => {
                                                        const techId = e.target.value || null;
                                                        setSelectedTechId(techId);
                                                        const tech = orgTechs.find(t => t.id === techId);
                                                        setSelectedTechName(tech?.name || '');
                                                        // Reset time selection when tech changes
                                                        setScheduleTime(null);
                                                        setScheduleConfirmed(false);
                                                    }}
                                                    className="block w-full border border-gray-300 rounded-lg p-2.5 text-sm bg-white focus:ring-2 focus:ring-blue-500"
                                                >
                                                    <option value="">Unassigned (any tech)</option>
                                                    {orgTechs.map(tech => (
                                                        <option key={tech.id} value={tech.id}>{tech.name}</option>
                                                    ))}
                                                </select>
                                            </div>
                                        </div>

                                        {scheduleDate && (
                                            <>
                                                {/* Loading State */}
                                                {loadingOrgSchedule && (
                                                    <div className="flex items-center gap-2 p-3 bg-blue-50 border border-blue-200 rounded-lg text-sm text-blue-700">
                                                        <Loader2 className="w-4 h-4 animate-spin" />
                                                        Loading schedule for {format(scheduleDate, 'MMM d')}...
                                                    </div>
                                                )}

                                                {/* Existing Jobs Summary */}
                                                {!loadingOrgSchedule && orgJobs.length > 0 && (
                                                    <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
                                                        <p className="text-xs font-medium text-amber-800 mb-2">
                                                            {getJobsForTimeline().length} existing job(s) on {format(scheduleDate, 'MMM d')}
                                                            {selectedTechId ? ` for ${selectedTechName}` : ' (all techs)'}:
                                                        </p>
                                                        <div className="space-y-1">
                                                            {getJobsForTimeline().slice(0, 5).map(job => {
                                                                const jobStart = job.scheduled_at?.toDate?.() || new Date(job.scheduled_at);
                                                                return (
                                                                    <div key={job.id} className="flex items-center gap-2 text-xs text-amber-700">
                                                                        <Clock className="w-3 h-3" />
                                                                        <span className="font-medium">{format(jobStart, 'h:mm a')}</span>
                                                                        <span>—</span>
                                                                        <span>{job.customer?.name || 'Unknown'}</span>
                                                                        <span className="text-amber-500">({job.estimated_duration || 60}min)</span>
                                                                        {job.assigned_tech_name && !selectedTechId && (
                                                                            <span className="bg-amber-200 text-amber-800 px-1.5 py-0.5 rounded text-[10px]">
                                                                                {job.assigned_tech_name}
                                                                            </span>
                                                                        )}
                                                                    </div>
                                                                );
                                                            })}
                                                        </div>
                                                    </div>
                                                )}

                                                {/* Time Slot Grid */}
                                                {!loadingOrgSchedule && (
                                                    <div>
                                                        <label className="block text-xs font-medium text-gray-600 mb-2">
                                                            Select Time — {format(scheduleDate, 'EEEE, MMM d')}
                                                            {estimatedDuration > 0 && (
                                                                <span className="text-gray-400 font-normal ml-1">
                                                                    (job duration: {estimatedDuration >= 60 ? `${Math.floor(estimatedDuration / 60)}h${estimatedDuration % 60 > 0 ? ` ${estimatedDuration % 60}m` : ''}` : `${estimatedDuration}m`})
                                                                </span>
                                                            )}
                                                            {orgTzLabel && (
                                                                <span className="text-blue-500 font-normal ml-1.5 bg-blue-50 px-1.5 py-0.5 rounded text-[10px]">
                                                                    {orgTzLabel}
                                                                </span>
                                                            )}
                                                        </label>
                                                        <div className="grid grid-cols-4 sm:grid-cols-6 gap-1.5">
                                                            {scheduleSlots.map(slot => {
                                                                const available = isScheduleSlotAvailable(slot);
                                                                const isSelected = scheduleTime === slot;
                                                                const [h] = slot.split(':').map(Number);
                                                                const isPastTime = isSameDay(scheduleDate, new Date()) && h < new Date().getHours();

                                                                return (
                                                                    <button
                                                                        key={slot}
                                                                        type="button"
                                                                        disabled={!available || isPastTime}
                                                                        onClick={() => handleSelectScheduleSlot(slot)}
                                                                        className={`
                                                                            relative px-2 py-2 rounded-lg text-xs font-medium transition-all duration-150
                                                                            ${isSelected
                                                                                ? 'bg-blue-600 text-white ring-2 ring-blue-300 ring-offset-1 shadow-lg scale-105'
                                                                                : available && !isPastTime
                                                                                    ? 'bg-green-50 text-green-700 border border-green-200 hover:bg-green-100 hover:border-green-400 hover:shadow-sm cursor-pointer'
                                                                                    : 'bg-gray-100 text-gray-400 border border-gray-200 cursor-not-allowed line-through'
                                                                            }
                                                                        `}
                                                                    >
                                                                        {(() => {
                                                                            const [hh, mm] = slot.split(':').map(Number);
                                                                            const ampm = hh >= 12 ? 'PM' : 'AM';
                                                                            const h12 = hh > 12 ? hh - 12 : hh === 0 ? 12 : hh;
                                                                            return `${h12}:${mm.toString().padStart(2, '0')} ${ampm}`;
                                                                        })()}
                                                                        {isSelected && (
                                                                            <CheckCircle2 className="absolute -top-1 -right-1 w-4 h-4 text-white bg-blue-600 rounded-full" />
                                                                        )}
                                                                    </button>
                                                                );
                                                            })}
                                                        </div>
                                                    </div>
                                                )}

                                                {/* Confirmation Banner */}
                                                {scheduleConfirmed && scheduleTime && (
                                                    <div className="bg-green-50 border border-green-300 rounded-lg p-4">
                                                        <div className="flex items-start gap-3">
                                                            <CheckCircle2 className="w-5 h-5 text-green-600 mt-0.5 flex-shrink-0" />
                                                            <div>
                                                                <p className="text-sm font-semibold text-green-800">
                                                                    Appointment: {format(scheduleDate, 'EEEE, MMMM d')} at{' '}
                                                                    {(() => {
                                                                        const [hh, mm] = scheduleTime.split(':').map(Number);
                                                                        const ampm = hh >= 12 ? 'PM' : 'AM';
                                                                        const h12 = hh > 12 ? hh - 12 : hh === 0 ? 12 : hh;
                                                                        return `${h12}:${mm.toString().padStart(2, '0')} ${ampm}`;
                                                                    })()}
                                                                </p>
                                                                {selectedTechName && (
                                                                    <p className="text-xs text-green-700 mt-0.5 flex items-center gap-1">
                                                                        <User className="w-3 h-3" /> Assigned to {selectedTechName}
                                                                    </p>
                                                                )}
                                                                <div className="flex items-center gap-3 mt-2 text-xs text-green-600">
                                                                    {email && (
                                                                        <span className="flex items-center gap-1">
                                                                            <Send className="w-3 h-3" /> Email confirmation will be sent
                                                                        </span>
                                                                    )}
                                                                    {phone && (
                                                                        <span className="flex items-center gap-1">
                                                                            <Send className="w-3 h-3" /> SMS confirmation will be sent
                                                                        </span>
                                                                    )}
                                                                    {!email && !phone && (
                                                                        <span className="text-amber-600">No email or phone — customer won't be notified</span>
                                                                    )}
                                                                </div>
                                                            </div>
                                                        </div>
                                                    </div>
                                                )}
                                            </>
                                        )}

                                        {!scheduleDate && (
                                            <p className="text-xs text-gray-400 text-center py-4">
                                                Select a date above to see available time slots
                                            </p>
                                        )}
                                    </div>
                                ) : (
                                    /* ── Availability Windows Mode (legacy) ── */
                                    <div>
                                        <label className="block text-xs font-medium text-gray-600 mb-2">Select 3-5 preferred windows</label>
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
                                                    {scheduleSlots.map(time => (
                                                        <option key={time} value={time}>{time}</option>
                                                    ))}
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
                                )}
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
                    className={`w-full py-3 px-4 rounded-lg text-white font-bold flex items-center justify-center gap-2 transition-colors ${
                        loading
                            ? 'bg-gray-400 cursor-not-allowed'
                            : schedulingMode === 'schedule_now' && scheduleConfirmed
                                ? 'bg-green-600 hover:bg-green-700'
                                : 'bg-blue-600 hover:bg-blue-700'
                    }`}
                >
                    {loading ? (
                        <><Loader2 className="w-4 h-4 animate-spin" /> Creating...</>
                    ) : schedulingMode === 'schedule_now' && scheduleConfirmed ? (
                        <><CalendarCheck className="w-4 h-4" /> Schedule & Notify Customer</>
                    ) : (
                        'Submit Request'
                    )}
                </button>
            </form>
        </div>
    );
};
