/**
 * TechnicianProfile - Comprehensive technician profile management
 * Tabbed interface for managing all aspects of a technician's profile
 */

import React, { useState, useEffect, useRef } from 'react';
import { doc, updateDoc, onSnapshot, Timestamp } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { db, storage, functions } from '../firebase';
import { httpsCallable } from 'firebase/functions';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthProvider';
import {
    UserProfile,
    Certification,
    ToolItem,
    ServiceArea,
    TechnicianPaymentInfo,
    TechCommunicationPrefs,
    WeeklyAvailability,
    DayAvailability,
    RateCardMatrix,
    RateCondition,
    AIIdentifiedTool
} from '../types';
import { identifyMaterials, uploadPhotos } from '../lib/aiMaterialsService';
import { MaterialsReviewModal } from '../components/MaterialsReviewModal';
import {
    User, Mail, Phone, MapPin, Save, Wrench, Briefcase, X, Camera,
    Calendar, Clock, DollarSign, Bell, Shield, Car, AlertTriangle,
    Plus, Trash2, Upload, CheckCircle, AlertCircle
} from 'lucide-react';
import toast from 'react-hot-toast';

type TabId = 'personal' | 'scheduling' | 'tools' | 'certifications' | 'payments' | 'communications' | 'service-areas' | 'rate-card';

const TABS: { id: TabId; label: string; icon: React.ReactNode }[] = [
    { id: 'personal', label: 'Personal', icon: <User className="w-4 h-4" /> },
    { id: 'scheduling', label: 'Scheduling', icon: <Calendar className="w-4 h-4" /> },
    { id: 'tools', label: 'Tools', icon: <Wrench className="w-4 h-4" /> },
    { id: 'certifications', label: 'Certifications', icon: <Shield className="w-4 h-4" /> },
    { id: 'payments', label: 'Payments', icon: <DollarSign className="w-4 h-4" /> },
    { id: 'rate-card', label: 'Rate Card', icon: <DollarSign className="w-4 h-4" /> },
    { id: 'communications', label: 'Communications', icon: <Bell className="w-4 h-4" /> },
    { id: 'service-areas', label: 'Service Areas', icon: <MapPin className="w-4 h-4" /> },
];

const DAYS_OF_WEEK = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'] as const;

const DEFAULT_DAY_AVAILABILITY: DayAvailability = {
    available: false,
    startTime: '08:00',
    endTime: '17:00'
};

const DEFAULT_WEEKLY_AVAILABILITY: WeeklyAvailability = {
    sunday: { ...DEFAULT_DAY_AVAILABILITY },
    monday: { ...DEFAULT_DAY_AVAILABILITY, available: true },
    tuesday: { ...DEFAULT_DAY_AVAILABILITY, available: true },
    wednesday: { ...DEFAULT_DAY_AVAILABILITY, available: true },
    thursday: { ...DEFAULT_DAY_AVAILABILITY, available: true },
    friday: { ...DEFAULT_DAY_AVAILABILITY, available: true },
    saturday: { ...DEFAULT_DAY_AVAILABILITY },
};

const DEFAULT_COMMUNICATION_PREFS: TechCommunicationPrefs = {
    preferredMethod: 'push',
    jobAssignments: true,
    scheduleChanges: true,
    customerMessages: true,
    emergencyAlerts: true,
    dailySummary: false,
    weeklyReport: true,
    quietHoursEnabled: true,
    quietHoursStart: '22:00',
    quietHoursEnd: '07:00'
};

