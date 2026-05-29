import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { storage } from "../firebase";

export const uploadFile = async (file: File, path: string): Promise<string> => {
    try {
        console.log(`Starting upload to ${path}...`);
        const storageRef = ref(storage, path);
        const snapshot = await uploadBytes(storageRef, file);
        console.log(`Upload complete.`);
        const downloadURL = await getDownloadURL(snapshot.ref);
        console.log(`Download URL retrieved: ${downloadURL}`);
        return downloadURL;
    } catch (error) {
        console.error("Error uploading file:", error);
        throw error;
    }
};
