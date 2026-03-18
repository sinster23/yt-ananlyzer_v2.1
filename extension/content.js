// ============================================================
// SentiYT v2.1 — content.js
// ============================================================

const BATCH_SIZE     = 10;
const PROCESSED_ATTR = 'data-sentiyt-done';

// ── API URL — loaded from storage (set by config.js) ─────────
let API_URL = 'https://sinster23-yt-analyzer-v2-1.hf.space/predict'; // fallback
chrome.storage.local.get(['API_BASE'], (res) => {
  if (res.API_BASE) API_URL = `${res.API_BASE}/predict`;
});

// ── Sentiment config ──────────────────────────────────────────
const SENTIMENT_CONFIG = {
  POSITIVE: { emoji: '😊', label: 'Positive', color: '#2dc653', bg: 'rgba(45,198,83,0.10)',  border: 'rgba(45,198,83,0.3)'  },
  NEGATIVE: { emoji: '😠', label: 'Negative', color: '#e63946', bg: 'rgba(230,57,70,0.10)',  border: 'rgba(230,57,70,0.3)'  },
  NEUTRAL:  { emoji: '😐', label: 'Neutral',  color: '#f4a261', bg: 'rgba(244,162,97,0.10)', border: 'rgba(244,162,97,0.3)' },
  ERROR:    { emoji: '⚠️', label: 'Error',    color: '#666',    bg: 'rgba(100,100,100,0.08)', border: 'rgba(100,100,100,0.2)' }
};

// ── Emotion keywords ──────────────────────────────────────────
const EMOTION_KEYWORDS = {
  joy:      ['lol','haha','amazing','love','awesome','funny','great','best','hilarious','laugh','happy','😂','❤️','🔥','💀'],
  anger:    ['hate','worst','terrible','awful','disgusting','idiot','stupid','garbage','trash','annoying','🤬','😡'],
  sadness:  ['sad','miss','cry','depressing','unfortunate','poor','unfortunately','😢','😭','💔'],
  surprise: ['wow','omg','wait','what','unbelievable','shocking','unexpected','damn','woah','😲','🤯'],
  fear:     ['scared','afraid','terrifying','dangerous','warning','risk','worried','concern','😱','😨'],
  disgust:  ['gross','disgusting','sick','vile','yuck','nasty','revolting','🤢','🤮']
};

// ── Toxicity keywords ─────────────────────────────────────────
const TOXICITY_KEYWORDS = ['idiot','stupid','dumb','moron','hate','loser','trash','garbage','kill','die','worthless','pathetic','disgusting'];

// ── State ─────────────────────────────────────────────────────
let isEnabled      = true;
let observer       = null;
const stats        = { pos: 0, neg: 0, neu: 0 };
let timelineBuffer = [];
let toxicBuffer    = [];
let topPositive    = [];
let topNegative    = [];
const emotions     = { joy: 0, anger: 0, sadness: 0, surprise: 0, fear: 0, disgust: 0 };

// ── Video change detection ────────────────────────────────────
let currentVideoId = new URLSearchParams(window.location.search).get('v');

function checkVideoChange() {
  const newVideoId = new URLSearchParams(window.location.search).get('v');
  if (newVideoId && newVideoId !== currentVideoId) {
    currentVideoId = newVideoId;
    resetState();
    removeBadges();
    document.querySelectorAll(`[${PROCESSED_ATTR}]`)
      .forEach(el => el.removeAttribute(PROCESSED_ATTR));
    // Restart scanning for new video after YouTube renders comments
    if (isEnabled) setTimeout(scanComments, 2500);
  }
}

// YouTube is a SPA — fires this event on every navigation
window.addEventListener('yt-navigate-finish', checkVideoChange);

// ── Extension context check ───────────────────────────────────
function isExtensionValid() {
  try { return !!chrome.runtime?.id; }
  catch (e) { return false; }
}

// ── Init ──────────────────────────────────────────────────────
chrome.storage.sync.get(['sentimentEnabled'], (res) => {
  isEnabled = res.sentimentEnabled !== false;
  if (isEnabled) {
    startObserver();
    setTimeout(scanComments, 2000);
  }
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
    removeBadges();
    document.querySelectorAll(`[${PROCESSED_ATTR}]`)
      .forEach(el => el.removeAttribute(PROCESSED_ATTR));
    scanComments();
  }
  if (msg.type === 'GET_STATE') {
    sendStateToSidebar();
  }
});

// ── Observer ──────────────────────────────────────────────────
function startObserver() {
  if (observer) return;
  observer = new MutationObserver(debounce(() => {
    if (!isExtensionValid()) { stopObserver(); return; }
    if (isEnabled) scanComments();
  }, 800));
  observer.observe(document.body, { childList: true, subtree: true });
}

function stopObserver() {
  if (observer) { observer.disconnect(); observer = null; }
}

