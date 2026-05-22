import React, { useState, useEffect, useRef } from 'react';
import { Upload, Image, Type, Phone, Mail, Globe, MessageSquareQuote, X, Plus, Eye, EyeOff, Palette } from 'lucide-react';
import { storage } from '../../firebase';
import { ref, uploadBytesResumable, getDownloadURL } from 'firebase/storage';
import { useAuth } from '../../auth/AuthProvider';
import toast from 'react-hot-toast';

interface SocialLink {
    platform: string;
    url: string;
}

export interface StructuredSignatureData {
    type: 'structured';
    name: string;
    title: string;
    company: string;
    phone: string;
    email: string;
    website: string;
    logoUrl: string;
    socialLinks: SocialLink[];
    tagline: string;
    primaryColor: string;
}

interface EmailSignatureBuilderProps {
    value: string; // JSON stringified StructuredSignatureData or raw HTML
    onChange: (value: string) => void;
    orgPrimaryColor?: string;
    orgLogoUrl?: string;
    orgName?: string;
}

const DEFAULT_SIGNATURE: StructuredSignatureData = {
    type: 'structured',
    name: '',
    title: '',
    company: '',
    phone: '',
    email: '',
    website: '',
    logoUrl: '',
    socialLinks: [],
    tagline: '',
    primaryColor: '#4F46E5',
};

const SOCIAL_PLATFORMS = [
    'Facebook', 'Instagram', 'LinkedIn', 'Twitter/X', 'YouTube', 'Yelp', 'TikTok', 'Pinterest'
];

