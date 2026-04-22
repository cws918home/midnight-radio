import dotenv from "dotenv";
dotenv.config(); // Explicitly call config

import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import { initializeApp, cert, getApps } from "firebase-admin/app";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { getMessaging } from "firebase-admin/messaging";
import fs from "fs";

// Read client config to get database ID
const clientConfigPath = path.join(process.cwd(), 'firebase-applet-config.json');
let firestoreDatabaseId = '(default)';
if (fs.existsSync(clientConfigPath)) {
  try {
    const clientConfig = JSON.parse(fs.readFileSync(clientConfigPath, 'utf-8'));
    firestoreDatabaseId = clientConfig.firestoreDatabaseId || '(default)';
    console.log(`Using Firestore Database ID: ${firestoreDatabaseId}`);
  } catch (err) {
    console.error("Failed to read client config for database ID", err);
  }
}

// Initialize Firebase Admin
if (process.env.FIREBASE_SERVICE_ACCOUNT) {
  try {
    const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
    if (getApps().length === 0) {
      initializeApp({
        credential: cert(serviceAccount)
      });
      console.log("Firebase Admin initialized successfully.");
    }
  } catch (err) {
    console.error("Firebase Admin initialization failed:", err);
  }
} else {
  console.warn("FIREBASE_SERVICE_ACCOUNT not found in environment variables.");
}

const db = getApps().length > 0 ? getFirestore(firestoreDatabaseId) : null;
const messaging = getApps().length > 0 ? getMessaging() : null;
const WORRY_CATEGORIES = ['취업', '진로', '학업', '시험', '소득', '주거', '연애', '결혼', '부모', '자녀', '우울', '불안', '외로움', '직장', '워라밸', '외모', '자존감', '건강', '노후', '미래', '잡담'] as const;
const WORRY_CATEGORY_SET = new Set<string>(WORRY_CATEGORIES);
const INVALID_PUSH_TOKEN_ERROR_CODES = new Set([
  'messaging/invalid-registration-token',
  'messaging/registration-token-not-registered',
]);
const LEGACY_FALLBACK_INSTANCE_ID = 'legacy-scalar-fallback';

function summarizeToken(token: string) {
  return token.length <= 18
    ? token
    : `${token.slice(0, 12)}...${token.slice(-6)}`;
}

function isInvalidPushTokenError(err: unknown): err is Error & { code?: string } {
  return err instanceof Error
    && typeof (err as { code?: string }).code === 'string'
    && INVALID_PUSH_TOKEN_ERROR_CODES.has((err as { code?: string }).code as string);
}

function normalizeWorryCategories(rawCategories: unknown): string[] {
  const values = Array.isArray(rawCategories)
    ? rawCategories
    : typeof rawCategories === 'string'
      ? rawCategories.split(',')
      : [];

  const normalized: string[] = [];
  const seen = new Set<string>();

  for (const value of values) {
    if (typeof value !== 'string') continue;

    const trimmed = value.trim();
    if (!trimmed || seen.has(trimmed) || !WORRY_CATEGORY_SET.has(trimmed)) {
      continue;
    }

    seen.add(trimmed);
    normalized.push(trimmed);
  }

  return normalized;
}

async function moderateAndInferWorryCategories(content: string, strictRetry = false) {
  const systemInstruction = `You are a moderator and category inference engine for a Korean anonymous worry-sharing app.
Use ONLY this fixed category vocabulary:
${WORRY_CATEGORIES.join(', ')}

Decision policy:
1. Reject ONLY when the text itself is inappropriate, abusive, violent, sexually explicit, hateful, or obvious spam.
   In that case, return exactly:
   { "status": "rejected", "reason": "부적절한 표현이 감지되었습니다." }

2. Otherwise, the text is considered acceptable and MUST be approved.

3. For approved text, you MUST return at least one category from the fixed vocabulary above.
   NEVER return zero categories.

4. If the text is acceptable but category inference is uncertain, ambiguous, too broad, too casual, or does not strongly fit any specific category, choose exactly:
   ["잡담"]
   as the fallback.

5. Never fabricate labels outside the fixed vocabulary.
6. Never include explanations, markdown, or extra text.
7. Return JSON only.
8. Approved shape must be exactly:
   { "status": "approved", "categories": ["카테고리1", "카테고리2", "카테고리3"] }
9. Categories must be exact vocabulary matches, trimmed, and deduplicated.
${strictRetry ? '10. This is a retry because the previous answer had invalid JSON or invalid/empty categories.\
    Do not explain.\
    Do not reject unless the text is clearly unsafe by Rule 1.\
    If the text is safe and you are uncertain about the best category, return exactly:\
    { "status": "approved", "categories": ["잡담"] }' : ''}`;

  const resultObj = await fetchFromOpenRouter(systemInstruction, content);

  if (!resultObj || typeof resultObj !== 'object') {
    return { status: 'invalid' as const };
  }

  if ('status' in resultObj && resultObj.status === 'rejected') {
    return resultObj;
  }

  const rawCategories =
    ('categories' in resultObj ? resultObj.categories : undefined) ??
    (typeof ('category' in resultObj ? resultObj.category : undefined) === 'string'
      ? [('category' in resultObj ? resultObj.category : undefined)]
      : ('category' in resultObj ? resultObj.category : undefined));
  const normalizedCategories = normalizeWorryCategories(rawCategories);

  // Malformed or unusable model output stays on the invalid/category-failure path.
  if ('status' in resultObj && resultObj.status === 'approved' && normalizedCategories.length > 0) {
    return { status: 'approved', categories: normalizedCategories };
  }

  return { status: 'invalid' as const };
}

