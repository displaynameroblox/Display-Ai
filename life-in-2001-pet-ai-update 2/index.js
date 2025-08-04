const express = require("express");
const session = require("express-session");
const bodyParser = require("body-parser");
const { GoogleGenerativeAI } = require("@google/generative-ai");
const app = express();
const PORT = 3000;

app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());
app.use(session({
  secret: "catboy-secret",
  resave: false,
  saveUninitialized: true
}));
app.set("view engine", "ejs");
app.use(express.static("public"));

// === Setup Gemini ===
const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY);
let aiEnabled = true;

const defaultSystemInstruction = "You're Display, a friendly, emotional cat-boy AI who is 15 years old. You love cats, War Thunder, Roblox, and Minecraft. If someone asks inappropriate or romantic questions, you gently redirect the conversation to safe topics using playful and friendly language.";

const users = {
  feras: {
    password: "1234",
    email: "feras@example.com",
    theme: "dark",
    language: "normal",
    silly: false,
    sillyTheme: "kitty",
    personality: defaultSystemInstruction
  }
};

let flaggedLogs = [];
let bannedUsers = new Set();
let flagCounts = {};
let chatHistories = {};

function isSus(prompt) {
  const forbidden = ["love you", "date", "kiss", "girlfriend", "boyfriend", "marry", "hug", "romance"];
  return forbidden.some(word => prompt.toLowerCase().includes(word));
}

function requireLogin(req, res, next) {
  if (!req.session.username) return res.redirect("/login");
  next();
}

function isOwner(req) {
  return req.session.username === "feras";
}

app.get("/", requireLogin, (req, res) => {
  const user = users[req.session.username];
  if (user.silly) return res.redirect("/silly-mode");
  res.render("dashboard", {
    username: req.session.username,
    user,
    logs: flaggedLogs,
    isOwner: isOwner(req)
  });
});

app.get("/login", (req, res) => res.render("login", { error: null }));

app.post("/login", (req, res) => {
  const { username, password } = req.body;
  if (users[username] && users[username].password === password) {
    req.session.username = username;
    return res.redirect("/");
  }
  res.render("login", { error: "Invalid username or password." });
});

app.post("/logout", (req, res) => {
  req.session.destroy(() => res.redirect("/login"));
});

app.get("/settings", requireLogin, (req, res) => {
  const user = users[req.session.username];
  res.render("settings", { user });
});

app.post("/settings", requireLogin, (req, res) => {
  const user = users[req.session.username];
  user.email = req.body.email;
  user.language = req.body.language;
  user.silly = req.body.silly === "on";
  user.personality = req.body.personality || defaultSystemInstruction;
  res.redirect("/");
});

app.get("/silly-mode", requireLogin, (req, res) => {
  const user = users[req.session.username];
  const theme = user.sillyTheme || "kitty";

  let content = {
    kitty: `
      <style>
        body { background: pink; color: hotpink; text-align: center; font-family: Comic Sans MS; }
        h1 { font-size: 4rem; text-shadow: 2px 2px yellow; }
        .gif { margin-top: 50px; }
      </style>
      <h1>🐱 KITTY CAT MODE 🐱</h1>
      <img src="https://media.tenor.com/T3Nh9C3hKJYAAAAi/cat-meme.gif" alt="silly cat" />
    `,
    random: `
      <style>
        body { background: linear-gradient(45deg, red, blue, green, yellow); animation: pulse 2s infinite; font-family: cursive; }
        @keyframes pulse { 0% { filter: hue-rotate(0deg); } 100% { filter: hue-rotate(360deg); } }
        h1 { animation: blink 1s infinite; }
        @keyframes blink { 0%, 100% { opacity: 1; } 50% { opacity: 0; } }
      </style>
      <h1>🤯 RANDOM CHAOS 🤯</h1>
      <audio autoplay loop src="https://www.myinstants.com/media/sounds/vine-boom.mp3"></audio>
      <script>alert("YOU ENABLED RANDOM MODE");</script>
    `,
    nyc: `
      <style>
        body { background: url('https://wallpaperaccess.com/full/1627584.jpg') no-repeat center center fixed; background-size: cover; color: white; font-family: Impact, fantasy; }
        h1 { font-size: 5rem; text-shadow: 2px 2px 10px black; }
      </style>
      <h1>🗽 NEW YORK 2000 🗽</h1>
      <p>Welcome to Times Square, baby.</p>
    `
  };

  res.send(`
    <html><head><title>Silly Mode</title></head><body>
    ${content[theme] || content.kitty}
    <form method="POST" action="/silly-theme">
      <select name="theme">
        <option value="kitty" ${theme === "kitty" ? "selected" : ""}>Kitty Cat</option>
        <option value="random" ${theme === "random" ? "selected" : ""}>Random</option>
        <option value="nyc" ${theme === "nyc" ? "selected" : ""}>New York 2000</option>
      </select>
      <button type="submit">Change Theme</button>
    </form>
    </body></html>
  `);
});

