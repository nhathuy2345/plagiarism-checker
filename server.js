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

// Hàm tính similarity (Giữ nguyên logic của bạn nhưng tối ưu nhẹ)
function getSimilarity(a, b) {
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

app.post("/check", async (req, res) => {
    try {
        const text = req.body.text;
        if (!text || text.length < 30) {
            return res.status(400).json({ error: "Văn bản quá ngắn (tối thiểu 30 ký tự)" });
        }

        const sentences = tokenizer.tokenize(text).slice(0, 5);
        const results = [];

        // Sử dụng Promise.all để gọi API song song (nhanh hơn gấp nhiều lần)
        const searchPromises = sentences.map(async (sentence) => {
            const query = encodeURIComponent(sentence); // vViết bình thường để tìm chính xác
            const url = `https://www.googleapis.com/customsearch/v1?key=${process.env.GOOGLE_API_KEY}&cx=${process.env.GOOGLE_CSE_ID}&q=${query}`;
            
            try {
                const r = await fetch(url);
                const data = await r.json();
                if (data.items && data.items.length > 0) {
                    const bestMatch = data.items[0];
                    const score = getSimilarity(sentence, bestMatch.snippet);
                    return {
                        sentence: sentence,
                        source: bestMatch.title,
                        link: bestMatch.link,
                        score: score
                    };
                }
            } catch (err) {
                console.error("Lỗi gọi Google API");
            }
            return null;
        });

        const foundSources = (await Promise.all(searchPromises)).filter(s => s !== null);

        // Tính toán tổng phần trăm
        const totalScore = foundSources.reduce((acc, curr) => acc + curr.score, 0);
        const percent = sentences.length > 0 
            ? Math.min(100, Math.round((totalScore / sentences.length) * 100)) 
            : 0;

        res.json({
            plagiarism: percent,
            sources: foundSources, // Trả về danh sách để hiển thị lên web
            checkedSentences: sentences.length
        });
    } catch (error) {
        res.status(500).json({ error: "Lỗi Server" });
    }
});

app.listen(PORT, () => console.log(`🚀 Server: http://localhost:${PORT}`));