async function sendPushNotification(uid: string, title: string, body: string) {
  if (!db || !messaging) {
    console.warn("Skipping notification: Firebase Admin not initialized.");
    return;
  }

  try {
    console.log(`Attempting to send notification to UID: ${uid}...`);
    const userRef = db.collection('users').doc(uid);
    const tokenCollectionSnapshot = await userRef.collection('fcmTokens').get();

    if (!tokenCollectionSnapshot.empty) {
      for (const tokenDoc of tokenCollectionSnapshot.docs) {
        const token = typeof tokenDoc.data().token === 'string'
          ? tokenDoc.data().token
          : decodeURIComponent(tokenDoc.id);

        if (!token) {
          console.warn(`[Push] UID ${uid}: skipping empty token doc ${tokenDoc.id}.`);
          continue;
        }

        try {
          await messaging.send({
            token,
            notification: { title, body },
            data: {
              title,
              body,
              url: '/',
            },
            android: {
              priority: 'high',
              notification: {
                channelId: 'galpi-main',
                priority: 'max',
              },
            },
            webpush: {
              headers: {
                Urgency: 'high',
              },
              fcmOptions: { link: '/' },
              notification: {
                icon: '/pwa-192x192.png',
                badge: '/pwa-192x192.png',
                tag: 'galpi-notification',
                renotify: true,
                requireInteraction: true,
              },
            },
          });

          console.log(`[Push] UID ${uid}: delivered via token doc ${tokenDoc.id} (${summarizeToken(token)}).`);
        } catch (err) {
          console.error(`[Push] UID ${uid}: failed for token doc ${tokenDoc.id} (${summarizeToken(token)}).`, err);

          if (isInvalidPushTokenError(err)) {
            await tokenDoc.ref.delete();
            console.warn(`[Push] UID ${uid}: deleted invalid token doc ${tokenDoc.id}.`);
          }
        }
      }

      return;
    }

    const userDoc = await userRef.get();
    if (!userDoc.exists) {
      console.warn(`User ${uid} not found in Firestore (Database: ${firestoreDatabaseId})`);
      return;
    }

    const legacyToken = userDoc.data()?.fcmToken;

    if (!legacyToken) {
      console.warn(`User ${uid} has no push token docs and no legacy scalar fallback token.`);
      return;
    }

    try {
      await messaging.send({
        token: legacyToken,
        notification: { title, body },
        data: {
          title,
          body,
          url: '/',
        },
        android: {
          priority: 'high',
          notification: {
            channelId: 'galpi-main',
            priority: 'max',
          },
        },
        webpush: {
          headers: {
            Urgency: 'high',
          },
          fcmOptions: { link: '/' },
          notification: {
            icon: '/pwa-192x192.png',
            badge: '/pwa-192x192.png',
            tag: 'galpi-notification',
            renotify: true,
            requireInteraction: true,
          },
        },
      });

      console.log(`[Push] UID ${uid}: delivered via legacy scalar fallback (${summarizeToken(legacyToken)}).`);

      await userRef.collection('fcmTokens').doc(encodeURIComponent(legacyToken)).set({
        token: legacyToken,
        platform: 'web',
        userAgent: null,
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
        notificationPermission: 'unknown',
        isInstalledPWA: false,
        instanceId: LEGACY_FALLBACK_INSTANCE_ID,
      }, { merge: true });

      // TODO: remove users/{uid}.fcmToken once the migration window is complete.
    } catch (err) {
      console.error(`[Push] UID ${uid}: legacy scalar fallback delivery failed (${summarizeToken(legacyToken)}).`, err);

      if (isInvalidPushTokenError(err)) {
        await Promise.all([
          userRef.collection('fcmTokens').doc(encodeURIComponent(legacyToken)).delete().catch(() => undefined),
          userRef.update({
            fcmToken: FieldValue.delete(),
          }),
        ]);
        console.warn(`[Push] UID ${uid}: deleted invalid legacy scalar token.`);
      }
    }
  } catch (err) {
    console.error(`❌ Failed to send notification to ${uid}:`, err);
  }
}

