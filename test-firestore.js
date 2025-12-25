const { initializeApp } = require('firebase/app');
const { getFirestore, collection, getDocs } = require('firebase/firestore');

// Your web app's Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyCSxNF7nsl8WP7_yPLmtT0LVgxt7BmR_jc",
  authDomain: "react-learn-de7d0.firebaseapp.com",
  databaseURL: "https://react-learn-de7d0-default-rtdb.firebaseio.com",
  projectId: "react-learn-de7d0",
  storageBucket: "react-learn-de7d0.firebasestorage.app",
  messagingSenderId: "957685531583",
  appId: "1:957685531583:web:c27b0f00a978179c61d70a"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const firestore = getFirestore(app);

async function testFirestore() {
  try {
    console.log("Attempting to fetch users from Firestore...");
    const querySnapshot = await getDocs(collection(firestore, "users"));
    console.log(`Found ${querySnapshot.size} users:`);
    querySnapshot.forEach((doc) => {
      console.log(`${doc.id} =>`, doc.data());
    });
  } catch (error) {
    console.error("Error accessing Firestore:", error);
  }
}

testFirestore();