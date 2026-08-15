import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { getFunctions, httpsCallable } from 'firebase/functions';
import toast, { Toaster } from 'react-hot-toast';
import { Mail, Phone, MapPin, User, AlertTriangle, CheckCircle2, Clock, FileText, Loader2, ShieldCheck } from 'lucide-react';

const functions = getFunctions();

interface IntakeData {
    senderEmail: string;
    senderName: string;
    issueSummary: string;
    originalSubject: string;
    urgency: string;
    org: {
        name: string;
        companyName: string;
        themeColor: string;
        logoUrl: string;
    };
}

type FormState = 'loading' | 'form' | 'submitting' | 'success' | 'error' | 'expired';

export const EmailIntakeForm: React.FC = () => {
    const { token } = useParams<{ token: string }>();
    const [state, setState] = useState<FormState>('loading');
    const [intakeData, setIntakeData] = useState<IntakeData | null>(null);
    const [errorMessage, setErrorMessage] = useState('');

    // Form fields
    const [name, setName] = useState('');
    const [phone, setPhone] = useState('');
    const [address, setAddress] = useState('');
    const [description, setDescription] = useState('');
    const [urgency, setUrgency] = useState('MEDIUM');

    useEffect(() => {
        if (!token) {
            setErrorMessage('Invalid request link.');
            setState('error');
            return;
        }
        loadIntakeData();
    }, [token]);

    const loadIntakeData = async () => {
        try {
            const getIntake = httpsCallable(functions, 'getIntakeData');
            const result = await getIntake({ token });
            const data = result.data as IntakeData;

            setIntakeData(data);
            setName(data.senderName || '');
            setDescription(data.issueSummary || '');
            setUrgency(data.urgency || 'MEDIUM');
            setState('form');
        } catch (err: any) {
            const code = err?.code || '';
            const message = err?.message || 'Unable to load your request.';

            if (code.includes('deadline-exceeded') || message.includes('expired')) {
                setState('expired');
            } else if (code.includes('failed-precondition') && message.includes('already')) {
                setState('success');
                setErrorMessage('This request has already been submitted.');
            } else {
                setErrorMessage(message);
                setState('error');
            }
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        if (!name.trim() || !phone.trim() || !address.trim()) {
            toast.error('Please fill in all required fields.');
            return;
        }

        setState('submitting');
        try {
            const submitIntake = httpsCallable(functions, 'submitEmailIntake');
            await submitIntake({
                token,
                customerName: name.trim(),
                customerPhone: phone.trim(),
                customerAddress: address.trim(),
                description: description.trim(),
                urgency
            });

            setState('success');
            toast.success('Service request submitted!');
        } catch (err: any) {
            toast.error(err?.message || 'Submission failed. Please try again.');
            setState('form');
        }
    };

    const themeColor = intakeData?.org?.themeColor || '#3B82F6';
    const companyName = intakeData?.org?.companyName || 'Service Provider';
    const logoUrl = intakeData?.org?.logoUrl || '';

    // ── RENDER STATES ──

    if (state === 'loading') {
        return (
            <PageShell themeColor={themeColor}>
                <div style={{ textAlign: 'center', padding: '80px 20px' }}>
                    <Loader2 size={48} style={{ animation: 'spin 1s linear infinite', color: themeColor, margin: '0 auto 20px' }} />
                    <p style={{ color: '#666', fontSize: '16px' }}>Loading your request...</p>
                    <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
                </div>
            </PageShell>
        );
    }

    if (state === 'expired') {
        return (
            <PageShell themeColor={themeColor} companyName={companyName} logoUrl={logoUrl}>
                <div style={{ textAlign: 'center', padding: '60px 20px' }}>
                    <Clock size={64} style={{ color: '#F59E0B', margin: '0 auto 20px' }} />
                    <h2 style={{ fontSize: '24px', color: '#1a1a2e', margin: '0 0 12px' }}>Link Expired</h2>
                    <p style={{ color: '#666', fontSize: '15px', maxWidth: '400px', margin: '0 auto', lineHeight: '1.6' }}>
                        This request link has expired. Please send another email to get a new link.
                    </p>
                </div>
            </PageShell>
        );
    }

    if (state === 'error') {
        return (
            <PageShell themeColor={themeColor} companyName={companyName} logoUrl={logoUrl}>
                <div style={{ textAlign: 'center', padding: '60px 20px' }}>
                    <AlertTriangle size={64} style={{ color: '#EF4444', margin: '0 auto 20px' }} />
                    <h2 style={{ fontSize: '24px', color: '#1a1a2e', margin: '0 0 12px' }}>Something Went Wrong</h2>
                    <p style={{ color: '#666', fontSize: '15px', maxWidth: '400px', margin: '0 auto', lineHeight: '1.6' }}>
                        {errorMessage}
                    </p>
                </div>
            </PageShell>
        );
    }

    if (state === 'success') {
        return (
            <PageShell themeColor={themeColor} companyName={companyName} logoUrl={logoUrl}>
                <div style={{ textAlign: 'center', padding: '60px 20px' }}>
                    <div style={{
                        width: '80px', height: '80px', borderRadius: '50%',
                        background: `${themeColor}15`, display: 'flex',
                        alignItems: 'center', justifyContent: 'center', margin: '0 auto 24px'
                    }}>
                        <CheckCircle2 size={48} style={{ color: themeColor }} />
                    </div>
                    <h2 style={{ fontSize: '26px', color: '#1a1a2e', margin: '0 0 12px', fontWeight: '700' }}>
                        Request Submitted!
                    </h2>
                    <p style={{ color: '#666', fontSize: '16px', maxWidth: '440px', margin: '0 auto', lineHeight: '1.6' }}>
                        {errorMessage || `Your service request has been received. A technician from ${companyName} will contact you shortly.`}
                    </p>
                    <div style={{
                        marginTop: '32px', padding: '20px', background: '#f8f9fc',
                        borderRadius: '12px', maxWidth: '400px', margin: '32px auto 0'
                    }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', justifyContent: 'center', color: '#555' }}>
                            <ShieldCheck size={18} />
                            <span style={{ fontSize: '14px' }}>You'll receive a confirmation email shortly.</span>
                        </div>
                    </div>
                </div>
            </PageShell>
        );
    }

    // ── MAIN FORM ──
    return (
        <PageShell themeColor={themeColor} companyName={companyName} logoUrl={logoUrl}>
            <Toaster position="top-center" />
            <div style={{ padding: '40px 32px' }}>
                {/* Issue summary banner */}
                <div style={{
                    background: `${themeColor}08`, border: `1px solid ${themeColor}25`,
                    borderRadius: '12px', padding: '20px 24px', marginBottom: '32px'
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
                        <FileText size={18} style={{ color: themeColor }} />
                        <span style={{ fontWeight: '600', fontSize: '14px', color: '#333' }}>Your Request Summary</span>
                    </div>
                    <p style={{ color: '#555', fontSize: '14px', lineHeight: '1.5', margin: 0, fontStyle: 'italic' }}>
                        "{intakeData?.issueSummary || intakeData?.originalSubject}"
                    </p>
                </div>

                <h2 style={{ fontSize: '22px', color: '#1a1a2e', margin: '0 0 8px', fontWeight: '700' }}>
                    Complete Your Details
                </h2>
                <p style={{ color: '#777', fontSize: '14px', margin: '0 0 28px', lineHeight: '1.5' }}>
                    We just need a few more details to assign a technician to your request.
                </p>

                <form onSubmit={handleSubmit}>
                    {/* Email (read-only) */}
                    <FormField label="Email Address" icon={<Mail size={18} />} themeColor={themeColor}>
                        <input
                            type="email"
                            value={intakeData?.senderEmail || ''}
                            readOnly
                            style={{
                                ...inputStyle,
                                background: '#f4f5f7',
                                color: '#888',
                                cursor: 'not-allowed'
                            }}
                        />
                    </FormField>

                    {/* Name */}
                    <FormField label="Full Name" icon={<User size={18} />} required themeColor={themeColor}>
                        <input
                            type="text"
                            value={name}
                            onChange={e => setName(e.target.value)}
                            placeholder="Your full name"
                            required
                            style={inputStyle}
                        />
                    </FormField>

                    {/* Phone */}
                    <FormField label="Phone Number" icon={<Phone size={18} />} required themeColor={themeColor}>
                        <input
                            type="tel"
                            value={phone}
                            onChange={e => setPhone(e.target.value)}
                            placeholder="(555) 123-4567"
                            required
                            style={inputStyle}
                        />
                    </FormField>

                    {/* Address */}
                    <FormField label="Service Address" icon={<MapPin size={18} />} required themeColor={themeColor}>
                        <input
                            type="text"
                            value={address}
                            onChange={e => setAddress(e.target.value)}
                            placeholder="Full address where service is needed"
                            required
                            style={inputStyle}
                        />
                    </FormField>

                    {/* Description */}
                    <FormField label="Issue Description" icon={<FileText size={18} />} themeColor={themeColor}>
                        <textarea
                            value={description}
                            onChange={e => setDescription(e.target.value)}
                            placeholder="Describe the issue in detail..."
                            rows={4}
                            style={{ ...inputStyle, resize: 'vertical', minHeight: '100px' }}
                        />
                    </FormField>

                    {/* Urgency */}
                    <FormField label="How urgent is this?" icon={<AlertTriangle size={18} />} themeColor={themeColor}>
                        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                            {(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'] as const).map(level => (
                                <button
                                    key={level}
                                    type="button"
                                    onClick={() => setUrgency(level)}
                                    style={{
                                        padding: '8px 16px',
                                        borderRadius: '8px',
                                        border: urgency === level ? `2px solid ${themeColor}` : '2px solid #e5e7eb',
                                        background: urgency === level ? `${themeColor}12` : 'white',
                                        color: urgency === level ? themeColor : '#666',
                                        fontWeight: urgency === level ? '600' : '400',
                                        fontSize: '13px',
                                        cursor: 'pointer',
                                        transition: 'all 0.2s'
                                    }}
                                >
                                    {urgencyLabels[level]}
                                </button>
                            ))}
                        </div>
                    </FormField>

                    {/* SMS Consent Checkbox & Legal Disclosures */}
                    <div style={{
                        background: '#f8fafc',
                        border: '1px solid #e2e8f0',
                        borderRadius: '10px',
                        padding: '14px 16px',
                        margin: '16px 0 8px 0',
                        fontSize: '12px',
                        color: '#475569',
                        lineHeight: '1.5'
                    }}>
                        <label style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', cursor: 'pointer', userSelect: 'none' }}>
                            <input
                                type="checkbox"
                                defaultChecked
                                style={{ marginTop: '2px', cursor: 'pointer', flexShrink: 0 }}
                            />
                            <span>
                                <strong>Consent for SMS Updates:</strong> By submitting this request with your mobile number, you agree to receive transactional text messages (appointment reminders, technician arrival updates, quote links) from {companyName} powered by DispatchBox. Msg & data rates may apply. Message frequency varies. Text <strong>STOP</strong> to unsubscribe, <strong>HELP</strong> for info. View our <a href="/privacy" target="_blank" rel="noopener noreferrer" style={{ color: themeColor, textDecoration: 'underline', fontWeight: 600 }}>Privacy Policy</a> and <a href="/terms" target="_blank" rel="noopener noreferrer" style={{ color: themeColor, textDecoration: 'underline', fontWeight: 600 }}>Terms of Service</a>. Mobile information will not be shared with third parties for marketing purposes.
                            </span>
                        </label>
                    </div>

                    {/* Submit */}
                    <button
                        type="submit"
                        disabled={state === 'submitting'}
                        style={{
                            width: '100%',
                            padding: '16px',
                            background: themeColor,
                            color: 'white',
                            border: 'none',
                            borderRadius: '10px',
                            fontSize: '16px',
                            fontWeight: '700',
                            cursor: state === 'submitting' ? 'not-allowed' : 'pointer',
                            opacity: state === 'submitting' ? 0.7 : 1,
                            marginTop: '8px',
                            transition: 'opacity 0.2s',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: '8px'
                        }}
                    >
                        {state === 'submitting' ? (
                            <>
                                <Loader2 size={20} style={{ animation: 'spin 1s linear infinite' }} />
                                Submitting...
                            </>
                        ) : (
                            <>
                                <CheckCircle2 size={20} />
                                Submit Service Request
                            </>
                        )}
                    </button>
                </form>
            </div>
            <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </PageShell>
    );
};

// ═══════════════════════════════════════════════════════════════
//  SUB-COMPONENTS
// ═══════════════════════════════════════════════════════════════

const PageShell: React.FC<{
    themeColor: string;
    companyName?: string;
    logoUrl?: string;
    children: React.ReactNode;
}> = ({ themeColor, companyName, logoUrl, children }) => (
    <div style={{
        minHeight: '100vh',
        background: 'linear-gradient(135deg, #f0f2f5 0%, #e8edf5 100%)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '40px 16px'
    }}>
        <div style={{
            width: '100%',
            maxWidth: '560px',
            background: 'white',
            borderRadius: '20px',
            overflow: 'hidden',
            boxShadow: '0 8px 40px rgba(0,0,0,0.08), 0 2px 8px rgba(0,0,0,0.04)'
        }}>
            {/* Header */}
            <div style={{
                background: `linear-gradient(135deg, ${themeColor}, ${adjustColor(themeColor, -20)})`,
                padding: '32px 32px 28px',
                textAlign: 'center'
            }}>
                {logoUrl && (
                    <img src={logoUrl} alt={companyName} style={{
                        height: '44px', marginBottom: '12px', objectFit: 'contain'
                    }} />
                )}
                <h1 style={{ color: 'white', margin: 0, fontSize: '20px', fontWeight: '700', letterSpacing: '-0.3px' }}>
                    {companyName || 'Service Request'}
                </h1>
                <p style={{ color: 'rgba(255,255,255,0.8)', margin: '6px 0 0', fontSize: '14px' }}>
                    Service Request Form
                </p>
            </div>
            {children}
        </div>
        {/* Footer */}
        <p style={{ color: '#aaa', fontSize: '12px', marginTop: '24px', textAlign: 'center' }}>
            Powered by <strong style={{ color: '#888' }}>DispatchBox</strong>
        </p>
    </div>
);

const FormField: React.FC<{
    label: string;
    icon: React.ReactNode;
    required?: boolean;
    themeColor: string;
    children: React.ReactNode;
}> = ({ label, icon, required, themeColor, children }) => (
    <div style={{ marginBottom: '20px' }}>
        <label style={{
            display: 'flex', alignItems: 'center', gap: '6px',
            fontSize: '13px', fontWeight: '600', color: '#444', marginBottom: '8px'
        }}>
            <span style={{ color: themeColor }}>{icon}</span>
            {label}
            {required && <span style={{ color: '#EF4444' }}>*</span>}
        </label>
        {children}
    </div>
);

// ═══════════════════════════════════════════════════════════════
//  STYLES & UTILS
// ═══════════════════════════════════════════════════════════════

const inputStyle: React.CSSProperties = {
    width: '100%',
    padding: '12px 14px',
    border: '2px solid #e5e7eb',
    borderRadius: '10px',
    fontSize: '15px',
    color: '#1a1a2e',
    outline: 'none',
    transition: 'border-color 0.2s',
    fontFamily: 'inherit',
    boxSizing: 'border-box'
};

const urgencyLabels: Record<string, string> = {
    LOW: '🟢 Low',
    MEDIUM: '🟡 Medium',
    HIGH: '🟠 High',
    CRITICAL: '🔴 Critical'
};

function adjustColor(hex: string, amount: number): string {
    const clamp = (v: number) => Math.max(0, Math.min(255, v));
    const h = hex.replace('#', '');
    const r = clamp(parseInt(h.substring(0, 2), 16) + amount);
    const g = clamp(parseInt(h.substring(2, 4), 16) + amount);
    const b = clamp(parseInt(h.substring(4, 6), 16) + amount);
    return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
}

export default EmailIntakeForm;
