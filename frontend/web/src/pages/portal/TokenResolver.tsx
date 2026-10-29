import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { initializeApp, getApps } from 'firebase/app';
import { getFunctions, httpsCallable } from 'firebase/functions';
import {
    Loader2, AlertTriangle, Clock, CheckCircle2, FileText, Wrench,
    MapPin, Phone, Mail, Calendar, DollarSign, ChevronRight,
    ArrowLeft, RefreshCw, ShieldCheck, XCircle
} from 'lucide-react';

const functions = getFunctions();

const PROD_FIREBASE_CONFIG = {
    apiKey: "AIzaSyBbbbhn_DQd9LHO3Ii88-m3utdi4L9WTaM",
    authDomain: "dispatch-box.com",
    projectId: "maintenancemanager-c5533",
    storageBucket: "maintenancemanager-c5533.firebasestorage.app",
    messagingSenderId: "983488582142",
    appId: "1:983488582142:web:908e1b3029946e081230af"
};

const SANDBOX_FIREBASE_CONFIG = {
    apiKey: "AIzaSyDIiobiWUGYNF49nB_c3FJSl8vO3ksWcuI",
    authDomain: "dispatch-box-sb.firebaseapp.com",
    projectId: "dispatch-box-sb",
    storageBucket: "dispatch-box-sb.firebasestorage.app",
    messagingSenderId: "13244044438",
    appId: "1:13244044438:web:0e47dd93ac94f3b7f35eb7"
};

type ResourceType = 'ticket' | 'quote' | 'job' | 'invoice' | 'appointment';

interface TokenData {
    token: string;
    resourceType: ResourceType;
    resourceId: string;
    permissions: string[];
    resource: any;
    org: {
        name: string;
        companyName: string;
        themeColor: string;
        logoUrl: string;
        phone: string;
        slug: string;
    };
}

type ViewState = 'loading' | 'verify' | 'resolved' | 'error' | 'expired';

