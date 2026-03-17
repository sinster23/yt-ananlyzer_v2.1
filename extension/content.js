// ============================================================
// SentiYT v2.0 — content.js
// Injects sentiment badges + tracks emotions, toxicity, timeline
// ============================================================

const API_URL = 'https://sinster23-yt-analyzer-v2-1.hf.space/predict';
const BATCH_SIZE     = 10;
const PROCESSED_ATTR = 'data-sentiyt-done';

// ── Config ───────────────────────────────────────────────────
const SENTIMENT_CONFIG = {
  POSITIVE: { emoji: '😊', label: 'Positive', color: '#2dc653', bg: 'rgba(45,198,83,0.10)',  border: 'rgba(45,198,83,0.3)'  },
  NEGATIVE: { emoji: '😠', label: 'Negative', color: '#e63946', bg: 'rgba(230,57,70,0.10)',  border: 'rgba(230,57,70,0.3)'  },
  NEUTRAL:  { emoji: '😐', label: 'Neutral',  color: '#f4a261', bg: 'rgba(244,162,97,0.10)', border: 'rgba(244,162,97,0.3)' },
  ERROR:    { emoji: '⚠️', label: 'Error',    color: '#666',    bg: 'rgba(100,100,100,0.08)', border: 'rgba(100,100,100,0.2)' }
};

// ── Emotion keywords (heuristic) ─────────────────────────────
const EMOTION_KEYWORDS = {
  joy:      ['lol','haha','amazing','love','awesome','funny','great','best','hilarious','laugh','happy','😂','❤️','🔥','💀'],
  anger:    ['hate','worst','terrible','awful','disgusting','idiot','stupid','garbage','trash','annoying','🤬','😡'],
  sadness:  ['sad','miss','cry','depressing','unfortunate','poor','unfortunately','😢','😭','💔'],
  surprise: ['wow','omg','wait','what','unbelievable','shocking','unexpected','damn','woah','😲','🤯'],
  fear:     ['scared','afraid','terrifying','dangerous','warning','risk','worried','concern','😱','😨'],
  disgust:  ['gross','disgusting','sick','vile','yuck','nasty','revolting','🤢','🤮']
};

// Toxicity heuristic keywords
const TOXICITY_KEYWORDS = ['idiot','stupid','dumb','moron','hate','loser','trash','garbage','kill','die','worthless','pathetic','disgusting'];

// ── State ─────────────────────────────────────────────────────
let isEnabled  = true;
let observer   = null;
const stats         = { pos: 0, neg: 0, neu: 0 };
let timelineBuffer  = [];
let toxicBuffer     = [];
const emotions      = { joy: 0, anger: 0, sadness: 0, surprise: 0, fear: 0, disgust: 0 };

// ── Init ──────────────────────────────────────────────────────
chrome.storage.sync.get(['sentimentEnabled'], (res) => {
  isEnabled = res.sentimentEnabled !== false;
  if (isEnabled) { startObserver(); setTimeout(scanComments, 2000); }
});

chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type === 'TOGGLE') {
    isEnabled = msg.enabled;
    if (isEnabled) {
      startObserver();
      scanComments();
    } else {
      stopObserver();
      removeBadges();
      resetState();
    }
  }
  if (msg.type === 'RESCAN') {
    resetState();
    scanComments();
  }
});

// ── Observer ──────────────────────────────────────────────────
function startObserver() {
  if (observer) return;
  observer = new MutationObserver(debounce(() => { if (isEnabled) scanComments(); }, 800));
  observer.observe(document.body, { childList: true, subtree: true });
}
function stopObserver() {
  if (observer) { observer.disconnect(); observer = null; }
}

// ── Scanner ───────────────────────────────────────────────────
async function scanComments() {
  const els = getUnprocessed();
  if (els.length === 0) return;

  els.forEach(el => el.setAttribute(PROCESSED_ATTR, 'pending'));

  for (let i = 0; i < els.length; i += BATCH_SIZE) {
    const batch = els.slice(i, i + BATCH_SIZE);
    const texts = batch.map(el => el.innerText?.trim() || '');

    try {
      const results = await callAPI(texts);
      batch.forEach((el, idx) => {
        const result = results[idx];
        injectBadge(el, result);
        trackResult(el, result, texts[idx]);
        el.setAttribute(PROCESSED_ATTR, 'done');
      });
    } catch (err) {
      console.warn('[SentiYT] API error:', err.message);
      batch.forEach(el => {
        injectBadge(el, { label: 'ERROR', score: 0 });
        el.setAttribute(PROCESSED_ATTR, 'error');
      });
    }
  }
}

