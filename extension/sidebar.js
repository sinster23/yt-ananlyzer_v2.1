// ============================================================
// SentiYT v2.0 — sidebar.js
// ============================================================

const API_BASE = CONFIG.API_BASE;

// ── Elements ─────────────────────────────────────────────────
const enableToggle  = document.getElementById('enableToggle');
const toggleLbl     = document.getElementById('toggleLbl');
const apiPip        = document.getElementById('apiPip');
const apiLbl        = document.getElementById('apiLbl');
const checkBtn      = document.getElementById('checkBtn');
const rescanBtn     = document.getElementById('rescanBtn');
const clearBtn      = document.getElementById('clearBtn');
const scanBar       = document.getElementById('scanBar');
const summarizeBtn  = document.getElementById('summarizeBtn');
const summaryText   = document.getElementById('summaryText');
const themesWrap    = document.getElementById('themesWrap');

// Overview
const audienceVerdict = document.getElementById('audienceVerdict');
const audienceSub     = document.getElementById('audienceSub');
const totalCount      = document.getElementById('totalCount');
const posCount        = document.getElementById('posCount');
const negCount        = document.getElementById('negCount');
const neuCount        = document.getElementById('neuCount');
const posBar          = document.getElementById('posBar');
const negBar          = document.getElementById('negBar');
const neuBar          = document.getElementById('neuBar');
const posPct          = document.getElementById('posPct');
const negPct          = document.getElementById('negPct');
const neuPct          = document.getElementById('neuPct');

// State
let currentStats    = { pos: 0, neg: 0, neu: 0 };
let timelineData    = [];  // Array of {label, ts} in order of analysis
let toxicComments   = [];
let emotionState    = { joy: 0, anger: 0, sadness: 0, surprise: 0, fear: 0, disgust: 0 };
let scanning        = false;

// ── TABS ─────────────────────────────────────────────────────
document.querySelectorAll('.tab').forEach(tab => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.panel').forEach(p => p.classList.remove('active'));
    tab.classList.add('active');
    document.getElementById('tab-' + tab.dataset.tab).classList.add('active');
  });
});

// ── INIT ─────────────────────────────────────────────────────
chrome.storage.sync.get(['sentimentEnabled', 'stats', 'timelineData', 'toxicComments', 'emotionState'], (res) => {
  const enabled = res.sentimentEnabled !== false;
  enableToggle.checked = enabled;
  updateToggleUI(enabled);

  if (res.stats) {
    currentStats = res.stats;
    renderStats(res.stats);
  }
  if (res.timelineData) {
    timelineData = res.timelineData;
    renderTimeline();
  }
  if (res.toxicComments) {
    toxicComments = res.toxicComments;
    renderToxicity();
  }
  if (res.emotionState) {
    emotionState = res.emotionState;
    renderEmotions();
  }
});

checkApiStatus();

// ── TOGGLE ───────────────────────────────────────────────────
enableToggle.addEventListener('change', () => {
  const enabled = enableToggle.checked;
  chrome.storage.sync.set({ sentimentEnabled: enabled });
  updateToggleUI(enabled);
  sendToContent({ type: 'TOGGLE', enabled });
});

function updateToggleUI(enabled) {
  toggleLbl.textContent = enabled ? 'ON' : 'OFF';
  document.body.className = enabled ? '' : 'disabled';
}

// ── API HEALTH ────────────────────────────────────────────────
async function checkApiStatus() {
  apiPip.className = 'pip';
  apiLbl.textContent = 'Connecting…';
  try {
    const res = await fetch(`${API_BASE}/health`, { signal: AbortSignal.timeout(3000) });
    if (res.ok) {
      apiPip.className = 'pip online';
      apiLbl.textContent = 'API Online ✓';
    } else throw new Error();
  } catch {
    apiPip.className = 'pip offline';
    apiLbl.textContent = 'API Offline ✗';
  }
}

checkBtn.addEventListener('click', checkApiStatus);

