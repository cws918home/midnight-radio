import {
  normalizeSimpleModeration,
  normalizeWorryModeration,
} from './moderation/normalize';

type ProcessWorryResult =
  | { status: "approved"; categories: string[] }
  | { status: "rejected"; reason: string };

export async function processWorry(content: string): Promise<ProcessWorryResult> {
  const response = await fetch('/api/process-worry', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content })
  });

  if (!response.ok) {
    throw new Error(`process-worry HTTP ${response.status}`);
  }

  const result = normalizeWorryModeration(await response.json());
  if (result.status === 'invalid') {
    throw new Error('Invalid process-worry response');
  }

  return result;
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
  const response = await fetch('/api/process-reply', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content })
  });
  if (!response.ok) {
    throw new Error(`process-reply HTTP ${response.status}`);
  }

  const result = normalizeSimpleModeration(await response.json());
  if (result.status === 'invalid') {
    throw new Error('Invalid process-reply response');
  }

  return result;
}

export async function processComment(content: string): Promise<any> {
  const response = await fetch('/api/process-comment', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content })
  });
  if (!response.ok) {
    throw new Error(`process-comment HTTP ${response.status}`);
  }

  const result = normalizeSimpleModeration(await response.json());
  if (result.status === 'invalid') {
    throw new Error('Invalid process-comment response');
  }

  return result;
}
