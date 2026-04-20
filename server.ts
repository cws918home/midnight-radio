import dotenv from "dotenv";
dotenv.config(); // Explicitly call config

import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import { initializeApp, cert, getApps } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
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

async function sendPushNotification(uid: string, title: string, body: string) {
  if (!db || !messaging) {
    console.warn("Skipping notification: Firebase Admin not initialized.");
    return;
  }

  try {
    console.log(`Attempting to send notification to UID: ${uid}...`);
    const userDoc = await db.collection('users').doc(uid).get();
    
    if (!userDoc.exists) {
      console.warn(`User ${uid} not found in Firestore (Database: ${firestoreDatabaseId})`);
      return;
    }

    const userData = userDoc.data();
    const fcmToken = userData?.fcmToken;

    if (!fcmToken) {
      console.warn(`User ${uid} exists but has no fcmToken registered.`);
      return;
    }

    console.log(`Found token for ${uid}, sending push via FCM...`);
    await messaging.send({
      token: fcmToken,
      notification: { title, body },
      data: {
        title,
        body,
        url: '/'
      },
      webpush: {
        fcmOptions: { link: '/' },
        notification: {
          icon: '/pwa-192x192.png',
          badge: '/pwa-192x192.png',
          tag: 'midnight-radio-notification',
          renotify: true
        }
      }
    });
    console.log(`✅ Notification successfully sent to ${uid}`);
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

  console.log(`Attempting to call OpenRouter with model: moonshotai/kimi-k2.5`);
  
  try {
    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "http://localhost:3000",
        "X-Title": "Midnight Radio"
      },
      body: JSON.stringify({
        model: "moonshotai/kimi-k2.5",
        messages: [
          { role: "system", content: systemInstruction },
          { role: "user", content: userContent }
        ],
        temperature: 0.1,
        max_tokens: 1000 // Limit tokens to stay within credit budget
      })
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error(`OpenRouter API Error Status: ${response.status}`);
      console.error(`OpenRouter API Error Body: ${errText}`);
      throw new Error(`OpenRouter API Error: ${response.status} ${errText}`);
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
      // Fallback response if JSON parsing fails
      if (textContent.includes("approved")) {
        return { status: "approved", assignedUids: [] };
      }
      return { status: "error", reason: "응답 해석 실패" };
    }
  } catch (error: any) {
    console.error("Fetch operation failed:", error.message);
    throw error;
  }
}

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // API Route for Processing Worries (Filtering + LLM Routing)
  app.post("/api/process-worry", async (req, res) => {
    try {
      const { content, candidates, senderInfo } = req.body;

      const systemInstruction = `You are an AI moderator and routing engine for a Korean anonymous worry-sharing app.
1. Check for inappropriate content. If bad, return: { "status": "rejected", "reason": "부적절한 표현이 감지되었습니다." }
2. If appropriate, select EXACTLY 3 best-matching users from the 'Candidate List'.
   - MATCHING RULE: Prioritize candidates who share the most interests with the sender.
   - MANDATORY: YOU MUST RETURN EXACTLY 3 UIDs. DO NOT RETURN AN EMPTY LIST.
   - If there are fewer than 3 candidates, return all of them.
   - If match quality is low, pick the best available ones anyway. 
   - AI bots (uids starting with 'bot_') are perfect matches if they share interests.
3. RETURN JSON: { "status": "approved", "assignedUids": ["uid1", "uid2", "uid3"] }

Sender Info (JSON):
${JSON.stringify(senderInfo)}

Candidate List (JSON):
${JSON.stringify(candidates)}
`;

      const resultObj = await fetchFromOpenRouter(systemInstruction, content);
      
      // Safety check: ensure assignedUids exists
      if (resultObj.status === "approved" && !resultObj.assignedUids) {
        console.warn("LLM returned approved but missing assignedUids. Attempting to fix...");
        // Look for other possible field names or just take first 3 from candidates
        const candidatesList = candidates || [];
        resultObj.assignedUids = candidatesList.slice(0, 3).map((c: any) => c.uid);
      }
      
      res.json(resultObj);
    } catch (error: any) {
      console.error("Backend API Error:", error?.message || error);
      res.status(500).json({ error: "Internal Server Error" });
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
          await sendPushNotification(uid, "📻 미드나잇 라디오", "새로운 사연이 도착했습니다.");
        }
      }
    }
    res.json({ status: "ok" });
  });

  app.post("/api/notify-new-reply", async (req, res) => {
    const { receiverUid } = req.body;
    if (receiverUid && !receiverUid.startsWith('bot_')) {
      await sendPushNotification(receiverUid, "📻 미드나잇 라디오", "보낸 사연에 답장이 도착했습니다.");
    }
    res.json({ status: "ok" });
  });

  app.post("/api/notify-new-comment", async (req, res) => {
    const { receiverUid } = req.body;
    if (receiverUid && !receiverUid.startsWith('bot_')) {
      await sendPushNotification(receiverUid, "📻 미드나잇 라디오", "남겨주신 답장에 코멘트가 달렸습니다.");
    }
    res.json({ status: "ok" });
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
