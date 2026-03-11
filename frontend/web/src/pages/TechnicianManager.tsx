import React, { useState, useEffect } from 'react';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase';
import { UserProfile } from '../types';
import { AddTechnicianModal } from '../components/dispatcher/AddTechnicianModal';
import { EditTechnicianModal } from '../components/dispatcher/EditTechnicianModal';
import { Plus, Search, Mail, Phone, MapPin, User, Wrench, Edit2, AlertCircle, Clock, CheckCircle } from 'lucide-react';

// Helper to get verification status badge
const getStatusBadge = (tech: UserProfile) => {
    // Check emailVerified field or status field
    if (tech.emailVerified === true || tech.status === 'active') {
        return (
            <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-800">
                <CheckCircle className="w-3 h-3 mr-1" />
                Active
            </span>
        );
    } else if (tech.status === 'pending_verification') {
        return (
            <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-yellow-100 text-yellow-800">
                <Clock className="w-3 h-3 mr-1" />
                Pending Verification
            </span>
        );
    } else {
        // New or unknown status
        return (
            <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-800">
                <AlertCircle className="w-3 h-3 mr-1" />
                New
            </span>
        );
    }
};

export const TechnicianManager: React.FC = () => {
    const [technicians, setTechnicians] = useState<UserProfile[]>([]);
    const [loading, setLoading] = useState(true);
    const [isAddModalOpen, setIsAddModalOpen] = useState(false);
    const [isEditModalOpen, setIsEditModalOpen] = useState(false);
    const [selectedTech, setSelectedTech] = useState<UserProfile | null>(null);
    const [searchTerm, setSearchTerm] = useState('');

    useEffect(() => {
        const usersRef = collection(db, 'users');
        const q = query(usersRef, where('role', '==', 'technician'));

        const unsubscribe = onSnapshot(q, (snapshot) => {
            const techs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as UserProfile));
            setTechnicians(techs);
            setLoading(false);
        }, (error) => {
            console.error("Error fetching technicians:", error);
            setLoading(false);
        });

        return () => unsubscribe();
    }, []);

    const filteredTechs = technicians.filter(tech =>
        tech.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        tech.email.toLowerCase().includes(searchTerm.toLowerCase())
    );

    const handleEditTech = (tech: UserProfile) => {
        setSelectedTech(tech);
        setIsEditModalOpen(true);
    };

    if (loading) return <div className="p-8 flex justify-center">Loading Technicians...</div>;

    return (
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
            <div className="flex justify-between items-center mb-6">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900">Technician Management</h1>
                    <p className="text-sm text-gray-500 mt-1">Manage your field service team | dispatch-box.com</p>
                </div>
                <button
                    onClick={() => setIsAddModalOpen(true)}
                    className="inline-flex items-center px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
                >
                    <Plus className="w-5 h-5 mr-2" />
                    Add Technician
                </button>
            </div>

            {/* Search and Filter */}
            <div className="mb-6">
                <div className="relative rounded-md shadow-sm max-w-md">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                        <Search className="h-5 w-5 text-gray-400" />
                    </div>
                    <input
                        type="text"
                        className="focus:ring-indigo-500 focus:border-indigo-500 block w-full pl-10 sm:text-sm border-gray-300 rounded-md p-2 border"
                        placeholder="Search technicians by name or email..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                    />
                </div>
            </div>

            {/* Tech Grid */}
            <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
                {filteredTechs.map((tech) => (
                    <div
                        key={tech.id}
                        className="bg-white overflow-hidden shadow rounded-lg border border-gray-200 hover:shadow-lg transition-shadow cursor-pointer"
                        onClick={() => handleEditTech(tech)}
                    >
                        <div className="px-4 py-5 sm:p-6">
                            <div className="flex items-center justify-between">
                                <div className="flex items-center">
                                    <div className="flex-shrink-0 bg-indigo-100 rounded-full p-3">
                                        <User className="h-6 w-6 text-indigo-600" />
                                    </div>
                                    <div className="ml-4">
                                        <h3 className="text-lg font-medium text-gray-900">{tech.name}</h3>
                                        <div className="flex flex-wrap gap-1 mt-1">
                                            <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${tech.techType === 'solopreneur'
                                                    ? 'bg-purple-100 text-purple-800'
                                                    : 'bg-gray-100 text-gray-800'
                                                }`}>
                                                {tech.techType === 'solopreneur' ? 'Contractor' : 'Employee'}
                                            </span>
                                            {getStatusBadge(tech)}
                                        </div>
                                    </div>
                                </div>
                                <Edit2 className="h-5 w-5 text-gray-400" />
                            </div>
                            <div className="mt-4 space-y-2">
                                <div className="flex items-center text-sm text-gray-500">
                                    <Mail className="flex-shrink-0 mr-1.5 h-4 w-4 text-gray-400" />
                                    {tech.email}
                                </div>
                                <div className="flex items-center text-sm text-gray-500">
                                    <Phone className="flex-shrink-0 mr-1.5 h-4 w-4 text-gray-400" />
                                    {tech.phone || 'No phone number'}
                                </div>
                                <div className="flex items-center text-sm text-gray-500">
                                    <MapPin className="flex-shrink-0 mr-1.5 h-4 w-4 text-gray-400" />
                                    {tech.homeLocation?.address || tech.address || 'No address'}
                                </div>
                            </div>
                            {/* Skills */}
                            {tech.specialties && tech.specialties.length > 0 && (
                                <div className="mt-4 pt-4 border-t border-gray-100">
                                    <div className="flex items-start">
                                        <Wrench className="flex-shrink-0 h-4 w-4 text-gray-400 mt-0.5 mr-2" />
                                        <div className="flex flex-wrap gap-1">
                                            {tech.specialties.slice(0, 4).map((skill) => (
                                                <span
                                                    key={skill}
                                                    className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-indigo-50 text-indigo-700"
                                                >
                                                    {skill}
                                                </span>
                                            ))}
                                            {tech.specialties.length > 4 && (
                                                <span className="text-xs text-gray-400">
                                                    +{tech.specialties.length - 4} more
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                ))}
            </div>

            {filteredTechs.length === 0 && (
                <div className="text-center py-12">
                    <User className="mx-auto h-12 w-12 text-gray-400" />
                    <h3 className="mt-2 text-sm font-medium text-gray-900">No technicians found</h3>
                    <p className="mt-1 text-sm text-gray-500">Get started by creating a new technician.</p>
                    <div className="mt-6">
                        <button
                            onClick={() => setIsAddModalOpen(true)}
                            className="inline-flex items-center px-4 py-2 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
                        >
                            <Plus className="w-5 h-5 mr-2" />
                            Add Technician
                        </button>
                    </div>
                </div>
            )}

            <AddTechnicianModal
                isOpen={isAddModalOpen}
                onClose={() => setIsAddModalOpen(false)}
            />

            <EditTechnicianModal
                isOpen={isEditModalOpen}
                onClose={() => {
                    setIsEditModalOpen(false);
                    setSelectedTech(null);
                }}
                technician={selectedTech}
            />
        </div>
    );
};