async function fetchFromOpenRouter(systemInstruction: string, userContent: string) {
  const apiKey = process.env.OPENROUTER_API_KEY;
  
  if (!apiKey) {
    console.error("CRITICAL ERROR: OPENROUTER_API_KEY is missing!");
    throw new Error("OPENROUTER_API_KEY is not defined in .env file");
  }

  console.log(`Attempting to call OpenAI with model: gpt-5.4-mini`);
 
  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: "gpt-5.4-mini",
      messages: [
        { role: "system", content: systemInstruction },
        { role: "user", content: userContent }
      ],
      temperature: 0.1,
      max_completion_tokens: 1000
    })
  });

  if (!response.ok) {
    const errText = await response.text();
    console.error(`OpenRouter API Error Status: ${response.status}`);
    console.error(`OpenRouter API Error Body: ${errText}`);
    throw new Error(`OpenRouter API Error: ${response.status}`);
  }

  const data = await response.json();
  console.log("Successfully received response from OpenRouter.");
  
  let textContent = data.choices?.[0]?.message?.content || "{}";
  
  // Sometimes models wrap JSON in code blocks like ```json ... ```
  if (textContent.includes("```")) {
    textContent = textContent.replace(/```json|```/g, "").trim();
  }
  
  try {
    return JSON.parse(textContent);
  } catch (parseError) {
    console.error("JSON Parse Error. Raw content:", textContent);
    return null;
  }
}

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // API Route for Processing Worries (Filtering + Category Inference)
  app.post("/api/process-worry", async (req, res) => {
    try {
      const { content } = req.body;

      if (typeof content !== 'string' || !content.trim()) {
        res.json({ status: "rejected", reason: "고민 내용이 비어 있습니다." });
        return;
      }

      const firstAttempt = await moderateAndInferWorryCategories(content);
      if (firstAttempt.status === 'approved') {
        res.json(firstAttempt);
        return;
      }

      if (firstAttempt.status === 'rejected') {
        console.log("Worry processing moderation rejection.");
        res.json(firstAttempt);
        return;
      }

      const secondAttempt = await moderateAndInferWorryCategories(content, true);
      if (secondAttempt.status === 'approved') {
        res.json(secondAttempt);
        return;
      }

      if (secondAttempt.status === 'rejected') {
        console.log("Worry processing moderation rejection.");
        res.json(secondAttempt);
        return;
      }

      console.log("Worry processing category inference failure after retries.");
      res.json({ status: "rejected", reason: "카테고리를 결정하지 못했습니다. 잠시 후 다시 시도해주세요." });
    } catch (error: any) {
      // True provider/runtime exceptions are the only path to HTTP 500 system failure.
      console.error("Worry processing backend/system exception:", error?.message || error);
      res.status(500).json({ status: "rejected", reason: "오류가 발생했습니다. 잠시 후 다시 시도해주세요." });
    }
  });

  // API Route for generating an AI reply (for bots)
  app.post("/api/generate-ai-reply", async (req, res) => {
    try {
      const { worryContent, botInfo } = req.body;
      const systemInstruction = `You are a warm, empathetic person who just received an anonymous worry. 
Your persona: ${botInfo.gender === 'female' ? 'A kind sister/older woman' : 'A supportive brother/older man'}. 
Interests: ${botInfo.interests.join(', ')}.
Task: Write a comforting, personal reply to the worry. Keep it between 2-4 sentences. Use a warm, polite Korean tone (해요체). 
Do NOT use professional counselor jargon. Sound like a real person.
Return JSON: { "content": "Your reply here" }`;

      const resultObj = await fetchFromOpenRouter(systemInstruction, worryContent);
      res.json(resultObj);
    } catch (error: any) {
      console.error("AI Reply Generation Error:", error?.message || error);
      res.status(500).json({ error: "Internal Server Error" });
    }
  });

  // API Route for Processing Replies (Filtering only)
  app.post("/api/process-reply", async (req, res) => {
    try {
      const { content } = req.body;

      const systemInstruction = `You are a moderator for a Korean anonymous worry-sharing app.
1. Check if the reply is inappropriate, abusive, violent, or unhelpful spam.
2. Return JSON exactly like this:
   - If bad: { "status": "rejected", "reason": "부적절한 표현이 감지되었습니다." }
   - If good: { "status": "approved" }`;

      const resultObj = await fetchFromOpenRouter(systemInstruction, content);
      res.json(resultObj);
    } catch (error: any) {
      console.error("Reply Filter Error:", error?.message || error);
      res.status(500).json({ error: "Internal Server Error" });
    }
  });

  // API Route for Processing Comments (Filtering only)
  app.post("/api/process-comment", async (req, res) => {
    try {
      const { content } = req.body;

      const systemInstruction = `You are a moderator for a Korean anonymous worry-sharing app.
1. Check if the comment left by the publisher is inappropriate, abusive, violent, or spam.
2. Return JSON exactly like this:
   - If bad: { "status": "rejected", "reason": "부적절한 표현이 감지되었습니다." }
   - If good: { "status": "approved" }`;

      const resultObj = await fetchFromOpenRouter(systemInstruction, content);
      res.json(resultObj);
    } catch (error: any) {
      console.error("Comment Filter Error:", error?.message || error);
      res.status(500).json({ error: "Internal Server Error" });
    }
  });

  app.post("/api/notify-new-worry", async (req, res) => {
    const { receiverUids } = req.body;
    if (receiverUids && Array.isArray(receiverUids)) {
      for (const uid of receiverUids) {
        if (!uid.startsWith('bot_')) {
          await sendPushNotification(uid, "📻 갈피", "새로운 사연이 도착했습니다.");
        }
      }
    }
    res.json({ status: "ok" });
  });

  app.post("/api/notify-new-reply", async (req, res) => {
    const { receiverUid } = req.body;
    if (receiverUid && !receiverUid.startsWith('bot_')) {
      await sendPushNotification(receiverUid, "📻 갈피", "보낸 사연에 답장이 도착했습니다.");
    }
    res.json({ status: "ok" });
  });

  app.post("/api/notify-new-comment", async (req, res) => {
    const { receiverUid } = req.body;
    if (receiverUid && !receiverUid.startsWith('bot_')) {
      await sendPushNotification(receiverUid, "📻 갈피", "남겨주신 답장에 코멘트가 달렸습니다.");
    }
    res.json({ status: "ok" });
  });

  app.post("/api/schedule-bot-reply", async (req, res) => {
    const { worryId, worryContent, receiverId, botInfo } = req.body;
    
    // Send immediate response to client
    res.json({ status: "scheduled" });

    // Calculate a random delay between 4 and 8 minutes
    const minMinutes = 4;
    const maxMinutes = 8;
    const delayMs = (Math.floor(Math.random() * (maxMinutes - minMinutes + 1)) + minMinutes) * 60 * 1000;
    
    console.log(`[Bot] Scheduling reply from ${botInfo.uid} in ${delayMs / 1000 / 60} minutes.`);

    setTimeout(async () => {
      if (!db) return;
      try {
        console.log(`[Bot] Generating delayed reply for ${receiverId}...`);
        
        const systemInstruction = `You are a warm, empathetic person who just received an anonymous worry. 
Your persona: ${botInfo.gender === 'female' ? 'A kind sister/older woman' : 'A supportive brother/older man'}. 
Interests: ${botInfo.interests.join(', ')}.
Task: Write a comforting, personal reply to the worry. Keep it between 2-4 sentences. Use a warm, polite Korean tone (해요체). 
Do NOT use professional counselor jargon. Sound like a real person.
Return JSON: { "content": "Your reply here" }`;

        const resultObj = await fetchFromOpenRouter(systemInstruction, worryContent);
        const replyText = resultObj?.content || "당신의 고민을 잘 읽었어요. 마음이 따뜻해지는 밤 되시길 바랄게요.";

        // Save reply to Firestore
        await db.collection('letters').add({
          senderId: botInfo.uid,
          receiverId: receiverId,
          originalContent: replyText,
          refinedContent: replyText,
          type: 'reply',
          replyTo: worryId,
          replyToContent: worryContent,
          createdAt: FieldValue.serverTimestamp(),
          isRead: false,
          feedback: null
        });

        console.log(`[Bot] Delayed reply from ${botInfo.uid} saved.`);

        // Notify the user
        await sendPushNotification(receiverId, "📻 갈피", "보낸 사연에 답장이 도착했습니다.");
      } catch (err) {
        console.error(`[Bot] Delayed reply failed for ${botInfo.uid}:`, err);
      }
    }, delayMs);
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    
    // Serve static files with correct MIME types for PWA
    app.use(express.static(distPath, {
      setHeaders: (res, filePath) => {
        if (filePath.endsWith('.webmanifest')) {
          res.setHeader('Content-Type', 'application/manifest+json');
        }
        if (filePath.endsWith('sw.js')) {
          res.setHeader('Content-Type', 'application/javascript');
          res.setHeader('Service-Worker-Allowed', '/');
        }
      }
    }));
    
    // Always serve index.html for SPA routing
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
