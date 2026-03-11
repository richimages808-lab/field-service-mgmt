/**
 * Script to create the demo-org organization in Firestore
 * Run this once to fix demo account login issues
 *
 * Usage: node create-demo-org.js
 */

const admin = require('firebase-admin');
const path = require('path');

// Initialize Firebase Admin
const serviceAccount = require(path.join(__dirname, '..', 'serviceAccountKey.json'));

admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

async function createDemoOrg() {
    try {
        console.log('Creating demo-org organization...');

        const orgData = {
            name: 'Demo Organization',
            slug: 'demo-org',
            plan: 'small_business', // Give demo users access to all features
            maxTechs: 10,

            // Inbound Email Configuration
            inboundEmail: {
                prefix: 'demo',
                customDomains: [],
                autoReplyEnabled: false,
                autoReplyTemplate: 'Thank you for contacting us! We have received your message and will respond shortly.'
            },

            // Outbound Email Configuration
            outboundEmail: {
                fromName: 'Demo Organization Support',
                fromEmail: 'demo@service.dispatch-box.com',
                replyTo: null
            },

            // Branding
            branding: {
                logoUrl: '',
                primaryColor: '#6366f1',
                companyName: 'Demo Organization'
            },

            createdAt: admin.firestore.FieldValue.serverTimestamp(),
            updatedAt: admin.firestore.FieldValue.serverTimestamp()
        };

        await db.collection('organizations').doc('demo-org').set(orgData);

        console.log('✅ Successfully created demo-org organization!');
        console.log('Organization ID: demo-org');
        console.log('Plan: small_business');
        console.log('Max Techs: 10');

        process.exit(0);
    } catch (error) {
        console.error('❌ Error creating demo organization:', error);
        process.exit(1);
    }
}

createDemoOrg();
