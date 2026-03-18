// ============================================================
// SentiYT v2.1 — sidebar.js
// ============================================================

const API_BASE = CONFIG.API_BASE;

// ── Elements ─────────────────────────────────────────────────
const enableToggle = document.getElementById('enableToggle');
const toggleLbl    = document.getElementById('toggleLbl');
const apiPip       = document.getElementById('apiPip');
const apiLbl       = document.getElementById('apiLbl');
const checkBtn     = document.getElementById('checkBtn');
const rescanBtn    = document.getElementById('rescanBtn');
const clearBtn     = document.getElementById('clearBtn');
const scanBar      = document.getElementById('scanBar');
const summarizeBtn = document.getElementById('summarizeBtn');
const summaryText  = document.getElementById('summaryText');
const themesWrap   = document.getElementById('themesWrap');

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

// Show API URL from config
document.getElementById('apiUrlDisplay').textContent =
  API_BASE.replace('https://','').replace('http://','') + ' · distilbert-base-uncased';

// ── State ─────────────────────────────────────────────────────
let currentStats  = { pos: 0, neg: 0, neu: 0 };
let timelineData  = [];
let toxicComments = [];
let emotionState  = { joy: 0, anger: 0, sadness: 0, surprise: 0, fear: 0, disgust: 0 };
let topPositive   = [];
let topNegative   = [];
let scanning      = false;

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
chrome.storage.sync.get(['sentimentEnabled'], (res) => {
  const enabled = res.sentimentEnabled !== false;
  enableToggle.checked = enabled;
  updateToggleUI(enabled);
});

chrome.storage.local.get(
  ['stats','timelineData','toxicComments','emotionState','topPositive','topNegative'],
  (res) => {
    if (res.stats)         { currentStats = res.stats;          renderStats(currentStats); }
    if (res.timelineData)  { timelineData = res.timelineData;   renderTimeline(); }
    if (res.toxicComments) { toxicComments = res.toxicComments; renderToxicity(); }
    if (res.emotionState)  { emotionState = res.emotionState;   renderEmotions(); }
    if (res.topPositive)   { topPositive = res.topPositive; }
    if (res.topNegative)   { topNegative = res.topNegative; }
    renderTopComments();
  }
);

sendToContent({ type: 'GET_STATE' });
checkApiStatus();

// ── LIVE UPDATES via runtime messages ─────────────────────────
chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type !== 'STATS_UPDATE') return;
  if (msg.stats)         { currentStats = msg.stats;          renderStats(currentStats); }
  if (msg.timelineData)  { timelineData = msg.timelineData;   renderTimeline(); }
  if (msg.toxicComments) { toxicComments = msg.toxicComments; renderToxicity(); }
  if (msg.emotionState)  { emotionState = msg.emotionState;   renderEmotions(); }
  if (msg.topPositive)   { topPositive = msg.topPositive;     renderTopComments(); }
  if (msg.topNegative)   { topNegative = msg.topNegative;     renderTopComments(); }
});

// Fallback: watch local storage changes
chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'local') return;
  if (changes.stats)         { currentStats = changes.stats.newValue || {};  renderStats(currentStats); }
  if (changes.timelineData)  { timelineData = changes.timelineData.newValue || []; renderTimeline(); }
  if (changes.toxicComments) { toxicComments = changes.toxicComments.newValue || []; renderToxicity(); }
  if (changes.emotionState)  { emotionState = changes.emotionState.newValue || {}; renderEmotions(); }
  if (changes.topPositive)   { topPositive = changes.topPositive.newValue || []; renderTopComments(); }
  if (changes.topNegative)   { topNegative = changes.topNegative.newValue || []; renderTopComments(); }
});

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
    const res = await fetch(`${API_BASE}/health`, { signal: AbortSignal.timeout(5000) });
    if (res.ok) { apiPip.className = 'pip online'; apiLbl.textContent = 'API Online ✓'; }
    else throw new Error();
  } catch {
    apiPip.className = 'pip offline'; apiLbl.textContent = 'API Offline ✗';
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
  currentStats  = { pos: 0, neg: 0, neu: 0 };
  timelineData  = [];
  toxicComments = [];
  emotionState  = { joy: 0, anger: 0, sadness: 0, surprise: 0, fear: 0, disgust: 0 };
  topPositive   = [];
  topNegative   = [];
  chrome.storage.local.remove(['stats','timelineData','toxicComments','emotionState','topPositive','topNegative']);
  renderStats(currentStats);
  renderTimeline();
  renderToxicity();
  renderEmotions();
  renderTopComments();
  sendToContent({ type: 'TOGGLE', enabled: false });
  setTimeout(() => sendToContent({ type: 'TOGGLE', enabled: enableToggle.checked }), 100);
});

