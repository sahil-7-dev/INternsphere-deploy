// firebase/firebase.js

import { initializeApp } from "https://www.gstatic.com/firebasejs/12.10.0/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/12.10.0/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/12.10.0/firebase-firestore.js";
import { getStorage } from "https://www.gstatic.com/firebasejs/12.10.0/firebase-storage.js";

const firebaseConfig = {
  apiKey: "AIzaSyDKnp6JeZyiYsT3MC4T7HV4Z5yXMoR3lPw",
  authDomain: "internsphere-9c869.firebaseapp.com",
  projectId: "internsphere-9c869",
  storageBucket: "internsphere-9c869.firebasestorage.app",
  messagingSenderId: "46919610654",
  appId: "1:46919610654:web:b24a8df1ea62298fa1d90f"
};

const app = initializeApp(firebaseConfig);

// Firebase services
export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);
