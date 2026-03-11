import React, { useState, KeyboardEvent } from 'react';
import { doc, setDoc } from 'firebase/firestore';
import { createUserWithEmailAndPassword, sendEmailVerification } from 'firebase/auth';
import { db, auth } from '../../firebase';
import { X, Plus } from 'lucide-react';

interface AddTechnicianModalProps {
    isOpen: boolean;
    onClose: () => void;
}

export const AddTechnicianModal: React.FC<AddTechnicianModalProps> = ({ isOpen, onClose }) => {
    const [name, setName] = useState('');
    const [email, setEmail] = useState('');
    const [phone, setPhone] = useState('');
    const [password, setPassword] = useState('');
    const [homeAddress, setHomeAddress] = useState('');
    const [skills, setSkills] = useState<string[]>([]);
    const [skillInput, setSkillInput] = useState('');
    const [tools, setTools] = useState<string[]>([]);
    const [toolInput, setToolInput] = useState('');
    const [techType, setTechType] = useState<'corporate' | 'solopreneur'>('corporate');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    if (!isOpen) return null;

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

    const resetForm = () => {
        setName('');
        setEmail('');
        setPhone('');
        setPassword('');
        setHomeAddress('');
        setSkills([]);
        setSkillInput('');
        setTools([]);
        setToolInput('');
        setTechType('corporate');
        setError('');
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setError('');

        try {
            // 1. Create Firebase Auth user
            const userCredential = await createUserWithEmailAndPassword(auth, email, password);
            const uid = userCredential.user.uid;

            // 2. Send email verification
            await sendEmailVerification(userCredential.user);

            // 3. Create Firestore document with pending status
            await setDoc(doc(db, 'users', uid), {
                id: uid,
                name,
                email,
                phone,
                role: 'technician',
                techType,
                org_id: 'demo-org',
                specialties: skills,
                tools,
                homeLocation: {
                    address: homeAddress
                },
                status: 'pending_verification', // New field for verification status
                emailVerified: false,
                createdAt: new Date()
            });

            resetForm();
            onClose();
        } catch (err: any) {
            console.error("Error adding technician:", err);
            if (err.code === 'auth/email-already-in-use') {
                setError('This email is already in use.');
            } else if (err.code === 'auth/weak-password') {
                setError('Password must be at least 6 characters.');
            } else {
                setError(err.message || 'Failed to add technician.');
            }
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 p-4">
            <div className="bg-white rounded-lg shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
                <div className="sticky top-0 bg-white px-6 py-4 border-b border-gray-200 flex justify-between items-center">
                    <h2 className="text-xl font-bold text-gray-800">Add New Technician</h2>
                    <button
                        onClick={() => { resetForm(); onClose(); }}
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

                    {/* Tech Type - MOVED TO TOP */}
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Technician Type *</label>
                        <select
                            value={techType}
                            onChange={(e) => setTechType(e.target.value as 'corporate' | 'solopreneur')}
                            className="w-full border border-gray-300 rounded-md p-2 focus:ring-indigo-500 focus:border-indigo-500"
                        >
                            <option value="corporate">Employee</option>
                            <option value="solopreneur">Contractor</option>
                        </select>
                    </div>

                    {/* Name */}
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Full Name *</label>
                        <input
                            type="text"
                            required
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            className="w-full border border-gray-300 rounded-md p-2 focus:ring-indigo-500 focus:border-indigo-500"
                            placeholder="John Doe"
                        />
                    </div>

                    {/* Email */}
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Email *</label>
                        <input
                            type="email"
                            required
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            className="w-full border border-gray-300 rounded-md p-2 focus:ring-indigo-500 focus:border-indigo-500"
                            placeholder="john@example.com"
                        />
                        <p className="mt-1 text-xs text-gray-500">A verification email will be sent to this address</p>
                    </div>

                    {/* Phone */}
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Phone (for texting) *</label>
                        <input
                            type="tel"
                            required
                            value={phone}
                            onChange={(e) => setPhone(e.target.value)}
                            className="w-full border border-gray-300 rounded-md p-2 focus:ring-indigo-500 focus:border-indigo-500"
                            placeholder="808-555-0123"
                        />
                    </div>

                    {/* Password */}
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Password *</label>
                        <input
                            type="password"
                            required
                            minLength={6}
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            className="w-full border border-gray-300 rounded-md p-2 focus:ring-indigo-500 focus:border-indigo-500"
                            placeholder="Min 6 characters"
                        />
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
                            onClick={() => { resetForm(); onClose(); }}
                            className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-md hover:bg-gray-200"
                        >
                            Cancel
                        </button>
                        <button
                            type="submit"
                            disabled={loading}
                            className="inline-flex items-center px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded-md hover:bg-indigo-700 disabled:opacity-50"
                        >
                            {loading ? 'Creating...' : (
                                <>
                                    <Plus className="w-4 h-4 mr-1" />
                                    Add Technician
                                </>
                            )}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};