function setScanState(active) {
  scanning = active;
  scanBar.classList.toggle('active', active);
  rescanBtn.textContent = active ? '⏳ Scanning…' : '⟳ Rescan';
}

// ── RENDER: OVERVIEW ─────────────────────────────────────────
function renderStats(stats) {
  const { pos = 0, neg = 0, neu = 0 } = stats;
  const total = pos + neg + neu;
  posCount.textContent = pos; negCount.textContent = neg;
  neuCount.textContent = neu; totalCount.textContent = total;

  const pp  = total > 0 ? Math.round((pos / total) * 100) : 0;
  const np  = total > 0 ? Math.round((neg / total) * 100) : 0;
  const nup = total > 0 ? Math.round((neu / total) * 100) : 0;

  setTimeout(() => {
    posBar.style.width = pp + '%';
    negBar.style.width = np + '%';
    neuBar.style.width = nup + '%';
  }, 50);
  posPct.textContent = pp + '%'; negPct.textContent = np + '%'; neuPct.textContent = nup + '%';

  if (total === 0) {
    audienceVerdict.textContent = 'NO DATA'; audienceVerdict.className = 'audience-verdict neutral';
    audienceSub.textContent = 'Scroll to comments section to begin.'; return;
  }
  if (pp >= 55)              { audienceVerdict.textContent = 'VERY POSITIVE';   audienceVerdict.className = 'audience-verdict positive'; audienceSub.textContent = `${pp}% of viewers reacted positively.`; }
  else if (pp >= 40)         { audienceVerdict.textContent = 'MOSTLY POSITIVE'; audienceVerdict.className = 'audience-verdict positive'; audienceSub.textContent = 'Slight positive lean with some mixed reactions.'; }
  else if (np >= 45)         { audienceVerdict.textContent = 'MOSTLY NEGATIVE'; audienceVerdict.className = 'audience-verdict negative'; audienceSub.textContent = `${np}% of viewers reacted negatively.`; }
  else if (np >= 30 && pp >= 30) { audienceVerdict.textContent = 'DIVISIVE';    audienceVerdict.className = 'audience-verdict mixed';    audienceSub.textContent = 'Split audience — strong opinions on both sides.'; }
  else                       { audienceVerdict.textContent = 'NEUTRAL';         audienceVerdict.className = 'audience-verdict neutral';  audienceSub.textContent = `${nup}% neutral — low engagement or mixed feelings.`; }
}

// ── RENDER: TOP COMMENTS ─────────────────────────────────────
function renderTopComments() {
  const posList = document.getElementById('topPositiveList');
  const negList = document.getElementById('topNegativeList');

  posList.innerHTML = (!topPositive || !topPositive.length)
    ? `<div class="top-comment-empty">No positive comments yet</div>`
    : topPositive.map(c => `
        <div class="top-comment pos">
          ${escapeHtml((c.text || '').slice(0, 100))}${(c.text||'').length > 100 ? '…' : ''}
          <div class="top-comment-score">😊 ${Math.round((c.score||0) * 100)}% confidence</div>
        </div>`).join('');

  negList.innerHTML = (!topNegative || !topNegative.length)
    ? `<div class="top-comment-empty">No negative comments yet</div>`
    : topNegative.map(c => `
        <div class="top-comment neg">
          ${escapeHtml((c.text || '').slice(0, 100))}${(c.text||'').length > 100 ? '…' : ''}
          <div class="top-comment-score">😠 ${Math.round((c.score||0) * 100)}% confidence</div>
        </div>`).join('');
}

