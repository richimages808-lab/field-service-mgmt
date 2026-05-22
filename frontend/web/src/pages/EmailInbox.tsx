import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { useAuth } from '../auth/AuthProvider';
import { collection, query, orderBy, onSnapshot, doc, updateDoc, deleteDoc, where, Timestamp } from 'firebase/firestore';
import { db } from '../firebase';
import { httpsCallable } from 'firebase/functions';
import { functions } from '../firebase';
import {
    Inbox, Mail, MailOpen, Star, StarOff, Archive, ArrowLeft, Reply,
    Send, Search, RefreshCw, Tag, ExternalLink, Clock, AtSign,
    ChevronDown, ChevronUp, X, Filter, MailPlus, Edit3, Paperclip, FileText, Download,
    Trash2, Settings, Save, Palette, Type, Image as ImageIcon, Globe, Phone, User,
    Calendar, ArrowUpDown, SlidersHorizontal, GripVertical, AlertTriangle, Building2, Link2
} from 'lucide-react';
import toast from 'react-hot-toast';
import { ComposeEmailModal } from '../components/ComposeEmailModal';
import ReactQuill from 'react-quill';
import 'react-quill/dist/quill.snow.css';
import { storage } from '../firebase';
import { ref, uploadBytesResumable, getDownloadURL } from 'firebase/storage';

interface Attachment {
    name: string;
    url: string;
    path: string;
    type: string;
    size: number;
    file?: File;
    progress?: number;
    error?: boolean;
}

interface EmailMessage {
    id: string;
    from: string;
    fromName: string;
    to: string;
    subject: string;
    textBody: string;
    htmlBody: string;
    mailbox: string;
    sourceAlias: string | null;
    ticketId: string | null;
    read: boolean;
    starred: boolean;
    archived: boolean;
    direction: 'inbound' | 'outbound';
    intent: string | null;
    attachments?: { name: string, url: string, path?: string, type: string, size: number }[];
    deleted?: boolean;
    deliveryFailed?: boolean;
    receivedAt: Timestamp | null;
    createdAt: Timestamp | null;
}

