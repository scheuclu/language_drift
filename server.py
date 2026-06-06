import sys
import os

# Add repo root to sys.path just in case
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import torch
from transformers import AutoTokenizer, AutoModel
import numpy as np
from sklearn.decomposition import PCA

app = FastAPI(title="WordDrift NLP Service")

# Allow CORS so Next.js frontend can communicate with the Python service
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Load lightweight DistilBERT tokenizer and model
MODEL_NAME = "distilbert-base-uncased"
print(f"Loading {MODEL_NAME} tokenizer and model...")
tokenizer = AutoTokenizer.from_pretrained(MODEL_NAME)
model = AutoModel.from_pretrained(MODEL_NAME)
model.eval()
print("Model loaded successfully.")

# Stop words to exclude from context mapping
STOP_WORDS = {
    "the", "a", "an", "and", "or", "but", "if", "then", "else", "when", 
    "at", "by", "for", "from", "in", "into", "of", "off", "on", "onto", 
    "out", "over", "to", "up", "with", "is", "was", "were", "be", "been", 
    "am", "are", "have", "has", "had", "do", "does", "did", "he", "she", 
    "it", "they", "we", "you", "i", "his", "her", "their", "our", "your", 
    "my", "this", "that", "these", "those", "there", "here"
}

class DriftRequest(BaseModel):
    word: str
    context_a: str
    context_b: str

def get_word_embedding(context: str, word: str):
    words = context.split()
    target_clean = word.strip().lower()
    
    # Locate the target word index in the sentence
    word_index = -1
    for idx, w in enumerate(words):
        # Strip punctuation to match target word
        w_clean = "".join(c for c in w if c.isalnum()).lower()
        if w_clean == target_clean:
            word_index = idx
            break
            
    # Fallback if no exact alphanumeric match
    if word_index == -1:
        for idx, w in enumerate(words):
            if target_clean in w.lower():
                word_index = idx
                break
                
    if word_index == -1:
        raise ValueError(f"Word '{word}' was not found in context: '{context}'")
        
    inputs = tokenizer(context, return_tensors="pt")
    with torch.no_grad():
        outputs = model(**inputs)
    
    last_hidden = outputs.last_hidden_state[0] # [seq_len, hidden_dim]
    word_ids = inputs.word_ids(batch_index=0)
    
    token_indices = [i for i, w_id in enumerate(word_ids) if w_id == word_index]
    if not token_indices:
        raise ValueError(f"Tokens for '{word}' at index {word_index} not found.")
        
    embedding = last_hidden[token_indices].mean(dim=0)
    return embedding, inputs, last_hidden, words

@app.post("/api/context-drift")
def context_drift(req: DriftRequest):
    word = req.word.strip()
    context_a = req.context_a.strip()
    context_b = req.context_b.strip()
    
    if not word or not context_a or not context_b:
        raise HTTPException(status_code=400, detail="Missing word or contexts.")
        
    try:
        # Extract target word embeddings from both contexts
        emb_a, inputs_a, hidden_a, words_a = get_word_embedding(context_a, word)
        emb_b, inputs_b, hidden_b, words_b = get_word_embedding(context_b, word)
        
        # Calculate Cosine Similarity
        cosine_sim = torch.nn.functional.cosine_similarity(emb_a, emb_b, dim=0).item()
        cosine_dist = 1.0 - cosine_sim
        
        # Collect vectors and labels for PCA projection
        vectors = [emb_a, emb_b]
        labels = [f"{word} (A)", f"{word} (B)"]
        sources = ["target_a", "target_b"]
        
        # Helper to add helper keywords from context
        def add_context_words(words_list, inputs, hidden, source_name):
            word_ids = inputs.word_ids(batch_index=0)
            seen = set()
            for idx, w in enumerate(words_list):
                w_clean = "".join(c for c in w if c.isalnum()).lower()
                if not w_clean or w_clean in STOP_WORDS or w_clean == word.lower() or w_clean in seen:
                    continue
                seen.add(w_clean)
                token_indices = [i for i, w_id in enumerate(word_ids) if w_id == idx]
                if token_indices:
                    vec = hidden[token_indices].mean(dim=0)
                    vectors.append(vec)
                    labels.append(w_clean)
                    sources.append(source_name)

        # Append background context words to fill out the PCA space
        add_context_words(words_a, inputs_a, hidden_a, "context_a")
        add_context_words(words_b, inputs_b, hidden_b, "context_b")
        
        # Project using PCA to 2D
        X = torch.stack(vectors).cpu().numpy()
        pca = PCA(n_components=2, random_state=42)
        X_2d = pca.fit_transform(X)
        
        points = []
        for i in range(len(labels)):
            points.append({
                "label": labels[i],
                "x": float(X_2d[i, 0]),
                "y": float(X_2d[i, 1]),
                "source": sources[i]
            })
            
        return {
            "similarity": float(cosine_sim),
            "distance": float(cosine_dist),
            "points": points
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="127.0.0.1", port=8000)