// ── RENDER: TIMELINE ─────────────────────────────────────────
function renderTimeline() {
  const canvas = document.getElementById('timelineCanvas');
  const ctx = canvas.getContext('2d');
  const w = canvas.offsetWidth || 280, h = 120;
  canvas.width = w * devicePixelRatio; canvas.height = h * devicePixelRatio;
  ctx.scale(devicePixelRatio, devicePixelRatio);
  ctx.clearRect(0, 0, w, h);

  if (!timelineData || timelineData.length < 2) {
    ctx.fillStyle = '#333'; ctx.font = '11px Space Mono, monospace';
    ctx.textAlign = 'center'; ctx.fillText('No timeline data yet — rescan to begin', w/2, h/2); return;
  }

  const buckets = 20, bucketSz = Math.ceil(timelineData.length / buckets), windows = [];
  for (let i = 0; i < buckets; i++) {
    const slice = timelineData.slice(i * bucketSz, (i + 1) * bucketSz);
    if (!slice.length) break;
    windows.push({
      pos: slice.filter(s => s.label === 'POSITIVE').length / slice.length,
      neg: slice.filter(s => s.label === 'NEGATIVE').length / slice.length,
      neu: slice.filter(s => s.label === 'NEUTRAL').length  / slice.length,
    });
  }

  const padL=4,padR=4,padT=10,padB=20,gw=w-padL-padR,gh=h-padT-padB;
  ctx.strokeStyle='#222'; ctx.lineWidth=1;
  for (let i=0;i<=4;i++){const y=padT+(gh/4)*i;ctx.beginPath();ctx.moveTo(padL,y);ctx.lineTo(padL+gw,y);ctx.stroke();}

  [{ key:'pos', color:'#2dc653' },{ key:'neg', color:'#e63946' },{ key:'neu', color:'#f4a261' }]
    .forEach(({ key, color }) => {
      ctx.beginPath(); ctx.strokeStyle=color; ctx.lineWidth=2; ctx.shadowColor=color; ctx.shadowBlur=6;
      windows.forEach((w,i)=>{ const x=padL+(i/(windows.length-1))*gw, y=padT+gh-w[key]*gh; i===0?ctx.moveTo(x,y):ctx.lineTo(x,y); });
      ctx.stroke(); ctx.shadowBlur=0;
      windows.forEach((w,i)=>{ const x=padL+(i/(windows.length-1))*gw, y=padT+gh-w[key]*gh; ctx.beginPath();ctx.arc(x,y,2.5,0,Math.PI*2);ctx.fillStyle=color;ctx.fill(); });
    });

  const total = currentStats.pos + currentStats.neg + currentStats.neu;
  if (total > 0) {
    document.getElementById('tlPos').style.width = (currentStats.pos/total*100)+'%';
    document.getElementById('tlNeg').style.width = (currentStats.neg/total*100)+'%';
    document.getElementById('tlNeu').style.width = (currentStats.neu/total*100)+'%';
  }
}

// ── RENDER: TOXICITY ─────────────────────────────────────────
function renderToxicity() {
  const total = currentStats.pos + currentStats.neg + currentStats.neu;
  const toxPct = total > 0 ? Math.round((currentStats.neg / total) * 100) : 0;
  const hate = Math.round(toxPct * 0.4), insult = Math.round(toxPct * 0.6), threat = Math.round(toxPct * 0.15);

  document.getElementById('toxScoreNum').textContent = toxPct + '%';
  const color = toxPct > 50 ? '#e63946' : toxPct > 25 ? '#f4a261' : '#2dc653';
  document.getElementById('toxScoreNum').style.color = color;
  document.getElementById('toxArc').style.strokeDashoffset = 200 - (toxPct/100) * 200;
  document.getElementById('toxArc').style.stroke = color;

  setToxBar('toxToxic','toxToxicPct',toxPct);
  setToxBar('toxHate','toxHatePct',hate);
  setToxBar('toxInsult','toxInsultPct',insult);
  setToxBar('toxThreat','toxThreatPct',threat);

  const list = document.getElementById('flaggedList');
  list.innerHTML = (!toxicComments || !toxicComments.length)
    ? `<div class="no-flagged"><div class="icon">🛡️</div><div>No flagged comments yet.<br/>Rescan to detect toxic content.</div></div>`
    : toxicComments.slice(0,5).map(c => `
        <div class="flagged-item">
          ${escapeHtml((c.text||'').slice(0,120))}${(c.text||'').length>120?'…':''}
          <div class="flagged-meta">
            <span class="tox-tag">😠 ${Math.round((c.score||0)*100)}% confidence</span>
            ${(c.tags||[]).map(t=>`<span class="tox-tag">${t}</span>`).join('')}
          </div>
        </div>`).join('');
}

function setToxBar(barId, pctId, value) {
  setTimeout(() => { document.getElementById(barId).style.width = value + '%'; }, 50);
  document.getElementById(pctId).textContent = value + '%';
}