export const TokenResolver: React.FC = () => {
    const { token } = useParams<{ token: string }>();
    const navigate = useNavigate();
    const [state, setState] = useState<ViewState>('loading');
    const [tokenData, setTokenData] = useState<TokenData | null>(null);
    const [errorMessage, setErrorMessage] = useState('');

    useEffect(() => {
        if (!token) {
            setErrorMessage('Invalid link.');
            setState('error');
            return;
        }
        resolveToken(token);
    }, [token]);

    const resolveToken = async (t: string) => {
        setState('loading');
        try {
            const resolve = httpsCallable(functions, 'resolveAccessToken');
            const result = await resolve({ token: t.toUpperCase() });
            const data = result.data as TokenData;
            setTokenData(data);

            // If it's a quote, redirect to the existing QuoteView with mode=customer so full customer testing works
            if (data.resourceType === 'quote') {
                navigate(`/quote/${data.resourceId}?mode=customer`, { replace: true });
                return;
            }

            setState('resolved');
        } catch (err: any) {
            const code = err?.code || '';
            const message = err?.message || 'Unable to load this link.';

            // Cross-Environment Resolution Fallback:
            // Check if this token was generated in the alternate environment (Sandbox <-> Production)
            const isCurrentlySandbox = window.location.hostname.includes('dispatch-box-sb') || 
                                       (window.location.hostname.includes('localhost') && import.meta.env.VITE_FIREBASE_PROJECT_ID === 'dispatch-box-sb');

            try {
                // If on production / custom domain and token not found, check Sandbox:
                if (!isCurrentlySandbox) {
                    const sbApp = getApps().find(a => a.name === 'sandboxFallback') || initializeApp(SANDBOX_FIREBASE_CONFIG, 'sandboxFallback');
                    const sbFunctions = getFunctions(sbApp);
                    const sbResolve = httpsCallable(sbFunctions, 'resolveAccessToken');
                    const sbResult = await sbResolve({ token: t.toUpperCase() });
                    const sbData = sbResult.data as TokenData;
                    if (sbData?.resourceId) {
                        console.log('[TokenResolver] Token resolved via Sandbox environment! Redirecting...');
                        if (sbData.resourceType === 'quote') {
                            window.location.href = `https://dispatch-box-sb.web.app/quote/${sbData.resourceId}?mode=customer`;
                            return;
                        }
                        window.location.href = `https://dispatch-box-sb.web.app/t/${t.toUpperCase()}`;
                        return;
                    }
                } else {
                    // If on Sandbox and token not found, check Production:
                    const prodApp = getApps().find(a => a.name === 'prodFallback') || initializeApp(PROD_FIREBASE_CONFIG, 'prodFallback');
                    const prodFunctions = getFunctions(prodApp);
                    const prodResolve = httpsCallable(prodFunctions, 'resolveAccessToken');
                    const prodResult = await prodResolve({ token: t.toUpperCase() });
                    const prodData = prodResult.data as TokenData;
                    if (prodData?.resourceId) {
                        console.log('[TokenResolver] Token resolved via Production environment! Redirecting...');
                        if (prodData.resourceType === 'quote') {
                            window.location.href = `https://dispatch-box.com/quote/${prodData.resourceId}?mode=customer`;
                            return;
                        }
                        window.location.href = `https://dispatch-box.com/t/${t.toUpperCase()}`;
                        return;
                    }
                }
            } catch (fallbackErr) {
                console.warn('[TokenResolver] Alternate environment check failed:', fallbackErr);
            }

            if (code.includes('deadline-exceeded') || (message.includes('expired') && !message.includes('invalid or has expired'))) {
                setState('expired');
            } else {
                setErrorMessage(message);
                setState('error');
            }
        }
    };

    const themeColor = tokenData?.org?.themeColor || '#3B82F6';
    const companyName = tokenData?.org?.companyName || 'Service Provider';
    const logoUrl = tokenData?.org?.logoUrl || '';

    // ── LOADING ──
    if (state === 'loading') {
        return (
            <Shell themeColor={themeColor}>
                <div style={{ textAlign: 'center', padding: '80px 20px' }}>
                    <Loader2 size={48} style={{ animation: 'spin 1s linear infinite', color: themeColor, margin: '0 auto 20px' }} />
                    <p style={{ color: '#666', fontSize: '16px' }}>Loading your information...</p>
                    <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
                </div>
            </Shell>
        );
    }

    // ── EXPIRED ──
    if (state === 'expired') {
        return (
            <Shell themeColor={themeColor} companyName={companyName} logoUrl={logoUrl}>
                <div style={{ textAlign: 'center', padding: '60px 20px' }}>
                    <Clock size={64} style={{ color: '#F59E0B', margin: '0 auto 20px' }} />
                    <h2 style={{ fontSize: '24px', color: '#1a1a2e', margin: '0 0 12px' }}>Link Expired</h2>
                    <p style={{ color: '#666', fontSize: '15px', maxWidth: '400px', margin: '0 auto', lineHeight: '1.6' }}>
                        This link has expired. Please contact us for an updated link.
                    </p>
                    {tokenData?.org?.phone && (
                        <a href={`tel:${tokenData.org.phone}`} style={{
                            display: 'inline-flex', alignItems: 'center', gap: '8px',
                            marginTop: '24px', padding: '12px 24px', borderRadius: '10px',
                            background: themeColor, color: 'white', fontWeight: '600',
                            textDecoration: 'none', fontSize: '15px'
                        }}>
                            <Phone size={18} /> Call Us
                        </a>
                    )}
                </div>
            </Shell>
        );
    }

    // ── ERROR ──
    if (state === 'error') {
        return (
            <Shell themeColor={themeColor} companyName={companyName} logoUrl={logoUrl}>
                <div style={{ textAlign: 'center', padding: '60px 20px' }}>
                    <AlertTriangle size={64} style={{ color: '#EF4444', margin: '0 auto 20px' }} />
                    <h2 style={{ fontSize: '24px', color: '#1a1a2e', margin: '0 0 12px' }}>Something Went Wrong</h2>
                    <p style={{ color: '#666', fontSize: '15px', maxWidth: '400px', margin: '0 auto', lineHeight: '1.6' }}>
                        {errorMessage}
                    </p>
                </div>
            </Shell>
        );
    }

    if (!tokenData) return null;

    // ── RESOLVED: Render resource-specific view ──
    return (
        <Shell themeColor={themeColor} companyName={companyName} logoUrl={logoUrl}>
            <div style={{ padding: '32px' }}>
                {tokenData.resourceType === 'ticket' && <TicketView data={tokenData} themeColor={themeColor} />}
                {tokenData.resourceType === 'job' && <JobView data={tokenData} themeColor={themeColor} onRefresh={() => resolveToken(tokenData.token)} />}
                {tokenData.resourceType === 'appointment' && <AppointmentView data={tokenData} themeColor={themeColor} navigate={navigate} onRefresh={() => resolveToken(tokenData.token)} />}
                {tokenData.resourceType === 'invoice' && <InvoiceView data={tokenData} themeColor={themeColor} />}
            </div>
        </Shell>
    );
};

