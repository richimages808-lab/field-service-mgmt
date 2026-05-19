import React, { useState } from 'react';
import { X, Send, ChevronDown, Paperclip, FileText, Loader2 } from 'lucide-react';
import { httpsCallable } from 'firebase/functions';
import { functions, storage } from '../firebase';
import { ref, uploadBytesResumable, getDownloadURL } from 'firebase/storage';
import { useAuth } from '../auth/AuthProvider';
import toast from 'react-hot-toast';
import ReactQuill from 'react-quill';
import 'react-quill/dist/quill.snow.css';

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

interface ComposeEmailModalProps {
    isOpen: boolean;
    onClose: () => void;
    aliases: string[];
    emailPrefix: string;
}

export const ComposeEmailModal: React.FC<ComposeEmailModalProps> = ({ isOpen, onClose, aliases, emailPrefix }) => {
    const { user } = useAuth();
    const orgId = (user as any)?.orgId;
    
    const [to, setTo] = useState('');
    const [subject, setSubject] = useState('');
    const [body, setBody] = useState('');
    const [fromAlias, setFromAlias] = useState(''); // Empty means default (primary)
    const [sending, setSending] = useState(false);
    const [attachments, setAttachments] = useState<Attachment[]>([]);
    
    // File upload handler
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

    if (!isOpen) return null;

    const handleSend = async () => {
        if (!to.trim() || !subject.trim() || !body.trim()) {
            toast.error('Please fill in all fields');
            return;
        }

        setSending(true);
        try {
            const sendEmail = httpsCallable(functions, 'sendCustomEmail');
            const stripHtml = (html: string) => {
                const tmp = document.createElement('DIV');
                tmp.innerHTML = html;
                return tmp.textContent || tmp.innerText || '';
            };

            // Ensure all non-error attachments are fully uploaded
            const pendingUploads = attachments.filter(a => !a.error && a.progress! < 100);
            if (pendingUploads.length > 0) {
                toast.error('Please wait for attachments to finish uploading.');
                setSending(false);
                return;
            }

            const validAttachments = attachments.filter(a => !a.error && a.url).map(a => ({
                name: a.name,
                url: a.url,
                path: a.path,
                type: a.type,
                size: a.size
            }));

            await sendEmail({
                to,
                subject,
                textBody: stripHtml(body),
                htmlBody: body,
                fromAlias: fromAlias || null,
                attachments: validAttachments
            });
            toast.success('Email sent successfully');
            onClose();
            setTo('');
            setSubject('');
            setBody('');
            setFromAlias('');
        } catch (err: any) {
            console.error('Failed to send email:', err);
            toast.error(err.message || 'Failed to send email');
        } finally {
            setSending(false);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-gray-900/50 backdrop-blur-sm">
            <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-200">
                {/* Header */}
                <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 bg-gray-50/50">
                    <h2 className="text-lg font-bold text-gray-900">New Message</h2>
                    <button
                        onClick={onClose}
                        className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-xl transition-colors"
                    >
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {/* Form Fields */}
                <div className="flex flex-col flex-1 min-h-0">
                    <div className="flex items-center px-6 py-3 border-b border-gray-100">
                        <span className="w-16 text-sm font-medium text-gray-500">From:</span>
                        <div className="flex-1 relative">
                            <select
                                value={fromAlias}
                                onChange={(e) => setFromAlias(e.target.value)}
                                className="w-full appearance-none bg-transparent text-sm font-medium text-gray-900 focus:outline-none cursor-pointer pr-8"
                            >
                                <option value="">Default ({emailPrefix ? `support@${emailPrefix}.dispatch-box.com` : 'Primary Address'})</option>
                                {aliases.map(alias => (
                                    <option key={alias} value={alias}>
                                        {alias}@dispatch-box.com
                                    </option>
                                ))}
                            </select>
                            <ChevronDown className="w-4 h-4 text-gray-400 absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none" />
                        </div>
                    </div>

                    <div className="flex items-center px-6 py-3 border-b border-gray-100">
                        <span className="w-16 text-sm font-medium text-gray-500">To:</span>
                        <input
                            type="email"
                            value={to}
                            onChange={(e) => setTo(e.target.value)}
                            placeholder="recipient@example.com"
                            className="flex-1 bg-transparent text-sm text-gray-900 focus:outline-none placeholder-gray-400"
                        />
                    </div>

                    <div className="flex items-center px-6 py-3 border-b border-gray-100">
                        <span className="w-16 text-sm font-medium text-gray-500">Subject:</span>
                        <input
                            type="text"
                            value={subject}
                            onChange={(e) => setSubject(e.target.value)}
                            placeholder="Email Subject"
                            className="flex-1 bg-transparent text-sm text-gray-900 focus:outline-none placeholder-gray-400 font-medium"
                        />
                    </div>

                    <div className="flex-1 bg-white flex flex-col min-h-[300px]">
                        <ReactQuill 
                            theme="snow"
                            value={body}
                            onChange={setBody}
                            placeholder="Type your message here..."
                            className="flex-1 h-full"
                            modules={{
                                toolbar: [
                                    [{ 'header': [1, 2, 3, false] }],
                                    ['bold', 'italic', 'underline', 'strike'],
                                    [{ 'list': 'ordered'}, { 'list': 'bullet' }],
                                    ['link', 'clean']
                                ]
                            }}
                        />
                    </div>
                    
                    {/* Attachments Section */}
                    {attachments.length > 0 && (
                        <div className="px-6 py-3 bg-gray-50/50 border-t border-gray-100 flex flex-wrap gap-2 max-h-32 overflow-y-auto">
                            {attachments.map((att, idx) => (
                                <div key={idx} className="flex items-center gap-2 bg-white border border-gray-200 rounded-lg px-3 py-2 text-xs w-48 shadow-sm">
                                    <FileText className="w-4 h-4 text-gray-400 shrink-0" />
                                    <div className="flex-1 min-w-0 flex flex-col">
                                        <span className="truncate font-medium text-gray-700" title={att.name}>{att.name}</span>
                                        {att.error ? (
                                            <span className="text-red-500 text-[10px]">Failed</span>
                                        ) : (att.progress ?? 0) < 100 ? (
                                            <div className="w-full bg-gray-200 rounded-full h-1 mt-1">
                                                <div className="bg-indigo-500 h-1 rounded-full transition-all duration-300" style={{ width: `${att.progress}%` }} />
                                            </div>
                                        ) : (
                                            <span className="text-gray-400 text-[10px]">{(att.size / 1024).toFixed(0)} KB</span>
                                        )}
                                    </div>
                                    <button onClick={() => removeAttachment(att.path)} className="text-gray-400 hover:text-red-500 p-1 shrink-0 rounded hover:bg-red-50">
                                        <X className="w-3 h-3" />
                                    </button>
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                {/* Footer / Actions */}
                <div className="px-6 py-4 border-t border-gray-100 bg-gray-50/50 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <label className="cursor-pointer p-2 text-gray-500 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors flex items-center gap-2 text-sm font-medium">
                            <Paperclip className="w-4 h-4" />
                            <span className="hidden sm:inline">Attach Files</span>
                            <input type="file" multiple className="hidden" onChange={handleFileSelect} />
                        </label>
                    </div>
                    <div className="flex items-center gap-3">
                        <button
                            onClick={onClose}
                            className="px-4 py-2 text-sm font-medium text-gray-600 hover:text-gray-900 transition-colors"
                        >
                            Discard
                        </button>
                        <button
                            onClick={handleSend}
                            disabled={sending || !to.trim() || !subject.trim() || !body.trim()}
                            className="flex items-center gap-2 px-6 py-2.5 bg-indigo-600 text-white text-sm font-medium rounded-xl hover:bg-indigo-700 disabled:opacity-50 transition-colors shadow-sm"
                        >
                            <Send className="w-4 h-4" />
                            {sending ? 'Sending...' : 'Send Email'}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};