// ── RENDER: EMOTIONS ─────────────────────────────────────────
function renderEmotions() {
  const em = emotionState || {};
  const total = Object.values(em).reduce((a,b) => a+b, 0) || 1;
  [['joy','emJoy','emJoyPct'],['anger','emAnger','emAngerPct'],
   ['sadness','emSad','emSadPct'],['surprise','emSurprise','emSurprisePct'],
   ['fear','emFear','emFearPct'],['disgust','emDisgust','emDisgustPct']
  ].forEach(([key,barId,pctId]) => {
    const pct = Math.round(((em[key]||0)/total)*100);
    setTimeout(()=>{ document.getElementById(barId).style.width = pct+'%'; },50);
    document.getElementById(pctId).textContent = pct+'%';
  });
  const dominant = Object.entries(em).sort((a,b)=>b[1]-a[1])[0];
  const emojiMap = { joy:'😂', anger:'😤', sadness:'😢', surprise:'😲', fear:'😨', disgust:'🤢' };
  if (dominant && dominant[1] > 0) {
    document.getElementById('dominantEmoji').textContent = emojiMap[dominant[0]] || '🤔';
    document.getElementById('dominantName').textContent  = dominant[0].toUpperCase();
    document.getElementById('dominantSub').textContent   = `${Math.round((dominant[1]/total)*100)}% of comments carry ${dominant[0]} signals`;
  }
}

// ── AI SUMMARY ────────────────────────────────────────────────
summarizeBtn.addEventListener('click', async () => {
  const total = currentStats.pos + currentStats.neg + currentStats.neu;
  if (total === 0) { summaryText.textContent = 'No comments analyzed yet. Scroll to the comments section first.'; return; }

  summarizeBtn.disabled = true; summarizeBtn.textContent = '⏳ Generating…';
  summaryText.className = 'summary-text loading'; summaryText.textContent = 'Analyzing patterns…';
  themesWrap.innerHTML = '';

  const pp  = Math.round((currentStats.pos/total)*100);
  const np  = Math.round((currentStats.neg/total)*100);
  const nup = Math.round((currentStats.neu/total)*100);
  const domEmotion = Object.entries(emotionState||{}).sort((a,b)=>b[1]-a[1])[0]?.[0] || 'mixed';

  const prompt = `You are analyzing a YouTube video's comment section.
Stats: ${total} total — Positive: ${pp}%, Negative: ${np}%, Neutral: ${nup}%. Dominant emotion: ${domEmotion}. Flagged toxic: ${toxicComments.length}.
Write a punchy 3-4 sentence analysis. Then: "THEMES:" with 5-7 comma-separated keywords. Then: "RATING:" with one of: MUST WATCH / TRENDING / AVERAGE / CONTROVERSIAL / SKIP.`;

  try {
    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${CONFIG.GROQ_API_KEY}` },
      body: JSON.stringify({ model: 'llama-3.3-70b-versatile', max_tokens: 1000, messages: [{ role: 'user', content: prompt }] })
    });
    const data = await response.json();
    const text = data.choices?.[0]?.message?.content || '';
    const parts = text.split('\n').filter(l => l.trim());
    const themeLine = parts.find(l => l.startsWith('THEMES:'));
    const rateLine  = parts.find(l => l.startsWith('RATING:'));
    const body = parts.filter(l => !l.startsWith('THEMES:') && !l.startsWith('RATING:')).join(' ').trim();

    summaryText.className = 'summary-text'; summaryText.textContent = body || text;
    if (themeLine) themesWrap.innerHTML = themeLine.replace('THEMES:','').split(',').map(t=>`<div class="theme-chip">${t.trim()}</div>`).join('');
    if (rateLine) {
      const rating = rateLine.replace('RATING:','').trim();
      const rv = document.getElementById('ratingVerdict');
      rv.textContent = rating;
      rv.className = 'audience-verdict ' + (
        rating.includes('MUST')||rating.includes('TRENDING') ? 'positive' :
        rating.includes('SKIP')||rating.includes('CONTROVERSIAL') ? 'negative' : 'neutral'
      );
      document.getElementById('ratingDesc').textContent = `Based on ${total} analyzed comments`;
    }
  } catch (err) {
    summaryText.className = 'summary-text';
    summaryText.textContent = 'Failed to generate report. Check your Groq API key in config.js.';
  }
  summarizeBtn.disabled = false; summarizeBtn.textContent = '⚡ Generate Report';
});

// ── UTILS ─────────────────────────────────────────────────────
function sendToContent(msg) {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (tabs[0]?.id) chrome.tabs.sendMessage(tabs[0].id, msg).catch(() => {});
  });
}
function escapeHtml(str) {
  return (str||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
window.addEventListener('resize', renderTimeline);