import React, { useState, useMemo } from 'react';
import { 
    Building2, 
    ExternalLink, 
    Sparkles, 
    Search, 
    Percent, 
    CheckCircle2, 
    Globe, 
    MapPin, 
    Copy, 
    Check, 
    Plus, 
    Layers, 
    Loader2, 
    ShieldCheck, 
    ArrowUpRight,
    Tag,
    X,
    FileText,
    Wrench,
    Zap,
    Flame,
    Droplet,
    Paintbrush,
    Truck
} from 'lucide-react';
import { useAuth } from '../../auth/AuthProvider';
import { db, functions } from '../../firebase';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { toast } from 'react-hot-toast';
import { TradeProgram, TradeCategory } from '../../types/TradeProgram';
import { TRADE_PROGRAMS_CATALOG } from '../../data/tradeProgramsCatalog';
import { Vendor } from '../../types/Vendor';

const US_STATES = [
    { code: 'AL', name: 'Alabama' }, { code: 'AK', name: 'Alaska' }, { code: 'AZ', name: 'Arizona' },
    { code: 'AR', name: 'Arkansas' }, { code: 'CA', name: 'California' }, { code: 'CO', name: 'Colorado' },
    { code: 'CT', name: 'Connecticut' }, { code: 'DE', name: 'Delaware' }, { code: 'FL', name: 'Florida' },
    { code: 'GA', name: 'Georgia' }, { code: 'HI', name: 'Hawaii' }, { code: 'ID', name: 'Idaho' },
    { code: 'IL', name: 'Illinois' }, { code: 'IN', name: 'Indiana' }, { code: 'IA', name: 'Iowa' },
    { code: 'KS', name: 'Kansas' }, { code: 'KY', name: 'Kentucky' }, { code: 'LA', name: 'Louisiana' },
    { code: 'ME', name: 'Maine' }, { code: 'MD', name: 'Maryland' }, { code: 'MA', name: 'Massachusetts' },
    { code: 'MI', name: 'Michigan' }, { code: 'MN', name: 'Minnesota' }, { code: 'MS', name: 'Mississippi' },
    { code: 'MO', name: 'Missouri' }, { code: 'MT', name: 'Montana' }, { code: 'NE', name: 'Nebraska' },
    { code: 'NV', name: 'Nevada' }, { code: 'NH', name: 'New Hampshire' }, { code: 'NJ', name: 'New Jersey' },
    { code: 'NM', name: 'New Mexico' }, { code: 'NY', name: 'New York' }, { code: 'NC', name: 'North Carolina' },
    { code: 'ND', name: 'North Dakota' }, { code: 'OH', name: 'Ohio' }, { code: 'OK', name: 'Oklahoma' },
    { code: 'OR', name: 'Oregon' }, { code: 'PA', name: 'Pennsylvania' }, { code: 'RI', name: 'Rhode Island' },
    { code: 'SC', name: 'South Carolina' }, { code: 'SD', name: 'South Dakota' }, { code: 'TN', name: 'Tennessee' },
    { code: 'TX', name: 'Texas' }, { code: 'UT', name: 'Utah' }, { code: 'VT', name: 'Vermont' },
    { code: 'VA', name: 'Virginia' }, { code: 'WA', name: 'Washington' }, { code: 'WV', name: 'West Virginia' },
    { code: 'WI', name: 'Wisconsin' }, { code: 'WY', name: 'Wyoming' }
];

const TRADE_CATEGORIES: { key: TradeCategory; label: string; icon: any }[] = [
    { key: 'all', label: 'All Trades', icon: Layers },
    { key: 'general_hardware', label: 'Hardware & Building', icon: Building2 },
    { key: 'hvac_refrigeration', label: 'HVAC & Refrigeration', icon: Flame },
    { key: 'plumbing_piping', label: 'Plumbing & Piping', icon: Droplet },
    { key: 'electrical_lighting', label: 'Electrical & Wire', icon: Zap },
    { key: 'roofing_siding', label: 'Roofing & Siding', icon: Truck },
    { key: 'paint_coatings', label: 'Paint & Coatings', icon: Paintbrush },
    { key: 'tools_equipment', label: 'Tools & Rentals', icon: Wrench },
    { key: 'facility_maintenance', label: 'Facility MRO', icon: Sparkles },
];

interface Props {
    existingVendors?: Vendor[];
    onVendorImported?: (vendor: Vendor) => void;
    onClose?: () => void;
}

