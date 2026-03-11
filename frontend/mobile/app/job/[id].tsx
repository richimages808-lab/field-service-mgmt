import JobDetailScreen from '../../src/screens/JobDetailScreen';
import { useLocalSearchParams } from 'expo-router';

export default function JobDetailRoute() {
    const { id } = useLocalSearchParams();
    // Ensure id is a string
    const jobId = Array.isArray(id) ? id[0] : id;

    return <JobDetailScreen jobId={jobId} />;
}
