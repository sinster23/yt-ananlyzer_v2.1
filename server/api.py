# api.py — SentiYT v2.1 FastAPI Inference Server
# Run: uvicorn api:app --reload --port 8000

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from transformers import pipeline
from huggingface_hub import snapshot_download
from dotenv import load_dotenv
import re, torch, os

load_dotenv()

app = FastAPI(title="SentiYT API", version="2.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Model loading ─────────────────────────────────────────────
HF_MODEL   = os.getenv("HF_MODEL")
HF_TOKEN   = os.getenv("HF_TOKEN")
LOCAL_PATH = os.getenv("MODEL_PATH", "./sentiment_model_final")

def load_model():
    # If local model folder exists, use it directly (local dev)
    if os.path.exists(LOCAL_PATH):
        print(f"Found local model at: {LOCAL_PATH}")
        return LOCAL_PATH

    # Otherwise download from private HuggingFace repo (server)
    if HF_MODEL and HF_TOKEN:
        print(f"Downloading private model from HuggingFace: {HF_MODEL}")
        path = snapshot_download(
            repo_id=HF_MODEL,
            token=HF_TOKEN,
            local_dir="./downloaded_model"
        )
        print(f"Model downloaded to: {path}")
        return path

    raise RuntimeError(
        "No model found. Either place model in ./sentiment_model_final "
        "or set HF_MODEL + HF_TOKEN in .env"
    )

model_path = load_model()

print(f"Loading classifier from: {model_path}")
classifier = pipeline(
    "text-classification",
    model=model_path,
    tokenizer=model_path,
    device=0 if torch.cuda.is_available() else -1
)
print("Classifier ready!")

# ── Cleaning ──────────────────────────────────────────────────
def clean(text: str) -> str:
    text = re.sub(r"http\S+|www\S+", "", str(text))
    text = re.sub(r"@\w+", "", text)
    text = re.sub(r"#", "", text)
    text = text.encode("ascii", "ignore").decode("ascii")
    return re.sub(r"\s+", " ", text).strip()

# ── Schemas ───────────────────────────────────────────────────
class CommentRequest(BaseModel):
    comments: list[str]

class SentimentResult(BaseModel):
    comment: str
    label: str
    score: float

class EmotionResult(BaseModel):
    comment: str
    emotion: str
    score: float

# ── Endpoints ─────────────────────────────────────────────────
@app.post("/predict", response_model=list[SentimentResult])
def predict(req: CommentRequest):
    """Batch sentiment analysis — returns POSITIVE / NEGATIVE / NEUTRAL."""
    cleaned = [clean(c) for c in req.comments]
    results = classifier(cleaned, truncation=True, max_length=128, batch_size=16)
    return [
        SentimentResult(comment=orig, label=r["label"], score=round(r["score"], 4))
        for orig, r in zip(req.comments, results)
    ]

@app.post("/emotions", response_model=list[EmotionResult])
def emotions(req: CommentRequest):
    """Emotion classification via keyword heuristic."""
    EMOTION_KW = {
        "joy":      ["lol","haha","amazing","love","awesome","great","best","hilarious","happy"],
        "anger":    ["hate","worst","terrible","awful","idiot","stupid","garbage","annoying"],
        "sadness":  ["sad","miss","cry","depressing","unfortunately","poor"],
        "surprise": ["wow","omg","wait","unbelievable","shocking","damn","woah"],
        "fear":     ["scared","afraid","terrifying","dangerous","worried"],
        "disgust":  ["gross","disgusting","sick","vile","yuck","nasty"],
    }
    results = []
    for comment in req.comments:
        lower = comment.lower()
        scores = {emotion: sum(1 for k in keywords if k in lower) for emotion, keywords in EMOTION_KW.items()}
        best = max(scores, key=scores.get)
        best_score = scores[best]
        total = sum(scores.values()) or 1
        results.append(EmotionResult(
            comment=comment,
            emotion=best if best_score > 0 else "neutral",
            score=round(best_score / total, 4)
        ))
    return results

@app.get("/health")
def health():
    return {"status": "ok", "model": "distilbert-sentiment-yt", "version": "2.1.0"}

@app.get("/")
def root():
    return {"message": "SentiYT API v2.1 running. POST /predict | POST /emotions"}