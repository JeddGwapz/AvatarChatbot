// Crystal Prompter — app.js
// Handles: datetime, lang, category, settings, avatar, mic/voice, chat

// ── State ─────────────────────────────────────────────────────────────────────
const S = {
  lang:         'en',
  gender:       'male',
  category:     'text',
  loading:      false,
  recording:    false,
  kbMode:       false,   // double-tap toggles keyboard input
  lastTap:      0,
};

// ── DOM refs ──────────────────────────────────────────────────────────────────
const $ = id => document.getElementById(id);

const avatarImg    = $('avatarImg');
const avatarStage  = $('avatarStage');
const avStatus     = $('avStatus');
const chatMessages = $('chatMessages');
const chatInput    = $('chatInput');
const btnSend      = $('btnSend');
const btnMic       = $('btnMic');
const micIcon      = $('micIcon');
const btnLangToggle= $('btnLangToggle');
const langLabel    = $('langLabel');
const langPicker   = $('langPicker');
const btnSettings  = $('btnSettings');
const settingsOverlay = $('settingsOverlay');
const btnCloseSettings = $('btnCloseSettings');
const customColor  = $('customColor');
const headerDate   = $('headerDate');
const headerTime   = $('headerTime');
const inputBar     = document.querySelector('.input-bar');

function getClientApiKey() {
  try {
    const savedKey = (localStorage.getItem('CRYSTAL_API_KEY') || '').trim();
    return savedKey;
  } catch {
    return '';
  }
}

// ── Date & Time ───────────────────────────────────────────────────────────────
function updateClock() {
  const now  = new Date();
  const dOpt = { weekday: 'short', month: 'short', day: 'numeric' };
  const tOpt = { hour: 'numeric', minute: '2-digit', hour12: true };
  headerDate.textContent = now.toLocaleDateString('en-US', dOpt);
  headerTime.textContent = now.toLocaleTimeString('en-US', tOpt);
}
updateClock();
setInterval(updateClock, 1000);

// ── Language ──────────────────────────────────────────────────────────────────
const LANGS = {
  auto: { display: '🌐 AUTO', code: '' },
  en:   { display: '🇺🇸 EN',   code: 'en-US' },
  ceb:  { display: '🇵🇭 CEB',  code: 'fil-PH' },
  fil:  { display: '🇵🇭 FIL',  code: 'fil-PH' },
  es:   { display: '🇪🇸 ES',   code: 'es-ES' },
  ko:   { display: '🇰🇷 KO',   code: 'ko-KR' },
};

// ── TTS bootstrap ─────────────────────────────────────────────────────────────
let availableVoices = [];
let speechUnlocked = false;
let speakingGuardTimer = null;

function loadVoices() {
  if (!('speechSynthesis' in window)) return;
  availableVoices = window.speechSynthesis.getVoices() || [];
}

function primeSpeech() {
  if (!('speechSynthesis' in window)) return;
  // Helps browsers that require an explicit user gesture before audio output.
  window.speechSynthesis.resume();
  loadVoices();
}

function unlockSpeechFromGesture() {
  if (!('speechSynthesis' in window) || speechUnlocked) return;
  try {
    const unlock = new SpeechSynthesisUtterance(' ');
    unlock.volume = 0;
    unlock.rate = 1;
    unlock.pitch = 1;
    window.speechSynthesis.speak(unlock);
    window.speechSynthesis.cancel();
    speechUnlocked = true;
  } catch {
    // no-op
  }
}

function waitForVoices(timeoutMs = 1200) {
  if (!('speechSynthesis' in window)) return Promise.resolve();
  loadVoices();
  if (availableVoices.length) return Promise.resolve();

  return new Promise(resolve => {
    const started = Date.now();
    const timer = setInterval(() => {
      loadVoices();
      if (availableVoices.length || Date.now() - started >= timeoutMs) {
        clearInterval(timer);
        resolve();
      }
    }, 100);
  });
}

function pickVoice(langCode) {
  if (!availableVoices.length) return null;
  const normalized = (langCode || 'en-US').toLowerCase();
  const exact = availableVoices.find(v => v.lang && v.lang.toLowerCase() === normalized);
  if (exact) return exact;
  const short = normalized.split('-')[0];
  return availableVoices.find(v => v.lang && v.lang.toLowerCase().startsWith(short)) || null;
}

