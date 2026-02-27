const chatList = document.getElementById("chatList");
const micBtn = document.getElementById("micBtn");
const keyboardBtn = document.getElementById("keyboardBtn");
const typingTray = document.getElementById("typingTray");
const textInput = document.getElementById("textInput");
const sendBtn = document.getElementById("sendBtn");
const statusText = document.getElementById("statusText");
const avatarWrap = document.getElementById("avatarWrap");
const langBadge = document.getElementById("langBadge");

const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
const hasSpeechRecognition = Boolean(SpeechRecognition);
const hasTTS = "speechSynthesis" in window;
const VISEME_CLASSES = ["viseme-rest", "viseme-open", "viseme-wide", "viseme-round", "viseme-tight", "viseme-closed"];
const LANGUAGE_OPTIONS = [
  { id: "auto", badge: "AUTO", label: "Auto", preferredLanguage: null, speechCode: null },
  { id: "en", badge: "EN", label: "English", preferredLanguage: "English", speechCode: "en-US" },
  { id: "ceb", badge: "CEB", label: "Cebuano", preferredLanguage: "Cebuano", speechCode: "fil-PH" },
  { id: "fil", badge: "FIL", label: "Filipino", preferredLanguage: "Filipino", speechCode: "fil-PH" },
  { id: "es", badge: "ES", label: "Spanish", preferredLanguage: "Spanish", speechCode: "es-ES" },
  { id: "ko", badge: "KO", label: "Korean", preferredLanguage: "Korean", speechCode: "ko-KR" }
];

const state = {
  history: [],
  isListening: false,
  typedMode: false,
  recognition: null,
  voices: [],
  visemeResetTimer: null,
  lipTimelineTimers: [],
  languageIndex: 0
};

function detectLanguageCode(text = "") {
  if (/[\uac00-\ud7af]/.test(text)) return "ko-KR";

  const lower = text.toLowerCase();

  const cebuanoTokens = ["unsa", "nako", "imong", "ngano", "palihug", "pud", "ra", "sige", "gani"];
  const filipinoTokens = ["kamusta", "salamat", "bakit", "pwede", "hindi", "opo", "sige"];
  const spanishTokens = ["hola", "gracias", "por favor", "necesito", "donde", "ayuda"];

  const score = (tokens) => tokens.reduce((sum, token) => sum + (lower.includes(token) ? 1 : 0), 0);

  const ceb = score(cebuanoTokens);
  const fil = score(filipinoTokens);
  const es = score(spanishTokens);

  if (ceb >= 2) return "ceb-PH";
  if (fil >= 2) return "fil-PH";
  if (es >= 2) return "es-ES";

  return navigator.language || "en-US";
}

function badgeFromLang(lang) {
  const short = (lang || "en").split("-")[0].toUpperCase();
  return short.slice(0, 3);
}

function getSelectedLanguage() {
  return LANGUAGE_OPTIONS[state.languageIndex] || LANGUAGE_OPTIONS[0];
}

function renderLanguageBadge() {
  const selected = getSelectedLanguage();
  langBadge.textContent = selected.badge;
  langBadge.title = `Current language: ${selected.label}`;
}

function cycleLanguage() {
  state.languageIndex = (state.languageIndex + 1) % LANGUAGE_OPTIONS.length;
  renderLanguageBadge();

  const selected = getSelectedLanguage();
  if (selected.id === "auto") {
    setStatus("Language mode: Auto");
  } else {
    setStatus(`Language mode: ${selected.label}`);
  }
}

function appendBubble(role, text) {
  const bubble = document.createElement("div");
  bubble.className = `bubble ${role === "assistant" ? "ai" : "user"}`;
  bubble.textContent = text;
  chatList.appendChild(bubble);
  chatList.scrollTop = chatList.scrollHeight;
}

function setStatus(text) {
  statusText.textContent = text;
}

function setSpeakingVisual(isSpeaking) {
  avatarWrap.classList.toggle("speaking", isSpeaking);
  if (!isSpeaking) {
    clearLipTimers();
    setViseme("viseme-rest");
  }
}

function clearLipTimers() {
  if (state.visemeResetTimer) {
    clearTimeout(state.visemeResetTimer);
    state.visemeResetTimer = null;
  }
  if (state.lipTimelineTimers.length) {
    for (const timer of state.lipTimelineTimers) {
      clearTimeout(timer);
    }
    state.lipTimelineTimers = [];
  }
}

function setViseme(visemeClass) {
  for (const className of VISEME_CLASSES) {
    avatarWrap.classList.remove(className);
  }
  avatarWrap.classList.add(visemeClass);
}