// ── RESCAN / CLEAR ────────────────────────────────────────────
rescanBtn.addEventListener('click', () => {
  if (scanning) return;
  setScanState(true);
  sendToContent({ type: 'RESCAN' });
  setTimeout(() => setScanState(false), 3000);
});

clearBtn.addEventListener('click', () => {
  currentStats = { pos: 0, neg: 0, neu: 0 };
  timelineData = [];
  toxicComments = [];
  emotionState = { joy: 0, anger: 0, sadness: 0, surprise: 0, fear: 0, disgust: 0 };

  chrome.storage.sync.remove(['stats', 'timelineData', 'toxicComments', 'emotionState']);
  renderStats(currentStats);
  renderTimeline();
  renderToxicity();
  renderEmotions();

  sendToContent({ type: 'TOGGLE', enabled: false });
  setTimeout(() => sendToContent({ type: 'TOGGLE', enabled: enableToggle.checked }), 100);
});

function setScanState(active) {
  scanning = active;
  scanBar.classList.toggle('active', active);
  rescanBtn.textContent = active ? '⏳ Scanning…' : '⟳ Rescan';
}

// ── STATS STORAGE LISTENER ────────────────────────────────────
chrome.storage.onChanged.addListener((changes) => {
  if (changes.stats)        { currentStats = changes.stats.newValue || {}; renderStats(currentStats); }
  if (changes.timelineData) { timelineData = changes.timelineData.newValue || []; renderTimeline(); }
  if (changes.toxicComments){ toxicComments = changes.toxicComments.newValue || []; renderToxicity(); }
  if (changes.emotionState) { emotionState = changes.emotionState.newValue || {}; renderEmotions(); }
});

// ── RENDER: OVERVIEW ─────────────────────────────────────────
function renderStats(stats) {
  const { pos = 0, neg = 0, neu = 0 } = stats;
  const total = pos + neg + neu;

  posCount.textContent = pos;
  negCount.textContent = neg;
  neuCount.textContent = neu;
  totalCount.textContent = total;

  const pp  = total > 0 ? Math.round((pos / total) * 100) : 0;
  const np  = total > 0 ? Math.round((neg / total) * 100) : 0;
  const nup = total > 0 ? Math.round((neu / total) * 100) : 0;

  setTimeout(() => {
    posBar.style.width = pp  + '%';
    negBar.style.width = np  + '%';
    neuBar.style.width = nup + '%';
  }, 50);

  posPct.textContent = pp  + '%';
  negPct.textContent = np  + '%';
  neuPct.textContent = nup + '%';

  // Audience verdict
  if (total === 0) {
    audienceVerdict.textContent = 'NO DATA';
    audienceVerdict.className   = 'audience-verdict neutral';
    audienceSub.textContent     = 'Scroll to comments section to begin.';
    return;
  }

  if (pp >= 55) {
    audienceVerdict.textContent = 'VERY POSITIVE';
    audienceVerdict.className   = 'audience-verdict positive';
    audienceSub.textContent     = `${pp}% of viewers reacted positively.`;
  } else if (pp >= 40) {
    audienceVerdict.textContent = 'MOSTLY POSITIVE';
    audienceVerdict.className   = 'audience-verdict positive';
    audienceSub.textContent     = `Slight positive lean with some mixed reactions.`;
  } else if (np >= 45) {
    audienceVerdict.textContent = 'MOSTLY NEGATIVE';
    audienceVerdict.className   = 'audience-verdict negative';
    audienceSub.textContent     = `${np}% of viewers reacted negatively.`;
  } else if (np >= 30 && pp >= 30) {
    audienceVerdict.textContent = 'DIVISIVE';
    audienceVerdict.className   = 'audience-verdict mixed';
    audienceSub.textContent     = `Split audience — strong opinions on both sides.`;
  } else {
    audienceVerdict.textContent = 'NEUTRAL';
    audienceVerdict.className   = 'audience-verdict neutral';
    audienceSub.textContent     = `${nup}% neutral — low engagement or mixed feelings.`;
  }
}

