# Firebase Storage Rules Setup

## Problem
If image/video/PDF uploads are stuck on "loading", it's likely because Firebase Storage security rules are blocking the upload.

## Solution

### Step 1: Go to Firebase Console
1. Visit https://console.firebase.google.com/
2. Select your project: `react-learn-de7d0`

### Step 2: Navigate to Storage
1. Click on "Storage" in the left sidebar
2. Click on the "Rules" tab

### Step 3: Update the Rules
Replace the existing rules with the following:

```javascript
rules_version = '2';
service firebase.storage {
  match /b/{bucket}/o {
    // Allow authenticated users to upload files to their own folder
    match /attachments/{userId}/{allPaths=**} {
      allow read: if request.auth != null;
      allow write: if request.auth != null && request.auth.uid == userId;
    }
    
    // Default: deny all other access
    match /{allPaths=**} {
      allow read, write: if false;
    }
  }
}
```

### Step 4: Publish the Rules
1. Click "Publish" button
2. Wait for confirmation that rules are published

### Step 5: Test Again
Try uploading an image again. It should work now!

## Alternative: Temporary Development Rules (Less Secure)
If you want to test quickly (NOT recommended for production):

```javascript
rules_version = '2';
service firebase.storage {
  match /b/{bucket}/o {
    match /{allPaths=**} {
      allow read, write: if request.auth != null;
    }
  }
}
```

**Warning:** This allows any authenticated user to read/write any file. Only use for testing!

## Troubleshooting

### Still not working?
1. Check browser console (F12) for specific error messages
2. Verify you're signed in (check if user is authenticated)
3. Check Firebase Storage is enabled in your project
4. Verify your storage bucket name matches: `react-learn-de7d0.firebasestorage.app`

### Common Error Codes:
- `storage/unauthorized` - Storage rules are blocking the upload
- `storage/unauthenticated` - User is not signed in
- `storage/quota-exceeded` - Storage quota exceeded
- `storage/unknown` - Check if Storage is enabled in Firebase Console

