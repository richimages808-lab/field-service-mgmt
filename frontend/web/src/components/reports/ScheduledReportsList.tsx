import React, { useEffect, useState } from 'react';
import { collection, query, where, onSnapshot, deleteDoc, doc, updateDoc, Timestamp } from 'firebase/firestore';
import { db } from '../../firebase';
import { useAuth } from '../../auth/AuthProvider';
import { ScheduledReport } from '../../types/ScheduledReport';
import { Loader2, Plus, Calendar, Clock, Mail, MessageSquare, MoreVertical, Play, Pause, Trash2, Edit } from 'lucide-react';

interface Props {
    onEdit: (report: ScheduledReport) => void;
    onCreateNew: () => void;
}

export const ScheduledReportsList: React.FC<Props> = ({ onEdit, onCreateNew }) => {
    const { user } = useAuth();
    const [reports, setReports] = useState<ScheduledReport[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (!user?.org_id) return;

        const q = query(
            collection(db, 'scheduled_reports'),
            where('organizationId', '==', user.org_id)
        );

        const unsubscribe = onSnapshot(q, (snapshot) => {
            const data: ScheduledReport[] = [];
            snapshot.forEach((doc) => {
                data.push({ id: doc.id, ...doc.data() } as ScheduledReport);
            });
            // Sort by creation date descending
            data.sort((a, b) => b.createdAt.toMillis() - a.createdAt.toMillis());
            setReports(data);
            setLoading(false);
        });

        return () => unsubscribe();
    }, [user?.org_id]);

    const toggleActive = async (report: ScheduledReport) => {
        if (!report.id) return;
        await updateDoc(doc(db, 'scheduled_reports', report.id), {
            active: !report.active
        });
    };

    const deleteReport = async (reportId: string) => {
        if (window.confirm("Are you sure you want to delete this scheduled report?")) {
            await deleteDoc(doc(db, 'scheduled_reports', reportId));
        }
    };

    const formatDate = (timestamp: Timestamp | null) => {
        if (!timestamp) return 'Never';
        return timestamp.toDate().toLocaleString([], { dateStyle: 'short', timeStyle: 'short' });
    };

    if (loading) {
        return (
            <div className="flex justify-center p-12">
                <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
            </div>
        );
    }

    return (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
            <div className="flex justify-between items-center mb-6">
                <div>
                    <h2 className="text-xl font-semibold text-gray-900">Scheduled Reports</h2>
                    <p className="text-sm text-gray-500 mt-1">Manage reports delivered automatically via Email or SMS.</p>
                </div>
                <button
                    onClick={onCreateNew}
                    className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 transition-colors"
                >
                    <Plus className="w-4 h-4" />
                    New Schedule
                </button>
            </div>

            {reports.length === 0 ? (
                <div className="text-center py-12 bg-gray-50 rounded-lg border border-dashed border-gray-200">
                    <Calendar className="w-12 h-12 text-gray-400 mx-auto mb-3" />
                    <h3 className="text-lg font-medium text-gray-900 mb-1">No scheduled reports yet</h3>
                    <p className="text-sm text-gray-500 mb-4">You haven't set up any automated report deliveries.</p>
                    <button
                        onClick={onCreateNew}
                        className="text-blue-600 hover:text-blue-700 font-medium text-sm"
                    >
                        Create your first schedule
                    </button>
                </div>
            ) : (
                <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                        <thead>
                            <tr className="border-b border-gray-100 text-sm tracking-wide text-gray-500 uppercase">
                                <th className="py-3 px-4 font-medium">Name & Type</th>
                                <th className="py-3 px-4 font-medium">Delivery</th>
                                <th className="py-3 px-4 font-medium">Frequency</th>
                                <th className="py-3 px-4 font-medium">Next Run</th>
                                <th className="py-3 px-4 font-medium text-center">Status</th>
                                <th className="py-3 px-4 font-medium text-right">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-50">
                            {reports.map((report) => (
                                <tr key={report.id} className="hover:bg-gray-50/50 transition-colors">
                                    <td className="py-4 px-4">
                                        <p className="font-medium text-gray-900">{report.name}</p>
                                        <p className="text-xs text-gray-500 mt-0.5">{report.reportType.replace(/_/g, ' ').toUpperCase()}</p>
                                    </td>
                                    <td className="py-4 px-4">
                                        <div className="flex items-center gap-2">
                                            {report.deliveryMethod === 'email' ? <Mail className="w-4 h-4 text-blue-500" /> : <MessageSquare className="w-4 h-4 text-green-500" />}
                                            <span className="text-sm text-gray-700">{report.deliveryDestination}</span>
                                        </div>
                                        <span className="text-xs text-gray-500 mt-0.5 inline-block px-2 py-0.5 bg-gray-100 rounded-md">Format: {report.format.toUpperCase()}</span>
                                    </td>
                                    <td className="py-4 px-4">
                                        <span className="capitalize text-sm text-gray-700 flex items-center gap-1.5">
                                            <Clock className="w-4 h-4 text-gray-400" />
                                            {report.frequency}
                                        </span>
                                    </td>
                                    <td className="py-4 px-4">
                                        <p className="text-sm text-gray-700">{formatDate(report.nextRunAt)}</p>
                                        <p className="text-xs text-gray-400 mt-0.5">Last: {formatDate(report.lastRunAt)}</p>
                                    </td>
                                    <td className="py-4 px-4 text-center">
                                        <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium ${report.active ? 'bg-green-50 text-green-700' : 'bg-gray-100 text-gray-600'}`}>
                                            {report.active ? 'Active' : 'Paused'}
                                        </span>
                                    </td>
                                    <td className="py-4 px-4 text-right">
                                        <div className="flex items-center justify-end gap-2">
                                            <button
                                                onClick={() => toggleActive(report)}
                                                className="p-1.5 text-gray-400 hover:text-blue-600 rounded-md hover:bg-white transition-colors"
                                                title={report.active ? "Pause Schedule" : "Resume Schedule"}
                                            >
                                                {report.active ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
                                            </button>
                                            <button
                                                onClick={() => onEdit(report)}
                                                className="p-1.5 text-gray-400 hover:text-amber-600 rounded-md hover:bg-white transition-colors"
                                                title="Edit Schedule"
                                            >
                                                <Edit className="w-4 h-4" />
                                            </button>
                                            <button
                                                onClick={() => report.id && deleteReport(report.id)}
                                                className="p-1.5 text-gray-400 hover:text-red-600 rounded-md hover:bg-white transition-colors"
                                                title="Delete Schedule"
                                            >
                                                <Trash2 className="w-4 h-4" />
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )
            }
        </div >
    );
};