// ── Tracking ─────────────────────────────────────────────────
function trackResult(el, result, text) {
  const label = result?.label;
  if (label === 'POSITIVE') stats.pos++;
  else if (label === 'NEGATIVE') stats.neg++;
  else if (label === 'NEUTRAL') stats.neu++;

  // Timeline entry
  timelineBuffer.push({ label, ts: Date.now() });

  // Emotions heuristic
  const lower = (text || '').toLowerCase();
  Object.entries(EMOTION_KEYWORDS).forEach(([emotion, keywords]) => {
    if (keywords.some(k => lower.includes(k.toLowerCase()))) emotions[emotion]++;
  });

  // Toxicity heuristic
  if (label === 'NEGATIVE') {
    const isToxic = TOXICITY_KEYWORDS.some(k => lower.includes(k));
    if (isToxic || (result.score || 0) > 0.85) {
      toxicBuffer.push({
        text,
        score: result.score || 0,
        tags: detectToxTags(lower)
      });
    }
  }

  // Flush to storage every 5 results
  if ((stats.pos + stats.neg + stats.neu) % 5 === 0) flushStorage();
}

function detectToxTags(text) {
  const tags = [];
  if (['hate','racist','sexist'].some(k => text.includes(k))) tags.push('hate speech');
  if (['idiot','stupid','moron','dumb'].some(k => text.includes(k))) tags.push('insult');
  if (['kill','die','threat'].some(k => text.includes(k))) tags.push('threat');
  return tags;
}

function flushStorage() {
  chrome.storage.sync.set({
    stats,
    timelineData: timelineBuffer.slice(-200), // last 200 only
    toxicComments: toxicBuffer.slice(-20),
    emotionState: { ...emotions }
  });
}

function resetState() {
  stats.pos = 0; stats.neg = 0; stats.neu = 0;
  timelineBuffer = [];
  toxicBuffer    = [];
  Object.keys(emotions).forEach(k => emotions[k] = 0);
  flushStorage();
}

// ── Badge ─────────────────────────────────────────────────────
function injectBadge(commentEl, result) {
  const old = commentEl.parentElement?.querySelector('.sentiyt-badge');
  if (old) old.remove();

  const label = result?.label || 'ERROR';
  const score = result?.score || 0;
  const cfg   = SENTIMENT_CONFIG[label] || SENTIMENT_CONFIG.ERROR;
  const pct   = Math.round(score * 100);

  const badge = document.createElement('span');
  badge.className = 'sentiyt-badge';
  badge.innerHTML = `
    <span>${cfg.emoji}</span>
    <span style="font-weight:700;letter-spacing:0.5px">${cfg.label}</span>
    <span style="opacity:0.7">${pct}%</span>
  `;
  badge.style.cssText = `
    display: inline-flex;
    align-items: center;
    gap: 5px;
    margin-top: 7px;
    padding: 3px 10px;
    border-radius: 20px;
    font-size: 11px;
    font-family: 'Rajdhani', 'Segoe UI', sans-serif;
    font-weight: 600;
    color: ${cfg.color};
    background: ${cfg.bg};
    border: 1px solid ${cfg.border};
    cursor: default;
    user-select: none;
    transition: transform 0.15s, opacity 0.3s;
    opacity: 0;
  `;

  commentEl.insertAdjacentElement('afterend', badge);
  requestAnimationFrame(() => { badge.style.opacity = '1'; });

  badge.addEventListener('mouseenter', () => badge.style.transform = 'scale(1.05)');
  badge.addEventListener('mouseleave', () => badge.style.transform = 'scale(1)');
}

// ── Helpers ───────────────────────────────────────────────────
function getUnprocessed() {
  return Array.from(document.querySelectorAll('ytd-comment-thread-renderer #content-text'))
    .filter(el => !el.getAttribute(PROCESSED_ATTR));
}

async function callAPI(texts) {
  const res = await fetch(API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ comments: texts })
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

function removeBadges() {
  document.querySelectorAll('.sentiyt-badge').forEach(b => b.remove());
  document.querySelectorAll(`[${PROCESSED_ATTR}]`).forEach(el => el.removeAttribute(PROCESSED_ATTR));
}

function debounce(fn, delay) {
  let t;
  return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), delay); };
}