function visemeFromChunk(chunk = "") {
  const firstHangul = chunk.match(/[\uac00-\ud7af]/)?.[0];
  if (firstHangul) {
    const baseCode = firstHangul.charCodeAt(0) - 0xac00;
    const jung = Math.floor((baseCode % 588) / 28);
    const jong = baseCode % 28;

    if ([8, 13, 18].includes(jung)) return "viseme-round";
    if ([0, 2, 3, 6].includes(jung)) return "viseme-open";
    if ([20].includes(jung)) return "viseme-tight";
    if (jong > 0) return "viseme-closed";
    return "viseme-wide";
  }

  const text = chunk.toLowerCase();

  if (/[bmpm]/.test(text)) return "viseme-closed";
  if (/[fv]/.test(text)) return "viseme-tight";
  if (/[ou]/.test(text)) return "viseme-round";
  if (/[aei]/.test(text)) return "viseme-open";
  if (/[wry]/.test(text)) return "viseme-round";
  if (/[stzdnl]/.test(text)) return "viseme-wide";

  return "viseme-wide";
}

function triggerVisemePulse(chunk = "") {
  const visemeClass = visemeFromChunk(chunk);
  setViseme(visemeClass);

  if (state.visemeResetTimer) {
    clearTimeout(state.visemeResetTimer);
  }
  state.visemeResetTimer = setTimeout(() => {
    setViseme("viseme-rest");
  }, 110);
}

function tokenizeSpeech(text = "") {
  return String(text)
    .split(/(\s+|[,.!?;:])/)
    .filter((token) => token && token.length);
}

function estimateTokenDuration(token = "", rate = 1) {
  const safeRate = Number.isFinite(rate) && rate > 0 ? rate : 1;
  if (/^\s+$/.test(token)) return 55 / safeRate;
  if (/^[,.!?;:]$/.test(token)) return 130 / safeRate;

  const core = token.replace(/[^A-Za-z\uac00-\ud7af0-9]/g, "");
  const unitCount = Math.max(core.length, 1);
  return Math.max(80, Math.min(300, unitCount * 68)) / safeRate;
}

function queueViseme(visemeClass, delayMs) {
  const timer = setTimeout(() => {
    setViseme(visemeClass);
  }, Math.max(0, delayMs));
  state.lipTimelineTimers.push(timer);
}

function startLipSyncTimeline(text, rate = 1) {
  clearLipTimers();
  setViseme("viseme-rest");

  const tokens = tokenizeSpeech(text);
  if (!tokens.length) return;

  let cursor = 0;
  for (const token of tokens) {
    const duration = estimateTokenDuration(token, rate);

    if (!/^\s+$/.test(token)) {
      const visemeClass = visemeFromChunk(token);
      queueViseme(visemeClass, cursor);
      queueViseme("viseme-rest", cursor + duration * 0.72);
    }

    cursor += duration;
  }
  queueViseme("viseme-rest", cursor + 70);
}

function updateLanguageBadgeFromText(text) {
  const selected = getSelectedLanguage();
  if (selected.id !== "auto") return;

  const langCode = detectLanguageCode(text);
  langBadge.textContent = badgeFromLang(langCode);
}

function getPreferredVoice(langCode) {
  const langPrefix = langCode.split("-")[0].toLowerCase();
  const voiceList = state.voices;

  if (!voiceList.length) return null;

  const premiumHint = /(natural|neural|enhanced|premium|google)/i;
  const maleHint =
    /(male|man|david|daniel|alex|fred|jorge|diego|carlos|paul|thomas|joey|liam|james|john|michael|mark)/i;
  const femaleHint = /(female|woman|samantha|karen|victoria|zira|hazel|susan|aria)/i;

  const inLang = voiceList.filter((voice) => voice.lang.toLowerCase().startsWith(langPrefix));
  const maleInLang = inLang.filter((voice) => maleHint.test(voice.name) && !femaleHint.test(voice.name));
  const premiumMaleInLang = maleInLang.find((voice) => premiumHint.test(voice.name));

  return (
    premiumMaleInLang ||
    maleInLang[0] ||
    inLang.find((voice) => premiumHint.test(voice.name)) ||
    inLang[0] ||
    voiceList.find((voice) => maleHint.test(voice.name) && !femaleHint.test(voice.name)) ||
    voiceList[0]
  );
}

function speakReply(text) {
  if (!hasTTS || !text) return;

  const langCode = detectLanguageCode(text);
  const utterance = new SpeechSynthesisUtterance(text);
  const voice = getPreferredVoice(langCode);

  utterance.lang = voice?.lang || langCode;
  utterance.voice = voice || null;
  utterance.rate = 1;
  utterance.pitch = 0.86;

  utterance.onstart = () => {
    setSpeakingVisual(true);
    startLipSyncTimeline(text, utterance.rate);
  };
  utterance.onboundary = (event) => {
    const start = Number.isFinite(event.charIndex) ? event.charIndex : 0;
    const chunk = text.slice(start, start + 6);
    triggerVisemePulse(chunk);
  };
  utterance.onend = () => setSpeakingVisual(false);
  utterance.onerror = () => setSpeakingVisual(false);

  window.speechSynthesis.cancel();
  window.speechSynthesis.speak(utterance);
}

