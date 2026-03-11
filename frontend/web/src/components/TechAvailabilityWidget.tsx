import React, { useState, useEffect } from 'react';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { db } from '../firebase';
import { UserProfile } from '../types';
import { useAuth } from '../auth/AuthProvider';
import { checkTechAvailability, TechAvailability } from '../lib/techAvailability';
import { Calendar, Clock, User, CheckCircle, XCircle, AlertCircle } from 'lucide-react';

interface TechAvailabilityWidgetProps {
    requestedDate?: Date;
    estimatedDuration?: number;
    jobType?: string;
    onTechSelect?: (techId: string) => void;
}

export const TechAvailabilityWidget: React.FC<TechAvailabilityWidgetProps> = ({
    requestedDate,
    estimatedDuration,
    jobType,
    onTechSelect
}) => {
    const { user } = useAuth();
    const [loading, setLoading] = useState(true);
    const [availabilities, setAvailabilities] = useState<TechAvailability[]>([]);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (!user?.org_id) return;

        const fetchAvailability = async () => {
            setLoading(true);
            setError(null);

            try {
                // Get all technicians in the organization
                const techsQuery = query(
                    collection(db, 'users'),
                    where('org_id', '==', user.org_id),
                    where('role', '==', 'technician')
                );
                const snapshot = await getDocs(techsQuery);
                const technicians = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as UserProfile));

                if (technicians.length === 0) {
                    setError('No technicians found');
                    setLoading(false);
                    return;
                }

                // Check availability
                const results = await checkTechAvailability(technicians, {
                    requestedDate: requestedDate || new Date(),
                    estimatedDuration: estimatedDuration || 60,
                    org_id: user.org_id,
                    jobType
                });

                setAvailabilities(results);
            } catch (err) {
                console.error('Error checking tech availability:', err);
                setError('Failed to load technician availability');
            } finally {
                setLoading(false);
            }
        };

        fetchAvailability();
    }, [user?.org_id, requestedDate, estimatedDuration, jobType]);

    if (loading) {
        return (
            <div className="bg-white rounded-lg border border-gray-200 p-4">
                <div className="flex items-center gap-2 mb-4">
                    <Calendar className="w-5 h-5 text-blue-600" />
                    <h3 className="font-semibold text-gray-900">Technician Availability</h3>
                </div>
                <div className="text-center py-8">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
                    <p className="text-sm text-gray-500 mt-2">Checking availability...</p>
                </div>
            </div>
        );
    }

    if (error) {
        return (
            <div className="bg-white rounded-lg border border-gray-200 p-4">
                <div className="flex items-center gap-2 mb-4">
                    <Calendar className="w-5 h-5 text-blue-600" />
                    <h3 className="font-semibold text-gray-900">Technician Availability</h3>
                </div>
                <div className="text-center py-4 text-red-600">
                    <AlertCircle className="w-8 h-8 mx-auto mb-2" />
                    <p className="text-sm">{error}</p>
                </div>
            </div>
        );
    }

    return (
        <div className="bg-white rounded-lg border border-gray-200 p-4">
            <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                    <Calendar className="w-5 h-5 text-blue-600" />
                    <h3 className="font-semibold text-gray-900">Technician Availability</h3>
                </div>
                {requestedDate && (
                    <span className="text-xs text-gray-500">
                        {requestedDate.toLocaleDateString()}
                    </span>
                )}
            </div>

            {availabilities.length === 0 ? (
                <div className="text-center py-4 text-gray-500">
                    <User className="w-8 h-8 mx-auto mb-2 opacity-50" />
                    <p className="text-sm">No technicians available</p>
                </div>
            ) : (
                <div className="space-y-2">
                    {availabilities.map((availability) => (
                        <div
                            key={availability.techId}
                            onClick={() => onTechSelect && onTechSelect(availability.techId)}
                            className={`flex items-center justify-between p-3 rounded-lg border transition-all ${
                                availability.isAvailable
                                    ? 'border-green-200 bg-green-50 hover:bg-green-100 cursor-pointer'
                                    : 'border-gray-200 bg-gray-50'
                            }`}
                        >
                            <div className="flex items-center gap-3">
                                {availability.isAvailable ? (
                                    <CheckCircle className="w-5 h-5 text-green-600 flex-shrink-0" />
                                ) : (
                                    <XCircle className="w-5 h-5 text-gray-400 flex-shrink-0" />
                                )}
                                <div>
                                    <p className={`font-medium ${availability.isAvailable ? 'text-green-900' : 'text-gray-600'}`}>
                                        {availability.techName}
                                    </p>
                                    <div className="flex items-center gap-2 text-xs text-gray-600 mt-0.5">
                                        <Clock className="w-3 h-3" />
                                        <span>
                                            {availability.totalScheduledHours.toFixed(1)} hrs scheduled
                                        </span>
                                    </div>
                                </div>
                            </div>

                            <div className="text-right">
                                {availability.isAvailable ? (
                                    <div>
                                        <span className="inline-block px-2 py-1 bg-green-100 text-green-800 text-xs font-medium rounded">
                                            Available
                                        </span>
                                        {availability.nextAvailableSlot && (
                                            <p className="text-xs text-gray-600 mt-1">
                                                {availability.nextAvailableSlot.toLocaleTimeString([], {
                                                    hour: '2-digit',
                                                    minute: '2-digit'
                                                })}
                                            </p>
                                        )}
                                    </div>
                                ) : (
                                    <div>
                                        <span className="inline-block px-2 py-1 bg-gray-200 text-gray-700 text-xs font-medium rounded">
                                            Busy
                                        </span>
                                        {availability.reason && (
                                            <p className="text-xs text-gray-500 mt-1 max-w-[120px] text-right">
                                                {availability.reason}
                                            </p>
                                        )}
                                    </div>
                                )}
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {availabilities.length > 0 && (
                <div className="mt-4 pt-4 border-t border-gray-200">
                    <div className="flex items-center justify-between text-xs text-gray-600">
                        <span>
                            {availabilities.filter(a => a.isAvailable).length} available
                        </span>
                        <span>
                            {availabilities.filter(a => !a.isAvailable).length} busy
                        </span>
                    </div>
                </div>
            )}
        </div>
    );
};
