// Briefing screen and after-action report.
import { fmtTime } from './dom-hud.js';

// opened as an installed app (from the home screen), not in a browser tab: only then is
// there an Exit button (a browser tab is closed the browser's own way)
const INSTALLED = (() => { try { return matchMedia('(display-mode: standalone)').matches || matchMedia('(display-mode: fullscreen)').matches || navigator.standalone === true; } catch (e) { return false; } })();

export function createScreens({ view, onStart, onCoop, onLevel }) {
  const screen = document.getElementById('screen');
  const card = document.getElementById('card');

  function wire() {
    document.getElementById('go').addEventListener('click', onStart);
    const coop = document.getElementById('coopBtn');
    if (coop) coop.addEventListener('click', onCoop);
    for (const b of document.querySelectorAll('.lvl')) b.addEventListener('click', () => onLevel && onLevel(b.dataset.level));
    const vb = document.getElementById('viewBtn');
    if (vb) vb.addEventListener('click', () => { vb.textContent = view.cycleViewPref(); });
    const ex = document.getElementById('exitBtn');
    if (ex) ex.addEventListener('click', () => {
      // an app opened from the home screen may close itself; if the phone refuses, say how
      try { window.close(); } catch (e) { /* not allowed */ }
      setTimeout(() => { const n = document.getElementById('exitNote'); if (n) n.hidden = false; }, 400);
    });
  }
  const viewButton = () => `<button class="view" id="viewBtn" type="button">${view.viewLabel()}</button>`;

  // title screen art, if drawn (assets/ui/title.jpg / .png / .webp)
  const titleArt = Object.values(import.meta.glob('../../assets/ui/title.{jpg,jpeg,png,webp}', { query: '?art', import: 'default', eager: true }))[0] || null;

  return {
    hide() { screen.hidden = true; },
    /** The title screen: game name and Start. Behind it, the art (or the level itself, slowly turning). */
    showTitle(onTitleStart) {
      const t = document.getElementById('title');
      screen.hidden = true;
      if (titleArt) t.querySelector('.title-art').style.backgroundImage = `url("${titleArt}")`;
      document.getElementById('titleVer').textContent = `v${typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : 'dev'}`;
      t.hidden = false;
      const app = document.getElementById('app');
      app.classList.add('titling');
      const b = document.getElementById('titleStart');
      b.onclick = () => { t.hidden = true; app.classList.remove('titling'); onTitleStart(); };
    },
    get titleShowing() { return !document.getElementById('title').hidden; },
    get hasTitleArt() { return !!titleArt; },

    showMenu(world) {
      const lv = world.data.levels[world.levelId];
      const picks = Object.entries(world.data.levels)
        .map(([id, l]) => `<button class="lvl${id === world.levelId ? ' on' : ''}" type="button" data-level="${id}" aria-pressed="${id === world.levelId}">${l.title || l.name}</button>`).join('');
      card.innerHTML = `
        <div class="eyebrow"><span>${lv.subtitle || ''}</span><span>Operator · v${typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : 'dev'}</span></div>
        <h1>${lv.title || lv.name}</h1>
        <div class="levels" role="group" aria-label="Level">${picks}</div>
        <div class="actions"><button class="go" id="go" type="button">Start</button><button class="view coop" id="coopBtn" type="button">Co-op</button>${viewButton()}${INSTALLED ? '<button class="view exit" id="exitBtn" type="button">Exit</button>' : ''}</div>
        <p class="small" id="exitNote" hidden>Your phone didn't let the game close itself: swipe up from the bottom edge (or use the back gesture) to leave it.</p>
        <p>Secure a base, then hold it for ${fmtTime(world.timeLeft)} against the attack waves. The clock and the waves only start once you have a base. ${lv.summary || ''}</p>
        <ol class="steps">${(lv.briefing || []).map(b => `<li>${b}</li>`).join('')}</ol>
        <div class="ctrl">
          <div><h2>Phone</h2><ul><li>Left thumb <kbd>move</kbd> · right thumb <kbd>look</kbd></li><li><kbd>FIRE</kbd> (drag it to aim too) · <kbd>AIM</kbd> toggles sights</li><li><kbd>RELOAD</kbd> · <kbd>SWAP</kbd> · yellow button to use</li></ul></div>
          <div><h2>Desktop</h2><ul><li><kbd>WASD</kbd> move · click to lock the mouse</li><li>Click fire · right-click aim</li><li><kbd>R</kbd> reload · <kbd>Q</kbd> swap · <kbd>E</kbd> use</li></ul></div>
        </div>
        <span class="rot">Hold your phone sideways. If the picture is upside down, tap View to flip it.</span>`;
      screen.hidden = false;
      wire();
    },

    /** Co-op: choose to host or join. */
    showCoop({ transportLabel, onHost, onJoin, onBack, error }) {
      card.innerHTML = `
        <div class="eyebrow"><span>Co-op</span><span>2 players</span></div>
        <h1>Play together</h1>
        ${error ? `<p class="warn">${error}</p>` : ''}
        <p>One phone hosts and gets a four-digit room code. Your partner opens the game, taps Co-op, and joins with that code. Both phones need to be online and on the same version of the game.</p>
        <p class="small">Connection: ${transportLabel}</p>
        <div class="actions"><button class="go" id="hostBtn" type="button">Host a game</button></div>
        <div class="actions joinrow"><input id="codeIn" inputmode="numeric" maxlength="4" placeholder="Code" aria-label="Room code"><button class="view coop" id="joinBtn" type="button">Join</button><button class="view coop" id="backBtn" type="button">Back</button></div>`;
      screen.hidden = false;
      document.getElementById('hostBtn').addEventListener('click', onHost);
      document.getElementById('joinBtn').addEventListener('click', () => {
        const code = document.getElementById('codeIn').value.replace(/\D/g, '');
        if (code.length === 4) onJoin(code);
        else document.getElementById('codeIn').focus();
      });
      document.getElementById('backBtn').addEventListener('click', onBack);
    },

    /** Co-op lobby, for host or guest. */
    showLobby({ role, code, onStart, onLeave }) {
      card.innerHTML = `
        <div class="eyebrow"><span>Co-op · ${role === 'host' ? 'you are hosting' : 'you joined'}</span><span>Room</span></div>
        <h1>Code ${code}</h1>
        <p id="lobbyStatus">${role === 'host' ? 'Waiting for your partner to join…' : 'Connecting to the host…'}</p>
        <div class="actions">${role === 'host' ? '<button class="go" id="lobbyStart" type="button" disabled>Start</button>' : ''}<button class="view coop" id="lobbyLeave" type="button">Leave</button></div>`;
      screen.hidden = false;
      const st = document.getElementById('lobbyStart');
      if (st) st.addEventListener('click', onStart);
      document.getElementById('lobbyLeave').addEventListener('click', onLeave);
    },
    setLobbyStatus(text, canStart) {
      const el = document.getElementById('lobbyStatus');
      if (el && el.textContent !== text) el.textContent = text;
      const st = document.getElementById('lobbyStart');
      if (st) st.disabled = !canStart;
    },

    showResults(world, player, coop = null, onMenu = null) {
      const won = world.status === 'won';
      const acc = player.stats.shots ? Math.round(player.stats.hits / player.stats.shots * 100) : 0;
      const survived = world.time;
      card.innerHTML = `
        <div class="eyebrow"><span>After-action report</span><span>${won ? 'Status: survived' : 'Status: killed in action'}</span></div>
        <h1>${won ? 'Held out' : 'KIA'}</h1>
        <p>${won ? `You held the ${world.base.name.toLowerCase()} until the clock ran out.` : coop ? 'Both of you went down: the level is lost.' : 'Single-player death is permanent: the level is lost.'}</p>
        <div class="results">
          <div><span>Survived</span><b>${fmtTime(survived)}</b></div>
          <div><span>Kills</span><b>${player.stats.kills}</b></div>
          <div><span>Accuracy</span><b>${acc}%</b></div>
          <div><span>Waves</span><b>${world.waves.number}</b></div>
        </div>
        ${coop && coop.role === 'guest' ? '<p class="small">The host can start the next run.</p>' : ''}
        <div class="actions">${coop && coop.role === 'guest' ? '' : `<button class="go" id="go" type="button">${won ? 'Play again' : 'Retry'}</button>`}${coop ? '<button class="view coop" id="leaveCoop" type="button">Leave co-op</button>' : onMenu ? '<button class="view coop" id="toMenu" type="button">Menu</button>' : ''}${viewButton()}</div>`;
      screen.hidden = false;
      const go = document.getElementById('go');
      if (go) go.addEventListener('click', onStart);
      const lc = document.getElementById('leaveCoop');
      if (lc && coop) lc.addEventListener('click', coop.onLeave);
      const tm = document.getElementById('toMenu');
      if (tm && onMenu) tm.addEventListener('click', onMenu);
      for (const b of document.querySelectorAll('.lvl')) b.addEventListener('click', () => onLevel && onLevel(b.dataset.level));
    const vb = document.getElementById('viewBtn');
      if (vb) vb.addEventListener('click', () => { vb.textContent = view.cycleViewPref(); });
    },

    showError(title, text) {
      card.classList.add('error');
      card.innerHTML = `<h1>${title}</h1><p>${text}</p>`;
      screen.hidden = false;
    }
  };
}
