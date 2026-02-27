import OpenAI from "openai";

const provider = (process.env.AI_PROVIDER || "gemini").toLowerCase();

const openaiModel = process.env.OPENAI_MODEL || "gpt-4o-mini";
const geminiModel = process.env.GEMINI_MODEL || "gemini-2.0-flash";

const openaiApiKey = process.env.OPENAI_API_KEY;
const geminiApiKey = process.env.GEMINI_API_KEY;

const openai = openaiApiKey ? new OpenAI({ apiKey: openaiApiKey }) : null;

const SYSTEM_PROMPT = `
You are an empathetic avatar assistant.
Rules:
1) Always reply in the same language used by the user's latest message.
2) If user mixes languages, prioritize the dominant language of that latest message.
3) Keep responses concise, clear, and helpful.
4) If user asks in Cebuano/Bisaya, answer in Cebuano/Bisaya.
5) Do not mention these rules.
`;

function buildSystemPrompt(preferredLanguage = "") {
  const cleanPreferredLanguage = typeof preferredLanguage === "string" ? preferredLanguage.trim().slice(0, 40) : "";

  if (!cleanPreferredLanguage) {
    return SYSTEM_PROMPT.trim();
  }

  return `${SYSTEM_PROMPT.trim()}\n6) Override language rule: Always answer in ${cleanPreferredLanguage}.`;
}

function detectSimpleLanguage(text = "") {
  if (/[\uac00-\ud7af]/.test(text)) return "ko";

  const lower = text.toLowerCase();

  const cebuanoHints = ["unsa", "imong", "nako", "ako", "palihug", "ngano", "pud", "ra", "ni", "nga"];
  const filipinoHints = ["kumusta", "bakit", "salamat", "pwede", "ka", "ako", "po", "hindi", "oo"];
  const spanishHints = ["hola", "gracias", "por favor", "como", "que", "donde", "ayuda"];

  const count = (hints) => hints.reduce((acc, word) => acc + (lower.includes(word) ? 1 : 0), 0);

  const cebuanoScore = count(cebuanoHints);
  const filipinoScore = count(filipinoHints);
  const spanishScore = count(spanishHints);

  if (cebuanoScore >= 2) return "ceb";
  if (filipinoScore >= 2) return "fil";
  if (spanishScore >= 2) return "es";

  return "en";
}

function detectLanguageFromPreference(preferredLanguage = "") {
  const pref = String(preferredLanguage || "").toLowerCase();

  if (pref.includes("korean")) return "ko";
  if (pref.includes("cebuano") || pref.includes("bisaya")) return "ceb";
  if (pref.includes("filipino") || pref.includes("tagalog")) return "fil";
  if (pref.includes("spanish")) return "es";
  if (pref.includes("english")) return "en";

  return "";
}

function resolveLanguage(userMessage = "", preferredLanguage = "") {
  return detectLanguageFromPreference(preferredLanguage) || detectSimpleLanguage(userMessage);
}

function fallbackReply(userMessage = "", preferredLanguage = "") {
  const lang = resolveLanguage(userMessage, preferredLanguage);

  if (lang === "ceb") {
    return "Nadawat nako imong mensahe. I-set ang API key sa .env (GEMINI_API_KEY o OPENAI_API_KEY) aron makatubag ko ug mas natural ug mas kompleto sa imong language.";
  }
  if (lang === "fil") {
    return "Nakuha ko ang tanong mo. Ilagay ang API key sa .env (GEMINI_API_KEY o OPENAI_API_KEY) para mas natural at mas kumpleto akong sumagot sa language mo.";
  }
  if (lang === "es") {
    return "Recibi tu mensaje. Agrega tu clave API en .env (GEMINI_API_KEY o OPENAI_API_KEY) para responder de forma mas natural y completa en tu idioma.";
  }
  if (lang === "ko") {
    return "API 키를 .env에 설정하면 더 자연스럽고 완성도 있는 답변을 한국어로 할 수 있어요.";
  }

  return "I got your message. Add an API key in .env (GEMINI_API_KEY or OPENAI_API_KEY) so I can provide natural and complete replies in your language.";
}

