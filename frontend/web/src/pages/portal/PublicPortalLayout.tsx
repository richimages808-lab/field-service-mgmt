import React, { useEffect, useState, useRef } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { db } from '../../firebase';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { getFunctions, httpsCallable } from 'firebase/functions';
import toast from 'react-hot-toast';
import { Mail, Phone, Clock, CreditCard, ChevronRight, CheckCircle2, Star, ChevronDown, Globe, Facebook, Instagram, MapPin, Award, ArrowRight, Send, Shield, Zap } from 'lucide-react';

/* ═══════════════════════════════════════════════════
 *  Theme Styling Utility
 *  Returns CSS classes / inline styles based on the
 *  org's WebsiteTheme. Falls back to "classic" defaults.
 * ═══════════════════════════════════════════════════ */
interface ThemeConfig {
    id: string;
    heroStyle: 'fullwidth' | 'split' | 'centered' | 'minimal';
    sectionSpacing: 'compact' | 'normal' | 'spacious';
    headingStyle: 'sans' | 'serif' | 'bold-caps';
    cardStyle: 'flat' | 'elevated' | 'bordered' | 'glass';
    colorMode: 'light' | 'dark' | 'auto';
}

const DEFAULT_THEME: ThemeConfig = {
    id: 'classic', heroStyle: 'centered', sectionSpacing: 'normal',
    headingStyle: 'sans', cardStyle: 'bordered', colorMode: 'light'
};

function useThemeStyles(theme: ThemeConfig, themeColor: string) {
    const spacing = {
        compact: 'py-12 lg:py-16',
        normal: 'py-16 lg:py-20',
        spacious: 'py-20 lg:py-28'
    }[theme.sectionSpacing];

    const headingClass = {
        sans: 'font-bold tracking-tight',
        serif: 'font-bold',
        'bold-caps': 'font-extrabold uppercase tracking-widest'
    }[theme.headingStyle];

    const headingFontFamily = theme.headingStyle === 'serif' ? 'Georgia, "Times New Roman", serif' : undefined;

    const cardClass = {
        flat: 'bg-white',
        elevated: 'bg-white shadow-lg hover:shadow-xl transition-shadow',
        bordered: 'bg-white border border-gray-200 hover:border-gray-300 transition-colors',
        glass: 'bg-white/80 backdrop-blur-sm border border-white/30 shadow-lg'
    }[theme.cardStyle];

    const isDarkHero = theme.colorMode === 'dark' || theme.colorMode === 'auto';

    const heroBg = isDarkHero ? '#0f172a' : '#f8fafc';
    const heroText = isDarkHero ? '#ffffff' : '#111827';
    const heroSubtext = isDarkHero ? 'rgba(255,255,255,0.7)' : '#6b7280';

    // Alternating section backgrounds
    const sectionBg = (idx: number) => idx % 2 === 0 ? '#ffffff' : '#f8fafc';

    return { spacing, headingClass, headingFontFamily, cardClass, isDarkHero, heroBg, heroText, heroSubtext, sectionBg };
}

/* ═══ Lighten / darken helper ═══ */
function hexToHSL(hex: string): { h: number; s: number; l: number } {
    const r = parseInt(hex.slice(1, 3), 16) / 255;
    const g = parseInt(hex.slice(3, 5), 16) / 255;
    const b = parseInt(hex.slice(5, 7), 16) / 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    let h = 0, s = 0;
    const l = (max + min) / 2;
    if (max !== min) {
        const d = max - min;
        s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
        switch (max) {
            case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break;
            case g: h = ((b - r) / d + 2) / 6; break;
            case b: h = ((r - g) / d + 4) / 6; break;
        }
    }
    return { h: Math.round(h * 360), s: Math.round(s * 100), l: Math.round(l * 100) };
}