// ═══════════════════════════════════════════════════════════════
//  RESOURCE VIEWS
// ═══════════════════════════════════════════════════════════════

const TicketView: React.FC<{ data: TokenData; themeColor: string }> = ({ data, themeColor }) => {
    const r = data.resource;
    const statusColors: Record<string, { bg: string; text: string; label: string }> = {
        PENDING: { bg: '#FEF3C7', text: '#92400E', label: '⏳ Pending Review' },
        IN_PROGRESS: { bg: '#DBEAFE', text: '#1E40AF', label: '🔧 In Progress' },
        COMPLETED: { bg: '#D1FAE5', text: '#065F46', label: '✅ Completed' },
        CANCELLED: { bg: '#FEE2E2', text: '#991B1B', label: '❌ Cancelled' },
    };
    const status = statusColors[r.status] || statusColors.PENDING;

    // Parse description if it's from the portal
    let requestType = '';
    let parsedUrgency = '';
    let cleanDesc = r.description || '';

    const description = r.description || '';
    if (description.startsWith('[Portal') || description.startsWith('[Public')) {
        const lines = description.split('\n');
        if (lines[0]?.startsWith('[')) {
            requestType = lines[0].replace(/[\[\]]/g, '').trim();
        }
        if (lines[1]?.toLowerCase().startsWith('urgency:')) {
            parsedUrgency = lines[1].replace(/urgency:/i, '').trim();
        }
        const blankIdx = lines.findIndex((line: string) => line.trim() === '');
        if (blankIdx !== -1) {
            cleanDesc = lines.slice(blankIdx + 1).join('\n').trim() || description;
        }
    }

    const urgency = parsedUrgency || r.metadata?.urgency || r.urgency;

    return (
        <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '24px' }}>
                <div style={{ width: '48px', height: '48px', borderRadius: '12px', background: `${themeColor}15`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <FileText size={24} style={{ color: themeColor }} />
                </div>
                <div>
                    <h2 style={{ fontSize: '20px', fontWeight: '700', color: '#1a1a2e', margin: 0 }}>Service Request</h2>
                    <p style={{ fontSize: '13px', color: '#888', margin: '2px 0 0' }}>Reference: {r.id.slice(0, 8).toUpperCase()}</p>
                </div>
            </div>

            {/* Status badge */}
            <div style={{ padding: '10px 16px', borderRadius: '10px', background: status.bg, color: status.text, fontWeight: '600', fontSize: '14px', marginBottom: '20px', display: 'inline-block' }}>
                {status.label}
            </div>

            {/* Details */}
            <div style={{ background: '#f8f9fc', borderRadius: '12px', padding: '20px', marginBottom: '20px' }}>
                {requestType && <DetailRow icon={<FileText size={16} />} label="Request Type" value={requestType} themeColor={themeColor} />}
                {urgency && <DetailRow icon={<Clock size={16} />} label="Priority" value={urgency.charAt(0).toUpperCase() + urgency.slice(1).toLowerCase()} themeColor={themeColor} />}
                <DetailRow icon={<FileText size={16} />} label="Description" value={cleanDesc} themeColor={themeColor} />
                {r.address && <DetailRow icon={<MapPin size={16} />} label="Address" value={r.address} themeColor={themeColor} />}
                {r.createdAt && <DetailRow icon={<Calendar size={16} />} label="Submitted" value={formatTimestamp(r.createdAt)} themeColor={themeColor} />}
            </div>


            {/* Linked resources */}
            {r.autoQuoteId && (
                <a href={`/quote/${r.autoQuoteId}`} style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    padding: '14px 18px', borderRadius: '10px', border: '2px solid #e5e7eb',
                    textDecoration: 'none', color: '#1a1a2e', fontWeight: '600', fontSize: '14px',
                    transition: 'border-color 0.2s'
                }}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <DollarSign size={18} style={{ color: themeColor }} /> View Your Quote
                    </span>
                    <ChevronRight size={18} style={{ color: '#999' }} />
                </a>
            )}
        </div>
    );
};