export const TradeProgramsHub: React.FC<Props> = ({ existingVendors = [], onVendorImported, onClose }) => {
    const { user } = useAuth();
    const [country, setCountry] = useState<string>('US');
    const [selectedState, setSelectedState] = useState<string>('');
    const [selectedCategory, setSelectedCategory] = useState<TradeCategory>('all');
    const [searchQuery, setSearchQuery] = useState<string>('');
    const [isSearchingAI, setIsSearchingAI] = useState<boolean>(false);
    const [aiDiscoveredPrograms, setAiDiscoveredPrograms] = useState<TradeProgram[]>([]);
    
    // Quick Copy Profile Drawer state
    const [isCompanyInfoOpen, setIsCompanyInfoOpen] = useState<boolean>(false);
    const [copiedKey, setCopiedKey] = useState<string | null>(null);

    // Link Account Modal
    const [linkingProgram, setLinkingProgram] = useState<TradeProgram | null>(null);
    const [accountNumberToLink, setAccountNumberToLink] = useState<string>('');
    const [isSavingLink, setIsSavingLink] = useState<boolean>(false);

    // Combine static catalog and AI discovered programs
    const allPrograms = useMemo(() => {
        const combined = [...aiDiscoveredPrograms, ...TRADE_PROGRAMS_CATALOG];
        // Deduplicate by ID or name
        const seen = new Set<string>();
        return combined.filter(p => {
            const key = p.supplierName.toLowerCase();
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
        });
    }, [aiDiscoveredPrograms]);

    // Filter programs
    const filteredPrograms = useMemo(() => {
        return allPrograms.filter(prog => {
            // Country filter
            if (country !== 'GLOBAL' && prog.country !== country && prog.country !== 'GLOBAL') {
                return false;
            }

            // State filter
            if (selectedState && prog.stateScope !== 'national') {
                if (Array.isArray(prog.stateScope) && !prog.stateScope.includes(selectedState)) {
                    return false;
                }
            }

            // Category filter
            if (selectedCategory !== 'all' && prog.tradeCategory !== selectedCategory) {
                return false;
            }

            // Text search
            if (searchQuery.trim()) {
                const q = searchQuery.toLowerCase();
                const matchName = prog.supplierName.toLowerCase().includes(q);
                const matchProg = prog.programName.toLowerCase().includes(q);
                const matchTagline = prog.tagline.toLowerCase().includes(q);
                const matchPerks = prog.perks.some(p => p.toLowerCase().includes(q));
                if (!matchName && !matchProg && !matchTagline && !matchPerks) return false;
            }

            return true;
        });
    }, [allPrograms, country, selectedState, selectedCategory, searchQuery]);

    const handleCopy = (text: string, key: string) => {
        navigator.clipboard.writeText(text);
        setCopiedKey(key);
        toast.success(`Copied ${key} to clipboard!`);
        setTimeout(() => setCopiedKey(null), 2000);
    };

    const handleSearchAI = async () => {
        if (!searchQuery.trim() && !selectedState && selectedCategory === 'all') {
            toast.error('Enter a search term or select a State/Trade to search.');
            return;
        }

        setIsSearchingAI(true);
        const toastId = toast.loading('Searching live trade discount programs with AI...');

        try {
            const discoverFn = httpsCallable(functions, 'discoverTradePrograms');
            const result = await discoverFn({
                country,
                state: selectedState,
                tradeCategory: selectedCategory,
                searchQuery: searchQuery.trim()
            });

            const programs = (result.data as any)?.programs as TradeProgram[];

            if (programs && programs.length > 0) {
                setAiDiscoveredPrograms(prev => [...programs, ...prev]);
                toast.success(`Found ${programs.length} regional trade programs!`, { id: toastId });
            } else {
                toast.error('No new programs found. Try broadening your search.', { id: toastId });
            }
        } catch (error: any) {
            console.error('Error discovering trade programs:', error);
            toast.error(`AI Search failed: ${error.message}`, { id: toastId });
        } finally {
            setIsSearchingAI(false);
        }
    };

    // Fast Onboarding Assistant State
    const [enrollingProgram, setEnrollingProgram] = useState<TradeProgram | null>(null);

    const buildPrefilledEnrollmentUrl = (program: TradeProgram) => {
        const orgName = (user as any)?.org_name || (user as any)?.companyName || 'Contractor Services';
        const email = user?.email || '';
        const phone = (user as any)?.phone || '';
        const taxId = (user as any)?.taxId || '';

        try {
            const url = new URL(program.enrollmentUrl);
            url.searchParams.set('company', orgName);
            url.searchParams.set('companyName', orgName);
            url.searchParams.set('businessName', orgName);
            url.searchParams.set('email', email);
            url.searchParams.set('workEmail', email);
            if (phone) url.searchParams.set('phone', phone);
            if (taxId) url.searchParams.set('taxId', taxId);
            url.searchParams.set('utm_source', 'dispatchbox_procurement');
            return url.toString();
        } catch (e) {
            return program.enrollmentUrl;
        }
    };

    const handleStartEnrollment = (program: TradeProgram) => {
        const orgName = (user as any)?.org_name || (user as any)?.companyName || 'Contractor Services';
        const email = user?.email || '';
        const phone = (user as any)?.phone || '';
        const taxId = (user as any)?.taxId || '';

        // Auto copy registration summary to clipboard
        const copySummary = `Company: ${orgName}\nEmail: ${email}\nPhone: ${phone}\nTax ID: ${taxId}`;
        navigator.clipboard.writeText(copySummary).catch(() => {});

        const prefilledUrl = buildPrefilledEnrollmentUrl(program);
        window.open(prefilledUrl, '_blank', 'noopener,noreferrer');

        // Open companion modal to easily link account after completing signup
        setEnrollingProgram(program);
        toast.success(`Opening ${program.supplierName} with your company info pre-filled!`);
    };

    const isAlreadyImported = (supplierName: string) => {
        return existingVendors.some(v => v.name.toLowerCase().trim() === supplierName.toLowerCase().trim());
    };

    const handleImportProgram = async (program: TradeProgram, customAccountNum?: string) => {
        if (!user?.org_id) {
            toast.error('Organization ID not found.');
            return;
        }

        const toastId = toast.loading(`Importing ${program.supplierName}...`);
        try {
            const vendorData = {
                organizationId: user.org_id,
                name: program.supplierName,
                website: program.enrollmentUrl,
                portalUrl: program.portalLoginUrl || program.enrollmentUrl,
                email: 'orders@' + (program.supplierName.toLowerCase().replace(/[^a-z0-9]/g, '') + '.com'),
                phone: '(800) 555-0199',
                accountNumber: customAccountNum || '',
                paymentTerms: program.defaultPaymentTerms || 'Net 30',
                discountCodes: program.discountCodeTemplate || '',
                tradeDiscountPercent: program.typicalDiscountPercent || 10,
                orderInstructions: `Enrolled in ${program.programName}. Reference account on packing slip for discount pricing.`,
                sourcingStrength: program.sourcingStrength || 'general',
                integrationType: program.integrationType || 'email_pdf',
                active: true,
                requiredOrderFields: program.requiredOrderFields || [
                    {
                        id: 'acct_num',
                        key: 'accountNumber',
                        label: `${program.supplierName} Account #`,
                        description: `Mandatory trade account identifier for ${program.programName}`,
                        type: 'text',
                        required: true,
                        defaultValue: ''
                    }
                ],
                createdAt: serverTimestamp(),
                updatedAt: serverTimestamp()
            };

            const docRef = await addDoc(collection(db, 'vendors'), vendorData);
            const savedVendor = { id: docRef.id, ...vendorData } as unknown as Vendor;

            if (onVendorImported) {
                onVendorImported(savedVendor);
            }

            toast.success(`Successfully added ${program.supplierName} with ${program.programName} discounts!`, { id: toastId });
            setLinkingProgram(null);
            setAccountNumberToLink('');
        } catch (error: any) {
            console.error('Error importing vendor program:', error);
            toast.error(`Import failed: ${error.message}`, { id: toastId });
        }
    };

    return (
        <div className="space-y-6">
            {/* Top Banner & Company Info Quick Copier */}
            <div className="bg-gradient-to-r from-blue-900 via-indigo-900 to-slate-900 text-white p-6 rounded-2xl shadow-md border border-blue-800/40 relative overflow-hidden">
                <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div>
                        <div className="flex items-center gap-2 mb-1.5">
                            <span className="bg-blue-500/30 text-blue-200 text-xs font-bold px-2.5 py-0.5 rounded-full border border-blue-400/30 flex items-center gap-1">
                                <Percent className="w-3 h-3" /> Contractor Trade Perks Hub
                            </span>
                            <span className="text-xs text-blue-300 font-medium">National & Regional Directory</span>
                        </div>
                        <h2 className="text-xl md:text-2xl font-black tracking-tight text-white">
                            Supplier Trade Programs & Contractor Discounts
                        </h2>
                        <p className="text-sm text-blue-100/90 mt-1 max-w-2xl">
                            Unlock 5% to 30% volume discounts, dedicated contractor desks, boom delivery, and Net 30/60 billing from top national and local supply houses.
                        </p>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                        <button
                            type="button"
                            onClick={() => setIsCompanyInfoOpen(!isCompanyInfoOpen)}
                            className="inline-flex items-center gap-2 px-4 py-2.5 bg-white text-blue-950 font-bold rounded-xl text-xs shadow-md hover:bg-blue-50 transition-all hover:scale-[1.02]"
                        >
                            <Copy className="w-4 h-4 text-blue-600" />
                            {isCompanyInfoOpen ? 'Hide Business Info' : 'Quick Copy Company Info'}
                        </button>
                    </div>
                </div>

                {/* Quick Copy Business Info Drawer */}
                {isCompanyInfoOpen && (
                    <div className="mt-5 pt-5 border-t border-blue-700/50 grid grid-cols-1 md:grid-cols-4 gap-3 bg-blue-950/70 p-4 rounded-xl text-xs">
                        <div className="p-2.5 bg-blue-900/60 rounded-lg border border-blue-800 flex justify-between items-center">
                            <div>
                                <span className="text-[10px] text-blue-300 uppercase font-bold block">Company Legal Name</span>
                                <span className="font-semibold text-white truncate block">{(user as any)?.org_name || (user as any)?.companyName || 'My Service Company'}</span>
                            </div>
                            <button
                                type="button"
                                onClick={() => handleCopy((user as any)?.org_name || (user as any)?.companyName || 'My Service Company', 'Company Name')}
                                className="p-1.5 hover:bg-blue-800 rounded text-blue-300"
                            >
                                {copiedKey === 'Company Name' ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                            </button>
                        </div>

                        <div className="p-2.5 bg-blue-900/60 rounded-lg border border-blue-800 flex justify-between items-center">
                            <div>
                                <span className="text-[10px] text-blue-300 uppercase font-bold block">Purchaser Email</span>
                                <span className="font-semibold text-white truncate block">{user?.email || 'purchasing@company.com'}</span>
                            </div>
                            <button
                                type="button"
                                onClick={() => handleCopy(user?.email || '', 'Email')}
                                className="p-1.5 hover:bg-blue-800 rounded text-blue-300"
                            >
                                {copiedKey === 'Email' ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                            </button>
                        </div>

                        <div className="p-2.5 bg-blue-900/60 rounded-lg border border-blue-800 flex justify-between items-center">
                            <div>
                                <span className="text-[10px] text-blue-300 uppercase font-bold block">Billing Phone</span>
                                <span className="font-semibold text-white truncate block">{(user as any)?.phone || '(555) 019-2831'}</span>
                            </div>
                            <button
                                type="button"
                                onClick={() => handleCopy((user as any)?.phone || '(555) 019-2831', 'Phone')}
                                className="p-1.5 hover:bg-blue-800 rounded text-blue-300"
                            >
                                {copiedKey === 'Phone' ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                            </button>
                        </div>

                        <div className="p-2.5 bg-blue-900/60 rounded-lg border border-blue-800 flex justify-between items-center">
                            <div>
                                <span className="text-[10px] text-blue-300 uppercase font-bold block">Federal Tax ID / EIN</span>
                                <span className="font-semibold text-white truncate block">{(user as any)?.taxId || 'Ready to enter on form'}</span>
                            </div>
                            <button
                                type="button"
                                onClick={() => handleCopy((user as any)?.taxId || '', 'Tax ID')}
                                className="p-1.5 hover:bg-blue-800 rounded text-blue-300"
                            >
                                {copiedKey === 'Tax ID' ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                            </button>
                        </div>
                    </div>
                )}
            </div>

            {/* Filter & Live Search Toolbar */}
            <div className="bg-white p-4 rounded-2xl border border-gray-200 shadow-sm space-y-3">
                <div className="grid grid-cols-1 md:grid-cols-12 gap-3">
                    {/* Country Selector */}
                    <div className="md:col-span-3">
                        <label className="block text-[11px] font-bold text-gray-500 uppercase tracking-wider mb-1 flex items-center gap-1">
                            <Globe className="w-3.5 h-3.5 text-blue-600" /> Country / Region
                        </label>
                        <select
                            value={country}
                            onChange={(e) => setCountry(e.target.value)}
                            className="w-full px-3 py-2 bg-gray-50 border border-gray-300 rounded-xl text-xs font-semibold focus:ring-2 focus:ring-blue-500 focus:bg-white"
                        >
                            <option value="US">🇺🇸 United States</option>
                            <option value="CA">🇨🇦 Canada</option>
                            <option value="GB">🇬🇧 United Kingdom</option>
                            <option value="AU">🇦🇺 Australia</option>
                            <option value="GLOBAL">🌍 Global / International</option>
                        </select>
                    </div>

                    {/* State / Province Selector */}
                    <div className="md:col-span-3">
                        <label className="block text-[11px] font-bold text-gray-500 uppercase tracking-wider mb-1 flex items-center gap-1">
                            <MapPin className="w-3.5 h-3.5 text-blue-600" /> State / Scope
                        </label>
                        <select
                            value={selectedState}
                            onChange={(e) => setSelectedState(e.target.value)}
                            className="w-full px-3 py-2 bg-gray-50 border border-gray-300 rounded-xl text-xs font-semibold focus:ring-2 focus:ring-blue-500 focus:bg-white"
                        >
                            <option value="">All States / National Programs</option>
                            {US_STATES.map(s => (
                                <option key={s.code} value={s.code}>{s.code} - {s.name}</option>
                            ))}
                        </select>
                    </div>

                    {/* Search Input with AI */}
                    <div className="md:col-span-6">
                        <label className="block text-[11px] font-bold text-gray-500 uppercase tracking-wider mb-1 flex items-center justify-between">
                            <span>Supplier Name or Material Keyword</span>
                            <span className="text-indigo-600 font-semibold flex items-center gap-1">
                                <Sparkles className="w-3 h-3" /> Live Search Grounding
                            </span>
                        </label>
                        <div className="flex gap-2">
                            <div className="relative flex-1">
                                <Search className="w-4 h-4 text-gray-400 absolute left-3 top-2.5" />
                                <input
                                    type="text"
                                    value={searchQuery}
                                    onChange={(e) => setSearchQuery(e.target.value)}
                                    onKeyDown={(e) => e.key === 'Enter' && handleSearchAI()}
                                    placeholder="e.g. Home Depot, Ferguson, electrical wire, HVAC refrigerant..."
                                    className="w-full pl-9 pr-3 py-2 bg-gray-50 border border-gray-300 rounded-xl text-xs focus:ring-2 focus:ring-blue-500 focus:bg-white"
                                />
                            </div>
                            <button
                                type="button"
                                onClick={handleSearchAI}
                                disabled={isSearchingAI}
                                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl text-xs transition-all shadow-xs flex items-center gap-1.5 disabled:opacity-50 shrink-0"
                            >
                                {isSearchingAI ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
                                {isSearchingAI ? 'Searching...' : 'AI Search'}
                            </button>
                        </div>
                    </div>
                </div>

                {/* Trade Category Tabs */}
                <div className="pt-2 border-t border-gray-100 flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none">
                    {TRADE_CATEGORIES.map(cat => {
                        const Icon = cat.icon;
                        const isSelected = selectedCategory === cat.key;
                        return (
                            <button
                                key={cat.key}
                                type="button"
                                onClick={() => setSelectedCategory(cat.key)}
                                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all shrink-0 ${
                                    isSelected
                                        ? 'bg-blue-600 text-white shadow-xs'
                                        : 'bg-gray-100 text-gray-600 hover:bg-gray-200 hover:text-gray-900'
                                }`}
                            >
                                <Icon className="w-3.5 h-3.5" />
                                {cat.label}
                            </button>
                        );
                    })}
                </div>
            </div>

            {/* Program Cards Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                {filteredPrograms.map((prog) => {
                    const alreadyImported = isAlreadyImported(prog.supplierName);
                    return (
                        <div
                            key={prog.id}
                            className="bg-white rounded-2xl border border-gray-200 shadow-sm hover:shadow-md transition-all flex flex-col justify-between overflow-hidden group"
                        >
                            {/* Card Header */}
                            <div className="p-5 space-y-3">
                                <div className="flex items-start justify-between gap-2">
                                    <div className="flex items-center gap-2">
                                        <div className="p-2.5 rounded-xl bg-blue-50 border border-blue-100 text-blue-700 font-black text-sm">
                                            <Building2 className="w-5 h-5" />
                                        </div>
                                        <div>
                                            <h3 className="font-extrabold text-gray-900 text-base leading-tight group-hover:text-blue-600 transition-colors">
                                                {prog.supplierName}
                                            </h3>
                                            <span className="text-xs font-semibold text-blue-700 block">
                                                {prog.programName}
                                            </span>
                                        </div>
                                    </div>

                                    {/* Discount Percent Badge */}
                                    {prog.typicalDiscountPercent && (
                                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-black bg-emerald-100 text-emerald-800 border border-emerald-200 shrink-0">
                                            <Percent className="w-3 h-3" /> Up to {prog.typicalDiscountPercent}% Off
                                        </span>
                                    )}
                                </div>

                                <p className="text-xs font-medium text-gray-600 leading-snug">
                                    {prog.tagline}
                                </p>

                                {/* Badges */}
                                <div className="flex flex-wrap gap-1.5 pt-1">
                                    <span className="text-[10px] font-bold uppercase tracking-wider bg-gray-100 text-gray-700 px-2 py-0.5 rounded-md">
                                        {prog.categoryLabel}
                                    </span>
                                    <span className="text-[10px] font-bold uppercase tracking-wider bg-slate-100 text-slate-700 px-2 py-0.5 rounded-md flex items-center gap-1">
                                        <MapPin className="w-2.5 h-2.5" />
                                        {prog.stateScopeLabel || 'National'}
                                    </span>
                                    {prog.defaultPaymentTerms && (
                                        <span className="text-[10px] font-bold uppercase tracking-wider bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded-md">
                                            {prog.defaultPaymentTerms}
                                        </span>
                                    )}
                                </div>

                                {/* Key Perks */}
                                <div className="space-y-1.5 pt-2 border-t border-gray-100">
                                    {prog.perks.slice(0, 3).map((perk, idx) => (
                                        <div key={idx} className="flex items-start gap-1.5 text-xs text-gray-700">
                                            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0 mt-0.5" />
                                            <span className="line-clamp-1">{perk}</span>
                                        </div>
                                    ))}
                                </div>
                            </div>

                            {/* Card Footer Actions */}
                            <div className="p-4 bg-slate-50/80 border-t border-gray-100 space-y-2">
                                <div className="grid grid-cols-2 gap-2">
                                    {/* Direct Sign-up Link with Automated Prefill & Assistant */}
                                    <button
                                        type="button"
                                        onClick={() => handleStartEnrollment(prog)}
                                        className="inline-flex items-center justify-center gap-1 px-3 py-2 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white rounded-xl text-xs font-bold transition-all shadow-xs"
                                        title="Opens vendor sign-up page with your company info pre-filled"
                                    >
                                        <Sparkles className="w-3.5 h-3.5 text-amber-300" />
                                        <span>Sign Up / Enroll</span>
                                        <ArrowUpRight className="w-3.5 h-3.5" />
                                    </button>

                                    {/* Link Existing or 1-Click Import */}
                                    {alreadyImported ? (
                                        <button
                                            type="button"
                                            disabled
                                            className="inline-flex items-center justify-center gap-1 px-3 py-2 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-xl text-xs font-bold opacity-80 cursor-default"
                                        >
                                            <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
                                            <span>Active in Org</span>
                                        </button>
                                    ) : (
                                        <button
                                            type="button"
                                            onClick={() => setLinkingProgram(prog)}
                                            className="inline-flex items-center justify-center gap-1 px-3 py-2 bg-white hover:bg-gray-100 text-gray-800 border border-gray-300 rounded-xl text-xs font-bold transition-all shadow-xs"
                                        >
                                            <Plus className="w-3.5 h-3.5 text-blue-600" />
                                            <span>Add to Suppliers</span>
                                        </button>
                                    )}
                                </div>

                                {prog.notesForContractor && (
                                    <p className="text-[11px] text-gray-500 italic text-center pt-0.5 truncate">
                                        💡 {prog.notesForContractor}
                                    </p>
                                )}
                            </div>
                        </div>
                    );
                })}
            </div>

            {filteredPrograms.length === 0 && (
                <div className="bg-white p-12 text-center rounded-2xl border border-gray-200 space-y-3">
                    <div className="w-12 h-12 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center mx-auto">
                        <Search className="w-6 h-6" />
                    </div>
                    <h3 className="text-base font-bold text-gray-900">No matching trade discount programs found</h3>
                    <p className="text-xs text-gray-500 max-w-md mx-auto">
                        Try clearing your search filters or click "AI Search" to discover local supply houses in your area.
                    </p>
                    <button
                        type="button"
                        onClick={handleSearchAI}
                        className="px-4 py-2 bg-blue-600 text-white rounded-xl text-xs font-bold hover:bg-blue-700"
                    >
                        Search with AI
                    </button>
                </div>
            )}

            {/* Fast Onboarding Assistant Modal */}
            {enrollingProgram && (
                <div className="fixed inset-0 bg-black/60 backdrop-blur-xs z-50 flex justify-center items-center p-4">
                    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden border border-gray-200 animate-in fade-in zoom-in-95 duration-150">
                        <div className="p-5 border-b border-gray-100 flex items-center justify-between bg-gradient-to-r from-blue-900 to-indigo-900 text-white">
                            <div className="flex items-center gap-3">
                                <div className="p-2 bg-white/10 rounded-xl text-amber-300">
                                    <Sparkles className="w-5 h-5" />
                                </div>
                                <div>
                                    <h3 className="text-base font-black text-white">Enrolling in {enrollingProgram.supplierName}</h3>
                                    <p className="text-xs text-blue-200 font-semibold mt-0.5">{enrollingProgram.programName}</p>
                                </div>
                            </div>
                            <button
                                type="button"
                                onClick={() => setEnrollingProgram(null)}
                                className="text-blue-200 hover:text-white p-1 rounded-lg"
                            >
                                <X className="w-5 h-5" />
                            </button>
                        </div>

                        <div className="p-6 space-y-5">
                            {/* Status Banner */}
                            <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-xl flex items-start gap-3 text-xs text-emerald-900">
                                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                                <div>
                                    <span className="font-bold block text-emerald-950">Pre-filled registration page opened in a new tab!</span>
                                    <p className="text-emerald-800 mt-0.5">
                                        Your company information has been passed to {enrollingProgram.supplierName}. If any field requires manual confirmation on their site, use the quick copy buttons below:
                                    </p>
                                </div>
                            </div>

                            {/* Passed Info Grid with 1-Click Copy */}
                            <div className="space-y-2">
                                <span className="text-[11px] font-bold text-gray-500 uppercase tracking-wider block">
                                    Passed Registration Credentials
                                </span>
                                <div className="grid grid-cols-2 gap-2 text-xs">
                                    <div className="p-2.5 bg-gray-50 rounded-xl border border-gray-200 flex justify-between items-center">
                                        <div className="truncate pr-2">
                                            <span className="text-[10px] text-gray-400 font-bold block uppercase">Company Legal Name</span>
                                            <span className="font-semibold text-gray-900 truncate block">{(user as any)?.org_name || (user as any)?.companyName || 'My Service Company'}</span>
                                        </div>
                                        <button
                                            type="button"
                                            onClick={() => handleCopy((user as any)?.org_name || (user as any)?.companyName || 'My Service Company', 'Company Name')}
                                            className="p-1 text-gray-400 hover:text-blue-600 rounded"
                                            title="Copy Company Name"
                                        >
                                            {copiedKey === 'Company Name' ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                                        </button>
                                    </div>

                                    <div className="p-2.5 bg-gray-50 rounded-xl border border-gray-200 flex justify-between items-center">
                                        <div className="truncate pr-2">
                                            <span className="text-[10px] text-gray-400 font-bold block uppercase">Purchaser Email</span>
                                            <span className="font-semibold text-gray-900 truncate block">{user?.email || ''}</span>
                                        </div>
                                        <button
                                            type="button"
                                            onClick={() => handleCopy(user?.email || '', 'Email')}
                                            className="p-1 text-gray-400 hover:text-blue-600 rounded"
                                            title="Copy Email"
                                        >
                                            {copiedKey === 'Email' ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                                        </button>
                                    </div>

                                    <div className="p-2.5 bg-gray-50 rounded-xl border border-gray-200 flex justify-between items-center">
                                        <div className="truncate pr-2">
                                            <span className="text-[10px] text-gray-400 font-bold block uppercase">Business Phone</span>
                                            <span className="font-semibold text-gray-900 truncate block">{(user as any)?.phone || '(555) 019-2831'}</span>
                                        </div>
                                        <button
                                            type="button"
                                            onClick={() => handleCopy((user as any)?.phone || '(555) 019-2831', 'Phone')}
                                            className="p-1 text-gray-400 hover:text-blue-600 rounded"
                                            title="Copy Phone"
                                        >
                                            {copiedKey === 'Phone' ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                                        </button>
                                    </div>

                                    <div className="p-2.5 bg-gray-50 rounded-xl border border-gray-200 flex justify-between items-center">
                                        <div className="truncate pr-2">
                                            <span className="text-[10px] text-gray-400 font-bold block uppercase">Federal Tax ID / EIN</span>
                                            <span className="font-semibold text-gray-900 truncate block">{(user as any)?.taxId || 'Enter on form'}</span>
                                        </div>
                                        <button
                                            type="button"
                                            onClick={() => handleCopy((user as any)?.taxId || '', 'Tax ID')}
                                            className="p-1 text-gray-400 hover:text-blue-600 rounded"
                                            title="Copy Tax ID"
                                        >
                                            {copiedKey === 'Tax ID' ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                                        </button>
                                    </div>
                                </div>
                            </div>

                            {/* Immediate Account Linker Form */}
                            <form
                                onSubmit={(e) => {
                                    e.preventDefault();
                                    handleImportProgram(enrollingProgram, accountNumberToLink.trim());
                                    setEnrollingProgram(null);
                                }}
                                className="pt-4 border-t border-gray-100 space-y-3"
                            >
                                <div>
                                    <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1">
                                        Received Your Account # or Agreement ID?
                                    </label>
                                    <div className="flex gap-2">
                                        <input
                                            type="text"
                                            value={accountNumberToLink}
                                            onChange={(e) => setAccountNumberToLink(e.target.value)}
                                            placeholder="e.g. ProXtra Phone # or Account ID"
                                            className="w-full px-3.5 py-2 border border-gray-300 rounded-xl text-sm font-mono focus:ring-2 focus:ring-blue-500"
                                        />
                                    </div>
                                    <p className="text-[11px] text-gray-500 mt-1">
                                        Paste your new account number here to immediately attach discount pricing to all future purchase orders.
                                    </p>
                                </div>

                                <div className="flex justify-between items-center pt-2">
                                    <a
                                        href={buildPrefilledEnrollmentUrl(enrollingProgram)}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="text-xs font-semibold text-blue-600 hover:text-blue-800 flex items-center gap-1"
                                    >
                                        <ExternalLink className="w-3.5 h-3.5" /> Re-open Registration Tab
                                    </a>

                                    <div className="flex gap-2">
                                        <button
                                            type="button"
                                            onClick={() => setEnrollingProgram(null)}
                                            className="px-3.5 py-2 text-xs font-bold text-gray-600 hover:bg-gray-100 rounded-xl"
                                        >
                                            Close
                                        </button>
                                        <button
                                            type="submit"
                                            className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold transition-all shadow-sm flex items-center gap-1.5"
                                        >
                                            <ShieldCheck className="w-3.5 h-3.5" />
                                            Save & Connect Supplier
                                        </button>
                                    </div>
                                </div>
                            </form>
                        </div>
                    </div>
                </div>
            )}

            {/* Quick Link Existing Account Modal */}
            {linkingProgram && (
                <div className="fixed inset-0 bg-black/60 backdrop-blur-xs z-50 flex justify-center items-center p-4">
                    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden border border-gray-200 animate-in fade-in zoom-in-95 duration-150">
                        <div className="p-5 border-b border-gray-100 flex items-center justify-between bg-slate-50">
                            <div>
                                <h3 className="text-base font-extrabold text-gray-900">Add {linkingProgram.supplierName}</h3>
                                <p className="text-xs text-blue-600 font-semibold mt-0.5">{linkingProgram.programName}</p>
                            </div>
                            <button
                                type="button"
                                onClick={() => setLinkingProgram(null)}
                                className="text-gray-400 hover:text-gray-600 p-1 rounded-lg"
                            >
                                <X className="w-5 h-5" />
                            </button>
                        </div>

                        <form
                            onSubmit={(e) => {
                                e.preventDefault();
                                handleImportProgram(linkingProgram, accountNumberToLink.trim());
                            }}
                            className="p-5 space-y-4"
                        >
                            <div className="p-3 bg-blue-50/60 rounded-xl border border-blue-100 text-xs text-blue-900 space-y-1">
                                <span className="font-bold block flex items-center gap-1">
                                    <Percent className="w-3.5 h-3.5 text-blue-600" />
                                    Program Benefits Attached:
                                </span>
                                <p className="text-gray-600">
                                    {linkingProgram.discountDescription}
                                </p>
                            </div>

                            <div>
                                <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1">
                                    Your {linkingProgram.supplierName} Account # (Optional)
                                </label>
                                <input
                                    type="text"
                                    value={accountNumberToLink}
                                    onChange={(e) => setAccountNumberToLink(e.target.value)}
                                    placeholder="e.g. VEND-10829 or ProXtra Phone #"
                                    className="w-full px-3.5 py-2 border border-gray-300 rounded-xl text-sm font-mono focus:ring-2 focus:ring-blue-500"
                                />
                                <p className="text-[11px] text-gray-500 mt-1">
                                    If you haven’t enrolled yet, leave this blank and click below. You can add your account number later.
                                </p>
                            </div>

                            <div className="flex justify-end gap-2 pt-3 border-t border-gray-100">
                                <button
                                    type="button"
                                    onClick={() => setLinkingProgram(null)}
                                    className="px-4 py-2 text-xs font-bold text-gray-600 hover:bg-gray-100 rounded-xl transition-colors"
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    disabled={isSavingLink}
                                    className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold transition-all shadow-sm flex items-center gap-1.5"
                                >
                                    {isSavingLink ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
                                    {isSavingLink ? 'Importing...' : 'Add to My Suppliers'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
};
