import React, { useEffect, useState } from 'react';
import { View, Text, FlatList, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import { useAuth } from '../auth/AuthProvider';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase';
import { Job } from '../types';
import { useRouter } from 'expo-router';

export default function JobListScreen() {
    const { user } = useAuth();
    const router = useRouter();
    const [jobs, setJobs] = useState<Job[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (!user) return;

        const jobsRef = collection(db, 'jobs');
        // Query for jobs assigned to the current user
        const q = query(
            jobsRef,
            where('assigned_tech_id', '==', user.uid),
            where('status', 'in', ['scheduled', 'in_progress'])
        );

        const unsubscribe = onSnapshot(q, (snapshot) => {
            const jobList = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Job));
            setJobs(jobList);
            setLoading(false);
        }, (error) => {
            console.error("Error fetching jobs:", error);
            setLoading(false);
        });

        return () => unsubscribe();
    }, [user]);

    const renderItem = ({ item }: { item: Job }) => (
        <TouchableOpacity
            style={styles.card}
            onPress={() => router.push({ pathname: "/job/[id]", params: { id: item.id } })}
        >
            <View style={styles.header}>
                <Text style={styles.customerName}>{item.customer.name}</Text>
                <Text style={[styles.status, { color: item.status === 'in_progress' ? 'orange' : 'blue' }]}>
                    {item.status.toUpperCase()}
                </Text>
            </View>
            <Text style={styles.address}>{item.customer.address}</Text>
            <Text numberOfLines={2} style={styles.description}>{item.request.description}</Text>

            {item.estimates?.estimated_start_time && (
                <Text style={styles.schedule}>
                    Scheduled: {new Date(item.estimates.estimated_start_time.seconds * 1000).toLocaleString()}
                </Text>
            )}
        </TouchableOpacity>
    );

    if (loading) {
        return <View style={styles.center}><ActivityIndicator size="large" /></View>;
    }

    return (
        <View style={styles.container}>
            <Text style={styles.title}>My Jobs</Text>
            {jobs.length === 0 ? (
                <Text style={styles.emptyText}>No active jobs assigned.</Text>
            ) : (
                <FlatList
                    data={jobs}
                    renderItem={renderItem}
                    keyExtractor={item => item.id}
                    contentContainerStyle={styles.list}
                />
            )}
        </View>
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
    title: {
        fontSize: 24,
        fontWeight: 'bold',
        marginBottom: 16,
        color: '#333',
    },
    list: {
        paddingBottom: 20,
    },
    card: {
        backgroundColor: 'white',
        borderRadius: 8,
        padding: 16,
        marginBottom: 12,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 4,
        elevation: 2,
    },
    header: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        marginBottom: 8,
    },
    customerName: {
        fontSize: 18,
        fontWeight: 'bold',
    },
    status: {
        fontSize: 12,
        fontWeight: 'bold',
    },
    address: {
        color: '#666',
        marginBottom: 8,
    },
    description: {
        color: '#333',
        marginBottom: 8,
    },
    schedule: {
        color: '#007AFF',
        fontWeight: '500',
        marginTop: 4,
    },
    emptyText: {
        textAlign: 'center',
        color: '#999',
        marginTop: 40,
    },
});