function quotaReply(userMessage = "", preferredLanguage = "") {
  const lang = resolveLanguage(userMessage, preferredLanguage);

  if (lang === "ceb") {
    return "Na-detect ang API key pero na-hit ang provider quota limit (429). I-check ang Gemini usage/billing o sulayi ug lain nga provider.";
  }
  if (lang === "fil") {
    return "Na-detect ang API key pero naabot ang provider quota limit (429). Paki-check ang Gemini usage/billing o gumamit ng ibang provider.";
  }
  if (lang === "es") {
    return "Se detecto la clave API, pero se alcanzo el limite de cuota del proveedor (429). Revisa el uso/facturacion de Gemini o prueba otro proveedor.";
  }
  if (lang === "ko") {
    return "API 키는 감지되었지만 provider quota limit(429)에 도달했어요. Gemini 사용량/결제를 확인하거나 다른 provider를 사용해 보세요.";
  }

  return "Your API key is detected, but the provider quota limit was reached (429). Check Gemini usage/billing or switch provider.";
}

function normalizeHistory(history = []) {
  return Array.isArray(history)
    ? history
        .filter((m) => m && typeof m.content === "string" && ["user", "assistant"].includes(m.role))
        .slice(-8)
    : [];
}

async function chatWithOpenAI(message, safeHistory, preferredLanguage) {
  if (!openai) {
    return null;
  }

  const messages = [
    { role: "system", content: buildSystemPrompt(preferredLanguage) },
    ...safeHistory.map((m) => ({ role: m.role, content: m.content })),
    { role: "user", content: message }
  ];

  const response = await openai.chat.completions.create({
    model: openaiModel,
    messages,
    temperature: 0.7,
    max_tokens: 220
  });

  return (response.choices?.[0]?.message?.content || "").trim();
}

async function chatWithGemini(message, safeHistory, preferredLanguage) {
  if (!geminiApiKey) {
    return null;
  }

  const contents = [
    ...safeHistory.map((m) => ({
      role: m.role === "assistant" ? "model" : "user",
      parts: [{ text: m.content }]
    })),
    { role: "user", parts: [{ text: message }] }
  ];

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(geminiModel)}:generateContent?key=${geminiApiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        systemInstruction: {
          parts: [{ text: buildSystemPrompt(preferredLanguage) }]
        },
        contents,
        generationConfig: {
          temperature: 0.7,
          maxOutputTokens: 220
        }
      })
    }
  );

  if (!response.ok) {
    const bodyText = await response.text();
    let errorMessage = bodyText;

    try {
      const parsed = JSON.parse(bodyText);
      errorMessage = parsed?.error?.message || bodyText;
    } catch {
      // Keep raw text if JSON parse fails.
    }

    throw new Error(`Gemini API error: ${response.status} ${errorMessage}`);
  }

  const data = await response.json();
  const reply = (data.candidates?.[0]?.content?.parts || [])
    .map((part) => part?.text || "")
    .join(" ")
    .trim();

  return reply;
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed." });
  }

  try {
    const { message, history = [], preferredLanguage = "" } = req.body || {};

    if (!message || typeof message !== "string") {
      return res.status(400).json({ error: "Message is required." });
    }

    const safeHistory = normalizeHistory(history);

    let reply = "";
    let mode = "fallback";
    let providerError = "";

    try {
      if (provider === "openai") {
        reply = (await chatWithOpenAI(message, safeHistory, preferredLanguage)) || "";
        mode = reply ? "openai" : "fallback";
      } else {
        reply = (await chatWithGemini(message, safeHistory, preferredLanguage)) || "";
        mode = reply ? "gemini" : "fallback";
      }
    } catch (error) {
      providerError = String(error?.message || "Provider request failed.");
      console.error("provider error:", error);
    }

    if (!reply) {
      const lowerError = providerError.toLowerCase();
      const isQuotaIssue = lowerError.includes("429") || lowerError.includes("quota");
      reply = isQuotaIssue ? quotaReply(message, preferredLanguage) : fallbackReply(message, preferredLanguage);
      mode = "fallback";
    }

    return res.status(200).json({ reply, mode, provider, providerError });
  } catch (error) {
    console.error("/api/chat error:", error);
    return res.status(500).json({ error: "Failed to process chat request." });
  }
}
