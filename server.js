import express from "express";
import fetch from "node-fetch";
import natural from "natural";
import dotenv from "dotenv";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static("public"));

const tokenizer = new natural.SentenceTokenizer();

/**
 * Tính similarity bằng cosine similarity
 */
function similarity(a, b) {
  const tfidf = new natural.TfIdf();
  tfidf.addDocument(a);
  tfidf.addDocument(b);

  let v1 = {}, v2 = {};
  tfidf.listTerms(0).forEach(t => (v1[t.term] = t.tfidf));
  tfidf.listTerms(1).forEach(t => (v2[t.term] = t.tfidf));

  const terms = new Set([...Object.keys(v1), ...Object.keys(v2)]);
  let dot = 0, mag1 = 0, mag2 = 0;

  terms.forEach(t => {
    const x = v1[t] || 0;
    const y = v2[t] || 0;
    dot += x * y;
    mag1 += x * x;
    mag2 += y * y;
  });

  return mag1 && mag2 ? dot / (Math.sqrt(mag1) * Math.sqrt(mag2)) : 0;
}

/**
 * API check plagiarism
 */
app.post("/check", async (req, res) => {
  const text = req.body.text;
  if (!text || text.length < 30) {
    return res.json({ error: "Text quá ngắn" });
  }

  // 👉 TỐI ƯU QUOTA: chỉ lấy 5 câu đầu
  const sentences = tokenizer.tokenize(text).slice(0, 5);

  let totalScore = 0;
  let checked = 0;

  for (const sentence of sentences) {
    const query = encodeURIComponent(sentence);
    const url = `https://www.googleapis.com/customsearch/v1?key=${process.env.GOOGLE_API_KEY}&cx=${process.env.GOOGLE_CSE_ID}&q=${query}`;

    const r = await fetch(url);
    const data = await r.json();

    if (data.items) {
      for (const item of data.items.slice(0, 1)) {
        const score = similarity(sentence, item.snippet);
        totalScore += score;
        checked++;
      }
    }
  }

  const percent = checked
    ? Math.min(100, Math.round((totalScore / checked) * 100))
    : 0;

  let level = "Safe";
  if (percent > 40) level = "High";
  else if (percent > 15) level = "Medium";

  res.json({
    plagiarism: percent,
    level
  });
});

app.listen(PORT, () =>
  console.log(`🚀 Server running: http://localhost:${PORT}`)
);
