---
name: firebase_upload_standard
description: Standard architecture for storing images and files to Firebase Storage instead of Firestore as base64.
---

# Firebase Upload Standard

This skill defines the methodology for handling file and image uploads within the application to avoid bloating Firestore.

## Problem statement
Storing images as base64 encoded strings directly into Firestore documents significantly increases query payload size, slows down the UI, and hits Firestore document size limits quickly. This was previously observed with Job Signatures.

## Implementation Standard
When adding features that require file or image attachments (e.g. photos, signatures, PDFs):

1. **Upload to Firebase Storage First**: 
   - Accept the `File` or `Blob` object from the UI input.
   - Generate a unique file path (e.g. `images/signatures/${jobId}_${timestamp}.png`).
   - Use `uploadBytes` or `uploadString` (if coming from a canvas) to Firebase Cloud Storage.

2. **Retrieve the Download URL**:
   - Call `getDownloadURL(ref)` upon successful upload.

3. **Store the URL in Firestore**:
   - Write the resulting HTTPS URL string to the corresponding Firestore document (`signatureUrl`, `equipmentPhotoUrl`, etc.).
   - NEVER write the base64 string directly into the resulting Firestore document.

## Related Code Checks
- Ensure Storage Rules (`storage.rules`) allow authenticated writes to the requested paths.
- Ensure Firestore rules check that image fields are strings starting with `https://`.