if ('speechSynthesis' in window) {
  loadVoices();
  window.speechSynthesis.onvoiceschanged = loadVoices;
  document.addEventListener('pointerdown', () => {
    primeSpeech();
    unlockSpeechFromGesture();
  }, { once: true });
}

function setLang(lang) {
  S.lang = lang;
  langLabel.textContent = LANGS[lang]?.display ?? '🌐';

  // sync all lang buttons
  document.querySelectorAll('.lang-pick-btn, .lang-opt').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.lang === lang);
  });
  langPicker.classList.remove('open');
}

btnLangToggle.addEventListener('click', e => {
  e.stopPropagation();
  langPicker.classList.toggle('open');
});
document.querySelectorAll('.lang-pick-btn').forEach(btn =>
  btn.addEventListener('click', () => setLang(btn.dataset.lang))
);
document.addEventListener('click', e => {
  if (!langPicker.contains(e.target) && e.target !== btnLangToggle)
    langPicker.classList.remove('open');
});

// ── Category ──────────────────────────────────────────────────────────────────
const CAT_PLACEHOLDERS = {
  text:   'Ask me to write something...',
  photos: 'Describe a photo you want...',
  slides: 'What slides do you need?',
  videos: 'Describe your video concept...',
  '3d':   'What 3D model should I create?',
};

document.querySelectorAll('.cat-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.cat-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    S.category = btn.dataset.category;
    chatInput.placeholder = CAT_PLACEHOLDERS[S.category] ?? 'Ask Anything...';
  });
});

// ── Quick Chips ───────────────────────────────────────────────────────────────
document.querySelectorAll('.chip').forEach(chip => {
  chip.addEventListener('click', () => {
    unlockSpeechFromGesture();
    chatInput.value = chip.dataset.prompt;
    sendMessage();
  });
});

// ── Avatar ────────────────────────────────────────────────────────────────────
const AVATAR_SRC = {
  male:   './avatar-male.svg',
  female: './avatar-female.svg',
};
const AVATAR_FALLBACK = {
  male:   './avatar-female.svg',
  female: './avatar-male.svg',
};

function setAvatar(gender) {
  S.gender = gender;
  avatarImg.src = AVATAR_SRC[gender];
  avatarImg.onerror = () => { avatarImg.src = AVATAR_FALLBACK[gender]; };
  document.querySelectorAll('.gender-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.gender === gender);
  });
}

document.querySelectorAll('.gender-btn').forEach(btn =>
  btn.addEventListener('click', () => setAvatar(btn.dataset.gender))
);

function setSpeaking(on) {
  avatarStage.classList.toggle('speaking', on);
  avStatus.innerHTML = on
    ? '<span class="dot" style="background:#f59e0b"></span>Speaking...'
    : '<span class="dot"></span>Online';
}

// ── Settings ──────────────────────────────────────────────────────────────────
function openSettings()  {
  settingsOverlay.classList.add('open');
  settingsOverlay.setAttribute('aria-hidden', 'false');
}
function closeSettings() {
  settingsOverlay.classList.remove('open');
  settingsOverlay.setAttribute('aria-hidden', 'true');
}
btnSettings.addEventListener('click', openSettings);
btnCloseSettings.addEventListener('click', closeSettings);
settingsOverlay.addEventListener('click', e => {
  if (e.target === settingsOverlay) closeSettings();
});

// Theme swatches
document.querySelectorAll('.swatch[data-theme]').forEach(sw => {
  sw.addEventListener('click', () => {
    document.querySelectorAll('.swatch').forEach(s => s.classList.remove('active'));
    sw.classList.add('active');
    // remove all theme-* classes
    document.body.className = document.body.className
      .split(' ').filter(c => !c.startsWith('theme-')).join(' ');
    document.body.classList.add(`theme-${sw.dataset.theme}`);
    // clear any custom CSS var
    document.documentElement.style.removeProperty('--bg-from');
    document.documentElement.style.removeProperty('--bg-to');
    document.documentElement.style.removeProperty('--accent');
  });
});

