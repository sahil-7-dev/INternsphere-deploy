// js/auth.js
import { auth, db } from "../firebase/firebase.js";

import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  sendPasswordResetEmail,
  setPersistence,
  browserLocalPersistence,
  browserSessionPersistence,
  GoogleAuthProvider,
  signInWithPopup
} from "https://www.gstatic.com/firebasejs/12.10.0/firebase-auth.js";

import {
  doc,
  setDoc,
  getDoc,
  serverTimestamp,
} from "https://www.gstatic.com/firebasejs/12.10.0/firebase-firestore.js";

export async function setRemember(remember) {
  await setPersistence(auth, remember ? browserLocalPersistence : browserSessionPersistence);
}

export async function signupEmail({ email, password, role, name = "", roleLabel = "" }) {
  const cred = await createUserWithEmailAndPassword(auth, email, password);

const baseData = {
  uid: cred.user.uid,
  email,
  name,
  role,
  roleLabel,
  createdAt: serverTimestamp(),
};

await setDoc(doc(db, "users", cred.user.uid), baseData);

if (role === "company") {
  await setDoc(doc(db, "companies", cred.user.uid), {
    ...baseData,
    companyName: name,
    verified: false,
  });
}

if (role === "student") {
  await setDoc(doc(db, "students", cred.user.uid), baseData);
}

  return cred.user;
}

export async function loginEmail({ email, password }) {
  const cred = await signInWithEmailAndPassword(auth, email, password);
  return cred.user;
}

export async function resetPassword(email) {
  await sendPasswordResetEmail(auth, email);
}

export async function getUserRole(uid) {
  const snap = await getDoc(doc(db, "users", uid));
  if (!snap.exists()) return null;

  const data = snap.data();
  return data.role || null;
}

import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.10.0/firebase-auth.js";

export function getCurrentUser() {
  return new Promise((resolve) => {
    const unsub = onAuthStateChanged(auth, (user) => {
      unsub();
      resolve(user);
    });
  });
}

export async function loginWithGoogle(defaultRole = "student") {

  const provider = new GoogleAuthProvider();

  provider.setCustomParameters({
    prompt: "select_account"
  });

  const result = await signInWithPopup(auth, provider);
  const user = result.user;

  const userRef = doc(db, "users", user.uid);
  const snap = await getDoc(userRef);

if (!snap.exists()) {

  const roleLabel =
    defaultRole === "company" ? "Company" :
    defaultRole === "student" ? "Student" :
    "Dev";

const baseData = {
  uid: user.uid,
  email: user.email || "",
  name: user.displayName || "",
  role: defaultRole,
  roleLabel,
  provider: "google",
  createdAt: serverTimestamp()
};

await setDoc(userRef, baseData);

if (defaultRole === "company") {
  await setDoc(doc(db, "companies", user.uid), {
    ...baseData,
    companyName: baseData.name,
    verified: false,
  });
}

if (defaultRole === "student") {
  await setDoc(doc(db, "students", user.uid), baseData);
}
}

  return user;
}
