import React, { useState, useEffect, KeyboardEvent } from 'react';
import { doc, updateDoc, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../auth/AuthProvider';
import { UserProfile } from '../types';
import { User, Mail, Phone, MapPin, Save, Wrench, Briefcase, X } from 'lucide-react';

export const Profile: React.FC = () => {
    const { user } = useAuth();
    const [profile, setProfile] = useState<UserProfile | null>(null);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [success, setSuccess] = useState('');
    const [error, setError] = useState('');

    // Form state
    const [name, setName] = useState('');
    const [phone, setPhone] = useState('');
    const [homeAddress, setHomeAddress] = useState('');
    const [skills, setSkills] = useState<string[]>([]);
    const [skillInput, setSkillInput] = useState('');
    const [tools, setTools] = useState<string[]>([]);
    const [toolInput, setToolInput] = useState('');

    // Subscribe to user profile
    useEffect(() => {
        if (!user?.uid) return;

        const unsubscribe = onSnapshot(doc(db, 'users', user.uid), (docSnap) => {
            if (docSnap.exists()) {
                const data = { id: docSnap.id, ...docSnap.data() } as UserProfile;
                setProfile(data);
                setName(data.name || '');
                setPhone(data.phone || '');
                setHomeAddress(data.homeLocation?.address || data.address || '');
                setSkills(data.specialties || []);
                setTools(data.tools || []);
            }
            setLoading(false);
        });

        return () => unsubscribe();
    }, [user?.uid]);

    const handleSkillKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
        if ((e.key === ',' || e.key === 'Enter') && skillInput.trim()) {
            e.preventDefault();
            const newSkill = skillInput.trim().replace(/,/g, '');
            if (newSkill && !skills.includes(newSkill)) {
                setSkills([...skills, newSkill]);
            }
            setSkillInput('');
        } else if (e.key === 'Backspace' && !skillInput && skills.length > 0) {
            setSkills(skills.slice(0, -1));
        }
    };

    const removeSkill = (skillToRemove: string) => {
        setSkills(skills.filter(s => s !== skillToRemove));
    };

    const handleToolKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
        if ((e.key === ',' || e.key === 'Enter') && toolInput.trim()) {
            e.preventDefault();
            const newTool = toolInput.trim().replace(/,/g, '');
            if (newTool && !tools.includes(newTool)) {
                setTools([...tools, newTool]);
            }
            setToolInput('');
        } else if (e.key === 'Backspace' && !toolInput && tools.length > 0) {
            setTools(tools.slice(0, -1));
        }
    };

    const removeTool = (toolToRemove: string) => {
        setTools(tools.filter(t => t !== toolToRemove));
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!user?.uid) return;

        setSaving(true);
        setError('');
        setSuccess('');

        try {
            await updateDoc(doc(db, 'users', user.uid), {
                name,
                phone,
                specialties: skills,
                tools,
                homeLocation: {
                    address: homeAddress
                },
                address: homeAddress,
                updatedAt: new Date()
            });

            setSuccess('Profile updated successfully!');
            setTimeout(() => setSuccess(''), 3000);
        } catch (err: any) {
            console.error("Error updating profile:", err);
            setError(err.message || 'Failed to update profile.');
        } finally {
            setSaving(false);
        }
    };

    if (loading) {
        return (
            <div className="min-h-screen bg-gray-50 flex items-center justify-center">
                <div className="text-gray-500">Loading profile...</div>
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
            <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
                {/* Header */}
                <div className="bg-white rounded-lg shadow overflow-hidden">
                    <div className="bg-gradient-to-r from-indigo-500 to-purple-600 px-6 py-8">
                        <div className="flex items-center">
                            <div className="bg-white rounded-full p-4">
                                <User className="h-12 w-12 text-indigo-600" />
                            </div>
                            <div className="ml-6">
                                <h1 className="text-2xl font-bold text-white">{profile.name}</h1>
                                <div className="flex items-center mt-1 text-indigo-100">
                                    <Mail className="h-4 w-4 mr-2" />
                                    {profile.email}
                                </div>
                                <span className={`mt-2 inline-flex items-center px-3 py-1 rounded-full text-sm font-medium ${profile.techType === 'solopreneur'
                                        ? 'bg-purple-200 text-purple-800'
                                        : 'bg-green-200 text-green-800'
                                    }`}>
                                    {profile.techType === 'solopreneur' ? 'Contractor' : 'Employee'}
                                </span>
                            </div>
                        </div>
                    </div>

                    {/* Form */}
                    <form onSubmit={handleSubmit} className="px-6 py-6 space-y-6">
                        {error && (
                            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-md text-sm">
                                {error}
                            </div>
                        )}
                        {success && (
                            <div className="bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded-md text-sm">
                                {success}
                            </div>
                        )}

                        {/* Basic Info */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">
                                    <User className="inline h-4 w-4 mr-1" />
                                    Full Name
                                </label>
                                <input
                                    type="text"
                                    value={name}
                                    onChange={(e) => setName(e.target.value)}
                                    className="w-full border border-gray-300 rounded-md p-2 focus:ring-indigo-500 focus:border-indigo-500"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">
                                    <Phone className="inline h-4 w-4 mr-1" />
                                    Phone
                                </label>
                                <input
                                    type="tel"
                                    value={phone}
                                    onChange={(e) => setPhone(e.target.value)}
                                    className="w-full border border-gray-300 rounded-md p-2 focus:ring-indigo-500 focus:border-indigo-500"
                                    placeholder="808-555-0123"
                                />
                            </div>
                        </div>

                        {/* Home Location */}
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">
                                <MapPin className="inline h-4 w-4 mr-1" />
                                Home Location
                            </label>
                            <input
                                type="text"
                                value={homeAddress}
                                onChange={(e) => setHomeAddress(e.target.value)}
                                className="w-full border border-gray-300 rounded-md p-2 focus:ring-indigo-500 focus:border-indigo-500"
                                placeholder="123 Main St, Honolulu, HI 96814"
                            />
                            <p className="mt-1 text-xs text-gray-500">Used for route optimization and job assignments</p>
                        </div>

                        {/* Skills */}
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">
                                <Briefcase className="inline h-4 w-4 mr-1" />
                                Skills & Specialties
                            </label>
                            <div className="border border-gray-300 rounded-md p-3 focus-within:ring-2 focus-within:ring-indigo-500 focus-within:border-indigo-500">
                                <div className="flex flex-wrap gap-2 mb-2">
                                    {skills.map((skill) => (
                                        <span
                                            key={skill}
                                            className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-indigo-100 text-indigo-800"
                                        >
                                            {skill}
                                            <button
                                                type="button"
                                                onClick={() => removeSkill(skill)}
                                                className="ml-2 inline-flex items-center justify-center w-4 h-4 rounded-full text-indigo-400 hover:bg-indigo-200 hover:text-indigo-600"
                                            >
                                                <X className="w-3 h-3" />
                                            </button>
                                        </span>
                                    ))}
                                </div>
                                <input
                                    type="text"
                                    value={skillInput}
                                    onChange={(e) => setSkillInput(e.target.value)}
                                    onKeyDown={handleSkillKeyDown}
                                    className="w-full border-0 p-0 focus:ring-0 text-sm"
                                    placeholder="Type a skill and press comma or Enter to add..."
                                />
                            </div>
                            <p className="mt-1 text-xs text-gray-500">e.g., HVAC, Plumbing, Electrical, Network Cabling</p>
                        </div>

                        {/* Tools */}
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">
                                <Wrench className="inline h-4 w-4 mr-1" />
                                Tools & Equipment
                            </label>
                            <div className="border border-gray-300 rounded-md p-3 focus-within:ring-2 focus-within:ring-indigo-500 focus-within:border-indigo-500">
                                <div className="flex flex-wrap gap-2 mb-2">
                                    {tools.map((tool) => (
                                        <span
                                            key={tool}
                                            className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-green-100 text-green-800"
                                        >
                                            {tool}
                                            <button
                                                type="button"
                                                onClick={() => removeTool(tool)}
                                                className="ml-2 inline-flex items-center justify-center w-4 h-4 rounded-full text-green-400 hover:bg-green-200 hover:text-green-600"
                                            >
                                                <X className="w-3 h-3" />
                                            </button>
                                        </span>
                                    ))}
                                </div>
                                <input
                                    type="text"
                                    value={toolInput}
                                    onChange={(e) => setToolInput(e.target.value)}
                                    onKeyDown={handleToolKeyDown}
                                    className="w-full border-0 p-0 focus:ring-0 text-sm"
                                    placeholder="Type a tool and press comma or Enter to add..."
                                />
                            </div>
                            <p className="mt-1 text-xs text-gray-500">e.g., Multimeter, Oscilloscope, Pipe Wrench</p>
                        </div>

                        {/* Submit Button */}
                        <div className="flex justify-end pt-4 border-t border-gray-200">
                            <button
                                type="submit"
                                disabled={saving}
                                className="inline-flex items-center px-6 py-3 border border-transparent text-base font-medium rounded-md shadow-sm text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50"
                            >
                                {saving ? 'Saving...' : (
                                    <>
                                        <Save className="w-5 h-5 mr-2" />
                                        Save Profile
                                    </>
                                )}
                            </button>
                        </div>
                    </form>
                </div>
            </div>
        </div>
    );
};
