const express = require("express");
const cors = require("cors");

const app = express();

app.use(cors());
app.use(express.json());
app.use(express.static("public"));

// ✅ Home route
app.get("/", (req, res) => {
  res.send("AI Office Server Running 🚀");
});


// 🔥 👉 REPLACE OLD /ai-edit WITH THIS
app.post("/ai-edit", (req, res) => {
  let { text, action } = req.body;

  if (!text) return res.send("");

  let sentences = text.split(".").map(s => s.trim()).filter(s => s);

  if (action === "summarize") {
    res.send(sentences.slice(0, 2).join(". ") + ".");
  }

  else if (action === "rewrite") {
    res.send(sentences.reverse().join(". ") + ".");
  }

  else if (action === "grammar") {
    let fixed = sentences.map(s => {
      s = s.charAt(0).toUpperCase() + s.slice(1);
      s = s.replace(/\bi\b/g, "I");
      s = s.replace(/\s+/g, " ");
      return s;
    });

    res.send(fixed.join(". ") + ".");
  }

  else {
    res.send(text);
  }
});


// ✅ Start server (always last)
app.listen(3000, () => {
  console.log("Server running on http://localhost:3000");
});