// ── RENDER: TIMELINE ─────────────────────────────────────────
function renderTimeline() {
  const canvas = document.getElementById('timelineCanvas');
  const ctx    = canvas.getContext('2d');
  const W = canvas.width = canvas.offsetWidth * devicePixelRatio || 280;
  const H = canvas.height = 120 * devicePixelRatio;
  ctx.scale(devicePixelRatio, devicePixelRatio);

  const w = canvas.offsetWidth || 280;
  const h = 120;
  ctx.clearRect(0, 0, w, h);

  if (!timelineData || timelineData.length < 2) {
    ctx.fillStyle = '#333';
    ctx.font = '11px Space Mono, monospace';
    ctx.textAlign = 'center';
    ctx.fillText('No timeline data yet — rescan to begin', w / 2, h / 2);
    return;
  }

  // Bucket into 20 windows
  const buckets  = 20;
  const bucketSz = Math.ceil(timelineData.length / buckets);
  const windows  = [];

  for (let i = 0; i < buckets; i++) {
    const slice = timelineData.slice(i * bucketSz, (i + 1) * bucketSz);
    if (slice.length === 0) break;
    const pos = slice.filter(s => s.label === 'POSITIVE').length / slice.length;
    const neg = slice.filter(s => s.label === 'NEGATIVE').length / slice.length;
    const neu = slice.filter(s => s.label === 'NEUTRAL').length  / slice.length;
    windows.push({ pos, neg, neu });
  }

  const padL = 4, padR = 4, padT = 10, padB = 20;
  const gw = w - padL - padR;
  const gh = h - padT - padB;

  // Grid lines
  ctx.strokeStyle = '#222';
  ctx.lineWidth   = 1;
  for (let i = 0; i <= 4; i++) {
    const y = padT + (gh / 4) * i;
    ctx.beginPath(); ctx.moveTo(padL, y); ctx.lineTo(padL + gw, y); ctx.stroke();
  }

  // Draw lines for each series
  const series = [
    { key: 'pos', color: '#2dc653' },
    { key: 'neg', color: '#e63946' },
    { key: 'neu', color: '#f4a261' },
  ];

  series.forEach(({ key, color }) => {
    ctx.beginPath();
    ctx.strokeStyle = color;
    ctx.lineWidth   = 2;
    ctx.shadowColor = color;
    ctx.shadowBlur  = 6;

    windows.forEach((w_item, i) => {
      const x = padL + (i / (windows.length - 1)) * gw;
      const y = padT + gh - w_item[key] * gh;
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    });
    ctx.stroke();
    ctx.shadowBlur = 0;

    // Dots
    windows.forEach((w_item, i) => {
      const x = padL + (i / (windows.length - 1)) * gw;
      const y = padT + gh - w_item[key] * gh;
      ctx.beginPath();
      ctx.arc(x, y, 2.5, 0, Math.PI * 2);
      ctx.fillStyle = color;
      ctx.fill();
    });
  });

  // Y labels
  ctx.fillStyle = '#444';
  ctx.font = '9px Space Mono, monospace';
  ctx.textAlign = 'left';
  ['100%','75%','50%','25%','0%'].forEach((lbl, i) => {
    ctx.fillText(lbl, 2, padT + (gh / 4) * i + 3);
  });

  // Timeline track
  const total = currentStats.pos + currentStats.neg + currentStats.neu;
  if (total > 0) {
    const pp  = currentStats.pos / total;
    const np  = currentStats.neg / total;
    const nup = currentStats.neu / total;
    document.getElementById('tlPos').style.width = (pp * 100)  + '%';
    document.getElementById('tlNeg').style.width = (np * 100)  + '%';
    document.getElementById('tlNeu').style.width = (nup * 100) + '%';
  }
}

