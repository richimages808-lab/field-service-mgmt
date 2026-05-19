import React, { useState, useEffect, useMemo } from 'react';
import { useAuth } from '../auth/AuthProvider';
import { collection, query, orderBy, onSnapshot, doc, updateDoc, where, Timestamp } from 'firebase/firestore';
import { db } from '../firebase';
import { httpsCallable } from 'firebase/functions';
import { functions } from '../firebase';
import {
    Inbox, Mail, MailOpen, Star, StarOff, Archive, ArrowLeft, Reply,
    Send, Search, RefreshCw, Tag, ExternalLink, Clock, AtSign,
    ChevronDown, X, Filter, MailPlus, Edit3, Paperclip, FileText, Download
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
    const orgId = (user as any)?.orgId;
    const [emails, setEmails] = useState<EmailMessage[]>([]);
    const [loading, setLoading] = useState(true);
    const [selectedId, setSelectedId] = useState<string | null>(null);
    const [activeMailbox, setActiveMailbox] = useState<string>('all');
    const [searchQuery, setSearchQuery] = useState('');
    const [showArchived, setShowArchived] = useState(false);
    const [replyOpen, setReplyOpen] = useState(false);
    const [replyBody, setReplyBody] = useState('');
    const [sending, setSending] = useState(false);
    const [emailPrefix, setEmailPrefix] = useState('');
    const [aliases, setAliases] = useState<string[]>([]);
    const [composeOpen, setComposeOpen] = useState(false);
    const [attachments, setAttachments] = useState<Attachment[]>([]);

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

    // Load org settings for prefix/aliases
    useEffect(() => {
        if (!orgId) return;
        const unsub = onSnapshot(doc(db, 'organizations', orgId), (snap) => {
            const data = snap.data();
            if (data?.inboundEmail) {
                setEmailPrefix(data.inboundEmail.prefix || '');
                setAliases(data.inboundEmail.aliases || []);
            }
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

    // Filter emails
    const filtered = useMemo(() => {
        let result = emails;
        if (!showArchived) result = result.filter(e => !e.archived);
        if (activeMailbox !== 'all') result = result.filter(e => e.mailbox === activeMailbox);
        if (searchQuery.trim()) {
            const q = searchQuery.toLowerCase();
            result = result.filter(e =>
                e.subject.toLowerCase().includes(q) ||
                e.from.toLowerCase().includes(q) ||
                e.fromName.toLowerCase().includes(q) ||
                (e.textBody || '').toLowerCase().includes(q)
            );
        }
        return result;
    }, [emails, activeMailbox, searchQuery, showArchived]);

    const unreadCounts = useMemo(() => {
        const counts: Record<string, number> = { all: 0, primary: 0 };
        emails.filter(e => !e.read && !e.archived).forEach(e => {
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
            <div className="w-56 bg-white border-r border-gray-200 flex flex-col shrink-0">
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
                    {mailboxes.map(box => {
                        const color = getMailboxColor(box === 'all' ? 'primary' : box);
                        const count = unreadCounts[box] || 0;
                        const isActive = activeMailbox === box;
                        return (
                            <button
                                key={box}
                                onClick={() => { setActiveMailbox(box); setSelectedId(null); }}
                                className={`w-full flex items-center gap-2.5 px-4 py-2.5 text-sm transition-colors ${
                                    isActive
                                        ? 'bg-indigo-50 text-indigo-700 font-semibold border-r-2 border-indigo-600'
                                        : 'text-gray-600 hover:bg-gray-50'
                                }`}
                            >
                                {box === 'all' ? (
                                    <Inbox className="w-4 h-4" />
                                ) : (
                                    <div className={`w-2.5 h-2.5 rounded-full ${color.dot}`} />
                                )}
                                <span className="capitalize flex-1 text-left">{box === 'all' ? 'All Mail' : box}</span>
                                {count > 0 && (
                                    <span className={`text-xs font-bold px-1.5 py-0.5 rounded-full ${
                                        isActive ? 'bg-indigo-600 text-white' : 'bg-gray-200 text-gray-600'
                                    }`}>
                                        {count}
                                    </span>
                                )}
                            </button>
                        );
                    })}
                    <div className="border-t border-gray-100 mt-2 pt-2">
                        <button
                            onClick={() => { setShowArchived(!showArchived); setSelectedId(null); }}
                            className={`w-full flex items-center gap-2.5 px-4 py-2.5 text-sm transition-colors ${
                                showArchived ? 'bg-gray-100 text-gray-800 font-medium' : 'text-gray-500 hover:bg-gray-50'
                            }`}
                        >
                            <Archive className="w-4 h-4" />
                            <span>Archived</span>
                        </button>
                    </div>
                </nav>
            </div>

            {/* ─── CENTER: Email List ─── */}
            <div className={`${selected ? 'w-96' : 'flex-1'} border-r border-gray-200 flex flex-col bg-white shrink-0 transition-all`}>
                {/* Search bar */}
                <div className="p-3 border-b border-gray-100">
                    <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                        <input
                            type="text"
                            value={searchQuery}
                            onChange={e => setSearchQuery(e.target.value)}
                            placeholder="Search emails..."
                            className="w-full pl-9 pr-4 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                        />
                        {searchQuery && (
                            <button onClick={() => setSearchQuery('')} className="absolute right-3 top-1/2 -translate-y-1/2">
                                <X className="w-4 h-4 text-gray-400 hover:text-gray-600" />
                            </button>
                        )}
                    </div>
                </div>

                {/* Email list */}
                <div className="flex-1 overflow-y-auto">
                    {loading ? (
                        <div className="flex items-center justify-center h-40">
                            <RefreshCw className="w-5 h-5 text-gray-400 animate-spin" />
                        </div>
                    ) : filtered.length === 0 ? (
                        <div className="flex flex-col items-center justify-center h-full text-gray-400 py-20">
                            <MailPlus className="w-12 h-12 mb-3 text-gray-300" />
                            <p className="text-sm font-medium">No emails yet</p>
                            <p className="text-xs mt-1">Inbound emails will appear here</p>
                        </div>
                    ) : (
                        filtered.map(email => {
                            const isSelected = selectedId === email.id;
                            const color = getMailboxColor(email.mailbox);
                            return (
                                <button
                                    key={email.id}
                                    onClick={() => setSelectedId(email.id)}
                                    className={`w-full text-left px-4 py-3 border-b border-gray-50 transition-colors ${
                                        isSelected
                                            ? 'bg-indigo-50 border-l-2 border-l-indigo-500'
                                            : email.read
                                                ? 'hover:bg-gray-50'
                                                : 'bg-blue-50/30 hover:bg-blue-50/60'
                                    }`}
                                >
                                    <div className="flex items-start gap-2">
                                        <button onClick={(e) => toggleStar(e, email)} className="mt-0.5 shrink-0">
                                            {email.starred
                                                ? <Star className="w-4 h-4 text-amber-500 fill-amber-500" />
                                                : <Star className="w-4 h-4 text-gray-300 hover:text-amber-400" />}
                                        </button>
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center gap-2">
                                                <span className={`text-sm truncate ${!email.read ? 'font-bold text-gray-900' : 'font-medium text-gray-700'}`}>
                                                    {email.fromName || email.from.split('@')[0]}
                                                </span>
                                                <span className="text-xs text-gray-400 shrink-0 ml-auto">
                                                    {formatTime(email.receivedAt)}
                                                </span>
                                            </div>
                                            <p className={`text-sm truncate ${!email.read ? 'font-semibold text-gray-800' : 'text-gray-600'}`}>
                                                {email.subject}
                                            </p>
                                            <div className="flex items-center gap-2 mt-1">
                                                {email.mailbox !== 'primary' && (
                                                    <span className={`inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${color.bg} ${color.text} ${color.border} border`}>
                                                        {email.mailbox}
                                                    </span>
                                                )}
                                                {email.ticketId && (
                                                    <span className="inline-flex items-center gap-0.5 text-[10px] text-emerald-600 font-medium">
                                                        <Tag className="w-2.5 h-2.5" />ticket
                                                    </span>
                                                )}
                                                <span className="text-xs text-gray-400 truncate">
                                                    {(email.textBody || '').substring(0, 80)}
                                                </span>
                                            </div>
                                        </div>
                                        {!email.read && (
                                            <div className="w-2.5 h-2.5 rounded-full bg-indigo-500 shrink-0 mt-1.5" />
                                        )}
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
