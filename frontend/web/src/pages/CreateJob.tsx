import React, { useState, useEffect } from 'react';
import DatePicker from 'react-datepicker';
import "react-datepicker/dist/react-datepicker.css";
import { db, functions } from '../firebase';
import { collection, addDoc, serverTimestamp, query, where, getDocs, Timestamp, doc, getDoc, updateDoc } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { uploadFile } from '../lib/storage';
import { sendEmail } from '../lib/notifications';
import { useAuth } from '../auth/AuthProvider';
import { useNavigate, Link, useParams, useSearchParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import { OnboardingSetupGuide } from '../components/OnboardingSetupGuide';
import { Job, JobCategory, JOB_CATEGORIES } from '../types';
import { resolveTimezoneFromAddress, getTimezoneAbbr } from '../lib/timezoneUtils';
import { isSameDay, addMinutes, format, addDays, addWeeks, addMonths, startOfDay, setHours, setMinutes as setDateMinutes } from 'date-fns';
import {
    Wrench, Settings, Package, Search, Users, AlertTriangle, Shield, HelpCircle,
    Sparkles, Loader2, Brain, Clock, DollarSign, ShieldAlert, Gauge, ChevronDown,
    ChevronUp, CheckCircle2, Zap, ListChecks, Truck, Plus, Minus, Pencil,
    CalendarDays, MapPin, Send, ToggleLeft, CalendarCheck, User, Store, ExternalLink,
    RefreshCw, ArrowLeft, ArrowRight, FileText, Eye, Layers, Image as ImageIcon, X
} from 'lucide-react';
import { MaterialLookupModal, SelectedMaterialResult } from '../components/inventory/MaterialLookupModal';
import { sanitizeForFirestore } from '../lib/aiQuoteGenerator';
import { getCanonicalMaterialKey } from '../lib/materialUtils';
import { getVendorStockDetails, isLocalVendor } from '../utils/vendorStock';
import { RichVendorDropdown } from '../components/RichVendorDropdown';
import { inferJobCategory, InferredCategoryResult } from '../utils/callTypeInference';

interface AIEstimate {
    diagnosis: string;
    solution: string;
    partsNeeded: Array<{ name: string; estimatedCost?: number; quantity?: number }>;
    toolsNeeded?: string[];
    estimatedDuration: number;
    confidence: number;
    safetyWarnings?: string[];
    jobClassification?: {
        jobType?: string;
        tradeCategory?: string;
        primaryItem?: string;
    };
}

interface AlternateVendor {
    vendorId: string;
    vendorName: string;
    unitCost: number;
    vendorProductUrl?: string;
    vendorProductTitle?: string;
    estimatedDeliveryDays?: number;
    stockQuantity?: number;
    isLocalVendor?: boolean;
}

interface EditablePart {
    id: string;
    name: string;
    quantity: number;
    baseCost: number;
    markupPercent: number;
    customerPrice: number;
    // Vendor attribution (populated from AI inventory match)
    priceSource?: 'vendor' | 'inventory' | 'ai_estimate';
    vendorName?: string;
    vendorProductUrl?: string;
    vendorProductTitle?: string;
    materialId?: string;
    stockQuantity?: number;
    alternateVendors?: AlternateVendor[];
}

interface CostSummary {
    estimatedMaterialCost: number;
    estimatedLaborMinutes: number;
    partsCount: number;
}

export const CreateJob: React.FC = () => {
    const { user, organization } = useAuth();
    const navigate = useNavigate();
    const { orgSlug } = useParams<{ orgSlug?: string }>();
    const [searchParams] = useSearchParams();
    const quoteId = searchParams.get('quoteId');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [showSetupGuide, setShowSetupGuide] = useState(false);

    // Org rate card values
    const hourlyRate = organization?.rateCard?.baseHourlyRate ?? 100;
    const materialMarkup = organization?.rateCard?.materialMarkup ?? 30;
    const orgDriveTimeCharge = organization?.rateCard?.driveTimeCharge ?? organization?.rateCard?.driveTimeCost ?? 0;
    const orgDefaultDriveTimeMinutes = organization?.rateCard?.defaultDriveTimeMinutes ?? organization?.settings?.defaultDriveTimeMinutes ?? 0;

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
    const [categoryManuallySet, setCategoryManuallySet] = useState(false);
    const [inferredCategoryInfo, setInferredCategoryInfo] = useState<InferredCategoryResult | null>(null);

    // Automatically infer / assume Job Category based on description text & photos
    useEffect(() => {
        if (!categoryManuallySet) {
            const result = inferJobCategory(description, photos, aiEstimate?.jobClassification);
            setJobCategory(result.category);
            setInferredCategoryInfo(result);
        }
    }, [description, photos, categoryManuallySet]);

    const handleCategoryChange = (cat: JobCategory) => {
        setJobCategory(cat);
        setCategoryManuallySet(true);
    };

    const handleResetAutoCategory = () => {
        setCategoryManuallySet(false);
        const result = inferJobCategory(description, photos, aiEstimate?.jobClassification);
        setJobCategory(result.category);
        setInferredCategoryInfo(result);
        toast.success(`Reset to assumed: ${result.category}`);
    };
    const [isRecurring, setIsRecurring] = useState(false);
    const [recurringFrequency, setRecurringFrequency] = useState<'weekly' | 'biweekly' | 'monthly' | 'quarterly'>('monthly');

    // Form Layout Mode: Configured in Settings > Navigation & Layout (express | stepper | split)
    const initialUxOption = (
        (searchParams.get('layout') as 'express' | 'stepper' | 'split') ||
        organization?.settings?.createJobLayout ||
        organization?.layoutSettings?.createJobLayout ||
        (localStorage.getItem('dispatchbox_create_job_layout') as 'express' | 'stepper' | 'split') ||
        'express'
    );
    const [uxOption, setUxOption] = useState<'express' | 'stepper' | 'split'>(initialUxOption);

    useEffect(() => {
        const layoutParam = searchParams.get('layout') as 'express' | 'stepper' | 'split' | null;
        if (layoutParam && ['express', 'stepper', 'split'].includes(layoutParam)) {
            setUxOption(layoutParam);
            return;
        }
        const orgLayout = organization?.settings?.createJobLayout || organization?.layoutSettings?.createJobLayout;
        if (orgLayout && ['express', 'stepper', 'split'].includes(orgLayout)) {
            setUxOption(orgLayout);
        } else {
            const localLayout = localStorage.getItem('dispatchbox_create_job_layout') as 'express' | 'stepper' | 'split' | null;
            if (localLayout && ['express', 'stepper', 'split'].includes(localLayout)) {
                setUxOption(localLayout);
            }
        }
    }, [organization?.settings?.createJobLayout, organization?.layoutSettings?.createJobLayout, searchParams]);
    const [currentStep, setCurrentStep] = useState<number>(1);
    const [viewMode, setViewMode] = useState<'express' | 'full'>('express');
    const [existingCustomers, setExistingCustomers] = useState<Array<{ id: string; name: string; phone?: string; email?: string; address?: string; site_name?: string }>>([]);
    const [customerFilter, setCustomerFilter] = useState('');
    const [showCustomerDropdown, setShowCustomerDropdown] = useState(false);
    const [advancedSections, setAdvancedSections] = useState({
        ai: false,
        parts: false,
        scheduleAdv: false,
        recurring: false,
        settings: false
    });

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
    const [vendorPickerOpen, setVendorPickerOpen] = useState<string | null>(null); // part.id of open picker

    // Material Lookup Modal State
    const [isLookupModalOpen, setIsLookupModalOpen] = useState(false);
    const [lookupSearchTerm, setLookupSearchTerm] = useState('');
    const [orgVendors, setOrgVendors] = useState<{ id: string; name: string; website?: string }[]>([]);
    const [orgMaterials, setOrgMaterials] = useState<any[]>([]);

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
                const techs = snapshot.docs
                    .filter(doc => doc.data().archived !== true && doc.data().status !== 'archived')
                    .map(doc => ({
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

        // Fetch existing customers for autocomplete
        const fetchCustomers = async () => {
            try {
                const orgId = (user as any)?.org_id || 'demo-org';
                const q = query(collection(db, 'customers'), where('org_id', '==', orgId));
                const snap = await getDocs(q);
                const list = snap.docs.map(d => ({
                    id: d.id,
                    name: d.data().name || '',
                    phone: d.data().phone || '',
                    email: d.data().email || '',
                    address: d.data().address || '',
                    site_name: d.data().site_name || ''
                }));
                setExistingCustomers(list);
            } catch (err) {
                console.warn('Error fetching customers for autocomplete:', err);
            }
        };

        fetchCustomers();

        // Fetch organization vendors for parts vendor dropdown
        const fetchVendors = async () => {
            try {
                const orgId = (user as any)?.org_id || 'demo-org';
                let q = query(collection(db, 'vendors'), where('organizationId', '==', orgId));
                let snap = await getDocs(q);
                if (snap.empty) {
                    q = query(collection(db, 'vendors'), where('org_id', '==', orgId));
                    snap = await getDocs(q);
                }
                const list = snap.docs.map(doc => ({ id: doc.id, name: doc.data().name, website: doc.data().website }));
                list.sort((a, b) => a.name.localeCompare(b.name));
                setOrgVendors(list);
            } catch (err) {
                console.warn('Error fetching org vendors:', err);
            }
        };
        fetchVendors();

        // Fetch organization materials for pre-discovered suppliers and pricing
        const fetchMaterials = async () => {
            try {
                const orgId = (user as any)?.org_id || 'demo-org';
                let q = query(collection(db, 'materials'), where('org_id', '==', orgId));
                let snap = await getDocs(q);
                if (snap.empty) {
                    q = query(collection(db, 'materials'), where('organizationId', '==', orgId));
                    snap = await getDocs(q);
                }
                const list = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
                setOrgMaterials(list);
            } catch (err) {
                console.warn('Error fetching org materials:', err);
            }
        };
        fetchMaterials();
    }, [user]);

    // Load quote details if navigating from quote conversion (/jobs/new?quoteId=...)
    useEffect(() => {
        if (!quoteId) return;
        const loadQuoteData = async () => {
            try {
                const quoteSnap = await getDoc(doc(db, 'quotes', quoteId));
                if (quoteSnap.exists()) {
                    const qData = quoteSnap.data();
                    if (qData.customer) {
                        setCustomerName(qData.customer.name || '');
                        setPhone(qData.customer.phone || '');
                        setEmail(qData.customer.email || '');
                        setAddress(qData.customer.address || '');
                        setSiteName(qData.customer.siteName || '');
                    }
                    if (qData.scopeOfWork) {
                        setDescription(qData.scopeOfWork);
                    }
                    if (Array.isArray(qData.lineItems) && qData.lineItems.length > 0) {
                        const parts: EditablePart[] = qData.lineItems
                            .filter((item: any) => item.type === 'material' || !item.type)
                            .map((item: any) => ({
                                id: item.id || `part-${Date.now()}-${Math.random()}`,
                                name: item.description,
                                quantity: Number(item.quantity) || 1,
                                baseCost: (Number(item.unitPrice) || 0) * 0.7,
                                markupPercent: materialMarkup,
                                customerPrice: Number(item.unitPrice) || 0,
                                priceSource: 'inventory'
                            }));
                        if (parts.length > 0) {
                            setEditableParts(parts);
                        }
                    }
                    toast.success(`Loaded details from Quote #${qData.quoteNumber || quoteId.slice(0, 6)}`);
                }
            } catch (err) {
                console.error('Failed to load quote details for job creation:', err);
            }
        };
        loadQuoteData();
    }, [quoteId, materialMarkup]);

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

        // Capture existing estimate for refinement context (if regenerating)
        const previousEstimate = aiEstimate ? {
            diagnosis: aiEstimate.diagnosis,
            solution: aiEstimate.solution,
            partsNeeded: editableParts.map(p => ({ name: p.name, quantity: p.quantity, estimatedCost: p.baseCost })),
            estimatedDuration: estimatedDuration,
        } : undefined;

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
                customerName: customerName.trim() || undefined,
                previousEstimate,
            });

            const data = result.data as any;
            if (data?.success && data.recommendation) {
                setAiEstimate(data.recommendation);
                setCostSummary(data.costSummary || null);

                // Auto-refine Job Category based on AI recommendation if user hasn't manually locked it
                if (!categoryManuallySet && data.recommendation.jobClassification) {
                    const aiResult = inferJobCategory(description, photos, data.recommendation.jobClassification);
                    setJobCategory(aiResult.category);
                    setInferredCategoryInfo(aiResult);
                }

                // Build editable parts with markup applied (deduplicated by material name)
                const rawPartsList = data.recommendation.partsNeeded || [];
                const partsMap = new Map<string, any>();
                for (const p of rawPartsList) {
                    if (!p || !p.name) continue;
                    const normKey = getCanonicalMaterialKey(p.name);
                    if (!normKey) continue;
                    if (partsMap.has(normKey)) {
                        const existing = partsMap.get(normKey);
                        existing.quantity = Math.max(Number(existing.quantity) || 1, Number(p.quantity) || 1);
                    } else {
                        partsMap.set(normKey, { ...p });
                    }
                }
                const deduplicatedPartsList = Array.from(partsMap.values());

                const parts: EditablePart[] = deduplicatedPartsList.map((p: any, i: number) => {
                    const pNorm = (p.name || '').toLowerCase().replace(/[^a-z0-9]/g, '');
                    const matchedMat = orgMaterials.find((m: any) => {
                        const mNorm = (m.name || '').toLowerCase().replace(/[^a-z0-9]/g, '');
                        return mNorm === pNorm || (mNorm.length >= 4 && pNorm.includes(mNorm)) || (pNorm.length >= 4 && mNorm.includes(pNorm));
                    });

                    let alternates: AlternateVendor[] | undefined = p.alternateVendors;
                    let initialVendorName = p.vendorName;
                    let initialProductUrl = p.vendorProductUrl;
                    let initialProductTitle = p.vendorProductTitle;
                    let base = p.estimatedCost || 0;

                    if ((!alternates || alternates.length === 0) && matchedMat?.vendors && matchedMat.vendors.length > 0) {
                        const vList: AlternateVendor[] = matchedMat.vendors
                            .filter((v: any) => v.unitCost != null && v.unitCost > 0)
                            .map((v: any) => ({
                                vendorId: v.vendorId || v.vendorName,
                                vendorName: v.vendorName,
                                unitCost: v.unitCost,
                                vendorProductUrl: v.vendorProductUrl,
                                vendorProductTitle: v.vendorProductTitle,
                                stockQuantity: v.stockQuantity,
                                isLocalVendor: v.isLocalVendor,
                            }));

                        if (vList.length > 0) {
                            alternates = vList;
                            if (!initialVendorName) {
                                const preferred = vList[0];
                                initialVendorName = preferred.vendorName;
                                base = preferred.unitCost;
                                initialProductUrl = preferred.vendorProductUrl;
                                initialProductTitle = preferred.vendorProductTitle;
                            }
                        }
                    }

                    const qty = p.quantity || 1;
                    const price = Math.round(base * (1 + materialMarkup / 100) * 100) / 100;
                    return {
                        id: `part-${Date.now()}-${i}`,
                        name: p.name,
                        quantity: qty,
                        baseCost: base,
                        markupPercent: materialMarkup,
                        customerPrice: price,
                        // Vendor attribution from inventory match
                        priceSource: initialVendorName ? 'vendor' : p.priceSource,
                        vendorName: initialVendorName,
                        vendorProductUrl: initialProductUrl,
                        vendorProductTitle: initialProductTitle,
                        materialId: p.materialId || matchedMat?.id,
                        alternateVendors: alternates,
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

    const handleSubmit = async (e: React.FormEvent, goToQuote: boolean = false) => {
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
                const recurringRef = await addDoc(collection(db, 'recurring_schedules'), sanitizeForFirestore(recurringData));
                jobData.recurring_schedule_id = recurringRef.id;
            }

            if (quoteId) {
                jobData.active_quote_id = quoteId;
            }

            console.log("Job data:", jobData);
            const jobRef = await addDoc(jobsRef, sanitizeForFirestore(jobData));
            console.log("Job document saved:", jobRef.id);

            // Link quote to the newly created job if converting from a quote
            if (quoteId) {
                try {
                    await updateDoc(doc(db, 'quotes', quoteId), {
                        job_id: jobRef.id,
                        status: 'approved',
                        updatedAt: serverTimestamp()
                    });
                } catch (linkErr) {
                    console.error("Failed to link quote to job:", linkErr);
                }
            }

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

            toast.success('Job created successfully!');
            if (goToQuote) {
                navigate(`/quotes/new?jobId=${jobRef.id}`);
            } else {
                navigate(`/jobs/${jobRef.id}`);
            }
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

    const switchVendor = (partId: string, vendor: AlternateVendor) => {
        setEditableParts(prev => prev.map(p => {
            if (p.id !== partId) return p;
            // Build updated alternates: remove the selected vendor, add the current one
            const updatedAlternates = (p.alternateVendors || [])
                .filter(v => v.vendorName !== vendor.vendorName && v.vendorId !== vendor.vendorId);
            if (p.vendorName && p.baseCost > 0) {
                updatedAlternates.unshift({
                    vendorId: p.vendorName,
                    vendorName: p.vendorName,
                    unitCost: p.baseCost,
                    vendorProductUrl: p.vendorProductUrl,
                    vendorProductTitle: p.vendorProductTitle,
                    isLocalVendor: isLocalVendor(p.vendorName),
                });
            }
            const newPrice = Math.round(vendor.unitCost * (1 + p.markupPercent / 100) * 100) / 100;
            return {
                ...p,
                baseCost: vendor.unitCost,
                customerPrice: newPrice,
                vendorName: vendor.vendorName,
                vendorProductUrl: vendor.vendorProductUrl,
                vendorProductTitle: vendor.vendorProductTitle,
                stockQuantity: vendor.stockQuantity,
                priceSource: 'vendor' as const,
                alternateVendors: updatedAlternates.length > 0 ? updatedAlternates : undefined,
            };
        }));
    };

    const handleVendorSelect = (partId: string, value: string) => {
        const part = editableParts.find(p => p.id === partId);
        if (!part) return;

        if (value === 'SEARCH_CATALOG') {
            setLookupSearchTerm(part.name);
            setIsLookupModalOpen(true);
            return;
        }

        const vendorKey = value.startsWith('ALT:') ? value.replace('ALT:', '') : value.startsWith('SEARCH:') ? value.replace('SEARCH:', '') : value;

        // 1. Direct match in part.alternateVendors
        const altMatch = (part.alternateVendors || []).find(v => v.vendorId === vendorKey || v.vendorName === vendorKey);
        if (altMatch) {
            switchVendor(partId, altMatch);
            return;
        }

        // 2. Look up in orgMaterials for this vendor
        const pNorm = (part.name || '').toLowerCase().replace(/[^a-z0-9]/g, '');
        const matchedMat = orgMaterials.find((m: any) => {
            const mNorm = (m.name || '').toLowerCase().replace(/[^a-z0-9]/g, '');
            return mNorm === pNorm || (mNorm.length >= 4 && pNorm.includes(mNorm)) || (pNorm.length >= 4 && mNorm.includes(pNorm));
        });

        const matVendor = matchedMat?.vendors?.find((v: any) => v.vendorName === vendorKey || v.vendorId === vendorKey);
        if (matVendor && matVendor.unitCost > 0) {
            switchVendor(partId, {
                vendorId: matVendor.vendorId || matVendor.vendorName,
                vendorName: matVendor.vendorName,
                unitCost: matVendor.unitCost,
                vendorProductUrl: matVendor.vendorProductUrl,
                vendorProductTitle: matVendor.vendorProductTitle,
                stockQuantity: matVendor.stockQuantity,
                isLocalVendor: matVendor.isLocalVendor,
            });
            return;
        }

        // 3. Fallback: assign vendor name directly
        setEditableParts(prev => prev.map(p => p.id === partId ? { ...p, vendorName: vendorKey } : p));
    };

    // ── Computed totals ──────────────────────────────────────────────────
    const materialsSubtotal = editableParts.reduce((sum, p) => sum + (p.customerPrice * p.quantity), 0);
    const laborSubtotal = laborHours * laborRate;
    const driveTimeSubtotal = driveTimeEnabled ? driveTimeAmount : 0;
    const grandTotal = materialsSubtotal + laborSubtotal + driveTimeSubtotal;

    const canGenerateEstimate = description.trim().length >= 10;

    const renderLiveWorkOrderPreview = () => (
        <div className="sticky top-6 bg-gradient-to-b from-slate-900 via-gray-900 to-slate-950 text-white rounded-3xl p-6 shadow-2xl border border-slate-800 space-y-5">
            <div className="flex items-center justify-between border-b border-white/10 pb-4">
                <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-xl bg-blue-600 flex items-center justify-center font-bold text-white shadow-xs">
                        ⚡
                    </div>
                    <div>
                        <h3 className="text-xs font-bold uppercase tracking-wider text-blue-400">Live Work Order</h3>
                        <p className="text-[11px] text-gray-400">{organization?.name || 'DispatchBox'} Service Request</p>
                    </div>
                </div>
                <span className={`px-2.5 py-1 rounded-full text-[11px] font-bold uppercase tracking-wider ${
                    schedulingMode === 'schedule_now' && scheduleDate && scheduleTime
                        ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                        : 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                }`}>
                    {schedulingMode === 'schedule_now' && scheduleDate && scheduleTime ? 'Ready to Book' : 'Draft / Unscheduled'}
                </span>
            </div>

            {/* Customer Tile */}
            <div className="p-3.5 bg-white/5 rounded-2xl border border-white/10">
                <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-1">Customer & Location</p>
                <p className="text-sm font-bold text-white">{customerName || 'Customer Name Not Entered'}</p>
                <div className="text-xs text-gray-300 space-y-0.5 mt-1">
                    {phone && <p>📞 {phone}</p>}
                    {address && <p>📍 {address}</p>}
                    {email && <p>✉️ {email}</p>}
                </div>
            </div>

            {/* Scope of Work */}
            <div className="p-3.5 bg-white/5 rounded-2xl border border-white/10">
                <div className="flex items-center justify-between mb-1">
                    <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Service Scope</p>
                    <span className="text-xs font-semibold px-2 py-0.5 rounded-lg bg-blue-500/20 text-blue-300 capitalize">
                        {jobCategory}
                    </span>
                </div>
                <p className="text-xs text-gray-200 line-clamp-3">
                    {description || 'Enter job description on the left to see live scope summary...'}
                </p>
                <div className="flex items-center gap-3 mt-2 text-[11px] text-gray-400">
                    <span>⏱️ Duration: {estimatedDuration} min</span>
                    <span>⚡ Priority: <strong className="capitalize text-gray-200">{priority}</strong></span>
                </div>
            </div>

            {/* Schedule Tile */}
            <div className="p-3.5 bg-white/5 rounded-2xl border border-white/10">
                <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-1">Appointment & Technician</p>
                {schedulingMode === 'schedule_now' && scheduleDate && scheduleTime ? (
                    <div className="text-xs text-emerald-300 space-y-0.5 font-medium">
                        <p>📅 {format(scheduleDate, 'EEEE, MMMM d, yyyy')}</p>
                        <p>⏰ Slot: {scheduleTime}</p>
                        {selectedTechName && <p>👤 Assigned: <strong>{selectedTechName}</strong></p>}
                    </div>
                ) : (
                    <p className="text-xs text-amber-300/90 font-medium">
                        {schedulingMode === 'availability' ? 'Customer availability windows requested' : 'Select a date and time slot'}
                    </p>
                )}
            </div>

            {/* Pricing Summary */}
            <div className="p-3.5 bg-white/5 rounded-2xl border border-white/10">
                <div className="flex items-center justify-between text-xs text-gray-400 mb-1">
                    <span>Estimated Materials ({editableParts.length}):</span>
                    <span className="text-gray-200 font-medium">${materialsSubtotal.toFixed(2)}</span>
                </div>
                <div className="flex items-center justify-between text-xs text-gray-400 mb-1">
                    <span>Labor ({laborHours}h @ ${laborRate}/hr):</span>
                    <span className="text-gray-200 font-medium">${laborSubtotal.toFixed(2)}</span>
                </div>
                {driveTimeEnabled && driveTimeAmount > 0 && (
                    <div className="flex items-center justify-between text-xs text-gray-400 mb-1">
                        <span>Drive Time / Travel:</span>
                        <span className="text-gray-200 font-medium">${driveTimeAmount.toFixed(2)}</span>
                    </div>
                )}
                <div className="flex items-center justify-between text-sm font-bold text-white pt-2 border-t border-white/10 mt-2">
                    <span>Estimated Total:</span>
                    <span className="text-emerald-400 text-base font-extrabold">${grandTotal.toFixed(2)}</span>
                </div>
            </div>

            {/* Direct 1-Click Action Button on Preview */}
            <button
                type="button"
                disabled={loading}
                onClick={handleSubmit}
                className={`w-full py-3 px-4 rounded-xl text-white font-bold text-sm flex items-center justify-center gap-2 shadow-lg transition-all ${
                    loading
                        ? 'bg-gray-600 cursor-not-allowed'
                        : schedulingMode === 'schedule_now' && scheduleDate && scheduleTime
                            ? 'bg-emerald-600 hover:bg-emerald-500 text-white'
                            : 'bg-blue-600 hover:bg-blue-500 text-white'
                }`}
            >
                {loading ? (
                    <><Loader2 className="w-4 h-4 animate-spin" /> Booking...</>
                ) : (
                    <><CalendarCheck className="w-4 h-4" /> Book & Confirm Work Order</>
                )}
            </button>
        </div>
    );

    return (
        <div className={`p-4 sm:p-8 mx-auto pb-12 ${uxOption === 'split' ? 'max-w-7xl' : 'max-w-3xl'}`}>
            {/* Stepper Progress Bar (Option 2) */}
            {uxOption === 'stepper' && (
                <div className="mb-6 bg-white p-4 rounded-2xl border border-gray-200/80 shadow-xs">
                    <div className="grid grid-cols-4 gap-2 text-center">
                        {[
                            { num: 1, label: 'Customer', icon: User },
                            { num: 2, label: 'Scope & AI', icon: Sparkles },
                            { num: 3, label: 'Schedule & Tech', icon: Clock },
                            { num: 4, label: 'Review & Book', icon: CheckCircle2 }
                        ].map(step => {
                            const Icon = step.icon;
                            const isCurrent = currentStep === step.num;
                            const isPassed = currentStep > step.num;
                            return (
                                <button
                                    key={step.num}
                                    type="button"
                                    onClick={() => setCurrentStep(step.num)}
                                    className={`flex flex-col items-center py-2 rounded-xl transition-all ${
                                        isCurrent
                                            ? 'bg-blue-50 text-blue-600 font-bold border-2 border-blue-500'
                                            : isPassed
                                                ? 'text-emerald-600 font-semibold'
                                                : 'text-gray-400'
                                    }`}
                                >
                                    <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs mb-1 ${
                                        isCurrent ? 'bg-blue-600 text-white' : isPassed ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-500'
                                    }`}>
                                        {isPassed ? '✓' : step.num}
                                    </div>
                                    <span className="text-[11px] hidden sm:inline">{step.label}</span>
                                </button>
                            );
                        })}
                    </div>
                </div>
            )}

            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
                <div>
                    <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">New Service Job</h1>
                    <p className="text-sm text-gray-500 mt-0.5">Quickly book and dispatch a customer service request</p>
                </div>
            </div>

            {error && (
                <div className="p-4 bg-red-50 border border-red-200 text-red-700 rounded-xl mb-6 text-sm flex items-center gap-2">
                    <AlertTriangle size={18} className="text-red-500 shrink-0" />
                    {error}
                </div>
            )}

            <div className={uxOption === 'split' ? 'grid grid-cols-1 lg:grid-cols-12 gap-8 items-start' : ''}>
                <div className={uxOption === 'split' ? 'lg:col-span-7' : ''}>
                    <form onSubmit={handleSubmit} className="space-y-6">

                {/* 1. Customer Details */}
                {(uxOption !== 'stepper' || currentStep === 1) && (
                    <div className="bg-white p-6 rounded-2xl border border-gray-200/80 shadow-xs relative">
                        <div className="flex items-center justify-between mb-4">
                            <div className="flex items-center gap-2">
                                <User className="w-5 h-5 text-blue-600" />
                                <h2 className="text-lg font-bold text-gray-900">Customer & Site Information</h2>
                            </div>
                            {existingCustomers.length > 0 && (
                                <span className="text-xs text-gray-400">
                                    {existingCustomers.length} saved customer{existingCustomers.length !== 1 ? 's' : ''}
                                </span>
                            )}
                        </div>

                        {/* Customer Autocomplete Search */}
                        {existingCustomers.length > 0 && (
                            <div className="mb-4 relative">
                                <label className="block text-xs font-semibold text-gray-500 mb-1">
                                    Quick Search Saved Customers
                                </label>
                                <div className="relative">
                                    <Search className="w-4 h-4 text-gray-400 absolute left-3 top-3 pointer-events-none" />
                                    <input
                                        type="text"
                                        placeholder="Search by customer name, phone, or address..."
                                        value={customerFilter}
                                        onChange={(e) => {
                                            setCustomerFilter(e.target.value);
                                            setShowCustomerDropdown(true);
                                        }}
                                        onFocus={() => setShowCustomerDropdown(true)}
                                        className="w-full pl-9 pr-4 py-2 border rounded-xl text-sm bg-gray-50/50 focus:bg-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors"
                                    />
                                </div>

                                {/* Dropdown Suggestions */}
                                {showCustomerDropdown && customerFilter.trim().length > 0 && (
                                    <div className="absolute z-30 left-0 right-0 mt-1 bg-white rounded-xl shadow-xl border border-gray-200 max-h-56 overflow-y-auto divide-y divide-gray-100">
                                        {existingCustomers
                                            .filter(c => 
                                                c.name.toLowerCase().includes(customerFilter.toLowerCase()) ||
                                                (c.phone && c.phone.includes(customerFilter)) ||
                                                (c.address && c.address.toLowerCase().includes(customerFilter.toLowerCase()))
                                            )
                                            .slice(0, 6)
                                            .map(cust => (
                                                <div
                                                    key={cust.id}
                                                    onClick={() => {
                                                        setCustomerName(cust.name);
                                                        if (cust.phone) setPhone(cust.phone);
                                                        if (cust.email) setEmail(cust.email);
                                                        if (cust.address) setAddress(cust.address);
                                                        if (cust.site_name) setSiteName(cust.site_name);
                                                        setShowCustomerDropdown(false);
                                                        setCustomerFilter('');
                                                        toast.success(`Loaded customer: ${cust.name}`);
                                                    }}
                                                    className="p-3 hover:bg-blue-50/70 cursor-pointer transition-colors text-left"
                                                >
                                                    <p className="text-sm font-bold text-gray-900">{cust.name}</p>
                                                    <div className="flex items-center gap-3 text-xs text-gray-500 mt-0.5">
                                                        {cust.phone && <span>📞 {cust.phone}</span>}
                                                        {cust.address && <span>📍 {cust.address}</span>}
                                                    </div>
                                                </div>
                                            ))}
                                    </div>
                                )}
                            </div>
                        )}

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <div>
                                <label className="block text-xs font-semibold text-gray-700 mb-1">
                                    Customer Name <span className="text-red-500">*</span>
                                </label>
                                <input
                                    type="text"
                                    required
                                    placeholder="Jane Doe"
                                    className="w-full border rounded-xl p-2.5 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                                    value={customerName}
                                    onChange={e => setCustomerName(e.target.value)}
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-semibold text-gray-700 mb-1">
                                    Phone Number <span className="text-red-500">*</span>
                                </label>
                                <input
                                    type="text"
                                    required
                                    className="w-full border rounded-xl p-2.5 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                                    placeholder="808-555-0123"
                                    value={phone}
                                    onChange={e => setPhone(e.target.value)}
                                />
                            </div>
                            <div className="sm:col-span-2">
                                <label className="block text-xs font-semibold text-gray-700 mb-1">Service Address <span className="text-red-500">*</span></label>
                                <input
                                    type="text"
                                    required
                                    placeholder="123 Main St, Honolulu, HI 96815"
                                    className="w-full border rounded-xl p-2.5 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                                    value={address}
                                    onChange={e => setAddress(e.target.value)}
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-semibold text-gray-700 mb-1">Email (Optional)</label>
                                <input
                                    type="email"
                                    className="w-full border rounded-xl p-2.5 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                                    placeholder="jane@example.com"
                                    value={email}
                                    onChange={e => setEmail(e.target.value)}
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-semibold text-gray-700 mb-1">Site / Unit Name (Optional)</label>
                                <input
                                    type="text"
                                    className="w-full border rounded-xl p-2.5 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                                    placeholder="e.g. Unit 4B / Main Office"
                                    value={siteName}
                                    onChange={e => setSiteName(e.target.value)}
                                />
                            </div>
                        </div>

                        {/* Stepper Step 1 Navigation Button */}
                        {uxOption === 'stepper' && (
                            <div className="flex justify-end pt-4 border-t border-gray-100 mt-6">
                                <button
                                    type="button"
                                    onClick={() => {
                                        if (!customerName.trim() || !address.trim()) {
                                            toast.error('Please enter customer name and service address');
                                            return;
                                        }
                                        setCurrentStep(2);
                                    }}
                                    className="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold text-sm flex items-center gap-2 shadow-xs transition"
                                >
                                    Continue to Scope & AI <ArrowRight size={16} />
                                </button>
                            </div>
                        )}
                    </div>
                )}

                {/* 2. Job Details & AI */}
                {(uxOption !== 'stepper' || currentStep === 2) && (
                    <div className="bg-white p-6 rounded-2xl border border-gray-200/80 shadow-xs">
                        <h2 className="text-xl font-semibold mb-4">Job Details</h2>
                    <div className="space-y-4">
                        {/* Description First */}
                        <div>
                            <div className="flex items-center justify-between mb-1">
                                <label className="block text-sm font-semibold text-gray-700">
                                    Job Description <span className="text-red-500">*</span>
                                </label>
                                <span className="text-xs text-gray-400">
                                    {description.length >= 10 ? '✓ Ready for AI estimate' : 'At least 10 chars for AI'}
                                </span>
                            </div>
                            <textarea
                                required
                                placeholder="Describe the issue or service needed (e.g. replace 2 shower heads, leaking valve under kitchen sink, routine AC tune-up)..."
                                className="block w-full border border-gray-300 rounded-xl p-3 h-28 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm transition shadow-2xs resize-y"
                                value={description}
                                onChange={e => setDescription(e.target.value)}
                            />

                            {/* Photo / Image Attachments */}
                            <div className="mt-2.5 flex items-center justify-between flex-wrap gap-2">
                                <div className="flex items-center gap-2 flex-wrap">
                                    <label className="cursor-pointer inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-dashed border-gray-300 hover:border-blue-500 hover:bg-blue-50/50 text-xs font-semibold text-gray-700 transition">
                                        <Plus className="w-3.5 h-3.5 text-blue-600" />
                                        <ImageIcon className="w-3.5 h-3.5 text-blue-500" />
                                        <span>Attach Photos (Optional)</span>
                                        <input
                                            type="file"
                                            multiple
                                            accept="image/*"
                                            className="hidden"
                                            onChange={handleFileChange}
                                        />
                                    </label>
                                    {photos.map((file, idx) => (
                                        <div key={idx} className="flex items-center gap-1 bg-blue-50 border border-blue-200 text-blue-800 pl-2 pr-1.5 py-1 rounded-lg text-xs font-medium">
                                            <ImageIcon className="w-3 h-3 text-blue-600 shrink-0" />
                                            <span className="max-w-[120px] truncate">{file.name}</span>
                                            <button
                                                type="button"
                                                onClick={() => setPhotos(prev => prev.filter((_, i) => i !== idx))}
                                                className="text-blue-400 hover:text-red-600 p-0.5 rounded ml-0.5"
                                                title="Remove photo"
                                            >
                                                <X className="w-3 h-3" />
                                            </button>
                                        </div>
                                    ))}
                                </div>
                                <span className="text-[11px] text-gray-400">
                                    {photos.length > 0 ? `${photos.length} photo(s) attached` : 'Photos help refine the assumed call type'}
                                </span>
                            </div>
                        </div>

                        {/* Compact Metadata Row: Job Type (Dropdown + Assumed Badge), Priority, Duration */}
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5 pt-1">
                            {/* Job Type Dropdown */}
                            <div>
                                <div className="flex items-center justify-between mb-1">
                                    <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider">
                                        Job Type
                                    </label>
                                    {!categoryManuallySet ? (
                                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-violet-100 text-violet-700 border border-violet-200">
                                            <Sparkles className="w-2.5 h-2.5 text-violet-600" />
                                            Assumed
                                        </span>
                                    ) : (
                                        <button
                                            type="button"
                                            onClick={handleResetAutoCategory}
                                            className="text-[10px] text-blue-600 hover:text-blue-800 font-semibold inline-flex items-center gap-0.5 hover:underline"
                                            title="Reset to automatic assumption from description/photos"
                                        >
                                            <RefreshCw className="w-2.5 h-2.5" /> Auto-detect
                                        </button>
                                    )}
                                </div>
                                <select
                                    value={jobCategory}
                                    onChange={(e) => handleCategoryChange(e.target.value as JobCategory)}
                                    className="w-full border border-gray-300 rounded-xl p-2.5 text-sm bg-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500 font-medium text-gray-800 shadow-2xs"
                                >
                                    <option value="repair">🔧 Repair (Fix leak, damage, issue)</option>
                                    <option value="installation">📦 Installation / Replacement</option>
                                    <option value="maintenance">⚙️ Maintenance (Tune-up, routine)</option>
                                    <option value="inspection">🔍 Inspection / Diagnostic</option>
                                    <option value="consultation">👥 Consultation / Estimate</option>
                                    <option value="emergency">⚠️ Emergency (Urgent / Flooding)</option>
                                    <option value="warranty">🛡️ Warranty Work (Rework / Claim)</option>
                                    <option value="other">❓ Other (General service)</option>
                                </select>
                                <p className="mt-1 text-[11px] text-gray-400 truncate" title={!categoryManuallySet && inferredCategoryInfo?.reason ? inferredCategoryInfo.reason : 'Changeable via dropdown'}>
                                    {!categoryManuallySet && inferredCategoryInfo?.reason
                                        ? inferredCategoryInfo.reason
                                        : 'Changeable via dropdown'}
                                </p>
                            </div>

                            {/* Priority */}
                            <div>
                                <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1">
                                    Priority
                                </label>
                                <select
                                    value={priority}
                                    onChange={(e) => setPriority(e.target.value as any)}
                                    className="w-full border border-gray-300 rounded-xl p-2.5 text-sm bg-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500 font-medium text-gray-800 shadow-2xs"
                                >
                                    <option value="low">🟢 Low — Can wait</option>
                                    <option value="medium">🔵 Medium — Standard</option>
                                    <option value="high">🟠 High — Urgent</option>
                                    <option value="critical">🔴 Critical — Emergency</option>
                                </select>
                                <p className="mt-1 text-[11px] text-gray-400">Urgency level</p>
                            </div>

                            {/* Estimated Duration */}
                            <div>
                                <div className="flex items-center justify-between mb-1">
                                    <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider">
                                        Duration
                                    </label>
                                    {aiEstimate && (
                                        <span className="inline-flex items-center gap-0.5 text-[10px] text-violet-700 font-bold bg-violet-100 px-1.5 py-0.5 rounded-full">
                                            <Sparkles className="w-2.5 h-2.5 text-violet-600" /> AI
                                        </span>
                                    )}
                                </div>
                                <select
                                    value={estimatedDuration}
                                    onChange={(e) => setEstimatedDuration(parseInt(e.target.value))}
                                    className={`w-full border rounded-xl p-2.5 text-sm bg-white focus:ring-2 focus:ring-blue-500 font-medium text-gray-800 shadow-2xs ${aiEstimate ? 'border-violet-300 ring-1 ring-violet-200' : 'border-gray-300'}`}
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
                                <p className="mt-1 text-[11px] text-gray-400">Approx. time needed</p>
                            </div>
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
                                            <div className="bg-white rounded-lg border border-gray-100">
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
                                                    <React.Fragment key={part.id}>
                                                    <div className="grid grid-cols-[1fr_50px_80px_65px_85px_32px] gap-1 px-3 py-1.5 items-center border-t border-gray-50 hover:bg-violet-50/30 transition-colors">
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
                                                     {/* Interactive Rich Vendor Selector Dropdown */}
                                                     <div className="px-3 pb-2 pt-0.5 border-b border-gray-100 flex items-center justify-between gap-2 bg-gray-50/40 text-xs">
                                                         <div className="flex items-center gap-2 flex-wrap py-0.5 relative">
                                                             <span className="text-gray-500 font-medium shrink-0">Vendor:</span>
                                                             <RichVendorDropdown
                                                                 activeVendorName={part.vendorName}
                                                                 activeBaseCost={part.baseCost}
                                                                 activeStockQuantity={part.stockQuantity}
                                                                 activeProductUrl={part.vendorProductUrl}
                                                                 activeProductTitle={part.vendorProductTitle}
                                                                 alternateVendors={part.alternateVendors}
                                                                 orgVendors={orgVendors}
                                                                 itemDescription={part.name}
                                                                 onSelectVendor={(val) => handleVendorSelect(part.id, val)}
                                                             />

                                                             {part.vendorProductUrl && (
                                                                 <a
                                                                     href={part.vendorProductUrl}
                                                                     target="_blank"
                                                                     rel="noopener noreferrer"
                                                                     className="text-blue-600 hover:text-blue-800 font-semibold inline-flex items-center gap-0.5 text-xs bg-white border border-blue-200 px-2 py-0.5 rounded shadow-sm"
                                                                     title={`View on ${part.vendorName || 'vendor website'}`}
                                                                 >
                                                                     View Product <ExternalLink className="w-3 h-3" />
                                                                 </a>
                                                             )}
                                                         </div>

                                                         <button
                                                             type="button"
                                                             onClick={() => {
                                                                 setLookupSearchTerm(part.name);
                                                                 setIsLookupModalOpen(true);
                                                             }}
                                                             className="text-[11px] text-blue-700 hover:text-blue-900 font-semibold shrink-0 hover:underline"
                                                         >
                                                             Look up parts ↗
                                                         </button>
                                                     </div>
                                                    </React.Fragment>
                                                ))}
                                                {/* Add part buttons */}
                                                <div className="px-3 py-2 border-t border-gray-100 flex items-center justify-between gap-2">
                                                    <button
                                                        type="button"
                                                        onClick={() => {
                                                            setLookupSearchTerm('');
                                                            setIsLookupModalOpen(true);
                                                        }}
                                                        className="text-xs bg-blue-50 text-blue-700 hover:bg-blue-100 px-2.5 py-1.5 rounded-lg font-semibold flex items-center gap-1.5 transition-colors border border-blue-200"
                                                    >
                                                        <Search className="w-3.5 h-3.5" /> Search & Add Material
                                                    </button>
                                                    <button
                                                        type="button"
                                                        onClick={addPart}
                                                        className="text-xs text-gray-600 hover:text-gray-800 font-medium flex items-center gap-1 transition-colors px-2 py-1"
                                                    >
                                                        <Plus className="w-3 h-3" /> Add Blank Part
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
                                                    <div className="px-3 py-2 bg-amber-50 border-t border-amber-200 flex flex-wrap items-center justify-between gap-2">
                                                        <p className="text-xs text-amber-800 flex items-center gap-1.5">
                                                            <AlertTriangle className="w-3.5 h-3.5 text-amber-600 flex-shrink-0" />
                                                            <span>No default travel fee set (Optional).</span>
                                                        </p>
                                                        <div className="flex items-center gap-3">
                                                            <Link
                                                                to={orgSlug ? `/${orgSlug}/settings?tab=financial&highlight=driveTimeCharge` : '/settings?tab=financial&highlight=driveTimeCharge'}
                                                                className="text-xs font-semibold text-blue-600 hover:text-blue-800 underline flex items-center gap-1"
                                                            >
                                                                <span>Configure in Settings → Financial → Rates & Taxes</span>
                                                                <ArrowRight className="w-3 h-3" />
                                                            </Link>
                                                            <span className="text-gray-300">|</span>
                                                            <button
                                                                type="button"
                                                                onClick={() => setShowSetupGuide(true)}
                                                                className="text-xs font-medium text-amber-700 hover:text-amber-900 underline"
                                                            >
                                                                Setup Guide
                                                            </button>
                                                        </div>
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



                        {/* Stepper Step 2 Navigation Buttons */}
                        {uxOption === 'stepper' && (
                            <div className="flex justify-between pt-4 border-t border-gray-100 mt-4">
                                <button
                                    type="button"
                                    onClick={() => setCurrentStep(1)}
                                    className="px-4 py-2 border border-gray-300 rounded-xl text-gray-700 font-semibold text-sm hover:bg-gray-50 flex items-center gap-2"
                                >
                                    <ArrowLeft size={16} /> Back to Customer
                                </button>
                                <button
                                    type="button"
                                    onClick={() => {
                                        if (!description.trim()) {
                                            toast.error('Please enter a brief job description');
                                            return;
                                        }
                                        setCurrentStep(3);
                                    }}
                                    className="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold text-sm flex items-center gap-2 shadow-xs transition"
                                >
                                    Continue to Scheduling <ArrowRight size={16} />
                                </button>
                            </div>
                        )}
                    </div>
                </div>
                )}

                {/* 3. Scheduling */}
                {(uxOption !== 'stepper' || currentStep === 3) && (
                    <div className="bg-white p-6 rounded-2xl border border-gray-200/80 shadow-xs space-y-4">
                        <div className="flex items-center gap-2 mb-2">
                            <Clock className="w-5 h-5 text-blue-600" />
                            <h2 className="text-lg font-bold text-gray-900">Appointment Scheduling & Technician</h2>
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

                        {/* Stepper Step 3 Navigation Buttons */}
                        {uxOption === 'stepper' && currentStep === 3 && (
                            <div className="flex justify-between pt-4 border-t border-gray-100 mt-4">
                                <button
                                    type="button"
                                    onClick={() => setCurrentStep(2)}
                                    className="px-4 py-2 border border-gray-300 rounded-xl text-gray-700 font-semibold text-sm hover:bg-gray-50 flex items-center gap-2"
                                >
                                    <ArrowLeft size={16} /> Back to Scope
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setCurrentStep(4)}
                                    className="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold text-sm flex items-center gap-2 shadow-xs transition"
                                >
                                    Continue to Final Review <ArrowRight size={16} />
                                </button>
                            </div>
                        )}
                    </div>
                )}

                {/* Stepper Step 4: Final Confirmation & Review Card */}
                {uxOption === 'stepper' && currentStep === 4 && (
                    <div className="space-y-4">
                        {renderLiveWorkOrderPreview()}
                        <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
                            <button
                                type="button"
                                onClick={() => setCurrentStep(3)}
                                className="px-4 py-2 border border-gray-300 rounded-xl text-gray-700 font-semibold text-sm hover:bg-gray-50 flex items-center gap-2"
                            >
                                <ArrowLeft size={16} /> Back to Scheduling
                            </button>
                            <div className="flex items-center gap-3">
                                <button
                                    type="button"
                                    disabled={loading}
                                    onClick={(e) => handleSubmit(e, true)}
                                    className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 text-white font-bold text-sm flex items-center gap-2 shadow-sm transition disabled:opacity-50"
                                >
                                    <Sparkles className="w-4 h-4" />
                                    Create Job & Generate AI Quote
                                </button>
                                <button
                                    type="button"
                                    disabled={loading}
                                    onClick={(e) => handleSubmit(e, false)}
                                    className={`px-6 py-2.5 rounded-xl text-white font-bold text-sm flex items-center gap-2 shadow-sm transition-all ${
                                        loading
                                            ? 'bg-gray-400 cursor-not-allowed'
                                            : schedulingMode === 'schedule_now' && scheduleDate && scheduleTime
                                                ? 'bg-emerald-600 hover:bg-emerald-700'
                                                : 'bg-blue-600 hover:bg-blue-700'
                                    }`}
                                >
                                    {loading ? (
                                        <><Loader2 className="w-4 h-4 animate-spin" /> Creating...</>
                                    ) : schedulingMode === 'schedule_now' && scheduleDate && scheduleTime ? (
                                        <><CalendarCheck className="w-4 h-4" /> Book & Schedule</>
                                    ) : (
                                        <><Send className="w-4 h-4" /> Create Job</>
                                    )}
                                </button>
                            </div>
                        </div>
                    </div>
                )}

                {/* Standard submit button for inline view */}
                {uxOption !== 'stepper' && (
                    <button
                        type="submit"
                        disabled={loading}
                        className={`w-full py-3.5 px-4 rounded-xl text-white font-bold flex items-center justify-center gap-2 transition-all shadow-sm ${
                            loading
                                ? 'bg-gray-400 cursor-not-allowed'
                                : schedulingMode === 'schedule_now' && scheduleDate && scheduleTime
                                    ? 'bg-emerald-600 hover:bg-emerald-700'
                                    : 'bg-blue-600 hover:bg-blue-700'
                        }`}
                    >
                        {loading ? (
                            <><Loader2 className="w-4 h-4 animate-spin" /> Creating Job...</>
                        ) : schedulingMode === 'schedule_now' && scheduleDate && scheduleTime ? (
                            <><CalendarCheck className="w-4 h-4" /> Book & Schedule Job</>
                        ) : (
                            <><Send className="w-4 h-4" /> Create Job Request</>
                        )}
                    </button>
                )}
                    </form>
                </div>

                {/* Right Column: Live Work Order Preview for Split-Pane Mode */}
                {uxOption === 'split' && (
                    <div className="lg:col-span-5 hidden lg:block">
                        {renderLiveWorkOrderPreview()}
                    </div>
                )}
            </div>

            {/* Material Lookup Modal */}
            <MaterialLookupModal
                isOpen={isLookupModalOpen}
                onClose={() => setIsLookupModalOpen(false)}
                initialSearchTerm={lookupSearchTerm}
                markupPercent={materialMarkup}
                onSelectMaterial={(selected: SelectedMaterialResult) => {
                    setEditableParts(prev => [
                        ...prev,
                        {
                            id: `part-${Date.now()}`,
                            name: selected.name,
                            quantity: 1,
                            baseCost: selected.baseCost,
                            markupPercent: materialMarkup,
                            customerPrice: selected.customerPrice,
                            vendorName: selected.vendorName,
                            vendorProductUrl: selected.vendorProductUrl,
                            materialId: selected.materialId,
                            priceSource: selected.vendorName ? 'vendor' : (selected.materialId ? 'inventory' : 'ai_estimate'),
                            alternateVendors: selected.alternateVendors,
                        }
                    ]);
                    toast.success(`Added ${selected.name} to job materials`);
                }}
            />
            {showSetupGuide && (
                <OnboardingSetupGuide onClose={() => setShowSetupGuide(false)} />
            )}
        </div>
    );
};