// ── RENDER: TOXICITY ─────────────────────────────────────────
function renderToxicity() {
  const total = currentStats.pos + currentStats.neg + currentStats.neu;

  // Estimate toxicity from negative ratio (heuristic until Perspective API added)
  const toxPct = total > 0 ? Math.round((currentStats.neg / total) * 100) : 0;
  const hate    = Math.round(toxPct * 0.4);
  const insult  = Math.round(toxPct * 0.6);
  const threat  = Math.round(toxPct * 0.15);

  document.getElementById('toxScoreNum').textContent = toxPct + '%';
  const color = toxPct > 50 ? '#e63946' : toxPct > 25 ? '#f4a261' : '#2dc653';
  document.getElementById('toxScoreNum').style.color = color;

  // Gauge arc (semicircle: dasharray ~200 units)
  const offset = 200 - (toxPct / 100) * 200;
  const arc = document.getElementById('toxArc');
  arc.style.strokeDashoffset = offset;
  arc.style.stroke = color;

  // Bars
  setToxBar('toxToxic',  'toxToxicPct',  toxPct);
  setToxBar('toxHate',   'toxHatePct',   hate);
  setToxBar('toxInsult', 'toxInsultPct', insult);
  setToxBar('toxThreat', 'toxThreatPct', threat);

  // Flagged comments
  const list = document.getElementById('flaggedList');
  if (!toxicComments || toxicComments.length === 0) {
    list.innerHTML = `<div class="no-flagged"><div class="icon">🛡️</div><div>No flagged comments yet.<br/>Rescan to detect toxic content.</div></div>`;
  } else {
    list.innerHTML = toxicComments.slice(0, 5).map(c => `
      <div class="flagged-item">
        ${escapeHtml(c.text.slice(0, 120))}${c.text.length > 120 ? '…' : ''}
        <div class="flagged-meta">
          <span class="tox-tag">😠 ${Math.round(c.score * 100)}% confidence</span>
          ${c.tags ? c.tags.map(t => `<span class="tox-tag">${t}</span>`).join('') : ''}
        </div>
      </div>
    `).join('');
  }
}

function setToxBar(barId, pctId, value) {
  setTimeout(() => { document.getElementById(barId).style.width = value + '%'; }, 50);
  document.getElementById(pctId).textContent = value + '%';
}

// ── RENDER: EMOTIONS ─────────────────────────────────────────
function renderEmotions() {
  const em = emotionState;
  const total = Object.values(em).reduce((a, b) => a + b, 0) || 1;

  const emotions = [
    { key: 'joy',      elBar: 'emJoy',      elPct: 'emJoyPct'     },
    { key: 'anger',    elBar: 'emAnger',     elPct: 'emAngerPct'   },
    { key: 'sadness',  elBar: 'emSad',       elPct: 'emSadPct'     },
    { key: 'surprise', elBar: 'emSurprise',  elPct: 'emSurprisePct'},
    { key: 'fear',     elBar: 'emFear',      elPct: 'emFearPct'    },
    { key: 'disgust',  elBar: 'emDisgust',   elPct: 'emDisgustPct' },
  ];

  emotions.forEach(({ key, elBar, elPct }) => {
    const pct = Math.round(((em[key] || 0) / total) * 100);
    setTimeout(() => { document.getElementById(elBar).style.width = pct + '%'; }, 50);
    document.getElementById(elPct).textContent = pct + '%';
  });

  // Dominant
  const dominant = Object.entries(em).sort((a, b) => b[1] - a[1])[0];
  const emojiMap = { joy:'😂', anger:'😤', sadness:'😢', surprise:'😲', fear:'😨', disgust:'🤢' };

  if (dominant && dominant[1] > 0) {
    document.getElementById('dominantEmoji').textContent = emojiMap[dominant[0]] || '🤔';
    document.getElementById('dominantName').textContent  = dominant[0].toUpperCase();
    document.getElementById('dominantSub').textContent   =
      `${Math.round((dominant[1] / total) * 100)}% of comments carry ${dominant[0]} signals`;
  }
}

