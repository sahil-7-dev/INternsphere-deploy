// js/report.js

import { auth, db } from "../firebase/firebase.js";
import {
  addDoc,
  collection,
  serverTimestamp,
} from "https://www.gstatic.com/firebasejs/12.10.0/firebase-firestore.js";

window.reportTarget = async function reportTarget(targetType, targetId, label = "") {
  if (!targetType || !targetId) return;
  const user = auth.currentUser;
  if (!user) {
    alert("Please sign in to report content.");
    return;
  }

  const niceLabel = label ? ` "${label}"` : "";
  const reason = prompt(
    `Report this ${targetType}${niceLabel}?\n\n` +
    `Tell us what's wrong (spam, scam, inappropriate content, etc.) — this goes to the InternSphere admin team.\n`
    , ""
  );
  if (reason === null) return;
  const trimmed = reason.trim().slice(0, 600);
  if (!trimmed) {
    alert("Please provide a reason so the admin team can review.");
    return;
  }

  try {
    await addDoc(collection(db, "reports"), {
      targetType,
      targetId,
      reporterUid:   user.uid,
      reporterEmail: user.email || "",
      reason:        trimmed,
      createdAt:     serverTimestamp(),
      resolvedAt:    null,
      resolvedBy:    null,
      resolution:    null,
    });
    alert("Thanks — your report was submitted. The admin team will review it.");
  } catch (err) {
    console.error("[report]", err);
    alert("Could not submit report: " + (err?.message || err));
  }
};
