export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const { messages } = JSON.parse(req.body);

  // Map standard {role, content} to Gemini's format
  const geminiContents = messages.map(m => ({
    role: m.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: m.content }]
  }));

  try {
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${process.env.GEMINI_API_KEY}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        systemInstruction: {
          parts: [{
            text: "You are an empathetic, private companion residing on Asad's portfolio website. You are a safe space. Asad is a 20-year-old Physics student at the University of Leeds who loves tinkering with cars, coding, photography, and Arsenal. He has a lot on his plate with university, strict parents, and his own ambitions. Your goal is to listen, validate feelings, and provide supportive, conversational replies. Do not try to solve every problem with a list; ask gentle, open-ended questions. Keep responses warm, concise, and formatted in plain text."
          }]
        },
        contents: geminiContents
      })
    });

    const data = await response.json();
    
    if (!response.ok) {
      throw new Error(data.error?.message || "Failed to fetch from Gemini");
    }

    const reply = data.candidates[0].content.parts[0].text;
    res.status(200).json({ reply });
  } catch (error) {
    console.error("AI Error:", error);
    res.status(500).json({ error: "I'm having a little trouble connecting right now, but I'm here." });
  }
}