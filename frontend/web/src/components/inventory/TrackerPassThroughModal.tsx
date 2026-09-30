/**
 * TrackerPassThroughModal.tsx
 * 
 * Companion Login & Map Pass-Through Assistant:
 * - Allows dispatchers to select saved logins per tracker ecosystem (Samsung SmartThings, Apple Find My, etc.)
 * - 1-Click Copy for Username/Email and Password
 * - 2FA Notes and Guidance
 * - Automatic pre-fill clipboard and launch to official map portal
 * - Ability to add/edit saved logins directly on the fly
 */

import React, { useState, useEffect } from 'react';
import {
    X,
    ExternalLink,
    Key,
    Copy,
    Check,
    Eye,
    EyeOff,
    Plus,
    Tag,
    Shield,
    Sparkles,
    Smartphone,
    Globe,
    AlertCircle,
    Edit2,
    Trash2
} from 'lucide-react';
import toast from 'react-hot-toast';
import { TrackerAccountLogin, ToolItem } from '../../types';
import { TOP_TRACKER_CATALOG } from '../../utils/trackerCatalog';
import { doc, updateDoc, setDoc } from 'firebase/firestore';
import { db } from '../../firebase';
import { useAuth } from '../../auth/AuthProvider';

export interface TrackerPassThroughModalProps {
    isOpen: boolean;
    onClose: () => void;
    tool?: ToolItem | null;
    modelId?: string;
    trackerType?: string;
    trackerSerial?: string;
    savedLogins?: TrackerAccountLogin[];
    onSavedLoginsUpdated?: (logins: TrackerAccountLogin[]) => void;
}