// ── AI SUMMARY ────────────────────────────────────────────────
summarizeBtn.addEventListener('click', async () => {
  const total = currentStats.pos + currentStats.neg + currentStats.neu;
  if (total === 0) {
    summaryText.textContent = 'No comments analyzed yet. Scroll to the comments section first.';
    return;
  }

  summarizeBtn.disabled  = true;
  summarizeBtn.textContent = '⏳ Generating…';
  summaryText.className  = 'summary-text loading';
  summaryText.textContent = 'Analyzing patterns and generating insights…';
  themesWrap.innerHTML   = '';

  const pp  = Math.round((currentStats.pos / total) * 100);
  const np  = Math.round((currentStats.neg / total) * 100);
  const nup = Math.round((currentStats.neu / total) * 100);
  const em  = emotionState;
  const domEmotion = Object.entries(em).sort((a,b) => b[1]-a[1])[0]?.[0] || 'mixed';

  const prompt = `You are analyzing a YouTube video's comment section for a sentiment dashboard.

Stats:
- Total comments analyzed: ${total}
- Positive: ${pp}% (${currentStats.pos} comments)
- Negative: ${np}% (${currentStats.neg} comments)  
- Neutral: ${nup}% (${currentStats.neu} comments)
- Dominant emotion signal: ${domEmotion}
- Flagged toxic comments: ${toxicComments.length}

Write a short, punchy analysis (3-4 sentences max) of the audience reaction. Be specific and insightful. Then on a new line, write "THEMES:" followed by 5-7 comma-separated theme keywords that likely explain these patterns. Then on a new line write "RATING:" followed by one of: MUST WATCH / TRENDING / AVERAGE / CONTROVERSIAL / SKIP.

Example format:
The audience responded with strong enthusiasm, with ${pp}% expressing positive sentiment...

THEMES: tutorial quality, nostalgia, humor, relatable content, production value
RATING: TRENDING`;

  try {
const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${CONFIG.GROQ_API_KEY}` 
  },
  body: JSON.stringify({
    model: 'llama-3.3-70b-versatile',  
    max_tokens: 1000,
    messages: [{ role: 'user', content: prompt }]
  })
});

const data = await response.json();
const text = data.choices?.[0]?.message?.content || '';

    // Parse sections
    const parts    = text.split('\n').filter(l => l.trim());
    const themeLine = parts.find(l => l.startsWith('THEMES:'));
    const rateLine  = parts.find(l => l.startsWith('RATING:'));
    const bodyLines = parts.filter(l => !l.startsWith('THEMES:') && !l.startsWith('RATING:'));

    summaryText.className   = 'summary-text';
    summaryText.textContent = bodyLines.join(' ').trim() || text;

    // Themes
    if (themeLine) {
      const themes = themeLine.replace('THEMES:', '').split(',').map(t => t.trim()).filter(Boolean);
      themesWrap.innerHTML = themes.map(t => `<div class="theme-chip">${t}</div>`).join('');
    }

    // Rating
    if (rateLine) {
      const rating = rateLine.replace('RATING:', '').trim();
      const ratingVerdict = document.getElementById('ratingVerdict');
      const ratingDesc    = document.getElementById('ratingDesc');
      ratingVerdict.textContent = rating;
      ratingVerdict.className   = 'audience-verdict ' + (
        rating.includes('MUST') || rating.includes('TRENDING') ? 'positive' :
        rating.includes('SKIP') || rating.includes('CONTROVERSIAL') ? 'negative' : 'neutral'
      );
      ratingDesc.textContent = `Based on ${total} analyzed comments`;
    }

  } catch (err) {
    summaryText.className   = 'summary-text';
    summaryText.textContent = 'Failed to generate report. Make sure you are connected to the internet.';
  }

  summarizeBtn.disabled    = false;
  summarizeBtn.textContent = 'Generate Report';
});

// ── UTILS ─────────────────────────────────────────────────────
function sendToContent(msg) {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (tabs[0]?.id) chrome.tabs.sendMessage(tabs[0].id, msg).catch(() => {});
  });
}

function escapeHtml(str) {
  return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// Redraw timeline on window resize
window.addEventListener('resize', renderTimeline);
