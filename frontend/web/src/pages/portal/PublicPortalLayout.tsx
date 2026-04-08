import React, { useEffect, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { db } from '../../firebase';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { getFunctions, httpsCallable } from 'firebase/functions';
import toast from 'react-hot-toast';
import { Mail, Phone, Clock, CreditCard, ChevronRight, CheckCircle2 } from 'lucide-react';

export const PublicPortalLayout: React.FC = () => {
    const { portalSlug } = useParams<{ portalSlug: string }>();
    const [searchParams] = useSearchParams();
    const invoiceId = searchParams.get('invoice');

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

    useEffect(() => {
        const fetchOrg = async () => {
            if (!portalSlug) return;
            try {
                const q = query(
                    collection(db, 'organizations'),
                    where('portalConfig.isActive', '==', true),
                    where('portalConfig.slug', '==', portalSlug)
                );

                const querySnapshot = await getDocs(q);
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
            // Find invoice logic here... (Stubbed for now, usually calls a backend func)
            // If they are valid, we push to a striped checkout view or similar
            toast.success("Invoice found. Redirecting to payment...");
            setTimeout(() => {
                window.location.href = `/quote/pay?invoice=${invoiceId}&phone=${invoicePhone}`;
            }, 1000);
        } catch (error) {
            toast.error("Could not find invoice matching that phone number.");
            setCheckingInvoice(false);
        }
    };

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
    const { themeColor, sections } = portalConfig;

    const heroSection = sections?.find((s: any) => s.type === 'hero');
    const aboutSection = sections?.find((s: any) => s.type === 'about');
    const servicesSection = sections?.find((s: any) => s.type === 'services');

    return (
        <div className="min-h-screen bg-white font-sans text-gray-800 overflow-x-hidden">
            {/* Header */}
            <header className="fixed top-0 left-0 right-0 bg-white shadow-sm z-50">
                <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        {branding?.logoUrl && <img src={branding.logoUrl} alt={name} className="h-8 w-auto" />}
                        <span className="font-bold text-xl" style={{ color: themeColor }}>{branding?.companyName || name}</span>
                    </div>
                    <div className="hidden md:flex items-center gap-6">
                        {communicationChannels?.contactPhone && (
                            <a href={`tel:${communicationChannels.contactPhone}`} className="flex items-center gap-2 text-gray-600 hover:text-gray-900 transition-colors">
                                <Phone className="w-4 h-4" style={{ color: themeColor }} />
                                <span className="font-medium">{communicationChannels.contactPhone}</span>
                            </a>
                        )}
                        <a href="#book" className="px-5 py-2 rounded-full text-white font-medium transition-transform hover:scale-105" style={{ backgroundColor: themeColor }}>
                            Book Service
                        </a>
                    </div>
                </div>
            </header>

            {/* Main Content */}
            <main className="pt-16">
                {/* Hero Section */}
                <section className="relative py-20 lg:py-28 overflow-hidden bg-gray-50">
                    <div className="absolute top-0 right-0 -mr-20 -mt-20 w-96 h-96 rounded-full opacity-10 blur-3xl pointer-events-none" style={{ backgroundColor: themeColor }}></div>
                    <div className="absolute bottom-0 left-0 -ml-20 -mb-20 w-72 h-72 rounded-full opacity-10 blur-3xl pointer-events-none" style={{ backgroundColor: themeColor }}></div>

                    <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10 flex flex-col md:flex-row items-center gap-12">
                        <div className="flex-1 space-y-6 text-center md:text-left">
                            <h1 className="text-4xl md:text-5xl lg:text-6xl font-extrabold tracking-tight text-gray-900 leading-tight">
                                {heroSection?.title || 'Fast, reliable service.'}
                            </h1>
                            <p className="text-lg md:text-xl text-gray-600 max-w-2xl">
                                {heroSection?.content || 'Book a service online or call us directly. We are ready to help.'}
                            </p>
                            <div className="flex flex-col sm:flex-row gap-4 justify-center md:justify-start">
                                <a href="#book" className="px-8 py-4 rounded-lg text-white font-bold text-lg text-center shadow-lg transition-transform hover:-translate-y-1 hover:shadow-xl" style={{ backgroundColor: themeColor }}>
                                    Request Service
                                </a>
                                {communicationChannels?.contactPhone && (
                                    <a href={`tel:${communicationChannels.contactPhone}`} className="px-8 py-4 rounded-lg bg-white text-gray-800 font-bold text-lg text-center shadow-md border border-gray-100 transition-transform hover:-translate-y-1 hover:shadow-lg flex items-center justify-center gap-2">
                                        <Phone className="w-5 h-5" /> Call Now
                                    </a>
                                )}
                            </div>
                        </div>
                    </div>
                </section>

                {/* Intelligent Layout: If an invoice param exists, show Invoice Payment prominently */}
                {invoiceId && (
                    <section className="py-16 bg-white" id="invoice">
                        <div className="max-w-md mx-auto px-4">
                            <div className="bg-white border-2 rounded-2xl p-8 shadow-xl relative overflow-hidden" style={{ borderColor: themeColor }}>
                                <div className="absolute top-0 right-0 w-24 h-24 transform translate-x-12 -translate-y-12 rounded-full opacity-20" style={{ backgroundColor: themeColor }}></div>
                                <h2 className="text-2xl font-bold mb-2 flex items-center gap-2">
                                    <CreditCard className="w-6 h-6" style={{ color: themeColor }} />
                                    Pay Invoice #{invoiceId}
                                </h2>
                                <p className="text-gray-600 mb-6">Please enter the phone number associated with this service to securely view and pay your invoice.</p>

                                <form onSubmit={handleInvoiceSubmit} className="space-y-4">
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1">Mobile Phone Number</label>
                                        <input
                                            type="tel"
                                            required
                                            value={invoicePhone}
                                            onChange={e => setInvoicePhone(e.target.value)}
                                            className="w-full px-4 py-3 rounded-lg border border-gray-300 focus:ring-2 focus:border-transparent outline-none transition-shadow"
                                            style={{ '--tw-ring-color': themeColor } as any}
                                            placeholder="(555) 123-4567"
                                        />
                                    </div>
                                    <button
                                        type="submit"
                                        disabled={checkingInvoice}
                                        className="w-full text-white font-bold py-3 px-4 rounded-lg transition-colors flex items-center justify-center gap-2 disabled:opacity-70"
                                        style={{ backgroundColor: themeColor }}
                                    >
                                        {checkingInvoice ? 'Verifying...' : 'View & Pay Invoice'}
                                        {!checkingInvoice && <ChevronRight className="w-5 h-5" />}
                                    </button>
                                </form>
                            </div>
                        </div>
                    </section>
                )}

                {/* Services Section */}
                {(servicesSection?.title || servicesSection?.content) && !invoiceId && (
                    <section className="py-20 bg-white">
                        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
                            <div className="text-center max-w-3xl mx-auto mb-16">
                                <h2 className="text-3xl md:text-4xl font-bold mb-4">{servicesSection.title}</h2>
                                <p className="text-lg text-gray-600 whitespace-pre-line">{servicesSection.content}</p>
                            </div>
                        </div>
                    </section>
                )}

                {/* About Section & Booking Form side by side */}
                <section className="py-20 bg-gray-50" id="book">
                    <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">

                        {/* Left: About us */}
                        <div>
                            {aboutSection?.title && <h2 className="text-3xl font-bold mb-4">{aboutSection.title}</h2>}
                            {aboutSection?.content && <p className="text-gray-600 text-lg whitespace-pre-line mb-8">{aboutSection.content}</p>}

                            <div className="space-y-4">
                                {communicationChannels?.contactPhone && (
                                    <div className="flex items-center gap-4 p-4 rounded-xl bg-white shadow-sm border border-gray-100">
                                        <div className="p-3 rounded-full" style={{ backgroundColor: `${themeColor}15`, color: themeColor }}>
                                            <Phone className="w-6 h-6" />
                                        </div>
                                        <div>
                                            <p className="text-sm text-gray-500 font-medium">Call Us Now</p>
                                            <p className="font-bold text-gray-900 text-lg">{communicationChannels.contactPhone}</p>
                                        </div>
                                    </div>
                                )}
                                {communicationChannels?.contactEmail && (
                                    <div className="flex items-center gap-4 p-4 rounded-xl bg-white shadow-sm border border-gray-100">
                                        <div className="p-3 rounded-full" style={{ backgroundColor: `${themeColor}15`, color: themeColor }}>
                                            <Mail className="w-6 h-6" />
                                        </div>
                                        <div>
                                            <p className="text-sm text-gray-500 font-medium">Email Us</p>
                                            <p className="font-bold text-gray-900">{communicationChannels.contactEmail}</p>
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Right: Booking Form */}
                        <div className="bg-white rounded-2xl shadow-xl p-8 border border-gray-100 relative">
                            {bookingSuccess ? (
                                <div className="text-center py-12">
                                    <CheckCircle2 className="w-20 h-20 mx-auto mb-6 text-green-500" />
                                    <h3 className="text-2xl font-bold text-gray-900 mb-2">Request Received!</h3>
                                    <p className="text-gray-600 mb-8">We've received your service request and will be in touch shortly to confirm your booking.</p>
                                    <button
                                        onClick={() => setBookingSuccess(false)}
                                        className="text-white font-medium px-6 py-2 rounded-lg"
                                        style={{ backgroundColor: themeColor }}
                                    >
                                        Submit Another Request
                                    </button>
                                </div>
                            ) : (
                                <>
                                    <h3 className="text-2xl font-bold mb-6">Request a Service</h3>
                                    <form onSubmit={handleBookingSubmit} className="space-y-5">
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                                            <div>
                                                <label className="block text-sm font-medium text-gray-700 mb-1">Full Name</label>
                                                <input type="text" required value={bookingForm.customerName} onChange={e => setBookingForm({ ...bookingForm, customerName: e.target.value })} className="w-full px-4 py-2 border rounded-lg focus:ring-2 outline-none transition-shadow bg-gray-50" style={{ '--tw-ring-color': themeColor } as any} placeholder="John Doe" />
                                            </div>
                                            <div>
                                                <label className="block text-sm font-medium text-gray-700 mb-1">Phone Number</label>
                                                <input type="tel" required value={bookingForm.customerPhone} onChange={e => setBookingForm({ ...bookingForm, customerPhone: e.target.value })} className="w-full px-4 py-2 border rounded-lg focus:ring-2 outline-none transition-shadow bg-gray-50" style={{ '--tw-ring-color': themeColor } as any} placeholder="(555) 123-4567" />
                                            </div>
                                        </div>
                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 mb-1">Email Address (Optional)</label>
                                            <input type="email" value={bookingForm.customerEmail} onChange={e => setBookingForm({ ...bookingForm, customerEmail: e.target.value })} className="w-full px-4 py-2 border rounded-lg focus:ring-2 outline-none transition-shadow bg-gray-50" style={{ '--tw-ring-color': themeColor } as any} placeholder="john@example.com" />
                                        </div>
                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 mb-1">Service Address</label>
                                            <input type="text" required value={bookingForm.address} onChange={e => setBookingForm({ ...bookingForm, address: e.target.value })} className="w-full px-4 py-2 border rounded-lg focus:ring-2 outline-none transition-shadow bg-gray-50" style={{ '--tw-ring-color': themeColor } as any} placeholder="123 Main St, City, ST" />
                                        </div>
                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 mb-1">Describe the Issue</label>
                                            <textarea required rows={3} value={bookingForm.description} onChange={e => setBookingForm({ ...bookingForm, description: e.target.value })} className="w-full px-4 py-2 border rounded-lg focus:ring-2 outline-none transition-shadow bg-gray-50 resize-none" style={{ '--tw-ring-color': themeColor } as any} placeholder="What do you need help with?" />
                                        </div>
                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 mb-2">How urgent is this?</label>
                                            <div className="flex gap-4">
                                                <label className="flex items-center gap-2 cursor-pointer">
                                                    <input type="radio" name="urgency" value="normal" checked={bookingForm.urgency === 'normal'} onChange={e => setBookingForm({ ...bookingForm, urgency: e.target.value })} className="w-4 h-4 cursor-pointer" style={{ accentColor: themeColor }} />
                                                    <span className="text-sm">Normal Setup</span>
                                                </label>
                                                <label className="flex items-center gap-2 cursor-pointer">
                                                    <input type="radio" name="urgency" value="emergency" checked={bookingForm.urgency === 'emergency'} onChange={e => setBookingForm({ ...bookingForm, urgency: e.target.value })} className="w-4 h-4 cursor-pointer" style={{ accentColor: themeColor }} />
                                                    <span className="text-sm text-red-600 font-medium">Emergency</span>
                                                </label>
                                            </div>
                                        </div>
                                        <button
                                            type="submit"
                                            disabled={submitting}
                                            className="w-full text-white font-bold py-3 px-4 rounded-lg transition-transform hover:-translate-y-0.5 shadow-md hover:shadow-lg disabled:opacity-70 disabled:hover:translate-y-0"
                                            style={{ backgroundColor: themeColor }}
                                        >
                                            {submitting ? 'Submitting...' : 'Send Request'}
                                        </button>
                                    </form>
                                </>
                            )}
                        </div>
                    </div>
                </section>
            </main>

            {/* Footer */}
            <footer className="bg-gray-900 text-white py-12 border-t border-gray-800">
                <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 text-center text-gray-400">
                    <p>&copy; {new Date().getFullYear()} {branding?.companyName || name}. All rights reserved.</p>
                    <p className="mt-2 text-sm opacity-50">Powered by DispatchBox</p>
                </div>
            </footer>
        </div>
    );
};