export const TechnicianProfile: React.FC = () => {
    console.log('[TechnicianProfile] Component rendering...');
    const { user } = useAuth();
    console.log('[TechnicianProfile] User from auth:', user?.uid, user?.email);
    const [profile, setProfile] = useState<UserProfile | null>(null);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    
    const location = useLocation();
    const navigate = useNavigate();
    
    // Parse query params to set initial tab if needed
    const queryParams = new URLSearchParams(location.search);
    const initialTab = (queryParams.get('tab') as TabId) || 'personal';
    
    const [activeTab, setActiveTab] = useState<TabId>(initialTab);
    const fileInputRef = useRef<HTMLInputElement>(null);

    // Form state - Personal
    const [name, setName] = useState('');
    const [phone, setPhone] = useState('');
    const [bio, setBio] = useState('');
    const [yearsExperience, setYearsExperience] = useState<number>(0);
    const [homeAddress, setHomeAddress] = useState('');
    const [emergencyContact, setEmergencyContact] = useState({ name: '', phone: '', relationship: '' });
    const [vehicleInfo, setVehicleInfo] = useState({ make: '', model: '', year: '', color: '', licensePlate: '' });

    // Skills & Specialties
    const [skills, setSkills] = useState<string[]>([]);
    const [skillInput, setSkillInput] = useState('');

    // Availability
    const [weeklyAvailability, setWeeklyAvailability] = useState<WeeklyAvailability>(DEFAULT_WEEKLY_AVAILABILITY);

    // Tools
    const [toolInventory, setToolInventory] = useState<ToolItem[]>([]);
    const [newTool, setNewTool] = useState<{ name: string, category: ToolItem['category'], condition: ToolItem['condition'], quantity?: number, location?: string }>({ name: '', category: 'hand_tool', condition: 'good', quantity: 1, location: '' });

    // AI Tools State
    const [isUploadingTool, setIsUploadingTool] = useState(false);
    const [showToolReview, setShowToolReview] = useState(false);
    const [identifiedTools, setIdentifiedTools] = useState<AIIdentifiedTool[]>([]);

    // Certifications
    const [certifications, setCertifications] = useState<Certification[]>([]);
    const [licenseNumber, setLicenseNumber] = useState('');
    const [licenseState, setLicenseState] = useState('');

    // Payments
    const [paymentInfo, setPaymentInfo] = useState<Partial<TechnicianPaymentInfo>>({
        paymentMethod: 'direct_deposit',
        w9OnFile: false,
        preferredPaySchedule: 'biweekly'
    });

    // Rate Card
    const [rateCard, setRateCard] = useState<RateCardMatrix>({
        standardHourlyRate: 85,
    });

    // Communications
    const [communicationPrefs, setCommunicationPrefs] = useState<TechCommunicationPrefs>(DEFAULT_COMMUNICATION_PREFS);

    // Service Areas
    const [serviceAreas, setServiceAreas] = useState<ServiceArea[]>([]);
    const [maxTravelDistance, setMaxTravelDistance] = useState<number>(25);
    const [newArea, setNewArea] = useState({ zipCode: '', city: '', state: '', priority: 'primary' as ServiceArea['priority'] });

    // Stripe
    const [isStripeLoading, setIsStripeLoading] = useState(false);
    const [stripeAccountId, setStripeAccountId] = useState<string | null>(null);
    const [stripeChargesEnabled, setStripeChargesEnabled] = useState(false);

    // Subscribe to user profile
    useEffect(() => {
        console.log('[TechnicianProfile] useEffect triggered, user?.uid:', user?.uid);
        if (!user?.uid) {
            console.log('[TechnicianProfile] No user.uid, setting loading to false');
            setLoading(false);
            return;
        }

        console.log('[TechnicianProfile] Subscribing to Firestore for user:', user.uid);
        const unsubscribe = onSnapshot(doc(db, 'users', user.uid), (docSnap) => {
            console.log('[TechnicianProfile] onSnapshot received, exists:', docSnap.exists());
            if (docSnap.exists()) {
                const data = { id: docSnap.id, ...docSnap.data() } as UserProfile;
                setProfile(data);

                // Initialize form state
                setName(data.name || '');
                setPhone(data.phone || '');
                setBio(data.bio || '');
                setYearsExperience(data.yearsExperience || 0);
                setHomeAddress(data.homeLocation?.address || data.address || '');
                setSkills(data.specialties || []);
                setEmergencyContact(data.emergencyContact || { name: '', phone: '', relationship: '' });
                setVehicleInfo({
                    make: data.vehicleInfo?.make || '',
                    model: data.vehicleInfo?.model || '',
                    year: data.vehicleInfo?.year || '',
                    color: data.vehicleInfo?.color || '',
                    licensePlate: data.vehicleInfo?.licensePlate || ''
                });
                setWeeklyAvailability(data.weeklyAvailability || DEFAULT_WEEKLY_AVAILABILITY);
                setToolInventory(data.toolInventory || []);
                setCertifications(data.certifications || []);
                setLicenseNumber(data.licenseNumber || '');
                setLicenseState(data.licenseState || '');
                setPaymentInfo(data.paymentInfo || {
                    paymentMethod: 'direct_deposit',
                    w9OnFile: false,
                    preferredPaySchedule: 'biweekly',
                    providesQuotes: true,
                    doesInspections: false,
                    inspectionCharge: 0
                });
                setRateCard(data.rateCard || { standardHourlyRate: data.paymentInfo?.hourlyRate || 85 });
                setCommunicationPrefs(data.communicationPrefs || DEFAULT_COMMUNICATION_PREFS);
                setServiceAreas(data.serviceAreas || []);
                setMaxTravelDistance(data.maxTravelDistance || 25);
                setStripeAccountId(data.stripeAccountId || null);
                setStripeChargesEnabled(data.stripeChargesEnabled || false);
            }
            setLoading(false);
        });

        return () => unsubscribe();
    }, [user?.uid]);
    
    // Handle Stripe returning URL params
    useEffect(() => {
        const queryParams = new URLSearchParams(location.search);
        if (queryParams.get('stripe_return') === 'true') {
            toast.success('Successfully returned from Stripe setup!');
            // Clean up the URL
            navigate('/tech-profile?tab=payments', { replace: true });
        } else if (queryParams.get('stripe_refresh') === 'true') {
            toast.error('Stripe setup was interrupted. Please try again.');
            navigate('/tech-profile?tab=payments', { replace: true });
        }
    }, [location.search, navigate]);

    const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file || !user?.uid) return;

        try {
            const storageRef = ref(storage, `users/${user.uid}/profile-photo`);
            await uploadBytes(storageRef, file);
            const downloadUrl = await getDownloadURL(storageRef);

            await updateDoc(doc(db, 'users', user.uid), {
                profilePhoto: downloadUrl,
                updatedAt: Timestamp.now()
            });

            toast.success('Profile photo updated!');
        } catch (error) {
            console.error('Error uploading photo:', error);
            toast.error('Failed to upload photo');
        }
    };

    const handleSave = async () => {
        if (!user?.uid) return;

        setSaving(true);

        try {
            const updateData: Partial<UserProfile> = {
                name,
                phone,
                bio,
                yearsExperience,
                homeLocation: { address: homeAddress },
                address: homeAddress,
                specialties: skills,
                emergencyContact,
                vehicleInfo,
                weeklyAvailability,
                toolInventory,
                certifications,
                licenseNumber,
                licenseState,
                paymentInfo: paymentInfo as TechnicianPaymentInfo,
                rateCard,
                communicationPrefs,
                serviceAreas,
                maxTravelDistance,
                updatedAt: Timestamp.now()
            };

            await updateDoc(doc(db, 'users', user.uid), updateData);
            toast.success('Profile saved successfully!');
        } catch (error) {
            console.error('Error saving profile:', error);
            toast.error('Failed to save profile');
        } finally {
            setSaving(false);
        }
    };

    const addSkill = () => {
        if (skillInput.trim() && !skills.includes(skillInput.trim())) {
            setSkills([...skills, skillInput.trim()]);
            setSkillInput('');
        }
    };

    const addTool = () => {
        if (newTool.name.trim()) {
            setToolInventory([
                ...toolInventory,
                { ...newTool, id: Date.now().toString(), quantity: newTool.quantity || 1, location: newTool.location || '' }
            ]);
            setNewTool({ name: '', category: 'hand_tool', condition: 'good', quantity: 1, location: '' });
        }
    };

    const handleToolPhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const files = Array.from(e.target.files || []);
        if (files.length === 0 || !user?.uid) return;

        setIsUploadingTool(true);
        try {
            const imageUrls = await uploadPhotos(files, user.uid, 'tools');
            const identified = await identifyMaterials(imageUrls, user.uid, 'tools');
            setIdentifiedTools(identified as AIIdentifiedTool[]);
            setShowToolReview(true);
        } catch (error) {
            console.error('Error identifying tools:', error);
            toast.error('Failed to identify tools from photos');
        } finally {
            setIsUploadingTool(false);
            if (e.target) e.target.value = '';
        }
    };

    const handleSaveIdentifiedTools = async (items: any[]) => {
        const newTools: ToolItem[] = items.map(aiTool => ({
            id: Date.now().toString() + Math.random().toString(36).substring(2, 7),
            name: aiTool.name,
            category: aiTool.category,
            condition: aiTool.condition,
            quantity: aiTool.quantity || 1,
            location: aiTool.location || '',
            purchaseDate: Timestamp.now(),
            notes: aiTool.notes || `Identified via AI (Confidence: ${aiTool.confidence}%)`
        }));

        setToolInventory(prev => [...newTools, ...prev]);
        toast.success(`Added ${items.length} tools to inventory`);
    };

    const addServiceArea = () => {
        if (newArea.zipCode.trim() && newArea.city.trim()) {
            setServiceAreas([
                ...serviceAreas,
                { ...newArea, id: Date.now().toString(), state: newArea.state || 'HI' }
            ]);
            setNewArea({ zipCode: '', city: '', state: '', priority: 'primary' });
        }
    };

    const addCertification = () => {
        setCertifications([
            ...certifications,
            {
                id: Date.now().toString(),
                name: '',
                issuer: '',
                dateObtained: Timestamp.now(),
                verified: false
            }
        ]);
    };

    const updateDayAvailability = (day: keyof WeeklyAvailability, field: keyof DayAvailability, value: any) => {
        if (day === 'effectiveFrom' || day === 'effectiveUntil') return;
        setWeeklyAvailability({
            ...weeklyAvailability,
            [day]: {
                ...weeklyAvailability[day],
                [field]: value
            }
        });
    };

    const handleConnectStripe = async () => {
        try {
            setIsStripeLoading(true);
            const createConnectAccount = httpsCallable(functions, 'createStripeConnectAccount');
            const result = await createConnectAccount();
            const url = (result.data as any).url;
            if (url) {
                window.location.href = url;
            }
        } catch (error: any) {
            console.error('Error connecting Stripe:', error);
            toast.error(error.message || 'Failed to initialize Stripe connection.');
            setIsStripeLoading(false);
        }
    };

    const handleOpenStripeDashboard = async () => {
        try {
            setIsStripeLoading(true);
            const getDashboardUrl = httpsCallable(functions, 'getStripeConnectDashboardUrl');
            const result = await getDashboardUrl();
            const url = (result.data as any).url;
            if (url) {
                window.location.href = url;
            }
        } catch (error: any) {
            console.error('Error opening dashboard:', error);
            toast.error(error.message || 'Failed to open Stripe dashboard.');
            setIsStripeLoading(false);
        }
    };

    if (loading) {
        return (
            <div className="min-h-screen bg-gray-50 flex items-center justify-center">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
            </div>
        );
    }

    if (!profile) {
        return (
            <div className="min-h-screen bg-gray-50 flex items-center justify-center">
                <div className="text-gray-500">Profile not found</div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-gray-50 py-8">
            <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
                {/* Header */}
                <div className="bg-white rounded-xl shadow-sm border overflow-hidden mb-6">
                    <div className="bg-gradient-to-r from-blue-600 to-amber-600 px-6 py-8">
                        <div className="flex items-center gap-6">
                            {/* Profile Photo */}
                            <div className="relative">
                                <div className="w-24 h-24 rounded-full bg-white/20 flex items-center justify-center overflow-hidden">
                                    {profile.profilePhoto ? (
                                        <img src={profile.profilePhoto} alt="Profile" className="w-full h-full object-cover" />
                                    ) : (
                                        <User className="w-12 h-12 text-white/80" />
                                    )}
                                </div>
                                <button
                                    onClick={() => fileInputRef.current?.click()}
                                    className="absolute bottom-0 right-0 bg-white rounded-full p-2 shadow-lg hover:bg-gray-50"
                                >
                                    <Camera className="w-4 h-4 text-gray-600" />
                                </button>
                                <input
                                    ref={fileInputRef}
                                    type="file"
                                    accept="image/*"
                                    onChange={handlePhotoUpload}
                                    className="hidden"
                                />
                            </div>

                            <div className="flex-1">
                                <h1 className="text-2xl font-bold text-white">{profile.name}</h1>
                                <div className="flex items-center gap-4 mt-2 text-white/80 text-sm">
                                    <span className="flex items-center gap-1">
                                        <Mail className="w-4 h-4" /> {profile.email}
                                    </span>
                                    {phone && (
                                        <span className="flex items-center gap-1">
                                            <Phone className="w-4 h-4" /> {phone}
                                        </span>
                                    )}
                                </div>
                                <div className="flex gap-2 mt-3">
                                    <span className={`px-3 py-1 rounded-full text-xs font-medium ${profile.techType === 'solopreneur'
                                        ? 'bg-amber-200 text-amber-800'
                                        : 'bg-green-200 text-green-800'
                                        }`}>
                                        {profile.techType === 'solopreneur' ? 'Contractor' : 'Employee'}
                                    </span>
                                    {profile.backgroundCheckStatus === 'verified' && (
                                        <span className="px-3 py-1 rounded-full text-xs font-medium bg-green-200 text-green-800 flex items-center gap-1">
                                            <CheckCircle className="w-3 h-3" /> Verified
                                        </span>
                                    )}
                                </div>
                            </div>

                            <button
                                onClick={handleSave}
                                disabled={saving}
                                className="px-6 py-3 bg-white text-blue-600 font-semibold rounded-lg hover:bg-blue-50 disabled:opacity-50 flex items-center gap-2"
                            >
                                {saving ? 'Saving...' : <><Save className="w-5 h-5" /> Save All</>}
                            </button>
                        </div>
                    </div>

                    {/* Tab Navigation */}
                    <div className="border-b">
                        <div className="flex overflow-x-auto">
                            {TABS.filter(tab => !(tab.id === 'tools' && profile.techType === 'solopreneur')).map((tab) => (
                                <button
                                    key={tab.id}
                                    onClick={() => setActiveTab(tab.id)}
                                    className={`flex items-center gap-2 px-6 py-4 text-sm font-medium whitespace-nowrap border-b-2 transition ${activeTab === tab.id
                                        ? 'border-blue-600 text-blue-600'
                                        : 'border-transparent text-gray-500 hover:text-gray-700'
                                        }`}
                                >
                                    {tab.icon}
                                    {tab.label}
                                </button>
                            ))}
                        </div>
                    </div>
                </div>

                {/* Tab Content */}
                <div className="bg-white rounded-xl shadow-sm border p-6">
                    {/* Personal Tab */}
                    {activeTab === 'personal' && (
                        <div className="space-y-6">
                            <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                                <User className="w-5 h-5" /> Personal Information
                            </h2>

                            <div className="grid md:grid-cols-2 gap-6">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Full Name</label>
                                    <input
                                        type="text"
                                        value={name}
                                        onChange={(e) => setName(e.target.value)}
                                        className="w-full border border-gray-300 rounded-lg p-3 focus:ring-2 focus:ring-blue-500"
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Phone</label>
                                    <input
                                        type="tel"
                                        value={phone}
                                        onChange={(e) => setPhone(e.target.value)}
                                        className="w-full border border-gray-300 rounded-lg p-3 focus:ring-2 focus:ring-blue-500"
                                        placeholder="808-555-0123"
                                    />
                                </div>
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Bio</label>
                                <textarea
                                    value={bio}
                                    onChange={(e) => setBio(e.target.value)}
                                    rows={3}
                                    className="w-full border border-gray-300 rounded-lg p-3 focus:ring-2 focus:ring-blue-500"
                                    placeholder="Brief professional background..."
                                />
                            </div>

                            <div className="grid md:grid-cols-2 gap-6">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Years Experience</label>
                                    <input
                                        type="number"
                                        value={yearsExperience}
                                        onChange={(e) => setYearsExperience(parseInt(e.target.value) || 0)}
                                        min={0}
                                        className="w-full border border-gray-300 rounded-lg p-3 focus:ring-2 focus:ring-blue-500"
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Home Address</label>
                                    <input
                                        type="text"
                                        value={homeAddress}
                                        onChange={(e) => setHomeAddress(e.target.value)}
                                        className="w-full border border-gray-300 rounded-lg p-3 focus:ring-2 focus:ring-blue-500"
                                        placeholder="123 Main St, Honolulu, HI"
                                    />
                                </div>
                            </div>

                            {/* Skills */}
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-2">
                                    <Briefcase className="inline w-4 h-4 mr-1" /> Skills & Specialties
                                </label>
                                <div className="flex flex-wrap gap-2 mb-2">
                                    {skills.map((skill) => (
                                        <span key={skill} className="inline-flex items-center px-3 py-1 rounded-full text-sm bg-blue-100 text-blue-800">
                                            {skill}
                                            <button onClick={() => setSkills(skills.filter(s => s !== skill))} className="ml-2">
                                                <X className="w-3 h-3" />
                                            </button>
                                        </span>
                                    ))}
                                </div>
                                <div className="flex gap-2">
                                    <input
                                        type="text"
                                        value={skillInput}
                                        onChange={(e) => setSkillInput(e.target.value)}
                                        onKeyPress={(e) => e.key === 'Enter' && (e.preventDefault(), addSkill())}
                                        className="flex-1 border border-gray-300 rounded-lg p-2"
                                        placeholder="Add skill..."
                                    />
                                    <button onClick={addSkill} className="px-4 py-2 bg-blue-600 text-white rounded-lg">
                                        <Plus className="w-5 h-5" />
                                    </button>
                                </div>
                            </div>

                            {/* Emergency Contact */}
                            <div className="border-t pt-6">
                                <h3 className="text-md font-semibold text-gray-900 mb-4 flex items-center gap-2">
                                    <AlertTriangle className="w-5 h-5 text-orange-500" /> Emergency Contact
                                </h3>
                                <div className="grid md:grid-cols-3 gap-4">
                                    <input
                                        type="text"
                                        value={emergencyContact.name}
                                        onChange={(e) => setEmergencyContact({ ...emergencyContact, name: e.target.value })}
                                        placeholder="Name"
                                        className="border border-gray-300 rounded-lg p-3"
                                    />
                                    <input
                                        type="tel"
                                        value={emergencyContact.phone}
                                        onChange={(e) => setEmergencyContact({ ...emergencyContact, phone: e.target.value })}
                                        placeholder="Phone"
                                        className="border border-gray-300 rounded-lg p-3"
                                    />
                                    <input
                                        type="text"
                                        value={emergencyContact.relationship}
                                        onChange={(e) => setEmergencyContact({ ...emergencyContact, relationship: e.target.value })}
                                        placeholder="Relationship"
                                        className="border border-gray-300 rounded-lg p-3"
                                    />
                                </div>
                            </div>

                            {/* Vehicle Info */}
                            <div className="border-t pt-6">
                                <h3 className="text-md font-semibold text-gray-900 mb-4 flex items-center gap-2">
                                    <Car className="w-5 h-5" /> Vehicle Information
                                </h3>
                                <div className="grid md:grid-cols-3 gap-4">
                                    <input
                                        type="text"
                                        value={vehicleInfo.make}
                                        onChange={(e) => setVehicleInfo({ ...vehicleInfo, make: e.target.value })}
                                        placeholder="Make (e.g., Toyota)"
                                        className="border border-gray-300 rounded-lg p-3"
                                    />
                                    <input
                                        type="text"
                                        value={vehicleInfo.model}
                                        onChange={(e) => setVehicleInfo({ ...vehicleInfo, model: e.target.value })}
                                        placeholder="Model (e.g., Tacoma)"
                                        className="border border-gray-300 rounded-lg p-3"
                                    />
                                    <input
                                        type="text"
                                        value={vehicleInfo.year}
                                        onChange={(e) => setVehicleInfo({ ...vehicleInfo, year: e.target.value })}
                                        placeholder="Year"
                                        className="border border-gray-300 rounded-lg p-3"
                                    />
                                    <input
                                        type="text"
                                        value={vehicleInfo.color}
                                        onChange={(e) => setVehicleInfo({ ...vehicleInfo, color: e.target.value })}
                                        placeholder="Color"
                                        className="border border-gray-300 rounded-lg p-3"
                                    />
                                    <input
                                        type="text"
                                        value={vehicleInfo.licensePlate}
                                        onChange={(e) => setVehicleInfo({ ...vehicleInfo, licensePlate: e.target.value })}
                                        placeholder="License Plate"
                                        className="border border-gray-300 rounded-lg p-3 md:col-span-2"
                                    />
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Scheduling Tab */}
                    {activeTab === 'scheduling' && (
                        <div className="space-y-6">
                            <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                                <Calendar className="w-5 h-5" /> Weekly Availability
                            </h2>

                            <div className="space-y-4">
                                {DAYS_OF_WEEK.map((day) => (
                                    <div key={day} className={`flex items-center gap-4 p-4 rounded-lg border ${weeklyAvailability[day].available
                                        ? 'bg-green-50 border-green-200'
                                        : 'bg-gray-50 border-gray-200'
                                        }`}>
                                        <label className="flex items-center gap-3 min-w-[150px]">
                                            <input
                                                type="checkbox"
                                                checked={weeklyAvailability[day].available}
                                                onChange={(e) => updateDayAvailability(day, 'available', e.target.checked)}
                                                className="w-5 h-5 rounded text-blue-600"
                                            />
                                            <span className="font-medium capitalize">{day}</span>
                                        </label>

                                        {weeklyAvailability[day].available && (
                                            <>
                                                <div className="flex items-center gap-2">
                                                    <Clock className="w-4 h-4 text-gray-400" />
                                                    <input
                                                        type="time"
                                                        value={weeklyAvailability[day].startTime || '08:00'}
                                                        onChange={(e) => updateDayAvailability(day, 'startTime', e.target.value)}
                                                        className="border border-gray-300 rounded p-2"
                                                    />
                                                    <span>to</span>
                                                    <input
                                                        type="time"
                                                        value={weeklyAvailability[day].endTime || '17:00'}
                                                        onChange={(e) => updateDayAvailability(day, 'endTime', e.target.value)}
                                                        className="border border-gray-300 rounded p-2"
                                                    />
                                                </div>
                                                <input
                                                    type="text"
                                                    value={weeklyAvailability[day].note || ''}
                                                    onChange={(e) => updateDayAvailability(day, 'note', e.target.value)}
                                                    placeholder="Notes (optional)"
                                                    className="flex-1 border border-gray-300 rounded p-2"
                                                />
                                            </>
                                        )}
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Tools Tab */}
                    {activeTab === 'tools' && profile.techType !== 'solopreneur' && (
                        <div className="space-y-6">
                            <div className="flex justify-between items-center">
                                <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                                    <Wrench className="w-5 h-5" /> Tool Inventory
                                </h2>
                                <div>
                                    <input
                                        type="file"
                                        id="tool-photo-upload"
                                        accept="image/*"
                                        multiple
                                        className="hidden"
                                        onChange={handleToolPhotoUpload}
                                        disabled={isUploadingTool}
                                    />
                                    <label
                                        htmlFor="tool-photo-upload"
                                        className={`cursor-pointer flex items-center gap-2 px-4 py-2 bg-blue-50 text-blue-600 rounded-lg font-medium hover:bg-blue-100 transition ${isUploadingTool ? 'opacity-50 cursor-not-allowed' : ''}`}
                                    >
                                        {isUploadingTool ? (
                                            <div className="w-5 h-5 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
                                        ) : (
                                            <Camera className="w-5 h-5" />
                                        )}
                                        {isUploadingTool ? 'Analyzing...' : 'AI Photo Upload'}
                                    </label>
                                </div>
                            </div>

                            {/* Add Tool */}
                            <div className="flex gap-3 p-4 bg-gray-50 rounded-lg">
                                <input
                                    type="text"
                                    value={newTool.name}
                                    onChange={(e) => setNewTool({ ...newTool, name: e.target.value })}
                                    placeholder="Tool name"
                                    className="flex-1 border border-gray-300 rounded-lg p-2"
                                />
                                <select
                                    value={newTool.category}
                                    onChange={(e) => setNewTool({ ...newTool, category: e.target.value as ToolItem['category'] })}
                                    className="border border-gray-300 rounded-lg p-2"
                                >
                                    <option value="hand_tool">Hand Tool</option>
                                    <option value="power_tool">Power Tool</option>
                                    <option value="diagnostic">Diagnostic</option>
                                    <option value="safety">Safety</option>
                                    <option value="specialized">Specialized</option>
                                    <option value="other">Other</option>
                                </select>
                                <select
                                    value={newTool.condition}
                                    onChange={(e) => setNewTool({ ...newTool, condition: e.target.value as ToolItem['condition'] })}
                                    className="border border-gray-300 rounded-lg p-2"
                                >
                                    <option value="excellent">Excellent</option>
                                    <option value="good">Good</option>
                                    <option value="fair">Fair</option>
                                    <option value="needs_replacement">Needs Replacement</option>
                                </select>
                                <button onClick={addTool} className="px-4 py-2 bg-blue-600 text-white rounded-lg">
                                    <Plus className="w-5 h-5" />
                                </button>
                            </div>

                            {/* Tool List */}
                            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
                                {toolInventory.map((tool) => (
                                    <div key={tool.id} className="border rounded-lg p-4">
                                        <div className="flex justify-between items-start mb-2">
                                            <h4 className="font-medium text-gray-900">{tool.name}</h4>
                                            <button
                                                onClick={() => setToolInventory(toolInventory.filter(t => t.id !== tool.id))}
                                                className="text-red-500 hover:text-red-700"
                                            >
                                                <Trash2 className="w-4 h-4" />
                                            </button>
                                        </div>
                                        <div className="flex gap-2 text-sm">
                                            <span className="px-2 py-1 bg-gray-100 rounded text-gray-600">
                                                {tool.category.replace('_', ' ')}
                                            </span>
                                            <span className={`px-2 py-1 rounded ${tool.condition === 'excellent' ? 'bg-green-100 text-green-700' :
                                                tool.condition === 'good' ? 'bg-blue-100 text-blue-700' :
                                                    tool.condition === 'fair' ? 'bg-yellow-100 text-yellow-700' :
                                                        'bg-red-100 text-red-700'
                                                }`}>
                                                {tool.condition.replace('_', ' ')}
                                            </span>
                                        </div>
                                    </div>
                                ))}
                            </div>

                            {toolInventory.length === 0 && (
                                <p className="text-gray-500 text-center py-8">No tools added yet. Add your first tool above.</p>
                            )}
                        </div>
                    )}

                    {/* Certifications Tab */}
                    {activeTab === 'certifications' && (
                        <div className="space-y-6">
                            <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                                <Shield className="w-5 h-5" /> Certifications & Licenses
                            </h2>

                            {/* License Info */}
                            <div className="grid md:grid-cols-2 gap-4 p-4 bg-gray-50 rounded-lg">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">License Number</label>
                                    <input
                                        type="text"
                                        value={licenseNumber}
                                        onChange={(e) => setLicenseNumber(e.target.value)}
                                        className="w-full border border-gray-300 rounded-lg p-3"
                                        placeholder="e.g., CONT-12345"
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">License State</label>
                                    <input
                                        type="text"
                                        value={licenseState}
                                        onChange={(e) => setLicenseState(e.target.value)}
                                        className="w-full border border-gray-300 rounded-lg p-3"
                                        placeholder="e.g., HI"
                                    />
                                </div>
                            </div>

                            {/* Certifications List */}
                            <div className="space-y-4">
                                {certifications.map((cert, index) => (
                                    <div key={cert.id} className="border rounded-lg p-4">
                                        <div className="flex justify-between items-start mb-4">
                                            <h4 className="font-medium">Certification #{index + 1}</h4>
                                            <button
                                                onClick={() => setCertifications(certifications.filter(c => c.id !== cert.id))}
                                                className="text-red-500 hover:text-red-700"
                                            >
                                                <Trash2 className="w-4 h-4" />
                                            </button>
                                        </div>
                                        <div className="grid md:grid-cols-2 gap-4">
                                            <input
                                                type="text"
                                                value={cert.name}
                                                onChange={(e) => setCertifications(certifications.map(c =>
                                                    c.id === cert.id ? { ...c, name: e.target.value } : c
                                                ))}
                                                placeholder="Certification Name"
                                                className="border border-gray-300 rounded-lg p-2"
                                            />
                                            <input
                                                type="text"
                                                value={cert.issuer}
                                                onChange={(e) => setCertifications(certifications.map(c =>
                                                    c.id === cert.id ? { ...c, issuer: e.target.value } : c
                                                ))}
                                                placeholder="Issuing Organization"
                                                className="border border-gray-300 rounded-lg p-2"
                                            />
                                        </div>
                                    </div>
                                ))}
                            </div>

                            <button
                                onClick={addCertification}
                                className="flex items-center gap-2 px-4 py-2 border border-dashed border-gray-300 rounded-lg text-gray-600 hover:border-blue-500 hover:text-blue-600"
                            >
                                <Plus className="w-5 h-5" /> Add Certification
                            </button>
                        </div>
                    )}

                    {/* Payments Tab */}
                    {activeTab === 'payments' && (
                        <div className="space-y-6">
                            <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                                <DollarSign className="w-5 h-5" /> Payment Information
                            </h2>

                            <div className="grid md:grid-cols-2 gap-6">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Payment Method</label>
                                    <select
                                        value={paymentInfo.paymentMethod}
                                        onChange={(e) => setPaymentInfo({ ...paymentInfo, paymentMethod: e.target.value as TechnicianPaymentInfo['paymentMethod'] })}
                                        className="w-full border border-gray-300 rounded-lg p-3"
                                    >
                                        <option value="direct_deposit">Direct Deposit</option>
                                        <option value="check">Check</option>
                                        <option value="paypal">PayPal</option>
                                        <option value="venmo">Venmo</option>
                                        <option value="zelle">Zelle</option>
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Pay Schedule</label>
                                    <select
                                        value={paymentInfo.preferredPaySchedule}
                                        onChange={(e) => setPaymentInfo({ ...paymentInfo, preferredPaySchedule: e.target.value as TechnicianPaymentInfo['preferredPaySchedule'] })}
                                        className="w-full border border-gray-300 rounded-lg p-3"
                                    >
                                        <option value="weekly">Weekly</option>
                                        <option value="biweekly">Bi-Weekly</option>
                                        <option value="monthly">Monthly</option>
                                    </select>
                                </div>
                            </div>

                            {paymentInfo.paymentMethod === 'direct_deposit' && (
                                <div className="mt-6 border border-gray-200 rounded-lg p-6 bg-gray-50 flex items-center justify-between">
                                    <div>
                                        <h3 className="text-lg font-medium text-gray-900 mb-1">Stripe Direct Deposit</h3>
                                        <p className="text-sm text-gray-600 mb-4 max-w-lg">
                                            We partner with Stripe to securely transfer funds to your bank account.
                                            You will be directed to Stripe to verify your identity and link your bank account.
                                        </p>
                                        
                                        {!stripeAccountId && (
                                            <button
                                                onClick={handleConnectStripe}
                                                disabled={isStripeLoading}
                                                className="px-4 py-2 bg-[#635BFF] text-white font-medium rounded-lg hover:bg-[#4A44D4] transition disabled:opacity-50"
                                            >
                                                {isStripeLoading ? 'Loading...' : 'Connect Bank Account'}
                                            </button>
                                        )}
                                        
                                        {stripeAccountId && !stripeChargesEnabled && (
                                            <div className="space-y-3">
                                                <div className="flex items-center gap-2 text-amber-600 bg-amber-50 px-3 py-2 rounded-lg inline-flex">
                                                    <AlertCircle className="w-5 h-5" />
                                                    <span className="font-medium">Action Required: Complete Onboarding</span>
                                                </div>
                                                <button
                                                    onClick={handleConnectStripe}
                                                    disabled={isStripeLoading}
                                                    className="block px-4 py-2 bg-[#635BFF] text-white font-medium rounded-lg hover:bg-[#4A44D4] transition disabled:opacity-50"
                                                >
                                                    {isStripeLoading ? 'Loading...' : 'Resume Verification'}
                                                </button>
                                            </div>
                                        )}
                                        
                                        {stripeAccountId && stripeChargesEnabled && (
                                            <div className="space-y-3">
                                                <div className="flex items-center gap-2 text-green-700 bg-green-50 px-3 py-2 rounded-lg inline-flex">
                                                    <CheckCircle className="w-5 h-5" />
                                                    <span className="font-medium">Bank Connected & Ready for Payouts</span>
                                                </div>
                                                <button
                                                    onClick={handleOpenStripeDashboard}
                                                    disabled={isStripeLoading}
                                                    className="block px-4 py-2 border border-gray-300 text-gray-700 font-medium rounded-lg hover:bg-gray-100 transition disabled:opacity-50"
                                                >
                                                    {isStripeLoading ? 'Loading...' : 'Manage Bank & Tax Info'}
                                                </button>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            )}

                            {/* Rates */}
                            <div className="border-t pt-6">
                                <h3 className="font-medium text-gray-900 mb-4">Rates</h3>
                                <div className="grid md:grid-cols-3 gap-4">
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1">Hourly Rate</label>
                                        <div className="relative">
                                            <span className="absolute left-3 top-3 text-gray-500">$</span>
                                            <input
                                                type="number"
                                                value={paymentInfo.hourlyRate || ''}
                                                onChange={(e) => setPaymentInfo({ ...paymentInfo, hourlyRate: parseFloat(e.target.value) })}
                                                className="w-full border border-gray-300 rounded-lg p-3 pl-8"
                                            />
                                        </div>
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1">Overtime Rate</label>
                                        <div className="relative">
                                            <span className="absolute left-3 top-3 text-gray-500">$</span>
                                            <input
                                                type="number"
                                                value={paymentInfo.overtimeRate || ''}
                                                onChange={(e) => setPaymentInfo({ ...paymentInfo, overtimeRate: parseFloat(e.target.value) })}
                                                className="w-full border border-gray-300 rounded-lg p-3 pl-8"
                                            />
                                        </div>
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1">Callout Fee</label>
                                        <div className="relative">
                                            <span className="absolute left-3 top-3 text-gray-500">$</span>
                                            <input
                                                type="number"
                                                value={paymentInfo.calloutFee || ''}
                                                onChange={(e) => setPaymentInfo({ ...paymentInfo, calloutFee: parseFloat(e.target.value) })}
                                                className="w-full border border-gray-300 rounded-lg p-3 pl-8"
                                            />
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* Services Provided */}
                            <div className="border-t pt-6">
                                <h3 className="font-medium text-gray-900 mb-4">Services Provided</h3>
                                <div className="space-y-4">
                                    <label className="flex items-center gap-3">
                                        <input
                                            type="checkbox"
                                            checked={paymentInfo.providesQuotes ?? true}
                                            onChange={(e) => setPaymentInfo({ ...paymentInfo, providesQuotes: e.target.checked })}
                                            className="w-5 h-5 rounded text-blue-600"
                                        />
                                        <span className="font-medium">Provides Quoting Service</span>
                                    </label>

                                    <div className="space-y-2">
                                        <label className="flex items-center gap-3">
                                            <input
                                                type="checkbox"
                                                checked={paymentInfo.doesInspections ?? false}
                                                onChange={(e) => setPaymentInfo({ ...paymentInfo, doesInspections: e.target.checked })}
                                                className="w-5 h-5 rounded text-blue-600"
                                            />
                                            <span className="font-medium">Performs Inspections</span>
                                        </label>

                                        {(paymentInfo.doesInspections) && (
                                            <div className="ml-8 flex items-center gap-2">
                                                <label className="text-sm font-medium text-gray-700">Inspection Charge:</label>
                                                <div className="relative w-32">
                                                    <span className="absolute left-3 top-2 text-gray-500">$</span>
                                                    <input
                                                        type="number"
                                                        value={paymentInfo.inspectionCharge || ''}
                                                        onChange={(e) => setPaymentInfo({ ...paymentInfo, inspectionCharge: parseFloat(e.target.value) || 0 })}
                                                        className="w-full border border-gray-300 rounded-lg p-2 pl-8 text-sm"
                                                        placeholder="0.00"
                                                    />
                                                </div>
                                                <span className="text-xs text-gray-500">(Leave 0 if free)</span>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>

                            {/* W-9 Status */}
                            <div className="flex items-center gap-4 p-4 bg-gray-50 rounded-lg">
                                <label className="flex items-center gap-3">
                                    <input
                                        type="checkbox"
                                        checked={paymentInfo.w9OnFile}
                                        onChange={(e) => setPaymentInfo({ ...paymentInfo, w9OnFile: e.target.checked })}
                                        className="w-5 h-5 rounded text-blue-600"
                                    />
                                    <span className="font-medium">W-9 on file</span>
                                </label>
                                {!paymentInfo.w9OnFile && (
                                    <span className="text-sm text-orange-600 flex items-center gap-1">
                                        <AlertCircle className="w-4 h-4" /> Required for payments
                                    </span>
                                )}
                            </div>
                        </div>
                    )}

                    {/* Communications Tab */}
                    {activeTab === 'communications' && (
                        <div className="space-y-6">
                            <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                                <Bell className="w-5 h-5" /> Communication Preferences
                            </h2>

                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-2">Preferred Contact Method</label>
                                <div className="flex gap-4">
                                    {(['sms', 'email', 'push', 'call'] as const).map((method) => (
                                        <label key={method} className="flex items-center gap-2">
                                            <input
                                                type="radio"
                                                checked={communicationPrefs.preferredMethod === method}
                                                onChange={() => setCommunicationPrefs({ ...communicationPrefs, preferredMethod: method })}
                                                className="w-4 h-4 text-blue-600"
                                            />
                                            <span className="uppercase text-sm">{method}</span>
                                        </label>
                                    ))}
                                </div>
                            </div>

                            <div className="grid md:grid-cols-2 gap-4">
                                {[
                                    { key: 'jobAssignments', label: 'Job Assignments' },
                                    { key: 'scheduleChanges', label: 'Schedule Changes' },
                                    { key: 'customerMessages', label: 'Customer Messages' },
                                    { key: 'emergencyAlerts', label: 'Emergency Alerts' },
                                    { key: 'dailySummary', label: 'Daily Summary' },
                                    { key: 'weeklyReport', label: 'Weekly Report' },
                                ].map(({ key, label }) => (
                                    <label key={key} className="flex items-center gap-3 p-3 border rounded-lg">
                                        <input
                                            type="checkbox"
                                            checked={communicationPrefs[key as keyof TechCommunicationPrefs] as boolean}
                                            onChange={(e) => setCommunicationPrefs({
                                                ...communicationPrefs,
                                                [key]: e.target.checked
                                            })}
                                            className="w-5 h-5 rounded text-blue-600"
                                        />
                                        <span>{label}</span>
                                    </label>
                                ))}
                            </div>

                            {/* Quiet Hours */}
                            <div className="border-t pt-6">
                                <h3 className="font-medium text-gray-900 mb-4">Quiet Hours</h3>
                                <label className="flex items-center gap-3 mb-4">
                                    <input
                                        type="checkbox"
                                        checked={communicationPrefs.quietHoursEnabled}
                                        onChange={(e) => setCommunicationPrefs({ ...communicationPrefs, quietHoursEnabled: e.target.checked })}
                                        className="w-5 h-5 rounded text-blue-600"
                                    />
                                    <span>Enable Quiet Hours (no non-emergency notifications)</span>
                                </label>
                                {communicationPrefs.quietHoursEnabled && (
                                    <div className="flex items-center gap-4 ml-8">
                                        <input
                                            type="time"
                                            value={communicationPrefs.quietHoursStart || '22:00'}
                                            onChange={(e) => setCommunicationPrefs({ ...communicationPrefs, quietHoursStart: e.target.value })}
                                            className="border border-gray-300 rounded-lg p-2"
                                        />
                                        <span>to</span>
                                        <input
                                            type="time"
                                            value={communicationPrefs.quietHoursEnd || '07:00'}
                                            onChange={(e) => setCommunicationPrefs({ ...communicationPrefs, quietHoursEnd: e.target.value })}
                                            className="border border-gray-300 rounded-lg p-2"
                                        />
                                    </div>
                                )}
                            </div>
                        </div>
                    )}

                    {/* Service Areas Tab */}
                    {activeTab === 'service-areas' && (
                        <div className="space-y-6">
                            <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                                <MapPin className="w-5 h-5" /> Service Areas
                            </h2>

                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Max Travel Distance</label>
                                <div className="flex items-center gap-2">
                                    <input
                                        type="range"
                                        min={5}
                                        max={100}
                                        value={maxTravelDistance}
                                        onChange={(e) => setMaxTravelDistance(parseInt(e.target.value))}
                                        className="flex-1"
                                    />
                                    <span className="text-lg font-semibold w-20 text-right">{maxTravelDistance} mi</span>
                                </div>
                            </div>

                            {/* Add Area */}
                            <div className="flex gap-3 p-4 bg-gray-50 rounded-lg">
                                <input
                                    type="text"
                                    value={newArea.zipCode}
                                    onChange={(e) => setNewArea({ ...newArea, zipCode: e.target.value })}
                                    placeholder="ZIP Code"
                                    className="w-32 border border-gray-300 rounded-lg p-2"
                                />
                                <input
                                    type="text"
                                    value={newArea.city}
                                    onChange={(e) => setNewArea({ ...newArea, city: e.target.value })}
                                    placeholder="City"
                                    className="flex-1 border border-gray-300 rounded-lg p-2"
                                />
                                <input
                                    type="text"
                                    value={newArea.state}
                                    onChange={(e) => setNewArea({ ...newArea, state: e.target.value })}
                                    placeholder="State"
                                    className="w-20 border border-gray-300 rounded-lg p-2"
                                />
                                <select
                                    value={newArea.priority}
                                    onChange={(e) => setNewArea({ ...newArea, priority: e.target.value as ServiceArea['priority'] })}
                                    className="border border-gray-300 rounded-lg p-2"
                                >
                                    <option value="primary">Primary</option>
                                    <option value="secondary">Secondary</option>
                                    <option value="emergency_only">Emergency Only</option>
                                </select>
                                <button onClick={addServiceArea} className="px-4 py-2 bg-blue-600 text-white rounded-lg">
                                    <Plus className="w-5 h-5" />
                                </button>
                            </div>

                            {/* Areas List */}
                            <div className="space-y-2">
                                {serviceAreas.map((area) => (
                                    <div key={area.id} className="flex items-center justify-between p-3 border rounded-lg">
                                        <div>
                                            <span className="font-medium">{area.city}, {area.state}</span>
                                            <span className="text-gray-500 ml-2">{area.zipCode}</span>
                                        </div>
                                        <div className="flex items-center gap-3">
                                            <span className={`px-2 py-1 rounded text-sm ${area.priority === 'primary' ? 'bg-green-100 text-green-700' :
                                                area.priority === 'secondary' ? 'bg-blue-100 text-blue-700' :
                                                    'bg-orange-100 text-orange-700'
                                                }`}>
                                                {area.priority.replace('_', ' ')}
                                            </span>
                                            <button
                                                onClick={() => setServiceAreas(serviceAreas.filter(a => a.id !== area.id))}
                                                className="text-red-500 hover:text-red-700"
                                            >
                                                <Trash2 className="w-4 h-4" />
                                            </button>
                                        </div>
                                    </div>
                                ))}
                            </div>

                            {serviceAreas.length === 0 && (
                                <p className="text-gray-500 text-center py-8">No service areas defined. Add your first service area above.</p>
                            )}
                        </div>
                    )}

                    {/* Rate Card Tab */}
                    {activeTab === 'rate-card' && (
                        <div className="space-y-6">
                            <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                                <DollarSign className="w-5 h-5" /> Rate Card Matrix
                            </h2>

                            {/* Standard Rate */}
                            <div className="p-4 bg-gray-50 rounded-lg">
                                <h3 className="font-medium text-gray-900 mb-4">Standard Hourly Rate</h3>
                                <div className="max-w-xs relative">
                                    <span className="absolute left-3 top-3 text-gray-500">$</span>
                                    <input
                                        type="number"
                                        value={rateCard.standardHourlyRate || ''}
                                        onChange={(e) => setRateCard({ ...rateCard, standardHourlyRate: parseFloat(e.target.value) || 0 })}
                                        className="w-full border border-gray-300 rounded-lg p-3 pl-8"
                                    />
                                </div>
                            </div>

                            {/* After Hours */}
                            <div className="p-4 bg-gray-50 rounded-lg border">
                                <div className="flex items-center justify-between mb-4">
                                    <h3 className="font-medium text-gray-900">After Hours Rules</h3>
                                    <label className="flex items-center gap-2">
                                        <input
                                            type="checkbox"
                                            checked={!!rateCard.afterHours?.isActive}
                                            onChange={(e) => setRateCard({
                                                ...rateCard,
                                                afterHours: e.target.checked 
                                                    ? { isActive: true, amount: 0, type: 'flat', timeStart: '17:00', timeEnd: '08:00' }
                                                    : undefined
                                            })}
                                            className="w-5 h-5 rounded text-blue-600"
                                        />
                                        <span className="text-sm font-medium">Enable</span>
                                    </label>
                                </div>
                                
                                {rateCard.afterHours?.isActive && (
                                    <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-4 mt-4">
                                        <div>
                                            <label className="block text-sm text-gray-700 mb-1">Type</label>
                                            <select
                                                value={rateCard.afterHours.type}
                                                onChange={(e) => setRateCard({
                                                    ...rateCard,
                                                    afterHours: { ...rateCard.afterHours!, type: e.target.value as any }
                                                })}
                                                className="w-full border rounded-lg p-2"
                                            >
                                                <option value="flat">Flat Fee Add-on</option>
                                                <option value="hourly">Hourly Add-on</option>
                                                <option value="percentage">Percentage Multiplier</option>
                                            </select>
                                        </div>
                                        <div>
                                            <label className="block text-sm text-gray-700 mb-1">Amount</label>
                                            <input
                                                type="number"
                                                value={rateCard.afterHours.amount || ''}
                                                onChange={(e) => setRateCard({
                                                    ...rateCard,
                                                    afterHours: { ...rateCard.afterHours!, amount: parseFloat(e.target.value) || 0 }
                                                })}
                                                className="w-full border rounded-lg p-2"
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-sm text-gray-700 mb-1">Start Time</label>
                                            <input
                                                type="time"
                                                value={rateCard.afterHours.timeStart || ''}
                                                onChange={(e) => setRateCard({
                                                    ...rateCard,
                                                    afterHours: { ...rateCard.afterHours!, timeStart: e.target.value }
                                                })}
                                                className="w-full border rounded-lg p-2"
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-sm text-gray-700 mb-1">End Time</label>
                                            <input
                                                type="time"
                                                value={rateCard.afterHours.timeEnd || ''}
                                                onChange={(e) => setRateCard({
                                                    ...rateCard,
                                                    afterHours: { ...rateCard.afterHours!, timeEnd: e.target.value }
                                                })}
                                                className="w-full border rounded-lg p-2"
                                            />
                                        </div>
                                    </div>
                                )}
                            </div>

                            {/* Travel */}
                            <div className="p-4 bg-gray-50 rounded-lg border">
                                <div className="flex items-center justify-between mb-4">
                                    <h3 className="font-medium text-gray-900">Travel Rate</h3>
                                    <label className="flex items-center gap-2">
                                        <input
                                            type="checkbox"
                                            checked={!!rateCard.travel?.isActive}
                                            onChange={(e) => setRateCard({
                                                ...rateCard,
                                                travel: e.target.checked 
                                                    ? { isActive: true, amount: 0, type: 'flat' }
                                                    : undefined
                                            })}
                                            className="w-5 h-5 rounded text-blue-600"
                                        />
                                        <span className="text-sm font-medium">Enable</span>
                                    </label>
                                </div>

                                {rateCard.travel?.isActive && (
                                    <div className="grid md:grid-cols-2 gap-4 mt-4 max-w-lg">
                                        <div>
                                            <label className="block text-sm text-gray-700 mb-1">Type</label>
                                            <select
                                                value={rateCard.travel.type}
                                                onChange={(e) => setRateCard({
                                                    ...rateCard,
                                                    travel: { ...rateCard.travel!, type: e.target.value as any }
                                                })}
                                                className="w-full border rounded-lg p-2"
                                            >
                                                <option value="flat">Per Mile / KM Rate</option>
                                                <option value="hourly">Flat Travel Fee</option>
                                            </select>
                                        </div>
                                        <div>
                                            <label className="block text-sm text-gray-700 mb-1">Amount ($)</label>
                                            <input
                                                type="number"
                                                value={rateCard.travel.amount || ''}
                                                onChange={(e) => setRateCard({
                                                    ...rateCard,
                                                    travel: { ...rateCard.travel!, amount: parseFloat(e.target.value) || 0 }
                                                })}
                                                className="w-full border rounded-lg p-2"
                                            />
                                        </div>
                                    </div>
                                )}
                            </div>

                            {/* Custom Rate Tiers */}
                            <div className="p-4 bg-gray-50 rounded-lg border">
                                <div className="flex items-center justify-between mb-4">
                                    <h3 className="font-medium text-gray-900">Custom Rate Tiers</h3>
                                    <button
                                        onClick={() => {
                                            const newRate = {
                                                id: Date.now().toString(),
                                                name: '',
                                                condition: { type: 'percentage' as const, amount: 0, isActive: true }
                                            };
                                            setRateCard({
                                                ...rateCard,
                                                customRates: [...(rateCard.customRates || []), newRate]
                                            });
                                        }}
                                        className="flex items-center gap-2 px-3 py-1.5 text-sm bg-blue-100 text-blue-700 rounded-lg hover:bg-blue-200"
                                    >
                                        <Plus className="w-4 h-4" /> Add Rate Tier
                                    </button>
                                </div>

                                <div className="space-y-4">
                                    {(rateCard.customRates || []).map((rate, index) => (
                                        <div key={rate.id} className="flex flex-wrap items-center gap-4 p-3 bg-white border rounded-lg">
                                            <div className="flex-1 min-w-[200px]">
                                                <label className="block text-xs text-gray-500 mb-1">Tier Name (e.g. VIP, Senior)</label>
                                                <input
                                                    type="text"
                                                    value={rate.name}
                                                    onChange={(e) => {
                                                        const newRates = [...(rateCard.customRates || [])];
                                                        newRates[index].name = e.target.value;
                                                        setRateCard({ ...rateCard, customRates: newRates });
                                                    }}
                                                    className="w-full border rounded p-2 text-sm"
                                                    placeholder="Rate Name"
                                                />
                                            </div>
                                            <div className="w-40">
                                                <label className="block text-xs text-gray-500 mb-1">Modifier Type</label>
                                                <select
                                                    value={rate.condition.type}
                                                    onChange={(e) => {
                                                        const newRates = [...(rateCard.customRates || [])];
                                                        newRates[index].condition.type = e.target.value as any;
                                                        setRateCard({ ...rateCard, customRates: newRates });
                                                    }}
                                                    className="w-full border rounded p-2 text-sm"
                                                >
                                                    <option value="percentage">% Discount</option>
                                                    <option value="hourly">Custom Hourly Rate</option>
                                                    <option value="flat">Flat Discount/Fee</option>
                                                </select>
                                            </div>
                                            <div className="w-24">
                                                <label className="block text-xs text-gray-500 mb-1">{rate.condition.type === 'percentage' ? 'Percent' : 'Amount ($)'}</label>
                                                <input
                                                    type="number"
                                                    value={rate.condition.amount || ''}
                                                    onChange={(e) => {
                                                        const newRates = [...(rateCard.customRates || [])];
                                                        newRates[index].condition.amount = parseFloat(e.target.value) || 0;
                                                        setRateCard({ ...rateCard, customRates: newRates });
                                                    }}
                                                    className="w-full border rounded p-2 text-sm"
                                                />
                                            </div>
                                            <div className="pt-5">
                                                <button
                                                    onClick={() => {
                                                        const newRates = rateCard.customRates?.filter((_, i) => i !== index);
                                                        setRateCard({ ...rateCard, customRates: newRates });
                                                    }}
                                                    className="p-2 text-red-500 hover:bg-red-50 rounded"
                                                >
                                                    <Trash2 className="w-4 h-4" />
                                                </button>
                                            </div>
                                        </div>
                                    ))}
                                    {(!rateCard.customRates || rateCard.customRates.length === 0) && (
                                        <p className="text-sm text-gray-500 text-center py-4">No custom rate tiers defined. Add one to assign to customers.</p>
                                    )}
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            </div>

            <MaterialsReviewModal
                isOpen={showToolReview}
                onClose={() => setShowToolReview(false)}
                items={identifiedTools}
                type="tools"
                onSave={handleSaveIdentifiedTools}
            />
        </div>
    );
};
