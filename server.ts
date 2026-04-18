import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // API Route for OpenRouter
  app.post("/api/refine", async (req, res) => {
    try {
      const { content, type } = req.body;
      const apiKey = process.env.OPENROUTER_API_KEY;

      if (!apiKey) {
        return res.status(500).json({ error: "OPENROUTER_API_KEY environment variable is required" });
      }

      const systemInstruction = type === 'worry' 
        ? "당신은 심야 라디오 DJ입니다. 사용자가 작성한 사연의 내용을 절대 추가하거나 삭제하지 마세요. 오직 어조만 부드럽고 감성적인 라디오 사연 톤으로 '아주 미세하게만' 변경해주세요. 원본의 문장 구조와 단어를 최대한 100% 그대로 유지해야 합니다. 인사말이나 맺음말을 임의로 덧붙이지 마세요."
        : "당신은 따뜻한 라디오 청취자입니다. 사용자가 작성한 응답의 내용을 절대 추가하거나 삭제하지 마세요. 오직 어조만 부드럽고 따뜻한 톤으로 '아주 미세하게만' 변경해주세요. 원본의 문장 구조와 단어를 최대한 100% 그대로 유지해야 합니다. 인사말이나 맺음말을 임의로 덧붙이지 마세요.";

      const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${apiKey}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          model: "moonshotai/kimi-k2.5", // fallback or default OpenRouter model, user didn't specify exactly which, standard fallback
          messages: [
            { role: "system", content: systemInstruction },
            { role: "user", content: content }
          ],
          temperature: 0.2
        })
      });

      if (!response.ok) {
        const errorData = await response.text();
        console.error("OpenRouter Error:", errorData);
        return res.status(response.status).json({ error: "Failed to generate content" });
      }

      const data = await response.json();
      const refinedText = data.choices?.[0]?.message?.content || content;
      
      res.json({ result: refinedText });
    } catch (error) {
      console.error("Backend API Error:", error);
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
