const express = require('express');
const http = require('http');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { WebSocketServer } = require('ws');

// ---- Fixed credentials (change these, or set env vars) ----
const USERNAME = process.env.CHAT_USERNAME || 'team';
const PASSWORD = process.env.CHAT_PASSWORD || 'change-me-now';
const PORT = process.env.PORT || 3000;
const RETENTION_MS = 10 * 24 * 60 * 60 * 1000; // 10 days
const DB_FILE = path.join(__dirname, 'messages.json');

// ---- Message storage (JSON file) ----
let messages = [];
try { messages = JSON.parse(fs.readFileSync(DB_FILE, 'utf8')); } catch { messages = []; }
const save = () => {
  const tmp = DB_FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(messages));
  fs.renameSync(tmp, DB_FILE);
};
function purgeOld() {
  const cutoff = Date.now() - RETENTION_MS;
  const before = messages.length;
  messages = messages.filter(m => m.time >= cutoff);
  if (messages.length !== before) {
    save();
    broadcast({ type: 'history', messages });
  }
}

// ---- Auth ----
const safeEqual = (a, b) => {
  const ha = crypto.createHash('sha256').update(String(a)).digest();
  const hb = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(ha, hb);
};
const sessions = new Map(); // token -> expiry
const SESSION_MS = 24 * 60 * 60 * 1000;
const validToken = t => {
  const exp = sessions.get(t);
  if (!exp) return false;
  if (exp < Date.now()) { sessions.delete(t); return false; }
  return true;
};

// Basic brute-force limiter: 5 failures per IP per 10 minutes
const fails = new Map();
const limited = ip => {
  const f = fails.get(ip);
  return f && f.count >= 5 && Date.now() - f.first < 10 * 60 * 1000;
};

const app = express();
app.use(express.json({ limit: '2kb' }));
app.use(express.static(path.join(__dirname, 'public')));

app.post('/login', (req, res) => {
  const ip = req.ip;
  if (limited(ip)) return res.status(429).json({ error: 'Too many attempts. Try again in 10 minutes.' });
  const { username, password } = req.body || {};
  const ok = safeEqual(username ?? '', USERNAME) & safeEqual(password ?? '', PASSWORD);
  if (!ok) {
    const f = fails.get(ip);
    if (!f || Date.now() - f.first > 10 * 60 * 1000) fails.set(ip, { count: 1, first: Date.now() });
    else f.count++;
    return res.status(401).json({ error: 'Wrong username or password.' });
  }
  fails.delete(ip);
  const token = crypto.randomBytes(32).toString('hex');
  sessions.set(token, Date.now() + SESSION_MS);
  res.json({ token });
});

// ---- Real-time chat ----
const server = http.createServer(app);
const wss = new WebSocketServer({ noServer: true });

server.on('upgrade', (req, socket, head) => {
  const token = new URL(req.url, 'http://x').searchParams.get('token');
  if (!validToken(token)) {
    socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
    return socket.destroy();
  }
  wss.handleUpgrade(req, socket, head, ws => wss.emit('connection', ws, req));
});

function broadcast(obj) {
  const data = JSON.stringify(obj);
  wss.clients.forEach(c => c.readyState === 1 && c.send(data));
}

wss.on('connection', ws => {
  purgeOld();
  ws.send(JSON.stringify({ type: 'history', messages }));
  ws.on('message', raw => {
    let msg;
    try { msg = JSON.parse(raw); } catch { return; }
    const name = String(msg.name || '').trim().slice(0, 24);
    const text = String(msg.text || '').trim().slice(0, 2000);
    if (!name || !text) return;
    const m = { id: crypto.randomUUID(), name, text, time: Date.now() };
    messages.push(m);
    save();
    broadcast({ type: 'message', message: m });
  });
});

purgeOld();
setInterval(purgeOld, 60 * 60 * 1000); // hourly cleanup
server.listen(PORT, () => console.log(`Chat running at http://localhost:${PORT}`));