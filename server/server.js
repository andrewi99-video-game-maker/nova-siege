// Nova Siege relay: rooms, presence and events over WebSocket. No game logic lives here.
const http = require('http');
const crypto = require('crypto');
const { WebSocketServer } = require('ws');

const PORT = process.env.PORT || 8080;
const ORIGINS = (process.env.ALLOWED_ORIGINS || '').split(',').map(s => s.trim()).filter(Boolean);
const NAME = /^[a-z0-9_-]{1,48}$/i, TOPIC = /^[a-z][a-z0-9_.-]{0,47}$/;
const LIMITS = [[/^__lobby$/, 500], [/^lobby-/, 8], [/^nova-/, 12]]; // private lobbies hold 8, public arenas 12
const rooms = new Map(); // name -> Map(peerId -> conn)

const limit = n => { if (!NAME.test(n)) return 0; for (const [re, k] of LIMITS) if (re.test(n)) return k; return 0; };
const send = (ws, o) => { if (ws.readyState === 1) ws.send(JSON.stringify(o)); };
const bc = (r, except, o) => { const s = JSON.stringify(o); for (const c of r.values()) if (c !== except && c.ws.readyState === 1) c.ws.send(s); };
const size = v => Buffer.byteLength(JSON.stringify(v === undefined ? null : v));

const server = http.createServer((q, r) => { r.writeHead(200, { 'content-type': 'text/plain' }); r.end('nova-siege relay ok'); });
const wss = new WebSocketServer({
  server, maxPayload: 16384,
  verifyClient: ({ origin }, cb) => (!ORIGINS.length || ORIGINS.includes(origin)) ? cb(true) : cb(false, 403, 'origin not allowed')
});

function leave(c, name) {
  const r = rooms.get(name); c.rooms.delete(name); if (!r) return;
  r.delete(c.peer);
  if (!r.size) rooms.delete(name); else bc(r, null, { t: 'l', room: name, peer: c.peer });
}
function join(c, name) {
  const lim = limit(name);
  if (!lim || c.rooms.size >= 4) return send(c.ws, { t: 'err', room: name, code: 'bad_room' });
  if (c.rooms.has(name)) return;
  let r = rooms.get(name); if (!r) { r = new Map(); rooms.set(name, r); }
  if (r.size >= lim) return send(c.ws, { t: 'err', room: name, code: 'full' });
  const peers = [...r.values()].map(o => ({ peer: o.peer, by: o.uid, presence: o.rooms.get(name) }));
  c.rooms.set(name, {}); r.set(c.peer, c);
  peers.push({ peer: c.peer, by: c.uid, presence: {} });
  send(c.ws, { t: 'snap', room: name, peers });
  bc(r, c, { t: 'p', room: name, peer: c.peer, by: c.uid, presence: {} });
}

wss.on('connection', ws => {
  const c = { ws, peer: crypto.randomBytes(8).toString('hex'), uid: null, rooms: new Map(), tok: 200, last: Date.now(), alive: true };
  ws.c = c; ws.on('pong', () => { c.alive = true; });
  ws.on('message', buf => {
    const now = Date.now(); c.tok = Math.min(200, c.tok + (now - c.last) * 0.1); c.last = now;
    if (--c.tok < 0) return; // simple flood control
    let m; try { m = JSON.parse(buf); } catch (e) { return; }
    if (!m || typeof m !== 'object') return;
    if (m.t === 'hi') { if (!c.uid) { c.uid = String(m.uid || '').slice(0, 64) || c.peer; send(ws, { t: 'hello', peer: c.peer }); } return; }
    if (!c.uid) return;
    const name = typeof m.room === 'string' ? m.room : '';
    if (m.t === 'j') return join(c, name);
    const pr = c.rooms.get(name), r = rooms.get(name); if (!pr || !r) return;
    if (m.t === 'l') return leave(c, name);
    if (m.t === 'p') {
      if (!m.patch || typeof m.patch !== 'object' || Array.isArray(m.patch)) return;
      const next = { ...pr };
      for (const k of Object.keys(m.patch)) { if (!/^[A-Za-z_][A-Za-z0-9_]{0,15}$/.test(k)) continue; if (m.patch[k] === null) delete next[k]; else next[k] = m.patch[k]; }
      if (size(next) > 4096) return;
      c.rooms.set(name, next);
      for (const o of r.values()) if (o !== c && o.ws.readyState === 1 && o.ws.bufferedAmount < 1e6) o.ws.send(JSON.stringify({ t: 'p', room: name, peer: c.peer, by: c.uid, presence: next }));
      return;
    }
    if (m.t === 'e') {
      if (typeof m.topic !== 'string' || !TOPIC.test(m.topic) || size(m.data) > 4096) return;
      const s = JSON.stringify({ t: 'e', room: name, topic: m.topic, data: m.data, peer: c.peer, by: c.uid });
      for (const o of r.values()) if (o.ws.readyState === 1) o.ws.send(s);
    }
  });
  ws.on('close', () => { for (const name of [...c.rooms.keys()]) leave(c, name); });
  ws.on('error', () => {});
});

setInterval(() => { for (const ws of wss.clients) { if (ws.c && !ws.c.alive) { ws.terminate(); continue; } ws.ping(); } }, 30000);
server.listen(PORT, () => console.log('Nova Siege relay listening on ' + PORT));
