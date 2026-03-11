import React, { useState } from 'react';
import { Job } from '../types';
import { X, Camera, Cpu, Save } from 'lucide-react';
import { doc, updateDoc } from 'firebase/firestore';
import { db } from '../firebase';

interface JobDetailsModalProps {
    job: Job;
    onClose: () => void;
    onUpdate: () => void; // Trigger refresh
}

export const JobDetailsModal: React.FC<JobDetailsModalProps> = ({ job, onClose, onUpdate }) => {
    const [activeTab, setActiveTab] = useState<'details' | 'photos' | 'parts' | 'notes'>('details');
    const [internalNotes, setInternalNotes] = useState(job.notes?.internal || '');
    const [partsDescription, setPartsDescription] = useState(job.parts_description || '');
    const [aiSuggestions, setAiSuggestions] = useState<string[]>([]);
    const [isAnalyzing, setIsAnalyzing] = useState(false);

    const handleSaveNotes = async () => {
        try {
            const jobRef = doc(db, 'jobs', job.id);
            await updateDoc(jobRef, {
                'notes.internal': internalNotes,
                parts_description: partsDescription
            });
            onUpdate();
            alert('Saved successfully!');
        } catch (error) {
            console.error("Error saving:", error);
            alert('Failed to save.');
        }
    };

    const handleAnalyzeAI = () => {
        setIsAnalyzing(true);
        // Mock AI Analysis based on description keywords
        setTimeout(() => {
            const desc = job.request.description.toLowerCase();
            const suggestions = [];

            if (desc.includes('leak') || desc.includes('water')) suggestions.push('Teflon Tape', 'Pipe Sealant', 'Washers');
            if (desc.includes('ac') || desc.includes('cool')) suggestions.push('Air Filter (20x20)', 'Freon R-410A', 'Capacitor');
            if (desc.includes('lock') || desc.includes('door')) suggestions.push('Lock Cylinder', 'Door Latch', 'WD-40');
            if (desc.includes('light') || desc.includes('power')) suggestions.push('Wire Nuts', 'Breaker 20A', 'LED Bulbs');

            if (suggestions.length === 0) suggestions.push('General Tool Kit', 'Safety Gloves');

            setAiSuggestions(suggestions);
            setIsAnalyzing(false);
        }, 1500);
    };

    const addSuggestion = (part: string) => {
        setPartsDescription(prev => prev ? `${prev}, ${part}` : part);
    };

    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-lg shadow-xl w-full max-w-2xl h-[80vh] flex flex-col">
                {/* Header */}
                <div className="flex justify-between items-center p-6 border-b border-gray-200">
                    <div>
                        <h2 className="text-xl font-bold text-gray-800">{job.customer.name}</h2>
                        <p className="text-sm text-gray-500">{job.customer.address}</p>
                    </div>
                    <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
                        <X className="w-6 h-6" />
                    </button>
                </div>

                {/* Tabs */}
                <div className="flex border-b border-gray-200">
                    <button
                        onClick={() => setActiveTab('details')}
                        className={`flex-1 py-3 text-sm font-medium text-center border-b-2 transition-colors
                            ${activeTab === 'details' ? 'border-blue-500 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
                    >
                        Details
                    </button>
                    <button
                        onClick={() => setActiveTab('photos')}
                        className={`flex-1 py-3 text-sm font-medium text-center border-b-2 transition-colors
                            ${activeTab === 'photos' ? 'border-blue-500 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
                    >
                        Photos
                    </button>
                    <button
                        onClick={() => setActiveTab('parts')}
                        className={`flex-1 py-3 text-sm font-medium text-center border-b-2 transition-colors
                            ${activeTab === 'parts' ? 'border-blue-500 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
                    >
                        AI Parts
                    </button>
                    <button
                        onClick={() => setActiveTab('notes')}
                        className={`flex-1 py-3 text-sm font-medium text-center border-b-2 transition-colors
                            ${activeTab === 'notes' ? 'border-blue-500 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
                    >
                        Notes
                    </button>
                </div>

                {/* Content */}
                <div className="flex-1 overflow-y-auto p-6">
                    {activeTab === 'details' && (
                        <div className="space-y-4">
                            <div>
                                <h3 className="text-sm font-medium text-gray-500 uppercase">Description</h3>
                                <p className="text-gray-800 mt-1">{job.request.description}</p>
                            </div>
                            <div>
                                <h3 className="text-sm font-medium text-gray-500 uppercase">Contact</h3>
                                <p className="text-gray-800 mt-1">{job.customer.phone}</p>
                                <p className="text-gray-800">{job.customer.email}</p>
                            </div>
                            <div>
                                <h3 className="text-sm font-medium text-gray-500 uppercase">Priority</h3>
                                <span className={`inline-block px-2 py-1 text-xs font-semibold rounded-full mt-1
                                    ${job.priority === 'high' ? 'bg-red-100 text-red-800' : 'bg-blue-100 text-blue-800'}`}>
                                    {job.priority.toUpperCase()}
                                </span>
                            </div>
                        </div>
                    )}

                    {activeTab === 'photos' && (
                        <div className="grid grid-cols-2 gap-4">
                            {job.request.photos && job.request.photos.length > 0 ? (
                                job.request.photos.map((photo, idx) => (
                                    <img key={idx} src={photo} alt={`Job ${idx}`} className="w-full h-48 object-cover rounded-lg shadow-sm" />
                                ))
                            ) : (
                                <div className="col-span-2 flex flex-col items-center justify-center h-48 bg-gray-50 rounded-lg border-2 border-dashed border-gray-300">
                                    <Camera className="w-8 h-8 text-gray-400 mb-2" />
                                    <p className="text-gray-500">No photos uploaded</p>
                                </div>
                            )}
                        </div>
                    )}

                    {activeTab === 'parts' && (
                        <div className="space-y-6">
                            <div className="bg-indigo-50 p-4 rounded-lg border border-indigo-100">
                                <div className="flex items-center justify-between mb-4">
                                    <h3 className="font-bold text-indigo-900 flex items-center gap-2">
                                        <Cpu className="w-5 h-5" />
                                        AI Recommendation Engine
                                    </h3>
                                    <button
                                        onClick={handleAnalyzeAI}
                                        disabled={isAnalyzing}
                                        className="text-sm bg-indigo-600 text-white px-3 py-1.5 rounded hover:bg-indigo-700 disabled:opacity-50"
                                    >
                                        {isAnalyzing ? 'Analyzing...' : 'Analyze Job'}
                                    </button>
                                </div>

                                {aiSuggestions.length > 0 && (
                                    <div className="space-y-2">
                                        <p className="text-sm text-indigo-700 mb-2">Based on the job description and photos, we recommend:</p>
                                        <div className="flex flex-wrap gap-2">
                                            {aiSuggestions.map((part, idx) => (
                                                <button
                                                    key={idx}
                                                    onClick={() => addSuggestion(part)}
                                                    className="bg-white text-indigo-600 border border-indigo-200 px-3 py-1 rounded-full text-sm hover:bg-indigo-50 transition-colors"
                                                >
                                                    + {part}
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Parts List / Notes</label>
                                <textarea
                                    value={partsDescription}
                                    onChange={(e) => setPartsDescription(e.target.value)}
                                    className="w-full h-32 rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 p-2 border"
                                    placeholder="List required parts here..."
                                />
                            </div>
                        </div>
                    )}

                    {activeTab === 'notes' && (
                        <div className="space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Internal Notes (Tech Only)</label>
                                <textarea
                                    value={internalNotes}
                                    onChange={(e) => setInternalNotes(e.target.value)}
                                    className="w-full h-48 rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 p-2 border"
                                    placeholder="Add notes about access, pets, or specific instructions..."
                                />
                            </div>
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div className="p-6 border-t border-gray-200 bg-gray-50 flex justify-end gap-3">
                    <button
                        onClick={onClose}
                        className="px-4 py-2 text-gray-700 hover:text-gray-900 font-medium"
                    >
                        Cancel
                    </button>
                    <button
                        onClick={handleSaveNotes}
                        className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg font-medium shadow-sm"
                    >
                        <Save className="w-4 h-4" />
                        Save Changes
                    </button>
                </div>
            </div>
        </div>
    );
};
