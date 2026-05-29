import { db } from '../firebase';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';

export const sendNotification = async (recipientId: string, title: string, message: string, type: 'assignment' | 'system' = 'system') => {
    try {
        await addDoc(collection(db, 'notifications'), {
            recipient_id: recipientId,
            title,
            message,
            type,
            read: false,
            createdAt: serverTimestamp()
        });
        console.log(`Notification sent to ${recipientId}: ${title}`);
    } catch (error) {
        console.error("Error sending notification:", error);
    }
};

export const sendEmail = async (to: string, subject: string, body: string) => {
    try {
        await addDoc(collection(db, 'sent_emails'), {
            to,
            subject,
            body,
            createdAt: serverTimestamp()
        });
        console.log(`Mock Email sent to ${to}: ${subject}`);
    } catch (error) {
        console.error("Error sending email:", error);
    }
};
