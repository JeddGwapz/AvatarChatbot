import { timingSafeEqual } from 'crypto';
import { GoogleGenerativeAI } from '@google/generative-ai';
import OpenAI from 'openai';

const PROVIDER = (process.env.AI_PROVIDER || 'gemini').toLowerCase();
const APP_API_KEY = (process.env.APP_API_KEY || '').trim();
const GEMINI_API_KEY = (process.env.GEMINI_API_KEY || '').trim();
const OPENAI_API_KEY = (process.env.OPENAI_API_KEY || '').trim();

function hasRealKey(value) {
  if (!value) return false;
  if (value.toLowerCase().startsWith('your_')) return false;
  return true;
}

let activeProvider = 'local';
let geminiModel = null;
let openaiClient = null;

const hasGeminiKey = hasRealKey(GEMINI_API_KEY);
const hasOpenAIKey = hasRealKey(OPENAI_API_KEY);

if (PROVIDER === 'gemini' && hasGeminiKey) {
  const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
  geminiModel = genAI.getGenerativeModel({
    model: process.env.GEMINI_MODEL || 'gemini-2.0-flash',
  });
  activeProvider = 'gemini';
} else if (PROVIDER === 'openai' && hasOpenAIKey) {
  openaiClient = new OpenAI({ apiKey: OPENAI_API_KEY });
  activeProvider = 'openai';
} else if (hasGeminiKey) {
  const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
  geminiModel = genAI.getGenerativeModel({
    model: process.env.GEMINI_MODEL || 'gemini-2.0-flash',
  });
  activeProvider = 'gemini';
} else if (hasOpenAIKey) {
  openaiClient = new OpenAI({ apiKey: OPENAI_API_KEY });
  activeProvider = 'openai';
}

const LANG_NAMES = {
  auto: 'the same language as the user',
  en: 'English',
  ceb: 'Cebuano (Bisaya)',
  fil: 'Filipino (Tagalog)',
  es: 'Spanish',
  ko: 'Korean',
};

const CAT_CONTEXT = {
  text: 'The user wants help with writing, editing, or generating text content.',
  photos: 'The user wants help describing, generating ideas for, or analyzing photos and images.',
  slides: 'The user wants help creating presentation slides, outlines, or slide content.',
  videos: 'The user wants help with video concepts, scripts, storyboards, or editing ideas.',
  '3d': 'The user wants help with 3D modeling concepts, descriptions, or design ideas.',
};

const LOCAL_PHRASES = {
  en: {
    intro: 'Here is a practical AI-style response.',
    stepHint: 'If you want, I can break this into step-by-step actions.',
  },
  ceb: {
    intro: 'Ani ang praktikal nga tubag, murag AI assistant.',
    stepHint: 'Kung gusto nimo, himoan tika ug klaro nga step-by-step.',
  },
  fil: {
    intro: 'Narito ang praktikal na sagot na parang AI assistant.',
    stepHint: 'Kung gusto mo, gagawin ko itong malinaw na step-by-step.',
  },
  es: {
    intro: 'Aqui tienes una respuesta practica, estilo asistente de IA.',
    stepHint: 'Si quieres, lo convierto en pasos claros.',
  },
  ko: {
    intro: 'AI assistant styleuro siljeongjeogin dabbyeonimnida.',
    stepHint: 'Wonhamyeon dan-gye byeollo jeongrihae deurilgeyo.',
  },
};

function buildLocalReply({ message, language, category }) {
  const lower = (message || '').toLowerCase();
  const p = LOCAL_PHRASES[language] || LOCAL_PHRASES.en;

  const byCategory = {
    text: 'Start with a short outline, then expand each point with one concrete example.',
    photos: 'Define subject, lighting, camera angle, and mood first before writing the final prompt.',
    slides: 'Use one idea per slide, add a clear title, then keep each slide to 3 bullet points max.',
    videos: 'Open with a 5-second hook, then 3 key beats, and finish with one clear call-to-action.',
    '3d': 'Specify form, scale, materials, and lighting setup first to get a cleaner 3D concept.',
  };

  let advice = byCategory[category] || byCategory.text;

  if (/(bug|error|fix|issue|not work|dili|wala|problem)/.test(lower)) {
    advice = 'Check one variable at a time, test each change, and keep only the fix that consistently works.';
  } else if (/(website|html|css|javascript|api|backend|frontend)/.test(lower)) {
    advice = 'Define the exact output first, then adjust structure, style, and behavior in small testable steps.';
  }

  return `${p.intro} ${advice} ${p.stepHint}`;
}

function extractApiKey(req) {
  const headerKey = req.headers['x-api-key'];
  if (headerKey && typeof headerKey === 'string') return headerKey.trim();

  const auth = req.headers.authorization || '';
  if (typeof auth === 'string' && auth.toLowerCase().startsWith('bearer ')) {
    return auth.slice(7).trim();
  }
  return '';
}

function isValidApiKey(inputKey) {
  if (!APP_API_KEY || !inputKey) return false;
  const expected = Buffer.from(APP_API_KEY);
  const incoming = Buffer.from(inputKey);
  if (expected.length !== incoming.length) return false;
  return timingSafeEqual(expected, incoming);
}

async function parseJsonBody(req) {
  if (req.body && typeof req.body === 'object') return req.body;

  let raw = '';
  for await (const chunk of req) raw += chunk;
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  if (APP_API_KEY) {
    const incomingKey = extractApiKey(req);
    if (!isValidApiKey(incomingKey)) {
      return res.status(401).json({ error: 'Unauthorized: invalid API key' });
    }
  }

  const body = await parseJsonBody(req);
  if (!body || typeof body !== 'object') {
    return res.status(400).json({ error: 'Invalid JSON body' });
  }

  const { message, language = 'en', category = 'text' } = body;
  if (!message || !String(message).trim()) {
    return res.status(400).json({ error: 'message is required' });
  }

  const langName = LANG_NAMES[language] ?? 'English';
  const catContext = CAT_CONTEXT[category] ?? '';
  const systemPrompt =
    `You are Assistant, a warm, helpful, and concise AI assistant. ` +
    `${catContext} ` +
    `Always respond in ${langName}. ` +
    `Keep replies clear and friendly. Limit to 3-4 sentences unless more detail is truly needed.`;

  try {
    let reply = '';

    if (activeProvider === 'gemini' && geminiModel) {
      const chat = geminiModel.startChat({ history: [] });
      const result = await chat.sendMessage(`${systemPrompt}\n\nUser: ${message}`);
      reply = result.response.text();
    } else if (activeProvider === 'openai' && openaiClient) {
      const completion = await openaiClient.chat.completions.create({
        model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: String(message) },
        ],
        max_tokens: 400,
      });
      reply = completion.choices?.[0]?.message?.content || '';
    } else {
      reply = buildLocalReply({ message: String(message), language, category });
    }

    return res.status(200).json({ reply, mode: activeProvider });
  } catch (err) {
    const fallback = buildLocalReply({ message: String(message), language, category });
    return res.status(200).json({ reply: fallback, warning: 'provider_unavailable', details: err.message });
  }
}