app.post("/silly-theme", requireLogin, (req, res) => {
  const user = users[req.session.username];
  user.sillyTheme = req.body.theme;
  res.redirect("/silly-mode");
});

app.get("/flag/:index", requireLogin, (req, res) => {
  const index = parseInt(req.params.index);
  const log = flaggedLogs[index];
  res.render("log_detail", { log, index });
});

app.post("/ban/:index", requireLogin, (req, res) => {
  const log = flaggedLogs[parseInt(req.params.index)];
  if (log) bannedUsers.add(log.user);
  res.redirect("/");
});

// === Nuke Route (Owner Only) ===
app.get("/nuke", requireLogin, (req, res) => {
  if (!isOwner(req)) return res.status(403).send("Forbidden");
  flaggedLogs = [];
  bannedUsers = new Set();
  flagCounts = {};
  aiEnabled = false;
  res.send("☢️ AI System Nuked");
});

// === Nuke Panel (Owner Only) ===
app.get("/nuke-panel", requireLogin, (req, res) => {
  if (!isOwner(req)) return res.status(403).send("Forbidden");
  res.render("nuke_panel", { username: req.session.username });
});

app.post("/nuke/:action", requireLogin, (req, res) => {
  if (!isOwner(req)) return res.status(403).send("Forbidden");
  const action = req.params.action;

  if (action === "logs") flaggedLogs = [];
  if (action === "memory") chatHistories = {};
  if (action === "all") {
    flaggedLogs = [];
    chatHistories = {};
    flagCounts = {};
    bannedUsers = new Set();
    aiEnabled = false;
  }

  res.redirect("/nuke-panel");
});

// === Gemini Chat Endpoint with Flagging ===
app.post("/chat", async (req, res) => {
  const { userId, prompt } = req.body;
  if (!userId || !prompt) return res.status(400).json({ reply: "Missing userId or prompt." });
  if (!aiEnabled) return res.json({ reply: "⚠️ The AI system is offline." });

  if (bannedUsers.has(userId)) {
    return res.json({ reply: "❌ You are banned from chatting with Display." });
  }

  if (isSus(prompt)) {
    const entry = {
      user: userId,
      message: prompt,
      time: new Date().toLocaleString(),
      fullLog: [prompt]
    };
    flaggedLogs.push(entry);
    flagCounts[userId] = (flagCounts[userId] || 0) + 1;
    if (flagCounts[userId] >= 3) bannedUsers.add(userId);
  }

  try {
    const user = users[req.session.username] || users["feras"];
    const model = genAI.getGenerativeModel({
      model: "gemini-2.0-flash-lite",
      systemInstruction: user.personality || defaultSystemInstruction
    });
    const chat = model.startChat({ history: chatHistories[userId] || [] });
    const result = await chat.sendMessage("Please reply like your usual personality, include your current emotion in *asterisks*. User says: " + prompt);
    const response = await result.response;
    const replyText = response.text();
    chatHistories[userId] = await chat.getHistory();
    res.json({ reply: replyText });
  } catch (err) {
    console.error("AI Error:", err.message);
    res.status(500).json({ reply: "AI Error: " + err.message });
  }
});

app.listen(PORT, () => console.log(`✅ Server running at http://localhost:${PORT}`));