export const EmailSignatureBuilder: React.FC<EmailSignatureBuilderProps> = ({
    value,
    onChange,
    orgPrimaryColor = '#4F46E5',
    orgLogoUrl = '',
    orgName = '',
}) => {
    const { user } = useAuth();
    const orgId = (user as any)?.orgId;
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [showPreview, setShowPreview] = useState(true);
    const [uploading, setUploading] = useState(false);
    const [uploadProgress, setUploadProgress] = useState(0);
    const [mode, setMode] = useState<'builder' | 'raw'>('builder');

    // Parse existing value into structured data
    const [sig, setSig] = useState<StructuredSignatureData>(() => {
        try {
            const parsed = JSON.parse(value);
            if (parsed && parsed.type === 'structured') return parsed;
        } catch { /* not JSON */ }
        // If existing value is raw HTML, start fresh
        return {
            ...DEFAULT_SIGNATURE,
            company: orgName,
            primaryColor: orgPrimaryColor,
            logoUrl: orgLogoUrl,
        };
    });

    const [rawSignature, setRawSignature] = useState(() => {
        try {
            const parsed = JSON.parse(value);
            if (parsed && parsed.type === 'structured') return '';
        } catch { /* not JSON */ }
        return value || '';
    });

    // Propagate changes
    useEffect(() => {
        if (mode === 'builder') {
            onChange(JSON.stringify(sig));
        } else {
            onChange(rawSignature);
        }
    }, [sig, rawSignature, mode]);

    const updateField = (field: keyof StructuredSignatureData, value: any) => {
        setSig(prev => ({ ...prev, [field]: value }));
    };

    const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file || !orgId) return;

        if (!file.type.startsWith('image/')) {
            toast.error('Please select an image file');
            return;
        }

        if (file.size > 2 * 1024 * 1024) {
            toast.error('Image must be under 2MB');
            return;
        }

        setUploading(true);
        const storagePath = `organizations/${orgId}/branding/signature_logo_${Date.now()}.${file.name.split('.').pop()}`;
        const storageRef = ref(storage, storagePath);
        const uploadTask = uploadBytesResumable(storageRef, file);

        uploadTask.on('state_changed',
            (snapshot) => {
                const progress = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
                setUploadProgress(progress);
            },
            (error) => {
                console.error('Logo upload failed:', error);
                toast.error('Failed to upload logo');
                setUploading(false);
                setUploadProgress(0);
            },
            async () => {
                const downloadUrl = await getDownloadURL(uploadTask.snapshot.ref);
                updateField('logoUrl', downloadUrl);
                setUploading(false);
                setUploadProgress(0);
                toast.success('Logo uploaded');
            }
        );

        e.target.value = '';
    };

    const addSocialLink = () => {
        setSig(prev => ({
            ...prev,
            socialLinks: [...prev.socialLinks, { platform: 'Facebook', url: '' }]
        }));
    };

    const updateSocialLink = (index: number, field: 'platform' | 'url', value: string) => {
        setSig(prev => ({
            ...prev,
            socialLinks: prev.socialLinks.map((link, i) =>
                i === index ? { ...link, [field]: value } : link
            )
        }));
    };

    const removeSocialLink = (index: number) => {
        setSig(prev => ({
            ...prev,
            socialLinks: prev.socialLinks.filter((_, i) => i !== index)
        }));
    };

    // Generate preview HTML
    const renderPreview = () => {
        const color = sig.primaryColor || orgPrimaryColor;
        return (
            <div style={{ borderTop: '2px solid #e5e7eb', paddingTop: 16, marginTop: 16 }}>
                <table cellPadding={0} cellSpacing={0} style={{ fontFamily: 'Arial, sans-serif', fontSize: 14, color: '#374151' }}>
                    <tbody>
                        <tr>
                            {sig.logoUrl && (
                                <td style={{ paddingRight: 16, verticalAlign: 'top' }}>
                                    <img
                                        src={sig.logoUrl}
                                        alt={sig.company || 'Logo'}
                                        style={{ maxWidth: 80, maxHeight: 80, borderRadius: 8, objectFit: 'contain' }}
                                    />
                                </td>
                            )}
                            <td style={{ verticalAlign: 'top' }}>
                                {sig.name && (
                                    <div style={{ fontWeight: 700, fontSize: 16, color: '#111827' }}>{sig.name}</div>
                                )}
                                {sig.title && (
                                    <div style={{ color, fontSize: 13, marginTop: 2 }}>{sig.title}</div>
                                )}
                                {sig.company && (
                                    <div style={{ fontWeight: 600, fontSize: 13, marginTop: 2, color: '#4B5563' }}>{sig.company}</div>
                                )}
                                {(sig.phone || sig.email || sig.website) && (
                                    <div style={{ marginTop: 8, fontSize: 12, color: '#6B7280', lineHeight: '1.6' }}>
                                        {sig.phone && <div>📞 {sig.phone}</div>}
                                        {sig.email && (
                                            <div>✉️ <span style={{ color, textDecoration: 'none' }}>{sig.email}</span></div>
                                        )}
                                        {sig.website && (
                                            <div>🌐 <span style={{ color, textDecoration: 'none' }}>{sig.website}</span></div>
                                        )}
                                    </div>
                                )}
                                {sig.tagline && (
                                    <div style={{ marginTop: 8, fontStyle: 'italic', fontSize: 12, color: '#9CA3AF' }}>
                                        "{sig.tagline}"
                                    </div>
                                )}
                                {sig.socialLinks.length > 0 && (
                                    <div style={{ marginTop: 8, display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                                        {sig.socialLinks.filter(l => l.url).map((link, i) => (
                                            <span key={i} style={{ color, fontSize: 12 }}>{link.platform}</span>
                                        ))}
                                    </div>
                                )}
                            </td>
                        </tr>
                    </tbody>
                </table>
            </div>
        );
    };

    return (
        <div className="space-y-4">
            {/* Mode Toggle */}
            <div className="flex items-center gap-2">
                <button
                    onClick={() => setMode('builder')}
                    className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${
                        mode === 'builder'
                            ? 'bg-indigo-100 text-indigo-700 border border-indigo-200'
                            : 'text-gray-500 hover:bg-gray-100 border border-transparent'
                    }`}
                >
                    Visual Builder
                </button>
                <button
                    onClick={() => setMode('raw')}
                    className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${
                        mode === 'raw'
                            ? 'bg-indigo-100 text-indigo-700 border border-indigo-200'
                            : 'text-gray-500 hover:bg-gray-100 border border-transparent'
                    }`}
                >
                    Raw HTML
                </button>
                <div className="flex-1" />
                <button
                    onClick={() => setShowPreview(!showPreview)}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-500 hover:bg-gray-100 rounded-lg transition-colors"
                >
                    {showPreview ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                    {showPreview ? 'Hide Preview' : 'Show Preview'}
                </button>
            </div>

            {mode === 'builder' ? (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    {/* Builder Form */}
                    <div className="space-y-4">
                        {/* Logo Upload */}
                        <div>
                            <label className="block text-xs font-medium text-gray-600 mb-1.5">Signature Logo</label>
                            <div className="flex items-center gap-3">
                                {sig.logoUrl ? (
                                    <div className="relative group">
                                        <img
                                            src={sig.logoUrl}
                                            alt="Signature logo"
                                            className="w-16 h-16 object-contain rounded-lg border border-gray-200 bg-white p-1"
                                        />
                                        <button
                                            onClick={() => updateField('logoUrl', '')}
                                            className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-red-500 text-white rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity shadow-sm"
                                        >
                                            <X className="w-3 h-3" />
                                        </button>
                                    </div>
                                ) : (
                                    <div
                                        onClick={() => fileInputRef.current?.click()}
                                        className="w-16 h-16 border-2 border-dashed border-gray-300 rounded-lg flex flex-col items-center justify-center cursor-pointer hover:border-indigo-400 hover:bg-indigo-50/50 transition-colors"
                                    >
                                        {uploading ? (
                                            <div className="text-center">
                                                <div className="w-8 h-1.5 bg-gray-200 rounded-full overflow-hidden">
                                                    <div className="h-full bg-indigo-500 rounded-full transition-all" style={{ width: `${uploadProgress}%` }} />
                                                </div>
                                            </div>
                                        ) : (
                                            <>
                                                <Upload className="w-4 h-4 text-gray-400" />
                                                <span className="text-[10px] text-gray-400 mt-0.5">Upload</span>
                                            </>
                                        )}
                                    </div>
                                )}
                                <input
                                    ref={fileInputRef}
                                    type="file"
                                    accept="image/*"
                                    onChange={handleLogoUpload}
                                    className="hidden"
                                />
                                <div className="text-xs text-gray-500">
                                    <p>Upload your logo or brand mark</p>
                                    <p className="text-gray-400">Max 2MB, PNG or JPG</p>
                                </div>
                            </div>
                        </div>

                        {/* Name & Title */}
                        <div className="grid grid-cols-2 gap-3">
                            <div>
                                <label className="block text-xs font-medium text-gray-600 mb-1">
                                    <Type className="w-3 h-3 inline mr-1" />Full Name
                                </label>
                                <input
                                    type="text"
                                    value={sig.name}
                                    onChange={e => updateField('name', e.target.value)}
                                    placeholder="John Smith"
                                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-medium text-gray-600 mb-1">Job Title</label>
                                <input
                                    type="text"
                                    value={sig.title}
                                    onChange={e => updateField('title', e.target.value)}
                                    placeholder="Owner / Lead Technician"
                                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                                />
                            </div>
                        </div>

                        {/* Company */}
                        <div>
                            <label className="block text-xs font-medium text-gray-600 mb-1">Company Name</label>
                            <input
                                type="text"
                                value={sig.company}
                                onChange={e => updateField('company', e.target.value)}
                                placeholder="ACME Plumbing Services"
                                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                            />
                        </div>

                        {/* Contact Info */}
                        <div className="grid grid-cols-1 gap-3">
                            <div>
                                <label className="block text-xs font-medium text-gray-600 mb-1">
                                    <Phone className="w-3 h-3 inline mr-1" />Phone
                                </label>
                                <input
                                    type="tel"
                                    value={sig.phone}
                                    onChange={e => updateField('phone', e.target.value)}
                                    placeholder="(808) 555-1234"
                                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-medium text-gray-600 mb-1">
                                    <Mail className="w-3 h-3 inline mr-1" />Email
                                </label>
                                <input
                                    type="email"
                                    value={sig.email}
                                    onChange={e => updateField('email', e.target.value)}
                                    placeholder="john@acmeplumbing.com"
                                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-medium text-gray-600 mb-1">
                                    <Globe className="w-3 h-3 inline mr-1" />Website
                                </label>
                                <input
                                    type="url"
                                    value={sig.website}
                                    onChange={e => updateField('website', e.target.value)}
                                    placeholder="https://www.acmeplumbing.com"
                                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                                />
                            </div>
                        </div>

                        {/* Tagline */}
                        <div>
                            <label className="block text-xs font-medium text-gray-600 mb-1">
                                <MessageSquareQuote className="w-3 h-3 inline mr-1" />Tagline / Slogan
                            </label>
                            <input
                                type="text"
                                value={sig.tagline}
                                onChange={e => updateField('tagline', e.target.value)}
                                placeholder="Quality service you can trust"
                                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                            />
                        </div>

                        {/* Brand Color */}
                        <div>
                            <label className="block text-xs font-medium text-gray-600 mb-1">
                                <Palette className="w-3 h-3 inline mr-1" />Accent Color
                            </label>
                            <div className="flex items-center gap-3">
                                <input
                                    type="color"
                                    value={sig.primaryColor}
                                    onChange={e => updateField('primaryColor', e.target.value)}
                                    className="w-10 h-10 rounded-lg border border-gray-200 cursor-pointer p-0.5"
                                />
                                <input
                                    type="text"
                                    value={sig.primaryColor}
                                    onChange={e => updateField('primaryColor', e.target.value)}
                                    className="w-28 px-3 py-2 text-sm font-mono border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                                />
                                <button
                                    onClick={() => updateField('primaryColor', orgPrimaryColor)}
                                    className="text-xs text-indigo-600 hover:text-indigo-700 font-medium"
                                >
                                    Use org color
                                </button>
                            </div>
                        </div>

                        {/* Social Links */}
                        <div>
                            <label className="block text-xs font-medium text-gray-600 mb-2">Social Links</label>
                            {sig.socialLinks.map((link, idx) => (
                                <div key={idx} className="flex items-center gap-2 mb-2">
                                    <select
                                        value={link.platform}
                                        onChange={e => updateSocialLink(idx, 'platform', e.target.value)}
                                        className="w-32 px-2 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                                    >
                                        {SOCIAL_PLATFORMS.map(p => (
                                            <option key={p} value={p}>{p}</option>
                                        ))}
                                    </select>
                                    <input
                                        type="url"
                                        value={link.url}
                                        onChange={e => updateSocialLink(idx, 'url', e.target.value)}
                                        placeholder="https://..."
                                        className="flex-1 px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                                    />
                                    <button
                                        onClick={() => removeSocialLink(idx)}
                                        className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                                    >
                                        <X className="w-4 h-4" />
                                    </button>
                                </div>
                            ))}
                            <button
                                onClick={addSocialLink}
                                className="flex items-center gap-1.5 text-xs font-medium text-indigo-600 hover:text-indigo-700 mt-1"
                            >
                                <Plus className="w-3.5 h-3.5" /> Add Social Link
                            </button>
                        </div>
                    </div>

                    {/* Live Preview */}
                    {showPreview && (
                        <div className="lg:sticky lg:top-4">
                            <label className="block text-xs font-medium text-gray-600 mb-2">Live Preview</label>
                            <div className="border border-gray-200 rounded-xl bg-white p-6 shadow-sm">
                                <div className="text-sm text-gray-500 mb-4 pb-4 border-b border-gray-100">
                                    <p>Hi Customer,</p>
                                    <p className="mt-2 text-gray-400">Your message content would appear here...</p>
                                </div>
                                {(sig.name || sig.company || sig.logoUrl) ? (
                                    renderPreview()
                                ) : (
                                    <div className="py-8 text-center text-gray-400 text-sm">
                                        <Image className="w-8 h-8 mx-auto mb-2 text-gray-300" />
                                        <p>Fill in the fields to see your signature</p>
                                    </div>
                                )}
                            </div>
                        </div>
                    )}
                </div>
            ) : (
                /* Raw HTML Mode */
                <div className="space-y-3">
                    <textarea
                        value={rawSignature}
                        onChange={e => setRawSignature(e.target.value)}
                        rows={6}
                        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent font-mono text-sm"
                        placeholder={'-- \nBest regards,\nThe Team'}
                    />
                    <p className="text-xs text-gray-500">
                        HTML is supported. You can use standard formatting tags like &lt;b&gt;, &lt;i&gt;, &lt;a&gt;, &lt;img&gt;, and &lt;table&gt;.
                    </p>
                    {showPreview && rawSignature && (
                        <div className="border border-gray-200 rounded-xl bg-white p-6 shadow-sm">
                            <label className="block text-xs font-medium text-gray-600 mb-2">Preview</label>
                            <div
                                className="prose prose-sm max-w-none"
                                dangerouslySetInnerHTML={{ __html: rawSignature }}
                            />
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};

export default EmailSignatureBuilder;