const JobView: React.FC<{ data: TokenData; themeColor: string; onRefresh: () => void }> = ({ data, themeColor, onRefresh }) => {
    const r = data.resource;
    return (
        <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '24px' }}>
                <div style={{ width: '48px', height: '48px', borderRadius: '12px', background: `${themeColor}15`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <Wrench size={24} style={{ color: themeColor }} />
                </div>
                <div>
                    <h2 style={{ fontSize: '20px', fontWeight: '700', color: '#1a1a2e', margin: 0 }}>Your Appointment</h2>
                    <p style={{ fontSize: '13px', color: '#888', margin: '2px 0 0' }}>Ref: {r.id.slice(0, 8).toUpperCase()}</p>
                </div>
            </div>

            <StatusBadge status={r.status} />

            <div style={{ background: '#f8f9fc', borderRadius: '12px', padding: '20px', marginTop: '20px' }}>
                {r.scheduledAt && (
                    <DetailRow icon={<Calendar size={16} />} label={r.scheduleConfirmed === false ? 'Proposed time (being confirmed)' : 'Confirmed appointment'} value={formatDateTime(r.scheduledAt, r.timezone)} themeColor={themeColor} />
                )}
                {r.scheduledSlot && <DetailRow icon={<Clock size={16} />} label="Time Slot" value={r.scheduledSlot === 'morning' ? 'Morning (8 AM – 12 PM)' : 'Afternoon (12 PM – 5 PM)'} themeColor={themeColor} />}
                <DetailRow icon={<FileText size={16} />} label="Description" value={r.description} themeColor={themeColor} />
                {r.customer?.address && <DetailRow icon={<MapPin size={16} />} label="Address" value={r.customer.address} themeColor={themeColor} />}
            </div>

            <RescheduleSection data={data} themeColor={themeColor} onRefresh={onRefresh} />
        </div>
    );
};

