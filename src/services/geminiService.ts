export async function refineLetter(content: string, type: 'worry' | 'reply'): Promise<string> {
  try {
    const response = await fetch('/api/refine', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ content, type })
    });

    if (!response.ok) {
      throw new Error(`Failed to refine letter: ${response.status}`);
    }

    const data = await response.json();
    return data.result || content;
  } catch (error) {
    console.error("Backend LLM API Error:", error);
    return content;
  }
}
