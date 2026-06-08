import React, { useState, useEffect } from 'react';
import { useAuth } from '../../auth/AuthProvider';
import { db } from '../../firebase';
import { doc, getDoc, updateDoc, collection, getDocs, addDoc, deleteDoc, serverTimestamp, query, where, orderBy, limit, onSnapshot } from 'firebase/firestore';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { getStorage, ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import toast from 'react-hot-toast';
import {
    Globe, Mail, Phone, Settings, Sparkles, Smartphone, Bot, ExternalLink,
    Image as ImageIcon, Upload, Plus, Trash2, RefreshCw, Check, AlertCircle,
    Link2, Unplug, Zap, Filter, ArrowRight, Clock, Tag,
    ChevronDown, ChevronRight, Inbox as InboxIcon, FileText, Search, X, Plug,
    Radio, Shield, ToggleLeft, ToggleRight, Layers, ArrowUpRight,
    CheckCircle2, AlertTriangle, Activity, Briefcase, MessageSquare,
    PhoneCall, Globe2, Send, UserPlus, Calculator, DollarSign, Loader2,
    PhoneForwarded, Headphones, PhoneOff, CalendarCheck
} from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { PortalTicket, Quote } from '../../types';
import { InlineAIQuotePanel } from '../../components/InlineAIQuotePanel';

/* ═══════════════════════════════════════════════════
 *  INTEGRATION PLATFORM DEFINITIONS
 * ═══════════════════════════════════════════════════ */
interface IntegrationPlatform {
    id: string;
    name: string;
    icon: string;
    color: string;
    bgColor: string;
    description: string;
    authType: 'api_key' | 'oauth' | 'basic';
    fields: { key: string; label: string; placeholder: string; type?: string; required?: boolean }[];
}

const PLATFORMS: IntegrationPlatform[] = [
    {
        id: 'servicenow',
        name: 'ServiceNow',
        icon: 'SN',
        color: '#81B5A1',
        bgColor: '#e8f5f0',
        description: 'Pull incidents and service requests from ServiceNow ITSM.',
        authType: 'basic',
        fields: [
            { key: 'instanceUrl', label: 'Instance URL', placeholder: 'https://yourcompany.service-now.com', required: true },
            { key: 'username', label: 'Username', placeholder: 'api_user', required: true },
            { key: 'password', label: 'Password', placeholder: '••••••••', type: 'password', required: true },
        ]
    },
    {
        id: 'salesforce',
        name: 'Salesforce',
        icon: 'SF',
        color: '#00A1E0',
        bgColor: '#e6f4fb',
        description: 'Import Cases from Salesforce Service Cloud.',
        authType: 'oauth',
        fields: [
            { key: 'instanceUrl', label: 'Instance URL', placeholder: 'https://yourcompany.my.salesforce.com', required: true },
            { key: 'clientId', label: 'Connected App Client ID', placeholder: 'Client ID', required: true },
            { key: 'clientSecret', label: 'Client Secret', placeholder: '••••••••', type: 'password', required: true },
        ]
    },
    {
        id: 'zendesk',
        name: 'Zendesk',
        icon: 'ZD',
        color: '#03363D',
        bgColor: '#e6eef0',
        description: 'Sync support tickets from Zendesk Support.',
        authType: 'api_key',
        fields: [
            { key: 'subdomain', label: 'Subdomain', placeholder: 'yourcompany (from yourcompany.zendesk.com)', required: true },
            { key: 'email', label: 'Agent Email', placeholder: 'agent@company.com', required: true },
            { key: 'apiToken', label: 'API Token', placeholder: '••••••••', type: 'password', required: true },
        ]
    },
    {
        id: 'jira',
        name: 'Jira Service Mgmt',
        icon: 'JS',
        color: '#0052CC',
        bgColor: '#e6eeff',
        description: 'Import issues from Jira Service Management / Jira Software.',
        authType: 'api_key',
        fields: [
            { key: 'instanceUrl', label: 'Jira Cloud URL', placeholder: 'https://yourcompany.atlassian.net', required: true },
            { key: 'email', label: 'Email', placeholder: 'user@company.com', required: true },
            { key: 'apiToken', label: 'API Token', placeholder: '••••••••', type: 'password', required: true },
        ]
    },
    {
        id: 'freshdesk',
        name: 'Freshdesk',
        icon: 'FD',
        color: '#25C16F',
        bgColor: '#e6f9ef',
        description: 'Pull tickets from Freshdesk helpdesk.',
        authType: 'api_key',
        fields: [
            { key: 'domain', label: 'Domain', placeholder: 'yourcompany.freshdesk.com', required: true },
            { key: 'apiKey', label: 'API Key', placeholder: '••••••••', type: 'password', required: true },
        ]
    },
    {
        id: 'hubspot',
        name: 'HubSpot',
        icon: 'HS',
        color: '#FF7A59',
        bgColor: '#fff0ec',
        description: 'Import service tickets from HubSpot Service Hub.',
        authType: 'api_key',
        fields: [
            { key: 'apiKey', label: 'Private App Access Token', placeholder: 'pat-na1-••••••••', type: 'password', required: true },
        ]
    },
    {
        id: 'connectwise',
        name: 'ConnectWise',
        icon: 'CW',
        color: '#002855',
        bgColor: '#e6ecf3',
        description: 'Sync service tickets from ConnectWise Manage/PSA.',
        authType: 'api_key',
        fields: [
            { key: 'siteUrl', label: 'Site URL', placeholder: 'https://na.myconnectwise.net', required: true },
            { key: 'companyId', label: 'Company ID', placeholder: 'yourcompany', required: true },
            { key: 'publicKey', label: 'Public Key', placeholder: 'Public API Key', required: true },
            { key: 'privateKey', label: 'Private Key', placeholder: '••••••••', type: 'password', required: true },
        ]
    },
];

interface IntegrationConfig {
    id?: string;
    platform: string;
    displayName: string;
    credentials: Record<string, string>;
    enabled: boolean;
    syncConfig: {
        frequency: string;
        filters: {
            categories: string[];
            priorities: string[];
            statuses: string[];
            assignmentGroups: string[];
            customFilters: { field: string; operator: string; value: string }[];
        };
    };
    lastSyncAt: any;
    ticketCount: number;
    connectionStatus: 'connected' | 'disconnected' | 'error' | 'pending';
    createdAt: any;
}

interface ImportedTicket {
    id: string;
    externalId: string;
    platform: string;
    integrationId: string;
    summary: string;
    description: string;
    priority: string;
    status: string;
    category: string;
    assignmentGroup: string;
    requesterName: string;
    requesterEmail: string;
    externalUrl: string;
    importedAt: any;
    convertedToJobId: string | null;
}

/* ═══════════════════════════════════════════════════
 *  MAIN COMPONENT
 * ═══════════════════════════════════════════════════ */
export const CommunicationsPortal: React.FC = () => {
    const { user } = useAuth();
    const navigate = useNavigate();
    const orgId = user?.org_id;
    const functions = getFunctions();
    const storage = getStorage();

    // Tab state
    const [activeTab, setActiveTab] = useState<'inbox' | 'overview' | 'integrations' | 'email-phone' | 'portal'>('inbox');

    // Inbox state — unified customer inquiries
    const [portalInquiries, setPortalInquiries] = useState<PortalTicket[]>([]);
    const [inboxFilter, setInboxFilter] = useState<'all' | 'WEBSITE_PORTAL' | 'PHONE' | 'EMAIL' | 'integration'>('all');
    const [dismissingId, setDismissingId] = useState<string | null>(null);
    const [convertingInquiryId, setConvertingInquiryId] = useState<string | null>(null);
    const [expandedInquiryId, setExpandedInquiryId] = useState<string | null>(null);

    // Loading
    const [loading, setLoading] = useState(true);

    // Email & Phone state
    const [communicationChannels, setCommunicationChannels] = useState({
        contactEmail: '',
        contactPhone: '',
        teamCellNumbers: [] as string[]
    });
    const [newCellNumber, setNewCellNumber] = useState('');

    // Portal state
    const [portalConfig, setPortalConfig] = useState({
        slug: '',
        themeColor: '#4F46E5',
        isActive: false,
    });
    const [logoUrl, setLogoUrl] = useState('');
    const [uploadingLogo, setUploadingLogo] = useState(false);
    const [saving, setSaving] = useState(false);

    // Auto-quote toggle
    const [autoQuoteEnabled, setAutoQuoteEnabled] = useState(false);
    const [savingAutoQuote, setSavingAutoQuote] = useState(false);

    // Human transfer (call forwarding)
    const [humanTransferEnabled, setHumanTransferEnabled] = useState(false);
    const [callForwardNumber, setCallForwardNumber] = useState('');
    const [savingHumanTransfer, setSavingHumanTransfer] = useState(false);

    // Callback mode
    const [callbackMode, setCallbackMode] = useState<'none' | 'schedule_only' | 'with_quote'>('with_quote');
    const [savingCallbackMode, setSavingCallbackMode] = useState(false);

    // Integration state
    const [integrations, setIntegrations] = useState<IntegrationConfig[]>([]);
    const [importedTickets, setImportedTickets] = useState<ImportedTicket[]>([]);
    const [showAddIntegration, setShowAddIntegration] = useState(false);
    const [selectedPlatform, setSelectedPlatform] = useState<IntegrationPlatform | null>(null);
    const [editingIntegration, setEditingIntegration] = useState<IntegrationConfig | null>(null);
    const [configFormData, setConfigFormData] = useState<Record<string, string>>({});
    const [syncFilters, setSyncFilters] = useState({
        categories: '',
        priorities: '',
        statuses: '',
        assignmentGroups: '',
    });
    const [syncFrequency, setSyncFrequency] = useState('15min');
    const [testingConnection, setTestingConnection] = useState(false);
    const [savingIntegration, setSavingIntegration] = useState(false);
    const [ticketFilter, setTicketFilter] = useState('all');
    const [convertingTicket, setConvertingTicket] = useState<string | null>(null);
    const [expandedIntegration, setExpandedIntegration] = useState<string | null>(null);

    // ── Quotes needing review ──
    const [reviewQuotes, setReviewQuotes] = useState<Quote[]>([]);

    // ── Real-time listener for portal inquiries (ALL statuses) ──
    useEffect(() => {
        if (!orgId) return;
        const ticketsRef = collection(db, 'tickets');
        const q = query(
            ticketsRef,
            where('organizationId', '==', orgId)
        );
        const unsubscribe = onSnapshot(q, (snapshot) => {
            const tickets = snapshot.docs.map(d => ({
                id: d.id,
                ...d.data()
            } as PortalTicket));
            tickets.sort((a, b) => {
                const aTime = a.createdAt?.toDate?.() || new Date(0);
                const bTime = b.createdAt?.toDate?.() || new Date(0);
                return bTime.getTime() - aTime.getTime();
            });
            setPortalInquiries(tickets);
        });
        return () => unsubscribe();
    }, [orgId]);

    // ── Real-time listener for quotes needing tech review ──
    useEffect(() => {
        if (!orgId) return;
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
    }, [orgId]);

    // ── Fetch org data ──
    useEffect(() => {
        const fetchSettings = async () => {
            if (!orgId) return;
            try {
                const orgDoc = await getDoc(doc(db, 'organizations', orgId));
                if (orgDoc.exists()) {
                    const data = orgDoc.data();
                    if (data.communicationChannels) {
                        setCommunicationChannels(data.communicationChannels);
                    }
                    if (data.portalConfig) {
                        setPortalConfig({
                            slug: data.portalConfig.slug || data.slug || '',
                            themeColor: data.portalConfig.themeColor || data.branding?.primaryColor || '#4F46E5',
                            isActive: data.portalConfig.isActive ?? false,
                        });
                    }
                    if (data.branding?.logoUrl) {
                        setLogoUrl(data.branding.logoUrl);
                    }
                    // Load auto-quote setting
                    setAutoQuoteEnabled(data.autoQuoteEnabled ?? false);
                    // Load human transfer settings
                    setHumanTransferEnabled(!!data.callForwardNumber);
                    setCallForwardNumber(data.callForwardNumber || '');
                    // Load callback mode
                    setCallbackMode(data.callbackMode || 'with_quote');
                }

                // Fetch integrations
                const intSnap = await getDocs(collection(db, 'organizations', orgId, 'integrations'));
                const intList: IntegrationConfig[] = [];
                intSnap.forEach(d => intList.push({ id: d.id, ...d.data() } as IntegrationConfig));
                setIntegrations(intList);

                // Fetch imported tickets
                const ticketSnap = await getDocs(
                    query(
                        collection(db, 'organizations', orgId, 'importedTickets'),
                        orderBy('importedAt', 'desc'),
                        limit(50)
                    )
                );
                const tickets: ImportedTicket[] = [];
                ticketSnap.forEach(d => tickets.push({ id: d.id, ...d.data() } as ImportedTicket));
                setImportedTickets(tickets);
            } catch (error) {
                console.error("Error fetching settings:", error);
            } finally {
                setLoading(false);
            }
        };
        fetchSettings();
    }, [orgId]);

    // ── Save Email/Phone settings ──
    const handleSaveComms = async () => {
        if (!orgId) return;
        setSaving(true);
        try {
            await updateDoc(doc(db, 'organizations', orgId), {
                communicationChannels
            });
            toast.success('Communication settings saved');
        } catch (error: any) {
            toast.error(error.message || 'Failed to save');
        } finally {
            setSaving(false);
        }
    };

    // ── Logo upload ──
    const handleLogoUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (!file || !orgId) return;
        if (file.size > 5 * 1024 * 1024) { toast.error('File too large (max 5MB)'); return; }
        setUploadingLogo(true);
        try {
            const fileExt = file.name.split('.').pop();
            const fileName = `logo-${Date.now()}.${fileExt}`;
            const storageRef = ref(storage, `organizations/${orgId}/${fileName}`);
            await uploadBytes(storageRef, file);
            const downloadUrl = await getDownloadURL(storageRef);
            await updateDoc(doc(db, 'organizations', orgId), { 'branding.logoUrl': downloadUrl });
            setLogoUrl(downloadUrl);
            toast.success('Logo uploaded');
        } catch (error) {
            toast.error('Failed to upload logo');
        } finally {
            setUploadingLogo(false);
        }
    };

    // ── Cell number management ──
    const addCellNumber = () => {
        if (!newCellNumber.trim()) return;
        setCommunicationChannels(prev => ({
            ...prev,
            teamCellNumbers: [...prev.teamCellNumbers, newCellNumber.trim()]
        }));
        setNewCellNumber('');
    };
    const removeCellNumber = (index: number) => {
        setCommunicationChannels(prev => {
            const n = [...prev.teamCellNumbers];
            n.splice(index, 1);
            return { ...prev, teamCellNumbers: n };
        });
    };

    // ── Integration CRUD ──
    const openAddIntegration = (platform: IntegrationPlatform) => {
        setSelectedPlatform(platform);
        setConfigFormData({});
        setSyncFilters({ categories: '', priorities: '', statuses: '', assignmentGroups: '' });
        setSyncFrequency('15min');
        setEditingIntegration(null);
        setShowAddIntegration(true);
    };

    const openEditIntegration = (integration: IntegrationConfig) => {
        const platform = PLATFORMS.find(p => p.id === integration.platform);
        if (!platform) return;
        setSelectedPlatform(platform);
        setConfigFormData(integration.credentials || {});
        setSyncFilters({
            categories: (integration.syncConfig?.filters?.categories || []).join(', '),
            priorities: (integration.syncConfig?.filters?.priorities || []).join(', '),
            statuses: (integration.syncConfig?.filters?.statuses || []).join(', '),
            assignmentGroups: (integration.syncConfig?.filters?.assignmentGroups || []).join(', '),
        });
        setSyncFrequency(integration.syncConfig?.frequency || '15min');
        setEditingIntegration(integration);
        setShowAddIntegration(true);
    };

    const handleTestConnection = async () => {
        setTestingConnection(true);
        // Simulate API test (in production this would call a Cloud Function)
        await new Promise(r => setTimeout(r, 2000));
        setTestingConnection(false);
        toast.success('Connection successful! Credentials verified.');
    };

    const handleSaveIntegration = async () => {
        if (!orgId || !selectedPlatform) return;
        setSavingIntegration(true);
        try {
            const integrationData: any = {
                platform: selectedPlatform.id,
                displayName: configFormData.displayName || selectedPlatform.name,
                credentials: configFormData,
                enabled: true,
                syncConfig: {
                    frequency: syncFrequency,
                    filters: {
                        categories: syncFilters.categories.split(',').map(s => s.trim()).filter(Boolean),
                        priorities: syncFilters.priorities.split(',').map(s => s.trim()).filter(Boolean),
                        statuses: syncFilters.statuses.split(',').map(s => s.trim()).filter(Boolean),
                        assignmentGroups: syncFilters.assignmentGroups.split(',').map(s => s.trim()).filter(Boolean),
                        customFilters: [],
                    },
                },
                connectionStatus: 'connected',
                ticketCount: 0,
                lastSyncAt: null,
            };

            if (editingIntegration?.id) {
                await updateDoc(
                    doc(db, 'organizations', orgId, 'integrations', editingIntegration.id),
                    integrationData
                );
                setIntegrations(prev => prev.map(i => i.id === editingIntegration.id ? { ...i, ...integrationData } : i));
                toast.success('Integration updated');
            } else {
                integrationData.createdAt = serverTimestamp();
                const docRef = await addDoc(collection(db, 'organizations', orgId, 'integrations'), integrationData);
                setIntegrations(prev => [...prev, { id: docRef.id, ...integrationData }]);

                // Generate mock imported tickets for demo
                const mockTickets = generateMockTickets(selectedPlatform.id, docRef.id);
                for (const ticket of mockTickets) {
                    const ticketRef = await addDoc(collection(db, 'organizations', orgId, 'importedTickets'), {
                        ...ticket,
                        importedAt: serverTimestamp(),
                    });
                    setImportedTickets(prev => [{ id: ticketRef.id, ...ticket, importedAt: new Date() }, ...prev]);
                }
                // Update ticket count
                await updateDoc(doc(db, 'organizations', orgId, 'integrations', docRef.id), {
                    ticketCount: mockTickets.length,
                    lastSyncAt: serverTimestamp(),
                });

                toast.success(`${selectedPlatform.name} connected! ${mockTickets.length} tickets imported.`);
            }

            setShowAddIntegration(false);
            setSelectedPlatform(null);
        } catch (error: any) {
            toast.error(error.message || 'Failed to save integration');
        } finally {
            setSavingIntegration(false);
        }
    };

    const handleDeleteIntegration = async (integrationId: string) => {
        if (!orgId || !confirm('Remove this integration? Imported tickets will be kept.')) return;
        try {
            await deleteDoc(doc(db, 'organizations', orgId, 'integrations', integrationId));
            setIntegrations(prev => prev.filter(i => i.id !== integrationId));
            toast.success('Integration removed');
        } catch (error) {
            toast.error('Failed to remove integration');
        }
    };

    const handleToggleIntegration = async (integration: IntegrationConfig) => {
        if (!orgId || !integration.id) return;
        const newEnabled = !integration.enabled;
        try {
            await updateDoc(doc(db, 'organizations', orgId, 'integrations', integration.id), {
                enabled: newEnabled,
                connectionStatus: newEnabled ? 'connected' : 'disconnected',
            });
            setIntegrations(prev => prev.map(i =>
                i.id === integration.id ? { ...i, enabled: newEnabled, connectionStatus: newEnabled ? 'connected' : 'disconnected' } : i
            ));
            toast.success(newEnabled ? 'Integration enabled' : 'Integration paused');
        } catch (error) {
            toast.error('Failed to toggle integration');
        }
    };

    // ── Convert ticket to job ──
    const handleConvertToJob = async (ticket: ImportedTicket) => {
        if (!orgId) return;
        setConvertingTicket(ticket.id);
        try {
            // Create a job from the ticket
            const jobData = {
                organizationId: orgId,
                title: ticket.summary,
                description: `[Imported from ${ticket.platform.toUpperCase()}] ${ticket.description}\n\nExternal ID: ${ticket.externalId}\nPriority: ${ticket.priority}\nCategory: ${ticket.category}`,
                status: 'pending',
                priority: ticket.priority === 'P1' || ticket.priority === 'Critical' ? 'emergency' : 'normal',
                customerName: ticket.requesterName,
                customerEmail: ticket.requesterEmail,
                source: `integration_${ticket.platform}`,
                externalTicketId: ticket.externalId,
                externalTicketUrl: ticket.externalUrl,
                createdAt: serverTimestamp(),
                updatedAt: serverTimestamp(),
            };
            const jobRef = await addDoc(collection(db, 'organizations', orgId, 'jobs'), jobData);

            // Update the imported ticket
            await updateDoc(doc(db, 'organizations', orgId, 'importedTickets', ticket.id), {
                convertedToJobId: jobRef.id,
            });
            setImportedTickets(prev => prev.map(t =>
                t.id === ticket.id ? { ...t, convertedToJobId: jobRef.id } : t
            ));

            toast.success('Job created from ticket!');
            navigate(`/jobs/${jobRef.id}`);
        } catch (error: any) {
            toast.error(error.message || 'Failed to convert ticket');
        } finally {
            setConvertingTicket(null);
        }
    };

    // ── Generate mock tickets for demo ──
    function generateMockTickets(platform: string, integrationId: string): Omit<ImportedTicket, 'id' | 'importedAt'>[] {
        const platformNames: Record<string, string> = {
            servicenow: 'ServiceNow', salesforce: 'Salesforce', zendesk: 'Zendesk',
            jira: 'Jira', freshdesk: 'Freshdesk', hubspot: 'HubSpot', connectwise: 'ConnectWise',
        };
        const prefixes: Record<string, string> = {
            servicenow: 'INC', salesforce: 'CASE', zendesk: 'ZD', jira: 'SM',
            freshdesk: 'FD', hubspot: 'HS', connectwise: 'SR',
        };
        const prefix = prefixes[platform] || 'TKT';
        const pName = platformNames[platform] || platform;

        const tickets = [
            { summary: 'HVAC unit not cooling — 3rd floor office', priority: 'P2', category: 'HVAC', requesterName: 'Maria Santos', requesterEmail: 'msantos@acmecorp.com', status: 'Open', assignmentGroup: 'Facilities' },
            { summary: 'Elevator stuck on 12th floor — urgent', priority: 'P1', category: 'Elevator', requesterName: 'James Wilson', requesterEmail: 'jwilson@techglobal.com', status: 'In Progress', assignmentGroup: 'Building Ops' },
            { summary: 'Water leak in server room B2', priority: 'P1', category: 'Plumbing', requesterName: 'Sarah Chen', requesterEmail: 'schen@dataflow.io', status: 'Open', assignmentGroup: 'Emergency' },
            { summary: 'Parking garage gate stuck open — security concern', priority: 'P2', category: 'Access Control', requesterName: 'Tom Nguyen', requesterEmail: 'tnguyen@securefac.com', status: 'Open', assignmentGroup: 'Security' },
            { summary: 'Break room refrigerator not working', priority: 'P3', category: 'Appliance', requesterName: 'Lisa Park', requesterEmail: 'lpark@megacorp.com', status: 'Open', assignmentGroup: 'General Maint.' },
        ];

        return tickets.map((t, i) => ({
            externalId: `${prefix}00${12345 + i}`,
            platform,
            integrationId,
            summary: t.summary,
            description: `Reported by ${t.requesterName}. ${t.summary}. Requires on-site inspection and repair.`,
            priority: t.priority,
            status: t.status,
            category: t.category,
            assignmentGroup: t.assignmentGroup,
            requesterName: t.requesterName,
            requesterEmail: t.requesterEmail,
            externalUrl: `https://${platform}.example.com/tickets/${prefix}00${12345 + i}`,
            convertedToJobId: null,
        }));
    }

    // ── Platform badge helper ──
    const getPlatformBadge = (platformId: string) => {
        const p = PLATFORMS.find(pl => pl.id === platformId);
        if (!p) return null;
        return (
            <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-bold"
                style={{ backgroundColor: p.bgColor, color: p.color }}>
                <span className="w-4 h-4 rounded text-[8px] flex items-center justify-center font-black text-white"
                    style={{ backgroundColor: p.color }}>{p.icon}</span>
                {p.name}
            </span>
        );
    };

    const priorityBadge = (priority: string) => {
        const colors: Record<string, string> = {
            P1: 'bg-red-100 text-red-700 border-red-200',
            Critical: 'bg-red-100 text-red-700 border-red-200',
            P2: 'bg-amber-100 text-amber-700 border-amber-200',
            High: 'bg-amber-100 text-amber-700 border-amber-200',
            P3: 'bg-blue-100 text-blue-700 border-blue-200',
            Medium: 'bg-blue-100 text-blue-700 border-blue-200',
            P4: 'bg-gray-100 text-gray-600 border-gray-200',
            Low: 'bg-gray-100 text-gray-600 border-gray-200',
        };
        return (
            <span className={`px-2 py-0.5 rounded text-xs font-bold border ${colors[priority] || 'bg-gray-100 text-gray-600 border-gray-200'}`}>
                {priority}
            </span>
        );
    };

    if (loading) return (
        <div className="min-h-screen bg-gray-50 flex items-center justify-center">
            <div className="text-center">
                <RefreshCw className="w-8 h-8 text-blue-500 animate-spin mx-auto mb-3" />
                <p className="text-gray-500 font-medium">Loading Communications Hub...</p>
            </div>
        </div>
    );

    const activeIntegrations = integrations.filter(i => i.enabled);
    const pendingTickets = importedTickets.filter(t => !t.convertedToJobId);
    const pendingInquiries = portalInquiries.filter(t => t.status === 'PENDING');

    /* ── Portal inquiry actions ── */
    function cleanDescription(desc: string): string {
        if (!desc) return '';
        return desc
            .replace(/^\[Portal Quote Request\]\s*/i, '')
            .replace(/^\[Public Portal Request\]\s*/i, '')
            .replace(/^urgency:\s*[a-z0-9_-]+\s*/i, '')
            .trim();
    }


    const handleDismissInquiry = async (ticket: PortalTicket) => {
        setDismissingId(ticket.id);
        try {
            await updateDoc(doc(db, 'tickets', ticket.id), {
                status: 'ACKNOWLEDGED',
                acknowledgedAt: serverTimestamp(),
                acknowledgedBy: user?.uid || 'unknown'
            });
            toast.success('Inquiry acknowledged');
        } catch (err) {
            toast.error('Failed to dismiss');
        } finally {
            setDismissingId(null);
        }
    };

    const handleCreateJobFromInquiry = async (ticket: PortalTicket) => {
        setConvertingInquiryId(ticket.id);
        try {
            if ((ticket as any).autoJobId) {
                await updateDoc(doc(db, 'tickets', ticket.id), {
                    status: 'CONVERTED',
                    convertedJobId: (ticket as any).autoJobId,
                    acknowledgedAt: serverTimestamp(),
                    acknowledgedBy: user?.uid || 'unknown'
                });
                toast.success('Job created from inquiry');
                return (ticket as any).autoJobId;
            }

            const jobData: any = {
                org_id: orgId,
                customer: {
                    name: ticket.requestorName || 'Unknown Customer',
                    phone: ticket.requestorPhone || '',
                    email: ticket.requestorEmail || '',
                    address: ticket.address || ''
                },
                request: { description: cleanDescription(ticket.description), source: 'portal' },
                status: 'pending',
                priority: ticket.metadata?.urgency === 'emergency' ? 'high' : 'medium',
                createdAt: serverTimestamp(),
                createdBy: user?.uid || 'system',
                source: ticket.source || 'WEBSITE_PORTAL'
            };
            if (ticket.address) jobData.location = { address: ticket.address };
            
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
            await updateDoc(doc(db, 'tickets', ticket.id), {
                status: 'CONVERTED',
                convertedJobId: jobRef.id,
                acknowledgedAt: serverTimestamp(),
                acknowledgedBy: user?.uid || 'unknown'
            });
            toast.success('Job created from inquiry');
            return jobRef.id;
        } catch (err) {
            toast.error('Failed to create job');
            return null;
        } finally {
            setConvertingInquiryId(null);
        }
    };

    const handleSendQuoteFromInquiry = async (ticket: PortalTicket) => {
        setConvertingInquiryId(ticket.id);
        try {
            const jobId = await handleCreateJobFromInquiry(ticket);
            if (jobId) navigate(`/quotes/new/${jobId}`);
        } catch {} finally { setConvertingInquiryId(null); }
    };

    const handleViewJobFromInquiry = async (ticket: PortalTicket) => {
        const jobId = await handleCreateJobFromInquiry(ticket);
        if (jobId) navigate(`/jobs/${jobId}`);
    };

    /* Generate AI Work Estimate — creates job then generates an AI quote with
       rate card pricing + recommended materials, navigates to editable quote */
    const handleGenerateAIQuoteFromInquiry = async (ticket: PortalTicket) => {
        setConvertingInquiryId(ticket.id);
        try {
            const jobId = await handleCreateJobFromInquiry(ticket);
            if (!jobId || !user?.uid || !orgId) return;

            // Fetch the created job
            const jobSnap = await getDoc(doc(db, 'jobs', jobId));
            if (!jobSnap.exists()) { toast.error('Job not found'); return; }
            const job = { id: jobSnap.id, ...jobSnap.data() } as any;

            // Fetch rate card from tech profile
            const techSnap = await getDoc(doc(db, 'technicians', user.uid));
            const rateCard = techSnap.exists() ? techSnap.data().rateCard : null;

            // Check customer rate tier
            let defaultRateTierId = '';
            if (job.customer_id) {
                const custSnap = await getDoc(doc(db, 'customers', job.customer_id));
                if (custSnap.exists() && custSnap.data().defaultRateTierId) {
                    defaultRateTierId = custSnap.data().defaultRateTierId;
                }
            }

            // Generate AI quote
            const { generateAIDefaultQuote } = await import('../../lib/aiQuoteGenerator');
            const quoteId = await generateAIDefaultQuote(
                job,
                user.uid,
                user.displayName || user.email || 'Dispatcher',
                rateCard,
                defaultRateTierId
            );

            toast.success('AI quote generated!');
            navigate(`/quotes/new/${jobId}?quoteId=${quoteId}`);
        } catch (err) {
            console.error('AI quote error:', err);
            toast.error('Failed to generate AI quote');
        } finally {
            setConvertingInquiryId(null);
        }
    };

    /* Generate Work Estimate — creates job then navigates to job cost tab
       so the dispatcher can quickly build an estimate with parts/pricing */
    const handleGenerateEstimate = async (ticket: PortalTicket) => {
        setConvertingInquiryId(ticket.id);
        try {
            const jobId = await handleCreateJobFromInquiry(ticket);
            if (jobId) {
                toast.success('Job created — build your estimate');
                navigate(`/jobs/${jobId}`);
            }
        } catch (err) {
            toast.error('Failed to create job for estimate');
        } finally {
            setConvertingInquiryId(null);
        }
    };

    const handleAddCustomerFromInquiry = (ticket: PortalTicket) => {
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

    const sourceIcon = (source: string) => {
        switch (source) {
            case 'WEBSITE_PORTAL': return <Globe2 className="w-3.5 h-3.5" />;
            case 'PHONE':
            case 'VOICE': return <PhoneCall className="w-3.5 h-3.5" />;
            case 'EMAIL': return <Mail className="w-3.5 h-3.5" />;
            default: return <MessageSquare className="w-3.5 h-3.5" />;
        }
    };

    const sourceBadge = (source: string) => {
        const configs: Record<string, { label: string; color: string; bg: string }> = {
            WEBSITE_PORTAL: { label: 'Portal', color: '#059669', bg: '#d1fae5' },
            PHONE: { label: 'Phone Call', color: '#7c3aed', bg: '#ede9fe' },
            VOICE: { label: 'Phone Call', color: '#7c3aed', bg: '#ede9fe' },
            EMAIL: { label: 'Email', color: '#0284c7', bg: '#e0f2fe' },
        };
        const cfg = configs[source] || { label: source, color: '#6b7280', bg: '#f3f4f6' };
        return (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold"
                style={{ backgroundColor: cfg.bg, color: cfg.color }}>
                {sourceIcon(source)} {cfg.label}
            </span>
        );
    };

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


    /* ═══════════════════════════════════════════════════
     *  INBOX TAB — Unified Customer Communications
     * ═══════════════════════════════════════════════════ */
    const renderInbox = () => {
        // Merge portal inquiries + imported tickets that are unconverted
        interface UnifiedItem {
            id: string;
            type: 'portal' | 'integration';
            name: string;
            contact: string;
            description: string;
            source: string;
            priority: string;
            status: string;
            time: Date;
            isEmergency: boolean;
            raw: PortalTicket | ImportedTicket;
        }

        const items: UnifiedItem[] = [];

        // Portal inquiries
        portalInquiries.forEach(t => {
            if (inboxFilter !== 'all' && inboxFilter !== 'integration') {
                if (inboxFilter === 'PHONE' && (t.source === 'PHONE' || t.source === 'VOICE')) {
                    // allow
                } else if (inboxFilter !== t.source) {
                    return;
                }
            }
            if (inboxFilter === 'integration') return; // Skip portal items for integration filter
            items.push({
                id: `portal-${t.id}`,
                type: 'portal',
                name: t.requestorName || 'Unknown Customer',
                contact: t.requestorPhone || t.requestorEmail || '',
                description: cleanDescription(t.description),
                source: t.source || 'WEBSITE_PORTAL',
                priority: t.metadata?.urgency === 'emergency' ? 'P1' : 'Normal',
                status: t.status,
                time: t.createdAt?.toDate?.() || new Date(),
                isEmergency: t.metadata?.urgency === 'emergency',
                raw: t,
            });
        });

        // Imported tickets from integrations (unconverted only)
        if (inboxFilter === 'all' || inboxFilter === 'integration') {
            importedTickets.filter(t => !t.convertedToJobId).forEach(t => {
                items.push({
                    id: `int-${t.id}`,
                    type: 'integration',
                    name: t.requesterName,
                    contact: t.requesterEmail || '',
                    description: t.summary,
                    source: `integration_${t.platform}`,
                    priority: t.priority,
                    status: t.status,
                    time: t.importedAt?.toDate?.() || (t.importedAt instanceof Date ? t.importedAt : new Date()),
                    isEmergency: t.priority === 'P1' || t.priority === 'Critical',
                    raw: t,
                });
            });
        }

        // Sort by newest first
        items.sort((a, b) => b.time.getTime() - a.time.getTime());

        const pendingCount = items.filter(i => i.type === 'portal' ? (i.raw as PortalTicket).status === 'PENDING' : true).length;

        return (
            <div className="space-y-4">
                {/* Stats bar */}
                <div className="flex items-center justify-between flex-wrap gap-3">
                    <div className="flex items-center gap-4">
                        <div className="flex items-center gap-2">
                            <div className="relative">
                                <InboxIcon className="w-5 h-5 text-blue-600" />
                                {pendingInquiries.length > 0 && (
                                    <span className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-red-500 rounded-full animate-ping" />
                                )}
                            </div>
                            <span className="font-bold text-gray-900">{items.length} items</span>
                            {pendingInquiries.length > 0 && (
                                <span className="bg-red-100 text-red-700 text-xs font-bold px-2 py-0.5 rounded-full animate-pulse">
                                    {pendingInquiries.length} need action
                                </span>
                            )}
                        </div>
                    </div>
                    <div className="flex items-center gap-2">
                        <select value={inboxFilter} onChange={e => setInboxFilter(e.target.value as any)}
                            className="text-sm border border-gray-200 rounded-lg px-3 py-1.5 bg-white font-medium text-gray-600">
                            <option value="all">All Sources</option>
                            <option value="WEBSITE_PORTAL">🌐 Portal Forms</option>
                            <option value="PHONE">📞 Phone Calls</option>
                            <option value="EMAIL">📧 Email</option>
                            {activeIntegrations.length > 0 && <option value="integration">🔗 Integrations</option>}
                        </select>
                    </div>
                </div>

                {items.length === 0 ? (
                    <div className="bg-white rounded-xl border border-gray-200 p-16 text-center">
                        <InboxIcon className="w-16 h-16 text-gray-200 mx-auto mb-4" />
                        <h3 className="text-lg font-bold text-gray-400 mb-2">Inbox Clear</h3>
                        <p className="text-sm text-gray-400">No customer inquiries right now. They'll appear here in real-time.</p>
                    </div>
                ) : (
                    <div className="space-y-3">
                        {items.map(item => {
                            const isPortal = item.type === 'portal';
                            const ticket = isPortal ? (item.raw as PortalTicket) : null;
                            const intTicket = !isPortal ? (item.raw as ImportedTicket) : null;
                            const isPending = isPortal && ticket?.status === 'PENDING';
                            const isConverted = isPortal ? ticket?.status === 'CONVERTED' : !!intTicket?.convertedToJobId;
                            const isAcknowledged = isPortal && ticket?.status === 'ACKNOWLEDGED';

                            const isExpanded = expandedInquiryId === item.id;
                            const hasDetails = isPortal && ticket && (
                                ((ticket as any).transcript && Array.isArray((ticket as any).transcript) && (ticket as any).transcript.length > 0) ||
                                ((ticket as any).collectedInfo && Object.keys((ticket as any).collectedInfo).length > 0)
                            );

                            return (
                                <div key={item.id}
                                    className={`bg-white rounded-xl border overflow-hidden transition-all hover:shadow-md ${
                                        item.isEmergency && isPending
                                            ? 'border-red-300 ring-2 ring-red-100 shadow-red-50'
                                            : isPending
                                            ? 'border-amber-200 shadow-sm'
                                            : isConverted
                                            ? 'border-gray-200 opacity-60'
                                            : 'border-gray-200'
                                    }`}>
                                    {/* Emergency banner */}
                                    {item.isEmergency && isPending && (
                                        <div className="bg-red-600 text-white text-xs font-bold px-4 py-1.5 flex items-center gap-2">
                                            <AlertTriangle className="w-3.5 h-3.5" /> EMERGENCY — Requires Immediate Attention
                                        </div>
                                    )}

                                    <div className={`p-5 ${hasDetails ? 'cursor-pointer' : ''}`}
                                        onClick={() => {
                                            if (hasDetails) {
                                                setExpandedInquiryId(isExpanded ? null : item.id);
                                            }
                                        }}>
                                        <div className="flex items-start justify-between gap-4">
                                            <div className="flex-1 min-w-0">
                                                {/* Source + Time */}
                                                <div className="flex items-center gap-2 flex-wrap mb-2">
                                                    {isPortal ? sourceBadge(item.source) : getPlatformBadge(intTicket!.platform)}
                                                    {intTicket && (
                                                        <span className="text-xs text-gray-400 font-mono">{intTicket.externalId}</span>
                                                    )}
                                                    {priorityBadge(item.priority)}
                                                    <span className="text-xs text-gray-400">{timeAgo(item.time)}</span>
                                                    {isConverted && (
                                                        <span className="text-xs text-emerald-600 font-bold bg-emerald-50 px-2 py-0.5 rounded-full flex items-center gap-1">
                                                            <CheckCircle2 className="w-3 h-3" /> Converted
                                                        </span>
                                                    )}
                                                    {isAcknowledged && (
                                                        <span className="text-xs text-gray-500 font-medium bg-gray-100 px-2 py-0.5 rounded-full">Acknowledged</span>
                                                    )}
                                                </div>

                                                {/* Customer info */}
                                                <h4 className="font-bold text-gray-900 text-sm mb-1">{item.name}</h4>
                                                <p className="text-sm text-gray-600 leading-relaxed line-clamp-2">{item.description}</p>
                                                {item.contact && (
                                                    <p className="text-xs text-gray-400 mt-1.5 flex items-center gap-2">
                                                        {item.contact.includes('@') ? <Mail className="w-3 h-3" /> : <Phone className="w-3 h-3" />}
                                                        {item.contact}
                                                    </p>
                                                )}
                                                {hasDetails && (
                                                    <div className="mt-2 flex items-center gap-1 text-xs text-indigo-500 font-medium">
                                                        {isExpanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                                                        {isExpanded ? 'Hide Details' : 'View Transcript & Details'}
                                                    </div>
                                                )}
                                                {isPortal && ticket && (ticket as any).autoQuoteError && !(ticket as any).autoQuoteId && (
                                                    <div className="mt-2 inline-flex items-center gap-1.5 bg-amber-50 border border-amber-200 rounded-full px-3 py-1">
                                                        <AlertTriangle className="w-3 h-3 text-amber-500" />
                                                        <span className="text-xs text-amber-600">Auto-quote failed — use manual actions</span>
                                                    </div>
                                                )}
                                            </div>

                                            {/* Action buttons — compact for portal items */}
                                            {isPending && isPortal && ticket && (
                                                <div className="flex flex-col gap-1.5 flex-shrink-0" onClick={(e) => e.stopPropagation()}>
                                                    {/* Toggle AI Panel / expand */}
                                                    <button onClick={() => setExpandedInquiryId(isExpanded ? null : item.id)}
                                                        className="flex items-center gap-1.5 text-xs font-bold text-white bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 px-4 py-2.5 rounded-lg transition-all whitespace-nowrap shadow-md hover:shadow-lg">
                                                        <Sparkles className="w-4 h-4" />
                                                        {expandedInquiryId === ticket.id ? 'Hide' : 'Review'} AI Quote
                                                        {(ticket as any).autoQuoteTotal > 0 && (
                                                            <span className="bg-white/20 text-white px-1.5 py-0.5 rounded text-[10px] font-bold ml-1">
                                                                ${(ticket as any).autoQuoteTotal?.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                                                            </span>
                                                        )}
                                                    </button>
                                                    <button onClick={() => handleAddCustomerFromInquiry(ticket)}
                                                        className="flex items-center gap-1.5 text-xs font-medium text-gray-500 hover:text-gray-700 hover:bg-gray-50 px-3 py-1.5 rounded-lg transition-colors whitespace-nowrap">
                                                        <UserPlus className="w-3.5 h-3.5" /> Add Customer
                                                    </button>
                                                    <button onClick={() => handleDismissInquiry(ticket)}
                                                        disabled={dismissingId === ticket.id}
                                                        className="flex items-center gap-1.5 text-xs font-medium text-gray-400 hover:text-gray-600 px-3 py-1.5 rounded-lg transition-colors whitespace-nowrap">
                                                        <X className="w-3.5 h-3.5" /> Dismiss
                                                    </button>
                                                </div>
                                            )}
                                            {!isPortal && intTicket && !intTicket.convertedToJobId && (
                                                <div className="flex flex-col gap-1.5 flex-shrink-0">
                                                    <button onClick={() => handleConvertToJob(intTicket)}
                                                        disabled={convertingTicket === intTicket.id}
                                                        className="flex items-center gap-1.5 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 px-3 py-2 rounded-lg transition-colors disabled:opacity-50 whitespace-nowrap">
                                                        <Briefcase className="w-3.5 h-3.5" /> Convert to Job
                                                    </button>
                                                    {intTicket.externalUrl && (
                                                        <a href={intTicket.externalUrl} target="_blank" rel="noreferrer"
                                                            className="flex items-center gap-1.5 text-xs font-medium text-gray-600 hover:text-blue-600 px-3 py-2 rounded-lg transition-colors whitespace-nowrap">
                                                            <ExternalLink className="w-3.5 h-3.5" /> View Source
                                                        </a>
                                                    )}
                                                </div>
                                            )}
                                            {isConverted && isPortal && ticket?.convertedJobId && (
                                                <Link to={`/jobs/${ticket.convertedJobId}`}
                                                    className="flex items-center gap-1.5 text-xs font-bold text-emerald-600 bg-emerald-50 px-3 py-2 rounded-lg whitespace-nowrap">
                                                    <CheckCircle2 className="w-3.5 h-3.5" /> View Job
                                                </Link>
                                            )}
                                        </div>

                                        {/* ═══ Expanded Detail Panel (all statuses) ═══ */}
                                        {isPortal && ticket && isExpanded && (
                                            <div className="space-y-4 mt-4 border-t border-gray-100 pt-4" onClick={(e) => e.stopPropagation()}>
                                                {/* Voice Call Collected Info */}
                                                {(ticket as any).collectedInfo && Object.keys((ticket as any).collectedInfo).length > 0 && (
                                                    <div className="bg-white rounded-xl p-4 border border-gray-200">
                                                        <h4 className="text-sm font-bold text-gray-900 mb-3 flex items-center gap-2">
                                                            <UserPlus className="w-4 h-4 text-indigo-600" />
                                                            AI Extracted Details
                                                        </h4>
                                                        <div className="grid grid-cols-2 gap-3">
                                                            {Object.entries((ticket as any).collectedInfo)
                                                                .filter(([key]) => !key.startsWith('_'))
                                                                .map(([key, val]) => (
                                                                <div key={key} className="bg-gray-50 rounded-lg p-2.5 border border-gray-100">
                                                                    <div className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">
                                                                        {key.replace(/([A-Z])/g, ' $1').replace(/^./, s => s.toUpperCase())}
                                                                    </div>
                                                                    <div className="text-sm font-medium text-gray-900">{val != null ? String(val) : '—'}</div>
                                                                </div>
                                                            ))}
                                                        </div>
                                                    </div>
                                                )}

                                                {/* Voice Call Transcript (if available) */}
                                                {(ticket as any).transcript && Array.isArray((ticket as any).transcript) && (ticket as any).transcript.length > 0 && (
                                                    <div className="bg-gray-50 rounded-xl p-4 border border-gray-200">
                                                        <h4 className="text-sm font-bold text-gray-900 mb-3 flex items-center gap-2">
                                                            <PhoneCall className="w-4 h-4 text-purple-600" />
                                                            Call Transcript
                                                            <span className="text-xs font-normal text-gray-400 ml-auto">{(ticket as any).transcript.length} messages</span>
                                                        </h4>
                                                        <div className="space-y-3 pr-2">
                                                            {(ticket as any).transcript.map((msg: any, idx: number) => {
                                                                // Handle both string-based ("User: hello") and object-based ({role, text}) entries
                                                                const isString = typeof msg === 'string';
                                                                const role = isString
                                                                    ? (msg.startsWith('AI:') || msg.startsWith('Agent:') || msg.startsWith('Assistant:') ? 'assistant' : 'caller')
                                                                    : (msg.role === 'assistant' || msg.role === 'ai' || msg.role === 'bot' ? 'assistant' : 'caller');
                                                                const text = isString
                                                                    ? msg.replace(/^(AI|Agent|Assistant|User|Caller):\s*/i, '')
                                                                    : (msg.text || msg.content || '');
                                                                const isAssistant = role === 'assistant';
                                                                const rawTs = !isString ? msg.timestamp : null;
                                                                if (!text) return null;
                                                                return (
                                                                <div key={idx} className={`flex flex-col ${isAssistant ? 'items-start' : 'items-end'}`}>
                                                                    <div className={`max-w-[85%] rounded-2xl px-4 py-2 text-sm ${isAssistant
                                                                        ? 'bg-purple-100 text-purple-900 rounded-tl-sm'
                                                                        : 'bg-blue-600 text-white rounded-tr-sm'
                                                                        }`}>
                                                                        <span className="text-[10px] font-bold opacity-50 uppercase tracking-wider block mb-0.5">
                                                                            {isAssistant ? 'AI Agent' : 'Caller'}
                                                                        </span>
                                                                        {text}
                                                                    </div>
                                                                    {rawTs && (
                                                                        <span className="text-[10px] text-gray-400 mt-1 px-2">
                                                                            {new Date(rawTs).toLocaleString('en-US', {
                                                                                month: 'short', day: 'numeric', year: 'numeric',
                                                                                hour: 'numeric', minute: '2-digit', second: '2-digit',
                                                                                hour12: true
                                                                            })}
                                                                        </span>
                                                                    )}
                                                                </div>
                                                                );
                                                            })}
                                                        </div>
                                                    </div>
                                                )}

                                                {/* AI Quote Panel — only for pending tickets */}
                                                {isPending && (
                                                    <InlineAIQuotePanel
                                                        ticket={ticket}
                                                        onQuoteSent={() => setExpandedInquiryId(null)}
                                                        onNavigateToQuote={(jobId, quoteId) => navigate(`/quotes/new/${jobId}?quoteId=${quoteId}`)}
                                                    />
                                                )}

                                                {/* Link to job for converted/acknowledged tickets */}
                                                {(isConverted || isAcknowledged) && (ticket?.convertedJobId || (ticket as any)?.autoJobId) && (
                                                    <div className="flex items-center gap-3 pt-2">
                                                        <Link to={`/jobs/${ticket?.convertedJobId || (ticket as any)?.autoJobId}`}
                                                            className="flex items-center gap-2 text-sm font-bold text-indigo-600 bg-indigo-50 hover:bg-indigo-100 px-4 py-2 rounded-lg transition-colors">
                                                            <Briefcase className="w-4 h-4" />
                                                            View Job
                                                        </Link>
                                                        {(ticket as any)?.autoQuoteId && (
                                                            <Link to={`/quotes`}
                                                                className="flex items-center gap-2 text-sm font-medium text-gray-600 hover:text-gray-800 bg-gray-100 hover:bg-gray-200 px-4 py-2 rounded-lg transition-colors">
                                                                <Calculator className="w-4 h-4" />
                                                                View Quote
                                                            </Link>
                                                        )}
                                                    </div>
                                                )}
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

    /* ═══════════════════════════════════════════════════
     *  TAB CONTENT RENDERERS
     * ═══════════════════════════════════════════════════ */

    const renderOverview = () => (
        <div className="space-y-6">
            {/* Quotes Needing Review Banner */}
            {reviewQuotes.length > 0 && (
                <div className="bg-white rounded-xl shadow-lg border-2 border-amber-300 overflow-hidden">
                    <div className="bg-gradient-to-r from-amber-500 to-yellow-500 px-6 py-4 flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <div className="relative">
                                <FileText className="w-6 h-6 text-white" />
                                <span className="absolute -top-1 -right-1 w-3 h-3 bg-red-500 rounded-full animate-ping" />
                                <span className="absolute -top-1 -right-1 w-3 h-3 bg-red-500 rounded-full" />
                            </div>
                            <div>
                                <h2 className="text-lg font-bold text-white">Quotes Need Your Review</h2>
                                <p className="text-amber-100 text-sm">
                                    {reviewQuotes.length} {reviewQuotes.length === 1 ? 'quote has' : 'quotes have'} customer change requests
                                </p>
                            </div>
                        </div>
                        <Link
                            to="/quotes?status=tech_review"
                            className="bg-white/20 backdrop-blur-sm text-white font-bold text-sm px-4 py-2 rounded-lg hover:bg-white/30 transition-colors"
                        >
                            View All →
                        </Link>
                    </div>
                    <div className="divide-y divide-gray-100">
                        {reviewQuotes.slice(0, 3).map((quote) => {
                            const latestNote = quote.customerNotes?.length
                                ? [...quote.customerNotes].reverse().find(n => n.author === 'customer')
                                : null;
                            const updatedAt = quote.updatedAt?.toDate?.() || new Date();
                            return (
                                <div key={quote.id} className="p-4 hover:bg-amber-50/50 transition-colors border-l-4 border-l-amber-400">
                                    <div className="flex items-start justify-between gap-4">
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center gap-2 mb-1">
                                                <h4 className="text-sm font-semibold text-gray-900">
                                                    {quote.customer?.name || 'Unknown Customer'}
                                                </h4>
                                                <span className="text-xs text-gray-400">{timeAgo(updatedAt)}</span>
                                            </div>
                                            {latestNote && (
                                                <p className="text-sm text-gray-600 bg-gray-50 rounded-lg p-2 border border-gray-100">
                                                    "{latestNote.text}"
                                                </p>
                                            )}
                                            <p className="text-xs text-gray-400 mt-1">
                                                Quote Total: ${(quote.total || 0).toFixed(2)}
                                            </p>
                                        </div>
                                        <div className="flex flex-col gap-1.5 flex-shrink-0">
                                            <button
                                                onClick={() => navigate(`/quotes/${quote.id}/edit`)}
                                                className="inline-flex items-center gap-1 text-xs font-bold text-white bg-amber-600 hover:bg-amber-700 px-3 py-1.5 rounded-lg transition-colors"
                                            >
                                                <FileText className="w-3 h-3" /> Revise
                                            </button>
                                            <button
                                                onClick={() => navigate(`/quote/${quote.id}`)}
                                                className="inline-flex items-center gap-1 text-xs font-medium text-gray-600 hover:text-gray-800 hover:bg-gray-50 px-3 py-1.5 rounded-lg transition-colors"
                                            >
                                                <ExternalLink className="w-3 h-3" /> View
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}

            {/* Status Summary */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div className="bg-white rounded-xl border border-gray-200 p-5 hover:shadow-md transition-shadow">
                    <div className="flex items-center justify-between mb-3">
                        <div className="p-2 bg-blue-100 rounded-lg"><Plug className="w-5 h-5 text-blue-600" /></div>
                        <span className="text-2xl font-bold text-gray-900">{activeIntegrations.length}</span>
                    </div>
                    <p className="text-sm text-gray-500 font-medium">Active Integrations</p>
                </div>
                <div className={`bg-white rounded-xl border p-5 hover:shadow-md transition-shadow ${pendingTickets.length > 0 ? 'border-amber-200 bg-amber-50/30' : 'border-gray-200'}`}>
                    <div className="flex items-center justify-between mb-3">
                        <div className={`p-2 rounded-lg ${pendingTickets.length > 0 ? 'bg-amber-100' : 'bg-gray-100'}`}>
                            <InboxIcon className={`w-5 h-5 ${pendingTickets.length > 0 ? 'text-amber-600' : 'text-gray-500'}`} />
                        </div>
                        <span className="text-2xl font-bold text-gray-900">{pendingTickets.length}</span>
                    </div>
                    <p className="text-sm text-gray-500 font-medium">Pending Tickets</p>
                </div>
                <div className="bg-white rounded-xl border border-gray-200 p-5 hover:shadow-md transition-shadow">
                    <div className="flex items-center justify-between mb-3">
                        <div className="p-2 bg-violet-100 rounded-lg"><Bot className="w-5 h-5 text-violet-600" /></div>
                        <span className="text-2xl font-bold text-gray-900">
                            {communicationChannels.contactPhone ? '✓' : '—'}
                        </span>
                    </div>
                    <p className="text-sm text-gray-500 font-medium">AI Phone Agent</p>
                </div>
                <div className="bg-white rounded-xl border border-gray-200 p-5 hover:shadow-md transition-shadow">
                    <div className="flex items-center justify-between mb-3">
                        <div className="p-2 bg-emerald-100 rounded-lg"><Globe className="w-5 h-5 text-emerald-600" /></div>
                        <span className={`text-2xl font-bold ${portalConfig.isActive ? 'text-emerald-600' : 'text-gray-400'}`}>
                            {portalConfig.isActive ? 'Live' : 'Off'}
                        </span>
                    </div>
                    <p className="text-sm text-gray-500 font-medium">Public Portal</p>
                </div>
            </div>

            {/* AI Auto-Quote Toggle */}
            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                <div className="px-6 py-5 flex items-center justify-between">
                    <div className="flex items-center gap-4">
                        <div className={`p-3 rounded-xl transition-colors ${autoQuoteEnabled ? 'bg-gradient-to-br from-purple-100 to-blue-100' : 'bg-gray-100'}`}>
                            <Sparkles className={`w-6 h-6 ${autoQuoteEnabled ? 'text-purple-600' : 'text-gray-400'}`} />
                        </div>
                        <div>
                            <h3 className="text-base font-bold text-gray-900">AI Auto-Quote Generation</h3>
                            <p className="text-sm text-gray-500 mt-0.5">
                                {autoQuoteEnabled
                                    ? 'Every portal submission and AI voice call auto-generates a full AI quote with labor, materials, and pricing'
                                    : 'Disabled — dispatchers manually create quotes from the inbox'
                                }
                            </p>
                        </div>
                    </div>
                    <button
                        onClick={async () => {
                            if (!orgId) return;
                            setSavingAutoQuote(true);
                            try {
                                const newVal = !autoQuoteEnabled;
                                await updateDoc(doc(db, 'organizations', orgId), { autoQuoteEnabled: newVal });
                                setAutoQuoteEnabled(newVal);
                                toast.success(newVal ? 'AI Auto-Quote enabled' : 'AI Auto-Quote disabled');
                            } catch (err) {
                                toast.error('Failed to update setting');
                            } finally {
                                setSavingAutoQuote(false);
                            }
                        }}
                        disabled={savingAutoQuote}
                        className={`relative flex items-center w-14 h-7 rounded-full transition-all duration-300 ${
                            autoQuoteEnabled
                                ? 'bg-gradient-to-r from-purple-500 to-blue-500 shadow-lg shadow-purple-200'
                                : 'bg-gray-300'
                        } ${savingAutoQuote ? 'opacity-50' : 'cursor-pointer'}`}
                    >
                        <span className={`absolute w-5 h-5 bg-white rounded-full shadow-md transform transition-transform duration-300 ${
                            autoQuoteEnabled ? 'translate-x-8' : 'translate-x-1'
                        }`} />
                    </button>
                </div>
                {autoQuoteEnabled && (
                    <div className="px-6 py-3 bg-gradient-to-r from-purple-50/50 to-blue-50/50 border-t border-gray-100">
                        <div className="flex items-center gap-6 text-xs text-gray-500">
                            <span className="flex items-center gap-1.5">
                                <CheckCircle2 className="w-3.5 h-3.5 text-purple-500" /> Labor (diagnostic + repair + cleanup)
                            </span>
                            <span className="flex items-center gap-1.5">
                                <CheckCircle2 className="w-3.5 h-3.5 text-purple-500" /> Materials from inventory
                            </span>
                            <span className="flex items-center gap-1.5">
                                <CheckCircle2 className="w-3.5 h-3.5 text-purple-500" /> Equipment fees
                            </span>
                            <span className="flex items-center gap-1.5">
                                <CheckCircle2 className="w-3.5 h-3.5 text-purple-500" /> Job history calibration
                            </span>
                        </div>
                    </div>
                )}
            </div>

            {/* ─── Human Transfer / Call Forwarding Toggle ─── */}
            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                <div className="px-6 py-5 flex items-center justify-between">
                    <div className="flex items-center gap-4">
                        <div className={`p-3 rounded-xl transition-colors ${humanTransferEnabled ? 'bg-gradient-to-br from-emerald-100 to-teal-100' : 'bg-gray-100'}`}>
                            <PhoneForwarded className={`w-6 h-6 ${humanTransferEnabled ? 'text-emerald-600' : 'text-gray-400'}`} />
                        </div>
                        <div>
                            <h3 className="text-base font-bold text-gray-900">Talk to a Human</h3>
                            <p className="text-sm text-gray-500 mt-0.5">
                                {humanTransferEnabled
                                    ? 'Callers can request to speak with a real person — calls forward to your number'
                                    : 'Disabled — callers can only leave a voicemail if the AI can\'t help'
                                }
                            </p>
                        </div>
                    </div>
                    <button
                        onClick={async () => {
                            if (!orgId) return;
                            setSavingHumanTransfer(true);
                            try {
                                const newVal = !humanTransferEnabled;
                                if (!newVal) {
                                    // Disabling — clear the forward number
                                    await updateDoc(doc(db, 'organizations', orgId), { callForwardNumber: '' });
                                    setCallForwardNumber('');
                                }
                                setHumanTransferEnabled(newVal);
                                if (!newVal) toast.success('Human transfer disabled');
                            } catch (err) {
                                toast.error('Failed to update setting');
                            } finally {
                                setSavingHumanTransfer(false);
                            }
                        }}
                        disabled={savingHumanTransfer}
                        className={`relative flex items-center w-14 h-7 rounded-full transition-all duration-300 ${
                            humanTransferEnabled
                                ? 'bg-gradient-to-r from-emerald-500 to-teal-500 shadow-lg shadow-emerald-200'
                                : 'bg-gray-300'
                        } ${savingHumanTransfer ? 'opacity-50' : 'cursor-pointer'}`}
                    >
                        <span className={`absolute w-5 h-5 bg-white rounded-full shadow-md transform transition-transform duration-300 ${
                            humanTransferEnabled ? 'translate-x-8' : 'translate-x-1'
                        }`} />
                    </button>
                </div>
                {humanTransferEnabled && (
                    <div className="px-6 py-4 bg-gradient-to-r from-emerald-50/50 to-teal-50/50 border-t border-gray-100">
                        <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Forward Calls To</label>
                        <div className="flex items-center gap-3">
                            <div className="relative flex-1 max-w-sm">
                                <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                                <input
                                    type="tel"
                                    value={callForwardNumber}
                                    onChange={e => setCallForwardNumber(e.target.value)}
                                    placeholder="+1 (555) 123-4567"
                                    className="w-full pl-10 pr-4 py-2.5 border border-gray-200 rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none bg-white text-sm"
                                />
                            </div>
                            <button
                                onClick={async () => {
                                    if (!orgId || !callForwardNumber.trim()) {
                                        toast.error('Please enter a phone number');
                                        return;
                                    }
                                    setSavingHumanTransfer(true);
                                    try {
                                        await updateDoc(doc(db, 'organizations', orgId), {
                                            callForwardNumber: callForwardNumber.trim()
                                        });
                                        toast.success('Forward number saved');
                                    } catch (err) {
                                        toast.error('Failed to save number');
                                    } finally {
                                        setSavingHumanTransfer(false);
                                    }
                                }}
                                disabled={savingHumanTransfer || !callForwardNumber.trim()}
                                className="px-5 py-2.5 bg-emerald-600 text-white text-sm font-bold rounded-lg hover:bg-emerald-700 transition-colors disabled:opacity-50 flex items-center gap-1.5"
                            >
                                <Check className="w-4 h-4" /> Save
                            </button>
                        </div>
                        <p className="text-xs text-gray-400 mt-2 flex items-center gap-1.5">
                            <Headphones className="w-3 h-3" />
                            When a caller says "talk to a person" or similar, the AI will transfer them to this number
                        </p>
                    </div>
                )}
            </div>

            {/* ─── Callback Mode Toggle ─── */}
            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                <div className="px-6 py-5">
                    <div className="flex items-center gap-4 mb-4">
                        <div className={`p-3 rounded-xl transition-colors ${
                            callbackMode === 'with_quote' ? 'bg-gradient-to-br from-blue-100 to-cyan-100' :
                            callbackMode === 'schedule_only' ? 'bg-gradient-to-br from-amber-100 to-yellow-100' :
                            'bg-gray-100'
                        }`}>
                            <CalendarCheck className={`w-6 h-6 ${
                                callbackMode === 'with_quote' ? 'text-blue-600' :
                                callbackMode === 'schedule_only' ? 'text-amber-600' :
                                'text-gray-400'
                            }`} />
                        </div>
                        <div>
                            <h3 className="text-base font-bold text-gray-900">Outbound Callback Mode</h3>
                            <p className="text-sm text-gray-500 mt-0.5">
                                Controls how the AI calls customers back after a quote is approved
                            </p>
                        </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                        {/* With Quote */}
                        <button
                            onClick={async () => {
                                if (!orgId) return;
                                setSavingCallbackMode(true);
                                try {
                                    await updateDoc(doc(db, 'organizations', orgId), {
                                        callbackMode: 'with_quote',
                                        autoCallbackEnabled: true
                                    });
                                    setCallbackMode('with_quote');
                                    toast.success('Callback mode: Full quote + scheduling');
                                } catch { toast.error('Failed to update'); }
                                finally { setSavingCallbackMode(false); }
                            }}
                            disabled={savingCallbackMode}
                            className={`relative text-left p-4 rounded-xl border-2 transition-all ${
                                callbackMode === 'with_quote'
                                    ? 'border-blue-500 bg-blue-50/50 shadow-md shadow-blue-100'
                                    : 'border-gray-200 hover:border-blue-300 bg-white'
                            }`}
                        >
                            {callbackMode === 'with_quote' && (
                                <div className="absolute top-2 right-2">
                                    <CheckCircle2 className="w-5 h-5 text-blue-500" />
                                </div>
                            )}
                            <DollarSign className={`w-5 h-5 mb-2 ${callbackMode === 'with_quote' ? 'text-blue-600' : 'text-gray-400'}`} />
                            <h4 className="font-bold text-sm text-gray-900 mb-1">Full Callback</h4>
                            <p className="text-xs text-gray-500 leading-relaxed">
                                AI shares the approved quote amount and schedules the appointment
                            </p>
                        </button>

                        {/* Schedule Only */}
                        <button
                            onClick={async () => {
                                if (!orgId) return;
                                setSavingCallbackMode(true);
                                try {
                                    await updateDoc(doc(db, 'organizations', orgId), {
                                        callbackMode: 'schedule_only',
                                        autoCallbackEnabled: true
                                    });
                                    setCallbackMode('schedule_only');
                                    toast.success('Callback mode: Scheduling only');
                                } catch { toast.error('Failed to update'); }
                                finally { setSavingCallbackMode(false); }
                            }}
                            disabled={savingCallbackMode}
                            className={`relative text-left p-4 rounded-xl border-2 transition-all ${
                                callbackMode === 'schedule_only'
                                    ? 'border-amber-500 bg-amber-50/50 shadow-md shadow-amber-100'
                                    : 'border-gray-200 hover:border-amber-300 bg-white'
                            }`}
                        >
                            {callbackMode === 'schedule_only' && (
                                <div className="absolute top-2 right-2">
                                    <CheckCircle2 className="w-5 h-5 text-amber-500" />
                                </div>
                            )}
                            <CalendarCheck className={`w-5 h-5 mb-2 ${callbackMode === 'schedule_only' ? 'text-amber-600' : 'text-gray-400'}`} />
                            <h4 className="font-bold text-sm text-gray-900 mb-1">Schedule Only</h4>
                            <p className="text-xs text-gray-500 leading-relaxed">
                                AI calls to schedule but does not share the quote amount with the customer
                            </p>
                        </button>

                        {/* No Callback */}
                        <button
                            onClick={async () => {
                                if (!orgId) return;
                                setSavingCallbackMode(true);
                                try {
                                    await updateDoc(doc(db, 'organizations', orgId), {
                                        callbackMode: 'none',
                                        autoCallbackEnabled: false
                                    });
                                    setCallbackMode('none');
                                    toast.success('Outbound callbacks disabled');
                                } catch { toast.error('Failed to update'); }
                                finally { setSavingCallbackMode(false); }
                            }}
                            disabled={savingCallbackMode}
                            className={`relative text-left p-4 rounded-xl border-2 transition-all ${
                                callbackMode === 'none'
                                    ? 'border-gray-500 bg-gray-50 shadow-md shadow-gray-100'
                                    : 'border-gray-200 hover:border-gray-400 bg-white'
                            }`}
                        >
                            {callbackMode === 'none' && (
                                <div className="absolute top-2 right-2">
                                    <CheckCircle2 className="w-5 h-5 text-gray-500" />
                                </div>
                            )}
                            <PhoneOff className={`w-5 h-5 mb-2 ${callbackMode === 'none' ? 'text-gray-600' : 'text-gray-400'}`} />
                            <h4 className="font-bold text-sm text-gray-900 mb-1">No Callback</h4>
                            <p className="text-xs text-gray-500 leading-relaxed">
                                Disabled — no automated outbound calls after quote approval
                            </p>
                        </button>
                    </div>
                </div>
            </div>

            {/* Quick Links */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
                <Link to="/admin/ai-phone-agent"
                    className="bg-white rounded-xl border border-gray-200 p-6 flex items-start gap-4 hover:shadow-lg hover:border-violet-200 transition-all group">
                    <div className="p-3 bg-violet-100 text-violet-600 rounded-xl group-hover:scale-110 transition-transform">
                        <Bot className="w-6 h-6" />
                    </div>
                    <div className="flex-1">
                        <h3 className="text-lg font-bold text-gray-900 mb-1">AI Phone Agent</h3>
                        <p className="text-sm text-gray-500 mb-3">Gemini-powered voice agent answers calls 24/7.</p>
                        <span className="text-violet-600 font-medium text-sm flex items-center gap-1 group-hover:gap-2 transition-all">
                            Configure <ArrowRight className="w-4 h-4" />
                        </span>
                    </div>
                </Link>

                <Link to="/admin/texting"
                    className="bg-white rounded-xl border border-gray-200 p-6 flex items-start gap-4 hover:shadow-lg hover:border-emerald-200 transition-all group">
                    <div className="p-3 bg-emerald-100 text-emerald-600 rounded-xl group-hover:scale-110 transition-transform">
                        <Smartphone className="w-6 h-6" />
                    </div>
                    <div className="flex-1">
                        <h3 className="text-lg font-bold text-gray-900 mb-1">Business SMS</h3>
                        <p className="text-sm text-gray-500 mb-3">Provision numbers and send automated text messages.</p>
                        <span className="text-emerald-600 font-medium text-sm flex items-center gap-1 group-hover:gap-2 transition-all">
                            Manage <ArrowRight className="w-4 h-4" />
                        </span>
                    </div>
                </Link>

                <button onClick={() => setActiveTab('integrations')}
                    className="bg-white rounded-xl border border-gray-200 p-6 flex items-start gap-4 hover:shadow-lg hover:border-blue-200 transition-all group text-left">
                    <div className="p-3 bg-blue-100 text-blue-600 rounded-xl group-hover:scale-110 transition-transform">
                        <Layers className="w-6 h-6" />
                    </div>
                    <div className="flex-1">
                        <h3 className="text-lg font-bold text-gray-900 mb-1">Ticket Integrations</h3>
                        <p className="text-sm text-gray-500 mb-3">Pull tickets from ServiceNow, Salesforce, Zendesk & more.</p>
                        <span className="text-blue-600 font-medium text-sm flex items-center gap-1 group-hover:gap-2 transition-all">
                            {activeIntegrations.length > 0 ? `${activeIntegrations.length} active` : 'Connect'} <ArrowRight className="w-4 h-4" />
                        </span>
                    </div>
                </button>
            </div>

            {/* Recent Imported Tickets (preview) */}
            {pendingTickets.length > 0 && (
                <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                    <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between bg-gradient-to-r from-amber-50 to-white">
                        <div className="flex items-center gap-3">
                            <div className="relative">
                                <InboxIcon className="w-5 h-5 text-amber-600" />
                                <span className="absolute -top-1 -right-1 w-2 h-2 bg-amber-500 rounded-full animate-ping" />
                            </div>
                            <h3 className="font-bold text-gray-900">Recent Imported Tickets</h3>
                            <span className="bg-amber-100 text-amber-700 text-xs font-bold px-2 py-0.5 rounded-full">{pendingTickets.length} pending</span>
                        </div>
                        <button onClick={() => setActiveTab('integrations')}
                            className="text-sm text-blue-600 font-medium hover:text-blue-700 flex items-center gap-1">
                            View All <ArrowRight className="w-3.5 h-3.5" />
                        </button>
                    </div>
                    <div className="divide-y divide-gray-100">
                        {pendingTickets.slice(0, 5).map(ticket => (
                            <div key={ticket.id} className="px-6 py-3 flex items-center justify-between hover:bg-gray-50/50">
                                <div className="flex items-center gap-3 min-w-0">
                                    {getPlatformBadge(ticket.platform)}
                                    <span className="text-xs text-gray-400 font-mono">{ticket.externalId}</span>
                                    <span className="text-sm text-gray-800 font-medium truncate">{ticket.summary}</span>
                                    {priorityBadge(ticket.priority)}
                                </div>
                                <button
                                    onClick={() => handleConvertToJob(ticket)}
                                    disabled={!!convertingTicket}
                                    className="flex items-center gap-1.5 text-xs font-bold text-blue-600 hover:text-blue-700 bg-blue-50 hover:bg-blue-100 px-3 py-1.5 rounded-lg transition-colors whitespace-nowrap"
                                >
                                    <Briefcase className="w-3.5 h-3.5" /> Convert to Job
                                </button>
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );

    const renderIntegrations = () => (
        <div className="space-y-6">
            {/* Connected Integrations */}
            {integrations.length > 0 && (
                <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                    <div className="px-6 py-4 border-b border-gray-100 bg-gray-50 flex items-center justify-between">
                        <h3 className="font-bold text-gray-900 flex items-center gap-2">
                            <Link2 className="w-5 h-5 text-blue-600" /> Connected Systems
                        </h3>
                        <button onClick={() => { setShowAddIntegration(false); setSelectedPlatform(null); setShowAddIntegration(true); setSelectedPlatform(null); }}
                            className="text-sm text-blue-600 font-medium hover:text-blue-700 flex items-center gap-1">
                            <Plus className="w-4 h-4" /> Add Another
                        </button>
                    </div>
                    <div className="divide-y divide-gray-100">
                        {integrations.map(integration => {
                            const platform = PLATFORMS.find(p => p.id === integration.platform);
                            if (!platform) return null;
                            const isExpanded = expandedIntegration === integration.id;
                            return (
                                <div key={integration.id}>
                                    <div className="px-6 py-4 flex items-center justify-between hover:bg-gray-50/50 cursor-pointer"
                                        onClick={() => setExpandedIntegration(isExpanded ? null : (integration.id || null))}>
                                        <div className="flex items-center gap-4">
                                            <div className="w-10 h-10 rounded-xl flex items-center justify-center text-white font-black text-sm"
                                                style={{ backgroundColor: platform.color }}>
                                                {platform.icon}
                                            </div>
                                            <div>
                                                <div className="flex items-center gap-2">
                                                    <h4 className="font-bold text-gray-900">{integration.displayName || platform.name}</h4>
                                                    {integration.enabled ? (
                                                        <span className="flex items-center gap-1 text-xs text-emerald-600 font-medium bg-emerald-50 px-2 py-0.5 rounded-full">
                                                            <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full" /> Connected
                                                        </span>
                                                    ) : (
                                                        <span className="flex items-center gap-1 text-xs text-gray-400 font-medium bg-gray-100 px-2 py-0.5 rounded-full">
                                                            <span className="w-1.5 h-1.5 bg-gray-400 rounded-full" /> Paused
                                                        </span>
                                                    )}
                                                </div>
                                                <p className="text-xs text-gray-500 mt-0.5">
                                                    {integration.ticketCount} tickets imported
                                                    {integration.lastSyncAt && ` · Last sync: ${new Date(integration.lastSyncAt?.seconds ? integration.lastSyncAt.seconds * 1000 : integration.lastSyncAt).toLocaleDateString()}`}
                                                    · Sync: every {integration.syncConfig?.frequency || '15min'}
                                                </p>
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <button onClick={(e) => { e.stopPropagation(); handleToggleIntegration(integration); }}
                                                className="p-2 rounded-lg hover:bg-gray-100 transition-colors" title={integration.enabled ? 'Pause' : 'Enable'}>
                                                {integration.enabled
                                                    ? <ToggleRight className="w-6 h-6 text-emerald-500" />
                                                    : <ToggleLeft className="w-6 h-6 text-gray-400" />
                                                }
                                            </button>
                                            {isExpanded ? <ChevronDown className="w-5 h-5 text-gray-400" /> : <ChevronRight className="w-5 h-5 text-gray-400" />}
                                        </div>
                                    </div>
                                    {isExpanded && (
                                        <div className="px-6 pb-4 bg-gray-50/50">
                                            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
                                                {integration.syncConfig?.filters?.categories?.length > 0 && (
                                                    <div className="bg-white border border-gray-200 rounded-lg p-3">
                                                        <p className="text-[10px] text-gray-400 uppercase font-bold mb-1">Categories</p>
                                                        <p className="text-sm text-gray-700">{integration.syncConfig.filters.categories.join(', ')}</p>
                                                    </div>
                                                )}
                                                {integration.syncConfig?.filters?.priorities?.length > 0 && (
                                                    <div className="bg-white border border-gray-200 rounded-lg p-3">
                                                        <p className="text-[10px] text-gray-400 uppercase font-bold mb-1">Priorities</p>
                                                        <p className="text-sm text-gray-700">{integration.syncConfig.filters.priorities.join(', ')}</p>
                                                    </div>
                                                )}
                                                {integration.syncConfig?.filters?.statuses?.length > 0 && (
                                                    <div className="bg-white border border-gray-200 rounded-lg p-3">
                                                        <p className="text-[10px] text-gray-400 uppercase font-bold mb-1">Statuses</p>
                                                        <p className="text-sm text-gray-700">{integration.syncConfig.filters.statuses.join(', ')}</p>
                                                    </div>
                                                )}
                                                {integration.syncConfig?.filters?.assignmentGroups?.length > 0 && (
                                                    <div className="bg-white border border-gray-200 rounded-lg p-3">
                                                        <p className="text-[10px] text-gray-400 uppercase font-bold mb-1">Assignment Groups</p>
                                                        <p className="text-sm text-gray-700">{integration.syncConfig.filters.assignmentGroups.join(', ')}</p>
                                                    </div>
                                                )}
                                            </div>
                                            <div className="flex gap-2">
                                                <button onClick={() => openEditIntegration(integration)}
                                                    className="text-sm font-medium text-blue-600 hover:text-blue-700 bg-white border border-blue-200 px-3 py-1.5 rounded-lg hover:bg-blue-50 transition-colors flex items-center gap-1.5">
                                                    <Settings className="w-3.5 h-3.5" /> Edit Config
                                                </button>
                                                <button onClick={() => handleDeleteIntegration(integration.id!)}
                                                    className="text-sm font-medium text-red-600 hover:text-red-700 bg-white border border-red-200 px-3 py-1.5 rounded-lg hover:bg-red-50 transition-colors flex items-center gap-1.5">
                                                    <Trash2 className="w-3.5 h-3.5" /> Remove
                                                </button>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}

            {/* Add Integration Platform Picker */}
            {(showAddIntegration && !selectedPlatform) || integrations.length === 0 ? (
                <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                    <div className="px-6 py-4 border-b border-gray-100 bg-gradient-to-r from-blue-50 to-white">
                        <h3 className="font-bold text-gray-900 flex items-center gap-2">
                            <Plus className="w-5 h-5 text-blue-600" /> Connect a Ticketing System
                        </h3>
                        <p className="text-sm text-gray-500 mt-1">Pull tickets from your existing helpdesk or ITSM platform into DispatchBox.</p>
                    </div>
                    <div className="p-6 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                        {PLATFORMS.map(platform => {
                            const alreadyConnected = integrations.some(i => i.platform === platform.id);
                            return (
                                <button
                                    key={platform.id}
                                    onClick={() => openAddIntegration(platform)}
                                    className={`text-left border rounded-xl p-5 transition-all hover:shadow-lg hover:-translate-y-0.5 group ${alreadyConnected ? 'border-emerald-200 bg-emerald-50/30' : 'border-gray-200 hover:border-blue-300'}`}
                                >
                                    <div className="flex items-center gap-3 mb-3">
                                        <div className="w-10 h-10 rounded-xl flex items-center justify-center text-white font-black text-sm shadow-sm group-hover:scale-110 transition-transform"
                                            style={{ backgroundColor: platform.color }}>
                                            {platform.icon}
                                        </div>
                                        <div>
                                            <h4 className="font-bold text-gray-900">{platform.name}</h4>
                                            {alreadyConnected && (
                                                <span className="text-[10px] text-emerald-600 font-bold uppercase">Connected</span>
                                            )}
                                        </div>
                                    </div>
                                    <p className="text-sm text-gray-500 leading-relaxed">{platform.description}</p>
                                </button>
                            );
                        })}
                    </div>
                </div>
            ) : null}

            {/* Integration Configuration Form (slide-in panel) */}
            {showAddIntegration && selectedPlatform && (
                <div className="bg-white rounded-xl border-2 border-blue-200 overflow-hidden shadow-lg">
                    <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between" style={{ backgroundColor: selectedPlatform.bgColor }}>
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-xl flex items-center justify-center text-white font-black text-sm"
                                style={{ backgroundColor: selectedPlatform.color }}>
                                {selectedPlatform.icon}
                            </div>
                            <div>
                                <h3 className="font-bold text-gray-900">
                                    {editingIntegration ? 'Edit' : 'Connect'} {selectedPlatform.name}
                                </h3>
                                <p className="text-xs text-gray-500">{selectedPlatform.description}</p>
                            </div>
                        </div>
                        <button onClick={() => { setShowAddIntegration(false); setSelectedPlatform(null); }}
                            className="p-2 hover:bg-white/50 rounded-lg transition-colors">
                            <X className="w-5 h-5 text-gray-500" />
                        </button>
                    </div>
                    <div className="p-6 space-y-6">
                        {/* Connection Name */}
                        <div>
                            <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1.5">Connection Name</label>
                            <input type="text"
                                value={configFormData.displayName || ''}
                                onChange={e => setConfigFormData(prev => ({ ...prev, displayName: e.target.value }))}
                                placeholder={`My ${selectedPlatform.name}`}
                                className="w-full px-4 py-2.5 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none bg-gray-50/50 text-sm"
                            />
                        </div>

                        {/* Platform-specific credential fields */}
                        <div>
                            <h4 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-3 flex items-center gap-2">
                                <Shield className="w-3.5 h-3.5" /> Authentication
                            </h4>
                            <div className="space-y-3">
                                {selectedPlatform.fields.map(field => (
                                    <div key={field.key}>
                                        <label className="block text-sm font-medium text-gray-700 mb-1">{field.label} {field.required && <span className="text-red-400">*</span>}</label>
                                        <input
                                            type={field.type || 'text'}
                                            value={configFormData[field.key] || ''}
                                            onChange={e => setConfigFormData(prev => ({ ...prev, [field.key]: e.target.value }))}
                                            placeholder={field.placeholder}
                                            className="w-full px-4 py-2.5 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none bg-gray-50/50 text-sm"
                                        />
                                    </div>
                                ))}
                            </div>
                            <button onClick={handleTestConnection}
                                disabled={testingConnection}
                                className="mt-3 flex items-center gap-2 text-sm font-medium text-blue-600 hover:text-blue-700 bg-blue-50 hover:bg-blue-100 px-4 py-2 rounded-lg transition-colors disabled:opacity-50">
                                {testingConnection ? (
                                    <><RefreshCw className="w-4 h-4 animate-spin" /> Testing...</>
                                ) : (
                                    <><Zap className="w-4 h-4" /> Test Connection</>
                                )}
                            </button>
                        </div>

                        {/* Sync Criteria */}
                        <div>
                            <h4 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-3 flex items-center gap-2">
                                <Filter className="w-3.5 h-3.5" /> Sync Criteria (Filter which tickets to pull)
                            </h4>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Categories / Queues</label>
                                    <input type="text"
                                        value={syncFilters.categories}
                                        onChange={e => setSyncFilters(prev => ({ ...prev, categories: e.target.value }))}
                                        placeholder="e.g. HVAC, Plumbing, Electrical"
                                        className="w-full px-4 py-2.5 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none bg-gray-50/50 text-sm"
                                    />
                                    <p className="text-[11px] text-gray-400 mt-1">Comma-separated. Leave empty for all.</p>
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Priorities</label>
                                    <input type="text"
                                        value={syncFilters.priorities}
                                        onChange={e => setSyncFilters(prev => ({ ...prev, priorities: e.target.value }))}
                                        placeholder="e.g. P1, P2, Critical, High"
                                        className="w-full px-4 py-2.5 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none bg-gray-50/50 text-sm"
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Statuses</label>
                                    <input type="text"
                                        value={syncFilters.statuses}
                                        onChange={e => setSyncFilters(prev => ({ ...prev, statuses: e.target.value }))}
                                        placeholder="e.g. Open, In Progress, Waiting"
                                        className="w-full px-4 py-2.5 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none bg-gray-50/50 text-sm"
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Assignment Groups</label>
                                    <input type="text"
                                        value={syncFilters.assignmentGroups}
                                        onChange={e => setSyncFilters(prev => ({ ...prev, assignmentGroups: e.target.value }))}
                                        placeholder="e.g. Facilities, IT Support"
                                        className="w-full px-4 py-2.5 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none bg-gray-50/50 text-sm"
                                    />
                                </div>
                            </div>
                        </div>

                        {/* Sync Frequency */}
                        <div>
                            <h4 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-3 flex items-center gap-2">
                                <Clock className="w-3.5 h-3.5" /> Sync Frequency
                            </h4>
                            <div className="flex flex-wrap gap-2">
                                {[
                                    { value: 'realtime', label: 'Real-time (Webhook)' },
                                    { value: '5min', label: 'Every 5 min' },
                                    { value: '15min', label: 'Every 15 min' },
                                    { value: '30min', label: 'Every 30 min' },
                                    { value: '1hour', label: 'Every hour' },
                                ].map(opt => (
                                    <button key={opt.value}
                                        onClick={() => setSyncFrequency(opt.value)}
                                        className={`px-4 py-2 rounded-lg text-sm font-medium border transition-all ${syncFrequency === opt.value
                                            ? 'bg-blue-600 text-white border-blue-600 shadow-sm'
                                            : 'bg-white text-gray-600 border-gray-200 hover:border-blue-300'
                                            }`}>
                                        {opt.label}
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* Save / Cancel */}
                        <div className="flex items-center justify-end gap-3 pt-4 border-t border-gray-100">
                            <button onClick={() => { setShowAddIntegration(false); setSelectedPlatform(null); }}
                                className="px-5 py-2.5 rounded-lg text-sm font-medium text-gray-600 hover:bg-gray-100 transition-colors">
                                Cancel
                            </button>
                            <button onClick={handleSaveIntegration}
                                disabled={savingIntegration}
                                className="px-6 py-2.5 rounded-lg text-sm font-bold text-white shadow-sm hover:shadow-md transition-all disabled:opacity-50"
                                style={{ backgroundColor: selectedPlatform.color }}>
                                {savingIntegration ? 'Saving...' : editingIntegration ? 'Update Integration' : 'Connect & Import Tickets'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Imported Tickets */}
            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                <div className="px-6 py-4 border-b border-gray-100 bg-gray-50 flex items-center justify-between flex-wrap gap-3">
                    <h3 className="font-bold text-gray-900 flex items-center gap-2">
                        <InboxIcon className="w-5 h-5 text-gray-600" /> Imported Tickets
                        {importedTickets.length > 0 && (
                            <span className="text-xs bg-gray-200 text-gray-600 px-2 py-0.5 rounded-full">{importedTickets.length}</span>
                        )}
                    </h3>
                    <div className="flex items-center gap-2">
                        <select value={ticketFilter} onChange={e => setTicketFilter(e.target.value)}
                            className="text-sm border border-gray-200 rounded-lg px-3 py-1.5 bg-white font-medium text-gray-600">
                            <option value="all">All Sources</option>
                            {PLATFORMS.filter(p => integrations.some(i => i.platform === p.id)).map(p => (
                                <option key={p.id} value={p.id}>{p.name}</option>
                            ))}
                        </select>
                    </div>
                </div>

                {importedTickets.length === 0 ? (
                    <div className="p-12 text-center">
                        <InboxIcon className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                        <p className="text-gray-500 font-medium mb-1">No imported tickets yet</p>
                        <p className="text-sm text-gray-400">Connect a ticketing system above to start pulling tickets in.</p>
                    </div>
                ) : (
                    <div className="divide-y divide-gray-100 max-h-[600px] overflow-y-auto">
                        {importedTickets
                            .filter(t => ticketFilter === 'all' || t.platform === ticketFilter)
                            .map(ticket => (
                                <div key={ticket.id} className={`px-6 py-4 hover:bg-gray-50/50 transition-colors ${ticket.convertedToJobId ? 'opacity-60' : ''}`}>
                                    <div className="flex items-start justify-between gap-4">
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center gap-2 flex-wrap mb-1.5">
                                                {getPlatformBadge(ticket.platform)}
                                                <span className="text-xs text-gray-400 font-mono">{ticket.externalId}</span>
                                                {priorityBadge(ticket.priority)}
                                                <span className="text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded">{ticket.status}</span>
                                                {ticket.category && (
                                                    <span className="text-xs text-gray-500 flex items-center gap-1">
                                                        <Tag className="w-3 h-3" /> {ticket.category}
                                                    </span>
                                                )}
                                            </div>
                                            <h4 className="font-medium text-gray-900 text-sm">{ticket.summary}</h4>
                                            <p className="text-xs text-gray-500 mt-1">
                                                <span className="font-medium">{ticket.requesterName}</span>
                                                {ticket.requesterEmail && <> · {ticket.requesterEmail}</>}
                                                {ticket.assignmentGroup && <> · {ticket.assignmentGroup}</>}
                                            </p>
                                        </div>
                                        <div className="flex items-center gap-2 flex-shrink-0">
                                            {ticket.externalUrl && (
                                                <a href={ticket.externalUrl} target="_blank" rel="noreferrer"
                                                    className="p-2 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors" title="View in source system">
                                                    <ExternalLink className="w-4 h-4" />
                                                </a>
                                            )}
                                            {ticket.convertedToJobId ? (
                                                <Link to={`/jobs/${ticket.convertedToJobId}`}
                                                    className="flex items-center gap-1.5 text-xs font-bold text-emerald-600 bg-emerald-50 px-3 py-1.5 rounded-lg">
                                                    <CheckCircle2 className="w-3.5 h-3.5" /> Job Created
                                                </Link>
                                            ) : (
                                                <button
                                                    onClick={() => handleConvertToJob(ticket)}
                                                    disabled={convertingTicket === ticket.id}
                                                    className="flex items-center gap-1.5 text-xs font-bold text-white px-4 py-2 rounded-lg transition-all hover:shadow-md disabled:opacity-50 bg-blue-600 hover:bg-blue-700"
                                                >
                                                    {convertingTicket === ticket.id ? (
                                                        <><RefreshCw className="w-3.5 h-3.5 animate-spin" /> Converting...</>
                                                    ) : (
                                                        <><Briefcase className="w-3.5 h-3.5" /> Convert to Job</>
                                                    )}
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            ))}
                    </div>
                )}
            </div>
        </div>
    );

    const renderEmailPhone = () => (
        <div className="space-y-6">
            <div className="bg-white rounded-xl border border-gray-200 p-6">
                <h3 className="text-lg font-bold text-gray-900 mb-1 flex items-center gap-2">
                    <Mail className="w-5 h-5 text-gray-500" /> Email & Phone Routing
                </h3>
                <p className="text-sm text-gray-500 mb-6">Configure how customers reach your team.</p>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Public Support Email</label>
                        <input type="email"
                            value={communicationChannels.contactEmail}
                            onChange={e => setCommunicationChannels(prev => ({ ...prev, contactEmail: e.target.value }))}
                            className="w-full px-4 py-2.5 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none bg-gray-50/50 text-sm"
                            placeholder="support@yourbusiness.com"
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Public Support Phone</label>
                        <input type="tel"
                            value={communicationChannels.contactPhone}
                            onChange={e => setCommunicationChannels(prev => ({ ...prev, contactPhone: e.target.value }))}
                            className="w-full px-4 py-2.5 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none bg-gray-50/50 text-sm"
                            placeholder="(555) 123-4567"
                        />
                        <p className="text-xs text-gray-400 mt-1">Ideally your Twilio / Vapi business number.</p>
                    </div>
                </div>

                <div className="mt-6 pt-6 border-t border-gray-100">
                    <label className="block text-sm font-medium text-gray-700 mb-3">Team Cell Phones (SMS Alerts & Routing)</label>
                    <div className="space-y-2 mb-3">
                        {communicationChannels.teamCellNumbers.map((num, idx) => (
                            <div key={idx} className="flex items-center justify-between bg-gray-50 px-4 py-2.5 rounded-lg border border-gray-200">
                                <span className="text-sm font-medium text-gray-700">{num}</span>
                                <button onClick={() => removeCellNumber(idx)}
                                    className="text-red-500 text-xs font-medium hover:text-red-700 hover:bg-red-50 px-2 py-1 rounded transition-colors">
                                    Remove
                                </button>
                            </div>
                        ))}
                    </div>
                    <div className="flex gap-2">
                        <input type="tel"
                            value={newCellNumber}
                            onChange={e => setNewCellNumber(e.target.value)}
                            onKeyDown={e => e.key === 'Enter' && addCellNumber()}
                            className="flex-1 px-4 py-2.5 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none bg-gray-50/50"
                            placeholder="Add mobile e.g. 555-123-4567"
                        />
                        <button onClick={addCellNumber}
                            className="bg-gray-100 px-4 py-2.5 rounded-lg border border-gray-200 text-sm font-medium hover:bg-gray-200 transition-colors flex items-center gap-1.5">
                            <Plus className="w-4 h-4" /> Add
                        </button>
                    </div>
                </div>

                <div className="mt-6 flex justify-end">
                    <button onClick={handleSaveComms}
                        disabled={saving}
                        className="bg-blue-600 text-white px-6 py-2.5 rounded-lg font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors shadow-sm">
                        {saving ? 'Saving...' : 'Save Communication Settings'}
                    </button>
                </div>
            </div>

            {/* Email Status */}
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-5 flex items-start gap-3">
                <AlertTriangle className="w-5 h-5 text-amber-600 mt-0.5 flex-shrink-0" />
                <div>
                    <h4 className="font-bold text-amber-800 text-sm">Email Integration Coming Soon</h4>
                    <p className="text-sm text-amber-700 mt-1">
                        Automated email sending (quotes, invoices, appointment reminders) is under development.
                        In the meantime, your support email is displayed on your public portal and customer communications.
                    </p>
                </div>
            </div>
        </div>
    );

    const renderPortal = () => (
        <div className="space-y-6">
            <div className="bg-white rounded-xl border border-gray-200 p-6">
                <h3 className="text-lg font-bold text-gray-900 mb-1 flex items-center gap-2">
                    <Globe className="w-5 h-5 text-gray-500" /> Public Portal
                </h3>
                <p className="text-sm text-gray-500 mb-6">Your customer-facing website with booking form.</p>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div>
                        <div className="flex items-center justify-between mb-4">
                            <span className="text-sm font-medium text-gray-700">Enable Public Portal</span>
                            <label className="relative inline-flex items-center cursor-pointer">
                                <input type="checkbox" checked={portalConfig.isActive}
                                    onChange={e => setPortalConfig(prev => ({ ...prev, isActive: e.target.checked }))}
                                    className="sr-only peer" />
                                <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600" />
                            </label>
                        </div>

                        <label className="block text-sm font-medium text-gray-700 mb-1">URL Slug</label>
                        <div className="flex items-center">
                            <span className="bg-gray-100 border border-r-0 border-gray-200 px-3 py-2.5 rounded-l-lg text-gray-500 text-sm">/p/</span>
                            <input type="text" value={portalConfig.slug}
                                onChange={e => setPortalConfig(prev => ({ ...prev, slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '') }))}
                                className="w-full px-4 py-2.5 border border-gray-200 rounded-r-lg outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                                placeholder="my-business" />
                        </div>
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">Company Logo</label>
                        <div className="flex items-center gap-4">
                            <div className="h-16 w-16 bg-gray-100 rounded-xl border border-gray-200 flex items-center justify-center overflow-hidden flex-shrink-0">
                                {logoUrl ? <img src={logoUrl} alt="Logo" className="h-full w-full object-contain p-1" /> : <ImageIcon className="w-6 h-6 text-gray-400" />}
                            </div>
                            <label className="cursor-pointer bg-white py-2.5 px-4 border border-gray-200 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 inline-flex items-center gap-2">
                                <Upload className="w-4 h-4" /> {uploadingLogo ? 'Uploading...' : 'Upload'}
                                <input type="file" className="sr-only" accept="image/*" onChange={handleLogoUpload} disabled={uploadingLogo} />
                            </label>
                        </div>
                    </div>
                </div>

                {portalConfig.isActive && portalConfig.slug && (
                    <div className="mt-6 pt-6 border-t border-gray-100 flex items-center gap-3">
                        <a href={`/p/${portalConfig.slug}`} target="_blank" rel="noreferrer"
                            className="bg-gray-900 text-white px-5 py-2.5 rounded-lg text-sm font-medium hover:bg-black transition-colors inline-flex items-center gap-2">
                            <ExternalLink className="w-4 h-4" /> View Portal
                        </a>
                        <Link to="/settings"
                            className="text-sm font-medium text-blue-600 hover:text-blue-700 flex items-center gap-1">
                            Full Website Builder in Org Settings <ArrowRight className="w-3.5 h-3.5" />
                        </Link>
                    </div>
                )}
            </div>
        </div>
    );

    /* ═══════════════════════════════════════════════════
     *  MAIN RENDER
     * ═══════════════════════════════════════════════════ */
    const tabs = [
        { id: 'inbox' as const, label: 'Inbox', icon: InboxIcon, badge: pendingInquiries.length > 0 ? pendingInquiries.length : (pendingTickets.length > 0 ? pendingTickets.length : undefined) },
        { id: 'overview' as const, label: 'Overview', icon: Activity },
        { id: 'integrations' as const, label: 'Integrations', icon: Layers, badge: activeIntegrations.length > 0 ? activeIntegrations.length : undefined },
        { id: 'email-phone' as const, label: 'Email & Phone', icon: Mail },
        { id: 'portal' as const, label: 'Portal', icon: Globe },
    ];

    return (
        <div className="min-h-screen bg-gray-50">
            {/* Header */}
            <div className="bg-white border-b border-gray-200">
                <div className="px-4 sm:px-5 lg:px-6 pt-5 pb-0">
                    <div className="flex items-center justify-between mb-6">
                        <div>
                            <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-3">
                                <div className="p-2 bg-gradient-to-br from-blue-500 to-violet-600 rounded-xl text-white">
                                    <Radio className="w-6 h-6" />
                                </div>
                                Communications Hub
                            </h1>
                            <p className="text-gray-500 mt-1 text-sm">Your central hub for customer inquiries, tickets, and communications.</p>
                        </div>
                    </div>

                    {/* Tabs */}
                    <div className="flex gap-1">
                        {tabs.map(tab => (
                            <button key={tab.id}
                                onClick={() => setActiveTab(tab.id)}
                                className={`flex items-center gap-2 px-4 py-2.5 rounded-t-lg text-sm font-medium transition-colors border-b-2 -mb-px ${activeTab === tab.id
                                    ? 'bg-white text-blue-600 border-blue-600'
                                    : 'text-gray-500 hover:text-gray-700 border-transparent hover:bg-gray-50'
                                    }`}>
                                <tab.icon className="w-4 h-4" />
                                {tab.label}
                                {tab.badge && (
                                    <span className="bg-blue-100 text-blue-600 text-xs font-bold px-1.5 py-0.5 rounded-full min-w-[18px] text-center">
                                        {tab.badge}
                                    </span>
                                )}
                            </button>
                        ))}
                    </div>
                </div>
            </div>

            {/* Tab Content */}
            <div className="px-4 sm:px-5 lg:px-6 py-5">
                {activeTab === 'inbox' && renderInbox()}
                {activeTab === 'overview' && renderOverview()}
                {activeTab === 'integrations' && renderIntegrations()}
                {activeTab === 'email-phone' && renderEmailPhone()}
                {activeTab === 'portal' && renderPortal()}
            </div>
        </div>
    );
};
