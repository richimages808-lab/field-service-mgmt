import React, { useState, useEffect, useMemo } from 'react';
import { db } from '../firebase';
import { collection, query, where, getDocs, limit, orderBy } from 'firebase/firestore';
import {
    MessageSquare, Mail, FileText, CheckCircle2, XCircle, Clock,
    DollarSign, Wrench, Eye, ArrowUpRight, ArrowDownLeft,
    CreditCard, ExternalLink, Calendar, Search, Filter,
    ChevronDown, ChevronUp, User, Tag, Sparkles, AlertCircle,
    Send, Check, CornerDownLeft, RefreshCw, Shield, Layers,
    Copy, ListFilter, Maximize2, Minimize2, ChevronRight
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useOrgPath } from '../lib/orgRouting';

export interface UnifiedHistoryEvent {
    id: string;
    category: 'sms' | 'email' | 'quote' | 'approval' | 'job' | 'invoice';
    title: string;
    subtitle?: string;
    description?: string;
    timestamp: Date;
    direction?: 'inbound' | 'outbound';
    badge: {
        label: string;
        bg: string;
        text: string;
        border?: string;
    };
    author?: string;
    amount?: number;
    jobId?: string;
    quoteNumber?: string;
    quoteId?: string;
    invoiceId?: string;
    meta?: any;
}

interface CustomerHistoryTimelineProps {
    customerId?: string;
    customerName?: string;
    customerEmail?: string;
    customerPhone?: string;
    orgId?: string;
    jobId?: string;
    compact?: boolean;
    maxItems?: number;
    onViewJob?: (jobId: string) => void;
    onViewQuote?: (quoteId: string) => void;
    showFilters?: boolean;
}

