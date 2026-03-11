import React, { useEffect, useState } from 'react';
import { db } from '../firebase';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { UserProfile, Job } from '../types';

interface AssignTechModalProps {
    job: Job | null;
    isOpen: boolean;
    onClose: () => void;
    onAssign: (techId: string, techName: string) => void;
}

interface TechWithLoad extends UserProfile {
    activeJobs: number;
}

export const AssignTechModal: React.FC<AssignTechModalProps> = ({ job, isOpen, onClose, onAssign }) => {
    const [techs, setTechs] = useState<TechWithLoad[]>([]);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        if (isOpen && job) {
            fetchTechs();
        }
    }, [isOpen, job]);

    const fetchTechs = async () => {
        setLoading(true);
        try {
            // 1. Fetch all technicians in the org
            // Note: We assume we have a 'users' collection synced. 
            // For MVP, if empty, we might need to mock or ensure data exists.
            const usersRef = collection(db, 'users');
            const q = query(usersRef, where('org_id', '==', job?.org_id), where('role', '==', 'technician'));
            const snapshot = await getDocs(q);

            const techList: UserProfile[] = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as UserProfile));

            // 2. Calculate Load (Active Jobs) for each tech
            // This is an expensive query (N+1) if not optimized. 
            // Better: Maintain a counter on the user doc. 
            // For MVP: We will query jobs for each tech.
            const techsWithLoad = await Promise.all(techList.map(async (tech) => {
                const jobsRef = collection(db, 'jobs');
                const jobsQ = query(
                    jobsRef,
                    where('assigned_tech_id', '==', tech.id),
                    where('status', 'in', ['scheduled', 'in_progress'])
                );
                const jobsSnapshot = await getDocs(jobsQ);
                return { ...tech, activeJobs: jobsSnapshot.size };
            }));

            // 3. Sort by Load (Ascending)
            techsWithLoad.sort((a, b) => a.activeJobs - b.activeJobs);

            setTechs(techsWithLoad);
        } catch (error) {
            console.error("Error fetching techs:", error);
        } finally {
            setLoading(false);
        }
    };

    if (!isOpen || !job) return null;

    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white p-6 rounded-lg w-96 max-h-[80vh] overflow-y-auto">
                <h2 className="text-xl font-bold mb-4">Assign Technician</h2>
                <p className="text-sm text-gray-600 mb-4">Job: {job.customer.name}</p>

                {loading ? (
                    <p>Loading recommendations...</p>
                ) : (
                    <div className="space-y-2">
                        {techs.length === 0 && <p>No technicians found.</p>}
                        {techs.map(tech => (
                            <button
                                key={tech.id}
                                onClick={() => onAssign(tech.id, tech.name)}
                                className="w-full flex justify-between items-center p-3 border rounded hover:bg-blue-50 text-left"
                            >
                                <div>
                                    <div className="font-semibold">{tech.name}</div>
                                    <div className="text-xs text-gray-500">{tech.email}</div>
                                </div>
                                <div className={`text-sm font-bold px-2 py-1 rounded ${tech.activeJobs === 0 ? 'bg-green-100 text-green-800' : 'bg-gray-100'}`}>
                                    {tech.activeJobs} Active
                                </div>
                            </button>
                        ))}
                    </div>
                )}

                <button onClick={onClose} className="mt-4 w-full py-2 text-gray-600 hover:bg-gray-100 rounded">
                    Cancel
                </button>
            </div>
        </div>
    );
};