// Customer asks for a different appointment time. Nothing moves automatically —
// the office picks a new time and sends a new confirmation.
const RescheduleSection: React.FC<{ data: TokenData; themeColor: string; onRefresh: () => void }> = ({ data, themeColor, onRefresh }) => {
    const r = data.resource;
    const [open, setOpen] = useState(false);
    const [slots, setSlots] = useState<{ day: string; preferredTime: 'morning' | 'afternoon' }[]>([
        { day: '', preferredTime: 'morning' }, { day: '', preferredTime: 'morning' },
    ]);
    const [note, setNote] = useState('');
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState('');

    const canChange = data.permissions.includes('reschedule') && !['completed', 'cancelled', 'in_progress'].includes(r.status);
    if (!canChange) return null;

    const pending = r.customerRescheduleRequest?.status === 'pending' ? r.customerRescheduleRequest : null;
    const minDate = (() => { const d = new Date(); d.setDate(d.getDate() + 1); return d.toISOString().slice(0, 10); })();

    const submit = async () => {
        const windows = slots.filter(s => s.day);
        if (windows.length < 1) { setError('Please pick at least one date that works for you.'); return; }
        setSubmitting(true); setError('');
        try {
            const fn = httpsCallable(functions, 'requestCustomerReschedule');
            await fn({ token: data.token, windows, note });
            setOpen(false);
            onRefresh();
        } catch (e: any) {
            setError(e?.message || 'Could not send your request. Please call us.');
        } finally { setSubmitting(false); }
    };

    const box: React.CSSProperties = { marginTop: '20px', padding: '16px', borderRadius: '12px', border: '2px dashed #e5e7eb' };
    const input: React.CSSProperties = { padding: '10px', borderRadius: '8px', border: '1px solid #d1d5db', fontSize: '14px', width: '100%', boxSizing: 'border-box' };

    if (pending) {
        return (
            <div id="reschedule-pending" style={{ ...box, borderStyle: 'solid', borderColor: '#FDBA74', background: '#FFF7ED' }}>
                <p style={{ margin: '0 0 8px', fontWeight: 700, color: '#9A3412', fontSize: '14px' }}>We got your request for a different time</p>
                <ul style={{ margin: '0 0 8px', paddingLeft: '18px', color: '#7C2D12', fontSize: '14px' }}>
                    {(pending.windows || []).map((w: any, i: number) => <li key={i}>{formatWindowText(w)}</li>)}
                </ul>
                <p style={{ margin: 0, color: '#9A3412', fontSize: '13px' }}>We'll confirm your new appointment time shortly.</p>
            </div>
        );
    }

    if (!open) {
        return (
            <div style={{ ...box, textAlign: 'center' }}>
                <p style={{ fontSize: '14px', color: '#555', margin: '0 0 12px' }}>Doesn't work for you?</p>
                <button id="request-different-time-btn" type="button" onClick={() => setOpen(true)} style={{
                    display: 'inline-flex', alignItems: 'center', gap: '8px', padding: '10px 20px', borderRadius: '8px', border: 'none',
                    background: themeColor, color: 'white', fontWeight: 600, fontSize: '14px', cursor: 'pointer'
                }}>
                    <RefreshCw size={16} /> Request a different time
                </button>
                {data.org.phone && (
                    <p style={{ fontSize: '12px', color: '#888', margin: '12px 0 0' }}>
                        Or call us at <a href={`tel:${data.org.phone}`} style={{ color: themeColor }}>{data.org.phone}</a>
                    </p>
                )}
            </div>
        );
    }

    return (
        <div id="reschedule-form" style={{ ...box, borderStyle: 'solid', borderColor: `${themeColor}55` }}>
            <p style={{ margin: '0 0 4px', fontWeight: 700, color: '#1a1a2e', fontSize: '15px' }}>Pick 1–3 times that work for you</p>
            <p style={{ margin: '0 0 12px', color: '#666', fontSize: '13px' }}>We'll confirm the new appointment with you.</p>
            {slots.map((s, i) => (
                <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: '8px' }}>
                    <input id={`reschedule-date-${i}`} type="date" min={minDate} value={s.day} style={input}
                        onChange={e => setSlots(prev => prev.map((p, j) => j === i ? { ...p, day: e.target.value } : p))} />
                    <select id={`reschedule-window-${i}`} value={s.preferredTime} style={input}
                        onChange={e => setSlots(prev => prev.map((p, j) => j === i ? { ...p, preferredTime: e.target.value as any } : p))}>
                        <option value="morning">Morning (8am–12pm)</option>
                        <option value="afternoon">Afternoon (12–5pm)</option>
                    </select>
                </div>
            ))}
            {slots.length < 3 && (
                <button type="button" onClick={() => setSlots(prev => [...prev, { day: '', preferredTime: 'morning' }])}
                    style={{ background: 'none', border: 'none', color: themeColor, fontWeight: 600, fontSize: '13px', cursor: 'pointer', padding: '4px 0', marginBottom: '8px' }}>
                    + Add another option
                </button>
            )}
            <textarea id="reschedule-note" placeholder="Anything we should know? (optional)" value={note} onChange={e => setNote(e.target.value)}
                rows={2} style={{ ...input, resize: 'vertical', marginBottom: '10px' }} />
            {error && <p style={{ color: '#B91C1C', fontSize: '13px', margin: '0 0 10px' }}>{error}</p>}
            <div style={{ display: 'flex', gap: '8px' }}>
                <button id="submit-reschedule-btn" type="button" disabled={submitting} onClick={submit} style={{
                    flex: 1, padding: '10px', borderRadius: '8px', border: 'none', background: themeColor, color: 'white',
                    fontWeight: 600, fontSize: '14px', cursor: 'pointer', opacity: submitting ? 0.6 : 1
                }}>{submitting ? 'Sending…' : 'Send request'}</button>
                <button type="button" onClick={() => setOpen(false)} style={{
                    padding: '10px 16px', borderRadius: '8px', border: '1px solid #d1d5db', background: 'white', color: '#555', fontSize: '14px', cursor: 'pointer'
                }}>Cancel</button>
            </div>
        </div>
    );
};