// Custom color picker
document.querySelector('.custom-swatch').addEventListener('click', () => {
  customColor.click();
});
customColor.addEventListener('input', () => {
  document.querySelectorAll('.swatch').forEach(s => s.classList.remove('active'));
  document.body.className = document.body.className
    .split(' ').filter(c => !c.startsWith('theme-')).join(' ');

  const hex = customColor.value;
  // Generate a darker tone for gradient end
  const r = parseInt(hex.slice(1,3), 16);
  const g = parseInt(hex.slice(3,5), 16);
  const b = parseInt(hex.slice(5,7), 16);
  const dark = `#${Math.floor(r*0.55).toString(16).padStart(2,'0')}${Math.floor(g*0.55).toString(16).padStart(2,'0')}${Math.floor(b*0.55).toString(16).padStart(2,'0')}`;
  document.documentElement.style.setProperty('--bg-from', hex);
  document.documentElement.style.setProperty('--bg-to', dark);
  document.documentElement.style.setProperty('--accent', dark);
});

// Language options inside settings modal
document.querySelectorAll('.lang-opt').forEach(btn =>
  btn.addEventListener('click', () => setLang(btn.dataset.lang))
);

// ── Voice / Mic ───────────────────────────────────────────────────────────────
const MIC_SVG = `<svg viewBox="0 0 24 24" fill="currentColor">
  <path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3z"/>
  <path d="M17 11c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z"/>
</svg>`;

const KB_SVG = `<svg viewBox="0 0 24 24" fill="currentColor">
  <path d="M20 5H4c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm-9 3h2v2h-2V8zm0 3h2v2h-2v-2zM8 8h2v2H8V8zm0 3h2v2H8v-2zm-1 5H5v-2h2v2zm10 0H7v-2h10v2zm0-3h-2v-2h2v2zm0-3h-2V8h2v2zm3 6h-2v-2h2v2z"/>
</svg>`;

let recognition = null;
if ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window) {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  recognition = new SR();
  recognition.continuous = false;
  recognition.interimResults = true;

  recognition.onstart = () => {
    S.recording = true;
    btnMic.classList.add('recording');
  };
  recognition.onresult = e => {
    const t = Array.from(e.results).map(r => r[0].transcript).join('');
    chatInput.value = t;
    if (e.results[e.results.length - 1].isFinal) {
      S.recording = false;
      btnMic.classList.remove('recording');
      sendMessage();
    }
  };
  recognition.onerror = recognition.onend = () => {
    S.recording = false;
    btnMic.classList.remove('recording');
  };
}

function toggleKbMode(on) {
  S.kbMode = on;
  micIcon.innerHTML = on ? KB_SVG : MIC_SVG;
  btnMic.classList.toggle('kb-mode', on);
  if (on) chatInput.focus();
}

btnMic.addEventListener('click', () => {
  const now = Date.now();
  const gap  = now - S.lastTap;
  S.lastTap  = now;

  // Double-tap (< 350 ms) → toggle keyboard mode
  if (gap < 350) {
    toggleKbMode(!S.kbMode);
    return;
  }

  // Single tap
  if (S.kbMode) { chatInput.focus(); return; }

  if (!recognition) { toggleKbMode(true); return; }

  if (S.recording) {
    recognition.stop();
  } else {
    recognition.lang = LANGS[S.lang]?.code || 'en-US';
    try { recognition.start(); } catch (_) {}
  }
});

// ── Chat / Send ───────────────────────────────────────────────────────────────
chatInput.addEventListener('keydown', e => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    unlockSpeechFromGesture();
    sendMessage();
  }
});
btnSend.addEventListener('click', () => {
  unlockSpeechFromGesture();
  sendMessage();
});

function addMsg(text, role) {
  const el = document.createElement('div');
  el.className = `msg-bubble ${role}`;
  el.textContent = text;
  chatMessages.appendChild(el);
  chatMessages.scrollTop = chatMessages.scrollHeight;
  return el;
}

function addTyping() {
  const el = document.createElement('div');
  el.className = 'msg-bubble typing';
  el.id = 'typingEl';
  el.innerHTML = '<span class="typing-dot"></span><span class="typing-dot"></span><span class="typing-dot"></span>';
  chatMessages.appendChild(el);
  chatMessages.scrollTop = chatMessages.scrollHeight;
  return el;
}

