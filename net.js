/* Nova Siege network shim.
   Gives the game the same "room" API the claude.ai runtime offers, but over a WebSocket relay (server/server.js).
   If no server is configured the game still runs; online features simply stay off. */
(function () {
  if (window.claude) return;
  const SERVER = new URLSearchParams(location.search).get('server') || window.NOVA_SERVER || '';
  let uid;
  try {
    uid = localStorage.getItem('ns_uid');
    if (!uid) { uid = (crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2) + Date.now().toString(36)); localStorage.setItem('ns_uid', uid); }
  } catch (e) { uid = 'u' + Math.random().toString(36).slice(2); }
  let ws = null, ready = null, me = null;
  const rooms = {};
  const send = o => { if (ws && ws.readyState === 1) ws.send(JSON.stringify(o)); };

  function conn() {
    if (ready) return ready;
    ready = new Promise((res, rej) => {
      if (!SERVER) return rej(new Error('no server'));
      try { ws = new WebSocket(SERVER); } catch (e) { return rej(e); }
      ws.onopen = () => send({ t: 'hi', uid });
      ws.onmessage = ev => {
        let m; try { m = JSON.parse(ev.data); } catch (e) { return; }
        if (m.t === 'hello') { me = m.peer; res(); }
        else { const r = rooms[m.room]; if (r) r._in(m); }
      };
      ws.onclose = () => { ready = null; ws = null; for (const k in rooms) rooms[k]._off(); };
      ws.onerror = () => rej(new Error('ws'));
    });
    return ready;
  }

  function mkRoom(name) {
    const peers = new Map(), hs = {}, pl = [];
    let snap = Object.freeze([]), mine = {};
    const mk = (peer, by, presence) => ({ peer, by: by || null, isMe: peer === me, sameTab: peer === me, kind: 'viewer', guest: false, presence: Object.freeze(presence || {}), updatedAt: Date.now() });
    const fire = left => {
      snap = Object.freeze([...peers.values()]);
      const c = { peers: snap, joined: [], left: left || [], updated: [] };
      pl.slice().forEach(f => { try { f(c); } catch (e) { console.error(e); } });
    };
    const R = {
      name, _pend: null,
      emit(topic, data) { send({ t: 'e', room: name, topic, data }); return Promise.resolve(); },
      on(topic, fn) { (hs[topic] = hs[topic] || []).push(fn); return () => { hs[topic] = (hs[topic] || []).filter(f => f !== fn); }; },
      presence(patch) {
        for (const k in patch) { if (patch[k] === null) delete mine[k]; else mine[k] = patch[k]; }
        if (peers.has(me)) { peers.set(me, mk(me, uid, mine)); fire(); }
        send({ t: 'p', room: name, patch }); return Promise.resolve();
      },
      peers() { return snap; },
      onPeers(fn) {
        pl.push(fn);
        Promise.resolve().then(() => { if (pl.includes(fn)) fn({ peers: snap, joined: snap, left: [], updated: [] }); });
        return () => { const i = pl.indexOf(fn); if (i >= 0) pl.splice(i, 1); };
      },
      connected() { return !!ws && ws.readyState === 1; },
      leave() { send({ t: 'l', room: name }); delete rooms[name]; pl.length = 0; for (const k in hs) hs[k] = []; return Promise.resolve(); },
      _in(m) {
        if (m.t === 'snap') {
          peers.clear(); m.peers.forEach(p => peers.set(p.peer, mk(p.peer, p.by, p.presence)));
          if (!peers.has(me)) peers.set(me, mk(me, uid, mine));
          fire(); if (R._pend) { R._pend[0](R); R._pend = null; }
        } else if (m.t === 'p') { peers.set(m.peer, mk(m.peer, m.by, m.presence)); fire(); }
        else if (m.t === 'l') { const p = peers.get(m.peer); peers.delete(m.peer); fire(p ? [p] : []); }
        else if (m.t === 'e') {
          const d = { topic: m.topic, data: m.data, peer: m.peer, by: m.by || null, isMe: m.peer === me, sameTab: m.peer === me, kind: 'viewer', guest: false };
          (hs[m.topic] || []).slice().forEach(f => { try { f(d); } catch (e) { console.error(e); } });
        } else if (m.t === 'err') { if (R._pend) { R._pend[1](new Error(m.code)); R._pend = null; delete rooms[name]; } }
      },
      _off() { const all = [...peers.values()].filter(p => !p.isMe); peers.clear(); fire(all); if (R._pend) { R._pend[1](new Error('closed')); R._pend = null; } }
    };
    return R;
  }

  function joinRoom(n) {
    if (rooms[n] && !rooms[n]._pend) return Promise.resolve(rooms[n]);
    return conn().then(() => new Promise((res, rej) => {
      const r = rooms[n] || mkRoom(n); rooms[n] = r; r._pend = [res, rej]; send({ t: 'j', room: n });
    }));
  }

  window.claude = {
    async use(n) {
      if (n === 'user') return { id: async () => uid };
      if (n !== 'room') return null;
      try { await conn(); const l = await joinRoom('__lobby'); l.join = joinRoom; return l; } catch (e) { return null; }
    }
  };
})();
