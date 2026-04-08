import React, { useState, KeyboardEvent } from 'react';
import { doc, setDoc } from 'firebase/firestore';
import { createUserWithEmailAndPassword, sendEmailVerification } from 'firebase/auth';
import { ref, uploadBytesResumable, getDownloadURL } from 'firebase/storage';
import { httpsCallable } from 'firebase/functions';
import { db, auth, storage, functions } from '../../firebase';
import { X, Plus, Upload, FileText, Loader2, Trash2 } from 'lucide-react';

import { UserProfile, TechPermissions } from '../../types';

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
    const [permissions, setPermissions] = useState<TechPermissions>({
        canAddCustomers: true,
        canAddLocations: true,
        canAddVendors: true,
        canPurchaseMaterials: true,
        canPurchaseTools: true
    });
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [resumeFile, setResumeFile] = useState<File | null>(null);
    const [isParsingResume, setIsParsingResume] = useState(false);

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
        setResumeFile(null);
        setTechType('corporate');
        setPermissions({
            canAddCustomers: true,
            canAddLocations: true,
            canAddVendors: true,
            canPurchaseMaterials: true,
            canPurchaseTools: true
        });
        setError('');
    };

    const handleResumeSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        setResumeFile(file);
        setIsParsingResume(true);
        setError('');

        try {
            const reader = new FileReader();
            reader.readAsDataURL(file);
            reader.onload = async () => {
                const base64 = (reader.result as string).split(',')[1];
                try {
                    const parseResumeSkills = httpsCallable(functions, 'parseResumeSkills');
                    const result = await parseResumeSkills({ 
                        fileBase64: base64,
                        mimeType: file.type
                    });

                    const data = result.data as { success: boolean, skills: string[] };
                    if (data.success && data.skills && Array.isArray(data.skills)) {
                        setSkills(prev => {
                            const newSkills = [...prev];
                            data.skills.forEach(skill => {
                                if (!newSkills.includes(skill)) newSkills.push(skill);
                            });
                            return newSkills;
                        });
                    }
                } catch (parseErr: any) {
                    console.error("Parse failed", parseErr);
                    setError(`File selected but failed to extract skills automatically: ${parseErr.message}`);
                }
                setIsParsingResume(false);
            };
            reader.onerror = () => {
                setError('Failed to read file locally.');
                setIsParsingResume(false);
            };
        } catch (err: any) {
            console.error("Selection error", err);
            setError('Error selecting resume: ' + err.message);
            setIsParsingResume(false);
        }
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

            let uploadedResumeUrl = '';
            let uploadedResumeName = '';

            if (resumeFile) {
                try {
                    const storageRef = ref(storage, `resumes/${uid}/${resumeFile.name}`);
                    const uploadTask = await uploadBytesResumable(storageRef, resumeFile);
                    uploadedResumeUrl = await getDownloadURL(uploadTask.ref);
                    uploadedResumeName = resumeFile.name;
                } catch (ulErr) {
                    console.error("Failed to upload resume on creation:", ulErr);
                    setError("Technician created, but resume upload failed.");
                }
            }

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
                resumeUrl: uploadedResumeUrl || null,
                resumeName: uploadedResumeName || null,
                tools,
                homeLocation: {
                    address: homeAddress
                },
                permissions: techType === 'corporate' ? permissions : {
                    canAddCustomers: true,
                    canAddLocations: true,
                    canAddVendors: true,
                    canPurchaseMaterials: true,
                    canPurchaseTools: true
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
                            className="w-full border border-gray-300 rounded-md p-2 focus:ring-blue-500 focus:border-blue-500"
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
                            className="w-full border border-gray-300 rounded-md p-2 focus:ring-blue-500 focus:border-blue-500"
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
                            className="w-full border border-gray-300 rounded-md p-2 focus:ring-blue-500 focus:border-blue-500"
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
                            className="w-full border border-gray-300 rounded-md p-2 focus:ring-blue-500 focus:border-blue-500"
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
                            className="w-full border border-gray-300 rounded-md p-2 focus:ring-blue-500 focus:border-blue-500"
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
                            className="w-full border border-gray-300 rounded-md p-2 focus:ring-blue-500 focus:border-blue-500"
                            placeholder="123 Main St, Honolulu, HI 96814"
                        />
                    </div>

                    {/* Resume / CV */}
                    <div className="border border-gray-200 rounded-lg p-4 bg-gray-50">
                        <label className="block text-sm font-medium text-gray-700 mb-2">Resume / CV (AI Skill Extraction)</label>
                        {resumeFile ? (
                            <div className="flex items-center justify-between mb-3 bg-white p-3 border border-gray-200 rounded-md">
                                <div className="flex items-center text-sm truncate max-w-[70%]">
                                    <FileText className="w-5 h-5 text-blue-500 mr-2 flex-shrink-0" />
                                    <span className="text-gray-700 truncate">{resumeFile.name}</span>
                                </div>
                                <button 
                                    type="button" 
                                    onClick={() => setResumeFile(null)}
                                    className="text-red-500 hover:text-red-600 text-sm flex items-center bg-red-50 px-2 py-1 rounded hover:bg-red-100"
                                >
                                    <Trash2 className="w-4 h-4 mr-1" /> Remove
                                </button>
                            </div>
                        ) : null}

                        <label className={`flex flex-col items-center justify-center w-full h-32 border-2 border-gray-300 border-dashed rounded-lg cursor-pointer bg-white hover:bg-gray-50 transition-colors ${isParsingResume ? 'opacity-70 pointer-events-none' : ''}`}>
                            <div className="flex flex-col items-center justify-center pt-5 pb-6">
                                {isParsingResume ? (
                                    <>
                                        <Loader2 className="w-8 h-8 text-blue-500 animate-spin mb-2" />
                                        <p className="text-sm font-medium text-gray-700">Analyzing skills...</p>
                                    </>
                                ) : (
                                    <>
                                        <Upload className="w-7 h-7 text-gray-400 mb-2" />
                                        <p className="mb-1 text-sm text-gray-600"><span className="font-semibold text-blue-600">Click to attach resume</span></p>
                                        <p className="text-xs text-gray-500">PDF, DOCX, or TXT</p>
                                    </>
                                )}
                            </div>
                            <input 
                                type="file" 
                                className="hidden" 
                                accept=".pdf,.doc,.docx,.txt,application/pdf,text/plain"
                                onChange={handleResumeSelect}
                                disabled={isParsingResume}
                            />
                        </label>
                        <p className="mt-2 text-xs text-gray-500 text-center">Attaching a resume will automatically extract relevant technical skills and add them below.</p>
                    </div>

                    {/* Skills */}
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Skills</label>
                        <div className="border border-gray-300 rounded-md p-2 focus-within:ring-2 focus-within:ring-blue-500 focus-within:border-blue-500">
                            <div className="flex flex-wrap gap-2 mb-2">
                                {skills.map((skill) => (
                                    <span
                                        key={skill}
                                        className="inline-flex items-center px-2.5 py-0.5 rounded-full text-sm font-medium bg-blue-100 text-blue-800"
                                    >
                                        {skill}
                                        <button
                                            type="button"
                                            onClick={() => removeSkill(skill)}
                                            className="ml-1.5 inline-flex items-center justify-center w-4 h-4 rounded-full text-blue-400 hover:bg-blue-200 hover:text-blue-500"
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
                        <div className="border border-gray-300 rounded-md p-2 focus-within:ring-2 focus-within:ring-blue-500 focus-within:border-blue-500">
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

                    {/* Permissions (Only for Corporate Employees) */}
                    {techType === 'corporate' && (
                        <div className="pt-4 border-t border-gray-200">
                            <h3 className="text-sm font-medium text-gray-900 mb-4">Technician Permissions</h3>
                            <div className="space-y-3 pl-2">
                                <label className="flex items-center">
                                    <input
                                        type="checkbox"
                                        checked={permissions.canAddCustomers}
                                        onChange={(e) => setPermissions({ ...permissions, canAddCustomers: e.target.checked })}
                                        className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                                    />
                                    <span className="ml-2 text-sm text-gray-700">Can add new customers</span>
                                </label>
                                <label className="flex items-center">
                                    <input
                                        type="checkbox"
                                        checked={permissions.canAddLocations}
                                        onChange={(e) => setPermissions({ ...permissions, canAddLocations: e.target.checked })}
                                        className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                                    />
                                    <span className="ml-2 text-sm text-gray-700">Can add locations to existing customers</span>
                                </label>
                                <label className="flex items-center">
                                    <input
                                        type="checkbox"
                                        checked={permissions.canAddVendors}
                                        onChange={(e) => setPermissions({ ...permissions, canAddVendors: e.target.checked })}
                                        className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                                    />
                                    <span className="ml-2 text-sm text-gray-700">Can add new vendors</span>
                                </label>
                                <label className="flex items-center">
                                    <input
                                        type="checkbox"
                                        checked={permissions.canPurchaseMaterials}
                                        onChange={(e) => setPermissions({ ...permissions, canPurchaseMaterials: e.target.checked })}
                                        className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                                    />
                                    <span className="ml-2 text-sm text-gray-700">Can create purchase orders for materials</span>
                                </label>
                                <label className="flex items-center">
                                    <input
                                        type="checkbox"
                                        checked={permissions.canPurchaseTools}
                                        onChange={(e) => setPermissions({ ...permissions, canPurchaseTools: e.target.checked })}
                                        className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                                    />
                                    <span className="ml-2 text-sm text-gray-700">Can purchase tools</span>
                                </label>
                            </div>
                        </div>
                    )}

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
                            className="inline-flex items-center px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:opacity-50"
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
