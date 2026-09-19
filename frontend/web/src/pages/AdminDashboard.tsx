import React, { useEffect, useState, useMemo } from 'react';
import { db } from '../firebase';
import { collection, query, where, getDocs, onSnapshot, doc, updateDoc, addDoc, serverTimestamp, getDoc } from 'firebase/firestore';
import { Job, Invoice, UserProfile, PortalTicket, Quote, MaterialItem } from '../types';
import { SourcingStrategy } from '../types/Vendor';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import { useAuth } from '../auth/AuthProvider';
import { Link, useNavigate } from 'react-router-dom';
import {
    Plus, User, Mail, Phone, Wrench, Edit2, AlertTriangle, Clock,
    MessageSquareWarning, CheckCircle2, ArrowRight, MapPin, Send,
    FileText, UserPlus, X, Zap, PhoneCall, ExternalLink, Inbox, Sparkles, Globe, Briefcase, RefreshCw,
    Package, ShoppingCart, AlertCircle, Hammer, CalendarCheck
} from 'lucide-react';
import { AddTechnicianModal } from '../components/dispatcher/AddTechnicianModal';
import { EditTechnicianModal } from '../components/dispatcher/EditTechnicianModal';
import { InlineAIQuotePanel } from '../components/InlineAIQuotePanel';
import { CustomerPhotoStrip } from '../components/CustomerPhotoStrip';
import { TrackerBatteryAlertWidget } from '../components/inventory/TrackerBatteryAlertWidget';
import { SandboxAuditPanel } from '../components/SandboxAuditPanel';
import { OnboardingSetupGuide } from '../components/OnboardingSetupGuide';
import toast from 'react-hot-toast';

/* ── Time Ago Helper ── */
function timeAgo(date: Date): string {
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const mins = Math.floor(diffMs / 60000);
    if (mins < 1) return 'just now';
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    return `${days}d ago`;
}