const AppointmentView: React.FC<{ data: TokenData; themeColor: string; navigate: any; onRefresh: () => void }> = ({ data, themeColor, onRefresh }) => {
    const r = data.resource;
    return (
        <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '24px' }}>
                <div style={{ width: '48px', height: '48px', borderRadius: '12px', background: `${themeColor}15`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <Calendar size={24} style={{ color: themeColor }} />
                </div>
                <div>
                    <h2 style={{ fontSize: '20px', fontWeight: '700', color: '#1a1a2e', margin: 0 }}>Your Appointment</h2>
                    <p style={{ fontSize: '13px', color: '#888', margin: '2px 0 0' }}>Ref: {r.id.slice(0, 8).toUpperCase()}</p>
                </div>
            </div>

            <StatusBadge status={r.status} />

            <div style={{ background: '#f8f9fc', borderRadius: '12px', padding: '20px', marginTop: '20px' }}>
                {r.scheduledAt && <DetailRow icon={<Calendar size={16} />} label={r.scheduleConfirmed === false ? 'Proposed time (being confirmed)' : 'Date & time'} value={formatDateTime(r.scheduledAt, r.timezone)} themeColor={themeColor} />}
                {r.scheduledSlot && <DetailRow icon={<Clock size={16} />} label="Time Slot" value={r.scheduledSlot === 'morning' ? 'Morning (8 AM – 12 PM)' : 'Afternoon (12 PM – 5 PM)'} themeColor={themeColor} />}
                {r.customer?.address && <DetailRow icon={<MapPin size={16} />} label="Address" value={r.customer.address} themeColor={themeColor} />}
                <DetailRow icon={<FileText size={16} />} label="Service" value={r.description} themeColor={themeColor} />
            </div>

            {/* Reschedule option (if permitted) */}
            <RescheduleSection data={data} themeColor={themeColor} onRefresh={onRefresh} />
        </div>
    );
};

