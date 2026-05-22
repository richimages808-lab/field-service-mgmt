import React, { useState, useRef, useCallback } from 'react';
import { Palette, Upload, Type, MessageSquare, LayoutTemplate, Link as LinkIcon, Facebook, Instagram, Globe, Image as ImageIcon, Loader2, X, Trash2, Copy, Check, ExternalLink, Mail, Share2 } from 'lucide-react';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { doc, updateDoc } from 'firebase/firestore';
import { storage, db } from '../../firebase';
import { CustomerPortalLogin } from '../../pages/portal/CustomerPortalLogin';
import { useAuth } from '../../auth/AuthProvider';
import { SectionEditor } from './SectionEditor';
import { v4 as uuidv4 } from 'uuid';
import toast from 'react-hot-toast';

interface WebsiteBuilderProps {
    settings: any;
    onChange: (field: string, value: any) => void;
}



const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB

/** Tiny component for a copiable link row */
const CopyableField: React.FC<{ label: string; value: string; icon: React.ReactNode; isLink?: boolean }> = ({ label, value, icon, isLink }) => {
    const [copied, setCopied] = useState(false);

    const handleCopy = () => {
        navigator.clipboard.writeText(value);
        setCopied(true);
        toast.success(`${label} copied!`);
        setTimeout(() => setCopied(false), 2000);
    };

    return (
        <div className="flex items-center gap-3 bg-gray-50 border border-gray-200 rounded-lg px-4 py-3 group hover:border-indigo-300 hover:bg-indigo-50/30 transition-all">
            <div className="flex-shrink-0 w-9 h-9 rounded-lg bg-indigo-100 text-indigo-600 flex items-center justify-center">
                {icon}
            </div>
            <div className="flex-1 min-w-0">
                <p className="text-xs font-medium text-gray-500 uppercase tracking-wider">{label}</p>
                {isLink ? (
                    <a href={value} target="_blank" rel="noopener noreferrer" className="text-sm font-semibold text-indigo-700 hover:underline truncate block">
                        {value}
                    </a>
                ) : (
                    <p className="text-sm font-semibold text-gray-900 truncate">{value}</p>
                )}
            </div>
            <div className="flex items-center gap-1.5 flex-shrink-0">
                {isLink && (
                    <a
                        href={value}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="p-2 rounded-lg text-gray-400 hover:text-indigo-600 hover:bg-indigo-100 transition"
                        title="Open in new tab"
                    >
                        <ExternalLink className="w-4 h-4" />
                    </a>
                )}
                <button
                    onClick={handleCopy}
                    className={`p-2 rounded-lg transition ${copied ? 'text-green-600 bg-green-100' : 'text-gray-400 hover:text-indigo-600 hover:bg-indigo-100'}`}
                    title="Copy to clipboard"
                >
                    {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                </button>
            </div>
        </div>
    );
};

interface ImageUploadZoneProps {
    id: string;
    label: string;
    hint: string;
    currentUrl: string;
    accept?: string;
    aspectLabel?: string;
    onUpload: (url: string) => void;
    onRemove: () => void;
    orgId: string;
    storagePath: string;
}

const ImageUploadZone: React.FC<ImageUploadZoneProps> = ({
    id,
    label,
    hint,
    currentUrl,
    accept = 'image/png,image/jpeg,image/svg+xml,image/webp',
    aspectLabel,
    onUpload,
    onRemove,
    orgId,
    storagePath
}) => {
    const [uploading, setUploading] = useState(false);
    const [dragActive, setDragActive] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const handleFile = useCallback(async (file: File) => {
        if (!file.type.startsWith('image/')) {
            toast.error('Please select an image file');
            return;
        }
        if (file.size > MAX_FILE_SIZE) {
            toast.error('File too large — max 5MB');
            return;
        }

        setUploading(true);
        try {
            const ext = file.name.split('.').pop() || 'png';
            const fileName = `${storagePath}-${uuidv4()}.${ext}`;
            const storageRef = ref(storage, `organizations/${orgId}/${fileName}`);
            await uploadBytes(storageRef, file);
            const downloadUrl = await getDownloadURL(storageRef);
            onUpload(downloadUrl);
            toast.success(`${label} uploaded!`);
        } catch (err: any) {
            console.error(`Error uploading ${label}:`, err);
            toast.error(`Failed to upload ${label}`);
        } finally {
            setUploading(false);
        }
    }, [orgId, storagePath, label, onUpload]);

    const handleDrop = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setDragActive(false);
        const file = e.dataTransfer.files?.[0];
        if (file) handleFile(file);
    }, [handleFile]);

    const handleDragOver = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setDragActive(true);
    }, []);

    const handleDragLeave = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setDragActive(false);
    }, []);

    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) handleFile(file);
        // Reset so re-selecting the same file triggers onChange
        if (fileInputRef.current) fileInputRef.current.value = '';
    };

    return (
        <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">{label}</label>

            {currentUrl ? (
                /* Preview with remove / replace */
                <div className="relative group rounded-xl overflow-hidden border border-gray-200 bg-gray-50">
                    <img
                        src={currentUrl}
                        alt={label}
                        className="w-full h-36 object-contain bg-[repeating-conic-gradient(#f3f4f6_0%_25%,transparent_0%_50%)] bg-[length:16px_16px]"
                    />
                    {/* Hover overlay */}
                    <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-3">
                        <button
                            type="button"
                            onClick={() => fileInputRef.current?.click()}
                            disabled={uploading}
                            className="px-3 py-1.5 bg-white text-gray-800 rounded-lg text-sm font-medium flex items-center gap-1.5 hover:bg-gray-100 transition shadow"
                        >
                            <Upload className="w-3.5 h-3.5" />
                            Replace
                        </button>
                        <button
                            type="button"
                            onClick={onRemove}
                            className="px-3 py-1.5 bg-red-600 text-white rounded-lg text-sm font-medium flex items-center gap-1.5 hover:bg-red-700 transition shadow"
                        >
                            <Trash2 className="w-3.5 h-3.5" />
                            Remove
                        </button>
                    </div>
                    {uploading && (
                        <div className="absolute inset-0 bg-white/80 flex items-center justify-center">
                            <Loader2 className="w-6 h-6 animate-spin text-indigo-600" />
                        </div>
                    )}
                </div>
            ) : (
                /* Drop zone */
                <div
                    id={id}
                    onDrop={handleDrop}
                    onDragOver={handleDragOver}
                    onDragLeave={handleDragLeave}
                    onClick={() => fileInputRef.current?.click()}
                    className={`
                        relative flex flex-col items-center justify-center w-full h-36 border-2 border-dashed rounded-xl cursor-pointer transition-all duration-200
                        ${dragActive
                            ? 'border-indigo-500 bg-indigo-50 scale-[1.01]'
                            : 'border-gray-300 bg-gray-50 hover:bg-gray-100 hover:border-gray-400'
                        }
                        ${uploading ? 'opacity-60 pointer-events-none' : ''}
                    `}
                >
                    {uploading ? (
                        <>
                            <Loader2 className="w-8 h-8 text-indigo-500 animate-spin mb-2" />
                            <p className="text-sm font-medium text-gray-600">Uploading...</p>
                        </>
                    ) : (
                        <>
                            <div className="w-12 h-12 rounded-full bg-indigo-100 flex items-center justify-center mb-2">
                                <ImageIcon className="w-5 h-5 text-indigo-600" />
                            </div>
                            <p className="text-sm text-gray-600 font-medium">
                                <span className="text-indigo-600">Click to upload</span> or drag & drop
                            </p>
                            <p className="text-xs text-gray-400 mt-1">PNG, JPG, SVG, or WebP — max 5MB</p>
                            {aspectLabel && (
                                <p className="text-xs text-gray-400">{aspectLabel}</p>
                            )}
                        </>
                    )}
                </div>
            )}

            <input
                ref={fileInputRef}
                type="file"
                className="hidden"
                accept={accept}
                onChange={handleInputChange}
                disabled={uploading}
            />
            <p className="text-xs text-gray-500 mt-1.5">{hint}</p>
        </div>
    );
};

