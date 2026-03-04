import { initializeApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';
import { initializeAuth, getReactNativePersistence } from 'firebase/auth';
import AsyncStorage from '@react-native-async-storage/async-storage';

const firebaseConfig = {
  apiKey: "AIzaSyCujKNSPh-yTqx0YWd95NijjSNZncBS3gQ",
  authDomain: "dogwalkapp-d9462.firebaseapp.com",
  projectId: "dogwalkapp-d9462",
  storageBucket: "dogwalkapp-d9462.firebasestorage.app",
  messagingSenderId: "816011611109",
  appId: "1:816011611109:web:e9e035241b8eafc9e9fd0c",
};

const app = initializeApp(firebaseConfig);

export const db = getFirestore(app);
export const auth = initializeAuth(app, {
  persistence: getReactNativePersistence(AsyncStorage),
});