const InvoiceView: React.FC<{ data: TokenData; themeColor: string }> = ({ data, themeColor }) => {
    const r = data.resource;
    return (
        <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '24px' }}>
                <div style={{ width: '48px', height: '48px', borderRadius: '12px', background: `${themeColor}15`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <DollarSign size={24} style={{ color: themeColor }} />
                </div>
                <div>
                    <h2 style={{ fontSize: '20px', fontWeight: '700', color: '#1a1a2e', margin: 0 }}>Invoice</h2>
                    <p style={{ fontSize: '13px', color: '#888', margin: '2px 0 0' }}>Ref: {r.id.slice(0, 8).toUpperCase()}</p>
                </div>
            </div>

            <StatusBadge status={r.status} />

            <div style={{ background: '#f8f9fc', borderRadius: '12px', padding: '20px', marginTop: '20px' }}>
                <DetailRow icon={<DollarSign size={16} />} label="Total" value={`$${(r.total || 0).toFixed(2)}`} themeColor={themeColor} />
                <DetailRow icon={<DollarSign size={16} />} label="Balance Due" value={`$${(r.balance_due || 0).toFixed(2)}`} themeColor={themeColor} />
                {r.createdAt && <DetailRow icon={<Calendar size={16} />} label="Created" value={formatTimestamp(r.createdAt)} themeColor={themeColor} />}
            </div>
        </div>
    );
};

// ═══════════════════════════════════════════════════════════════
//  SHARED SUB-COMPONENTS
// ═══════════════════════════════════════════════════════════════

const Shell: React.FC<{
    themeColor: string;
    companyName?: string;
    logoUrl?: string;
    children: React.ReactNode;
}> = ({ themeColor, companyName, logoUrl, children }) => (
    <div style={{
        minHeight: '100vh',
        background: 'linear-gradient(135deg, #f0f2f5 0%, #e8edf5 100%)',
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        padding: '40px 16px'
    }}>
        <div style={{
            width: '100%', maxWidth: '560px', background: 'white',
            borderRadius: '20px', overflow: 'hidden',
            boxShadow: '0 8px 40px rgba(0,0,0,0.08), 0 2px 8px rgba(0,0,0,0.04)'
        }}>
            {/* Header */}
            {companyName && (
                <div style={{
                    background: `linear-gradient(135deg, ${themeColor}, ${adjustColor(themeColor, -20)})`,
                    padding: '24px 32px', textAlign: 'center'
                }}>
                    {logoUrl && (
                        <img src={logoUrl} alt={companyName} style={{
                            height: '40px', marginBottom: '8px', objectFit: 'contain'
                        }} />
                    )}
                    <h1 style={{ color: 'white', margin: 0, fontSize: '18px', fontWeight: '700', letterSpacing: '-0.3px' }}>
                        {companyName}
                    </h1>
                </div>
            )}
            {children}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '24px', color: '#aaa', fontSize: '12px' }}>
            <ShieldCheck size={14} />
            <span>Secured by <strong style={{ color: '#888' }}>DispatchBox</strong></span>
        </div>
    </div>
);

const DetailRow: React.FC<{
    icon: React.ReactNode;
    label: string;
    value: string;
    themeColor: string;
}> = ({ icon, label, value, themeColor }) => (
    <div style={{ display: 'flex', gap: '12px', padding: '10px 0', borderBottom: '1px solid #eee' }}>
        <span style={{ color: themeColor, marginTop: '2px', flexShrink: 0 }}>{icon}</span>
        <div>
            <p style={{ fontSize: '11px', fontWeight: '600', color: '#999', textTransform: 'uppercase', letterSpacing: '0.5px', margin: '0 0 2px' }}>{label}</p>
            <p style={{ fontSize: '14px', color: '#333', margin: 0, lineHeight: '1.5', whiteSpace: 'pre-wrap' }}>{value}</p>
        </div>
    </div>
);

