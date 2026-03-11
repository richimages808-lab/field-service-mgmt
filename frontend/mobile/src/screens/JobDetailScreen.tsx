import React, { useEffect, useState } from 'react';
import { View, Text, TextInput, Button, StyleSheet, ScrollView, Switch, Alert } from 'react-native';
import { doc, getDoc, updateDoc, Timestamp, addDoc, collection } from 'firebase/firestore';
import { db } from '../firebase';
import { Job, UserProfile } from '../types';
import { calculateAutoSchedule } from '../lib/scheduling';
import { useAuth } from '../auth/AuthProvider';

export default function JobDetailScreen({ jobId }: { jobId: string }) {
    const { user } = useAuth();
    const [job, setJob] = useState<Job | null>(null);
    const [loading, setLoading] = useState(true);

    // Estimate Form State
    const [duration, setDuration] = useState('');
    const [materialsCost, setMaterialsCost] = useState('');
    const [materialsNeeded, setMaterialsNeeded] = useState(false);
    const [scheduledTime, setScheduledTime] = useState<Date | null>(null);

    useEffect(() => {
        fetchJob();
    }, [jobId]);

    const fetchJob = async () => {
        try {
            const docRef = doc(db, 'jobs', jobId);
            const docSnap = await getDoc(docRef);
            if (docSnap.exists()) {
                const jobData = { id: docSnap.id, ...docSnap.data() } as Job;
                setJob(jobData);

                // Init form
                if (jobData.estimates) {
                    setDuration(jobData.estimates.duration_minutes.toString());
                    setMaterialsCost(jobData.estimates.materials_cost.toString());
                    if (jobData.estimates.estimated_start_time) {
                        setScheduledTime(new Date(jobData.estimates.estimated_start_time.seconds * 1000));
                    }
                }
                setMaterialsNeeded(jobData.materials_needed || false);
            }
        } catch (error) {
            console.error("Error fetching job:", error);
        } finally {
            setLoading(false);
        }
    };

    const handleAutoSchedule = async () => {
        if (!job || !user) return;

        // Fetch Tech Profile for preferences
        // For MVP, we'll mock or fetch from 'users' collection
        // Let's assume we fetch it.
        try {
            const userDoc = await getDoc(doc(db, 'users', user.uid));
            const techProfile = { id: user.uid, ...userDoc.data() } as UserProfile;

            const result = calculateAutoSchedule(
                { ...job, estimates: { duration_minutes: parseInt(duration) || 60, materials_cost: 0 }, materials_needed: materialsNeeded },
                techProfile
            );

            Alert.alert(
                "Auto-Schedule Recommendation",
                result.reason,
                [
                    { text: "Cancel", style: "cancel" },
                    { text: "Accept", onPress: () => setScheduledTime(result.recommendedTime) }
                ]
            );
        } catch (e) {
            console.error(e);
            Alert.alert("Error", "Could not calculate schedule.");
        }
    };

    const handleSave = async () => {
        if (!job) return;
        try {
            const jobRef = doc(db, 'jobs', jobId);
            await updateDoc(jobRef, {
                estimates: {
                    duration_minutes: parseInt(duration) || 0,
                    materials_cost: parseFloat(materialsCost) || 0,
                    estimated_start_time: scheduledTime ? Timestamp.fromDate(scheduledTime) : null
                },
                materials_needed: materialsNeeded
            });
            Alert.alert("Success", "Estimates saved!");
        } catch (error) {
            console.error("Error saving:", error);
            Alert.alert("Error", "Failed to save estimates.");
        }
    };

    const handleSendQuote = async () => {
        if (!job) return;
        try {
            // 1. Update Job Status
            const jobRef = doc(db, 'jobs', jobId);
            await updateDoc(jobRef, {
                quote_status: 'sent'
            });

            // 2. Send Email to Customer
            if (job.customer.email) {
                await addDoc(collection(db, 'sent_emails'), {
                    to: job.customer.email,
                    subject: `Quote for Service: ${job.customer.name}`,
                    body: `Here is your quote:\n\nDuration: ${duration} mins\nMaterials: $${materialsCost}\n\nTotal Estimated Cost: $${(parseInt(duration) / 60 * 100) + parseFloat(materialsCost)} (Approx)\n\nPlease reply to approve.`,
                    createdAt: Timestamp.now()
                });
            }

            Alert.alert("Success", "Quote sent to customer!");
            fetchJob(); // Refresh
        } catch (error) {
            console.error("Error sending quote:", error);
            Alert.alert("Error", "Failed to send quote.");
        }
    };

    const handleApproveQuote = async () => {
        if (!job) return;
        try {
            const jobRef = doc(db, 'jobs', jobId);
            await updateDoc(jobRef, {
                quote_status: 'approved',
                status: 'scheduled' // Ensure it stays scheduled or moves to in_progress
            });
            Alert.alert("Success", "Quote marked as Approved!");
            fetchJob();
        } catch (error) {
            console.error("Error approving quote:", error);
            Alert.alert("Error", "Failed to approve quote.");
        }
    };

    if (loading || !job) return <View style={styles.center}><Text>Loading...</Text></View>;

    return (
        <ScrollView style={styles.container}>
            <View style={styles.section}>
                <Text style={styles.title}>{job.customer.name}</Text>
                <Text style={styles.address}>{job.customer.address}</Text>
                <Text style={styles.description}>{job.request.description}</Text>
                <Text style={[styles.status, { marginTop: 8 }]}>Quote Status: {job.quote_status?.toUpperCase() || 'DRAFT'}</Text>
            </View>

            <View style={styles.section}>
                <Text style={styles.heading}>Estimates & Scheduling</Text>

                <Text style={styles.label}>Duration (Minutes)</Text>
                <TextInput
                    style={styles.input}
                    keyboardType="numeric"
                    value={duration}
                    onChangeText={setDuration}
                    placeholder="e.g. 60"
                />

                <Text style={styles.label}>Materials Cost ($)</Text>
                <TextInput
                    style={styles.input}
                    keyboardType="numeric"
                    value={materialsCost}
                    onChangeText={setMaterialsCost}
                    placeholder="0.00"
                />

                <View style={styles.row}>
                    <Text style={styles.label}>Materials Needed?</Text>
                    <Switch value={materialsNeeded} onValueChange={setMaterialsNeeded} />
                </View>

                <Text style={styles.label}>Scheduled Start Time</Text>
                <View style={styles.row}>
                    <Text style={styles.value}>{scheduledTime ? scheduledTime.toLocaleString() : 'Not Scheduled'}</Text>
                    <Button title="Auto Schedule" onPress={handleAutoSchedule} />
                </View>
                <Text style={styles.hint}>Auto-schedule considers your working hours and material pickup time.</Text>

                <View style={styles.spacer} />
                <Button title="Save Estimates" onPress={handleSave} />
            </View>

            <View style={styles.section}>
                <Text style={styles.heading}>Quote Actions</Text>
                <View style={styles.buttonGap}>
                    <Button title="Send Quote to Customer" onPress={handleSendQuote} disabled={job.quote_status === 'approved'} />
                </View>
                <View style={styles.buttonGap}>
                    <Button title="Mark Quote Approved" onPress={handleApproveQuote} color="green" disabled={job.quote_status === 'approved'} />
                </View>
            </View>
        </ScrollView>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#f5f5f5',
        padding: 16,
    },
    center: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
    },
    section: {
        backgroundColor: 'white',
        padding: 16,
        borderRadius: 8,
        marginBottom: 16,
    },
    title: {
        fontSize: 22,
        fontWeight: 'bold',
        marginBottom: 4,
    },
    address: {
        color: '#666',
        marginBottom: 8,
    },
    description: {
        fontSize: 16,
        color: '#333',
    },
    status: {
        fontWeight: 'bold',
        color: 'blue',
    },
    heading: {
        fontSize: 18,
        fontWeight: 'bold',
        marginBottom: 12,
        borderBottomWidth: 1,
        borderBottomColor: '#eee',
        paddingBottom: 8,
    },
    label: {
        fontSize: 14,
        fontWeight: '500',
        color: '#555',
        marginBottom: 4,
    },
    input: {
        borderWidth: 1,
        borderColor: '#ddd',
        borderRadius: 4,
        padding: 8,
        marginBottom: 12,
        fontSize: 16,
    },
    row: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 12,
    },
    value: {
        fontSize: 16,
        fontWeight: 'bold',
    },
    hint: {
        fontSize: 12,
        color: '#888',
        marginBottom: 16,
        fontStyle: 'italic',
    },
    spacer: {
        height: 16,
    },
    buttonGap: {
        marginBottom: 10,
    }
});
