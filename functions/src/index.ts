/**
 * Lucky Seven — Cloud Functions
 *
 * Firestore onCreate trigger: sends an email notification whenever
 * a new feedback document is created in /feedback/{docId}.
 *
 * Setup:
 *   1. npm install (in functions/)
 *   2. firebase functions:secrets:set RESEND_API_KEY
 *   3. firebase deploy --only functions
 *
 * Uses Resend (https://resend.com) for transactional email.
 * Free tier: 3,000 emails/month — more than enough.
 *
 * Spam throttle: skips email if the same anonymous uid submitted
 * feedback less than 5 minutes ago (checked via Firestore query).
 */

import { initializeApp } from "firebase-admin/app";
import { getFirestore, Timestamp } from "firebase-admin/firestore";
import { onDocumentCreated } from "firebase-functions/v2/firestore";
import { onCall, HttpsError } from "firebase-functions/v2/https";
import { defineSecret } from "firebase-functions/params";

initializeApp();

const RESEND_API_KEY = defineSecret("RESEND_API_KEY");
const DEV_ACCESS_CODE = defineSecret("DEV_ACCESS_CODE");
const NOTIFY_EMAIL = "kamalhazriq@gmail.com";
const THROTTLE_SECONDS = 300; // 5 minutes

interface FeedbackData {
  rating: number;
  name: string;
  message: string;
  appVersion: string;
  theme: string;
  userId: string;
  createdAt: Timestamp;
}

export const onFeedbackCreated = onDocumentCreated(
  {
    document: "feedback/{docId}",
    secrets: [RESEND_API_KEY],
  },
  async (event) => {
    const snap = event.data;
    if (!snap) return;

    const data = snap.data() as FeedbackData;
    const db = getFirestore();

    // --- Spam throttle: skip if same user submitted recently ---
    if (data.userId) {
      const recentQuery = await db
        .collection("feedback")
        .where("userId", "==", data.userId)
        .where(
          "createdAt",
          ">",
          Timestamp.fromMillis(Date.now() - THROTTLE_SECONDS * 1000)
        )
        .orderBy("createdAt", "desc")
        .limit(2)
        .get();

      // If there are 2+ docs within window, this is a repeat — skip email
      if (recentQuery.size >= 2) {
        console.log(
          `Throttled: user ${data.userId} submitted feedback too recently.`
        );
        return;
      }
    }

    // --- Build email ---
    const stars = "\u2605".repeat(data.rating) + "\u2606".repeat(5 - data.rating);

    const htmlBody = `
      <div style="font-family: system-ui, sans-serif; max-width: 480px; margin: 0 auto;">
        <h2 style="color: #f59e0b;">Lucky Seven Feedback</h2>
        <table style="border-collapse: collapse; width: 100%;">
          <tr>
            <td style="padding: 6px 12px; color: #94a3b8; font-size: 13px;">Rating</td>
            <td style="padding: 6px 12px; font-size: 18px; color: #f59e0b;">${stars}</td>
          </tr>
          <tr>
            <td style="padding: 6px 12px; color: #94a3b8; font-size: 13px;">Name</td>
            <td style="padding: 6px 12px; color: #e2e8f0;">${escapeHtml(data.name)}</td>
          </tr>
          <tr>
            <td style="padding: 6px 12px; color: #94a3b8; font-size: 13px;">Version</td>
            <td style="padding: 6px 12px; color: #e2e8f0;">${escapeHtml(data.appVersion)}</td>
          </tr>
          <tr>
            <td style="padding: 6px 12px; color: #94a3b8; font-size: 13px;">Theme</td>
            <td style="padding: 6px 12px; color: #e2e8f0;">${escapeHtml(data.theme)}</td>
          </tr>
        </table>
        <div style="margin-top: 16px; padding: 12px; background: #1e293b; border-radius: 8px; color: #e2e8f0; font-size: 14px; white-space: pre-wrap;">${escapeHtml(data.message)}</div>
        <p style="margin-top: 16px; font-size: 11px; color: #64748b;">
          Document: feedback/${event.params.docId}<br/>
          User: ${data.userId ?? "unknown"}
        </p>
      </div>
    `;

    // --- Send via Resend ---
    try {
      const resp = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${RESEND_API_KEY.value()}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: "Lucky Seven <onboarding@resend.dev>",
          to: [NOTIFY_EMAIL],
          subject: `[Lucky Seven] ${stars} Feedback from ${data.name}`,
          html: htmlBody,
        }),
      });

      if (!resp.ok) {
        const errText = await resp.text();
        console.error("Resend API error:", resp.status, errText);
      } else {
        console.log("Feedback email sent successfully.");
      }
    } catch (err) {
      console.error("Failed to send feedback email:", err);
    }
  }
);

/** Basic HTML escape to prevent XSS in email body */
function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// ─── Developer Mode ─────────────────────────────────────────────
// Callable function: validates a dev access code against a Firebase secret.
// If valid, writes a per-UID devAccess doc under the game's subcollection.

export const activateDevMode = onCall(
  {
    secrets: [DEV_ACCESS_CODE],
  },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "Must be signed in");
    }

    const { gameId, code } = request.data as { gameId?: string; code?: string };
    if (!gameId || typeof gameId !== "string") {
      throw new HttpsError("invalid-argument", "Missing gameId");
    }
    if (!code || typeof code !== "string") {
      throw new HttpsError("invalid-argument", "Missing code");
    }

    // Validate code against server-side secret
    if (code !== DEV_ACCESS_CODE.value()) {
      throw new HttpsError("permission-denied", "Invalid developer code");
    }

    // Verify the game exists
    const db = getFirestore();
    const gameSnap = await db.doc(`games/${gameId}`).get();
    if (!gameSnap.exists) {
      throw new HttpsError("not-found", "Game not found");
    }

    // Write dev access document for this UID
    await db.doc(`games/${gameId}/devAccess/${request.auth.uid}`).set({
      activatedAt: Date.now(),
      uid: request.auth.uid,
      privileges: {
        canSeeAllCards: true,
        canPeekDrawPile: true,
        canInspectGameState: true,
        canUseCheatActions: true,
      },
    });

    console.log(
      `Dev mode activated: uid=${request.auth.uid}, game=${gameId}`
    );

    return { success: true };
  }
);

export const deactivateDevMode = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "Must be signed in");
  }

  const { gameId } = request.data as { gameId?: string };
  if (!gameId || typeof gameId !== "string") {
    throw new HttpsError("invalid-argument", "Missing gameId");
  }

  const db = getFirestore();
  await db.doc(`games/${gameId}/devAccess/${request.auth.uid}`).delete();

  console.log(
    `Dev mode deactivated: uid=${request.auth.uid}, game=${gameId}`
  );

  return { success: true };
});