let ttsUtterance = null;
let inputPopupTimer = null;

function ensureInputPopup() {
  if (!inputBar) return null;
  let popup = document.getElementById('inputPopup');
  if (!popup) {
    popup = document.createElement('div');
    popup.id = 'inputPopup';
    popup.className = 'input-popup';
    inputBar.appendChild(popup);
  }
  return popup;
}

function showInputPopup(text, type = 'ai') {
  const popup = ensureInputPopup();
  if (!popup) return;

  popup.textContent = text;
  popup.classList.remove('show', 'error');
  if (type === 'error') popup.classList.add('error');

  // restart animation
  void popup.offsetWidth;
  popup.classList.add('show');

  clearTimeout(inputPopupTimer);
  inputPopupTimer = setTimeout(() => popup.classList.remove('show'), 4500);
}

async function sendMessage() {
  const text = chatInput.value.trim();
  if (!text || S.loading) return;

  chatInput.value = '';
  S.loading = true;
  btnSend.disabled = true;

  addMsg(text, 'user');
  const typing = addTyping();
  setSpeaking(false);

  try {
    const apiKey = getClientApiKey();
    const res  = await fetch('/api/chat', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(apiKey ? { 'x-api-key': apiKey } : {}),
      },
      body: JSON.stringify({ message: text, language: S.lang, category: S.category }),
    });
    if (res.status === 401) {
      typing.remove();
      const msg = "⚠ Unauthorized. Set your key in browser: localStorage.setItem('CRYSTAL_API_KEY','your_key')";
      addMsg(msg, 'ai');
      showInputPopup(msg, 'error');
      speak(msg);
      return;
    }
    const data = await res.json();
    typing.remove();

    if (data.reply) {
      addMsg(data.reply, 'ai');
      showInputPopup(data.reply, 'ai');
      speak(data.reply);
    } else {
      const msg = `⚠ ${data.error ?? 'Unknown error'}`;
      addMsg(msg, 'ai');
      showInputPopup(msg, 'error');
      speak(msg);
    }
  } catch {
    typing.remove();
    const msg = '⚠ Connection error — is the server running?';
    addMsg(msg, 'ai');
    showInputPopup(msg, 'error');
    speak(msg);
  } finally {
    S.loading = false;
    btnSend.disabled = false;
  }
}

// TTS + avatar speaking animation
async function speak(text) {
  if (!('speechSynthesis' in window)) return;
  const safeText = String(text || '').replace(/\s+/g, ' ').trim();
  if (!safeText) return;

  primeSpeech();
  unlockSpeechFromGesture();
  await waitForVoices();
  loadVoices();
  window.speechSynthesis.cancel();
  clearTimeout(speakingGuardTimer);

  setSpeaking(true);
  const utter = new SpeechSynthesisUtterance(safeText);
  utter.lang  = LANGS[S.lang]?.code || 'en-US';
  const voice = pickVoice(utter.lang);
  if (voice) utter.voice = voice;
  utter.volume = 1;
  utter.rate  = 0.92;
  utter.pitch = S.gender === 'female' ? 1.25 : 0.9;
  let retried = false;

  utter.onstart = () => { speechUnlocked = true; };
  utter.onend   = () => setSpeaking(false);
  utter.onerror = () => {
    if (retried) {
      setSpeaking(false);
      return;
    }
    retried = true;
    // Retry once after a brief resume in case browser blocked first attempt.
    window.speechSynthesis.resume();
    setTimeout(() => {
      try { window.speechSynthesis.speak(utter); } catch { setSpeaking(false); }
    }, 120);
  };
  ttsUtterance  = utter;
  window.speechSynthesis.speak(utter);

  // Safety fallback: stop animation after ~10 s
  speakingGuardTimer = setTimeout(() => setSpeaking(false), Math.min(safeText.length * 65, 10000));
}

// ── Keyboard shortcuts ────────────────────────────────────────────────────────
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') { closeSettings(); langPicker.classList.remove('open'); }
});

// ── Init ──────────────────────────────────────────────────────────────────────
setLang('en');
setAvatar('male');