export const AdminDashboard: React.FC = () => {
    const { user, organization } = useAuth();
    const navigate = useNavigate();
    const [loading, setLoading] = useState(true);
    const [showOnboardingModal, setShowOnboardingModal] = useState(false);

    const setupChecks = useMemo(() => {
        const checks = [
            { id: 'driveTime', ok: Number(organization?.rateCard?.driveTimeCharge) > 0 },
            { id: 'baseRate', ok: Number(organization?.rateCard?.baseHourlyRate) > 0 },
            { id: 'markup', ok: Number(organization?.rateCard?.materialMarkup) > 0 },
            { id: 'operatingHours', ok: organization?.settings?.operatingHoursStart !== undefined },
            { id: 'taxRate', ok: Number(organization?.settings?.defaultTaxRate) > 0 || (organization?.settings?.serviceLocations?.length || 0) > 0 },
            { id: 'companyInfo', ok: Boolean(organization?.name && organization?.name !== 'New Organization') },
            { id: 'sms', ok: Boolean(organization?.settings?.twilioPhone || organization?.settings?.smsConfig?.phoneNumber) },
            { id: 'stripe', ok: Boolean(organization?.settings?.stripeAccountId || organization?.settings?.stripeConnected) }
        ];
        const completed = checks.filter(c => c.ok).length;
        const total = checks.length;
        return { completed, total, isComplete: completed === total, percent: Math.round((completed / total) * 100) };
    }, [organization]);

    const [allJobs, setAllJobs] = useState<Job[]>([]);
    const [allQuotes, setAllQuotes] = useState<Quote[]>([]);
    const [invoices, setInvoices] = useState<Invoice[]>([]);
    const [unassignedJobs, setUnassignedJobs] = useState<Job[]>([]);
    const [technicians, setTechnicians] = useState<UserProfile[]>([]);
    const [isAddTechModalOpen, setIsAddTechModalOpen] = useState(false);
    const [isEditTechModalOpen, setIsEditTechModalOpen] = useState(false);
    const [selectedTech, setSelectedTech] = useState<UserProfile | null>(null);

    // ── Materials Inventory ──
    const [orgMaterials, setOrgMaterials] = useState<MaterialItem[]>([]);
    const [hoveredItemKey, setHoveredItemKey] = useState<string | null>(null);
    const [orgSourcingStrategy, setOrgSourcingStrategy] = useState<SourcingStrategy>('optimal');
    const [orgDefaultVendorId, setOrgDefaultVendorId] = useState('');

    // ── Customer Inquiries ──
    const [inquiries, setInquiries] = useState<PortalTicket[]>([]);
    const [dismissingId, setDismissingId] = useState<string | null>(null);
    const [convertingId, setConvertingId] = useState<string | null>(null);
    const [expandedInquiryId, setExpandedInquiryId] = useState<string | null>(null);
    const [reviewQuotes, setReviewQuotes] = useState<Quote[]>([]);

    const handleEditTech = (tech: UserProfile) => {
        setSelectedTech(tech);
        setIsEditTechModalOpen(true);
    };

    // ── Real-time listener for portal inquiries ──
    useEffect(() => {
        if (!user) return;
        const orgId = user.org_id || 'demo-org';

        const ticketsRef = collection(db, 'tickets');
        const q = query(
            ticketsRef,
            where('organizationId', '==', orgId),
            where('status', '==', 'PENDING')
        );

        const unsubscribe = onSnapshot(q, (snapshot) => {
            const tickets = snapshot.docs.map(d => ({
                id: d.id,
                ...d.data()
            } as PortalTicket));
            // Sort by newest first
            tickets.sort((a, b) => {
                const aTime = a.createdAt?.toDate?.() || new Date(0);
                const bTime = b.createdAt?.toDate?.() || new Date(0);
                return bTime.getTime() - aTime.getTime();
            });
            setInquiries(tickets);
        });

        return () => unsubscribe();
    }, [user]);

    // ── Real-time listener for quotes needing tech review ──
    useEffect(() => {
        if (!user) return;
        const orgId = user.org_id || 'demo-org';

        const quotesRef = collection(db, 'quotes');
        const q = query(
            quotesRef,
            where('org_id', '==', orgId),
            where('status', '==', 'tech_review')
        );

        const unsubscribe = onSnapshot(q, (snapshot) => {
            const quotes = snapshot.docs.map(d => ({
                id: d.id,
                ...d.data()
            } as Quote));
            quotes.sort((a, b) => {
                const aTime = a.updatedAt?.toDate?.() || a.createdAt?.toDate?.() || new Date(0);
                const bTime = b.updatedAt?.toDate?.() || b.createdAt?.toDate?.() || new Date(0);
                return bTime.getTime() - aTime.getTime();
            });
            setReviewQuotes(quotes);
        });

        return () => unsubscribe();
    }, [user]);

    // ── Real-time listener for all jobs ──
    useEffect(() => {
        if (!user) return;
        const orgId = user.org_id || 'demo-org';

        const q = query(collection(db, 'jobs'), where('org_id', '==', orgId));
        const unsubscribe = onSnapshot(q, (snapshot) => {
            const items = snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Job));
            setAllJobs(items);
            
            // Derive unassigned jobs list (status pending or unscheduled, not assigned, not archived)
            const unassigned = items.filter(j => 
                (j.status === 'pending' || j.status === 'unscheduled') && 
                !j.assigned_tech_id && 
                !j.archived
            );
            setUnassignedJobs(unassigned);
        }, (err) => {
            console.error("Error subscribing to jobs:", err);
        });

        return unsubscribe;
    }, [user]);

    // ── Real-time listener for all quotes ──
    useEffect(() => {
        if (!user) return;
        const orgId = user.org_id || 'demo-org';

        const q = query(collection(db, 'quotes'), where('org_id', '==', orgId));
        const unsubscribe = onSnapshot(q, (snapshot) => {
            const items = snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Quote));
            setAllQuotes(items);
        }, (err) => {
            console.error("Error subscribing to quotes:", err);
        });

        return unsubscribe;
    }, [user]);

    // ── Real-time listener for all invoices ──
    useEffect(() => {
        if (!user) return;
        const orgId = user.org_id || 'demo-org';

        const q = query(collection(db, 'invoices'), where('org_id', '==', orgId));
        const unsubscribe = onSnapshot(q, (snapshot) => {
            const items = snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Invoice));
            setInvoices(items);
            setLoading(false);
        }, (err) => {
            console.error("Error subscribing to invoices:", err);
            setLoading(false);
        });

        return unsubscribe;
    }, [user]);

    // ── Real-time listener for technicians (users) ──
    useEffect(() => {
        if (!user) return;
        const orgId = user.org_id || 'demo-org';
        const q = query(
            collection(db, 'users'), 
            where('org_id', '==', orgId), 
            where('role', '==', 'technician')
        );

        const unsubscribe = onSnapshot(q, (snapshot) => {
            const techs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as UserProfile));
            setTechnicians(techs);
        });

        return () => unsubscribe();
    }, [user]);

    // ── Real-time listener for org materials inventory ──
    useEffect(() => {
        if (!user) return;
        const orgId = user.org_id || 'demo-org';
        const q = query(collection(db, 'materials'), where('org_id', '==', orgId));
        const unsubscribe = onSnapshot(q, (snapshot) => {
            const items = snapshot.docs.map(d => ({ id: d.id, ...d.data() } as MaterialItem));
            setOrgMaterials(items);
        });
        return () => unsubscribe();
    }, [user]);

    // ── Fetch org sourcing strategy ──
    useEffect(() => {
        if (!user?.org_id) return;
        getDoc(doc(db, 'organizations', user.org_id)).then(snap => {
            if (snap.exists()) {
                const strategy = snap.data()?.settings?.defaultSourcingStrategy;
                if (strategy) setOrgSourcingStrategy(strategy as SourcingStrategy);
                const vendorId = snap.data()?.settings?.defaultVendorId;
                if (vendorId) setOrgDefaultVendorId(vendorId);
            }
        }).catch(() => { /* use default */ });
    }, [user?.org_id]);

    // Derive stats reactively
    const stats = useMemo(() => {
        const totalRevenue = invoices.reduce((sum, inv) => sum + (inv.total || 0), 0);
        const openTickets = allJobs.filter(j => j.status !== 'completed' && j.status !== 'cancelled' && !j.archived).length;
        return {
            revenue: totalRevenue,
            openTickets: openTickets,
            activeTechs: technicians.length
        };
    }, [invoices, allJobs, technicians]);

    // Derive chart data reactively
    const revenueData = useMemo(() => {
        const monthlyRevenue = [
            { name: 'Jun', revenue: 4000 },
            { name: 'Jul', revenue: 3000 },
            { name: 'Aug', revenue: 2000 },
            { name: 'Sep', revenue: 2780 },
            { name: 'Oct', revenue: 1890 },
            { name: 'Nov', revenue: 2390 },
        ];
        monthlyRevenue.push({ name: 'Current', revenue: stats.revenue });
        return monthlyRevenue;
    }, [stats.revenue]);

    const jobStatusData = useMemo(() => {
        const activeJobs = allJobs.filter(j => !j.archived);
        const statusCounts = activeJobs.reduce((acc: any, job) => {
            const s = job.status === 'pending' ? 'unscheduled' : job.status;
            acc[s] = (acc[s] || 0) + 1;
            return acc;
        }, {});
        return Object.keys(statusCounts).map(key => ({
            name: key.charAt(0).toUpperCase() + key.slice(1).replace('_', ' '),
            value: statusCounts[key]
        }));
    }, [allJobs]);

    const quoteCounts = useMemo(() => {
        const counts = {
            draft: 0,
            sent: 0,
            tech_review: 0,
            approved: 0,
            declined: 0,
            total: allQuotes.length
        };
        allQuotes.forEach(q => {
            const status = q.status as string;
            if (status === 'draft') counts.draft++;
            else if (status === 'sent' || status === 'viewed') counts.sent++;
            else if (status === 'tech_review') counts.tech_review++;
            else if (status === 'approved' || status === 'accepted') counts.approved++;
            else if (status === 'declined' || status === 'rejected') counts.declined++;
        });
        return counts;
    }, [allQuotes]);

    // ── Aggregate materials & tools needed for upcoming jobs ──
    interface NeededItem {
        key: string;
        itemName: string;
        type: 'material' | 'tool';
        totalQtyNeeded: number;
        onHandQty: number;
        shortfall: number;
        inStock: boolean;
        jobs: Array<{ jobId: string; jobTitle: string; customerName: string; scheduledAt: Date | null; priority: string }>;
        urgencyScore: number;
        inventoryItemId?: string;
        estimatedUnitCost?: number;
    }

    const neededItems = useMemo(() => {
        // Only look at scheduled / in_progress jobs that aren't archived
        const upcomingJobs = allJobs.filter(j =>
            (j.status === 'scheduled' || j.status === 'in_progress') && !j.archived
        );

        // Build a map: normalized item name -> aggregated data
        const itemMap = new Map<string, NeededItem>();

        const priorityWeight: Record<string, number> = { critical: 4, high: 3, medium: 2, low: 1 };

        for (const job of upcomingJobs) {
            const scheduledAt = job.scheduled_at?.toDate?.() || (job.scheduled_at ? new Date(job.scheduled_at) : null);
            const jobInfo = {
                jobId: job.id,
                jobTitle: job.request?.type || job.request?.description?.slice(0, 40) || 'Untitled Job',
                customerName: job.customer?.name || 'Unknown',
                scheduledAt,
                priority: job.priority || 'medium'
            };

            // Source 1: costBreakdown.parts (from CreateJob AI estimate)
            const cb = (job as any).costBreakdown;
            if (cb?.parts && Array.isArray(cb.parts)) {
                for (const part of cb.parts) {
                    const name = (part.name || part.item || '').trim();
                    if (!name) continue;
                    const key = name.toLowerCase();
                    const qty = part.quantity || 1;
                    const cost = part.unitCost || part.cost || part.estimatedCost || part.unitPrice || 0;
                    if (!itemMap.has(key)) {
                        itemMap.set(key, { key, itemName: name, type: 'material', totalQtyNeeded: 0, onHandQty: 0, shortfall: 0, inStock: false, jobs: [], urgencyScore: 0, estimatedUnitCost: 0 });
                    }
                    const item = itemMap.get(key)!;
                    item.totalQtyNeeded += qty;
                    if (cost > 0 && (!item.estimatedUnitCost || cost > item.estimatedUnitCost)) {
                        item.estimatedUnitCost = cost;
                    }
                    if (!item.jobs.find(j => j.jobId === job.id)) item.jobs.push(jobInfo);
                }
            }

            // Source 2: costBreakdown.toolsNeeded (from CreateJob AI estimate)
            if (cb?.toolsNeeded && Array.isArray(cb.toolsNeeded)) {
                for (const tool of cb.toolsNeeded) {
                    const name = (typeof tool === 'string' ? tool : tool.name || '').trim();
                    if (!name) continue;
                    const key = 'tool:' + name.toLowerCase();
                    if (!itemMap.has(key)) {
                        itemMap.set(key, { key, itemName: name, type: 'tool', totalQtyNeeded: 1, onHandQty: 0, shortfall: 0, inStock: false, jobs: [], urgencyScore: 0 });
                    }
                    const item = itemMap.get(key)!;
                    if (!item.jobs.find(j => j.jobId === job.id)) item.jobs.push(jobInfo);
                }
            }

            // Source 3: aiRecommendation.recommendedMaterials
            const aiRec = job.aiRecommendation || job.intakeReview?.aiRecommendation;
            if (aiRec?.recommendedMaterials) {
                for (const mat of aiRec.recommendedMaterials) {
                    const name = (mat.name || '').trim();
                    if (!name) continue;
                    const key = name.toLowerCase();
                    const qty = parseInt(mat.quantity || '1') || 1;
                    const cost = mat.estimatedCost || (mat as any).unitCost || (mat as any).cost || 0;
                    if (!itemMap.has(key)) {
                        itemMap.set(key, { key, itemName: name, type: 'material', totalQtyNeeded: 0, onHandQty: 0, shortfall: 0, inStock: false, jobs: [], urgencyScore: 0, estimatedUnitCost: 0 });
                    }
                    const item = itemMap.get(key)!;
                    item.totalQtyNeeded += qty;
                    if (cost > 0 && (!item.estimatedUnitCost || cost > item.estimatedUnitCost)) {
                        item.estimatedUnitCost = cost;
                    }
                    if (!item.jobs.find(j => j.jobId === job.id)) item.jobs.push(jobInfo);
                }
            }

            // Source 4: aiRecommendation.requiredTools
            if (aiRec?.requiredTools) {
                for (const tool of aiRec.requiredTools) {
                    const name = (tool.name || '').trim();
                    if (!name) continue;
                    const key = 'tool:' + name.toLowerCase();
                    if (!itemMap.has(key)) {
                        itemMap.set(key, { key, itemName: name, type: 'tool', totalQtyNeeded: 1, onHandQty: 0, shortfall: 0, inStock: false, jobs: [], urgencyScore: 0 });
                    }
                    const item = itemMap.get(key)!;
                    if (!item.jobs.find(j => j.jobId === job.id)) item.jobs.push(jobInfo);
                }
            }
        }

        // Cross-reference with inventory
        const now = new Date();
        for (const item of itemMap.values()) {
            // Find matching inventory item by name (case-insensitive fuzzy match)
            const match = orgMaterials.find(m =>
                m.name.toLowerCase().includes(item.itemName.toLowerCase()) ||
                item.itemName.toLowerCase().includes(m.name.toLowerCase())
            );
            if (match) {
                item.onHandQty = match.quantity || 0;
                item.inventoryItemId = match.id;
            }
            item.shortfall = Math.max(0, item.totalQtyNeeded - item.onHandQty);
            item.inStock = item.onHandQty >= item.totalQtyNeeded;

            // Compute urgency score (higher = more urgent)
            const highestPriority = Math.max(...item.jobs.map(j => priorityWeight[j.priority] || 2));
            const soonestDate = item.jobs.reduce((min, j) => {
                if (!j.scheduledAt) return min;
                const daysAway = Math.max(0, (j.scheduledAt.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
                return Math.min(min, daysAway);
            }, 999);
            // Urgency = priority weight + closeness bonus + out-of-stock bonus
            item.urgencyScore = highestPriority * 10 + (item.inStock ? 0 : 50) + Math.max(0, 30 - soonestDate);
        }

        // Sort: out-of-stock first, then by urgency score desc, then by shortfall desc
        return Array.from(itemMap.values()).sort((a, b) => {
            if (a.inStock !== b.inStock) return a.inStock ? 1 : -1;
            if (b.urgencyScore !== a.urgencyScore) return b.urgencyScore - a.urgencyScore;
            return b.shortfall - a.shortfall;
        });
    }, [allJobs, orgMaterials]);

    const jobCounts = useMemo(() => {
        const activeJobs = allJobs.filter(j => !j.archived);
        const counts = {
            unscheduled: 0,
            scheduled: 0,
            in_progress: 0,
            completed: 0,
            cancelled: 0,
            total: activeJobs.length
        };
        activeJobs.forEach(j => {
            const s = j.status;
            if (s === 'pending' || s === 'unscheduled') counts.unscheduled++;
            else if (s === 'scheduled') counts.scheduled++;
            else if (s === 'in_progress') counts.in_progress++;
            else if (s === 'completed') counts.completed++;
            else if (s === 'cancelled') counts.cancelled++;
        });
        return counts;
    }, [allJobs]);

    // ── Jobs from approved quotes that need dispatcher attention ──
    const approvedQuoteJobs = useMemo(() => {
        // Jobs where a quote was approved but still need scheduling OR were recently auto-scheduled
        const needsScheduling = allJobs.filter(j =>
            !j.archived &&
            (j as any).quoteStatus === 'approved' &&
            (j.status === 'pending' || j.status === 'unscheduled') &&
            !j.assigned_tech_id
        );

        const autoScheduleFailed = allJobs.filter(j =>
            !j.archived &&
            (j as any).autoScheduleFailed === true &&
            (j.status === 'pending' || j.status === 'unscheduled')
        );

        // Recently auto-scheduled jobs (within last 24 hours) for dispatcher awareness
        const recentlyScheduled = allJobs.filter(j => {
            if (j.archived || (j as any).autoScheduledBy !== 'system_quote_approval') return false;
            if (j.status !== 'scheduled') return false;
            const autoAt = (j as any).autoScheduledAt?.toDate?.() || ((j as any).autoScheduledAt ? new Date((j as any).autoScheduledAt) : null);
            if (!autoAt) return false;
            const hoursSince = (Date.now() - autoAt.getTime()) / (1000 * 60 * 60);
            return hoursSince < 24;
        });

        // Merge needs-scheduling + failed (deduplicate)
        const unscheduledIds = new Set(needsScheduling.map(j => j.id));
        const combined = [...needsScheduling];
        for (const j of autoScheduleFailed) {
            if (!unscheduledIds.has(j.id)) {
                combined.push(j);
            }
        }

        // Enrich with quote data
        return {
            unscheduled: combined.map(j => {
                const linkedQuote = allQuotes.find(q => q.id === j.active_quote_id);
                return { job: j, quote: linkedQuote || null };
            }),
            recentlyScheduled: recentlyScheduled.map(j => {
                const linkedQuote = allQuotes.find(q => q.id === j.active_quote_id);
                return { job: j, quote: linkedQuote || null };
            })
        };
    }, [allJobs, allQuotes]);

    /* ── Inquiry Actions ── */
    const handleDismiss = async (ticket: PortalTicket) => {
        setDismissingId(ticket.id);
        try {
            await updateDoc(doc(db, 'tickets', ticket.id), {
                status: 'ACKNOWLEDGED',
                acknowledgedAt: serverTimestamp(),
                acknowledgedBy: user?.uid || 'unknown'
            });
            toast.success('Inquiry dismissed');
        } catch (err) {
            console.error('Dismiss failed:', err);
            toast.error('Failed to dismiss');
        } finally {
            setDismissingId(null);
        }
    };

    const handleCreateJob = async (ticket: PortalTicket) => {
        setConvertingId(ticket.id);
        try {
            if ((ticket as any).autoJobId) {
                // The job was already created (e.g., via auto-quote generation). Just mark as converted.
                await updateDoc(doc(db, 'tickets', ticket.id), {
                    status: 'CONVERTED',
                    convertedJobId: (ticket as any).autoJobId,
                    acknowledgedAt: serverTimestamp(),
                    acknowledgedBy: user?.uid || 'unknown'
                });
                toast.success('Job created from inquiry');
                return (ticket as any).autoJobId;
            }

            const orgId = user?.org_id || 'demo-org';
            const urgency = ticket.metadata?.urgency || 'normal';

            // Create a job from the ticket
            const jobData: any = {
                org_id: orgId,
                customer: {
                    name: ticket.requestorName || 'Unknown Customer',
                    phone: ticket.requestorPhone || '',
                    email: ticket.requestorEmail || '',
                    address: ticket.address || ''
                },
                request: {
                    description: cleanDescription(ticket.description),
                    photos: (ticket as any).photoUrls || [],
                    source: 'portal'
                },
                status: 'pending',
                priority: urgency === 'emergency' ? 'high' : 'medium',
                createdAt: serverTimestamp(),
                createdBy: user?.uid || 'system',
                source: 'WEBSITE_PORTAL'
            };

            if (ticket.address) {
                jobData.location = { address: ticket.address };
            }
            
            // Copy AI data if it exists
            if ((ticket.metadata as any)?.aiRecommendation) {
                jobData.aiRecommendation = (ticket.metadata as any).aiRecommendation;
            } else if ((ticket as any).aiRecommendation) {
                jobData.aiRecommendation = (ticket as any).aiRecommendation;
            }
            if ((ticket as any).autoQuoteId) {
                jobData.active_quote_id = (ticket as any).autoQuoteId;
                jobData.status = 'quote_pending';
            }

            const jobRef = await addDoc(collection(db, 'jobs'), jobData);

            // Update quote with new jobId if it exists
            if ((ticket as any).autoQuoteId) {
                await updateDoc(doc(db, 'quotes', (ticket as any).autoQuoteId), {
                    job_id: jobRef.id
                });
            }

            // Mark ticket as converted
            await updateDoc(doc(db, 'tickets', ticket.id), {
                status: 'CONVERTED',
                convertedJobId: jobRef.id,
                acknowledgedAt: serverTimestamp(),
                acknowledgedBy: user?.uid || 'unknown'
            });

            toast.success('Job created from inquiry');
            return jobRef.id;
        } catch (err) {
            console.error('Job creation failed:', err);
            toast.error('Failed to create job');
            return null;
        } finally {
            setConvertingId(null);
        }
    };

    const handleSendQuote = async (ticket: PortalTicket) => {
        setConvertingId(ticket.id);
        try {
            const jobId = await handleCreateJob(ticket);
            if (jobId) {
                navigate(`/quotes/new/${jobId}`);
            }
        } catch (err) {
            console.error('Quote flow failed:', err);
            toast.error('Failed to start quote');
        } finally {
            setConvertingId(null);
        }
    };

    const handleViewJob = async (ticket: PortalTicket) => {
        const jobId = await handleCreateJob(ticket);
        if (jobId) {
            navigate(`/jobs/${jobId}`);
        }
    };

    const handleAddCustomer = (ticket: PortalTicket) => {
        // Navigate to contacts page with pre-fill state
        navigate('/contacts', {
            state: {
                prefill: {
                    name: ticket.requestorName || 'Unknown Customer',
                    phone: ticket.requestorPhone || '',
                    email: ticket.requestorEmail || '',
                    address: ticket.address || '',
                    source: 'website',
                    sourceTicketId: ticket.id
                }
            }
        });
    };

    /* ── Helper: strip portal prefix from description ── */
    function cleanDescription(desc: string): string {
        if (!desc) return '';
        return desc
            .replace(/^\[Portal Quote Request\]\s*/i, '')
            .replace(/^\[Public Portal Request\]\s*/i, '')
            .replace(/^urgency:\s*[a-z0-9_-]+\s*/i, '')
            .trim();
    }


    const [adminActionTab, setAdminActionTab] = useState<'all' | 'approvals' | 'quotes' | 'parts' | 'inquiries'>('all');

    const handleApproveAdminScope = async (jobId: string) => {
        try {
            const job = allJobs.find(j => j.id === jobId);
            const existingAmendments = job?.scope_amendments || [];
            const updatedAmendments = existingAmendments.map(a => ({
                ...a,
                approvedVia: a.approvedVia === 'sms_pending' ? 'sms_approved' : a.approvedVia,
                approvedAt: a.approvedAt || new Date().toISOString()
            }));

            await updateDoc(doc(db, 'jobs', jobId), {
                pending_scope_approval: false,
                scope_amendments: updatedAmendments,
                updatedAt: serverTimestamp()
            });
            toast.success('Scope amendment confirmed & approved! ✍️');
        } catch (err) {
            console.error('Failed to approve scope amendment:', err);
            toast.error('Failed to approve scope amendment');
        }
    };

    const handleResolveFieldQuote = async (jobId: string) => {
        try {
            await updateDoc(doc(db, 'jobs', jobId), {
                field_quote_requested: false,
                'field_quote_details.status': 'resolved',
                updatedAt: serverTimestamp()
            });
            toast.success('Field quote request marked resolved');
        } catch (err) {
            console.error('Failed to resolve field quote:', err);
            toast.error('Failed to resolve quote request');
        }
    };

    const handleUpdateAdminPartsStatus = async (jobId: string, status: 'ordered' | 'resolved') => {
        try {
            if (status === 'resolved') {
                await updateDoc(doc(db, 'jobs', jobId), {
                    parts_needed: false,
                    parts_procurement_status: 'resolved',
                    'parts_request.procurementStatus': 'resolved',
                    updatedAt: serverTimestamp()
                });
                toast.success('Parts requisition resolved');
            } else {
                await updateDoc(doc(db, 'jobs', jobId), {
                    parts_procurement_status: status,
                    'parts_request.procurementStatus': status,
                    updatedAt: serverTimestamp()
                });
                toast.success('Parts marked as ordered');
            }
        } catch (err) {
            console.error('Failed to update parts status:', err);
            toast.error('Failed to update parts status');
        }
    };

    if (loading) return <div className="p-8">Loading Dashboard...</div>;

    const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884d8'];

    const scopeApprovalJobs = allJobs.filter(j => (j.pending_scope_approval || j.has_scope_amendment) && !j.archived);
    const fieldQuoteJobs = allJobs.filter(j => j.field_quote_requested && !j.archived);
    const partsNeededJobs = allJobs.filter(j => j.parts_needed && !j.archived);

    const allCombinedActions = [
        ...scopeApprovalJobs.map(j => {
            const latestAmend = j.scope_amendments && j.scope_amendments.length > 0
                ? j.scope_amendments[j.scope_amendments.length - 1]
                : null;
            return {
                id: `scope_${j.id}`,
                type: 'scope_approval' as const,
                requestorName: j.customer?.name || 'Customer',
                requestorPhone: j.customer?.phone,
                requestorEmail: j.customer?.email,
                address: j.customer?.address,
                description: latestAmend ? `On-site scope amendment: "${latestAmend.reason}" • Total: $${latestAmend.totalAmount.toFixed(2)} (${latestAmend.approvedVia.replace(/_/g, ' ')})` : 'Scope change awaiting review',
                photoUrls: j.request?.photos || [],
                createdAt: (j as any).updatedAt?.toDate?.() || j.createdAt?.toDate?.() || new Date(),
                urgency: j.pending_scope_approval ? 'emergency' : 'high',
                source: 'FIELD_TECH',
                customerRef: j.customer_id ? { id: j.customer_id } : null,
                quoteId: j.active_quote_id,
                jobId: j.id,
                quoteTotal: latestAmend?.totalAmount,
                originalTicket: undefined,
                techName: latestAmend?.techName || j.assigned_tech_name || 'Field Tech',
                procurementStatus: undefined as string | undefined,
                jobRef: j
            };
        }),
        ...fieldQuoteJobs.map(j => {
            const req = j.field_quote_details;
            return {
                id: `field_quote_${j.id}`,
                type: 'field_quote' as const,
                requestorName: j.customer?.name || 'Customer',
                requestorPhone: j.customer?.phone,
                requestorEmail: j.customer?.email,
                address: j.customer?.address,
                description: req?.scopeDescription || j.request?.description || 'Tech requested office quote on site.',
                photoUrls: j.request?.photos || [],
                createdAt: req?.requestedAt?.toDate?.() || j.createdAt?.toDate?.() || new Date(),
                urgency: req?.urgency === 'emergency' ? 'emergency' : req?.urgency === 'high' ? 'high' : 'medium',
                source: 'FIELD_TECH',
                customerRef: j.customer_id ? { id: j.customer_id } : null,
                quoteId: j.active_quote_id,
                jobId: j.id,
                quoteTotal: req?.estimatedAmount,
                originalTicket: undefined,
                techName: req?.techName || j.assigned_tech_name || 'Field Tech',
                procurementStatus: undefined as string | undefined,
                jobRef: j
            };
        }),
        ...partsNeededJobs.map(j => {
            const req = j.parts_request;
            const itemDesc = req?.items && req.items.length > 0
                ? req.items.map(i => `${i.name} (Qty: ${i.quantity})${i.cantPickupReason ? ` — Reason: ${i.cantPickupReason}` : ''}`).join(' • ')
                : j.parts_description || 'Specialty parts needed';
            return {
                id: `parts_${j.id}`,
                type: 'parts_procurement' as const,
                requestorName: j.customer?.name || 'Customer',
                requestorPhone: j.customer?.phone,
                requestorEmail: j.customer?.email,
                address: j.customer?.address,
                description: itemDesc,
                photoUrls: j.request?.photos || [],
                createdAt: req?.requestedAt?.toDate?.() || j.createdAt?.toDate?.() || new Date(),
                urgency: req?.urgency === 'emergency' ? 'emergency' : req?.urgency === 'high' ? 'high' : 'medium',
                source: 'FIELD_TECH',
                customerRef: j.customer_id ? { id: j.customer_id } : null,
                quoteId: undefined,
                jobId: j.id,
                quoteTotal: undefined,
                originalTicket: undefined,
                techName: req?.techName || j.assigned_tech_name || 'Field Tech',
                procurementStatus: j.parts_procurement_status || 'pending_office_order',
                jobRef: j
            };
        }),
        ...inquiries.map(t => ({
            id: t.id,
            type: 'ticket' as const,
            requestorName: t.requestorName || 'Unknown Customer',
            requestorPhone: t.requestorPhone,
            requestorEmail: t.requestorEmail,
            address: t.address,
            description: t.description,
            photoUrls: t.photoUrls || (t as any).photoUrls || [],
            createdAt: t.createdAt?.toDate?.() || new Date(),
            urgency: t.metadata?.urgency || 'medium',
            source: t.source,
            customerRef: t.customerRef,
            quoteId: (t as any).autoQuoteId,
            jobId: (t as any).autoJobId,
            quoteTotal: (t as any).autoQuoteTotal,
            originalTicket: t,
            techName: undefined as string | undefined,
            procurementStatus: undefined as string | undefined,
            jobRef: undefined as Job | undefined
        })),
        ...reviewQuotes.map(q => {
            const latestNote = q.customerNotes?.length
                ? [...q.customerNotes].reverse().find(n => n.author === 'customer')
                : null;
            return {
                id: q.id,
                type: 'quote_review' as const,
                requestorName: q.customer?.name || 'Unknown Customer',
                requestorPhone: q.customer?.phone,
                requestorEmail: q.customer?.email,
                address: q.customer?.address,
                description: latestNote?.text || 'Change request submitted.',
                photoUrls: [] as string[],
                createdAt: q.updatedAt?.toDate?.() || q.createdAt?.toDate?.() || new Date(),
                urgency: 'medium',
                source: q.sentVia === 'email' ? 'EMAIL' : q.sentVia === 'sms' ? 'SMS' : 'WEBSITE_PORTAL',
                customerRef: q.customer_id ? { id: q.customer_id } : null,
                quoteId: q.id,
                jobId: q.job_id,
                quoteTotal: q.total,
                originalTicket: undefined,
                techName: undefined as string | undefined,
                procurementStatus: undefined as string | undefined,
                jobRef: undefined as Job | undefined
            };
        })
    ];

    // Priority sort: Emergency first, then approvals, field quotes, parts, inquiries
    const priorityWeight: Record<string, number> = {
        emergency: 100,
        high: 50,
        medium: 20,
        normal: 10
    };
    const sortedCombinedActions = [...allCombinedActions].sort((a, b) => {
        const weightA = (priorityWeight[a.urgency] || 10) + (a.type === 'scope_approval' ? 30 : a.type === 'field_quote' ? 20 : a.type === 'parts_procurement' ? 15 : 0);
        const weightB = (priorityWeight[b.urgency] || 10) + (b.type === 'scope_approval' ? 30 : b.type === 'field_quote' ? 20 : b.type === 'parts_procurement' ? 15 : 0);
        return weightB - weightA;
    });

    const combinedActions = sortedCombinedActions.filter(item => {
        if (adminActionTab === 'approvals') return item.type === 'scope_approval';
        if (adminActionTab === 'quotes') return item.type === 'field_quote' || item.type === 'quote_review';
        if (adminActionTab === 'parts') return item.type === 'parts_procurement';
        if (adminActionTab === 'inquiries') return item.type === 'ticket' || item.type === 'quote_review';
        return true;
    });

    return (
        <div className="min-h-screen bg-gray-50 p-3 md:p-5">
            {/* Sandbox Site Audit Studio */}
            <SandboxAuditPanel />

            <header className="flex flex-col xl:flex-row justify-between items-start xl:items-center mb-8 gap-6">
                <div className="flex-shrink-0">
                    <h1 className="text-3xl font-bold text-gray-800">Corporate Admin Dashboard</h1>
                    <p className="text-gray-600">Overview of organization performance</p>
                </div>
                <div className="flex flex-wrap items-center gap-4 w-full xl:w-auto justify-start xl:justify-end">
                    <Link to="/admin/integrations" className="text-gray-600 hover:text-blue-600 text-sm font-medium whitespace-nowrap">
                        Integrations & Finance
                    </Link>
                    <Link to="/admin/services" className="text-gray-600 hover:text-blue-600 text-sm font-medium whitespace-nowrap">
                        Services Catalog
                    </Link>
                    <Link to="/admin/communications" className="text-gray-600 hover:text-amber-600 text-sm font-medium whitespace-nowrap">
                        📡 Communications Hub
                    </Link>
                    <Link to="/dispatcher" className="bg-slate-800 hover:bg-slate-900 text-white font-bold py-2 px-4 rounded whitespace-nowrap">
                        Manage Schedule
                    </Link>
                    <Link to="/jobs/new" className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-2 px-4 rounded whitespace-nowrap">
                        + New Job
                    </Link>
                </div>
            </header>

            {/* Tracker Battery Maintenance & Charge Alerts Widget */}
            <TrackerBatteryAlertWidget />

            {/* Setup & Onboarding Progress Card */}
            {!setupChecks.isComplete && (
                <div className="mb-6 bg-gradient-to-r from-indigo-50 via-blue-50 to-white border border-indigo-200 rounded-xl p-4 shadow-sm flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
                    <div className="flex items-start gap-3">
                        <div className="p-2.5 bg-indigo-600 text-white rounded-xl shadow-sm">
                            <Sparkles className="w-5 h-5" />
                        </div>
                        <div>
                            <div className="flex items-center gap-2">
                                <h3 className="text-sm font-bold text-gray-900">
                                    Organization Onboarding Checklist
                                </h3>
                                <span className="text-xs font-semibold bg-indigo-100 text-indigo-800 px-2.5 py-0.5 rounded-full">
                                    {setupChecks.completed}/{setupChecks.total} Configured ({setupChecks.percent}%)
                                </span>
                            </div>
                            <p className="text-xs text-gray-600 mt-1">
                                Complete your required pricing, drive time, and service parameters to unlock full automation across jobs, quotes, and billing.
                            </p>
                        </div>
                    </div>
                    <div className="flex items-center gap-2 self-end md:self-auto flex-shrink-0">
                        <button
                            onClick={() => setShowOnboardingModal(true)}
                            className="px-3.5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold rounded-lg shadow transition flex items-center gap-1.5"
                        >
                            <Sparkles className="w-3.5 h-3.5" />
                            Open Checklist
                        </button>
                        <Link
                            to="/settings?tab=onboarding"
                            className="px-3.5 py-2 bg-white border border-gray-200 text-gray-700 hover:bg-gray-50 text-xs font-semibold rounded-lg shadow-sm transition"
                        >
                            Settings Page →
                        </Link>
                    </div>
                </div>
            )}

            {/* ═══════════════════════════════════════════════════════════════
             *  SECTION 1: DISPATCH & EXECUTIVE ACTION CENTER
             * ═══════════════════════════════════════════════════════════════ */}
            <div className="mb-8">
                {combinedActions.length > 0 ? (
                    <div className="bg-white rounded-xl shadow-lg border-2 border-amber-200 overflow-hidden">
                        {/* Header banner */}
                        <div className="bg-gradient-to-r from-amber-500 to-orange-500 px-6 py-4 flex flex-col md:flex-row md:items-center justify-between gap-4">
                            <div className="flex items-center gap-3">
                                <div className="relative">
                                    <MessageSquareWarning className="w-6 h-6 text-white" />
                                    <span className="absolute -top-1 -right-1 w-3 h-3 bg-red-500 rounded-full animate-ping" />
                                    <span className="absolute -top-1 -right-1 w-3 h-3 bg-red-500 rounded-full" />
                                </div>
                                <div>
                                    <h2 className="text-lg font-bold text-white">Action Center &amp; Field Exceptions</h2>
                                    <p className="text-amber-100 text-sm">
                                        {allCombinedActions.length} total pending {allCombinedActions.length === 1 ? 'action item' : 'action items'} requiring office action
                                    </p>
                                </div>
                            </div>

                            {/* Category Filter Pills */}
                            <div className="flex items-center gap-1.5 flex-wrap">
                                <button
                                    onClick={() => setAdminActionTab('all')}
                                    className={`px-3 py-1 rounded-lg text-xs font-bold transition-all ${
                                        adminActionTab === 'all'
                                            ? 'bg-white text-slate-900 shadow-sm'
                                            : 'bg-white/20 text-white hover:bg-white/30'
                                    }`}
                                >
                                    All ({allCombinedActions.length})
                                </button>
                                {scopeApprovalJobs.length > 0 && (
                                    <button
                                        onClick={() => setAdminActionTab('approvals')}
                                        className={`px-3 py-1 rounded-lg text-xs font-bold transition-all ${
                                            adminActionTab === 'approvals'
                                                ? 'bg-white text-emerald-800 shadow-sm'
                                                : 'bg-emerald-900/40 text-emerald-100 hover:bg-emerald-900/60'
                                        }`}
                                    >
                                        ✍️ Approvals ({scopeApprovalJobs.length})
                                    </button>
                                )}
                                {fieldQuoteJobs.length > 0 && (
                                    <button
                                        onClick={() => setAdminActionTab('quotes')}
                                        className={`px-3 py-1 rounded-lg text-xs font-bold transition-all ${
                                            adminActionTab === 'quotes'
                                                ? 'bg-white text-purple-800 shadow-sm'
                                                : 'bg-purple-900/40 text-purple-100 hover:bg-purple-900/60'
                                        }`}
                                    >
                                        📋 Quotes ({fieldQuoteJobs.length})
                                    </button>
                                )}
                                {partsNeededJobs.length > 0 && (
                                    <button
                                        onClick={() => setAdminActionTab('parts')}
                                        className={`px-3 py-1 rounded-lg text-xs font-bold transition-all ${
                                            adminActionTab === 'parts'
                                                ? 'bg-white text-amber-900 shadow-sm'
                                                : 'bg-amber-900/40 text-amber-100 hover:bg-amber-900/60'
                                        }`}
                                    >
                                        📦 Parts ({partsNeededJobs.length})
                                    </button>
                                )}
                                {(inquiries.length > 0 || reviewQuotes.length > 0) && (
                                    <button
                                        onClick={() => setAdminActionTab('inquiries')}
                                        className={`px-3 py-1 rounded-lg text-xs font-bold transition-all ${
                                            adminActionTab === 'inquiries'
                                                ? 'bg-white text-blue-900 shadow-sm'
                                                : 'bg-blue-900/40 text-blue-100 hover:bg-blue-900/60'
                                        }`}
                                    >
                                        💬 Inquiries ({inquiries.length + reviewQuotes.length})
                                    </button>
                                )}
                            </div>
                        </div>

                        {/* Inquiry and Field Exception cards */}
                        <div className="divide-y divide-gray-100">
                            {combinedActions.map((item) => {
                                const isEmergency = item.urgency === 'emergency';
                                const createdAt = item.createdAt;
                                const isConverting = convertingId === item.id;
                                const isApproval = item.type === 'scope_approval';
                                const isFieldQuote = item.type === 'field_quote';
                                const isParts = item.type === 'parts_procurement';

                                return (
                                    <div key={item.id}
                                        className={`p-5 hover:bg-gray-50/80 transition-colors ${
                                            isEmergency ? 'border-l-4 border-l-red-500 bg-red-50/10' :
                                            isApproval ? 'border-l-4 border-l-emerald-500 bg-emerald-50/10' :
                                            isFieldQuote ? 'border-l-4 border-l-purple-500 bg-purple-50/5' :
                                            isParts ? 'border-l-4 border-l-amber-500 bg-amber-50/5' :
                                            'border-l-4 border-l-blue-400'
                                        }`}>
                                        <div className="flex flex-col lg:flex-row lg:items-start gap-4">
                                            {/* Left: Info */}
                                            <div className="flex-1 min-w-0">
                                                <div className="flex items-center gap-3 mb-2 flex-wrap">
                                                    <h3 className="text-base font-semibold text-gray-900 truncate">
                                                        {item.requestorName}
                                                    </h3>
                                                    {isEmergency && (
                                                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold bg-red-100 text-red-700 animate-pulse">
                                                            <AlertTriangle className="w-3 h-3" /> EMERGENCY
                                                        </span>
                                                    )}
                                                    {isApproval && (
                                                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800 border border-emerald-200 animate-pulse">
                                                            <FileText className="w-3 h-3 mr-1" /> Scope Approval Needed
                                                        </span>
                                                    )}
                                                    {isFieldQuote && (
                                                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold bg-purple-100 text-purple-800 border border-purple-200 animate-pulse">
                                                            <FileText className="w-3 h-3 mr-1" /> Field Quote Request
                                                        </span>
                                                    )}
                                                    {isParts && (
                                                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold bg-amber-100 text-amber-800 border border-amber-200">
                                                            <ShoppingCart className="w-3 h-3 mr-1" /> Parts Requisition
                                                        </span>
                                                    )}
                                                    {item.type === 'quote_review' && (
                                                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold bg-amber-100 text-amber-700 animate-pulse">
                                                            <RefreshCw className="w-3 h-3 mr-1" /> Change Requested
                                                        </span>
                                                    )}
                                                    {item.type === 'ticket' && (
                                                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold ${
                                                            item.source === 'PHONE' ? 'bg-purple-100 text-purple-700' :
                                                            item.source === 'WEBSITE_PORTAL' ? 'bg-blue-100 text-blue-700' :
                                                            'bg-gray-100 text-gray-700'
                                                        }`}>
                                                            {item.source === 'PHONE' ? <PhoneCall className="w-3 h-3" /> :
                                                             item.source === 'WEBSITE_PORTAL' ? <Globe className="w-3 h-3" /> :
                                                             <Inbox className="w-3 h-3" />}
                                                            {item.source === 'PHONE' ? 'Phone Call' :
                                                             item.source === 'WEBSITE_PORTAL' ? 'Website Portal' : 'Other'}
                                                        </span>
                                                    )}
                                                    {item.techName && (
                                                        <span className="text-xs text-slate-700 font-bold bg-slate-100 px-2 py-0.5 rounded border border-slate-200 flex items-center gap-1">
                                                            <User className="w-3 h-3 text-blue-600" />
                                                            Tech: {item.techName}
                                                        </span>
                                                    )}
                                                    {item.jobId && (
                                                        <span className="text-xs font-mono text-gray-500 font-bold">
                                                            #{item.jobId.substring(0, 8)}
                                                        </span>
                                                    )}
                                                    <span className="text-xs text-gray-400 flex items-center gap-1">
                                                        <Clock className="w-3 h-3" />
                                                        {timeAgo(createdAt)}
                                                    </span>
                                                </div>

                                                <div className="flex flex-wrap items-center gap-4 text-sm text-gray-600 mb-2">
                                                    {item.requestorPhone && <span className="flex items-center gap-1"><Phone className="w-3.5 h-3.5" /> {item.requestorPhone}</span>}
                                                    {item.requestorEmail && <span className="flex items-center gap-1"><Mail className="w-3.5 h-3.5" /> {item.requestorEmail}</span>}
                                                    {item.address && <span className="flex items-center gap-1 text-xs text-gray-500"><MapPin className="w-3 h-3 text-red-500" /> {item.address}</span>}
                                                </div>

                                                <p className="text-sm text-gray-700 bg-gray-50 rounded-lg p-3 border border-gray-100 leading-relaxed font-medium text-slate-800">
                                                    {isApproval ? item.description :
                                                     isFieldQuote ? `Tech on-site findings: "${item.description}"` :
                                                     isParts ? `Parts needed: ${item.description}` :
                                                     item.type === 'quote_review' ? `Customer request: "${cleanDescription(item.description)}"` : cleanDescription(item.description)}
                                                </p>

                                                {/* Customer-uploaded photos */}
                                                {item.photoUrls && item.photoUrls.length > 0 && (
                                                    <div className="mt-2">
                                                        <CustomerPhotoStrip photos={item.photoUrls} compact maxVisible={4} />
                                                    </div>
                                                )}
                                            </div>

                                            {/* Right: Quick actions */}
                                            <div className="flex flex-col gap-1.5 flex-shrink-0" onClick={(e) => e.stopPropagation()}>
                                                {isApproval && item.jobId && (
                                                    <>
                                                        <button
                                                            onClick={() => item.jobId && handleApproveAdminScope(item.jobId)}
                                                            className="flex items-center justify-center gap-1.5 text-xs font-bold text-white bg-emerald-700 hover:bg-emerald-800 px-3.5 py-2 rounded-lg shadow-sm"
                                                        >
                                                            <CheckCircle2 className="w-3.5 h-3.5" /> Approve Scope Change
                                                        </button>
                                                        <button
                                                            onClick={() => navigate(`/jobs/${item.jobId}`)}
                                                            className="flex items-center justify-center gap-1.5 text-xs font-bold text-gray-700 bg-gray-100 hover:bg-gray-200 px-3 py-1.5 rounded-lg border border-gray-300"
                                                        >
                                                            <ExternalLink className="w-3.5 h-3.5" /> View Scope Details
                                                        </button>
                                                    </>
                                                )}

                                                {isFieldQuote && (
                                                    <>
                                                        <button
                                                            onClick={() => navigate(`/jobs/${item.jobId}/quote`)}
                                                            className="flex items-center justify-center gap-1.5 text-xs font-bold text-white bg-purple-700 hover:bg-purple-800 px-3.5 py-2 rounded-lg shadow-sm"
                                                        >
                                                            <FileText className="w-3.5 h-3.5" /> Build Quote
                                                        </button>
                                                        <button
                                                            onClick={() => item.jobId && handleResolveFieldQuote(item.jobId)}
                                                            className="flex items-center justify-center gap-1.5 text-xs font-bold text-emerald-800 bg-emerald-100 hover:bg-emerald-200 px-3 py-1.5 rounded-lg border border-emerald-300"
                                                        >
                                                            <CheckCircle2 className="w-3.5 h-3.5" /> Mark Resolved
                                                        </button>
                                                    </>
                                                )}

                                                {isParts && (
                                                    <>
                                                        <button
                                                            onClick={() => navigate('/inventory/purchase-orders')}
                                                            className="flex items-center justify-center gap-1.5 text-xs font-bold text-white bg-amber-600 hover:bg-amber-700 px-3.5 py-2 rounded-lg shadow-sm"
                                                        >
                                                            <ShoppingCart className="w-3.5 h-3.5" /> Create PO
                                                        </button>
                                                        {item.procurementStatus !== 'ordered' && (
                                                            <button
                                                                onClick={() => item.jobId && handleUpdateAdminPartsStatus(item.jobId, 'ordered')}
                                                                className="flex items-center justify-center gap-1.5 text-xs font-bold text-blue-700 bg-blue-100 hover:bg-blue-200 px-3 py-1.5 rounded-lg border border-blue-300"
                                                            >
                                                                <Package className="w-3.5 h-3.5" /> Mark Ordered
                                                            </button>
                                                        )}
                                                        <button
                                                            onClick={() => item.jobId && handleUpdateAdminPartsStatus(item.jobId, 'resolved')}
                                                            className="flex items-center justify-center gap-1.5 text-xs font-bold text-emerald-800 bg-emerald-100 hover:bg-emerald-200 px-3 py-1.5 rounded-lg border border-emerald-300"
                                                        >
                                                            <CheckCircle2 className="w-3.5 h-3.5" /> Mark Ready
                                                        </button>
                                                    </>
                                                )}

                                                {!isApproval && !isFieldQuote && !isParts && (
                                                    <>
                                                        <button onClick={() => setExpandedInquiryId(expandedInquiryId === item.id ? null : item.id)}
                                                            className="flex items-center justify-center gap-1.5 text-xs font-bold text-white bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 px-4 py-2.5 rounded-lg transition-all whitespace-nowrap shadow-md hover:shadow-lg">
                                                            <Sparkles className="w-4 h-4" />
                                                            {expandedInquiryId === item.id ? 'Hide' : 'Review'} {item.type === 'quote_review' ? 'AI Revision' : 'AI Quote'}
                                                        </button>
                                                        {item.type === 'quote_review' ? (
                                                            <button onClick={() => navigate(`/quotes/${item.quoteId}/edit`)} className="flex items-center justify-center gap-1.5 text-xs font-bold text-white bg-amber-600 hover:bg-amber-700 px-3 py-2 rounded-lg">
                                                                <Edit2 className="w-3.5 h-3.5" /> Revise
                                                            </button>
                                                        ) : (
                                                            <button onClick={() => handleViewJob(item.originalTicket!)} disabled={isConverting} className="flex items-center justify-center gap-1.5 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 px-3 py-2 rounded-lg">
                                                                <Briefcase className="w-3.5 h-3.5" /> Convert
                                                            </button>
                                                        )}
                                                    </>
                                                )}

                                                {item.jobId && (
                                                    <button
                                                        onClick={() => navigate(`/jobs/${item.jobId}`)}
                                                        className="text-xs text-gray-500 hover:text-gray-800 underline py-1 text-center"
                                                    >
                                                        View Job
                                                    </button>
                                                )}
                                            </div>
                                        </div>

                                        {/* ═══ Inline AI Quote Panel ═══ */}
                                        {expandedInquiryId === item.id && (
                                            <div className="space-y-4 mt-4 border-t border-gray-100 pt-4">
                                                {item.type === 'ticket' && (item.originalTicket as any)?.collectedInfo && Object.keys((item.originalTicket as any).collectedInfo).length > 0 && (
                                                    <div className="bg-white rounded-xl p-4 border border-gray-200">
                                                        <h4 className="text-sm font-bold text-gray-900 mb-3 flex items-center gap-2">
                                                            <UserPlus className="w-4 h-4 text-indigo-600" />
                                                            AI Extracted Details
                                                        </h4>
                                                        <div className="grid grid-cols-2 gap-3">
                                                            {Object.entries((item.originalTicket as any).collectedInfo).map(([key, val]) => (
                                                                 <div key={key} className="bg-gray-50 rounded-lg p-2.5 border border-gray-100">
                                                                     <div className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">{key}</div>
                                                                     <div className="text-sm font-medium text-gray-900">{String(val)}</div>
                                                                 </div>
                                                            ))}
                                                        </div>
                                                    </div>
                                                )}
                                                <InlineAIQuotePanel
                                                    ticket={item.type === 'ticket' ? item.originalTicket : undefined}
                                                    job={item.type === 'quote_review' ? { id: item.jobId, active_quote_id: item.quoteId } : undefined}
                                                    onQuoteSent={() => setExpandedInquiryId(null)}
                                                    onNavigateToQuote={(jobId, quoteId) => navigate(`/quotes/new/${jobId}?quoteId=${quoteId}`)}
                                                />
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                ) : (
                    <div className="bg-gradient-to-r from-emerald-50 to-teal-50 border border-emerald-200 rounded-xl px-6 py-4 flex items-center gap-3">
                        <CheckCircle2 className="w-5 h-5 text-emerald-500 shrink-0" />
                        <span className="text-sm font-medium text-emerald-800">All caught up! No pending inquiries.</span>
                    </div>
                )}
            </div>

            {/* ═══════════════════════════════════════════════════════════════
             *  SECTION 1.25: APPROVED QUOTES — SCHEDULING ALERTS
             * ═══════════════════════════════════════════════════════════════ */}
            {(approvedQuoteJobs.unscheduled.length > 0 || approvedQuoteJobs.recentlyScheduled.length > 0) && (
                <div className="mb-8">
                    <div className="bg-white rounded-xl shadow-lg border-2 border-emerald-200 overflow-hidden">
                        {/* Header banner */}
                        <div className="bg-gradient-to-r from-emerald-500 to-teal-600 px-6 py-4 flex items-center justify-between">
                            <div className="flex items-center gap-3">
                                <div className="relative">
                                    <CalendarCheck className="w-6 h-6 text-white" />
                                    {approvedQuoteJobs.unscheduled.length > 0 && (
                                        <>
                                            <span className="absolute -top-1 -right-1 w-3 h-3 bg-amber-400 rounded-full animate-ping" />
                                            <span className="absolute -top-1 -right-1 w-3 h-3 bg-amber-400 rounded-full" />
                                        </>
                                    )}
                                </div>
                                <div>
                                    <h2 className="text-lg font-bold text-white">Approved Quotes — Scheduling</h2>
                                    <p className="text-emerald-100 text-sm">
                                        {approvedQuoteJobs.unscheduled.length > 0
                                            ? `${approvedQuoteJobs.unscheduled.length} approved ${approvedQuoteJobs.unscheduled.length === 1 ? 'quote needs' : 'quotes need'} scheduling`
                                            : `${approvedQuoteJobs.recentlyScheduled.length} recently auto-scheduled`
                                        }
                                    </p>
                                </div>
                            </div>
                            <Link
                                to="/dispatcher"
                                className="bg-white/20 backdrop-blur-sm hover:bg-white/30 text-white font-semibold text-sm px-4 py-2 rounded-lg transition-colors flex items-center gap-1.5"
                            >
                                <CalendarCheck className="w-4 h-4" />
                                Open Calendar
                            </Link>
                        </div>

                        <div className="divide-y divide-gray-100">
                            {/* Unscheduled / Failed auto-schedule — amber alert */}
                            {approvedQuoteJobs.unscheduled.map(({ job, quote }) => (
                                <div key={job.id} className="p-5 border-l-4 border-l-amber-400 bg-amber-50/30 hover:bg-amber-50/60 transition-colors">
                                    <div className="flex flex-col lg:flex-row lg:items-center gap-3">
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center gap-3 mb-1.5 flex-wrap">
                                                <h3 className="text-base font-semibold text-gray-900 truncate">
                                                    {job.customer?.name || 'Unknown Customer'}
                                                </h3>
                                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold bg-amber-100 text-amber-800">
                                                    <AlertTriangle className="w-3 h-3" />
                                                    Needs Scheduling
                                                </span>
                                                {quote && (
                                                    <span className="text-sm font-semibold text-emerald-700">
                                                        ${quote.total?.toFixed(2)}
                                                    </span>
                                                )}
                                            </div>
                                            <div className="flex items-center gap-4 text-sm text-gray-600 flex-wrap">
                                                {job.customer?.address && (
                                                    <span className="flex items-center gap-1">
                                                        <MapPin className="w-3 h-3 text-gray-400" />
                                                        <span className="truncate max-w-[200px]">{job.customer.address}</span>
                                                    </span>
                                                )}
                                                {job.request?.type && (
                                                    <span className="flex items-center gap-1">
                                                        <Wrench className="w-3 h-3 text-gray-400" />
                                                        <span className="capitalize">{job.request.type}</span>
                                                    </span>
                                                )}
                                                {(job as any).autoScheduleReason && (
                                                    <span className="text-xs text-amber-700 italic">
                                                        {(job as any).autoScheduleReason}
                                                    </span>
                                                )}
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-2 shrink-0">
                                            <button
                                                onClick={() => navigate(`/dispatcher?scheduleJobId=${job.id}`)}
                                                className="flex items-center gap-1.5 bg-violet-600 hover:bg-violet-700 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
                                            >
                                                <CalendarCheck className="w-4 h-4" />
                                                Schedule Now
                                            </button>
                                            <button
                                                onClick={() => navigate(`/jobs/${job.id}`)}
                                                className="flex items-center gap-1 text-gray-600 hover:text-gray-900 text-sm font-medium px-3 py-2 rounded-lg border border-gray-200 hover:bg-gray-50 transition-colors"
                                            >
                                                View Job
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            ))}

                            {/* Recently auto-scheduled — green info */}
                            {approvedQuoteJobs.recentlyScheduled.map(({ job, quote }) => {
                                const scheduledAt = job.scheduled_at?.toDate?.() || (job.scheduled_at ? new Date(job.scheduled_at) : null);
                                return (
                                    <div key={job.id} className="p-5 border-l-4 border-l-emerald-400 bg-emerald-50/20 hover:bg-emerald-50/40 transition-colors">
                                        <div className="flex flex-col lg:flex-row lg:items-center gap-3">
                                            <div className="flex-1 min-w-0">
                                                <div className="flex items-center gap-3 mb-1.5 flex-wrap">
                                                    <h3 className="text-base font-semibold text-gray-900 truncate">
                                                        {job.customer?.name || 'Unknown Customer'}
                                                    </h3>
                                                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800">
                                                        <CheckCircle2 className="w-3 h-3" />
                                                        Auto-Scheduled
                                                    </span>
                                                    {quote && (
                                                        <span className="text-sm font-semibold text-emerald-700">
                                                            ${quote.total?.toFixed(2)}
                                                        </span>
                                                    )}
                                                </div>
                                                <div className="flex items-center gap-4 text-sm text-gray-600 flex-wrap">
                                                    {job.assigned_tech_name && (
                                                        <span className="flex items-center gap-1">
                                                            <User className="w-3 h-3 text-gray-400" />
                                                            {job.assigned_tech_name}
                                                        </span>
                                                    )}
                                                    {scheduledAt && (
                                                        <span className="flex items-center gap-1 font-medium text-violet-700">
                                                            <Clock className="w-3 h-3" />
                                                            {scheduledAt.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })} at {scheduledAt.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
                                                        </span>
                                                    )}
                                                    {job.request?.type && (
                                                        <span className="flex items-center gap-1">
                                                            <Wrench className="w-3 h-3 text-gray-400" />
                                                            <span className="capitalize">{job.request.type}</span>
                                                        </span>
                                                    )}
                                                </div>
                                            </div>
                                            <div className="flex items-center gap-2 shrink-0">
                                                <button
                                                    onClick={() => navigate(`/dispatcher`)}
                                                    className="flex items-center gap-1.5 text-emerald-700 hover:text-emerald-900 text-sm font-medium px-3 py-2 rounded-lg border border-emerald-200 hover:bg-emerald-50 transition-colors"
                                                >
                                                    <CalendarCheck className="w-4 h-4" />
                                                    View on Calendar
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                </div>
            )}

            {/* ═══════════════════════════════════════════════════════════════
             *  SECTION 1.5: MATERIALS & TOOLS NEEDED FOR UPCOMING JOBS
             * ═══════════════════════════════════════════════════════════════ */}
            <div className="mb-8">
                {neededItems.length > 0 ? (
                    <div className="bg-white rounded-xl shadow-md border border-gray-200 overflow-hidden">
                        {/* Header */}
                        <div className="bg-gradient-to-r from-blue-600 to-indigo-600 px-6 py-4 flex items-center justify-between">
                            <div className="flex items-center gap-3">
                                <Package className="w-6 h-6 text-white" />
                                <div>
                                    <h2 className="text-lg font-bold text-white">Materials & Tools Needed</h2>
                                    <p className="text-blue-100 text-xs">Items required for upcoming scheduled jobs — sorted by urgency</p>
                                </div>
                            </div>
                            <button
                                onClick={() => {
                                    const outOfStock = neededItems.filter(i => !i.inStock && i.type === 'material');
                                    const itemsParam = encodeURIComponent(JSON.stringify(outOfStock.map(i => {
                                        // Find the full material record to pass costs & vendor data
                                        const mat = orgMaterials.find(m => m.id === i.inventoryItemId);
                                        return {
                                            name: i.itemName,
                                            qty: i.shortfall,
                                            inventoryItemId: i.inventoryItemId || '',
                                            unitCost: mat?.unitCost || i.estimatedUnitCost || 0,
                                            sku: mat?.sku || 'N/A',
                                            preferredVendorId: mat?.preferredVendorId || '',
                                            vendors: (mat?.vendors || []).map((v: any) => ({
                                                vendorId: v.vendorId || '',
                                                unitCost: v.unitCost || 0,
                                                estimatedDeliveryDays: v.estimatedDeliveryDays || 3,
                                                vendorProductUrl: v.vendorProductUrl || '',
                                                priorityLogic: v.priorityLogic || ''
                                            }))
                                        };
                                    })));
                                    navigate(`/purchase-orders?masterPO=true&strategy=${orgSourcingStrategy}&defaultVendorId=${orgDefaultVendorId}&items=${itemsParam}`);
                                }}
                                className="bg-white/20 hover:bg-white/30 text-white text-sm font-bold px-4 py-1.5 rounded-full transition-colors cursor-pointer flex items-center gap-1.5"
                            >
                                <ShoppingCart className="w-3.5 h-3.5" />
                                {neededItems.filter(i => !i.inStock).length} to order
                            </button>
                        </div>

                        {/* Items list */}
                        <div className="divide-y divide-gray-100 max-h-[400px] overflow-y-auto">
                            {neededItems.map(item => (
                                <div
                                    key={item.key}
                                    className="px-6 py-3 hover:bg-gray-50 transition-colors relative group"
                                    onMouseEnter={() => setHoveredItemKey(item.key)}
                                    onMouseLeave={() => setHoveredItemKey(null)}
                                >
                                    <div className="flex items-center justify-between">
                                        <div className="flex items-center gap-3 min-w-0">
                                            {/* Status icon */}
                                            {!item.inStock && item.onHandQty === 0 ? (
                                                <div className="w-8 h-8 rounded-full bg-red-100 flex items-center justify-center shrink-0">
                                                    <AlertCircle className="w-4 h-4 text-red-600" />
                                                </div>
                                            ) : !item.inStock ? (
                                                <div className="w-8 h-8 rounded-full bg-amber-100 flex items-center justify-center shrink-0">
                                                    <AlertTriangle className="w-4 h-4 text-amber-600" />
                                                </div>
                                            ) : (
                                                <div className="w-8 h-8 rounded-full bg-emerald-100 flex items-center justify-center shrink-0">
                                                    <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                                                </div>
                                            )}

                                            {/* Item info */}
                                            <div className="min-w-0">
                                                <div className="flex items-center gap-2">
                                                    <span className="text-sm font-semibold text-gray-900 truncate">{item.itemName}</span>
                                                    {item.type === 'tool' && (
                                                        <span className="text-[10px] bg-orange-100 text-orange-700 px-1.5 py-0.5 rounded font-medium flex items-center gap-0.5">
                                                            <Hammer className="w-2.5 h-2.5" /> Tool
                                                        </span>
                                                    )}
                                                </div>
                                                <div className="flex items-center gap-2 text-xs text-gray-500">
                                                    {item.type === 'material' && (
                                                        <>
                                                            <span>Need: <strong className="text-gray-700">{item.totalQtyNeeded}</strong></span>
                                                            <span className="text-gray-300">•</span>
                                                            <span>On hand: <strong className={item.onHandQty === 0 ? 'text-red-600' : item.inStock ? 'text-emerald-600' : 'text-amber-600'}>{item.onHandQty}</strong></span>
                                                            {item.shortfall > 0 && (
                                                                <>
                                                                    <span className="text-gray-300">•</span>
                                                                    <span className="text-red-600 font-semibold">Short {item.shortfall}</span>
                                                                </>
                                                            )}
                                                        </>
                                                    )}
                                                    <span className="text-gray-300">•</span>
                                                    <span>{item.jobs.length} job{item.jobs.length !== 1 ? 's' : ''}</span>
                                                </div>
                                            </div>
                                        </div>

                                        {/* Right side: status + order button */}
                                        <div className="flex items-center gap-2 shrink-0">
                                            {!item.inStock && item.type === 'material' ? (
                                                <button
                                                    onClick={() => navigate(`/purchase-orders?item=${encodeURIComponent(item.itemName)}`)}
                                                    className="flex items-center gap-1 bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium px-3 py-1.5 rounded-lg transition-colors"
                                                >
                                                    <ShoppingCart className="w-3 h-3" /> Order
                                                </button>
                                            ) : item.inStock ? (
                                                <span className="text-xs text-emerald-600 font-medium bg-emerald-50 px-2 py-1 rounded">In Stock</span>
                                            ) : null}
                                        </div>
                                    </div>

                                    {/* Hover tooltip: which jobs need this */}
                                    {hoveredItemKey === item.key && item.jobs.length > 0 && (
                                        <div className="absolute left-16 top-full z-30 mt-1 bg-gray-900 text-white rounded-lg shadow-xl p-3 min-w-[280px] max-w-[360px] border border-gray-700">
                                            <p className="text-[10px] uppercase tracking-wider text-gray-400 mb-1.5 font-semibold">Needed for:</p>
                                            <div className="space-y-1.5">
                                                {item.jobs.map(j => (
                                                    <div key={j.jobId} className="flex items-start gap-2 text-xs">
                                                        <span className={`w-1.5 h-1.5 rounded-full mt-1.5 shrink-0 ${
                                                            j.priority === 'critical' ? 'bg-red-400' :
                                                            j.priority === 'high' ? 'bg-orange-400' :
                                                            j.priority === 'medium' ? 'bg-yellow-400' : 'bg-gray-400'
                                                        }`} />
                                                        <div>
                                                            <span className="font-medium text-gray-100">{j.jobTitle}</span>
                                                            <span className="text-gray-400 ml-1">— {j.customerName}</span>
                                                            {j.scheduledAt && (
                                                                <span className="text-gray-500 ml-1">
                                                                    ({j.scheduledAt.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })})
                                                                </span>
                                                            )}
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>
                    </div>
                ) : (
                    <div className="bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200 rounded-xl px-6 py-4 flex items-center gap-3">
                        <CheckCircle2 className="w-5 h-5 text-blue-500 shrink-0" />
                        <span className="text-sm font-medium text-blue-800">All materials are in stock for upcoming jobs.</span>
                    </div>
                )}
            </div>

            {/* ═══════════════════════════════════════════════════════════════
             *  SECTION 2: QUOTES PIPELINE
             * ═══════════════════════════════════════════════════════════════ */}
            <div className="bg-white rounded-xl shadow-md border border-gray-200 overflow-hidden mb-8">
                <div className="px-6 py-4 bg-gray-50 border-b border-gray-200 flex justify-between items-center">
                    <div>
                        <h2 className="text-lg font-bold text-gray-800">Quotes Pipeline ({quoteCounts.total})</h2>
                    </div>
                    <Link to="/quotes" className="text-blue-600 hover:text-blue-800 text-sm font-medium">Manage Quotes &rarr;</Link>
                </div>
                <div className="p-6 border-b border-gray-100 bg-gray-50/30">
                    <div className="grid grid-cols-2 sm:grid-cols-5 gap-4">
                        {[
                            { label: 'Draft', count: quoteCounts.draft, color: 'border-l-4 border-gray-400', statusValue: 'draft' },
                            { label: 'Sent', count: quoteCounts.sent, color: 'border-l-4 border-blue-500', statusValue: 'sent' },
                            { label: 'Review', count: quoteCounts.tech_review, color: 'border-l-4 border-amber-500', statusValue: 'tech_review' },
                            { label: 'Approved', count: quoteCounts.approved, color: 'border-l-4 border-emerald-500', statusValue: 'approved' },
                            { label: 'Declined', count: quoteCounts.declined, color: 'border-l-4 border-red-500', statusValue: 'declined' },
                        ].map((stat, i) => (
                            <div key={i} className={`p-4 rounded-lg border border-gray-100 shadow-sm ${stat.color} bg-white cursor-pointer hover:shadow-md transition-shadow`}
                                onClick={() => navigate(`/quotes?status=${stat.statusValue}`)}>
                                <div className="text-xs uppercase font-semibold text-gray-500">{stat.label}</div>
                                <div className="text-2xl font-bold mt-1 text-slate-800">{stat.count}</div>
                            </div>
                        ))}
                    </div>
                </div>
                <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200">
                        <thead className="bg-gray-50/50">
                            <tr>
                                <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Customer</th>
                                <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Amount</th>
                                <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Status</th>
                                <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Action</th>
                            </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-gray-100">
                            {allQuotes.slice(0, 5).map(quote => (
                                <tr key={quote.id} className="hover:bg-blue-50/30 cursor-pointer" onClick={() => navigate(quote.job_id ? `/quotes/new/${quote.job_id}?quoteId=${quote.id}` : `/quotes/${quote.id}/edit`)}>
                                    <td className="px-6 py-4 text-sm font-semibold text-gray-900">{quote.customer?.name}</td>
                                    <td className="px-6 py-4 text-sm font-semibold">${(quote.total || 0).toFixed(2)}</td>
                                    <td className="px-6 py-4 text-xs font-medium uppercase">{quote.status}</td>
                                    <td className="px-6 py-4 text-sm font-medium" onClick={(e) => e.stopPropagation()}><Link to={quote.job_id ? `/quotes/new/${quote.job_id}?quoteId=${quote.id}` : `/quotes/${quote.id}/edit`} className="text-blue-600 hover:text-blue-800">Edit</Link></td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* ═══════════════════════════════════════════════════════════════
             *  SECTION 3: OPEN JOBS QUEUE
             * ═══════════════════════════════════════════════════════════════ */}
            <div className="bg-white rounded-xl shadow-md border border-gray-200 overflow-hidden mb-8">
                <div className="px-6 py-4 bg-gray-50 border-b border-gray-200 flex justify-between items-center">
                    <div>
                        <h2 className="text-lg font-bold text-gray-800">Open Jobs Queue ({jobCounts.total})</h2>
                    </div>
                    <Link to="/jobs" className="text-blue-600 hover:text-blue-800 text-sm font-medium">View Jobs List &rarr;</Link>
                </div>
                <div className="p-6 border-b border-gray-100 bg-gray-50/30">
                    <div className="grid grid-cols-2 sm:grid-cols-5 gap-4">
                        {[
                            { label: 'Unscheduled', count: jobCounts.unscheduled, color: 'border-l-4 border-gray-400', statusValue: 'unscheduled' },
                            { label: 'Scheduled', count: jobCounts.scheduled, color: 'border-l-4 border-blue-500', statusValue: 'scheduled' },
                            { label: 'In Progress', count: jobCounts.in_progress, color: 'border-l-4 border-amber-500', statusValue: 'in_progress' },
                            { label: 'Completed', count: jobCounts.completed, color: 'border-l-4 border-emerald-500', statusValue: 'completed' },
                            { label: 'Cancelled', count: jobCounts.cancelled, color: 'border-l-4 border-red-500', statusValue: 'cancelled' },
                        ].map((stat, i) => (
                            <div key={i} className={`p-4 rounded-lg border border-gray-100 shadow-sm ${stat.color} bg-white cursor-pointer hover:shadow-md transition-shadow`}
                                onClick={() => navigate(`/jobs?status=${stat.statusValue}`)}>
                                <div className="text-xs uppercase font-semibold text-gray-500">{stat.label}</div>
                                <div className="text-2xl font-bold mt-1 text-slate-800">{stat.count}</div>
                            </div>
                        ))}
                    </div>
                </div>
                <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200">
                        <thead className="bg-gray-50/50">
                            <tr>
                                <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Customer</th>
                                <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Description</th>
                                <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Priority</th>
                                <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Technician</th>
                                <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Status</th>
                                <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Action</th>
                            </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-gray-100">
                            {allJobs.filter(j => !j.archived).slice(0, 5).map(job => (
                                <tr key={job.id} className="hover:bg-blue-50/30 cursor-pointer" onClick={() => navigate(`/jobs/${job.id}`)}>
                                    <td className="px-6 py-4 text-sm font-semibold text-gray-900">{job.customer?.name}</td>
                                    <td className="px-6 py-4 text-sm text-gray-500 truncate max-w-xs">{job.request?.description}</td>
                                    <td className="px-6 py-4 text-sm">
                                        <span className={`px-2.5 py-1 rounded-full text-xs font-bold ${
                                            job.priority === 'high' ? 'bg-red-100 text-red-700' :
                                            job.priority === 'medium' ? 'bg-yellow-100 text-yellow-700' :
                                            'bg-green-100 text-green-700'
                                        }`}>
                                            {job.priority}
                                        </span>
                                    </td>
                                    <td className="px-6 py-4 text-sm text-gray-600 font-medium">{job.assigned_tech_name || 'Unassigned'}</td>
                                    <td className="px-6 py-4 text-xs font-bold uppercase tracking-wider">
                                        <span className={`px-2.5 py-1 rounded-full text-[10px] ${
                                            job.status === 'completed' ? 'bg-emerald-100 text-emerald-700' :
                                            job.status === 'in_progress' ? 'bg-amber-100 text-amber-700 animate-pulse' :
                                            job.status === 'scheduled' ? 'bg-blue-100 text-blue-700' :
                                            'bg-gray-100 text-gray-700'
                                        }`}>
                                            {job.status}
                                        </span>
                                    </td>
                                    <td className="px-6 py-4 text-sm font-medium" onClick={(e) => e.stopPropagation()}>
                                        <Link to={`/jobs/${job.id}`} className="text-blue-600 hover:text-blue-800 mr-4">Details</Link>
                                        {(job.status === 'pending' || job.status === 'unscheduled') && (
                                            <Link to={`/schedule?jobId=${job.id}`} className="text-amber-600 hover:text-amber-800">Assign</Link>
                                        )}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* KPI Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
                <div className="bg-white p-6 rounded-lg shadow border-l-4 border-emerald-500">
                    <h3 className="text-gray-500 text-sm font-medium uppercase">Total Revenue</h3>
                    <p className="text-3xl font-bold text-gray-800">${stats.revenue.toLocaleString()}</p>
                </div>
                <div className="bg-white p-6 rounded-lg shadow border-l-4 border-blue-500">
                    <h3 className="text-gray-500 text-sm font-medium uppercase">Open Tickets</h3>
                    <p className="text-3xl font-bold text-gray-800">{stats.openTickets}</p>
                </div>
                <div className="bg-white p-6 rounded-lg shadow border-l-4 border-cyan-500">
                    <h3 className="text-gray-500 text-sm font-medium uppercase">Active Techs</h3>
                    <p className="text-3xl font-bold text-gray-800">{stats.activeTechs}</p>
                </div>
                <div className="bg-white p-6 rounded-lg shadow border-l-4 border-amber-500">
                    <h3 className="text-gray-500 text-sm font-medium uppercase">Pending Actions</h3>
                    <p className="text-3xl font-bold text-gray-800">{combinedActions.length}</p>
                </div>
            </div>

            {/* Add Technician Modal */}
            <AddTechnicianModal
                isOpen={isAddTechModalOpen}
                onClose={() => setIsAddTechModalOpen(false)}
            />

            {/* Edit Technician Modal */}
            <EditTechnicianModal
                isOpen={isEditTechModalOpen}
                onClose={() => {
                    setIsEditTechModalOpen(false);
                    setSelectedTech(null);
                }}
                technician={selectedTech}
            />

            {/* Onboarding Checklist Modal */}
            {showOnboardingModal && (
                <OnboardingSetupGuide onClose={() => setShowOnboardingModal(false)} />
            )}
        </div>
    );
};