export const TrackerPassThroughModal: React.FC<TrackerPassThroughModalProps> = ({
    isOpen,
    onClose,
    tool,
    modelId,
    trackerType,
    trackerSerial,
    savedLogins = [],
    onSavedLoginsUpdated
}) => {
    const { user, organization } = useAuth();
    const [copiedField, setCopiedField] = useState<string | null>(null);
    const [showPassword, setShowPassword] = useState(false);
    const [isAddingNew, setIsAddingNew] = useState(false);
    const [editingLoginId, setEditingLoginId] = useState<string | null>(null);

    // Form state for adding/editing a login
    const [formAccountName, setFormAccountName] = useState('');
    const [formModelId, setFormModelId] = useState('');
    const [formUsername, setFormUsername] = useState('');
    const [formPassword, setFormPassword] = useState('');
    const [formPortalUrl, setFormPortalUrl] = useState('');
    const [formNotes, setFormNotes] = useState('');
    const [saving, setSaving] = useState(false);

    // Determine target hardware info
    const effectiveModelId = tool?.trackerModelId || modelId || 'samsung_smarttag2';
    const effectiveType = tool?.trackerType || trackerType || 'android_find';
    const effectiveSerial = tool?.trackerSerial || tool?.serialNumber || trackerSerial || '';
    const catalogModel = TOP_TRACKER_CATALOG.find(m => m.id === effectiveModelId) ||
                         TOP_TRACKER_CATALOG.find(m => m.type === effectiveType);

    // Default portal URL based on model or tag type
    const getPortalUrlForModel = (modId: string, trkType?: string) => {
        const mod = TOP_TRACKER_CATALOG.find(m => m.id === modId);
        if (mod?.vendorRegistrationUrl) return mod.vendorRegistrationUrl;
        if (trkType === 'android_find' || mod?.brand === 'Samsung' || modId.includes('samsung')) return 'https://smartthingsfind.samsung.com/';
        if (trkType === 'airtag' || mod?.type === 'find_my' || modId.includes('apple')) return 'https://www.icloud.com/find';
        if (trkType === 'tile' || mod?.type === 'tile') return 'https://www.tile.com/';
        if (trkType === 'tool_brand' || modId.includes('milwaukee')) return 'https://onekey.milwaukeetool.com/';
        if (modId.includes('dewalt')) return 'https://toolconnect.dewalt.com/';
        if (modId.includes('samsara')) return 'https://cloud.samsara.com/';
        if (modId.includes('landairsea')) return 'https://silvercloud.landairsea.com/';
        return 'https://smartthingsfind.samsung.com/';
    };

    const defaultPortalUrl = tool?.trackerUrl || catalogModel?.vendorRegistrationUrl || getPortalUrlForModel(effectiveModelId, effectiveType);

    // Get relevant logins: matching specific modelId, matching brand/type, or 'all'
    const matchingLogins = savedLogins.filter(l => 
        l.trackerModelId === effectiveModelId ||
        l.trackerType === effectiveType ||
        l.trackerModelId === 'all' ||
        (catalogModel?.brand === 'Samsung' && (l.trackerModelId.includes('samsung') || l.trackerType === 'android_find')) ||
        (catalogModel?.type === 'find_my' && (l.trackerModelId.includes('apple') || l.trackerType === 'airtag'))
    );

    // Selected active login
    const [selectedLoginId, setSelectedLoginId] = useState<string>('');

    // Synchronize selected login when modal opens or target hardware changes
    useEffect(() => {
        if (isOpen) {
            const initialId = matchingLogins[0]?.id || (savedLogins[0]?.id || '');
            setSelectedLoginId(initialId);
            setIsAddingNew(false);
            setEditingLoginId(null);
            setFormAccountName('');
            setFormModelId('');
            setFormUsername('');
            setFormPassword('');
            setFormPortalUrl('');
            setFormNotes('');
        }
    }, [isOpen, effectiveModelId, effectiveType]);

    const activeLogin = savedLogins.find(l => l.id === selectedLoginId) || matchingLogins[0];

    const copyToClipboard = async (text: string, fieldName: string) => {
        try {
            await navigator.clipboard.writeText(text);
            setCopiedField(fieldName);
            toast.success(`Copied ${fieldName} to clipboard!`);
            setTimeout(() => setCopiedField(null), 2500);
        } catch {
            toast.error('Failed to copy to clipboard.');
        }
    };

    const handleLaunchPortal = async (inPopup = false) => {
        const portalUrl = activeLogin?.portalUrl || defaultPortalUrl;
        
        // Auto-copy username to clipboard for instant pasting on login page
        if (activeLogin?.username) {
            try {
                await navigator.clipboard.writeText(activeLogin.username);
                toast.success(`Copied "${activeLogin.username}" to clipboard! Opening portal...`, { duration: 4000 });
            } catch {
                // Ignore if browser clipboard fails in bg
            }
        }

        if (inPopup) {
            const width = 1100;
            const height = 750;
            const left = window.screen.width / 2 - width / 2;
            const top = window.screen.height / 2 - height / 2;
            const win = window.open(portalUrl, 'TrackPortalPopout', `width=${width},height=${height},top=${top},left=${left},resizable=yes,scrollbars=yes`);
            if (!win || win.closed || typeof win.closed === 'undefined') {
                window.open(portalUrl, '_blank', 'noopener,noreferrer');
            }
        } else {
            window.open(portalUrl, '_blank', 'noopener,noreferrer');
        }
    };

    const handleSaveNewLogin = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!user?.uid) return;
        const orgId = organization?.id || (user as any).org_id || user.uid;

        if (!formUsername.trim()) {
            toast.error('Please enter a username or email.');
            return;
        }

        const targetModelId = formModelId || effectiveModelId || 'samsung_smarttag2';
        const targetModel = TOP_TRACKER_CATALOG.find(m => m.id === targetModelId);
        const targetType = targetModel?.type || effectiveType || 'android_find';

        setSaving(true);
        try {
            const newLoginItem: TrackerAccountLogin = {
                id: editingLoginId || `login_${Date.now()}`,
                trackerModelId: String(targetModelId),
                trackerType: (targetType as any) || 'android_find',
                accountName: String(formAccountName.trim() || `${targetModel?.brand || catalogModel?.brand || 'Fleet'} Account`),
                username: String(formUsername.trim()),
                password: String(formPassword.trim() || ''),
                portalUrl: String(formPortalUrl.trim() || getPortalUrlForModel(targetModelId, targetType) || 'https://smartthingsfind.samsung.com/'),
                notes: String(formNotes.trim() || ''),
                updatedAt: new Date().toISOString()
            };

            const rawList = editingLoginId
                ? savedLogins.map(l => l.id === editingLoginId ? newLoginItem : l)
                : [...savedLogins, newLoginItem];

            // Deep-sanitize every item so NO field is undefined (Firestore rejects any undefined field)
            const sanitizedList: TrackerAccountLogin[] = rawList.map(item => ({
                id: String(item.id || `login_${Date.now()}`),
                trackerModelId: String(item.trackerModelId || targetModelId),
                trackerType: (item.trackerType || targetType || 'android_find') as any,
                accountName: String(item.accountName || 'Fleet Account'),
                username: String(item.username || ''),
                password: String(item.password || ''),
                portalUrl: String(item.portalUrl || getPortalUrlForModel(item.trackerModelId, item.trackerType) || 'https://smartthingsfind.samsung.com/'),
                notes: String(item.notes || ''),
                updatedAt: String(item.updatedAt || new Date().toISOString())
            }));

            // Save to Firestore organization doc
            await setDoc(doc(db, 'organizations', orgId), {
                settings: { trackerLogins: sanitizedList },
                trackerSettings: { trackerLogins: sanitizedList }
            }, { merge: true });

            if (onSavedLoginsUpdated) {
                onSavedLoginsUpdated(sanitizedList);
            }

            setSelectedLoginId(newLoginItem.id);
            setIsAddingNew(false);
            setEditingLoginId(null);
            setFormAccountName('');
            setFormModelId('');
            setFormUsername('');
            setFormPassword('');
            setFormPortalUrl('');
            setFormNotes('');
            toast.success(editingLoginId ? 'Login profile updated!' : 'Saved new account login profile!');
        } catch (error) {
            console.error('Error saving tracker login:', error);
            toast.error('Failed to save login profile.');
        } finally {
            setSaving(false);
        }
    };

    const handleDeleteLogin = async (id: string) => {
        if (!confirm('Are you sure you want to delete this saved login profile?')) return;
        if (!user?.uid) return;
        const orgId = organization?.id || (user as any).org_id || user.uid;

        try {
            const raw = savedLogins.filter(l => l.id !== id);
            const sanitizedList: TrackerAccountLogin[] = raw.map(item => ({
                id: String(item.id || `login_${Date.now()}`),
                trackerModelId: String(item.trackerModelId || ''),
                trackerType: (item.trackerType || 'android_find') as any,
                accountName: String(item.accountName || 'Fleet Account'),
                username: String(item.username || ''),
                password: String(item.password || ''),
                portalUrl: String(item.portalUrl || ''),
                notes: String(item.notes || ''),
                updatedAt: String(item.updatedAt || new Date().toISOString())
            }));

            await setDoc(doc(db, 'organizations', orgId), {
                settings: { trackerLogins: sanitizedList },
                trackerSettings: { trackerLogins: sanitizedList }
            }, { merge: true });

            if (onSavedLoginsUpdated) {
                onSavedLoginsUpdated(sanitizedList);
            }
            if (selectedLoginId === id) {
                setSelectedLoginId(sanitizedList[0]?.id || '');
            }
            toast.success('Login profile removed.');
        } catch (error) {
            console.error('Error deleting login:', error);
            toast.error('Failed to delete login.');
        }
    };

    const handleStartEdit = (login: TrackerAccountLogin) => {
        setEditingLoginId(login.id);
        setFormAccountName(login.accountName);
        setFormModelId(login.trackerModelId);
        setFormUsername(login.username);
        setFormPassword(login.password || '');
        setFormPortalUrl(login.portalUrl || getPortalUrlForModel(login.trackerModelId, login.trackerType));
        setFormNotes(login.notes || '');
        setIsAddingNew(true);
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl max-w-xl w-full shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[90vh]">
                {/* Header */}
                <div className="bg-gradient-to-r from-slate-900 via-blue-950 to-slate-900 text-white p-5 flex items-center justify-between shrink-0">
                    <div className="flex items-center gap-2.5">
                        <div className="p-2 bg-blue-600/80 rounded-xl text-white shadow-xs">
                            <Key className="w-5 h-5" />
                        </div>
                        <div>
                            <h3 className="font-extrabold text-base">Tracker Map Pass-Through Assistant</h3>
                            <p className="text-xs text-blue-200">
                                {catalogModel?.name || 'Hardware Tracker'} • {catalogModel?.brand || 'Live Network'}
                            </p>
                        </div>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-white/10 transition-colors"
                    >
                        <X className="w-5 h-5" />
                    </button>
                </div>

                <div className="p-5 overflow-y-auto space-y-4">
                    {/* Tool / Asset Context Header */}
                    {tool && (
                        <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 flex items-center justify-between text-xs">
                            <div className="space-y-0.5 min-w-0 pr-2">
                                <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">Target Equipment</span>
                                <h4 className="font-extrabold text-slate-900 truncate text-sm">{tool.name}</h4>
                                {tool.assignedTechName && (
                                    <p className="text-slate-600 text-[11px]">Assigned to: <strong className="text-blue-700">{tool.assignedTechName}</strong> ({tool.location || 'Warehouse'})</p>
                                )}
                            </div>
                            {effectiveSerial && (
                                <div className="text-right shrink-0">
                                    <span className="text-[10px] font-bold text-slate-500 uppercase block">Tag S/N</span>
                                    <span className="font-mono font-bold text-blue-900 bg-white px-2 py-0.5 rounded border border-blue-200 inline-block mt-0.5">
                                        {effectiveSerial}
                                    </span>
                                </div>
                            )}
                        </div>
                    )}

                    {/* Saved Accounts Switcher or Add Mode */}
                    {!isAddingNew ? (
                        <div className="space-y-4">
                            {matchingLogins.length > 0 ? (
                                <div className="space-y-3">
                                    <div className="flex items-center justify-between">
                                        <label className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
                                            <Shield className="w-3.5 h-3.5 text-blue-600" />
                                            Saved Account Profile
                                        </label>
                                        <button
                                            type="button"
                                            onClick={() => {
                                                setIsAddingNew(true);
                                                setEditingLoginId(null);
                                                setFormModelId(effectiveModelId);
                                                setFormAccountName(`Company ${catalogModel?.brand || 'Fleet'} Account`);
                                                setFormUsername('');
                                                setFormPassword('');
                                                setFormPortalUrl(defaultPortalUrl);
                                                setFormNotes('');
                                            }}
                                            className="text-xs font-bold text-blue-600 hover:text-blue-800 flex items-center gap-1"
                                        >
                                            <Plus className="w-3 h-3" /> Add Another Login
                                        </button>
                                    </div>

                                    {/* Account Selector Tabs / Dropdown if multiple */}
                                    {matchingLogins.length > 1 && (
                                        <div className="flex flex-wrap gap-1.5 p-1 bg-slate-100 rounded-xl">
                                            {matchingLogins.map(l => (
                                                <button
                                                    key={l.id}
                                                    type="button"
                                                    onClick={() => setSelectedLoginId(l.id)}
                                                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                                                        activeLogin?.id === l.id
                                                            ? 'bg-white text-blue-900 shadow-xs'
                                                            : 'text-slate-600 hover:text-slate-900'
                                                    }`}
                                                >
                                                    {l.accountName}
                                                </button>
                                            ))}
                                        </div>
                                    )}

                                    {/* Active Login Details Box */}
                                    {activeLogin && (
                                        <div className="bg-gradient-to-br from-blue-50/70 to-indigo-50/50 p-4 rounded-xl border border-blue-200/80 space-y-3">
                                            <div className="flex items-center justify-between border-b border-blue-200/50 pb-2">
                                                <div className="font-extrabold text-slate-900 text-sm flex items-center gap-1.5">
                                                    <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                                                    <span>{activeLogin.accountName}</span>
                                                </div>
                                                <div className="flex items-center gap-1">
                                                    <button
                                                        type="button"
                                                        onClick={() => handleStartEdit(activeLogin)}
                                                        className="p-1 text-slate-500 hover:text-blue-600 hover:bg-white rounded transition-colors"
                                                        title="Edit this saved login"
                                                    >
                                                        <Edit2 className="w-3.5 h-3.5" />
                                                    </button>
                                                    <button
                                                        type="button"
                                                        onClick={() => handleDeleteLogin(activeLogin.id)}
                                                        className="p-1 text-slate-500 hover:text-red-600 hover:bg-white rounded transition-colors"
                                                        title="Delete login"
                                                    >
                                                        <Trash2 className="w-3.5 h-3.5" />
                                                    </button>
                                                </div>
                                            </div>

                                            {/* Username / Email Row */}
                                            <div className="space-y-1">
                                                <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">Username / Email</span>
                                                <div className="flex items-center justify-between bg-white px-3 py-2 rounded-lg border border-blue-100 text-xs font-mono">
                                                    <span className="font-bold text-slate-900 select-all">{activeLogin.username}</span>
                                                    <button
                                                        type="button"
                                                        onClick={() => copyToClipboard(activeLogin.username, 'Username')}
                                                        className="inline-flex items-center gap-1 text-[11px] font-bold text-blue-700 hover:text-blue-900 bg-blue-50 px-2 py-0.5 rounded transition-colors"
                                                    >
                                                        {copiedField === 'Username' ? <Check className="w-3 h-3 text-emerald-600" /> : <Copy className="w-3 h-3" />}
                                                        <span>{copiedField === 'Username' ? 'Copied' : 'Copy'}</span>
                                                    </button>
                                                </div>
                                            </div>

                                            {/* Password Row (if saved) */}
                                            {activeLogin.password && (
                                                <div className="space-y-1">
                                                    <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">Password</span>
                                                    <div className="flex items-center justify-between bg-white px-3 py-2 rounded-lg border border-blue-100 text-xs font-mono">
                                                        <span className="font-bold text-slate-900 select-all">
                                                            {showPassword ? activeLogin.password : '••••••••••••••••'}
                                                        </span>
                                                        <div className="flex items-center gap-1">
                                                            <button
                                                                type="button"
                                                                onClick={() => setShowPassword(!showPassword)}
                                                                className="p-1 text-slate-400 hover:text-slate-600 rounded transition-colors"
                                                                title={showPassword ? 'Hide password' : 'Show password'}
                                                            >
                                                                {showPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                                                            </button>
                                                            <button
                                                                type="button"
                                                                onClick={() => copyToClipboard(activeLogin.password!, 'Password')}
                                                                className="inline-flex items-center gap-1 text-[11px] font-bold text-blue-700 hover:text-blue-900 bg-blue-50 px-2 py-0.5 rounded transition-colors"
                                                            >
                                                                {copiedField === 'Password' ? <Check className="w-3 h-3 text-emerald-600" /> : <Copy className="w-3 h-3" />}
                                                                <span>{copiedField === 'Password' ? 'Copied' : 'Copy'}</span>
                                                            </button>
                                                        </div>
                                                    </div>
                                                </div>
                                            )}

                                            {/* 2FA / Instructions Notes */}
                                            {activeLogin.notes && (
                                                <div className="p-2.5 bg-amber-50 rounded-lg border border-amber-200 text-xs text-amber-900">
                                                    <span className="font-bold block text-[10px] uppercase text-amber-700 mb-0.5">2FA / Access Instructions</span>
                                                    <p className="font-medium text-[11px]">{activeLogin.notes}</p>
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </div>
                            ) : (
                                /* No Logins Saved State */
                                <div className="p-5 bg-blue-50/60 rounded-xl border border-blue-200 text-center space-y-3">
                                    <div className="w-10 h-10 bg-blue-100 text-blue-700 rounded-full flex items-center justify-center mx-auto">
                                        <Key className="w-5 h-5" />
                                    </div>
                                    <div className="space-y-1">
                                        <h4 className="font-extrabold text-slate-900 text-sm">No Saved Logins for {catalogModel?.brand || 'this tag type'}</h4>
                                        <p className="text-xs text-slate-600 max-w-sm mx-auto leading-relaxed">
                                            Save your company's {catalogModel?.brand || 'tracker'} account credentials once so dispatchers can auto-copy and launch live tracking with one click.
                                        </p>
                                    </div>
                                    <button
                                        type="button"
                                        onClick={() => {
                                            setIsAddingNew(true);
                                            setEditingLoginId(null);
                                            setFormModelId(effectiveModelId);
                                            setFormAccountName(`Company ${catalogModel?.brand || 'Fleet'} Account`);
                                            setFormPortalUrl(defaultPortalUrl);
                                        }}
                                        className="inline-flex items-center gap-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold shadow-sm transition-all"
                                    >
                                        <Plus className="w-3.5 h-3.5" /> Save First Login Profile
                                    </button>
                                </div>
                            )}

                            {/* Samsung / Android Find Specific Portal Tips */}
                            {(catalogModel?.brand === 'Samsung' || effectiveModelId.includes('samsung') || effectiveType === 'android_find') && (
                                <div className="p-3 bg-blue-50/70 border border-blue-200/80 rounded-xl text-xs space-y-1.5 text-slate-700">
                                    <div className="font-bold text-blue-900 flex items-center justify-between">
                                        <span className="flex items-center gap-1.5">
                                            <span>🪐</span> Samsung SmartThings Find Sign-In Tips
                                        </span>
                                        <span className="text-[10px] text-blue-600 font-semibold bg-blue-100/80 px-2 py-0.5 rounded-full">Galaxy Network</span>
                                    </div>
                                    <ul className="list-disc list-inside space-y-1 text-[11px] text-slate-600 leading-relaxed">
                                        <li><strong>Google Account Sign-In:</strong> If your Samsung account uses your Google login, click <em>"Continue with Google"</em> on Samsung's portal.</li>
                                        <li><strong>Two-Step Verification (2FA):</strong> Samsung will prompt your registered Galaxy phone or send an SMS code to your phone.</li>
                                        <li><strong>Tag Visibility:</strong> Verify that <em>"Allow this phone to be found"</em> and <em>"Offline finding"</em> are turned ON in the SmartThings app on your phone.</li>
                                    </ul>
                                    <div className="pt-1.5 border-t border-blue-200/50 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px]">
                                        <a href="https://smartthingsfind.samsung.com/" target="_blank" rel="noopener noreferrer" className="text-blue-700 hover:text-blue-900 font-bold inline-flex items-center gap-1">
                                            Open SmartThings Find ↗
                                        </a>
                                        <span className="text-slate-300">•</span>
                                        <a href="https://account.samsung.com/" target="_blank" rel="noopener noreferrer" className="text-slate-600 hover:text-slate-900 font-medium">
                                            Samsung Account Portal ↗
                                        </a>
                                        <span className="text-slate-300">•</span>
                                        <a href="https://my.smartthings.com/" target="_blank" rel="noopener noreferrer" className="text-slate-600 hover:text-slate-900 font-medium">
                                            SmartThings Web App ↗
                                        </a>
                                    </div>
                                </div>
                            )}

                            {/* Launch Action Buttons */}
                            <div className="pt-2 border-t border-slate-100 flex flex-col sm:flex-row gap-2">
                                <button
                                    type="button"
                                    onClick={() => handleLaunchPortal(false)}
                                    className="flex-1 py-2.5 px-4 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold text-xs shadow-md transition-all flex items-center justify-center gap-2"
                                >
                                    <ExternalLink className="w-4 h-4" />
                                    <span>Launch Live Map & Auto-Copy Login</span>
                                </button>
                                <button
                                    type="button"
                                    onClick={() => handleLaunchPortal(true)}
                                    className="py-2.5 px-4 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-xl font-bold text-xs transition-all flex items-center justify-center gap-1.5"
                                    title="Open portal in floating side-by-side companion window"
                                >
                                    <span>Pop-out Window</span>
                                </button>
                            </div>
                        </div>
                    ) : (
                        /* Add/Edit Login Form Drawer */
                        <form onSubmit={handleSaveNewLogin} className="space-y-3.5 bg-slate-50 p-4 rounded-xl border border-slate-200">
                            <div className="flex items-center justify-between border-b pb-2">
                                <h4 className="font-extrabold text-slate-900 text-xs uppercase tracking-wider flex items-center gap-1.5">
                                    <Key className="w-3.5 h-3.5 text-blue-600" />
                                    {editingLoginId ? 'Edit Login Profile' : `Add New ${catalogModel?.brand || ''} Account Login`}
                                </h4>
                                <button
                                    type="button"
                                    onClick={() => {
                                        setIsAddingNew(false);
                                        setEditingLoginId(null);
                                    }}
                                    className="text-xs text-slate-500 hover:text-slate-800 font-semibold"
                                >
                                    Cancel
                                </button>
                            </div>

                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                                <div>
                                    <label className="block text-xs font-bold text-slate-700 mb-1">Tracker Ecosystem / Brand *</label>
                                    <select
                                        value={formModelId || effectiveModelId}
                                        onChange={(e) => {
                                            const newModelId = e.target.value;
                                            setFormModelId(newModelId);
                                            const mod = TOP_TRACKER_CATALOG.find(m => m.id === newModelId);
                                            const newUrl = getPortalUrlForModel(newModelId, mod?.type);
                                            setFormPortalUrl(newUrl);
                                            if (!formAccountName || formAccountName.includes('Account')) {
                                                setFormAccountName(`Company ${mod?.brand || 'Fleet'} Account`);
                                            }
                                        }}
                                        className="w-full px-3 py-2 border rounded-lg text-xs font-bold text-slate-800 bg-white"
                                    >
                                        <option value="samsung_smarttag2">Samsung SmartTag / SmartThings Find</option>
                                        <option value="apple_airtag">Apple AirTag / iCloud Find My</option>
                                        <option value="tile_pro">Tile Bluetooth Tracker</option>
                                        <option value="milwaukee_tick">Milwaukee ONE-KEY / TICK</option>
                                        <option value="dewalt_tool_connect">DeWalt Tool Connect</option>
                                        <option value="samsara_ag52">Samsara Asset Gateway 4G GPS</option>
                                        <option value="landairsea_54">LandAirSea 54 GPS</option>
                                        <option value="minew_ble_tag">Minew BLE Industrial Beacon</option>
                                        <option value="all">Universal / All Ecosystems</option>
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-slate-700 mb-1">Account Label / Profile Name *</label>
                                    <input
                                        type="text"
                                        required
                                        value={formAccountName}
                                        onChange={(e) => setFormAccountName(e.target.value)}
                                        placeholder="e.g. Primary Company Samsung Account or Van 1 Fleet ID"
                                        className="w-full px-3 py-2 border rounded-lg text-xs font-medium focus:ring-2 focus:ring-blue-500 bg-white"
                                    />
                                </div>
                            </div>

                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                                <div>
                                    <label className="block text-xs font-bold text-slate-700 mb-1">Username / Email *</label>
                                    <input
                                        type="text"
                                        required
                                        value={formUsername}
                                        onChange={(e) => setFormUsername(e.target.value)}
                                        placeholder="e.g. fleet@hitopplumbers.com"
                                        className="w-full px-3 py-2 border rounded-lg text-xs font-mono focus:ring-2 focus:ring-blue-500 bg-white"
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-slate-700 mb-1">Password (Optional)</label>
                                    <input
                                        type="password"
                                        value={formPassword}
                                        onChange={(e) => setFormPassword(e.target.value)}
                                        placeholder="Saved for 1-click copy"
                                        className="w-full px-3 py-2 border rounded-lg text-xs font-mono focus:ring-2 focus:ring-blue-500 bg-white"
                                    />
                                </div>
                            </div>

                            <div>
                                <label className="block text-xs font-bold text-slate-700 mb-1">Portal / Live Map URL</label>
                                <input
                                    type="url"
                                    required
                                    value={formPortalUrl}
                                    onChange={(e) => setFormPortalUrl(e.target.value)}
                                    placeholder={defaultPortalUrl}
                                    className="w-full px-3 py-2 border rounded-lg text-xs font-mono focus:ring-2 focus:ring-blue-500 bg-white"
                                />
                            </div>

                            <div>
                                <label className="block text-xs font-bold text-slate-700 mb-1">2FA / Verification Notes (Optional)</label>
                                <input
                                    type="text"
                                    value={formNotes}
                                    onChange={(e) => setFormNotes(e.target.value)}
                                    placeholder="e.g. SMS verification goes to Shop phone (808) 555-0101"
                                    className="w-full px-3 py-2 border rounded-lg text-xs focus:ring-2 focus:ring-blue-500 bg-white"
                                />
                            </div>

                            {/* Samsung Tip in Form */}
                            {(formModelId === 'samsung_smarttag2' || (!formModelId && (effectiveModelId.includes('samsung') || catalogModel?.brand === 'Samsung'))) && (
                                <div className="p-2.5 bg-blue-50 border border-blue-200 rounded-lg text-[11px] text-blue-900 space-y-1">
                                    <span className="font-bold flex items-center gap-1">
                                        <span>💡</span> Tip for Samsung Accounts:
                                    </span>
                                    <p className="text-slate-600 leading-normal">
                                        If your Samsung account was created using Google, you can enter your Google email here and leave the password optional. On Samsung's portal, simply click <em>"Continue with Google"</em>.
                                    </p>
                                </div>
                            )}

                            <div className="flex justify-end gap-2 pt-2 border-t">
                                <button
                                    type="button"
                                    onClick={() => {
                                        setIsAddingNew(false);
                                        setEditingLoginId(null);
                                    }}
                                    className="px-3 py-1.5 text-slate-600 hover:bg-slate-200 rounded-lg text-xs font-semibold"
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    disabled={saving}
                                    className="px-4 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-bold shadow-xs disabled:opacity-50"
                                >
                                    {saving ? 'Saving...' : editingLoginId ? 'Update Login' : 'Save Account Login'}
                                </button>
                            </div>
                        </form>
                    )}
                </div>
            </div>
        </div>
    );
};