// ─── Mailbox Colors ────────────────────────────────────
const MAILBOX_COLORS: Record<string, { bg: string; text: string; border: string; dot: string }> = {
    primary: { bg: 'bg-blue-50', text: 'text-blue-700', border: 'border-blue-200', dot: 'bg-blue-500' },
    support: { bg: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-200', dot: 'bg-emerald-500' },
    billing: { bg: 'bg-amber-50', text: 'text-amber-700', border: 'border-amber-200', dot: 'bg-amber-500' },
    emergency: { bg: 'bg-red-50', text: 'text-red-700', border: 'border-red-200', dot: 'bg-red-500' },
    sales: { bg: 'bg-purple-50', text: 'text-purple-700', border: 'border-purple-200', dot: 'bg-purple-500' },
    info: { bg: 'bg-cyan-50', text: 'text-cyan-700', border: 'border-cyan-200', dot: 'bg-cyan-500' },
};

const getMailboxColor = (mailbox: string) =>
    MAILBOX_COLORS[mailbox] || { bg: 'bg-indigo-50', text: 'text-indigo-700', border: 'border-indigo-200', dot: 'bg-indigo-500' };

const formatTime = (ts: Timestamp | null) => {
    if (!ts) return '';
    const d = ts.toDate();
    const now = new Date();
    const diff = now.getTime() - d.getTime();
    if (diff < 60000) return 'Just now';
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
    if (diff < 86400000) return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
    if (diff < 604800000) return d.toLocaleDateString([], { weekday: 'short' });
    return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
};

const formatFullDate = (ts: Timestamp | null) => {
    if (!ts) return '';
    return ts.toDate().toLocaleString([], {
        weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
        hour: 'numeric', minute: '2-digit'
    });
};

export const EmailInbox: React.FC = () => {
    const { user } = useAuth();
    const orgId = (user as any)?.org_id;
    const [emails, setEmails] = useState<EmailMessage[]>([]);
    const [loading, setLoading] = useState(true);
    const [selectedId, setSelectedId] = useState<string | null>(null);
    const [activeFolder, setActiveFolder] = useState<string>('inbox');
    const [activeMailbox, setActiveMailbox] = useState<string>('all');
    const [searchQuery, setSearchQuery] = useState('');
    const [replyOpen, setReplyOpen] = useState(false);
    const [replyBody, setReplyBody] = useState('');
    const [sending, setSending] = useState(false);
    const [emailPrefix, setEmailPrefix] = useState('');
    const [aliases, setAliases] = useState<string[]>([]);
    const [composeOpen, setComposeOpen] = useState(false);
    const [attachments, setAttachments] = useState<Attachment[]>([]);
    const [showSettings, setShowSettings] = useState(false);
    const [brandingData, setBrandingData] = useState<any>({});
    const [savingBranding, setSavingBranding] = useState(false);
    const [sortBy, setSortBy] = useState<'date' | 'from' | 'subject'>('date');
    const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
    const [showFilters, setShowFilters] = useState(false);
    const [filterFrom, setFilterFrom] = useState('');
    const [filterTo, setFilterTo] = useState('');
    const [filterSubject, setFilterSubject] = useState('');
    const [filterDateFrom, setFilterDateFrom] = useState('');
    const [filterDateTo, setFilterDateTo] = useState('');
    const [filterHasAttachments, setFilterHasAttachments] = useState(false);

    // ─── Resizable panels ───────────────────────────────────
    const [sidebarWidth, setSidebarWidth] = useState(224); // default w-56 = 224px
    const [listWidth, setListWidth] = useState(384); // default w-96 = 384px
    const dragging = useRef<'sidebar' | 'list' | null>(null);
    const startX = useRef(0);
    const startW = useRef(0);

    const onMouseDown = useCallback((panel: 'sidebar' | 'list', e: React.MouseEvent) => {
        e.preventDefault();
        dragging.current = panel;
        startX.current = e.clientX;
        startW.current = panel === 'sidebar' ? sidebarWidth : listWidth;
        document.body.style.cursor = 'col-resize';
        document.body.style.userSelect = 'none';
    }, [sidebarWidth, listWidth]);

    useEffect(() => {
        const onMove = (e: MouseEvent) => {
            if (!dragging.current) return;
            const delta = e.clientX - startX.current;
            if (dragging.current === 'sidebar') {
                setSidebarWidth(Math.max(180, Math.min(400, startW.current + delta)));
            } else {
                const maxList = Math.max(400, Math.floor(window.innerWidth * 0.5));
                setListWidth(Math.max(280, Math.min(maxList, startW.current + delta)));
            }
        };
        const onUp = () => {
            dragging.current = null;
            document.body.style.cursor = '';
            document.body.style.userSelect = '';
        };
        window.addEventListener('mousemove', onMove);
        window.addEventListener('mouseup', onUp);
        return () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp); };
    }, []);

    // ─── Structured Signature helpers ────────────────────────
    const parseSig = useCallback((raw: string) => {
        try {
            const p = typeof raw === 'string' ? JSON.parse(raw) : raw;
            if (p?.type === 'structured') return p;
        } catch {}
        return { type: 'structured', name: '', title: '', company: '', phone: '', email: '', website: '', logoUrl: '', socialLinks: [], tagline: '', primaryColor: '' };
    }, []);

    const updateSigField = useCallback((field: string, value: any) => {
        const current = parseSig(brandingData.signature);
        const updated = { ...current, [field]: value };
        setBrandingData((prev: any) => ({ ...prev, signature: JSON.stringify(updated) }));
    }, [brandingData.signature, parseSig]);

    const activeFilterCount = useMemo(() => {
        let c = 0;
        if (filterFrom) c++;
        if (filterTo) c++;
        if (filterSubject) c++;
        if (filterDateFrom) c++;
        if (filterDateTo) c++;
        if (filterHasAttachments) c++;
        return c;
    }, [filterFrom, filterTo, filterSubject, filterDateFrom, filterDateTo, filterHasAttachments]);

    const clearAllFilters = () => {
        setFilterFrom('');
        setFilterTo('');
        setFilterSubject('');
        setFilterDateFrom('');
        setFilterDateTo('');
        setFilterHasAttachments(false);
        setSearchQuery('');
    };

    // File upload handler for replies
    const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
        const files = Array.from(e.target.files || []);
        if (!files.length || !orgId) return;

        const newAttachments: Attachment[] = files.map(file => ({
            name: file.name,
            url: '',
            path: `organizations/${orgId}/emails/attachments/${Date.now()}_${file.name}`,
            type: file.type,
            size: file.size,
            file,
            progress: 0
        }));

        setAttachments(prev => [...prev, ...newAttachments]);

        // Upload each file
        newAttachments.forEach(att => {
            const storageRef = ref(storage, att.path);
            const uploadTask = uploadBytesResumable(storageRef, att.file!);

            uploadTask.on('state_changed', 
                (snapshot) => {
                    const progress = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
                    setAttachments(prev => prev.map(a => a.path === att.path ? { ...a, progress } : a));
                },
                (error) => {
                    console.error('Upload failed:', error);
                    setAttachments(prev => prev.map(a => a.path === att.path ? { ...a, error: true } : a));
                    toast.error(`Failed to upload ${att.name}`);
                },
                async () => {
                    const downloadUrl = await getDownloadURL(uploadTask.snapshot.ref);
                    setAttachments(prev => prev.map(a => a.path === att.path ? { ...a, url: downloadUrl, progress: 100 } : a));
                }
            );
        });

        // Reset input
        e.target.value = '';
    };

    const removeAttachment = (path: string) => {
        setAttachments(prev => prev.filter(a => a.path !== path));
    };

    // Load org settings for prefix/aliases and branding
    useEffect(() => {
        if (!orgId) return;
        const unsub = onSnapshot(doc(db, 'organizations', orgId), (snap) => {
            const data = snap.data();
            if (data?.inboundEmail) {
                setEmailPrefix(data.inboundEmail.prefix || '');
                setAliases(data.inboundEmail.aliases || []);
            }
            setBrandingData({
                companyName: data?.branding?.companyName || data?.name || '',
                primaryColor: data?.branding?.primaryColor || '#4F46E5',
                logoUrl: data?.branding?.logoUrl || '',
                fromName: data?.outboundEmail?.fromName || data?.name || '',
                signatureEnabled: data?.outboundEmail?.signatureEnabled ?? false,
                signature: data?.outboundEmail?.signature || '',
            });
        });
        return unsub;
    }, [orgId]);

    // Real-time email listener
    useEffect(() => {
        if (!orgId) return;
        setLoading(true);
        const q = query(
            collection(db, `organizations/${orgId}/emails`),
            orderBy('receivedAt', 'desc')
        );
        const unsub = onSnapshot(q, (snap) => {
            const msgs: EmailMessage[] = snap.docs.map(d => ({ id: d.id, ...d.data() } as EmailMessage));
            setEmails(msgs);
            setLoading(false);
        }, (err) => {
            console.error('Email listener error:', err);
            setLoading(false);
        });
        return unsub;
    }, [orgId]);

    // Derive mailbox list from aliases
    const mailboxes = useMemo(() => {
        const boxes = ['all', 'primary'];
        aliases.forEach(alias => {
            const prefix = emailPrefix || '';
            const label = prefix && alias.endsWith(`.${prefix}`) ? alias.replace(`.${prefix}`, '') : alias;
            if (!boxes.includes(label)) boxes.push(label);
        });
        return boxes;
    }, [aliases, emailPrefix]);

    // Filter emails by folder, mailbox, search, and column filters
    const filtered = useMemo(() => {
        let result = emails;
        // Folder filtering
        if (activeFolder === 'inbox') result = result.filter(e => e.direction !== 'outbound' && !e.archived && !e.deleted);
        else if (activeFolder === 'sent') result = result.filter(e => e.direction === 'outbound' && !e.deleted);
        else if (activeFolder === 'trash') result = result.filter(e => (e as any).deleted);
        else if (activeFolder === 'archived') result = result.filter(e => e.archived && !e.deleted);
        // Mailbox sub-filter (within inbox)
        if (activeMailbox !== 'all' && activeFolder === 'inbox') result = result.filter(e => e.mailbox === activeMailbox);
        // Global search (across all fields)
        if (searchQuery.trim()) {
            const q = searchQuery.toLowerCase();
            result = result.filter(e =>
                e.subject.toLowerCase().includes(q) ||
                e.from.toLowerCase().includes(q) ||
                e.fromName.toLowerCase().includes(q) ||
                e.to.toLowerCase().includes(q) ||
                (e.textBody || '').toLowerCase().includes(q) ||
                e.mailbox.toLowerCase().includes(q)
            );
        }
        // Column-specific filters
        if (filterFrom.trim()) {
            const ff = filterFrom.toLowerCase();
            result = result.filter(e => e.from.toLowerCase().includes(ff) || e.fromName.toLowerCase().includes(ff));
        }
        if (filterTo.trim()) {
            const ft = filterTo.toLowerCase();
            result = result.filter(e => e.to.toLowerCase().includes(ft));
        }
        if (filterSubject.trim()) {
            const fs = filterSubject.toLowerCase();
            result = result.filter(e => e.subject.toLowerCase().includes(fs));
        }
        if (filterDateFrom) {
            const from = new Date(filterDateFrom);
            from.setHours(0, 0, 0, 0);
            result = result.filter(e => e.receivedAt && e.receivedAt.toDate() >= from);
        }
        if (filterDateTo) {
            const to = new Date(filterDateTo);
            to.setHours(23, 59, 59, 999);
            result = result.filter(e => e.receivedAt && e.receivedAt.toDate() <= to);
        }
        if (filterHasAttachments) {
            result = result.filter(e => e.attachments && e.attachments.length > 0);
        }
        // Sort
        const dir = sortDir === 'asc' ? 1 : -1;
        if (sortBy === 'from') result = [...result].sort((a, b) => dir * (a.fromName || a.from).localeCompare(b.fromName || b.from));
        else if (sortBy === 'subject') result = [...result].sort((a, b) => dir * a.subject.localeCompare(b.subject));
        else {
            // Date sort — Firestore default is desc, so reverse if asc requested
            if (sortDir === 'asc') result = [...result].reverse();
        }
        return result;
    }, [emails, activeFolder, activeMailbox, searchQuery, sortBy, sortDir, filterFrom, filterTo, filterSubject, filterDateFrom, filterDateTo, filterHasAttachments]);

    const folderCounts = useMemo(() => {
        const c = { inbox: 0, sent: 0, trash: 0, archived: 0 };
        emails.forEach(e => {
            if ((e as any).deleted) { c.trash++; return; }
            if (e.archived) { c.archived++; return; }
            if (e.direction === 'outbound') c.sent++;
            else { c.inbox++; if (!e.read) c.inbox; }
        });
        return c;
    }, [emails]);

    const unreadCounts = useMemo(() => {
        const counts: Record<string, number> = { all: 0, primary: 0 };
        emails.filter(e => !e.read && !e.archived && !(e as any).deleted && e.direction !== 'outbound').forEach(e => {
            counts.all = (counts.all || 0) + 1;
            counts[e.mailbox] = (counts[e.mailbox] || 0) + 1;
        });
        return counts;
    }, [emails]);

    const selected = selectedId ? emails.find(e => e.id === selectedId) : null;

    // Mark as read
    useEffect(() => {
        if (selected && !selected.read && orgId && selected.direction === 'inbound') {
            updateDoc(doc(db, `organizations/${orgId}/emails`, selected.id), { read: true }).catch(() => {});
        }
    }, [selectedId, selected?.read, orgId, selected?.direction]);

    const toggleStar = async (e: React.MouseEvent, email: EmailMessage) => {
        e.stopPropagation();
        if (!orgId) return;
        await updateDoc(doc(db, `organizations/${orgId}/emails`, email.id), { starred: !email.starred });
    };

    const toggleArchive = async (email: EmailMessage) => {
        if (!orgId) return;
        await updateDoc(doc(db, `organizations/${orgId}/emails`, email.id), { archived: !email.archived });
        if (selectedId === email.id) setSelectedId(null);
        toast.success(email.archived ? 'Moved to inbox' : 'Archived');
    };

    const markUnread = async (email: EmailMessage) => {
        if (!orgId) return;
        await updateDoc(doc(db, `organizations/${orgId}/emails`, email.id), { read: false });
        setSelectedId(null);
    };

    const deleteEmail = async (email: EmailMessage) => {
        if (!orgId) return;
        try {
            if (email.deleted) {
                // Already in trash — permanently delete
                if (!confirm('Permanently delete this email?')) return;
                await deleteDoc(doc(db, `organizations/${orgId}/emails`, email.id));
                toast.success('Email permanently deleted');
            } else {
                // Move to trash (soft delete)
                await updateDoc(doc(db, `organizations/${orgId}/emails`, email.id), { deleted: true });
                toast.success('Moved to Trash');
            }
            if (selectedId === email.id) setSelectedId(null);
        } catch {
            toast.error('Failed to delete email');
        }
    };

    const restoreEmail = async (email: EmailMessage) => {
        if (!orgId) return;
        try {
            await updateDoc(doc(db, `organizations/${orgId}/emails`, email.id), { deleted: false });
            if (selectedId === email.id) setSelectedId(null);
            toast.success('Email restored');
        } catch {
            toast.error('Failed to restore email');
        }
    };

    const saveBranding = async () => {
        if (!orgId) return;
        setSavingBranding(true);
        try {
            const updates: any = {
                'branding.companyName': brandingData.companyName,
                'branding.primaryColor': brandingData.primaryColor,
                'branding.logoUrl': brandingData.logoUrl,
                'outboundEmail.fromName': brandingData.fromName,
                'outboundEmail.signatureEnabled': brandingData.signatureEnabled,
                'outboundEmail.signature': brandingData.signature,
            };
            await updateDoc(doc(db, 'organizations', orgId), updates);
            toast.success('Email branding saved');
        } catch {
            toast.error('Failed to save settings');
        } finally {
            setSavingBranding(false);
        }
    };

    const handleReply = async () => {
        if (!selected || !replyBody.trim()) return;
        setSending(true);
        try {
            const sendEmail = httpsCallable(functions, 'sendCustomEmail');
            const stripHtml = (html: string) => {
                const tmp = document.createElement('DIV');
                tmp.innerHTML = html;
                return tmp.textContent || tmp.innerText || '';
            };

            await sendEmail({
                to: selected.direction === 'inbound' ? selected.from : selected.to, // Reply to sender or recipient if outbound
                subject: selected.subject.startsWith('Re:') ? selected.subject : `Re: ${selected.subject}`,
                textBody: stripHtml(replyBody),
                htmlBody: replyBody,
                fromAlias: selected.sourceAlias || null,
                replyToMessageId: selected.id,
                attachments: attachments.map(a => ({
                    name: a.name,
                    url: a.url,
                    path: a.path,
                    type: a.type,
                    size: a.size
                }))
            });
            toast.success('Reply sent');
            setReplyOpen(false);
            setReplyBody('');
            setAttachments([]);
        } catch (err) {
            console.error('Reply failed:', err);
            toast.error('Failed to send reply');
        } finally {
            setSending(false);
        }
    };

    // ─── RENDER ──────────────────────────────────────────────
    return (
        <div className="h-[calc(100vh-64px)] flex bg-gray-50">
            <ComposeEmailModal 
                isOpen={composeOpen} 
                onClose={() => setComposeOpen(false)} 
                aliases={aliases} 
                emailPrefix={emailPrefix} 
            />

            {/* ─── LEFT: Mailbox Sidebar ─── */}
            <div style={{ width: sidebarWidth }} className="bg-white border-r border-gray-200 flex flex-col shrink-0">
                <div className="p-4 border-b border-gray-100 flex flex-col gap-3">
                    <div>
                        <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2">
                            <Mail className="w-5 h-5 text-indigo-600" />
                            Inbox
                        </h2>
                        <p className="text-xs text-gray-400 mt-0.5">{emailPrefix ? `@${emailPrefix}.dispatch-box.com` : 'No Prefix'}</p>
                    </div>
                    <button
                        onClick={() => setComposeOpen(true)}
                        className="w-full flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white font-medium py-2 px-4 rounded-xl transition-colors shadow-sm"
                    >
                        <Edit3 className="w-4 h-4" />
                        Compose
                    </button>
                </div>
                <nav className="flex-1 overflow-y-auto py-2">
                    {/* Standard Folders */}
                    <div className="px-3 pb-1">
                        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider px-1 mb-1">Folders</p>
                    </div>
                    {[
                        { id: 'inbox', label: 'Inbox', icon: <Inbox className="w-4 h-4" />, count: unreadCounts.all },
                        { id: 'sent', label: 'Sent Items', icon: <Send className="w-4 h-4" /> },
                        { id: 'trash', label: 'Deleted Items', icon: <Trash2 className="w-4 h-4" /> },
                        { id: 'archived', label: 'Archive', icon: <Archive className="w-4 h-4" /> },
                    ].map(f => (
                        <button
                            key={f.id}
                            onClick={() => { setActiveFolder(f.id); setShowSettings(false); setSelectedId(null); }}
                            className={`w-full flex items-center gap-2.5 px-4 py-2 text-sm transition-colors ${
                                activeFolder === f.id && !showSettings
                                    ? 'bg-indigo-50 text-indigo-700 font-semibold border-r-2 border-indigo-600'
                                    : 'text-gray-600 hover:bg-gray-50'
                            }`}
                        >
                            {f.icon}
                            <span className="flex-1 text-left">{f.label}</span>
                            {(f.count || 0) > 0 && (
                                <span className={`text-xs font-bold px-1.5 py-0.5 rounded-full ${
                                    activeFolder === f.id && !showSettings ? 'bg-indigo-600 text-white' : 'bg-gray-200 text-gray-600'
                                }`}>{f.count}</span>
                            )}
                        </button>
                    ))}

                    {/* Mailbox Aliases (sub-filter within inbox) */}
                    {mailboxes.length > 1 && activeFolder === 'inbox' && (
                        <div className="border-t border-gray-100 mt-2 pt-2">
                            <div className="px-3 pb-1">
                                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider px-1 mb-1">Mailboxes</p>
                            </div>
                            {mailboxes.map(box => {
                                const color = getMailboxColor(box === 'all' ? 'primary' : box);
                                const count = unreadCounts[box] || 0;
                                return (
                                    <button
                                        key={box}
                                        onClick={() => { setActiveMailbox(box); setSelectedId(null); }}
                                        className={`w-full flex items-center gap-2.5 px-4 py-2 text-sm transition-colors ${
                                            activeMailbox === box
                                                ? 'bg-gray-100 text-gray-900 font-medium'
                                                : 'text-gray-500 hover:bg-gray-50'
                                        }`}
                                    >
                                        {box === 'all' ? (
                                            <Mail className="w-3.5 h-3.5" />
                                        ) : (
                                            <div className={`w-2.5 h-2.5 rounded-full ${color.dot}`} />
                                        )}
                                        <span className="capitalize flex-1 text-left text-xs">{box === 'all' ? 'All Mailboxes' : box}</span>
                                        {count > 0 && (
                                            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-gray-200 text-gray-600">{count}</span>
                                        )}
                                    </button>
                                );
                            })}
                        </div>
                    )}

                    {/* Settings */}
                    <div className="border-t border-gray-100 mt-2 pt-2">
                        <button
                            onClick={() => { setShowSettings(true); setSelectedId(null); }}
                            className={`w-full flex items-center gap-2.5 px-4 py-2 text-sm transition-colors ${
                                showSettings ? 'bg-indigo-50 text-indigo-700 font-medium' : 'text-gray-500 hover:bg-gray-50'
                            }`}
                        >
                            <Settings className="w-4 h-4" />
                            <span>Email Settings</span>
                        </button>
                    </div>
                </nav>
            </div>

            {/* Sidebar Resize Handle */}
            <div
                onMouseDown={(e) => onMouseDown('sidebar', e)}
                className="w-1 hover:w-1.5 bg-transparent hover:bg-indigo-300 cursor-col-resize transition-all shrink-0 group relative"
                title="Drag to resize sidebar"
            >
                <div className="absolute inset-y-0 -left-1 -right-1" />
            </div>

            {/* ─── CENTER: Email List ─── */}
            <div style={selected ? { width: listWidth } : undefined} className={`${selected ? '' : 'flex-1'} border-r border-gray-200 flex flex-col bg-white shrink-0`}>
                {/* Search + Filter toolbar */}
                <div className="border-b border-gray-100">
                    {/* Row 1: Search bar + Filter toggle */}
                    <div className="flex items-center gap-2 p-2.5">
                        <div className="relative flex-1">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                            <input
                                type="text"
                                value={searchQuery}
                                onChange={e => setSearchQuery(e.target.value)}
                                placeholder="Search all fields..."
                                className="w-full pl-9 pr-8 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                            />
                            {searchQuery && (
                                <button onClick={() => setSearchQuery('')} className="absolute right-3 top-1/2 -translate-y-1/2">
                                    <X className="w-4 h-4 text-gray-400 hover:text-gray-600" />
                                </button>
                            )}
                        </div>
                        <button
                            onClick={() => setShowFilters(!showFilters)}
                            className={`relative flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium border transition-all ${
                                showFilters || activeFilterCount > 0
                                    ? 'bg-indigo-50 border-indigo-200 text-indigo-700'
                                    : 'bg-gray-50 border-gray-200 text-gray-500 hover:bg-gray-100'
                            }`}
                            title="Toggle advanced filters"
                        >
                            <SlidersHorizontal className="w-4 h-4" />
                            <span className="hidden sm:inline">Filter</span>
                            {activeFilterCount > 0 && (
                                <span className="absolute -top-1.5 -right-1.5 w-4.5 h-4.5 flex items-center justify-center text-[10px] font-bold bg-indigo-600 text-white rounded-full min-w-[18px] h-[18px] leading-none">
                                    {activeFilterCount}
                                </span>
                            )}
                        </button>
                    </div>

                    {/* Row 2: Collapsible Advanced Filters */}
                    {showFilters && (
                        <div className="px-2.5 pb-2.5 space-y-2 animate-in slide-in-from-top-1 duration-200">
                            {/* From / To */}
                            <div className="flex gap-2">
                                <div className="flex-1 relative">
                                    <label className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[10px] font-semibold text-gray-400 uppercase tracking-wider pointer-events-none">From</label>
                                    <input
                                        type="text"
                                        value={filterFrom}
                                        onChange={e => setFilterFrom(e.target.value)}
                                        placeholder="sender name or email"
                                        className="w-full pl-12 pr-3 py-1.5 bg-white border border-gray-200 rounded-md text-xs focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                                    />
                                    {filterFrom && (
                                        <button onClick={() => setFilterFrom('')} className="absolute right-2 top-1/2 -translate-y-1/2">
                                            <X className="w-3 h-3 text-gray-400" />
                                        </button>
                                    )}
                                </div>
                                <div className="flex-1 relative">
                                    <label className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[10px] font-semibold text-gray-400 uppercase tracking-wider pointer-events-none">To</label>
                                    <input
                                        type="text"
                                        value={filterTo}
                                        onChange={e => setFilterTo(e.target.value)}
                                        placeholder="recipient address"
                                        className="w-full pl-8 pr-3 py-1.5 bg-white border border-gray-200 rounded-md text-xs focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                                    />
                                    {filterTo && (
                                        <button onClick={() => setFilterTo('')} className="absolute right-2 top-1/2 -translate-y-1/2">
                                            <X className="w-3 h-3 text-gray-400" />
                                        </button>
                                    )}
                                </div>
                            </div>
                            {/* Subject */}
                            <div className="relative">
                                <label className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[10px] font-semibold text-gray-400 uppercase tracking-wider pointer-events-none">Subj</label>
                                <input
                                    type="text"
                                    value={filterSubject}
                                    onChange={e => setFilterSubject(e.target.value)}
                                    placeholder="subject keywords"
                                    className="w-full pl-12 pr-3 py-1.5 bg-white border border-gray-200 rounded-md text-xs focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                                />
                                {filterSubject && (
                                    <button onClick={() => setFilterSubject('')} className="absolute right-2 top-1/2 -translate-y-1/2">
                                        <X className="w-3 h-3 text-gray-400" />
                                    </button>
                                )}
                            </div>
                            {/* Date range + Attachments */}
                            <div className="flex items-center gap-2">
                                <div className="flex items-center gap-1.5 flex-1">
                                    <Calendar className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                                    <input
                                        type="date"
                                        value={filterDateFrom}
                                        onChange={e => setFilterDateFrom(e.target.value)}
                                        className="flex-1 px-2 py-1.5 bg-white border border-gray-200 rounded-md text-xs focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                                        title="From date"
                                    />
                                    <span className="text-[10px] text-gray-400">–</span>
                                    <input
                                        type="date"
                                        value={filterDateTo}
                                        onChange={e => setFilterDateTo(e.target.value)}
                                        className="flex-1 px-2 py-1.5 bg-white border border-gray-200 rounded-md text-xs focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                                        title="To date"
                                    />
                                </div>
                                <label className="flex items-center gap-1.5 cursor-pointer shrink-0 px-2 py-1.5 rounded-md hover:bg-gray-50">
                                    <input
                                        type="checkbox"
                                        checked={filterHasAttachments}
                                        onChange={e => setFilterHasAttachments(e.target.checked)}
                                        className="w-3.5 h-3.5 text-indigo-600 border-gray-300 rounded focus:ring-indigo-500"
                                    />
                                    <Paperclip className="w-3.5 h-3.5 text-gray-400" />
                                    <span className="text-[11px] text-gray-500 font-medium">Has files</span>
                                </label>
                            </div>
                            {/* Clear all filters */}
                            {activeFilterCount > 0 && (
                                <button
                                    onClick={clearAllFilters}
                                    className="flex items-center gap-1 text-[11px] text-red-500 hover:text-red-700 font-medium transition-colors"
                                >
                                    <X className="w-3 h-3" />
                                    Clear all filters ({activeFilterCount})
                                </button>
                            )}
                        </div>
                    )}
                </div>

                {/* Column header bar — Outlook-style */}
                <div className="border-b border-gray-200 bg-gray-50">
                    {/* Folder label row */}
                    <div className="px-3 py-1 border-b border-gray-100 flex items-center">
                        <span className="text-xs text-gray-500 font-semibold capitalize">
                            {activeFolder === 'inbox' ? (activeMailbox === 'all' ? 'Inbox' : activeMailbox) : activeFolder === 'sent' ? 'Sent Items' : activeFolder === 'trash' ? 'Deleted Items' : 'Archive'}
                            {' '}({filtered.length})
                        </span>
                    </div>
                    {/* Column headers */}
                    <div className="flex items-stretch" style={{ minHeight: '28px' }}>
                        {/* Star spacer */}
                        <div className="flex-shrink-0" style={{ width: '36px' }} />
                        {/* From column */}
                        <button
                            onClick={() => {
                                if (sortBy === 'from') setSortDir(d => d === 'asc' ? 'desc' : 'asc');
                                else { setSortBy('from'); setSortDir('asc'); }
                            }}
                            className={`flex items-center gap-1 px-2 text-[11px] border-r border-gray-200 transition-colors select-none hover:bg-gray-100 ${
                                sortBy === 'from' ? 'text-indigo-700 font-semibold bg-indigo-50/60' : 'text-gray-500 font-medium'
                            }`}
                            style={{ flex: '0 0 30%', minWidth: '60px' }}
                        >
                            {activeFolder === 'sent' ? 'To' : 'From'}
                            {sortBy === 'from' && (
                                sortDir === 'asc'
                                    ? <ChevronUp className="w-3 h-3 shrink-0" />
                                    : <ChevronDown className="w-3 h-3 shrink-0" />
                            )}
                        </button>
                        {/* Subject column */}
                        <button
                            onClick={() => {
                                if (sortBy === 'subject') setSortDir(d => d === 'asc' ? 'desc' : 'asc');
                                else { setSortBy('subject'); setSortDir('asc'); }
                            }}
                            className={`flex items-center gap-1 px-2 text-[11px] border-r border-gray-200 transition-colors select-none hover:bg-gray-100 ${
                                sortBy === 'subject' ? 'text-indigo-700 font-semibold bg-indigo-50/60' : 'text-gray-500 font-medium'
                            }`}
                            style={{ flex: '1 1 auto', minWidth: '60px' }}
                        >
                            Subject
                            {sortBy === 'subject' && (
                                sortDir === 'asc'
                                    ? <ChevronUp className="w-3 h-3 shrink-0" />
                                    : <ChevronDown className="w-3 h-3 shrink-0" />
                            )}
                        </button>
                        {/* Date column */}
                        <button
                            onClick={() => {
                                if (sortBy === 'date') setSortDir(d => d === 'asc' ? 'desc' : 'asc');
                                else { setSortBy('date'); setSortDir('desc'); }
                            }}
                            className={`flex items-center gap-1 px-2 text-[11px] transition-colors select-none hover:bg-gray-100 ${
                                sortBy === 'date' ? 'text-indigo-700 font-semibold bg-indigo-50/60' : 'text-gray-500 font-medium'
                            }`}
                            style={{ flex: '0 0 22%', minWidth: '50px' }}
                        >
                            Date
                            {sortBy === 'date' && (
                                sortDir === 'asc'
                                    ? <ChevronUp className="w-3 h-3 shrink-0" />
                                    : <ChevronDown className="w-3 h-3 shrink-0" />
                            )}
                        </button>
                    </div>
                </div>

                {/* Active filter chips */}
                {activeFilterCount > 0 && !showFilters && (
                    <div className="flex items-center gap-1.5 px-3 py-1.5 border-b border-gray-100 bg-amber-50/50 flex-wrap">
                        <SlidersHorizontal className="w-3 h-3 text-amber-500 shrink-0" />
                        {filterFrom && (
                            <span className="inline-flex items-center gap-1 text-[10px] font-medium bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full">
                                From: {filterFrom}
                                <button onClick={() => setFilterFrom('')}><X className="w-2.5 h-2.5" /></button>
                            </span>
                        )}
                        {filterTo && (
                            <span className="inline-flex items-center gap-1 text-[10px] font-medium bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full">
                                To: {filterTo}
                                <button onClick={() => setFilterTo('')}><X className="w-2.5 h-2.5" /></button>
                            </span>
                        )}
                        {filterSubject && (
                            <span className="inline-flex items-center gap-1 text-[10px] font-medium bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full">
                                Subject: {filterSubject}
                                <button onClick={() => setFilterSubject('')}><X className="w-2.5 h-2.5" /></button>
                            </span>
                        )}
                        {filterDateFrom && (
                            <span className="inline-flex items-center gap-1 text-[10px] font-medium bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full">
                                After: {filterDateFrom}
                                <button onClick={() => setFilterDateFrom('')}><X className="w-2.5 h-2.5" /></button>
                            </span>
                        )}
                        {filterDateTo && (
                            <span className="inline-flex items-center gap-1 text-[10px] font-medium bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full">
                                Before: {filterDateTo}
                                <button onClick={() => setFilterDateTo('')}><X className="w-2.5 h-2.5" /></button>
                            </span>
                        )}
                        {filterHasAttachments && (
                            <span className="inline-flex items-center gap-1 text-[10px] font-medium bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full">
                                <Paperclip className="w-2.5 h-2.5" /> Attachments
                                <button onClick={() => setFilterHasAttachments(false)}><X className="w-2.5 h-2.5" /></button>
                            </span>
                        )}
                        <button onClick={clearAllFilters} className="text-[10px] text-red-500 hover:text-red-700 ml-auto font-medium">
                            Clear all
                        </button>
                    </div>
                )}

                {/* Email list */}
                <div className="flex-1 overflow-y-auto">
                    {loading ? (
                        <div className="flex items-center justify-center h-40">
                            <RefreshCw className="w-5 h-5 text-gray-400 animate-spin" />
                        </div>
                    ) : filtered.length === 0 ? (
                        <div className="flex flex-col items-center justify-center h-full text-gray-400 py-20">
                            {activeFilterCount > 0 || searchQuery ? (
                                <>
                                    <SlidersHorizontal className="w-12 h-12 mb-3 text-gray-300" />
                                    <p className="text-sm font-medium">No emails match your filters</p>
                                    <p className="text-xs mt-1">Try adjusting your search or filter criteria</p>
                                    <button
                                        onClick={clearAllFilters}
                                        className="mt-3 text-xs text-indigo-600 hover:text-indigo-800 font-medium"
                                    >
                                        Clear all filters
                                    </button>
                                </>
                            ) : (
                                <>
                                    <MailPlus className="w-12 h-12 mb-3 text-gray-300" />
                                    <p className="text-sm font-medium">No emails yet</p>
                                    <p className="text-xs mt-1">Inbound emails will appear here</p>
                                </>
                            )}
                        </div>
                    ) : (
                        filtered.map(email => {
                            const isSelected = selectedId === email.id;
                            const color = getMailboxColor(email.mailbox);
                            return (
                                <button
                                    key={email.id}
                                    onClick={() => setSelectedId(email.id)}
                                    className={`w-full text-left border-b border-gray-50 transition-colors ${
                                        isSelected
                                            ? 'bg-indigo-50 border-l-2 border-l-indigo-500'
                                            : email.read
                                                ? 'hover:bg-gray-50'
                                                : 'bg-blue-50/30 hover:bg-blue-50/60'
                                    }`}
                                >
                                    <div className="flex items-center" style={{ minHeight: '44px' }}>
                                        {/* Star column */}
                                        <div className="flex-shrink-0 flex items-center justify-center" style={{ width: '36px' }}>
                                            <button onClick={(e) => toggleStar(e, email)} className="shrink-0">
                                                {email.starred
                                                    ? <Star className="w-4 h-4 text-amber-500 fill-amber-500" />
                                                    : <Star className="w-4 h-4 text-gray-300 hover:text-amber-400" />}
                                            </button>
                                        </div>
                                        {/* From/To column */}
                                        <div className="flex items-center gap-1.5 px-2 min-w-0 border-r border-gray-50" style={{ flex: '0 0 30%' }}>
                                            {!email.read && (
                                                <div className="w-2 h-2 rounded-full bg-indigo-500 shrink-0" />
                                            )}
                                            <span className={`text-sm truncate ${!email.read ? 'font-bold text-gray-900' : 'font-medium text-gray-600'}`}>
                                                {email.fromName || email.from.split('@')[0]}
                                            </span>
                                        </div>
                                        {/* Subject column */}
                                        <div className="flex flex-col justify-center px-2 min-w-0 border-r border-gray-50" style={{ flex: '1 1 auto' }}>
                                            <div className="flex items-center gap-1.5 min-w-0">
                                                <span className={`text-sm truncate ${!email.read ? 'font-semibold text-gray-800' : 'text-gray-600'}`}>
                                                    {email.subject}
                                                </span>
                                                {email.attachments && email.attachments.length > 0 && (
                                                    <Paperclip className="w-3 h-3 text-gray-400 shrink-0" />
                                                )}
                                                {(email as any).deliveryFailed && (
                                                    <AlertTriangle className="w-3 h-3 text-red-500 shrink-0" />
                                                )}
                                            </div>
                                            <div className="flex items-center gap-1.5 mt-0.5">
                                                {email.mailbox !== 'primary' && (
                                                    <span className={`inline-flex items-center text-[9px] font-semibold px-1.5 py-0 rounded-full ${color.bg} ${color.text} ${color.border} border leading-relaxed`}>
                                                        {email.mailbox}
                                                    </span>
                                                )}
                                                {email.ticketId && (
                                                    <span className="inline-flex items-center gap-0.5 text-[9px] text-emerald-600 font-medium">
                                                        <Tag className="w-2.5 h-2.5" />ticket
                                                    </span>
                                                )}
                                                <span className="text-[11px] text-gray-400 truncate">
                                                    {(email.textBody || '').substring(0, 60)}
                                                </span>
                                            </div>
                                        </div>
                                        {/* Date column */}
                                        <div className="flex items-center px-2" style={{ flex: '0 0 22%', minWidth: '50px' }}>
                                            <span className="text-xs text-gray-400 truncate">
                                                {formatTime(email.receivedAt)}
                                            </span>
                                        </div>
                                    </div>
                                </button>
                            );
                        })
                    )}
                </div>

                {/* Footer stats */}
                <div className="px-4 py-2 border-t border-gray-100 text-xs text-gray-400 flex items-center justify-between">
                    <span>{filtered.length} email{filtered.length !== 1 ? 's' : ''}</span>
                    <span>{unreadCounts.all || 0} unread</span>
                </div>
            </div>

            {/* ─── RIGHT: Reading Pane ─── */}
            {selected && (
                <div
                    onMouseDown={(e) => onMouseDown('list', e)}
                    className="w-1 hover:w-1.5 bg-transparent hover:bg-indigo-300 cursor-col-resize transition-all shrink-0 group relative"
                    title="Drag to resize email list"
                >
                    <div className="absolute inset-y-0 -left-1 -right-1" />
                </div>
            )}
            {selected ? (
                <div className="flex-1 flex flex-col bg-white min-w-0">
                    {/* Toolbar */}
                    <div className="flex items-center gap-2 px-5 py-3 border-b border-gray-100">
                        <button onClick={() => setSelectedId(null)} className="p-1.5 rounded-lg hover:bg-gray-100 transition-colors" title="Back">
                            <ArrowLeft className="w-4 h-4 text-gray-500" />
                        </button>
                        <div className="flex-1" />
                        <button onClick={() => markUnread(selected)} className="p-1.5 rounded-lg hover:bg-gray-100 transition-colors" title="Mark unread">
                            <Mail className="w-4 h-4 text-gray-500" />
                        </button>
                        <button onClick={(e) => toggleStar(e, selected)} className="p-1.5 rounded-lg hover:bg-gray-100 transition-colors" title="Star">
                            {selected.starred
                                ? <Star className="w-4 h-4 text-amber-500 fill-amber-500" />
                                : <Star className="w-4 h-4 text-gray-400" />}
                        </button>
                        <button onClick={() => toggleArchive(selected)} className="p-1.5 rounded-lg hover:bg-gray-100 transition-colors" title="Archive">
                            <Archive className="w-4 h-4 text-gray-500" />
                        </button>
                        <button onClick={() => deleteEmail(selected)} className="p-1.5 rounded-lg hover:bg-red-50 transition-colors" title={selected.deleted ? 'Delete permanently' : 'Move to trash'}>
                            <Trash2 className="w-4 h-4 text-gray-500 hover:text-red-500" />
                        </button>
                        {selected.deleted && (
                            <button onClick={() => restoreEmail(selected)} className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-emerald-700 bg-emerald-50 rounded-lg hover:bg-emerald-100 transition-colors" title="Restore from trash">
                                <RefreshCw className="w-3.5 h-3.5" /> Restore
                            </button>
                        )}
                        {selected.ticketId && (
                            <a
                                href={`/jobs/${selected.ticketId}`}
                                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-indigo-700 bg-indigo-50 rounded-lg hover:bg-indigo-100 transition-colors"
                            >
                                <ExternalLink className="w-3.5 h-3.5" /> View Ticket
                            </a>
                        )}
                    </div>

                    {/* Email header */}
                    <div className="px-6 pt-5 pb-4 border-b border-gray-100">
                        <h1 className="text-xl font-bold text-gray-900 mb-3">{selected.subject}</h1>
                        <div className="flex items-start gap-3">
                            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white font-bold text-sm shrink-0">
                                {(selected.fromName || selected.from)[0]?.toUpperCase()}
                            </div>
                            <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2">
                                    <span className="font-semibold text-gray-900">{selected.fromName || 'Unknown'}</span>
                                    {selected.mailbox !== 'primary' && (
                                        <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${getMailboxColor(selected.mailbox).bg} ${getMailboxColor(selected.mailbox).text}`}>
                                            {selected.mailbox}
                                        </span>
                                    )}
                                </div>
                                <p className="text-sm text-gray-500">&lt;{selected.from}&gt;</p>
                                <div className="flex items-center gap-1.5 mt-1 text-xs text-gray-400">
                                    <Clock className="w-3 h-3" />
                                    {formatFullDate(selected.receivedAt)}
                                    <span className="mx-1">·</span>
                                    <AtSign className="w-3 h-3" />
                                    to {selected.to}
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Email body */}
                    <div className="flex-1 overflow-y-auto px-6 py-5">
                        {selected.htmlBody ? (
                            <div
                                className="prose prose-sm max-w-none text-gray-700"
                                dangerouslySetInnerHTML={{ __html: selected.htmlBody }}
                            />
                        ) : (
                            <pre className="whitespace-pre-wrap text-sm text-gray-700 font-sans leading-relaxed">
                                {selected.textBody}
                            </pre>
                        )}
                        
                        {/* Attachments Display */}
                        {selected.attachments && selected.attachments.length > 0 && (
                            <div className="mt-8 border-t border-gray-100 pt-4">
                                <h4 className="text-sm font-semibold text-gray-900 mb-3 flex items-center gap-2">
                                    <Paperclip className="w-4 h-4 text-gray-500" />
                                    Attachments ({selected.attachments.length})
                                </h4>
                                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                                    {selected.attachments.map((att, idx) => (
                                        <a 
                                            key={idx} 
                                            href={att.url} 
                                            target="_blank" 
                                            rel="noreferrer"
                                            className="flex items-center gap-3 p-3 border border-gray-200 rounded-xl hover:border-indigo-300 hover:bg-indigo-50/50 transition-colors group"
                                        >
                                            <div className="w-10 h-10 rounded-lg bg-indigo-50 flex items-center justify-center shrink-0">
                                                <FileText className="w-5 h-5 text-indigo-500" />
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <p className="text-sm font-medium text-gray-900 truncate group-hover:text-indigo-700">{att.name}</p>
                                                <p className="text-xs text-gray-500">{(att.size / 1024).toFixed(1)} KB</p>
                                            </div>
                                            <Download className="w-4 h-4 text-gray-400 group-hover:text-indigo-600 opacity-0 group-hover:opacity-100 transition-opacity" />
                                        </a>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Reply section */}
                    <div className="border-t border-gray-100 px-6 py-4">
                        {!replyOpen ? (
                            <button
                                onClick={() => setReplyOpen(true)}
                                className="flex items-center gap-2 px-4 py-2.5 text-sm font-medium text-gray-700 bg-gray-50 border border-gray-200 rounded-xl hover:bg-gray-100 transition-colors"
                            >
                                <Reply className="w-4 h-4" /> Reply
                            </button>
                        ) : (
                            <div className="bg-gray-50 rounded-xl border border-gray-200 p-4">
                                <div className="text-xs text-gray-500 mb-2">
                                    Replying to <span className="font-medium text-gray-700">{selected.fromName || selected.from}</span>
                                </div>
                                <div className="bg-white border border-gray-200 rounded-lg text-sm focus-within:ring-2 focus-within:ring-indigo-500 focus-within:border-transparent mb-3 flex flex-col min-h-[200px]">
                                    <ReactQuill 
                                        theme="snow"
                                        value={replyBody}
                                        onChange={setReplyBody}
                                        placeholder="Type your reply..."
                                        className="flex-1 h-full border-none"
                                        modules={{
                                            toolbar: [
                                                ['bold', 'italic', 'underline', 'strike'],
                                                [{ 'list': 'ordered'}, { 'list': 'bullet' }],
                                                ['link', 'clean']
                                            ]
                                        }}
                                    />
                                </div>

                                {/* Reply Attachments Area */}
                                {attachments.length > 0 && (
                                    <div className="mb-3 space-y-2">
                                        {attachments.map((att) => (
                                            <div key={att.path} className="flex items-center gap-3 p-2 bg-white border border-gray-200 rounded-lg">
                                                <FileText className="w-4 h-4 text-gray-400 shrink-0" />
                                                <div className="flex-1 min-w-0">
                                                    <p className="text-sm text-gray-700 truncate">{att.name}</p>
                                                    {att.progress !== undefined && att.progress < 100 && !att.error && (
                                                        <div className="w-full bg-gray-200 rounded-full h-1.5 mt-1">
                                                            <div className="bg-indigo-600 h-1.5 rounded-full transition-all" style={{ width: `${att.progress}%` }} />
                                                        </div>
                                                    )}
                                                    {att.error && <p className="text-xs text-red-500 mt-0.5">Upload failed</p>}
                                                </div>
                                                <button
                                                    onClick={() => removeAttachment(att.path)}
                                                    className="p-1 hover:bg-gray-100 rounded-md text-gray-400 hover:text-red-500 transition-colors"
                                                >
                                                    <X className="w-4 h-4" />
                                                </button>
                                            </div>
                                        ))}
                                    </div>
                                )}

                                <div className="flex items-center gap-2">
                                    <button
                                        onClick={handleReply}
                                        disabled={sending || (!replyBody.trim() && attachments.length === 0)}
                                        className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 disabled:opacity-50 transition-colors"
                                    >
                                        <Send className="w-4 h-4" />
                                        {sending ? 'Sending...' : 'Send Reply'}
                                    </button>
                                    <div className="relative">
                                        <input
                                            type="file"
                                            multiple
                                            onChange={handleFileSelect}
                                            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                                        />
                                        <button className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-200 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-50 transition-colors">
                                            <Paperclip className="w-4 h-4" /> Attach
                                        </button>
                                    </div>
                                    <div className="flex-1" />
                                    <button
                                        onClick={() => { setReplyOpen(false); setReplyBody(''); setAttachments([]); }}
                                        className="px-4 py-2 text-sm text-gray-500 hover:text-gray-700"
                                    >
                                        Cancel
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            ) : showSettings ? (
                /* ─── Settings Panel ─── */
                <div className="flex-1 flex flex-col bg-white min-w-0 overflow-y-auto">
                    <div className="flex items-center gap-3 px-6 py-4 border-b border-gray-100">
                        <button onClick={() => setShowSettings(false)} className="p-1.5 rounded-lg hover:bg-gray-100 transition-colors">
                            <ArrowLeft className="w-4 h-4 text-gray-500" />
                        </button>
                        <Settings className="w-5 h-5 text-indigo-600" />
                        <h2 className="text-lg font-bold text-gray-900">Email Branding & Signature</h2>
                        <div className="flex-1" />
                        <button
                            onClick={saveBranding}
                            disabled={savingBranding}
                            className="flex items-center gap-2 px-5 py-2 bg-indigo-600 text-white text-sm font-medium rounded-xl hover:bg-indigo-700 disabled:opacity-50 transition-colors shadow-sm"
                        >
                            <Save className="w-4 h-4" />
                            {savingBranding ? 'Saving...' : 'Save Changes'}
                        </button>
                    </div>

                    <div className="p-6 space-y-8 max-w-3xl">
                        {/* Header Branding */}
                        <div>
                            <h3 className="text-sm font-semibold text-gray-900 flex items-center gap-2 mb-4">
                                <Palette className="w-4 h-4 text-indigo-500" />
                                Header Branding
                            </h3>
                            <p className="text-xs text-gray-500 mb-4">These settings control the header and footer of outbound emails.</p>
                            <div className="space-y-4">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Company Name</label>
                                    <input
                                        type="text"
                                        value={brandingData.companyName || ''}
                                        onChange={e => setBrandingData({ ...brandingData, companyName: e.target.value })}
                                        className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                                        placeholder="Your Company Name"
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Sender Display Name</label>
                                    <input
                                        type="text"
                                        value={brandingData.fromName || ''}
                                        onChange={e => setBrandingData({ ...brandingData, fromName: e.target.value })}
                                        className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                                        placeholder="How your name appears in email clients"
                                    />
                                </div>
                                <div className="flex gap-4">
                                    <div className="flex-1">
                                        <label className="block text-sm font-medium text-gray-700 mb-1">Brand Color</label>
                                        <div className="flex items-center gap-3">
                                            <input
                                                type="color"
                                                value={brandingData.primaryColor || '#4F46E5'}
                                                onChange={e => setBrandingData({ ...brandingData, primaryColor: e.target.value })}
                                                className="w-10 h-10 rounded-lg border border-gray-200 cursor-pointer"
                                            />
                                            <input
                                                type="text"
                                                value={brandingData.primaryColor || '#4F46E5'}
                                                onChange={e => setBrandingData({ ...brandingData, primaryColor: e.target.value })}
                                                className="flex-1 px-3 py-2 border border-gray-200 rounded-lg text-sm font-mono"
                                            />
                                        </div>
                                    </div>
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Logo URL</label>
                                    <input
                                        type="url"
                                        value={brandingData.logoUrl || ''}
                                        onChange={e => setBrandingData({ ...brandingData, logoUrl: e.target.value })}
                                        className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                                        placeholder="https://example.com/logo.png"
                                    />
                                    {brandingData.logoUrl && (
                                        <div className="mt-2 p-3 bg-gray-50 rounded-lg border border-gray-200 inline-block">
                                            <img src={brandingData.logoUrl} alt="Logo preview" className="max-h-12 max-w-48" />
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>

                        {/* Email Preview */}
                        <div>
                            <h3 className="text-sm font-semibold text-gray-900 flex items-center gap-2 mb-4">
                                <Mail className="w-4 h-4 text-indigo-500" />
                                Email Preview
                            </h3>
                            <div className="border border-gray-200 rounded-xl overflow-hidden shadow-sm">
                                <div style={{ background: `linear-gradient(135deg, ${brandingData.primaryColor || '#4F46E5'}, #7C3AED)` }} className="p-6 text-center">
                                    {brandingData.logoUrl && <img src={brandingData.logoUrl} alt="" className="max-h-10 mx-auto mb-2" />}
                                    <h3 className="text-white font-bold text-lg">{brandingData.companyName || 'Your Company'}</h3>
                                </div>
                                <div className="p-6 bg-gray-50">
                                    <p className="text-gray-500 text-sm">Your email content will appear here...</p>
                                    {brandingData.signatureEnabled && brandingData.signature && (() => {
                                        const sig = parseSig(brandingData.signature);
                                        const sigColor = sig.primaryColor || brandingData.primaryColor || '#4F46E5';
                                        return (
                                            <div className="mt-4 pt-4 border-t border-gray-200">
                                                <table style={{ fontFamily: 'Arial, sans-serif', fontSize: 13, color: '#374151' }}>
                                                    <tbody>
                                                        <tr>
                                                            {sig.logoUrl && (
                                                                <td style={{ paddingRight: 14, verticalAlign: 'top' }}>
                                                                    <img src={sig.logoUrl} alt="" style={{ width: 60, height: 60, borderRadius: 8, objectFit: 'cover' }} />
                                                                </td>
                                                            )}
                                                            <td style={{ borderLeft: `3px solid ${sigColor}`, paddingLeft: 14 }}>
                                                                {sig.name && <div style={{ fontWeight: 700, fontSize: 14, color: '#111827' }}>{sig.name}</div>}
                                                                {sig.title && <div style={{ fontSize: 12, color: sigColor, marginTop: 1 }}>{sig.title}</div>}
                                                                {sig.company && <div style={{ fontSize: 12, color: '#6B7280', marginTop: 1 }}>{sig.company}</div>}
                                                                <div style={{ marginTop: 6, fontSize: 12, color: '#6B7280' }}>
                                                                    {sig.phone && <div>📞 {sig.phone}</div>}
                                                                    {sig.email && <div>✉️ {sig.email}</div>}
                                                                    {sig.website && <div>🌐 {sig.website}</div>}
                                                                </div>
                                                                {sig.tagline && <div style={{ marginTop: 6, fontSize: 11, fontStyle: 'italic', color: '#9CA3AF' }}>{sig.tagline}</div>}
                                                            </td>
                                                        </tr>
                                                    </tbody>
                                                </table>
                                            </div>
                                        );
                                    })()}
                                </div>
                                <div className="p-4 bg-gray-800 text-center">
                                    <p className="text-gray-400 text-xs">© {new Date().getFullYear()} {brandingData.companyName || 'Your Company'}. All rights reserved.</p>
                                </div>
                            </div>
                        </div>

                        {/* Email Signature — Visual Editor */}
                        <div>
                            <h3 className="text-sm font-semibold text-gray-900 flex items-center gap-2 mb-4">
                                <Type className="w-4 h-4 text-indigo-500" />
                                Email Signature
                            </h3>
                            <div className="flex items-center gap-3 mb-4">
                                <label className="relative inline-flex items-center cursor-pointer">
                                    <input
                                        type="checkbox"
                                        checked={brandingData.signatureEnabled || false}
                                        onChange={e => setBrandingData({ ...brandingData, signatureEnabled: e.target.checked })}
                                        className="sr-only peer"
                                    />
                                    <div className="w-11 h-6 bg-gray-200 peer-focus:ring-4 peer-focus:ring-indigo-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-indigo-600"></div>
                                </label>
                                <span className="text-sm font-medium text-gray-700">Enable email signature</span>
                            </div>
                            {brandingData.signatureEnabled && (() => {
                                const sig = parseSig(brandingData.signature);
                                return (
                                    <div className="space-y-4 bg-gray-50 border border-gray-200 rounded-xl p-5">
                                        <div className="grid grid-cols-2 gap-4">
                                            <div>
                                                <label className="block text-xs font-medium text-gray-600 mb-1 flex items-center gap-1"><User className="w-3 h-3" /> Full Name</label>
                                                <input type="text" value={sig.name || ''} onChange={e => updateSigField('name', e.target.value)} placeholder="John Smith" className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent" />
                                            </div>
                                            <div>
                                                <label className="block text-xs font-medium text-gray-600 mb-1">Title / Role</label>
                                                <input type="text" value={sig.title || ''} onChange={e => updateSigField('title', e.target.value)} placeholder="Sr. Plumber" className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent" />
                                            </div>
                                        </div>
                                        <div className="grid grid-cols-2 gap-4">
                                            <div>
                                                <label className="block text-xs font-medium text-gray-600 mb-1 flex items-center gap-1"><Building2 className="w-3 h-3" /> Company</label>
                                                <input type="text" value={sig.company || ''} onChange={e => updateSigField('company', e.target.value)} placeholder="HiTop Plumbers" className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent" />
                                            </div>
                                            <div>
                                                <label className="block text-xs font-medium text-gray-600 mb-1 flex items-center gap-1"><Phone className="w-3 h-3" /> Phone</label>
                                                <input type="tel" value={sig.phone || ''} onChange={e => updateSigField('phone', e.target.value)} placeholder="(555) 555-5555" className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent" />
                                            </div>
                                        </div>
                                        <div className="grid grid-cols-2 gap-4">
                                            <div>
                                                <label className="block text-xs font-medium text-gray-600 mb-1 flex items-center gap-1"><AtSign className="w-3 h-3" /> Email</label>
                                                <input type="email" value={sig.email || ''} onChange={e => updateSigField('email', e.target.value)} placeholder="you@company.com" className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent" />
                                            </div>
                                            <div>
                                                <label className="block text-xs font-medium text-gray-600 mb-1 flex items-center gap-1"><Globe className="w-3 h-3" /> Website</label>
                                                <input type="url" value={sig.website || ''} onChange={e => updateSigField('website', e.target.value)} placeholder="www.company.com" className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent" />
                                            </div>
                                        </div>
                                        <div>
                                            <label className="block text-xs font-medium text-gray-600 mb-1 flex items-center gap-1"><ImageIcon className="w-3 h-3" /> Signature Logo / Photo URL</label>
                                            <input type="url" value={sig.logoUrl || ''} onChange={e => updateSigField('logoUrl', e.target.value)} placeholder="https://..." className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent" />
                                            {sig.logoUrl && (
                                                <div className="mt-2 inline-block p-2 bg-white border border-gray-200 rounded-lg">
                                                    <img src={sig.logoUrl} alt="Sig logo" className="max-h-12 rounded" />
                                                </div>
                                            )}
                                        </div>
                                        <div>
                                            <label className="block text-xs font-medium text-gray-600 mb-1">Tagline</label>
                                            <input type="text" value={sig.tagline || ''} onChange={e => updateSigField('tagline', e.target.value)} placeholder="Quality service, every time." className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent" />
                                        </div>
                                    </div>
                                );
                            })()}
                        </div>
                    </div>
                </div>
            ) : (
                /* Empty state when no email selected */
                !selected && filtered.length > 0 && (
                    <div className="flex-1 flex flex-col items-center justify-center bg-gray-50/50">
                        <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-indigo-100 to-purple-100 flex items-center justify-center mb-4">
                            <MailOpen className="w-8 h-8 text-indigo-400" />
                        </div>
                        <p className="text-gray-500 font-medium">Select an email to read</p>
                        <p className="text-xs text-gray-400 mt-1">{filtered.length} messages in {activeMailbox === 'all' ? 'all mailboxes' : activeMailbox}</p>
                    </div>
                )
            )}
        </div>
    );
};

export default EmailInbox;