export const WebsiteBuilder: React.FC<WebsiteBuilderProps> = ({ settings, onChange }) => {
    const { organization } = useAuth();
    const orgId = organization?.id || '';

    // Create a mock organization for the live preview
    const previewOrg = {
        id: 'preview',
        name: settings.name || 'Your Company',
        slug: 'preview',
        branding: {
            primaryColor: settings.primaryColor || '#3B82F6',
            secondaryColor: settings.secondaryColor || '#1e3a8a',
            accentColor: settings.accentColor || '#f59e0b',
            logoUrl: settings.logoUrl,
            companyName: settings.name,
            heroImageUrl: settings.heroImageUrl,
            fontFamily: settings.fontFamily || 'Inter',
            welcomeMessage: settings.welcomeMessage,
            buttonStyle: settings.buttonStyle || 'rounded',
            buttonText: settings.buttonText || 'Send Magic Link',
            headerSubtitle: settings.headerSubtitle || 'Service History & Account',
            tagline: settings.tagline || '',
            socialLinks: {
                facebook: settings.socialFacebook,
                instagram: settings.socialInstagram,
                yelp: settings.socialYelp,
                website: settings.socialWebsite
            }
        }
    };

    const handleLogoUploaded = (url: string) => {
        onChange('logoUrl', url);
    };

    const handleHeroUploaded = (url: string) => {
        onChange('heroImageUrl', url);
    };

    return (
        <div className="flex flex-col lg:flex-row gap-8">
            {/* Left Column: Controls */}
            <div className="flex-1 space-y-8 max-w-xl">
                <div>
                    <h2 className="text-xl font-bold text-gray-900 mb-1 flex items-center gap-2">
                        <LayoutTemplate className="w-5 h-5 text-indigo-600" />
                        Website Builder
                    </h2>
                    <p className="text-sm text-gray-500 mb-6">Customize how your company portal appears to your customers.</p>
                </div>

                {/* 0. Shareable Links Card */}
                {(() => {
                    // Derive live slug from settings name so it updates as user types
                    const liveSlug = (settings.name || '')
                        .toLowerCase().trim()
                        .replace(/[^a-z0-9\s-]/g, '')
                        .replace(/\s+/g, '-')
                        .replace(/-+/g, '-')
                        .replace(/^-|-$/g, '');

                    const liveEmailPrefix = settings.emailPrefix || liveSlug;

                    const portalUrl = organization?.customDomain
                        ? `https://${organization.customDomain}`
                        : `${window.location.origin}/portal/login${liveSlug ? `?org=${liveSlug}` : ''}`;

                    const serviceEmail = liveEmailPrefix ? `${liveEmailPrefix}@dispatch-box.com` : '';

                    return (
                        <div className="bg-gradient-to-br from-indigo-50 via-white to-purple-50 p-6 rounded-xl border border-indigo-200 shadow-sm space-y-4">
                            <h3 className="font-semibold text-gray-900 flex items-center gap-2 border-b border-indigo-200 pb-3">
                                <Share2 className="w-4 h-4 text-indigo-500" />
                                Share Your Portal
                                <span className="ml-auto text-xs bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded-full font-medium">Share these with customers</span>
                            </h3>

                            <CopyableField
                                label="Customer Portal URL"
                                value={portalUrl}
                                icon={<Globe className="w-4 h-4" />}
                                isLink
                            />

                            {serviceEmail && (
                                <CopyableField
                                    label="Service Email"
                                    value={serviceEmail}
                                    icon={<Mail className="w-4 h-4" />}
                                />
                            )}

                            <p className="text-xs text-gray-500 leading-relaxed">
                                Share this URL on your website, social media, business cards, and email signatures so customers can log in, view jobs, and pay invoices.
                                {!organization?.customDomain && (
                                    <span className="text-indigo-600 font-medium"> Want a custom domain like yourcompany.com? Check Add-ons & Services.</span>
                                )}
                            </p>
                        </div>
                    );
                })()}

                {/* 1. Imagery */}
                <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm space-y-5">
                    <h3 className="font-semibold text-gray-900 flex items-center gap-2 border-b pb-3">
                        <Upload className="w-4 h-4 text-gray-400" />
                        Logos & Imagery
                    </h3>

                    <ImageUploadZone
                        id="logo-upload-zone"
                        label="Company Logo"
                        hint="Your logo appears in the portal header and on customer communications."
                        currentUrl={settings.logoUrl || ''}
                        orgId={orgId}
                        storagePath="logo"
                        aspectLabel="Recommended: square or wide — transparent PNG works best"
                        onUpload={handleLogoUploaded}
                        onRemove={() => onChange('logoUrl', '')}
                    />

                    <ImageUploadZone
                        id="hero-upload-zone"
                        label="Hero Background Image"
                        hint="A high-quality background image for the login split-screen."
                        currentUrl={settings.heroImageUrl || ''}
                        orgId={orgId}
                        storagePath="hero"
                        aspectLabel="Recommended: landscape 1920×1080 or higher"
                        onUpload={handleHeroUploaded}
                        onRemove={() => onChange('heroImageUrl', '')}
                    />
                </div>

                {/* 2. Colors & Typography */}
                <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm space-y-6">
                    <div className="flex items-center gap-2 border-b pb-3">
                        <Palette className="w-4 h-4 text-gray-400" />
                        <h3 className="font-semibold text-gray-900">Colors & Typography</h3>
                    </div>

                    {/* Quick Theme Presets */}
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">Quick Themes</label>
                        <div className="grid grid-cols-5 gap-2">
                            {[
                                { name: 'Ocean', primary: '#0ea5e9', secondary: '#0c4a6e', accent: '#38bdf8' },
                                { name: 'Sunset', primary: '#f97316', secondary: '#7c2d12', accent: '#fbbf24' },
                                { name: 'Forest', primary: '#16a34a', secondary: '#14532d', accent: '#4ade80' },
                                { name: 'Royal', primary: '#7c3aed', secondary: '#4c1d95', accent: '#a78bfa' },
                                { name: 'Ember', primary: '#dc2626', secondary: '#450a0a', accent: '#f87171' },
                                { name: 'Slate', primary: '#475569', secondary: '#0f172a', accent: '#94a3b8' },
                                { name: 'Rose', primary: '#e11d48', secondary: '#4c0519', accent: '#fb7185' },
                                { name: 'Teal', primary: '#0d9488', secondary: '#134e4a', accent: '#2dd4bf' },
                                { name: 'Indigo', primary: '#6366f1', secondary: '#312e81', accent: '#818cf8' },
                                { name: 'Amber', primary: '#d97706', secondary: '#451a03', accent: '#fbbf24' }
                            ].map(theme => (
                                <button
                                    key={theme.name}
                                    onClick={() => {
                                        onChange('primaryColor', theme.primary);
                                        onChange('secondaryColor', theme.secondary);
                                        onChange('accentColor', theme.accent);
                                    }}
                                    className="group flex flex-col items-center gap-1 p-2 rounded-lg border border-gray-200 hover:border-indigo-400 hover:shadow-md transition-all"
                                    title={theme.name}
                                >
                                    <div className="flex gap-0.5">
                                        <div className="w-5 h-5 rounded-l-md" style={{ backgroundColor: theme.primary }} />
                                        <div className="w-5 h-5" style={{ backgroundColor: theme.secondary }} />
                                        <div className="w-5 h-5 rounded-r-md" style={{ backgroundColor: theme.accent }} />
                                    </div>
                                    <span className="text-[10px] text-gray-500 group-hover:text-indigo-600 font-medium">{theme.name}</span>
                                </button>
                            ))}
                        </div>
                    </div>
                    
                    {/* Color Pickers — Large */}
                    <div className="grid grid-cols-3 gap-4">
                        {[
                            { label: 'Primary Color', field: 'primaryColor', value: settings.primaryColor, hint: 'Header bar, buttons' },
                            { label: 'Secondary Color', field: 'secondaryColor', value: settings.secondaryColor || '#ffffff', hint: 'Backgrounds, accents' },
                            { label: 'Accent Color', field: 'accentColor', value: settings.accentColor || '#f59e0b', hint: 'Highlights, badges' }
                        ].map(color => (
                            <div key={color.field}>
                                <label className="block text-sm font-medium text-gray-700 mb-1.5">{color.label}</label>
                                <div className="relative group">
                                    <input
                                        type="color"
                                        value={color.value}
                                        onChange={(e) => onChange(color.field, e.target.value)}
                                        className="w-full h-16 border-2 border-gray-200 rounded-xl cursor-pointer appearance-none bg-transparent hover:border-indigo-400 transition-colors"
                                        style={{ padding: 0 }}
                                    />
                                </div>
                                <input
                                    type="text"
                                    value={color.value}
                                    onChange={(e) => onChange(color.field, e.target.value)}
                                    className="mt-1.5 w-full px-3 py-1.5 bg-gray-50 border border-gray-200 rounded-lg font-mono text-xs text-center focus:ring-2 focus:ring-indigo-500"
                                />
                                <p className="text-[10px] text-gray-400 mt-0.5 text-center">{color.hint}</p>
                            </div>
                        ))}
                    </div>

                    {/* Font Family */}
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1.5 flex items-center gap-1.5">
                            <Type className="w-4 h-4" /> Font Family
                        </label>
                        <select
                            value={settings.fontFamily || 'Inter'}
                            onChange={(e) => onChange('fontFamily', e.target.value)}
                            className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:bg-white"
                        >
                            {[
                                { id: 'Inter', name: 'Inter — Modern & Clean' },
                                { id: 'Roboto', name: 'Roboto — Familiar & Friendly' },
                                { id: 'Playfair Display', name: 'Playfair Display — Elegant Serif' },
                                { id: 'Outfit', name: 'Outfit — Geometric & Bold' },
                                { id: 'Poppins', name: 'Poppins — Rounded & Warm' },
                                { id: 'Montserrat', name: 'Montserrat — Strong & Professional' },
                                { id: 'Lato', name: 'Lato — Neutral & Universal' },
                                { id: 'Open Sans', name: 'Open Sans — Readable & Accessible' },
                                { id: 'Raleway', name: 'Raleway — Thin & Stylish' },
                                { id: 'DM Sans', name: 'DM Sans — Compact & Modern' }
                            ].map(f => (
                                <option key={f.id} value={f.id}>{f.name}</option>
                            ))}
                        </select>
                    </div>
                </div>

                {/* 2b. Button & Layout */}
                <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm space-y-5">
                    <div className="flex items-center gap-2 border-b pb-3">
                        <LayoutTemplate className="w-4 h-4 text-gray-400" />
                        <h3 className="font-semibold text-gray-900">Button & Layout</h3>
                    </div>

                    {/* Button Shape */}
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">Button Style</label>
                        <div className="grid grid-cols-3 gap-3">
                            {[
                                { id: 'rounded', label: 'Rounded', radius: '8px' },
                                { id: 'pill', label: 'Pill', radius: '999px' },
                                { id: 'square', label: 'Square', radius: '0px' }
                            ].map(style => (
                                <button
                                    key={style.id}
                                    onClick={() => onChange('buttonStyle', style.id)}
                                    className={`p-3 border-2 rounded-lg transition-all flex flex-col items-center gap-2
                                        ${settings.buttonStyle === style.id
                                            ? 'border-indigo-500 bg-indigo-50 ring-2 ring-indigo-200'
                                            : 'border-gray-200 hover:border-gray-300'
                                        }`}
                                >
                                    <div
                                        className="w-full py-2 text-white text-xs font-semibold text-center"
                                        style={{
                                            backgroundColor: settings.primaryColor,
                                            borderRadius: style.radius
                                        }}
                                    >
                                        Button
                                    </div>
                                    <span className="text-xs text-gray-600 font-medium">{style.label}</span>
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Button Text */}
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Button Text</label>
                        <input
                            type="text"
                            value={settings.buttonText || ''}
                            onChange={(e) => onChange('buttonText', e.target.value)}
                            placeholder="Send Magic Link"
                            className="w-full px-4 py-2 bg-gray-50 border border-gray-200 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:bg-white"
                        />
                        <p className="text-xs text-gray-400 mt-1">Text shown on the main sign-in button</p>
                    </div>

                    {/* Header Subtitle */}
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Header Subtitle</label>
                        <input
                            type="text"
                            value={settings.headerSubtitle || ''}
                            onChange={(e) => onChange('headerSubtitle', e.target.value)}
                            placeholder="Service History & Account"
                            className="w-full px-4 py-2 bg-gray-50 border border-gray-200 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:bg-white"
                        />
                        <p className="text-xs text-gray-400 mt-1">Shown below your company name in the header</p>
                    </div>

                    {/* Tagline */}
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Business Tagline</label>
                        <input
                            type="text"
                            value={settings.tagline || ''}
                            onChange={(e) => onChange('tagline', e.target.value)}
                            placeholder="Your trusted home service experts since 2010"
                            className="w-full px-4 py-2 bg-gray-50 border border-gray-200 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:bg-white"
                        />
                        <p className="text-xs text-gray-400 mt-1">Displayed above the login card as a subtitle</p>
                    </div>
                </div>

                {/* 3. Messaging & Social */}
                <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm space-y-5">
                    <h3 className="font-semibold text-gray-900 flex items-center gap-2 border-b pb-3">
                        <MessageSquare className="w-4 h-4 text-gray-400" />
                        Messaging & Social
                    </h3>
                    
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Welcome Message</label>
                        <textarea
                            value={settings.welcomeMessage || ''}
                            onChange={(e) => onChange('welcomeMessage', e.target.value)}
                            rows={3}
                            placeholder="Welcome to our customer portal!"
                            className="w-full px-4 py-2 bg-gray-50 border border-gray-200 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:bg-white resize-none"
                        />
                    </div>

                    <div className="space-y-3 pt-2">
                        <label className="block text-sm font-medium text-gray-700 flex items-center gap-1.5">
                            <LinkIcon className="w-4 h-4" /> Social Links
                        </label>
                        <div className="grid grid-cols-1 gap-3">
                            <div className="flex rounded-md shadow-sm">
                                <span className="inline-flex items-center px-3 rounded-l-md border border-r-0 border-gray-300 bg-gray-50 text-gray-500 sm:text-sm">
                                    <Globe className="w-4 h-4" />
                                </span>
                                <input
                                    type="text"
                                    value={settings.socialWebsite || ''}
                                    onChange={(e) => onChange('socialWebsite', e.target.value)}
                                    placeholder="https://yourwebsite.com"
                                    className="flex-1 min-w-0 block w-full px-3 py-2 rounded-none rounded-r-md border border-gray-300 focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                                />
                            </div>
                            <div className="flex rounded-md shadow-sm">
                                <span className="inline-flex items-center px-3 rounded-l-md border border-r-0 border-gray-300 bg-gray-50 text-gray-500 sm:text-sm">
                                    <Facebook className="w-4 h-4" />
                                </span>
                                <input
                                    type="text"
                                    value={settings.socialFacebook || ''}
                                    onChange={(e) => onChange('socialFacebook', e.target.value)}
                                    placeholder="https://facebook.com/yourpage"
                                    className="flex-1 min-w-0 block w-full px-3 py-2 rounded-none rounded-r-md border border-gray-300 focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                                />
                            </div>
                            <div className="flex rounded-md shadow-sm">
                                <span className="inline-flex items-center px-3 rounded-l-md border border-r-0 border-gray-300 bg-gray-50 text-gray-500 sm:text-sm">
                                    <Instagram className="w-4 h-4" />
                                </span>
                                <input
                                    type="text"
                                    value={settings.socialInstagram || ''}
                                    onChange={(e) => onChange('socialInstagram', e.target.value)}
                                    placeholder="https://instagram.com/yourpage"
                                    className="flex-1 min-w-0 block w-full px-3 py-2 rounded-none rounded-r-md border border-gray-300 focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                                />
                            </div>
                        </div>
                    </div>
                </div>

                {/* 4. Website Sections (Advanced) */}
                <SectionEditor
                    sections={settings.sections || []}
                    onChange={(newSections) => onChange('sections', newSections)}
                    orgId={orgId}
                    primaryColor={settings.primaryColor || '#6366f1'}
                    orgSlug={(settings.name || '').toLowerCase().trim().replace(/[^a-z0-9\s-]/g, '').replace(/\s+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '')}
                    websiteTheme={settings.websiteTheme || null}
                    onThemeChange={(theme) => onChange('websiteTheme', theme)}
                />
            </div>

            {/* Right Column: Live Preview */}
            <div className="flex-1 lg:max-w-[500px]">
                <div className="sticky top-6">
                    <div className="flex items-center justify-between mb-3">
                        <h3 className="font-semibold text-gray-900 border-b-2 border-indigo-500 pb-1 inline-block">Live Preview</h3>
                        <span className="text-xs bg-indigo-50 text-indigo-700 px-2.5 py-1 rounded-full font-medium flex items-center gap-1.5 animate-pulse">
                            <span className="w-1.5 h-1.5 bg-indigo-500 rounded-full"></span>
                            Real-time
                        </span>
                    </div>
                    
                    {/* The Device Frame */}
                    <div className="bg-gray-900 rounded-3xl p-3 shadow-2xl border-4 border-gray-800">
                        <div className="bg-white rounded-2xl overflow-hidden h-[700px] relative">
                            {/* We instantiate the actual Login component and pass it the mocked org to force branding render without backend call */}
                            <CustomerPortalLogin previewOverride={previewOrg} />
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};
