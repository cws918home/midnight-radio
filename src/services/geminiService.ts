type ProcessWorryResult =
  | { status: "approved"; categories: string[] }
  | { status: "rejected" | "error"; reason: string };

export async function processWorry(content: string): Promise<ProcessWorryResult> {
  try {
    const response = await fetch('/api/process-worry', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content })
    });
    if (!response.ok) throw new Error("Failed to process worry");
    return await response.json();
  } catch (error) {
    console.error("Backend LLM API Error:", error);
    return { status: "error", reason: "고민을 분류하지 못했습니다. 잠시 후 다시 시도해주세요." };
  }
}

export async function generateAIReply(worryContent: string, botInfo: any): Promise<any> {
  try {
    const response = await fetch('/api/generate-ai-reply', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ worryContent, botInfo })
    });
    if (!response.ok) throw new Error("Failed to generate AI reply");
    return await response.json();
  } catch (error) {
    console.error("AI Reply Error:", error);
    return { content: "당신의 고민을 잘 들었어요. 항상 응원할게요." };
  }
}

export async function processReply(content: string): Promise<any> {
  try {
    const response = await fetch('/api/process-reply', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content })
    });
    if (!response.ok) throw new Error("Failed to process reply");
    return await response.json();
  } catch (error) {
    console.error("Backend LLM API Error:", error);
    return { status: "error", reason: "부적절한 표현이 감지되었습니다." };
  }
}

export async function processComment(content: string): Promise<any> {
  try {
    const response = await fetch('/api/process-comment', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content })
    });
    if (!response.ok) throw new Error("Failed to process comment");
    return await response.json();
  } catch (error) {
    console.error("Backend LLM API Error:", error);
    return { status: "error", reason: "부적절한 표현이 감지되었습니다." };
  }
}
