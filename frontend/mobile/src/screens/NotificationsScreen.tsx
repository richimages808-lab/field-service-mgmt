import React, { useEffect, useState } from 'react';
import { View, Text, FlatList, StyleSheet, TouchableOpacity } from 'react-native';
import { useAuth } from '../auth/AuthProvider';
import { collection, query, where, onSnapshot, orderBy, updateDoc, doc } from 'firebase/firestore';
import { db } from '../firebase';

interface Notification {
    id: string;
    title: string;
    message: string;
    read: boolean;
    createdAt: any;
}

export default function NotificationsScreen() {
    const { user } = useAuth();
    const [notifications, setNotifications] = useState<Notification[]>([]);

    useEffect(() => {
        if (!user) return;

        const q = query(
            collection(db, 'notifications'),
            where('recipient_id', '==', user.uid),
            orderBy('createdAt', 'desc')
        );

        const unsubscribe = onSnapshot(q, (snapshot) => {
            const list = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Notification));
            setNotifications(list);
        });

        return () => unsubscribe();
    }, [user]);

    const markAsRead = async (id: string) => {
        try {
            await updateDoc(doc(db, 'notifications', id), { read: true });
        } catch (error) {
            console.error("Error marking read:", error);
        }
    };

    const renderItem = ({ item }: { item: Notification }) => (
        <TouchableOpacity
            style={[styles.card, !item.read && styles.unread]}
            onPress={() => markAsRead(item.id)}
        >
            <View style={styles.header}>
                <Text style={styles.title}>{item.title}</Text>
                {!item.read && <View style={styles.dot} />}
            </View>
            <Text style={styles.message}>{item.message}</Text>
            <Text style={styles.date}>{item.createdAt?.toDate().toLocaleString()}</Text>
        </TouchableOpacity>
    );

    return (
        <View style={styles.container}>
            <Text style={styles.headerTitle}>Notifications</Text>
            <FlatList
                data={notifications}
                renderItem={renderItem}
                keyExtractor={item => item.id}
                contentContainerStyle={styles.list}
            />
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#f5f5f5',
        padding: 16,
    },
    headerTitle: {
        fontSize: 24,
        fontWeight: 'bold',
        marginBottom: 16,
    },
    list: {
        paddingBottom: 20,
    },
    card: {
        backgroundColor: 'white',
        padding: 16,
        borderRadius: 8,
        marginBottom: 12,
        borderLeftWidth: 4,
        borderLeftColor: 'transparent',
    },
    unread: {
        borderLeftColor: '#007AFF',
        backgroundColor: '#F0F8FF',
    },
    header: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 4,
    },
    title: {
        fontWeight: 'bold',
        fontSize: 16,
    },
    message: {
        color: '#333',
        marginBottom: 8,
    },
    date: {
        fontSize: 12,
        color: '#999',
    },
    dot: {
        width: 8,
        height: 8,
        borderRadius: 4,
        backgroundColor: '#007AFF',
    },
});