const StatusBadge: React.FC<{ status: string }> = ({ status }) => {
    const map: Record<string, { bg: string; text: string; label: string }> = {
        pending: { bg: '#FEF3C7', text: '#92400E', label: '⏳ Pending' },
        PENDING: { bg: '#FEF3C7', text: '#92400E', label: '⏳ Pending' },
        scheduled: { bg: '#DBEAFE', text: '#1E40AF', label: '📅 Scheduled' },
        dispatched: { bg: '#DBEAFE', text: '#1E40AF', label: '📅 Scheduled' },
        en_route: { bg: '#E0E7FF', text: '#3730A3', label: '🚗 Technician on the way' },
        in_progress: { bg: '#E0E7FF', text: '#3730A3', label: '🔧 In Progress' },
        IN_PROGRESS: { bg: '#E0E7FF', text: '#3730A3', label: '🔧 In Progress' },
        quote_pending: { bg: '#FEF3C7', text: '#92400E', label: '💰 Quote Pending' },
        completed: { bg: '#D1FAE5', text: '#065F46', label: '✅ Completed' },
        COMPLETED: { bg: '#D1FAE5', text: '#065F46', label: '✅ Completed' },
        cancelled: { bg: '#FEE2E2', text: '#991B1B', label: '❌ Cancelled' },
        CANCELLED: { bg: '#FEE2E2', text: '#991B1B', label: '❌ Cancelled' },
        draft: { bg: '#F3F4F6', text: '#4B5563', label: '📝 Draft' },
        sent: { bg: '#DBEAFE', text: '#1E40AF', label: '📧 Sent' },
        paid: { bg: '#D1FAE5', text: '#065F46', label: '✅ Paid' },
    };
    const s = map[status] || { bg: '#F3F4F6', text: '#4B5563', label: status };
    return (
        <div style={{ padding: '8px 14px', borderRadius: '8px', background: s.bg, color: s.text, fontWeight: '600', fontSize: '13px', display: 'inline-block' }}>
            {s.label}
        </div>
    );
};

// ═══════════════════════════════════════════════════════════════
//  UTILITIES
// ═══════════════════════════════════════════════════════════════

function formatTimestamp(ts: any): string {
    try {
        let date: Date;
        if (ts?.seconds) {
            date = new Date(ts.seconds * 1000);
        } else if (ts?._seconds) {
            date = new Date(ts._seconds * 1000);
        } else {
            date = new Date(ts);
        }
        return date.toLocaleDateString('en-US', {
            weekday: 'long', month: 'long', day: 'numeric', year: 'numeric'
        });
    } catch {
        return 'N/A';
    }
}

function formatDateTime(ts: any, timeZone?: string | null): string {
    try {
        const date = ts?.seconds ? new Date(ts.seconds * 1000) : ts?._seconds ? new Date(ts._seconds * 1000) : new Date(ts);
        return date.toLocaleString('en-US', {
            weekday: 'long', month: 'long', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZoneName: 'short',
            ...(timeZone ? { timeZone } : {}),
        });
    } catch {
        return formatTimestamp(ts);
    }
}

function formatWindowText(w: any): string {
    const d = /^\d{4}-\d{2}-\d{2}$/.test(w?.day || '') ? new Date(`${w.day}T12:00:00`) : null;
    const day = d ? d.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' }) : (w?.day || '');
    const slot = w?.preferredTime === 'morning' ? 'Morning (8am–12pm)' : w?.preferredTime === 'afternoon' ? 'Afternoon (12–5pm)' : w?.preferredTime === 'evening' ? 'Evening (5–8pm)' : '';
    return slot ? `${day} — ${slot}` : day;
}

function adjustColor(hex: string, amount: number): string {
    const clamp = (v: number) => Math.max(0, Math.min(255, v));
    const h = hex.replace('#', '');
    const r = clamp(parseInt(h.substring(0, 2), 16) + amount);
    const g = clamp(parseInt(h.substring(2, 4), 16) + amount);
    const b = clamp(parseInt(h.substring(4, 6), 16) + amount);
    return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
}

export default TokenResolver;
