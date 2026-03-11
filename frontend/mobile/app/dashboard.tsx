import JobListScreen from '../src/screens/JobListScreen';
import { View, Button, StyleSheet, SafeAreaView, Text, TouchableOpacity } from 'react-native';
import { useAuth } from '../src/auth/AuthProvider';
import { useRouter } from 'expo-router';

export default function Dashboard() {
    const { logout } = useAuth();
    const router = useRouter();

    return (
        <SafeAreaView style={styles.container}>
            <View style={styles.header}>
                <TouchableOpacity onPress={() => router.push("/notifications")} style={styles.notifButton}>
                    <Text style={styles.notifText}>🔔 Notifications</Text>
                </TouchableOpacity>
                <Button title="Logout" onPress={logout} color="red" />
            </View>
            <JobListScreen />
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#fff',
    },
    header: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: 10,
        borderBottomWidth: 1,
        borderBottomColor: '#eee',
    },
    notifButton: {
        padding: 8,
    },
    notifText: {
        fontSize: 16,
    }
});
