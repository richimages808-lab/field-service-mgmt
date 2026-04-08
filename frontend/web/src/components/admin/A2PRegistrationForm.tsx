import React, { useState } from 'react';
import { httpsCallable } from 'firebase/functions';
import { functions } from '../../firebase';
import { toast } from 'react-hot-toast';
import { Building2, Mail, MapPin, Phone, User, Loader2, ShieldCheck, Info } from 'lucide-react';

interface A2PRegistrationFormProps {
    orgId: string;
    onSuccess: () => void;
}

export const A2PRegistrationForm: React.FC<A2PRegistrationFormProps> = ({ orgId, onSuccess }) => {
    const [submitting, setSubmitting] = useState(false);
    const [formData, setFormData] = useState({
        businessType: 'corporation',
        businessName: '',
        businessRegistrationNumber: '', // EIN
        businessIndustry: 'Repair/Maintenance/Cleaning',
        businessRegionsOfOperation: 'USA',
        websiteUrl: '',
        street: '',
        city: '',
        state: '',
        postalCode: '',
        country: 'US',
        repFirstName: '',
        repLastName: '',
        repEmail: '',
        repPhone: '',
        repJobTitle: 'Owner',
        repBusinessTitle: 'CEO'
    });

    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
        const { name, value } = e.target;
        setFormData(prev => ({ ...prev, [name]: value }));
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setSubmitting(true);

        try {
            const registerA2P = httpsCallable(functions, 'registerA2P');
            const result = await registerA2P({
                orgId,
                businessType: formData.businessType,
                businessName: formData.businessName,
                businessRegistrationNumber: formData.businessRegistrationNumber,
                businessIndustry: formData.businessIndustry,
                businessRegionsOfOperation: formData.businessRegionsOfOperation,
                websiteUrl: formData.websiteUrl,
                businessPhysicalAddress: {
                    street: formData.street,
                    city: formData.city,
                    region: formData.state,
                    postalCode: formData.postalCode,
                    country: formData.country
                },
                authorizedRepresentative: {
                    firstName: formData.repFirstName,
                    lastName: formData.repLastName,
                    email: formData.repEmail,
                    phone: formData.repPhone,
                    jobTitle: formData.repJobTitle,
                    businessTitle: formData.repBusinessTitle
                }
            });

            console.log("A2P Registration Result:", result.data);
            toast.success('A2P 10DLC Registration Submitted Successfully!');
            onSuccess();
        } catch (error: any) {
            console.error('Error submitting A2P registration:', error);
            toast.error(error.message || 'Failed to submit A2P registration.');
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden mt-6">
            <div className="bg-gradient-to-r from-blue-600 to-blue-700 p-6 text-white">
                <div className="flex items-center gap-3 mb-2">
                    <ShieldCheck className="w-8 h-8 text-blue-200" />
                    <h2 className="text-2xl font-bold">A2P 10DLC Registration Required</h2>
                </div>
                <p className="text-blue-100">
                    To send SMS messages to US numbers, carriers require your business to be registered.
                    Please fill out this form to verify your business identity and enable texting.
                </p>
            </div>

            <form onSubmit={handleSubmit} className="p-6 space-y-8">
                {/* Business Info */}
                <section>
                    <h3 className="text-lg font-semibold text-gray-900 border-b pb-2 mb-4 flex items-center gap-2">
                        <Building2 className="w-5 h-5 text-gray-500" /> Business Information
                    </h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Legal Business Name *</label>
                            <input required type="text" name="businessName" value={formData.businessName} onChange={handleChange} className="w-full border rounded-lg px-3 py-2" placeholder="e.g. Acme Repair LLC" />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Business Type *</label>
                            <select required name="businessType" value={formData.businessType} onChange={handleChange} className="w-full border rounded-lg px-3 py-2">
                                <option value="sole_proprietor">Sole Proprietor (No EIN)</option>
                                <option value="llc">LLC</option>
                                <option value="corporation">Corporation</option>
                                <option value="partnership">Partnership</option>
                                <option value="nonprofit">Non-Profit</option>
                            </select>
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">EIN / Tax ID *</label>
                            <input required type="text" name="businessRegistrationNumber" value={formData.businessRegistrationNumber} onChange={handleChange} className="w-full border rounded-lg px-3 py-2" placeholder="xx-xxxxxxx" />
                            <p className="text-xs text-gray-500 mt-1">Required even for Sole Proprietors if available.</p>
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Website URL *</label>
                            <input required type="url" name="websiteUrl" value={formData.websiteUrl} onChange={handleChange} className="w-full border rounded-lg px-3 py-2" placeholder="https://www.example.com" />
                        </div>
                    </div>
                </section>

                {/* Address */}
                <section>
                    <h3 className="text-lg font-semibold text-gray-900 border-b pb-2 mb-4 flex items-center gap-2">
                        <MapPin className="w-5 h-5 text-gray-500" /> Physical Address
                    </h3>
                    <div className="space-y-4">
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Street Address *</label>
                            <input required type="text" name="street" value={formData.street} onChange={handleChange} className="w-full border rounded-lg px-3 py-2" placeholder="123 Main St" />
                        </div>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                            <div className="col-span-2 md:col-span-1">
                                <label className="block text-sm font-medium text-gray-700 mb-1">City *</label>
                                <input required type="text" name="city" value={formData.city} onChange={handleChange} className="w-full border rounded-lg px-3 py-2" />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">State/Region *</label>
                                <input required type="text" name="state" value={formData.state} onChange={handleChange} className="w-full border rounded-lg px-3 py-2" placeholder="NY" />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">ZIP / Postal *</label>
                                <input required type="text" name="postalCode" value={formData.postalCode} onChange={handleChange} className="w-full border rounded-lg px-3 py-2" />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Country *</label>
                                <input required type="text" name="country" value={formData.country} onChange={handleChange} className="w-full border rounded-lg px-3 py-2" placeholder="US" disabled title="Only US supported currently" />
                            </div>
                        </div>
                    </div>
                </section>

                {/* Authorized Rep */}
                <section>
                    <h3 className="text-lg font-semibold text-gray-900 border-b pb-2 mb-4 flex items-center gap-2">
                        <User className="w-5 h-5 text-gray-500" /> Authorized Representative
                    </h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">First Name *</label>
                            <input required type="text" name="repFirstName" value={formData.repFirstName} onChange={handleChange} className="w-full border rounded-lg px-3 py-2" />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Last Name *</label>
                            <input required type="text" name="repLastName" value={formData.repLastName} onChange={handleChange} className="w-full border rounded-lg px-3 py-2" />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Email *</label>
                            <div className="relative">
                                <Mail className="w-4 h-4 text-gray-400 absolute left-3 top-3" />
                                <input required type="email" name="repEmail" value={formData.repEmail} onChange={handleChange} className="w-full border rounded-lg pl-9 pr-3 py-2" />
                            </div>
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Direct Phone *</label>
                            <div className="relative">
                                <Phone className="w-4 h-4 text-gray-400 absolute left-3 top-3" />
                                <input required type="tel" name="repPhone" value={formData.repPhone} onChange={handleChange} className="w-full border rounded-lg pl-9 pr-3 py-2" placeholder="+1234567890" />
                            </div>
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Job Title *</label>
                            <input required type="text" name="repJobTitle" value={formData.repJobTitle} onChange={handleChange} className="w-full border rounded-lg px-3 py-2" placeholder="Owner" />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Role Type *</label>
                            <select required name="repBusinessTitle" value={formData.repBusinessTitle} onChange={handleChange} className="w-full border rounded-lg px-3 py-2">
                                <option value="CEO">CEO / VP / GM</option>
                                <option value="CFO">CFO / Finance Director</option>
                                <option value="IT Manager">IT Manager</option>
                                <option value="Employee">Other Employee</option>
                            </select>
                        </div>
                    </div>
                </section>

                <div className="bg-gray-50 p-4 rounded-lg flex items-start gap-3 text-sm text-gray-600">
                    <Info className="w-5 h-5 text-blue-500 flex-shrink-0 mt-0.5" />
                    <p>
                        By submitting this form, you verify that you are an authorized representative of the business
                        and consent to registering your brand with carrier networks for A2P 10DLC messaging compliance.
                    </p>
                </div>

                <div className="flex justify-end pt-4 border-t">
                    <button
                        type="submit"
                        disabled={submitting}
                        className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2.5 rounded-lg font-medium flex items-center justify-center min-w-[150px] disabled:opacity-50 transition-colors"
                    >
                        {submitting ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Submit Registration'}
                    </button>
                </div>
            </form>
        </div>
    );
};
