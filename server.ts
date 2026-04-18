import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";

async function fetchFromOpenRouter(systemInstruction: string, userContent: string) {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    throw new Error("OPENROUTER_API_KEY environment variable is required");
  }

  const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: "moonshotai/kimi-k2.5", // We can use an OpenRouter model that supports json natively
      messages: [
        { role: "system", content: systemInstruction },
        { role: "user", content: userContent }
      ],
      response_format: { type: "json_object" },
      temperature: 0.1
    })
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`OpenRouter API Error: ${response.status} ${errText}`);
  }

  const data = await response.json();
  const textContent = data.choices?.[0]?.message?.content || "{}";
  return JSON.parse(textContent);
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
1. First, check if the content is inappropriate (contains extreme profanity, explicit hate speech, or self-harm/violence).
2. If inappropriate, YOU MUST RETURN JSON exactly like this: { "status": "rejected", "reason": "부적절한 표현이 감지되었습니다." }
3. If appropriate, select EXACTLY 3 best-matching users from the 'Candidate List' to answer this worry.
   - Match based on the context of the worry + 'Sender Info' vs the candidate's 'gender', 'interests', and their 'pastWorries' & 'pastReplies'.
   - EVEN IF candidates are not a perfect match, YOU MUST select EXACTLY 3 uids. Fallback matching is required to guarantee 3 are chosen.
   - If there are fewer than 3 total candidates provided, duplicate the uids so you return exactly 3, or just return all available.
4. YOU MUST RETURN JSON exactly like this: { "status": "approved", "assignedUids": ["uid1", "uid2", "uid3"] }

Sender Info (JSON):
${JSON.stringify(senderInfo)}

Candidate List (JSON):
${JSON.stringify(candidates)}
`;

      const resultObj = await fetchFromOpenRouter(systemInstruction, content);
      res.json(resultObj);
    } catch (error: any) {
      console.error("Backend API Error:", error?.message || error);
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

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