export const CustomerHistoryTimeline: React.FC<CustomerHistoryTimelineProps> = ({
    customerId,
    customerName,
    customerEmail,
    customerPhone,
    orgId = 'demo-org',
    jobId,
    compact = false,
    maxItems,
    onViewJob,
    onViewQuote,
    showFilters = true,
}) => {
    const navigate = useNavigate();
    const { orgPath } = useOrgPath();
    const [events, setEvents] = useState<UnifiedHistoryEvent[]>([]);
    const [loading, setLoading] = useState(true);
    const [filterCategory, setFilterCategory] = useState<'all' | 'sms' | 'email' | 'quote' | 'approval' | 'job' | 'invoice'>('all');
    const [searchQuery, setSearchQuery] = useState('');
    const [sortAsc, setSortAsc] = useState(false); // false = newest first
    const [viewMode, setViewMode] = useState<'rollup' | 'flat'>('rollup');
    const [expandedGroupKeys, setExpandedGroupKeys] = useState<Set<string>>(new Set());
    const [expandedEventIds, setExpandedEventIds] = useState<Set<string>>(new Set());
    const [copiedEventId, setCopiedEventId] = useState<string | null>(null);

    const toggleGroup = (key: string) => {
        setExpandedGroupKeys(prev => {
            const next = new Set(prev);
            if (next.has(key)) next.delete(key);
            else next.add(key);
            return next;
        });
    };

    const toggleExpand = (id: string) => {
        setExpandedEventIds(prev => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    };

    const normalizePhone = (p?: string) => {
        if (!p) return '';
        return p.replace(/\D/g, '');
    };

    const toDate = (v: any): Date | null => {
        if (!v) return null;
        if (v.toDate) return v.toDate();
        if (typeof v === 'string') {
            const d = new Date(v);
            return isNaN(d.getTime()) ? null : d;
        }
        if (v instanceof Date) return v;
        if (v.seconds) return new Date(v.seconds * 1000);
        return null;
    };

    useEffect(() => {
        let isMounted = true;

        const loadAllHistory = async () => {
            setLoading(true);
            try {
                const cleanPhone = normalizePhone(customerPhone);
                const phoneVariants = [
                    customerPhone,
                    cleanPhone,
                    cleanPhone ? `+1${cleanPhone.slice(-10)}` : null,
                    cleanPhone ? cleanPhone.slice(-10) : null
                ].filter(Boolean) as string[];

                const emailVariants = customerEmail && customerEmail !== 'N/A'
                    ? [customerEmail.toLowerCase().trim()]
                    : [];

                const allEvents: UnifiedHistoryEvent[] = [];

                // 1. Fetch SMS Messages
                try {
                    const smsQueries = [];
                    if (orgId) {
                        smsQueries.push(
                            getDocs(query(collection(db, 'sms_messages'), where('orgId', '==', orgId), limit(100)))
                        );
                        if (customerId) {
                            smsQueries.push(
                                getDocs(query(collection(db, 'sms_messages'), where('orgId', '==', orgId), where('customerId', '==', customerId), limit(100)))
                            );
                        }
                    }

                    const smsSnapshots = await Promise.all(smsQueries);
                    const seenSmsIds = new Set<string>();

                    smsSnapshots.forEach(snap => {
                        snap.forEach(docSnap => {
                            if (seenSmsIds.has(docSnap.id)) return;
                            seenSmsIds.add(docSnap.id);
                            const data = docSnap.data();

                            // Filter to this customer
                            const msgPhone = normalizePhone(data.customerPhone || data.to || data.from);
                            const matchesPhone = phoneVariants.some(pv => normalizePhone(pv) && msgPhone.includes(normalizePhone(pv).slice(-7)));
                            const matchesCustId = customerId && data.customerId === customerId;
                            const matchesJobId = jobId && (data.jobId === jobId || data.quoteNumber?.includes(jobId));

                            if (matchesPhone || matchesCustId || matchesJobId) {
                                const dt = toDate(data.createdAt) || toDate(data.timestamp) || new Date();
                                const isOutbound = data.direction === 'outbound';
                                const msgType = data.messageType || (isOutbound ? 'Outbound SMS' : 'Inbound SMS');

                                // Check if this is an approval message
                                const isApprovalMsg = !isOutbound && (
                                    data.body?.toLowerCase().includes('approve') ||
                                    data.body?.toLowerCase().includes('yes')
                                );

                                allEvents.push({
                                    id: `sms-${docSnap.id}`,
                                    category: isApprovalMsg ? 'approval' : 'sms',
                                    title: isApprovalMsg 
                                        ? `Quote Approved via SMS Reply`
                                        : (isOutbound ? `Sent Text Message: ${msgType}` : `Received Text Message`),
                                    subtitle: isOutbound ? `To: ${data.to}` : `From: ${data.from || customerName || 'Customer'}`,
                                    description: data.body,
                                    timestamp: dt,
                                    direction: isOutbound ? 'outbound' : 'inbound',
                                    badge: {
                                        label: isApprovalMsg ? 'SMS Approval' : (isOutbound ? 'Outbound SMS' : 'Inbound SMS'),
                                        bg: isApprovalMsg ? 'bg-emerald-50' : (isOutbound ? 'bg-indigo-50' : 'bg-blue-50'),
                                        text: isApprovalMsg ? 'text-emerald-700' : (isOutbound ? 'text-indigo-700' : 'text-blue-700'),
                                        border: isApprovalMsg ? 'border-emerald-200' : (isOutbound ? 'border-indigo-200' : 'border-blue-200')
                                    },
                                    jobId: data.jobId,
                                    quoteNumber: data.quoteNumber,
                                    meta: data
                                });
                            }
                        });
                    });
                } catch (smsErr) {
                    console.warn('[CustomerHistoryTimeline] Error loading SMS messages:', smsErr);
                }

                // 2. Fetch Emails (email_logs & communications)
                try {
                    const emailLogsSnap = await getDocs(
                        query(collection(db, 'email_logs'), where('orgId', '==', orgId), limit(100))
                    );
                    emailLogsSnap.forEach(docSnap => {
                        const data = docSnap.data();
                        const recipient = (data.recipient || data.to || '').toLowerCase();
                        const sender = (data.from || '').toLowerCase();
                        const matchesEmail = emailVariants.some(ev => recipient.includes(ev) || sender.includes(ev));
                        const matchesCustId = customerId && (data.customerId === customerId || data.customer_id === customerId);

                        if (matchesEmail || matchesCustId) {
                            const dt = toDate(data.createdAt) || toDate(data.timestamp) || new Date();
                            const isOutbound = data.direction === 'outbound' || data.type === 'outbound';

                            allEvents.push({
                                id: `email-${docSnap.id}`,
                                category: 'email',
                                title: data.subject || (isOutbound ? 'Email Notification Sent' : 'Inbound Email Received'),
                                subtitle: isOutbound ? `To: ${data.recipient || data.to}` : `From: ${data.from}`,
                                description: data.bodyText || data.body || data.snippet || data.preview,
                                timestamp: dt,
                                direction: isOutbound ? 'outbound' : 'inbound',
                                badge: {
                                    label: isOutbound ? 'Outbound Email' : 'Inbound Email',
                                    bg: 'bg-amber-50',
                                    text: 'text-amber-700',
                                    border: 'border-amber-200'
                                },
                                jobId: data.jobId || data.job_id,
                                quoteNumber: data.quoteNumber,
                                meta: data
                            });
                        }
                    });
                } catch (emailErr) {
                    console.warn('[CustomerHistoryTimeline] Error loading email logs:', emailErr);
                }

                // 3. Fetch Quotes
                try {
                    const quotesSnap = await getDocs(
                        query(collection(db, 'quotes'), where('org_id', '==', orgId), limit(100))
                    );
                    quotesSnap.forEach(docSnap => {
                        const qData = docSnap.data();
                        const qCustId = qData.customer_id || qData.customerId;
                        const qCustEmail = (qData.customer?.email || '').toLowerCase();
                        const qCustPhone = normalizePhone(qData.customer?.phone);

                        const matchesCustId = customerId && qCustId === customerId;
                        const matchesEmail = emailVariants.some(ev => qCustEmail.includes(ev));
                        const matchesPhone = phoneVariants.some(pv => normalizePhone(pv) && qCustPhone.includes(normalizePhone(pv).slice(-7)));

                        if (matchesCustId || matchesEmail || matchesPhone || (jobId && qData.job_id === jobId)) {
                            // Quote Created Event
                            const createdDt = toDate(qData.createdAt);
                            if (createdDt) {
                                const isAi = qData.createdBy === 'AI Auto-Quote' || qData.aiGenerated;
                                allEvents.push({
                                    id: `quote-created-${docSnap.id}`,
                                    category: 'quote',
                                    title: isAi ? `AI Auto-Quote Generated (${qData.quoteNumber || 'Estimate'})` : `Quote Created (${qData.quoteNumber || 'Estimate'})`,
                                    subtitle: `Total: $${(qData.total || 0).toFixed(2)} • ${qData.scopeOfWork || 'Diagnostic & Service Estimate'}`,
                                    description: qData.scopeOfWork || (qData.lineItems?.map((li: any) => li.description).join(', ')),
                                    timestamp: createdDt,
                                    badge: {
                                        label: isAi ? '✨ AI Quote' : 'Quote Created',
                                        bg: 'bg-emerald-50',
                                        text: 'text-emerald-700',
                                        border: 'border-emerald-200'
                                    },
                                    amount: qData.total,
                                    jobId: qData.job_id,
                                    quoteNumber: qData.quoteNumber,
                                    quoteId: docSnap.id,
                                    meta: qData
                                });
                            }

                            // Quote Sent Event
                            const sentDt = toDate(qData.sentAt);
                            if (sentDt) {
                                allEvents.push({
                                    id: `quote-sent-${docSnap.id}`,
                                    category: 'quote',
                                    title: `Quote Sent to Customer (${qData.quoteNumber || docSnap.id.substring(0, 6)})`,
                                    subtitle: `Sent via ${qData.sentVia || 'SMS & Email'} for $${(qData.total || 0).toFixed(2)}`,
                                    timestamp: sentDt,
                                    direction: 'outbound',
                                    badge: {
                                        label: 'Quote Delivered',
                                        bg: 'bg-sky-50',
                                        text: 'text-sky-700',
                                        border: 'border-sky-200'
                                    },
                                    amount: qData.total,
                                    jobId: qData.job_id,
                                    quoteNumber: qData.quoteNumber,
                                    quoteId: docSnap.id,
                                    meta: qData
                                });
                            }

                            // Quote Viewed Event
                            const viewedDt = toDate(qData.viewedAt);
                            if (viewedDt) {
                                allEvents.push({
                                    id: `quote-viewed-${docSnap.id}`,
                                    category: 'quote',
                                    title: `Customer Viewed Quote Online`,
                                    subtitle: `Quote #${qData.quoteNumber || docSnap.id.substring(0, 6)} opened by customer`,
                                    timestamp: viewedDt,
                                    badge: {
                                        label: 'Quote Viewed',
                                        bg: 'bg-slate-100',
                                        text: 'text-slate-700',
                                        border: 'border-slate-300'
                                    },
                                    jobId: qData.job_id,
                                    quoteNumber: qData.quoteNumber,
                                    quoteId: docSnap.id,
                                    meta: qData
                                });
                            }

                            // Quote Approved / Signed Event
                            const approvedDt = toDate(qData.approvedAt) || toDate(qData.signedAt);
                            if (approvedDt || qData.status === 'approved') {
                                allEvents.push({
                                    id: `quote-approved-${docSnap.id}`,
                                    category: 'approval',
                                    title: `Quote #${qData.quoteNumber || docSnap.id.substring(0, 6)} Approved! 🎉`,
                                    subtitle: qData.signatureData ? `Digitally signed by ${qData.signedBy || customerName || 'Customer'}` : `Approved by Customer (Total: $${(qData.total || 0).toFixed(2)})`,
                                    description: qData.approvalNotes || qData.customerNotes,
                                    timestamp: approvedDt || toDate(qData.updatedAt) || new Date(),
                                    badge: {
                                        label: 'Approved ✅',
                                        bg: 'bg-emerald-100',
                                        text: 'text-emerald-800',
                                        border: 'border-emerald-300'
                                    },
                                    amount: qData.total,
                                    jobId: qData.job_id,
                                    quoteNumber: qData.quoteNumber,
                                    quoteId: docSnap.id,
                                    meta: qData
                                });
                            }

                            // Quote Revisions
                            if (qData.previousVersions && Array.isArray(qData.previousVersions)) {
                                qData.previousVersions.forEach((ver: any, vIdx: number) => {
                                    const vDt = toDate(ver.updatedAt) || toDate(ver.createdAt);
                                    if (vDt) {
                                        allEvents.push({
                                            id: `quote-rev-${docSnap.id}-${vIdx}`,
                                            category: 'quote',
                                            title: `Quote Revised (Version ${vIdx + 1})`,
                                            subtitle: `Price adjusted to $${(ver.total || 0).toFixed(2)}`,
                                            timestamp: vDt,
                                            badge: {
                                                label: `Revision v${vIdx + 1}`,
                                                bg: 'bg-purple-50',
                                                text: 'text-purple-700',
                                                border: 'border-purple-200'
                                            },
                                            amount: ver.total,
                                            jobId: qData.job_id,
                                            quoteNumber: qData.quoteNumber,
                                            quoteId: docSnap.id,
                                            meta: ver
                                        });
                                    }
                                });
                            }
                        }
                    });
                } catch (quoteErr) {
                    console.warn('[CustomerHistoryTimeline] Error loading quotes:', quoteErr);
                }

                // 4. Fetch Jobs
                try {
                    const jobsSnap = await getDocs(
                        query(collection(db, 'jobs'), where('org_id', '==', orgId), limit(100))
                    );
                    jobsSnap.forEach(docSnap => {
                        const jData = docSnap.data();
                        const jCustId = jData.customer_id || jData.customerId;
                        const jCustEmail = (jData.customer?.email || '').toLowerCase();
                        const jCustPhone = normalizePhone(jData.customer?.phone);

                        const matchesCustId = customerId && jCustId === customerId;
                        const matchesEmail = emailVariants.some(ev => jCustEmail.includes(ev));
                        const matchesPhone = phoneVariants.some(pv => normalizePhone(pv) && jCustPhone.includes(normalizePhone(pv).slice(-7)));

                        if (matchesCustId || matchesEmail || matchesPhone || (jobId && docSnap.id === jobId)) {
                            // Job Created
                            const createdDt = toDate(jData.createdAt);
                            if (createdDt) {
                                allEvents.push({
                                    id: `job-created-${docSnap.id}`,
                                    category: 'job',
                                    title: `Service Job Created: ${jData.title || jData.jobNumber || 'New Job'}`,
                                    subtitle: `Job #${jData.jobNumber || docSnap.id.substring(0, 8)} • Priority: ${jData.priority || 'Normal'}`,
                                    description: jData.description || jData.request?.description,
                                    timestamp: createdDt,
                                    badge: {
                                        label: `Job: ${jData.status || 'Created'}`,
                                        bg: 'bg-blue-50',
                                        text: 'text-blue-700',
                                        border: 'border-blue-200'
                                    },
                                    jobId: docSnap.id,
                                    meta: jData
                                });
                            }

                            // Job Scheduled
                            const schedDt = toDate(jData.scheduledAt) || toDate(jData.scheduledTime);
                            if (schedDt) {
                                allEvents.push({
                                    id: `job-sched-${docSnap.id}`,
                                    category: 'job',
                                    title: `Appointment Confirmed & Scheduled`,
                                    subtitle: `Assigned Tech: ${jData.assignedTechName || jData.assigned_technician_name || 'Assigned'}`,
                                    description: `Scheduled Date: ${jData.scheduledDate || schedDt.toLocaleDateString()}`,
                                    timestamp: schedDt,
                                    badge: {
                                        label: 'Scheduled 🗓️',
                                        bg: 'bg-indigo-50',
                                        text: 'text-indigo-700',
                                        border: 'border-indigo-200'
                                    },
                                    jobId: docSnap.id,
                                    meta: jData
                                });
                            }

                            // Job Completed
                            if (jData.status === 'completed') {
                                const compDt = toDate(jData.completedAt) || toDate(jData.updatedAt) || new Date();
                                allEvents.push({
                                    id: `job-completed-${docSnap.id}`,
                                    category: 'job',
                                    title: `Job Completed Successfully`,
                                    subtitle: `Work signed off by ${jData.assignedTechName || 'Field Technician'}`,
                                    timestamp: compDt,
                                    badge: {
                                        label: 'Completed 🏆',
                                        bg: 'bg-emerald-50',
                                        text: 'text-emerald-700',
                                        border: 'border-emerald-200'
                                    },
                                    jobId: docSnap.id,
                                    meta: jData
                                });
                            }
                        }
                    });
                } catch (jobErr) {
                    console.warn('[CustomerHistoryTimeline] Error loading jobs:', jobErr);
                }

                // 5. Fetch Invoices
                try {
                    const invSnap = await getDocs(
                        query(collection(db, 'invoices'), where('org_id', '==', orgId), limit(100))
                    );
                    invSnap.forEach(docSnap => {
                        const iData = docSnap.data();
                        const iCustId = iData.customer_id || iData.customerId;
                        const iMatchesCust = customerId && iCustId === customerId;
                        const iMatchesJob = jobId && iData.job_id === jobId;

                        if (iMatchesCust || iMatchesJob) {
                            const invDt = toDate(iData.createdAt) || toDate(iData.issueDate);
                            if (invDt) {
                                allEvents.push({
                                    id: `inv-${docSnap.id}`,
                                    category: 'invoice',
                                    title: `Invoice #${iData.invoiceNumber || docSnap.id.substring(0, 6)} Issued`,
                                    subtitle: `Total: $${(iData.total || 0).toFixed(2)} • Status: ${iData.status || 'Pending'}`,
                                    timestamp: invDt,
                                    badge: {
                                        label: iData.status === 'paid' ? 'Paid In Full 💳' : 'Invoice Due',
                                        bg: iData.status === 'paid' ? 'bg-emerald-50' : 'bg-amber-50',
                                        text: iData.status === 'paid' ? 'text-emerald-700' : 'text-amber-700',
                                        border: iData.status === 'paid' ? 'border-emerald-200' : 'border-amber-200'
                                    },
                                    amount: iData.total,
                                    jobId: iData.job_id,
                                    invoiceId: docSnap.id,
                                    meta: iData
                                });
                            }
                        }
                    });
                } catch (invErr) {
                    console.warn('[CustomerHistoryTimeline] Error loading invoices:', invErr);
                }

                if (isMounted) {
                    // Sort descending by default (newest first)
                    allEvents.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
                    setEvents(allEvents);
                }
            } catch (err) {
                console.error('[CustomerHistoryTimeline] Master load failed:', err);
            } finally {
                if (isMounted) setLoading(false);
            }
        };

        loadAllHistory();

        return () => {
            isMounted = false;
        };
    }, [customerId, customerEmail, customerPhone, orgId, jobId]);

    // Filter & Search Logic
    const filteredEvents = useMemo(() => {
        let list = [...events];

        // Filter Category
        if (filterCategory !== 'all') {
            list = list.filter(e => e.category === filterCategory);
        }

        // Search Query (checks across all fields)
        if (searchQuery.trim()) {
            const q = searchQuery.toLowerCase();
            list = list.filter(e => 
                e.title.toLowerCase().includes(q) ||
                (e.subtitle && e.subtitle.toLowerCase().includes(q)) ||
                (e.description && e.description.toLowerCase().includes(q)) ||
                (e.author && e.author.toLowerCase().includes(q)) ||
                (e.jobId && e.jobId.toLowerCase().includes(q)) ||
                (e.quoteNumber && e.quoteNumber.toLowerCase().includes(q)) ||
                (e.meta && typeof e.meta === 'object' && JSON.stringify(e.meta).toLowerCase().includes(q))
            );
        }

        // Sort
        if (sortAsc) {
            list.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
        } else {
            list.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
        }

        if (maxItems && maxItems > 0) {
            list = list.slice(0, maxItems);
        }

        return list;
    }, [events, filterCategory, searchQuery, sortAsc, maxItems]);

    // ──── Daily Rollup by Event Type ────
    const dayGroups = useMemo(() => {
        if (filteredEvents.length === 0) return [];

        const dayMap = new Map<string, UnifiedHistoryEvent[]>();

        filteredEvents.forEach(evt => {
            const y = evt.timestamp.getFullYear();
            const m = String(evt.timestamp.getMonth() + 1).padStart(2, '0');
            const d = String(evt.timestamp.getDate()).padStart(2, '0');
            const dateKey = `${y}-${m}-${d}`;
            if (!dayMap.has(dateKey)) {
                dayMap.set(dateKey, []);
            }
            dayMap.get(dateKey)!.push(evt);
        });

        const groups: {
            dateKey: string;
            date: Date;
            dayLabel: string;
            typeGroups: {
                groupKey: string;
                category: 'sms' | 'email' | 'quote' | 'approval' | 'job' | 'invoice';
                title: string;
                summary: string;
                events: UnifiedHistoryEvent[];
                inboundCount: number;
                outboundCount: number;
                earliestTime: Date;
                latestTime: Date;
                latestSnippet: string;
                totalAmount?: number;
            }[];
            totalCount: number;
        }[] = [];

        dayMap.forEach((dayEvents, dateKey) => {
            const firstEvt = dayEvents[0];
            const dateObj = new Date(firstEvt.timestamp);

            // Group by category within this day
            const catMap = new Map<'sms' | 'email' | 'quote' | 'approval' | 'job' | 'invoice', UnifiedHistoryEvent[]>();

            dayEvents.forEach(e => {
                if (!catMap.has(e.category)) {
                    catMap.set(e.category, []);
                }
                catMap.get(e.category)!.push(e);
            });

            const typeGroups: any[] = [];

            catMap.forEach((catEvents, cat) => {
                const inbound = catEvents.filter(e => e.direction === 'inbound').length;
                const outbound = catEvents.filter(e => e.direction === 'outbound').length;
                const times = catEvents.map(e => e.timestamp.getTime());
                const earliestTime = new Date(Math.min(...times));
                const latestTime = new Date(Math.max(...times));

                let title = '';
                let summary = '';
                switch (cat) {
                    case 'sms':
                        title = 'SMS Text Conversations';
                        summary = catEvents.length === 1
                            ? '1 text message'
                            : `${catEvents.length} texts exchanged (${inbound} received, ${outbound} sent)`;
                        break;
                    case 'email':
                        title = 'Email Communications';
                        summary = catEvents.length === 1
                            ? '1 email logged'
                            : `${catEvents.length} emails logged`;
                        break;
                    case 'quote':
                        title = 'Quotes & Estimations';
                        summary = catEvents.length === 1
                            ? '1 quote event'
                            : `${catEvents.length} quote events & revisions`;
                        break;
                    case 'approval':
                        title = 'Customer Approvals & Signatures';
                        summary = catEvents.length === 1
                            ? '1 approval signature'
                            : `${catEvents.length} approvals logged`;
                        break;
                    case 'job':
                        title = 'Job Milestones & Actions';
                        summary = catEvents.length === 1
                            ? '1 job milestone'
                            : `${catEvents.length} job status updates`;
                        break;
                    case 'invoice':
                        title = 'Invoices & Payments';
                        const sumAmt = catEvents.reduce((acc, curr) => acc + (curr.amount || 0), 0);
                        summary = catEvents.length === 1
                            ? `1 invoice ${sumAmt > 0 ? `($${sumAmt.toFixed(2)})` : ''}`
                            : `${catEvents.length} invoice events ${sumAmt > 0 ? `($${sumAmt.toFixed(2)} total)` : ''}`;
                        break;
                }

                // Latest snippet
                const latest = catEvents[0];
                const snippet = latest?.description || latest?.subtitle || latest?.title || '';

                typeGroups.push({
                    groupKey: `${dateKey}-${cat}`,
                    category: cat,
                    title,
                    summary,
                    events: catEvents,
                    inboundCount: inbound,
                    outboundCount: outbound,
                    earliestTime,
                    latestTime,
                    latestSnippet: snippet
                });
            });

            // Format day label with relative indicators
            const today = new Date();
            const isToday = today.toDateString() === dateObj.toDateString();
            const yesterday = new Date(today);
            yesterday.setDate(yesterday.getDate() - 1);
            const isYesterday = yesterday.toDateString() === dateObj.toDateString();

            const formatted = dateObj.toLocaleDateString('en-US', {
                weekday: 'short',
                month: 'short',
                day: 'numeric',
                year: 'numeric'
            });

            const dayLabel = isToday 
                ? `Today • ${formatted}` 
                : isYesterday 
                ? `Yesterday • ${formatted}` 
                : formatted;

            groups.push({
                dateKey,
                date: dateObj,
                dayLabel,
                typeGroups,
                totalCount: dayEvents.length
            });
        });

        return groups;
    }, [filteredEvents]);

    // Check if group is expanded (auto-expand when searching)
    const isGroupExpanded = (key: string) => {
        if (searchQuery.trim().length > 0) return true;
        return expandedGroupKeys.has(key);
    };

    const handleExpandAll = () => {
        const allKeys = new Set<string>();
        dayGroups.forEach(dg => {
            dg.typeGroups.forEach(tg => allKeys.add(tg.groupKey));
        });
        setExpandedGroupKeys(allKeys);
    };

    const handleCollapseAll = () => {
        setExpandedGroupKeys(new Set());
    };

    const handleCopy = (text: string, id: string, e: React.MouseEvent) => {
        e.stopPropagation();
        if (navigator.clipboard) {
            navigator.clipboard.writeText(text);
            setCopiedEventId(id);
            setTimeout(() => setCopiedEventId(null), 2000);
        }
    };

    // Event Icon Resolver
    const getEventIcon = (category: string, direction?: string) => {
        switch (category) {
            case 'sms':
                return direction === 'outbound' 
                    ? <MessageSquare className="w-4 h-4 text-indigo-600" />
                    : <MessageSquare className="w-4 h-4 text-blue-600" />;
            case 'email':
                return <Mail className="w-4 h-4 text-amber-600" />;
            case 'quote':
                return <FileText className="w-4 h-4 text-emerald-600" />;
            case 'approval':
                return <CheckCircle2 className="w-4 h-4 text-emerald-600" />;
            case 'job':
                return <Wrench className="w-4 h-4 text-blue-600" />;
            case 'invoice':
                return <CreditCard className="w-4 h-4 text-teal-600" />;
            default:
                return <Clock className="w-4 h-4 text-gray-500" />;
        }
    };

    const formatEventDate = (d: Date) => {
        return d.toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
            year: 'numeric'
        });
    };

    const formatEventTime = (d: Date) => {
        return d.toLocaleTimeString('en-US', {
            hour: 'numeric',
            minute: '2-digit',
            hour12: true
        });
    };

    const formatTimeRange = (start: Date, end: Date) => {
        const t1 = formatEventTime(start);
        const t2 = formatEventTime(end);
        return t1 === t2 ? t1 : `${t1} – ${t2}`;
    };

    return (
        <div className="space-y-4">
            {/* Header & Controls Toolbar */}
            {showFilters && (
                <div className="bg-white p-3.5 rounded-xl border border-gray-200/80 shadow-xs space-y-3">
                    <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                        {/* Search Input */}
                        <div className="relative flex-1 w-full sm:w-auto">
                            <Search className="w-4 h-4 text-gray-400 absolute left-3 top-2.5" />
                            <input
                                type="text"
                                value={searchQuery}
                                onChange={e => setSearchQuery(e.target.value)}
                                placeholder="Search texts, email logs, quotes, jobs, amounts..."
                                className="w-full text-xs pl-9 pr-8 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 bg-gray-50/50"
                            />
                            {searchQuery && (
                                <button
                                    onClick={() => setSearchQuery('')}
                                    className="absolute right-2.5 top-2.5 text-gray-400 hover:text-gray-600 text-xs font-bold"
                                >
                                    ✕
                                </button>
                            )}
                        </div>

                        {/* Controls Group */}
                        <div className="flex items-center gap-2 flex-wrap flex-shrink-0 self-end sm:self-auto">
                            {/* View Mode Toggle */}
                            <div className="flex items-center bg-gray-100 p-0.5 rounded-lg border border-gray-200 text-xs">
                                <button
                                    onClick={() => setViewMode('rollup')}
                                    className={`px-2.5 py-1 rounded-md font-bold transition flex items-center gap-1 cursor-pointer ${
                                        viewMode === 'rollup'
                                            ? 'bg-white text-indigo-700 shadow-xs'
                                            : 'text-gray-600 hover:text-gray-900'
                                    }`}
                                    title="Rollup events by day and category"
                                >
                                    <Layers className="w-3 h-3" />
                                    <span>Daily Rollup</span>
                                </button>
                                <button
                                    onClick={() => setViewMode('flat')}
                                    className={`px-2.5 py-1 rounded-md font-bold transition flex items-center gap-1 cursor-pointer ${
                                        viewMode === 'flat'
                                            ? 'bg-white text-indigo-700 shadow-xs'
                                            : 'text-gray-600 hover:text-gray-900'
                                    }`}
                                    title="Show flat chronological stream"
                                >
                                    <ListFilter className="w-3 h-3" />
                                    <span>Flat Stream</span>
                                </button>
                            </div>

                            {/* Expand/Collapse All (in Rollup Mode) */}
                            {viewMode === 'rollup' && dayGroups.length > 0 && (
                                <button
                                    onClick={expandedGroupKeys.size > 0 ? handleCollapseAll : handleExpandAll}
                                    className="px-2.5 py-1.5 border border-gray-300 rounded-lg text-xs font-medium text-gray-600 hover:bg-gray-50 flex items-center gap-1 transition cursor-pointer"
                                    title={expandedGroupKeys.size > 0 ? 'Collapse all dropdowns' : 'Expand all dropdowns'}
                                >
                                    {expandedGroupKeys.size > 0 ? (
                                        <>
                                            <Minimize2 className="w-3 h-3 text-gray-500" />
                                            <span>Collapse All</span>
                                        </>
                                    ) : (
                                        <>
                                            <Maximize2 className="w-3 h-3 text-gray-500" />
                                            <span>Expand All</span>
                                        </>
                                    )}
                                </button>
                            )}

                            {/* Sort Order Toggle */}
                            <button
                                onClick={() => setSortAsc(!sortAsc)}
                                className="px-2.5 py-1.5 border border-gray-300 rounded-lg text-xs font-medium text-gray-600 hover:bg-gray-50 flex items-center gap-1 transition cursor-pointer"
                                title="Change chronological sort order"
                            >
                                <Clock className="w-3.5 h-3.5 text-gray-500" />
                                <span>{sortAsc ? 'Oldest First ⬆️' : 'Newest First ⬇️'}</span>
                            </button>
                        </div>
                    </div>

                    {/* Filter Category Chips */}
                    <div className="flex items-center gap-1.5 overflow-x-auto pb-1 text-xs">
                        <button
                            onClick={() => setFilterCategory('all')}
                            className={`px-3 py-1 rounded-full font-bold transition cursor-pointer flex items-center gap-1 whitespace-nowrap ${
                                filterCategory === 'all'
                                    ? 'bg-slate-900 text-white shadow-xs'
                                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                            }`}
                        >
                            <Layers className="w-3 h-3" />
                            <span>All Events ({events.length})</span>
                        </button>

                        <button
                            onClick={() => setFilterCategory('sms')}
                            className={`px-3 py-1 rounded-full font-bold transition cursor-pointer flex items-center gap-1 whitespace-nowrap ${
                                filterCategory === 'sms'
                                    ? 'bg-indigo-600 text-white shadow-xs'
                                    : 'bg-indigo-50 text-indigo-700 hover:bg-indigo-100'
                            }`}
                        >
                            <MessageSquare className="w-3 h-3" />
                            <span>SMS Texts ({events.filter(e => e.category === 'sms').length})</span>
                        </button>

                        <button
                            onClick={() => setFilterCategory('email')}
                            className={`px-3 py-1 rounded-full font-bold transition cursor-pointer flex items-center gap-1 whitespace-nowrap ${
                                filterCategory === 'email'
                                    ? 'bg-amber-600 text-white shadow-xs'
                                    : 'bg-amber-50 text-amber-700 hover:bg-amber-100'
                            }`}
                        >
                            <Mail className="w-3 h-3" />
                            <span>Emails ({events.filter(e => e.category === 'email').length})</span>
                        </button>

                        <button
                            onClick={() => setFilterCategory('quote')}
                            className={`px-3 py-1 rounded-full font-bold transition cursor-pointer flex items-center gap-1 whitespace-nowrap ${
                                filterCategory === 'quote'
                                    ? 'bg-emerald-600 text-white shadow-xs'
                                    : 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
                            }`}
                        >
                            <FileText className="w-3 h-3" />
                            <span>Quotes ({events.filter(e => e.category === 'quote').length})</span>
                        </button>

                        <button
                            onClick={() => setFilterCategory('approval')}
                            className={`px-3 py-1 rounded-full font-bold transition cursor-pointer flex items-center gap-1 whitespace-nowrap ${
                                filterCategory === 'approval'
                                    ? 'bg-emerald-700 text-white shadow-xs'
                                    : 'bg-green-50 text-green-800 hover:bg-green-100'
                            }`}
                        >
                            <CheckCircle2 className="w-3 h-3" />
                            <span>Approvals ({events.filter(e => e.category === 'approval').length})</span>
                        </button>

                        <button
                            onClick={() => setFilterCategory('job')}
                            className={`px-3 py-1 rounded-full font-bold transition cursor-pointer flex items-center gap-1 whitespace-nowrap ${
                                filterCategory === 'job'
                                    ? 'bg-blue-600 text-white shadow-xs'
                                    : 'bg-blue-50 text-blue-700 hover:bg-blue-100'
                            }`}
                        >
                            <Wrench className="w-3 h-3" />
                            <span>Jobs ({events.filter(e => e.category === 'job').length})</span>
                        </button>

                        <button
                            onClick={() => setFilterCategory('invoice')}
                            className={`px-3 py-1 rounded-full font-bold transition cursor-pointer flex items-center gap-1 whitespace-nowrap ${
                                filterCategory === 'invoice'
                                    ? 'bg-teal-600 text-white shadow-xs'
                                    : 'bg-teal-50 text-teal-700 hover:bg-teal-100'
                            }`}
                        >
                            <CreditCard className="w-3 h-3" />
                            <span>Invoices ({events.filter(e => e.category === 'invoice').length})</span>
                        </button>
                    </div>
                </div>
            )}

            {/* Content Display */}
            {loading ? (
                <div className="p-8 bg-white rounded-xl border border-gray-200 text-center space-y-2">
                    <RefreshCw className="w-6 h-6 animate-spin text-indigo-600 mx-auto" />
                    <p className="text-xs font-medium text-gray-500">Loading chronological history...</p>
                </div>
            ) : filteredEvents.length === 0 ? (
                <div className="p-8 bg-white rounded-xl border border-dashed border-gray-200 text-center space-y-2">
                    <Clock className="w-8 h-8 text-gray-300 mx-auto" />
                    <p className="text-sm font-bold text-gray-700">No events found</p>
                    <p className="text-xs text-gray-400 max-w-sm mx-auto">
                        {searchQuery ? `No events matched "${searchQuery}". Try clearing search.` : 'No communication or job events recorded yet.'}
                    </p>
                </div>
            ) : viewMode === 'rollup' ? (
                /* ═══════════ DAILY ROLLUP VIEW ═══════════ */
                <div className="space-y-6">
                    {dayGroups.map(day => (
                        <div key={day.dateKey} className="space-y-3">
                            {/* Day Header Divider */}
                            <div className="flex items-center gap-2 sticky top-0 bg-white/95 backdrop-blur-xs py-1.5 z-10 border-b border-gray-100">
                                <Calendar className="w-3.5 h-3.5 text-indigo-600" />
                                <span className="text-xs font-bold text-gray-800 uppercase tracking-wide">
                                    {day.dayLabel}
                                </span>
                                <span className="text-[10px] font-bold text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full">
                                    {day.totalCount} {day.totalCount === 1 ? 'event' : 'events'}
                                </span>
                                <div className="flex-1 h-px bg-gray-100" />
                            </div>

                            {/* Type Rollup Groups for this Day */}
                            <div className="space-y-2.5">
                                {day.typeGroups.map(group => {
                                    const isExpanded = isGroupExpanded(group.groupKey);
                                    const isSingle = group.events.length === 1;

                                    return (
                                        <div 
                                            key={group.groupKey} 
                                            className="border border-gray-200/90 rounded-xl bg-white shadow-xs overflow-hidden transition-all duration-150"
                                        >
                                            {/* Rollup Header (Clickable Dropdown Bar) */}
                                            <div
                                                onClick={() => toggleGroup(group.groupKey)}
                                                className={`p-3 sm:p-3.5 flex items-center justify-between gap-3 cursor-pointer select-none transition ${
                                                    isExpanded ? 'bg-slate-50 border-b border-gray-150' : 'hover:bg-gray-50/80'
                                                }`}
                                            >
                                                <div className="flex items-center gap-3 flex-1 min-w-0">
                                                    {/* Category Icon Badge */}
                                                    <div className="w-8 h-8 rounded-lg bg-gray-100 border border-gray-200/80 flex items-center justify-center flex-shrink-0 shadow-2xs">
                                                        {getEventIcon(group.category)}
                                                    </div>

                                                    {/* Title & Stats */}
                                                    <div className="space-y-0.5 flex-1 min-w-0">
                                                        <div className="flex items-center gap-2 flex-wrap">
                                                            <span className="text-xs font-bold text-gray-900">
                                                                {group.title}
                                                            </span>
                                                            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                                                                group.category === 'sms' ? 'bg-indigo-100 text-indigo-800' :
                                                                group.category === 'email' ? 'bg-amber-100 text-amber-800' :
                                                                group.category === 'quote' ? 'bg-emerald-100 text-emerald-800' :
                                                                group.category === 'approval' ? 'bg-green-100 text-green-800' :
                                                                group.category === 'job' ? 'bg-blue-100 text-blue-800' :
                                                                'bg-teal-100 text-teal-800'
                                                            }`}>
                                                                {group.events.length} {group.events.length === 1 ? 'item' : 'items'}
                                                            </span>
                                                        </div>

                                                        {/* Summary & Snippet */}
                                                        <p className="text-[11px] text-gray-500 truncate">
                                                            {group.summary}
                                                            {group.latestSnippet && (
                                                                <span className="text-gray-400 ml-1">
                                                                    — "{group.latestSnippet.substring(0, 75)}{group.latestSnippet.length > 75 ? '...' : ''}"
                                                                </span>
                                                            )}
                                                        </p>
                                                    </div>
                                                </div>

                                                {/* Time Range & Chevron Indicator */}
                                                <div className="flex items-center gap-2 flex-shrink-0 text-right">
                                                    <div className="text-[10px] text-gray-400 font-mono hidden sm:block">
                                                        {formatTimeRange(group.earliestTime, group.latestTime)}
                                                    </div>
                                                    <div className={`p-1 rounded-md text-gray-400 hover:text-gray-600 transition-transform ${isExpanded ? 'rotate-180 bg-gray-200/50' : ''}`}>
                                                        <ChevronDown className="w-4 h-4" />
                                                    </div>
                                                </div>
                                            </div>

                                            {/* Dropdown Content Area (Individual Events) */}
                                            {isExpanded && (
                                                <div className="p-3 sm:p-4 bg-slate-50/50 space-y-2.5 animate-in fade-in duration-150 divide-y divide-gray-100">
                                                    {group.events.map((evt: UnifiedHistoryEvent, idx: number) => {
                                                        const isEvtExpanded = expandedEventIds.has(evt.id);
                                                        const isSms = evt.category === 'sms';
                                                        const isCopied = copiedEventId === evt.id;

                                                        return (
                                                            <div 
                                                                key={evt.id} 
                                                                className={`pt-2.5 first:pt-0 ${
                                                                    isSms
                                                                        ? evt.direction === 'inbound'
                                                                            ? 'pl-2 border-l-2 border-blue-400'
                                                                            : 'pl-2 border-l-2 border-indigo-400'
                                                                        : ''
                                                                }`}
                                                            >
                                                                <div 
                                                                    onClick={(e) => {
                                                                        if (evt.quoteId) {
                                                                            e.stopPropagation();
                                                                            if (onViewQuote) onViewQuote(evt.quoteId);
                                                                            else navigate(orgPath(`/quotes/${evt.quoteId}`));
                                                                        } else if (evt.jobId) {
                                                                            e.stopPropagation();
                                                                            if (onViewJob) onViewJob(evt.jobId);
                                                                            else navigate(orgPath(`/jobs/${evt.jobId}`));
                                                                        } else if (evt.category === 'sms') {
                                                                            // Expand or copy in place
                                                                        }
                                                                    }}
                                                                    className={`bg-white rounded-xl border border-gray-200 p-3 shadow-2xs transition ${
                                                                        evt.quoteId || evt.jobId ? 'cursor-pointer hover:border-indigo-400 hover:shadow-xs' : ''
                                                                    }`}
                                                                >
                                                                    {/* Item Top Bar */}
                                                                    <div className="flex items-start justify-between gap-2">
                                                                        <div className="flex items-center gap-1.5 flex-wrap">
                                                                            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-md uppercase tracking-wider border ${evt.badge.bg} ${evt.badge.text} ${evt.badge.border || 'border-transparent'}`}>
                                                                                {evt.badge.label}
                                                                            </span>
                                                                            <span className="text-xs font-bold text-gray-900">
                                                                                {evt.title}
                                                                            </span>
                                                                            {evt.author && (
                                                                                <span className="text-[10px] text-gray-500 bg-gray-100 px-1.5 py-0.5 rounded font-medium">
                                                                                    {evt.author}
                                                                                </span>
                                                                            )}
                                                                        </div>

                                                                        <div className="flex items-center gap-1.5 text-right flex-shrink-0">
                                                                            <span className="text-[10px] text-gray-400 font-mono">
                                                                                {formatEventTime(evt.timestamp)}
                                                                            </span>
                                                                            {evt.description && (
                                                                                <button
                                                                                    onClick={(e) => handleCopy(evt.description!, evt.id, e)}
                                                                                    className="p-1 text-gray-400 hover:text-gray-600 rounded transition"
                                                                                    title="Copy text"
                                                                                >
                                                                                    {isCopied ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                                                                                </button>
                                                                            )}
                                                                        </div>
                                                                    </div>

                                                                    {/* Subtitle */}
                                                                    {evt.subtitle && (
                                                                        <p className="text-[11px] text-gray-500 mt-1">
                                                                            {evt.subtitle}
                                                                        </p>
                                                                    )}

                                                                    {/* Message Body / Content */}
                                                                    {evt.description && (
                                                                        <div className={`mt-2 p-2.5 rounded-lg text-xs leading-relaxed font-sans whitespace-pre-line ${
                                                                            isSms && evt.direction === 'inbound'
                                                                                ? 'bg-blue-50/60 text-blue-950 border border-blue-100'
                                                                                : isSms
                                                                                ? 'bg-indigo-50/50 text-indigo-950 border border-indigo-100'
                                                                                : 'bg-gray-50 text-gray-800 border border-gray-150'
                                                                        }`}>
                                                                            {evt.description}
                                                                        </div>
                                                                    )}

                                                                    {/* Actions & Deep Links */}
                                                                    <div className="flex items-center gap-2 flex-wrap mt-2.5">
                                                                        {evt.quoteId && (
                                                                            <button
                                                                                onClick={(e) => {
                                                                                    e.stopPropagation();
                                                                                    if (onViewQuote) onViewQuote(evt.quoteId!);
                                                                                    else navigate(orgPath(`/quotes/${evt.quoteId}`));
                                                                                }}
                                                                                className="px-2.5 py-1 bg-emerald-50 text-emerald-700 rounded-md hover:bg-emerald-100 font-bold text-[11px] flex items-center gap-1 transition cursor-pointer"
                                                                            >
                                                                                <FileText className="w-3 h-3" />
                                                                                <span>View Quote #{evt.quoteNumber || evt.quoteId.substring(0, 6)}</span>
                                                                                <ExternalLink className="w-3 h-3 ml-0.5" />
                                                                            </button>
                                                                        )}

                                                                        {evt.jobId && (
                                                                            <button
                                                                                onClick={(e) => {
                                                                                    e.stopPropagation();
                                                                                    if (onViewJob) onViewJob(evt.jobId!);
                                                                                    else navigate(orgPath(`/jobs/${evt.jobId}`));
                                                                                }}
                                                                                className="px-2.5 py-1 bg-blue-50 text-blue-700 rounded-md hover:bg-blue-100 font-bold text-[11px] flex items-center gap-1 transition cursor-pointer"
                                                                            >
                                                                                <Wrench className="w-3 h-3" />
                                                                                <span>View Job</span>
                                                                                <ExternalLink className="w-3 h-3 ml-0.5" />
                                                                            </button>
                                                                        )}

                                                                        {evt.amount !== undefined && (
                                                                            <span className="text-[11px] font-bold text-gray-700 bg-gray-100 px-2 py-0.5 rounded-md">
                                                                                Amount: ${evt.amount.toFixed(2)}
                                                                            </span>
                                                                        )}
                                                                    </div>
                                                                </div>
                                                            </div>
                                                        );
                                                    })}
                                                </div>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    ))}
                </div>
            ) : (
                /* ═══════════ FLAT STREAM VIEW ═══════════ */
                <div className="relative pl-6 sm:pl-8 space-y-3 before:absolute before:left-3 sm:before:left-4 before:top-2 before:bottom-2 before:w-0.5 before:bg-gradient-to-b before:from-indigo-400 before:via-gray-200 before:to-gray-100">
                    {filteredEvents.map(evt => {
                        const isExpanded = expandedEventIds.has(evt.id);
                        const hasDetails = Boolean(evt.description || evt.amount || evt.jobId || evt.quoteNumber);
                        const isCopied = copiedEventId === evt.id;

                        return (
                            <div key={evt.id} className="relative group">
                                {/* Timeline Node Icon */}
                                <div className="absolute -left-6 sm:-left-8 top-1.5 w-6 h-6 rounded-full bg-white border-2 border-indigo-500 shadow-xs flex items-center justify-center flex-shrink-0 z-10">
                                    {getEventIcon(evt.category, evt.direction)}
                                </div>

                                {/* Event Card */}
                                <div
                                    onClick={() => hasDetails && toggleExpand(evt.id)}
                                    className={`p-3.5 bg-white rounded-xl border transition shadow-xs ${
                                        hasDetails ? 'cursor-pointer hover:border-indigo-300 hover:shadow-sm' : ''
                                    } ${
                                        evt.category === 'approval' 
                                            ? 'border-emerald-200 bg-emerald-50/20'
                                            : evt.category === 'sms' && evt.direction === 'inbound'
                                            ? 'border-blue-200 bg-blue-50/20'
                                            : 'border-gray-200'
                                    }`}
                                >
                                    <div className="flex items-start justify-between gap-3">
                                        <div className="space-y-1 flex-1 min-w-0">
                                            {/* Header Line */}
                                            <div className="flex items-center gap-2 flex-wrap">
                                                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-md uppercase tracking-wider border ${evt.badge.bg} ${evt.badge.text} ${evt.badge.border || 'border-transparent'}`}>
                                                    {evt.badge.label}
                                                </span>

                                                <span className="text-[11px] font-bold text-gray-900 truncate">
                                                    {evt.title}
                                                </span>
                                            </div>

                                            {/* Subtitle / Reference */}
                                            {evt.subtitle && (
                                                <p className="text-xs text-gray-500">
                                                    {evt.subtitle}
                                                </p>
                                            )}
                                        </div>

                                        {/* Timestamp & Expand Arrow */}
                                        <div className="flex items-center gap-2 flex-shrink-0 text-right">
                                            <div className="text-[10px] text-gray-400 font-mono">
                                                <div className="font-bold text-gray-600">{formatEventDate(evt.timestamp)}</div>
                                                <div>{formatEventTime(evt.timestamp)}</div>
                                            </div>
                                            {hasDetails && (
                                                <button className="text-gray-400 hover:text-gray-600 p-0.5">
                                                    {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                                                </button>
                                            )}
                                        </div>
                                    </div>

                                    {/* Expandable Content Box */}
                                    {isExpanded && (
                                        <div className="mt-3 pt-3 border-t border-gray-100 text-xs space-y-2.5 animate-in fade-in duration-150">
                                            {evt.description && (
                                                <div className="bg-gray-50 rounded-lg p-2.5 border border-gray-150 text-gray-700 leading-relaxed font-sans whitespace-pre-line flex items-start justify-between gap-2">
                                                    <span>{evt.description}</span>
                                                    <button
                                                        onClick={(e) => handleCopy(evt.description!, evt.id, e)}
                                                        className="p-1 text-gray-400 hover:text-gray-600 rounded transition flex-shrink-0"
                                                        title="Copy text"
                                                    >
                                                        {isCopied ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                                                    </button>
                                                </div>
                                            )}

                                            {/* Action / Linking Badges */}
                                            <div className="flex items-center gap-2 flex-wrap pt-1">
                                                {evt.quoteId && (
                                                    <button
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            if (onViewQuote) onViewQuote(evt.quoteId!);
                                                            else navigate(orgPath(`/quotes/${evt.quoteId}`));
                                                        }}
                                                        className="px-2.5 py-1 bg-emerald-50 text-emerald-700 rounded-md hover:bg-emerald-100 font-bold text-[11px] flex items-center gap-1 transition cursor-pointer"
                                                    >
                                                        <FileText className="w-3 h-3" />
                                                        <span>View Quote #{evt.quoteNumber || evt.quoteId.substring(0, 6)}</span>
                                                        <ExternalLink className="w-3 h-3 ml-0.5" />
                                                    </button>
                                                )}

                                                {evt.jobId && (
                                                    <button
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            if (onViewJob) onViewJob(evt.jobId!);
                                                            else navigate(orgPath(`/jobs/${evt.jobId}`));
                                                        }}
                                                        className="px-2.5 py-1 bg-blue-50 text-blue-700 rounded-md hover:bg-blue-100 font-bold text-[11px] flex items-center gap-1 transition cursor-pointer"
                                                    >
                                                        <Wrench className="w-3 h-3" />
                                                        <span>View Job</span>
                                                        <ExternalLink className="w-3 h-3 ml-0.5" />
                                                    </button>
                                                )}

                                                {evt.amount !== undefined && (
                                                    <span className="text-[11px] font-bold text-gray-700 bg-gray-100 px-2 py-0.5 rounded-md">
                                                        Amount: ${evt.amount.toFixed(2)}
                                                    </span>
                                                )}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
};
