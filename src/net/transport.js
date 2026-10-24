// How two copies of the game talk to each other.
//
// 1. "Claude room": when the game is opened from its claude.ai link, the page can use the
//    platform's live room. Each player's state goes in their room *presence* (latest value
//    wins, about 30 updates a second, 4 KB max), which suits game state well.
// 2. "Online" (phone to phone): when the game runs as a normal website (GitHub Pages, the
//    installed home-screen app), the two phones connect directly to each other with WebRTC.
//    A free public PeerJS service only introduces them: the host registers its room code
//    there, the guest asks for that code, and from then on the game data goes straight
//    between the phones. (Some mobile networks block direct connections; a relay server
//    would be the fix if that turns out to matter.)
// 3. "This browser": two tabs of the same browser talk through a BroadcastChannel. Used
//    for testing on one computer (add ?tabs to the address to force it).
//
// All give the same small interface: join a room code, set my state, read my partner's.
import { Peer } from 'peerjs';

const APP = 'w7';

function roomTransport(room) {
  return {
    kind: 'room',
    label: 'claude.ai room',
    async join(code) {
      let r = null;
      try { r = await room.join(`${APP}-${code}`); } catch (e) { r = null; }
      const scope = r || room; // fall back to the shared lobby, filtered by code
      const mine = {};
      let partnerSeen = 0;
      return {
        code,
        set(patch) {
          Object.assign(mine, patch);
          const send = r ? patch : { ...patch, code };
          scope.presence(send).catch(() => {});
        },
        partner() {
          const peers = scope.peers();
          const p = peers.find(x => !x.sameTab && x.presence && x.presence.app === APP && (r || x.presence.code === code));
          if (!p) return null;
          partnerSeen = Date.now();
          return { state: p.presence, id: p.peer };
        },
        connected() { return scope.connected(); },
        leave() {
          if (r) r.leave().catch(() => {});
          else scope.presence({ app: null, code: null, role: null, v: null, t: null, g: null, p: null, n: null, b: null, e: null, k: null, d: null, c: null, pos: null }).catch(() => {});
        },
        lastSeen: () => partnerSeen
      };
    }
  };
}

function tabTransport() {
  if (typeof BroadcastChannel === 'undefined') return null;
  return {
    kind: 'tabs',
    label: 'this browser only (two tabs)',
    async join(code) {
      const ch = new BroadcastChannel(`${APP}-${code}`);
      const me = Math.random().toString(36).slice(2);
      const mine = { app: APP };
      let partner = null;
      ch.onmessage = e => {
        const m = e.data;
        if (!m || m.from === me) return;
        if (m.bye) { if (partner && partner.id === m.from) partner = null; return; }
        partner = { id: m.from, state: m.state, at: Date.now() };
      };
      let pending = false;
      const flush = () => { pending = false; ch.postMessage({ from: me, state: mine }); };
      const beat = setInterval(flush, 500);
      return {
        code,
        set(patch) {
          for (const [k, v] of Object.entries(patch)) { if (v === null) delete mine[k]; else mine[k] = v; }
          // like the platform's presence: coalesce to about 30 sends a second
          if (!pending) { pending = true; setTimeout(flush, 33); }
        },
        partner() {
          if (partner && Date.now() - partner.at > 3000) partner = null;
          return partner ? { state: partner.state, id: partner.id } : null;
        },
        connected: () => true,
        leave() { clearInterval(beat); ch.postMessage({ from: me, bye: true }); ch.close(); },
        lastSeen: () => (partner ? partner.at : 0)
      };
    }
  };
}

/**
 * Phone to phone over WebRTC. The host claims the PeerJS id "w7-<code>"; the guest connects
 * to it. Each side sends its whole state (merged from patches) about 30 times a second, like
 * the room's presence. `server` is optional ({ host, port, path, secure }) for testing with a
 * local PeerJS server; otherwise the free public one is used.
 */
function peerTransport(server = null) {
  if (typeof RTCPeerConnection === 'undefined') return null;
  const opts = { debug: 0, ...(server || {}) };
  return {
    kind: 'online',
    label: 'online (phone to phone)',
    join(code, role = 'guest') {
      return new Promise((resolve, reject) => {
        const id = `${APP}-${code}`;
        const peer = role === 'host' ? new Peer(id, opts) : new Peer(opts);
        const mine = { app: APP };
        let partner = null, conn = null, pending = false, closed = false, settled = false;
        const send = () => { pending = false; if (conn && conn.open) { try { conn.send({ state: mine }); } catch (e) { /* closed */ } } };
        const beat = setInterval(send, 500);
        const attach = c => {
          if (conn && conn !== c) { try { c.close(); } catch (e) { /* only one partner */ } return; }
          conn = c;
          c.on('data', m => { if (m && m.state) partner = { id: c.peer, state: m.state, at: Date.now() }; if (m && m.bye) partner = null; });
          c.on('open', send);
          c.on('close', () => { if (conn === c) { conn = null; partner = null; } });
        };
        const session = {
          code,
          set(patch) {
            for (const [k, v] of Object.entries(patch)) { if (v === null) delete mine[k]; else mine[k] = v; }
            if (!pending) { pending = true; setTimeout(send, 33); }
          },
          partner() {
            if (partner && Date.now() - partner.at > 4000) partner = null;
            return partner ? { state: partner.state, id: partner.id } : null;
          },
          connected: () => !closed && !peer.disconnected,
          leave() {
            closed = true; clearInterval(beat);
            try { if (conn && conn.open) conn.send({ bye: true }); } catch (e) { /* gone */ }
            setTimeout(() => { try { peer.destroy(); } catch (e) { /* gone */ } }, 100);
          },
          lastSeen: () => (partner ? partner.at : 0)
        };
        const fail = err => { if (settled) return; settled = true; clearInterval(beat); try { peer.destroy(); } catch (e) { /* gone */ } reject(err); };
        peer.on('error', e => {
          const type = e && e.type;
          if (!settled) fail(Object.assign(new Error(type || 'error'), { type }));
          else if (type === 'peer-unavailable') partner = null;
        });
        peer.on('open', () => {
          if (role === 'host') {
            peer.on('connection', attach);
            settled = true; resolve(session);
          } else {
            const c = peer.connect(id, { reliable: false, serialization: 'json' });
            attach(c);
            const t = setTimeout(() => fail(Object.assign(new Error('timeout'), { type: 'peer-unavailable' })), 10000);
            c.on('open', () => { clearTimeout(t); if (!settled) { settled = true; resolve(session); } });
          }
        });
        // keep the introduction service connection alive (it drops after a while idle)
        peer.on('disconnected', () => { if (!closed) { try { peer.reconnect(); } catch (e) { /* will retry */ } } });
      });
    }
  };
}

/** Pick the best transport available in this view. Resolves null if co-op can't work here. */
export async function getTransport() {
  const q = new URLSearchParams(location.search);
  if (q.has('tabs')) return tabTransport();
  try {
    if (window.claude && typeof window.claude.use === 'function') {
      const room = await window.claude.use('room');
      if (room) return roomTransport(room);
    }
  } catch (e) { /* not available */ }
  // ?peerserver=localhost:9000 points at a local PeerJS server (for testing)
  const ps = q.get('peerserver');
  const server = ps ? { host: ps.split(':')[0], port: Number(ps.split(':')[1] || 9000), path: '/', secure: false } : null;
  return peerTransport(server) || tabTransport();
}