// ── Scanner ───────────────────────────────────────────────────
async function scanComments() {
  if (!isExtensionValid()) { stopObserver(); return; }

  const els = getUnprocessed();
  if (els.length === 0) return;

  els.forEach(el => el.setAttribute(PROCESSED_ATTR, 'pending'));

  for (let i = 0; i < els.length; i += BATCH_SIZE) {
    const batch = els.slice(i, i + BATCH_SIZE);
    const texts = batch.map(el => el.innerText?.trim() || '');

    try {
      const results = await callAPI(texts);
      batch.forEach((el, idx) => {
        injectBadge(el, results[idx]);
        trackResult(results[idx], texts[idx]);
        el.setAttribute(PROCESSED_ATTR, 'done');
      });
      flushStorage(); // push after every batch
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
function trackResult(result, text) {
  const label = result?.label;
  const score = result?.score || 0;

  if      (label === 'POSITIVE') stats.pos++;
  else if (label === 'NEGATIVE') stats.neg++;
  else if (label === 'NEUTRAL')  stats.neu++;

  // Timeline
  timelineBuffer.push({ label, ts: Date.now() });

  // Emotions
  const lower = (text || '').toLowerCase();
  Object.entries(EMOTION_KEYWORDS).forEach(([emotion, keywords]) => {
    if (keywords.some(k => lower.includes(k.toLowerCase()))) emotions[emotion]++;
  });

  // Top positive comments
  if (label === 'POSITIVE') {
    topPositive.push({ text, score });
    topPositive.sort((a, b) => b.score - a.score);
    topPositive = topPositive.slice(0, 5);
  }

  // Top negative comments + toxicity
  if (label === 'NEGATIVE') {
    topNegative.push({ text, score });
    topNegative.sort((a, b) => b.score - a.score);
    topNegative = topNegative.slice(0, 5);

    const isToxic = TOXICITY_KEYWORDS.some(k => lower.includes(k));
    if (isToxic || score > 0.85) {
      toxicBuffer.push({ text, score, tags: detectToxTags(lower) });
    }
  }
}

function detectToxTags(text) {
  const tags = [];
  if (['hate','racist','sexist'].some(k => text.includes(k)))       tags.push('hate speech');
  if (['idiot','stupid','moron','dumb'].some(k => text.includes(k))) tags.push('insult');
  if (['kill','die','threat'].some(k => text.includes(k)))           tags.push('threat');
  return tags;
}

// ── Storage ───────────────────────────────────────────────────
function flushStorage() {
  if (!isExtensionValid()) return;
  try {
    const payload = {
      stats:         { ...stats },
      timelineData:  timelineBuffer.slice(-200),
      toxicComments: toxicBuffer.slice(-20),
      emotionState:  { ...emotions },
      topPositive:   [...topPositive],
      topNegative:   [...topNegative]
    };
    chrome.storage.local.set(payload);
    chrome.runtime.sendMessage({ type: 'STATS_UPDATE', ...payload }).catch(() => {});
  } catch (e) {}
}

function sendStateToSidebar() {
  if (!isExtensionValid()) return;
  chrome.storage.local.get(
    ['stats','timelineData','toxicComments','emotionState','topPositive','topNegative'],
    (res) => {
      chrome.runtime.sendMessage({
        type:          'STATS_UPDATE',
        stats:         res.stats         || { pos:0, neg:0, neu:0 },
        timelineData:  res.timelineData  || [],
        toxicComments: res.toxicComments || [],
        emotionState:  res.emotionState  || {},
        topPositive:   res.topPositive   || [],
        topNegative:   res.topNegative   || []
      }).catch(() => {});
    }
  );
}

function resetState() {
  stats.pos = 0; stats.neg = 0; stats.neu = 0;
  timelineBuffer = [];
  toxicBuffer    = [];
  topPositive    = [];
  topNegative    = [];
  Object.keys(emotions).forEach(k => emotions[k] = 0);

  const empty = {
    stats:         { pos:0, neg:0, neu:0 },
    timelineData:  [],
    toxicComments: [],
    emotionState:  { joy:0, anger:0, sadness:0, surprise:0, fear:0, disgust:0 },
    topPositive:   [],
    topNegative:   []
  };
  if (!isExtensionValid()) return;
  try {
    chrome.storage.local.set(empty);
    chrome.runtime.sendMessage({ type: 'STATS_UPDATE', ...empty }).catch(() => {});
  } catch (e) {}
}

// ── Badge ─────────────────────────────────────────────────────
function injectBadge(commentEl, result) {
  const old = commentEl.parentElement?.querySelector('.sentiyt-badge');
  if (old) old.remove();

  const label = result?.label || 'ERROR';
  const cfg   = SENTIMENT_CONFIG[label] || SENTIMENT_CONFIG.ERROR;
  const pct   = Math.round((result?.score || 0) * 100);

  const badge = document.createElement('span');
  badge.className = 'sentiyt-badge';
  badge.innerHTML = `
    <span>${cfg.emoji}</span>
    <span style="font-weight:700;letter-spacing:0.5px">${cfg.label}</span>
    <span style="opacity:0.7">${pct}%</span>
  `;
  badge.style.cssText = `
    display:inline-flex;align-items:center;gap:5px;
    margin-top:7px;padding:3px 10px;border-radius:20px;
    font-size:11px;font-family:'Rajdhani','Segoe UI',sans-serif;
    font-weight:600;color:${cfg.color};background:${cfg.bg};
    border:1px solid ${cfg.border};cursor:default;user-select:none;
    transition:transform 0.15s,opacity 0.3s;opacity:0;
  `;
  commentEl.insertAdjacentElement('afterend', badge);
  requestAnimationFrame(() => { badge.style.opacity = '1'; });
  badge.addEventListener('mouseenter', () => badge.style.transform = 'scale(1.05)');
  badge.addEventListener('mouseleave', () => badge.style.transform = 'scale(1)');
}

// ── Helpers ───────────────────────────────────────────────────
function getUnprocessed() {
  return Array.from(
    document.querySelectorAll('ytd-comment-thread-renderer #content-text')
  ).filter(el => !el.getAttribute(PROCESSED_ATTR));
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
  document.querySelectorAll(`[${PROCESSED_ATTR}]`)
    .forEach(el => el.removeAttribute(PROCESSED_ATTR));
}

function debounce(fn, delay) {
  let t;
  return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), delay); };
}