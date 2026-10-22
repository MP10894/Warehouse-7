// How two copies of the game talk to each other.
//
// 1. "Claude room": when the game is opened from its claude.ai link, the page can use the
//    platform's live room. Each player's state goes in their room *presence* (latest value
//    wins, about 30 updates a second, 4 KB max), which suits game state well.
// 2. "This browser": two tabs of the same browser talk through a BroadcastChannel. Used
//    for testing on one computer, and when the room isn't available.
//
// Both give the same small interface: join a room code, set my state, read my partner's.

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
          else scope.presence({ app: null, code: null, role: null, t: null, g: null, p: null, n: null, b: null, e: null, k: null, d: null, c: null, pos: null }).catch(() => {});
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

/** Pick the best transport available in this view. Resolves null if co-op can't work here. */
export async function getTransport() {
  try {
    if (window.claude && typeof window.claude.use === 'function') {
      const room = await window.claude.use('room');
      if (room) return roomTransport(room);
    }
  } catch (e) { /* not available */ }
  return tabTransport();
}
