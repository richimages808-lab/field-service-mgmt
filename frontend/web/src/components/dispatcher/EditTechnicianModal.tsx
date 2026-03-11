import React, { useState, useEffect, KeyboardEvent } from 'react';
import { doc, updateDoc } from 'firebase/firestore';
import { db } from '../../firebase';
import { UserProfile } from '../../types';
import { X, Save } from 'lucide-react';

interface EditTechnicianModalProps {
    isOpen: boolean;
    onClose: () => void;
    technician: UserProfile | null;
}

export const EditTechnicianModal: React.FC<EditTechnicianModalProps> = ({ isOpen, onClose, technician }) => {
    const [name, setName] = useState('');
    const [email, setEmail] = useState('');
    const [phone, setPhone] = useState('');
    const [homeAddress, setHomeAddress] = useState('');
    const [skills, setSkills] = useState<string[]>([]);
    const [skillInput, setSkillInput] = useState('');
    const [tools, setTools] = useState<string[]>([]);
    const [toolInput, setToolInput] = useState('');
    const [techType, setTechType] = useState<'corporate' | 'solopreneur'>('corporate');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');

    // Populate form when technician changes
    useEffect(() => {
        if (technician) {
            setName(technician.name || '');
            setEmail(technician.email || '');
            setPhone(technician.phone || '');
            setHomeAddress(technician.homeLocation?.address || technician.address || '');
            setSkills(technician.specialties || []);
            setTools(technician.tools || []);
            setTechType(technician.techType || 'corporate');
        }
    }, [technician]);

    if (!isOpen || !technician) return null;

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
        setLoading(true);
        setError('');
        setSuccess('');

        try {
            await updateDoc(doc(db, 'users', technician.id), {
                name,
                phone,
                techType,
                specialties: skills,
                tools,
                homeLocation: {
                    address: homeAddress
                },
                address: homeAddress, // Also update legacy field
                updatedAt: new Date()
            });

            setSuccess('Profile updated successfully!');
            setTimeout(() => {
                onClose();
                setSuccess('');
            }, 1500);
        } catch (err: any) {
            console.error("Error updating technician:", err);
            setError(err.message || 'Failed to update profile.');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 p-4">
            <div className="bg-white rounded-lg shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
                <div className="sticky top-0 bg-white px-6 py-4 border-b border-gray-200 flex justify-between items-center">
                    <h2 className="text-xl font-bold text-gray-800">Edit Technician</h2>
                    <button
                        onClick={onClose}
                        className="text-gray-400 hover:text-gray-600"
                    >
                        <X className="w-5 h-5" />
                    </button>
                </div>

                <form onSubmit={handleSubmit} className="p-6 space-y-4">
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

                    {/* Name */}
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Full Name *</label>
                        <input
                            type="text"
                            required
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            className="w-full border border-gray-300 rounded-md p-2 focus:ring-indigo-500 focus:border-indigo-500"
                        />
                    </div>

                    {/* Email (read-only) */}
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
                        <input
                            type="email"
                            value={email}
                            disabled
                            className="w-full border border-gray-300 rounded-md p-2 bg-gray-100 text-gray-500 cursor-not-allowed"
                        />
                        <p className="mt-1 text-xs text-gray-500">Email cannot be changed</p>
                    </div>

                    {/* Phone */}
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Phone (for texting)</label>
                        <input
                            type="tel"
                            value={phone}
                            onChange={(e) => setPhone(e.target.value)}
                            className="w-full border border-gray-300 rounded-md p-2 focus:ring-indigo-500 focus:border-indigo-500"
                            placeholder="808-555-0123"
                        />
                    </div>

                    {/* Tech Type */}
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Technician Type</label>
                        <select
                            value={techType}
                            onChange={(e) => setTechType(e.target.value as 'corporate' | 'solopreneur')}
                            className="w-full border border-gray-300 rounded-md p-2 focus:ring-indigo-500 focus:border-indigo-500"
                        >
                            <option value="corporate">Corporate Employee</option>
                            <option value="solopreneur">Solopreneur / Contractor</option>
                        </select>
                    </div>

                    {/* Home Location */}
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Home Location</label>
                        <input
                            type="text"
                            value={homeAddress}
                            onChange={(e) => setHomeAddress(e.target.value)}
                            className="w-full border border-gray-300 rounded-md p-2 focus:ring-indigo-500 focus:border-indigo-500"
                            placeholder="123 Main St, Honolulu, HI 96814"
                        />
                    </div>

                    {/* Skills */}
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Skills</label>
                        <div className="border border-gray-300 rounded-md p-2 focus-within:ring-2 focus-within:ring-indigo-500 focus-within:border-indigo-500">
                            <div className="flex flex-wrap gap-2 mb-2">
                                {skills.map((skill) => (
                                    <span
                                        key={skill}
                                        className="inline-flex items-center px-2.5 py-0.5 rounded-full text-sm font-medium bg-indigo-100 text-indigo-800"
                                    >
                                        {skill}
                                        <button
                                            type="button"
                                            onClick={() => removeSkill(skill)}
                                            className="ml-1.5 inline-flex items-center justify-center w-4 h-4 rounded-full text-indigo-400 hover:bg-indigo-200 hover:text-indigo-500"
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
                                placeholder="Type a skill and press comma or Enter..."
                            />
                        </div>
                        <p className="mt-1 text-xs text-gray-500">e.g., HVAC, Plumbing, Electrical</p>
                    </div>

                    {/* Tools */}
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Tools & Equipment</label>
                        <div className="border border-gray-300 rounded-md p-2 focus-within:ring-2 focus-within:ring-indigo-500 focus-within:border-indigo-500">
                            <div className="flex flex-wrap gap-2 mb-2">
                                {tools.map((tool) => (
                                    <span
                                        key={tool}
                                        className="inline-flex items-center px-2.5 py-0.5 rounded-full text-sm font-medium bg-green-100 text-green-800"
                                    >
                                        {tool}
                                        <button
                                            type="button"
                                            onClick={() => removeTool(tool)}
                                            className="ml-1.5 inline-flex items-center justify-center w-4 h-4 rounded-full text-green-400 hover:bg-green-200 hover:text-green-500"
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
                                placeholder="Type a tool and press comma or Enter..."
                            />
                        </div>
                        <p className="mt-1 text-xs text-gray-500">e.g., Multimeter, Oscilloscope, Pipe Wrench</p>
                    </div>

                    {/* Actions */}
                    <div className="flex justify-end space-x-3 pt-4 border-t border-gray-200">
                        <button
                            type="button"
                            onClick={onClose}
                            className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-md hover:bg-gray-200"
                        >
                            Cancel
                        </button>
                        <button
                            type="submit"
                            disabled={loading}
                            className="inline-flex items-center px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded-md hover:bg-indigo-700 disabled:opacity-50"
                        >
                            {loading ? 'Saving...' : (
                                <>
                                    <Save className="w-4 h-4 mr-1" />
                                    Save Changes
                                </>
                            )}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};