async function getAssistantReply(message) {
  const selected = getSelectedLanguage();

  const response = await fetch("/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      message,
      history: state.history.slice(-8),
      preferredLanguage: selected.preferredLanguage
    })
  });

  if (!response.ok) {
    throw new Error("Failed to get assistant reply.");
  }

  return response.json();
}

async function submitMessage(message) {
  const cleaned = (message || "").trim();
  if (!cleaned) return;

  updateLanguageBadgeFromText(cleaned);
  appendBubble("user", cleaned);
  state.history.push({ role: "user", content: cleaned });
  setStatus("Assistant is thinking...");

  try {
    const data = await getAssistantReply(cleaned);
    const reply = data.reply || "I could not generate a reply yet.";

    appendBubble("assistant", reply);
    state.history.push({ role: "assistant", content: reply });
    if (data.providerError) {
      const quotaIssue = data.providerError.includes("429") || data.providerError.toLowerCase().includes("quota");
      setStatus(
        quotaIssue
          ? "Provider quota reached. Check Gemini/OpenAI usage and billing."
          : "Provider request failed. Using fallback reply."
      );
    } else {
      setStatus(data.mode === "fallback" ? "Fallback mode: add GEMINI_API_KEY or OPENAI_API_KEY in .env." : "Ready.");
    }
    speakReply(reply);
  } catch (error) {
    appendBubble("assistant", "I ran into an error. Please try again.");
    setStatus("Server error. Check terminal logs.");
    console.error(error);
  }
}

function toggleTypedMode() {
  state.typedMode = !state.typedMode;
  typingTray.classList.toggle("hidden", !state.typedMode);
  keyboardBtn.classList.toggle("active", state.typedMode);

  if (state.typedMode) {
    textInput.focus();
  }
}

function initVoices() {
  const voices = window.speechSynthesis.getVoices();
  if (voices.length) {
    state.voices = voices;
  }
}

function stopListening() {
  if (!state.recognition || !state.isListening) return;

  state.isListening = false;
  micBtn.classList.remove("active");
  state.recognition.stop();
  setStatus("Voice input stopped.");
}

function startListening() {
  if (!hasSpeechRecognition) {
    setStatus("Speech recognition is not supported in this browser.");
    return;
  }

  if (!state.recognition) {
    const recognition = new SpeechRecognition();
    recognition.interimResults = true;
    recognition.continuous = false;
    recognition.maxAlternatives = 1;

    recognition.onstart = () => {
      state.isListening = true;
      micBtn.classList.add("active");
      setStatus("Listening... Speak now.");
    };

    recognition.onresult = async (event) => {
      let finalText = "";

      for (let i = event.resultIndex; i < event.results.length; i += 1) {
        const transcript = event.results[i][0].transcript;
        if (event.results[i].isFinal) {
          finalText += transcript;
        } else {
          setStatus(`Listening: ${transcript}`);
        }
      }

      if (finalText.trim()) {
        await submitMessage(finalText.trim());
      }
    };

    recognition.onend = () => {
      state.isListening = false;
      micBtn.classList.remove("active");
      if (!statusText.textContent.startsWith("Assistant")) {
        setStatus("Ready. Ask by voice or text.");
      }
    };

    recognition.onerror = (event) => {
      state.isListening = false;
      micBtn.classList.remove("active");

      if (event.error === "not-allowed") {
        setStatus("Microphone permission blocked. Allow mic access and retry.");
      } else {
        setStatus(`Voice error: ${event.error}`);
      }
    };

    state.recognition = recognition;
  }

  const selected = getSelectedLanguage();
  state.recognition.lang = selected.speechCode || navigator.language || "en-US";
  state.recognition.start();
}

micBtn.addEventListener("click", () => {
  if (state.isListening) {
    stopListening();
  } else {
    startListening();
  }
});

keyboardBtn.addEventListener("click", toggleTypedMode);
langBadge.addEventListener("click", cycleLanguage);

sendBtn.addEventListener("click", () => {
  submitMessage(textInput.value);
  textInput.value = "";
});

textInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    submitMessage(textInput.value);
    textInput.value = "";
  }
});

window.speechSynthesis?.addEventListener("voiceschanged", initVoices);
initVoices();
renderLanguageBadge();

appendBubble("assistant", "Hello. You can ask me by voice or text, and I will answer in your language.");
setStatus(hasSpeechRecognition ? "Ready. Ask by voice or text." : "Voice input not supported. Use typing mode.");