export const PublicPortalLayout: React.FC = () => {
    const { portalSlug } = useParams<{ portalSlug: string }>();
    const [searchParams] = useSearchParams();
    const invoiceId = searchParams.get('invoice');
    const formRef = useRef<HTMLDivElement>(null);

    const [loading, setLoading] = useState(true);
    const [orgData, setOrgData] = useState<any>(null);
    const [notFound, setNotFound] = useState(false);

    // Form state
    const [bookingForm, setBookingForm] = useState({
        customerName: '',
        customerPhone: '',
        customerEmail: '',
        address: '',
        description: '',
        urgency: 'normal'
    });
    const [submitting, setSubmitting] = useState(false);
    const [bookingSuccess, setBookingSuccess] = useState(false);

    // Invoice flow
    const [invoicePhone, setInvoicePhone] = useState('');
    const [checkingInvoice, setCheckingInvoice] = useState(false);

    // FAQ accordion
    const [openFaqId, setOpenFaqId] = useState<string | null>(null);

    useEffect(() => {
        const fetchOrg = async () => {
            if (!portalSlug) return;
            try {
                // Try unified slug first, then fall back to portalConfig.slug
                let querySnapshot = await getDocs(
                    query(collection(db, 'organizations'), where('slug', '==', portalSlug))
                );

                if (querySnapshot.empty) {
                    querySnapshot = await getDocs(
                        query(collection(db, 'organizations'),
                            where('portalConfig.isActive', '==', true),
                            where('portalConfig.slug', '==', portalSlug)
                        )
                    );
                }

                if (querySnapshot.empty) {
                    setNotFound(true);
                } else {
                    setOrgData(querySnapshot.docs[0].data());
                }
            } catch (error) {
                console.error("Failed to load portal configuration:", error);
                setNotFound(true);
            } finally {
                setLoading(false);
            }
        };
        fetchOrg();
    }, [portalSlug]);

    const scrollToForm = () => {
        formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    };

    const handleBookingSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setSubmitting(true);
        try {
            const functions = getFunctions();
            const submitBooking = httpsCallable(functions, 'submitPortalBooking');

            await submitBooking({
                slug: portalSlug,
                ...bookingForm
            });

            setBookingSuccess(true);
            toast.success("Request submitted successfully!");
        } catch (error: any) {
            console.error("Booking failed:", error);
            toast.error(error.message || "Failed to submit booking");
        } finally {
            setSubmitting(false);
        }
    };

    const handleInvoiceSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!invoiceId || !invoicePhone) return;
        setCheckingInvoice(true);
        try {
            toast.success("Invoice found. Redirecting to payment...");
            setTimeout(() => {
                window.location.href = `/quote/pay?invoice=${invoiceId}&phone=${invoicePhone}`;
            }, 1000);
        } catch (error) {
            toast.error("Could not find invoice matching that phone number.");
            setCheckingInvoice(false);
        }
    };

    // Dynamically load font (must be before any early returns — React hooks rule)
    const fontFamily = orgData?.branding?.fontFamily || 'Inter';
    React.useEffect(() => {
        if (fontFamily && fontFamily !== 'Inter') {
            const link = document.createElement('link');
            link.href = `https://fonts.googleapis.com/css2?family=${fontFamily.replace(' ', '+')}:wght@400;500;600;700;800;900&display=swap`;
            link.rel = 'stylesheet';
            document.head.appendChild(link);
            return () => { document.head.removeChild(link); };
        }
    }, [fontFamily]);

    // Serif font loading for theme
    const websiteTheme: ThemeConfig = orgData?.branding?.websiteTheme || DEFAULT_THEME;
    React.useEffect(() => {
        if (websiteTheme.headingStyle === 'serif') {
            const link = document.createElement('link');
            link.href = 'https://fonts.googleapis.com/css2?family=Playfair+Display:wght@400;500;600;700;800;900&display=swap';
            link.rel = 'stylesheet';
            document.head.appendChild(link);
            return () => { document.head.removeChild(link); };
        }
    }, [websiteTheme.headingStyle]);

    if (loading) {
        return <div className="min-h-screen flex items-center justify-center bg-gray-50"><div className="animate-pulse text-xl text-gray-500">Loading Portal...</div></div>;
    }

    if (notFound || !orgData) {
        return (
            <div className="min-h-screen flex flex-col items-center justify-center bg-gray-50 p-6">
                <h1 className="text-4xl font-bold text-gray-800 mb-4">404</h1>
                <p className="text-xl text-gray-600 border-l-4 border-blue-500 pl-4 py-2">
                    This business portal could not be found or is inactive.
                </p>
            </div>
        );
    }

    const { name, branding, communicationChannels, portalConfig } = orgData;
    const themeColor = branding?.primaryColor || portalConfig?.themeColor || '#3B82F6';
    const hsl = hexToHSL(themeColor);

    // Get sections from branding (new) or portalConfig (legacy)
    const sections = (branding?.sections || []).filter((s: any) => s.enabled !== false);

    // Legacy sections from portalConfig
    const legacyHero = portalConfig?.sections?.find((s: any) => s.type === 'hero');
    const legacyAbout = portalConfig?.sections?.find((s: any) => s.type === 'about');
    const legacyServices = portalConfig?.sections?.find((s: any) => s.type === 'services');

    // Theme styles
    const ts = useThemeStyles(websiteTheme, themeColor);

    // Find hero section from dynamic sections
    const heroSection = sections.find((s: any) => s.type === 'hero');
    const nonHeroSections = sections.filter((s: any) => s.type !== 'hero');

    const heroTitle = heroSection?.title || legacyHero?.title || branding?.tagline || 'Fast, reliable service.';
    const heroContent = heroSection?.content || legacyHero?.content || branding?.welcomeMessage || 'Book a service online or call us directly. We are ready to help.';
    const heroCtaText = heroSection?.ctaText || 'Request Service Now';

    /* ── Heading Renderer ── */
    const renderHeading = (text: string, className?: string, centered?: boolean) => (
        <h2 className={`text-3xl md:text-4xl ${ts.headingClass} ${centered ? 'text-center' : ''} mb-6 ${className || ''}`}
            style={{ fontFamily: ts.headingFontFamily }}>
            {text}
        </h2>
    );

    /* ── Card Wrapper ── */
    const Card: React.FC<{ children: React.ReactNode; className?: string }> = ({ children, className = '' }) => (
        <div className={`rounded-xl p-6 ${ts.cardClass} ${className}`}>
            {children}
        </div>
    );

    /* ═══ BOOKING FORM (render function — NOT a component, to preserve focus) ═══ */
    const renderBookingForm = (variant: 'hero' | 'default' = 'default') => {
        const isHeroVariant = variant === 'hero';

        if (bookingSuccess) {
            return (
                <div className={`text-center ${isHeroVariant ? 'py-8' : 'py-12'}`}>
                    <CheckCircle2 className="w-16 h-16 mx-auto mb-4 text-green-500" />
                    <h3 className="text-xl font-bold text-gray-900 mb-2">Request Received!</h3>
                    <p className="text-gray-600 mb-6 text-sm">We've received your request and will be in touch shortly.</p>
                    <button onClick={() => setBookingSuccess(false)}
                        className="text-white font-medium px-5 py-2 rounded-lg text-sm" style={{ backgroundColor: themeColor }}>
                        Submit Another Request
                    </button>
                </div>
            );
        }

        return (
            <form onSubmit={handleBookingSubmit} className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                        <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">Full Name *</label>
                        <input type="text" required value={bookingForm.customerName}
                            onChange={e => setBookingForm({ ...bookingForm, customerName: e.target.value })}
                            className="w-full px-4 py-2.5 border border-gray-200 rounded-lg focus:ring-2 focus:ring-offset-0 outline-none bg-gray-50/50 text-sm transition-colors focus:bg-white"
                            style={{ focusRingColor: themeColor } as any}
                            placeholder="John Doe" />
                    </div>
                    <div>
                        <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">Phone *</label>
                        <input type="tel" required value={bookingForm.customerPhone}
                            onChange={e => setBookingForm({ ...bookingForm, customerPhone: e.target.value })}
                            className="w-full px-4 py-2.5 border border-gray-200 rounded-lg focus:ring-2 focus:ring-offset-0 outline-none bg-gray-50/50 text-sm transition-colors focus:bg-white"
                            placeholder="(555) 123-4567" />
                    </div>
                </div>
                <div>
                    <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">Email (Optional)</label>
                    <input type="email" value={bookingForm.customerEmail}
                        onChange={e => setBookingForm({ ...bookingForm, customerEmail: e.target.value })}
                        className="w-full px-4 py-2.5 border border-gray-200 rounded-lg focus:ring-2 focus:ring-offset-0 outline-none bg-gray-50/50 text-sm transition-colors focus:bg-white"
                        placeholder="john@example.com" />
                </div>
                <div>
                    <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">Service Address *</label>
                    <input type="text" required value={bookingForm.address}
                        onChange={e => setBookingForm({ ...bookingForm, address: e.target.value })}
                        className="w-full px-4 py-2.5 border border-gray-200 rounded-lg focus:ring-2 focus:ring-offset-0 outline-none bg-gray-50/50 text-sm transition-colors focus:bg-white"
                        placeholder="123 Main St, City, ST" />
                </div>
                <div>
                    <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">Describe the Issue *</label>
                    <textarea required rows={3} value={bookingForm.description}
                        onChange={e => setBookingForm({ ...bookingForm, description: e.target.value })}
                        className="w-full px-4 py-2.5 border border-gray-200 rounded-lg focus:ring-2 focus:ring-offset-0 outline-none bg-gray-50/50 text-sm resize-none transition-colors focus:bg-white"
                        placeholder="What do you need help with?" />
                </div>
                <div className="flex items-center gap-4">
                    <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider">Urgency:</label>
                    <div className="flex gap-3">
                        <label className="flex items-center gap-1.5 cursor-pointer">
                            <input type="radio" name="urgency" value="normal" checked={bookingForm.urgency === 'normal'}
                                onChange={e => setBookingForm({ ...bookingForm, urgency: e.target.value })}
                                className="w-3.5 h-3.5" style={{ accentColor: themeColor }} />
                            <span className="text-sm text-gray-700">Normal</span>
                        </label>
                        <label className="flex items-center gap-1.5 cursor-pointer">
                            <input type="radio" name="urgency" value="emergency" checked={bookingForm.urgency === 'emergency'}
                                onChange={e => setBookingForm({ ...bookingForm, urgency: e.target.value })}
                                className="w-3.5 h-3.5" style={{ accentColor: '#ef4444' }} />
                            <span className="text-sm text-red-600 font-medium">Emergency</span>
                        </label>
                    </div>
                </div>
                <button type="submit" disabled={submitting}
                    className="w-full text-white font-bold py-3.5 px-4 rounded-lg transition-all duration-200 hover:shadow-lg hover:-translate-y-0.5 disabled:opacity-70 flex items-center justify-center gap-2 text-sm"
                    style={{ backgroundColor: themeColor }}>
                    {submitting ? 'Submitting...' : (
                        <>
                            <Send className="w-4 h-4" />
                            Send Service Request
                        </>
                    )}
                </button>
                <p className="text-xs text-gray-400 text-center">Free estimates • No obligation • Fast response</p>
            </form>
        );
    };

    return (
        <div className="min-h-screen bg-white overflow-x-hidden" style={{ fontFamily }}>
            {/* ═══ STICKY HEADER ═══ */}
            <header className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${ts.isDarkHero ? 'bg-gray-900/95 backdrop-blur-md border-b border-white/10' : 'bg-white/95 backdrop-blur-md shadow-sm'}`}>
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        {branding?.logoUrl && <img src={branding.logoUrl} alt={name} className="h-8 w-auto" />}
                        <span className={`font-bold text-lg ${ts.isDarkHero ? 'text-white' : ''}`} style={{ color: ts.isDarkHero ? undefined : themeColor }}>
                            {branding?.companyName || name}
                        </span>
                    </div>
                    <div className="flex items-center gap-4">
                        {communicationChannels?.contactPhone && (
                            <a href={`tel:${communicationChannels.contactPhone}`}
                                className={`hidden md:flex items-center gap-2 text-sm font-medium transition-colors ${ts.isDarkHero ? 'text-gray-300 hover:text-white' : 'text-gray-600 hover:text-gray-900'}`}>
                                <Phone className="w-4 h-4" style={{ color: themeColor }} />
                                {communicationChannels.contactPhone}
                            </a>
                        )}
                        <button onClick={scrollToForm}
                            className="px-5 py-2 rounded-full text-white font-semibold text-sm transition-all hover:shadow-lg hover:scale-105"
                            style={{ backgroundColor: themeColor }}>
                            Get Free Estimate
                        </button>
                    </div>
                </div>
            </header>

            {/* Main Content */}
            <main className="pt-16">
                {/* ═══════════════════════════════════════════════════
                 *  HERO + INLINE BOOKING FORM
                 *  The form sits beside the hero text on desktop,
                 *  and below it on mobile — always visible immediately.
                 * ═══════════════════════════════════════════════════ */}
                <section className="relative overflow-hidden" style={{ backgroundColor: ts.heroBg }} id="book" ref={formRef}>
                    {/* Background effects */}
                    {branding?.heroImageUrl && (
                        <div className="absolute inset-0 z-0">
                            <img src={branding.heroImageUrl} alt="Cover" className="w-full h-full object-cover"
                                style={{ opacity: ts.isDarkHero ? 0.2 : 0.1 }} />
                        </div>
                    )}
                    {/* Gradient orbs */}
                    <div className="absolute top-0 right-0 -mr-32 -mt-32 w-[500px] h-[500px] rounded-full opacity-[0.07] blur-3xl pointer-events-none"
                        style={{ backgroundColor: themeColor }} />
                    <div className="absolute bottom-0 left-0 -ml-24 -mb-24 w-96 h-96 rounded-full opacity-[0.05] blur-3xl pointer-events-none"
                        style={{ backgroundColor: themeColor }} />

                    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10 py-16 lg:py-24">
                        <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 lg:gap-16 items-start">
                            {/* Left: Hero headline + trust signals */}
                            <div className="lg:col-span-7 space-y-6">
                                {branding?.tagline && !heroSection && (
                                    <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-semibold"
                                        style={{ backgroundColor: `${themeColor}20`, color: ts.isDarkHero ? '#ffffff' : themeColor }}>
                                        <Zap className="w-3.5 h-3.5" /> {branding.tagline}
                                    </div>
                                )}
                                <h1 className={`text-4xl md:text-5xl lg:text-6xl ${ts.headingClass} leading-[1.1]`}
                                    style={{ color: ts.heroText, fontFamily: ts.headingFontFamily }}>
                                    {heroTitle}
                                </h1>
                                <p className="text-lg md:text-xl max-w-xl leading-relaxed" style={{ color: ts.heroSubtext }}>
                                    {heroContent}
                                </p>

                                {/* Trust signals row */}
                                <div className="flex flex-wrap items-center gap-4 pt-2">
                                    {communicationChannels?.contactPhone && (
                                        <a href={`tel:${communicationChannels.contactPhone}`}
                                            className={`flex items-center gap-2 px-5 py-3 rounded-xl font-semibold transition-all hover:-translate-y-0.5 ${ts.isDarkHero
                                                ? 'bg-white/10 border border-white/20 text-white hover:bg-white/20'
                                                : 'bg-white text-gray-800 shadow-md border border-gray-100 hover:shadow-lg'
                                                }`}>
                                            <Phone className="w-5 h-5" style={{ color: themeColor }} />
                                            Call Now
                                        </a>
                                    )}
                                    <div className={`flex items-center gap-5 text-sm ${ts.isDarkHero ? 'text-white/50' : 'text-gray-400'}`}>
                                        <span className="flex items-center gap-1.5">
                                            <Shield className="w-4 h-4" /> Licensed & Insured
                                        </span>
                                        <span className="flex items-center gap-1.5">
                                            <CheckCircle2 className="w-4 h-4" /> Free Estimates
                                        </span>
                                    </div>
                                </div>
                            </div>

                            {/* Right: Floating Booking Form Card */}
                            <div className="lg:col-span-5">
                                <div className={`rounded-2xl p-6 lg:p-7 relative ${ts.isDarkHero
                                    ? 'bg-white shadow-2xl shadow-black/30'
                                    : 'bg-white shadow-2xl border border-gray-100'
                                    }`}>
                                    {/* Accent bar */}
                                    <div className="absolute top-0 left-6 right-6 h-1 rounded-b-full" style={{ backgroundColor: themeColor }} />
                                    <h3 className="text-lg font-bold text-gray-900 mb-1 mt-2">Request a Service</h3>
                                    <p className="text-sm text-gray-500 mb-4">Fill out the form below and we'll get back to you quickly.</p>
                                    {renderBookingForm('hero')}
                                </div>
                            </div>
                        </div>
                    </div>
                </section>

                {/* Invoice Payment (if param provided) */}
                {invoiceId && (
                    <section className="py-16 bg-white" id="invoice">
                        <div className="max-w-md mx-auto px-4">
                            <div className="bg-white border-2 rounded-2xl p-8 shadow-xl relative overflow-hidden" style={{ borderColor: themeColor }}>
                                <h2 className="text-2xl font-bold mb-2 flex items-center gap-2">
                                    <CreditCard className="w-6 h-6" style={{ color: themeColor }} />
                                    Pay Invoice #{invoiceId}
                                </h2>
                                <p className="text-gray-600 mb-6">Enter your phone number to securely view and pay your invoice.</p>
                                <form onSubmit={handleInvoiceSubmit} className="space-y-4">
                                    <input type="tel" required value={invoicePhone} onChange={e => setInvoicePhone(e.target.value)}
                                        className="w-full px-4 py-3 rounded-lg border border-gray-300 focus:ring-2 outline-none" placeholder="(555) 123-4567" />
                                    <button type="submit" disabled={checkingInvoice}
                                        className="w-full text-white font-bold py-3 px-4 rounded-lg flex items-center justify-center gap-2 disabled:opacity-70"
                                        style={{ backgroundColor: themeColor }}>
                                        {checkingInvoice ? 'Verifying...' : 'View & Pay Invoice'} {!checkingInvoice && <ChevronRight className="w-5 h-5" />}
                                    </button>
                                </form>
                            </div>
                        </div>
                    </section>
                )}

                {/* ═══ Dynamic Sections from branding.sections[] — Theme-Aware ═══ */}
                {nonHeroSections.map((section: any, sectionIdx: number) => {
                    const bgColor = ts.sectionBg(sectionIdx);

                    switch (section.type) {
                        case 'about':
                            return (
                                <section key={section.id} className={ts.spacing} style={{ backgroundColor: bgColor }}>
                                    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
                                        <div className="text-center mb-4">
                                            {renderHeading(section.title, '', true)}
                                        </div>
                                        <p className="text-lg text-gray-600 leading-relaxed whitespace-pre-line text-center max-w-3xl mx-auto">{section.content}</p>
                                    </div>
                                </section>
                            );

                        case 'services':
                            return (
                                <section key={section.id} className={ts.spacing} style={{ backgroundColor: bgColor }}>
                                    <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
                                        <div className="text-center mb-12">
                                            {renderHeading(section.title, '', true)}
                                            {section.content && <p className="text-lg text-gray-600 max-w-2xl mx-auto">{section.content}</p>}
                                        </div>
                                        {section.items && section.items.length > 0 && (
                                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                                                {section.items.map((item: any) => (
                                                    <Card key={item.id}>
                                                        <div className="w-12 h-12 rounded-xl flex items-center justify-center text-white text-xl font-bold mb-4"
                                                            style={{ background: `linear-gradient(135deg, ${themeColor}, hsl(${hsl.h}, ${hsl.s}%, ${Math.max(hsl.l - 15, 10)}%))` }}>
                                                            {item.title?.charAt(0) || '•'}
                                                        </div>
                                                        <h3 className="text-lg font-semibold mb-2 text-gray-900">{item.title}</h3>
                                                        <p className="text-gray-600 text-sm leading-relaxed">{item.content}</p>
                                                    </Card>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                </section>
                            );

                        case 'gallery':
                            return (
                                <section key={section.id} className={ts.spacing} style={{ backgroundColor: bgColor }}>
                                    <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
                                        <div className="text-center mb-12">
                                            {renderHeading(section.title, '', true)}
                                            {section.content && <p className="text-lg text-gray-600">{section.content}</p>}
                                        </div>
                                        {section.items && section.items.length > 0 && (
                                            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                                                {section.items.filter((i: any) => i.imageUrl).map((item: any) => (
                                                    <div key={item.id} className="group relative rounded-xl overflow-hidden shadow-sm hover:shadow-lg transition-shadow aspect-square">
                                                        <img src={item.imageUrl} alt={item.title} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
                                                        {item.title && (
                                                            <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent p-3">
                                                                <p className="text-white text-sm font-medium">{item.title}</p>
                                                            </div>
                                                        )}
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                </section>
                            );

                        case 'faq':
                            return (
                                <section key={section.id} className={ts.spacing} style={{ backgroundColor: bgColor }}>
                                    <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
                                        {renderHeading(section.title, '', true)}
                                        <div className="space-y-3">
                                            {(section.items || []).map((item: any) => (
                                                <div key={item.id} className={`rounded-xl overflow-hidden ${ts.cardClass}`}>
                                                    <button
                                                        onClick={() => setOpenFaqId(openFaqId === item.id ? null : item.id)}
                                                        className="w-full flex items-center justify-between px-6 py-4 text-left hover:bg-gray-50 transition-colors"
                                                    >
                                                        <span className="font-medium text-gray-900">{item.title}</span>
                                                        <ChevronDown className={`w-5 h-5 text-gray-400 transition-transform ${openFaqId === item.id ? 'rotate-180' : ''}`} />
                                                    </button>
                                                    {openFaqId === item.id && (
                                                        <div className="px-6 pb-4 text-gray-600 leading-relaxed border-t border-gray-100 pt-3">
                                                            {item.content}
                                                        </div>
                                                    )}
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                </section>
                            );

                        case 'testimonials':
                            return (
                                <section key={section.id} className={ts.spacing} style={{ backgroundColor: bgColor }}>
                                    <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
                                        {renderHeading(section.title, '', true)}
                                        {section.items && section.items.length > 0 && (
                                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                                                {section.items.map((item: any) => (
                                                    <Card key={item.id}>
                                                        <div className="flex gap-0.5 mb-3">
                                                            {[1, 2, 3, 4, 5].map(star => (
                                                                <Star key={star} className="w-4 h-4"
                                                                    fill={star <= (item.rating || 5) ? '#f59e0b' : 'none'}
                                                                    stroke={star <= (item.rating || 5) ? '#f59e0b' : '#d1d5db'} />
                                                            ))}
                                                        </div>
                                                        <p className="text-gray-700 italic mb-4 leading-relaxed">"{item.content}"</p>
                                                        <p className="text-sm font-semibold text-gray-900">— {item.title}</p>
                                                    </Card>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                </section>
                            );

                        case 'cta':
                            return (
                                <section key={section.id} className="py-16 lg:py-20 relative overflow-hidden" style={{ backgroundColor: themeColor }}>
                                    <div className="absolute top-0 right-0 w-72 h-72 rounded-full opacity-20 blur-3xl bg-white" />
                                    <div className="absolute bottom-0 left-0 w-48 h-48 rounded-full opacity-10 blur-3xl bg-white" />
                                    <div className="max-w-4xl mx-auto px-4 text-center relative z-10">
                                        <h2 className={`text-3xl md:text-4xl ${ts.headingClass} text-white mb-4`}
                                            style={{ fontFamily: ts.headingFontFamily }}>
                                            {section.title}
                                        </h2>
                                        {section.content && <p className="text-white/80 text-lg mb-8 max-w-2xl mx-auto">{section.content}</p>}
                                        <button onClick={scrollToForm}
                                            className="inline-flex items-center gap-2 px-8 py-4 bg-white font-bold text-lg rounded-xl shadow-lg hover:-translate-y-1 hover:shadow-xl transition-all"
                                            style={{ color: themeColor }}>
                                            {section.ctaText || 'Request Service'} <ArrowRight className="w-5 h-5" />
                                        </button>
                                    </div>
                                </section>
                            );

                        case 'team':
                            return (
                                <section key={section.id} className={ts.spacing} style={{ backgroundColor: bgColor }}>
                                    <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
                                        <div className="text-center mb-12">
                                            {renderHeading(section.title, '', true)}
                                            {section.content && <p className="text-lg text-gray-600">{section.content}</p>}
                                        </div>
                                        {section.items && section.items.length > 0 && (
                                            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-8">
                                                {section.items.map((item: any) => (
                                                    <div key={item.id} className="text-center">
                                                        {item.imageUrl ? (
                                                            <img src={item.imageUrl} alt={item.title} className="w-28 h-28 rounded-full object-cover mx-auto mb-4 shadow-md" />
                                                        ) : (
                                                            <div className="w-28 h-28 rounded-full mx-auto mb-4 flex items-center justify-center text-3xl font-bold text-white shadow-md"
                                                                style={{ background: `linear-gradient(135deg, ${themeColor}, hsl(${hsl.h}, ${hsl.s}%, ${Math.max(hsl.l - 15, 10)}%))` }}>
                                                                {item.title?.charAt(0) || '?'}
                                                            </div>
                                                        )}
                                                        <h3 className="font-semibold text-gray-900">{item.title}</h3>
                                                        <p className="text-sm text-gray-500 mt-1">{item.content}</p>
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                </section>
                            );

                        case 'hours':
                            return (
                                <section key={section.id} className={ts.spacing} style={{ backgroundColor: bgColor }}>
                                    <div className="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8">
                                        {renderHeading(section.title, '', true)}
                                        {section.items && section.items.length > 0 ? (
                                            <Card>
                                                {section.items.map((item: any, idx: number) => (
                                                    <div key={item.id} className={`flex items-center justify-between px-2 py-4 ${idx < (section.items?.length || 0) - 1 ? 'border-b border-gray-100' : ''}`}>
                                                        <span className="font-medium text-gray-900">{item.title}</span>
                                                        <span className="text-gray-600">{item.content}</span>
                                                    </div>
                                                ))}
                                            </Card>
                                        ) : section.content ? (
                                            <Card>
                                                <div className="flex items-start gap-4">
                                                    <div className="p-3 rounded-xl" style={{ backgroundColor: `${themeColor}15`, color: themeColor }}>
                                                        <Clock className="w-6 h-6" />
                                                    </div>
                                                    <p className="text-gray-600 whitespace-pre-line leading-relaxed">{section.content}</p>
                                                </div>
                                            </Card>
                                        ) : null}
                                    </div>
                                </section>
                            );

                        case 'serviceAreas':
                            return (
                                <section key={section.id} className={ts.spacing} style={{ backgroundColor: bgColor }}>
                                    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
                                        <div className="text-center mb-12">
                                            {renderHeading(section.title, '', true)}
                                            {section.content && <p className="text-lg text-gray-600">{section.content}</p>}
                                        </div>
                                        {section.items && section.items.length > 0 && (
                                            <div className="flex flex-wrap justify-center gap-3">
                                                {section.items.map((item: any) => (
                                                    <span key={item.id} className="inline-flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium border"
                                                        style={{ borderColor: `${themeColor}40`, color: themeColor, backgroundColor: `${themeColor}08` }}>
                                                        <MapPin className="w-4 h-4" /> {item.title}
                                                    </span>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                </section>
                            );

                        case 'certifications':
                            return (
                                <section key={section.id} className={ts.spacing} style={{ backgroundColor: bgColor }}>
                                    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
                                        <div className="text-center mb-12">
                                            {renderHeading(section.title, '', true)}
                                            {section.content && <p className="text-lg text-gray-600">{section.content}</p>}
                                        </div>
                                        {section.items && section.items.length > 0 && (
                                            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                                                {section.items.map((item: any) => (
                                                    <Card key={item.id} className="text-center">
                                                        <div className="w-12 h-12 rounded-full mx-auto mb-3 flex items-center justify-center"
                                                            style={{ backgroundColor: `${themeColor}15`, color: themeColor }}>
                                                            <Award className="w-6 h-6" />
                                                        </div>
                                                        <h3 className="font-semibold text-gray-900 text-sm">{item.title}</h3>
                                                        {item.content && <p className="text-xs text-gray-500 mt-1">{item.content}</p>}
                                                    </Card>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                </section>
                            );

                        case 'stats':
                            return (
                                <section key={section.id} className="py-16" style={{ backgroundColor: `${themeColor}08` }}>
                                    <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
                                        {section.title && renderHeading(section.title, '', true)}
                                        {section.items && section.items.length > 0 && (
                                            <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
                                                {section.items.map((item: any) => (
                                                    <div key={item.id} className="text-center">
                                                        <div className="text-4xl md:text-5xl font-extrabold mb-2" style={{ color: themeColor }}>{item.title}</div>
                                                        <div className="text-gray-600 text-sm font-medium">{item.content}</div>
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                </section>
                            );

                        case 'text':
                            return (
                                <section key={section.id} className={ts.spacing} style={{ backgroundColor: bgColor }}>
                                    <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
                                        {section.title && renderHeading(section.title)}
                                        <div className="prose prose-lg max-w-none text-gray-600 whitespace-pre-line">{section.content}</div>
                                    </div>
                                </section>
                            );

                        case 'twoColumn':
                            return (
                                <section key={section.id} className={ts.spacing} style={{ backgroundColor: bgColor }}>
                                    <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
                                        {section.title && renderHeading(section.title, '', true)}
                                        {section.items && section.items.length > 0 && (
                                            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                                                {section.items.map((item: any) => (
                                                    <div key={item.id} className="flex gap-4">
                                                        <div className="w-10 h-10 rounded-lg shrink-0 flex items-center justify-center text-white font-bold"
                                                            style={{ backgroundColor: themeColor }}>✓</div>
                                                        <div>
                                                            <h3 className="font-semibold text-gray-900 mb-1">{item.title}</h3>
                                                            <p className="text-gray-600 text-sm">{item.content}</p>
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                </section>
                            );

                        case 'beforeAfter':
                            return (
                                <section key={section.id} className={ts.spacing} style={{ backgroundColor: bgColor }}>
                                    <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
                                        <div className="text-center mb-12">
                                            {renderHeading(section.title, '', true)}
                                            {section.content && <p className="text-lg text-gray-600">{section.content}</p>}
                                        </div>
                                        {section.items && section.items.length > 0 && (
                                            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                                                {section.items.map((item: any) => (
                                                    <Card key={item.id} className="overflow-hidden !p-0">
                                                        {item.imageUrl && <img src={item.imageUrl} alt={item.title} className="w-full h-48 object-cover" />}
                                                        <div className="p-5">
                                                            <h3 className="font-semibold text-gray-900">{item.title}</h3>
                                                            {item.content && <p className="text-sm text-gray-600 mt-1">{item.content}</p>}
                                                        </div>
                                                    </Card>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                </section>
                            );

                        default:
                            return null;
                    }
                })}

                {/* Legacy: Services Section (from portalConfig) */}
                {(legacyServices?.title || legacyServices?.content) && sections.length === 0 && !invoiceId && (
                    <section className="py-20 bg-white">
                        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
                            <div className="text-center max-w-3xl mx-auto mb-16">
                                <h2 className="text-3xl md:text-4xl font-bold mb-4">{legacyServices.title}</h2>
                                <p className="text-lg text-gray-600 whitespace-pre-line">{legacyServices.content}</p>
                            </div>
                        </div>
                    </section>
                )}

                {/* ═══ BOTTOM CTA STRIP — Always present ═══ */}
                <section className="py-12 relative overflow-hidden" style={{ background: `linear-gradient(135deg, ${themeColor}, hsl(${hsl.h}, ${hsl.s}%, ${Math.max(hsl.l - 20, 10)}%))` }}>
                    <div className="absolute inset-0 opacity-10" style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23ffffff' fill-opacity='1'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")` }} />
                    <div className="max-w-5xl mx-auto px-4 text-center relative z-10">
                        <h2 className="text-2xl md:text-3xl font-bold text-white mb-3">Ready to get started?</h2>
                        <p className="text-white/70 mb-6 max-w-xl mx-auto">Contact us today for a free estimate. We respond fast!</p>
                        <div className="flex flex-col sm:flex-row gap-4 justify-center">
                            <button onClick={scrollToForm}
                                className="inline-flex items-center justify-center gap-2 px-8 py-3.5 bg-white font-bold rounded-xl shadow-lg hover:-translate-y-1 hover:shadow-xl transition-all"
                                style={{ color: themeColor }}>
                                <Send className="w-4 h-4" /> Request Service Now
                            </button>
                            {communicationChannels?.contactPhone && (
                                <a href={`tel:${communicationChannels.contactPhone}`}
                                    className="inline-flex items-center justify-center gap-2 px-8 py-3.5 rounded-xl font-bold border-2 border-white/30 text-white hover:-translate-y-1 hover:bg-white/10 transition-all">
                                    <Phone className="w-4 h-4" /> {communicationChannels.contactPhone}
                                </a>
                            )}
                        </div>
                    </div>
                </section>
            </main>

            {/* Footer */}
            <footer className="bg-gray-900 text-white py-10 border-t border-gray-800">
                <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
                    <div className="flex flex-col md:flex-row items-center justify-between gap-6">
                        <div className="flex items-center gap-3">
                            {branding?.logoUrl && <img src={branding.logoUrl} alt={name} className="h-7 w-auto brightness-200 grayscale opacity-70" />}
                            <span className="font-bold text-lg text-white">{branding?.companyName || name}</span>
                        </div>
                        {branding?.socialLinks && (branding.socialLinks.facebook || branding.socialLinks.instagram || branding.socialLinks.website) && (
                            <div className="flex items-center gap-5 text-gray-400">
                                {branding.socialLinks.website && (
                                    <a href={branding.socialLinks.website} target="_blank" rel="noopener noreferrer" className="hover:text-white transition-colors">
                                        <Globe className="w-5 h-5" />
                                    </a>
                                )}
                                {branding.socialLinks.facebook && (
                                    <a href={branding.socialLinks.facebook} target="_blank" rel="noopener noreferrer" className="hover:text-white transition-colors">
                                        <Facebook className="w-5 h-5" />
                                    </a>
                                )}
                                {branding.socialLinks.instagram && (
                                    <a href={branding.socialLinks.instagram} target="_blank" rel="noopener noreferrer" className="hover:text-white transition-colors">
                                        <Instagram className="w-5 h-5" />
                                    </a>
                                )}
                            </div>
                        )}
                    </div>
                    <div className="border-t border-gray-800 mt-6 pt-6 flex flex-col md:flex-row items-center justify-between gap-2 text-sm text-gray-500">
                        <p>&copy; {new Date().getFullYear()} {branding?.companyName || name}. All rights reserved.</p>
                        <p>Powered by <span className="text-gray-400">DispatchBox</span></p>
                    </div>
                </div>
            </footer>
        </div>
    );
};
