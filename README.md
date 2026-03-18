# SentiYT 🧠

A Chrome extension that performs real-time sentiment analysis on YouTube comments using a fine-tuned DistilBERT model, with emotion detection, toxicity tracking, and AI-generated audience reports.

![Version](https://img.shields.io/badge/version-2.1.0-red)
![Model](https://img.shields.io/badge/model-DistilBERT-blue)
![License](https://img.shields.io/badge/license-MIT-green)

---

## What It Does

SentiYT injects sentiment badges directly onto YouTube comments and displays a real-time analysis sidebar with:

- **Sentiment Analysis** — classifies every comment as Positive, Negative, or Neutral
- **Sentiment Timeline** — tracks how sentiment shifts as you scroll through comments
- **Toxicity Detection** — flags toxic comments and breaks down hate speech, insults, and threats
- **Emotion Detection** — detects Joy, Anger, Sadness, Surprise, Fear, and Disgust
- **AI Report** — generates a written audience analysis with key themes and video rating prediction using Groq

---

## Project Structure
```
sentiyt/
├── extension/                  # Chrome extension files
│   ├── manifest.json           # Extension config, permissions
│   ├── background.js           # Service worker, sidebar setup
│   ├── content.js              # Injected into YouTube, scans comments
│   ├── sidebar.html            # Sidebar UI
│   ├── sidebar.js              # Sidebar logic, rendering, AI report
│   ├── config.js               # API keys and base URL (gitignored)
│   ├── config.example.js       # Template for config.js
│   └── icons/                  # Extension icons
│
├── server/                     # FastAPI inference server
│   ├── api.py                  # FastAPI app, /predict and /emotions endpoints
│   ├── requirements.txt        # Python dependencies
│   ├── upload_model.py         # One-time script to push model to HuggingFace
│   ├── .env                    # Secrets (gitignored)
│   └── sentiment_model_final/  # Trained model files (gitignored)
│
├── Dockerfile                  # For deploying server to HuggingFace Spaces
├── .gitignore                  # Root gitignore
└── README.md
```

---

## Model

The sentiment model is a fine-tuned **DistilBERT** (`distilbert-base-uncased`) trained on the Sentiment140 dataset (1.6M tweets).

| Property | Value |
|---|---|
| Base model | distilbert-base-uncased |
| Training samples | 300,000 (100k per class) |
| Classes | POSITIVE / NEGATIVE / NEUTRAL |
| Max sequence length | 128 tokens |
| Optimizer | AdamW, lr=2e-5 |
| Training epochs | 3 (early stopping) |

The trained model is hosted privately on HuggingFace and downloaded automatically on server startup.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Extension UI | HTML, CSS, Vanilla JS |
| Comment injection | Chrome Content Scripts |
| Sidebar | Chrome Side Panel API |
| Inference server | FastAPI + Uvicorn |
| ML model | HuggingFace Transformers |
| Model hosting | HuggingFace Hub (private) |
| Server hosting | HuggingFace Spaces (Docker) |
| AI Report | Groq API (llama-3.3-70b-versatile) |

---

## Setup

### Prerequisites

- Python 3.11+
- Chrome browser
- Groq API key — [console.groq.com](https://console.groq.com)
- HuggingFace account — [huggingface.co](https://huggingface.co)

---

### 1. Clone the repo
```bash
git clone https://github.com/your-username/sentiyt.git
cd sentiyt
```

---

### 2. Set up the extension
```bash
cd extension
cp config.example.js config.js
```

Edit `config.js` with your keys:
```js
const CONFIG = {
  GROQ_API_KEY: 'gsk_your_key_here',
  API_BASE: 'http://localhost:8000'   // or your hosted URL
};
```

Load the extension in Chrome:
1. Go to `chrome://extensions`
2. Enable **Developer Mode**
3. Click **Load Unpacked**
4. Select the `extension/` folder

---

### 3. Set up the server locally
```bash
cd server
pip install -r requirements.txt
```

Create `.env`:
```
MODEL_PATH=./sentiment_model_final
```

Run the server:
```bash
uvicorn api:app --reload --port 8000
```

---

### 4. Train your own model (optional)

Open `youtube_sentiment_model.ipynb` and run all cells. The notebook:
- Downloads the Sentiment140 dataset
- Fine-tunes DistilBERT for 3-class sentiment
- Saves the model to `./sentiment_model_final`

---

### 5. Upload model to HuggingFace (for hosting)
```bash
cd server
python upload_model.py
```

Make sure `upload_model.py` has your HuggingFace token and repo name set.

---

### 6. Deploy server to HuggingFace Spaces

1. Go to [huggingface.co/spaces](https://huggingface.co/spaces) → New Space
2. Select **Docker** → **Blank**
3. Clone the space and push these files:
   - `api.py`
   - `requirements.txt`
   - `Dockerfile`
```bash
git clone https://huggingface.co/spaces/your-username/your-space-name
cd your-space-name
# copy api.py, requirements.txt, Dockerfile here
git add .
git commit -m "deploy"
git push
```

4. Go to Space **Settings → Variables and Secrets** and add:
```
HF_MODEL = your-username/your-model-repo
HF_TOKEN = hf_xxxxxxxxxxxx
```

5. Update `config.js` in the extension:
```js
const CONFIG = {
  GROQ_API_KEY: 'gsk_your_key_here',
  API_BASE: 'https://your-username-your-space-name.hf.space'
};
```

---

## How It Works
```
YouTube page loads
       │
       ▼
content.js (injected into YouTube)
       │  finds unprocessed comments
       │  sends batches of 10 to API
       ▼
FastAPI server → DistilBERT model
       │  returns POSITIVE / NEGATIVE / NEUTRAL + confidence score
       ▼
content.js
       │  injects colored badge onto each comment
       │  tracks stats, emotions, toxicity locally
       │  flushes data to chrome.storage.local
       │  broadcasts STATS_UPDATE message
       ▼
sidebar.js (listens for updates)
       │  renders overview, timeline, toxicity, emotions
       ▼
AI Report tab
       │  sends stats summary to Groq API
       │  returns written analysis + themes + rating
       ▼
sidebar UI updates
```

---

## API Endpoints

| Method | Endpoint | Description |
|---|---|---|
| GET | `/health` | Health check, returns model info |
| POST | `/predict` | Batch sentiment analysis |
| POST | `/emotions` | Emotion classification (heuristic) |

### Example request
```bash
curl -X POST https://your-space.hf.space/predict \
  -H "Content-Type: application/json" \
  -d '{"comments": ["This video is amazing!", "Worst content ever"]}'
```

### Example response
```json
[
  {"comment": "This video is amazing!", "label": "POSITIVE", "score": 0.9823},
  {"comment": "Worst content ever", "label": "NEGATIVE", "score": 0.9541}
]
```

---

## Environment Variables

### Server `.env`

| Variable | Description | Required |
|---|---|---|
| `MODEL_PATH` | Path to local model folder | If not using HuggingFace |
| `HF_MODEL` | HuggingFace repo ID e.g. `username/repo` | If hosting on HF Spaces |
| `HF_TOKEN` | HuggingFace access token (read) | If model repo is private |

### Extension `config.js`

| Variable | Description |
|---|---|
| `GROQ_API_KEY` | Groq API key for AI Report tab |
| `API_BASE` | Base URL of your FastAPI server |

---

## Gitignore

These files are intentionally excluded from the repo:

| File/Folder | Reason |
|---|---|
| `extension/config.js` | Contains Groq API key |
| `server/.env` | Contains HuggingFace token |
| `server/sentiment_model_final/` | Large model files, hosted on HuggingFace |
| `server/downloaded_model/` | Auto-downloaded at runtime |
| `__pycache__/` | Python cache, breaks Chrome extension loading |

---

## Known Issues

- **Extension context invalidated** — happens when you reload the extension while YouTube is open. Refresh the YouTube tab to fix.
- **Sidebar shows no data** — make sure you scroll down to the comments section first so YouTube renders them.
- **HuggingFace Spaces cold start** — free tier spaces sleep after inactivity. First request after sleep takes 30-60 seconds.

---

## License

MIT