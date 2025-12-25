// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";

// Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyCSxNF7nsl8WP7_yPLmtT0LVgxt7BmR_jc",
  authDomain: "react-learn-de7d0.firebaseapp.com",
  databaseURL: "https://react-learn-de7d0-default-rtdb.firebaseio.com",
  projectId: "react-learn-de7d0",

  // ✅ FIXED LINE
  storageBucket: "react-learn-de7d0.appspot.com",

  messagingSenderId: "957685531583",
  appId: "1:957685531583:web:c27b0f00a978179c61d70a",
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const firestore = getFirestore(app);
export const storage = getStorage(app);

// Analytics (client-side only)
let analytics;
if (typeof window !== "undefined") {
  import("firebase/analytics").then(({ getAnalytics }) => {
    analytics = getAnalytics(app);
  });
}

export { app, analytics };
