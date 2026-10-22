// Start screen and after-action report.
import { fmtTime } from './dom-hud.js';

export function createScreens({ view, onStart }) {
  const screen = document.getElementById('screen');
  const card = document.getElementById('card');

  function wire() {
    document.getElementById('go').addEventListener('click', onStart);
    const vb = document.getElementById('viewBtn');
    if (vb) vb.addEventListener('click', () => { vb.textContent = view.cycleViewPref(); });
  }
  const viewButton = () => `<button class="view" id="viewBtn" type="button">${view.viewLabel()}</button>`;

  return {
    hide() { screen.hidden = true; },

    showMenu(total) {
      card.innerHTML = `
        <div class="eyebrow"><span>Three.js test build · v0.1</span><span>Grid ref 07</span></div>
        <h1>Warehouse 7</h1>
        <p>Intel reports ${total} armed hostiles holding the storage halls. Clear every bay. Red drums are flammable; use them.</p>
        <div class="ctrl">
          <div><h2>Phone</h2><ul><li>Left thumb: <kbd>move</kbd></li><li>Right thumb: <kbd>look</kbd></li><li>Hold <kbd>FIRE</kbd> to shoot</li></ul></div>
          <div><h2>Desktop</h2><ul><li><kbd>WASD</kbd> move, <kbd>←→</kbd> turn</li><li>Click to lock the mouse</li><li>Hold click or <kbd>Space</kbd> to fire</li></ul></div>
        </div>
        <span class="rot">Hold your phone sideways. If the picture is upside down, tap View to flip it.</span>
        <div class="actions"><button class="go" id="go" type="button">Start</button>${viewButton()}</div>`;
      screen.hidden = false;
      wire();
    },

    showResults(world, player) {
      const won = world.status === 'won';
      const left = world.total - world.kills;
      const acc = player.stats.shots ? Math.round(player.stats.hits / player.stats.shots * 100) : 0;
      card.innerHTML = `
        <div class="eyebrow"><span>After-action report</span><span>${won ? 'Status: complete' : 'Status: failed'}</span></div>
        <h1>${won ? 'Area secure' : 'KIA'}</h1>
        <p>${won ? 'All hostiles neutralised. Warehouse 7 is clear.' : `You went down with ${left} hostile${left === 1 ? '' : 's'} still inside.`}</p>
        <div class="results">
          <div><span>Time</span><b>${fmtTime(world.time)}</b></div>
          <div><span>Kills</span><b>${world.kills}/${world.total}</b></div>
          <div><span>Accuracy</span><b>${acc}%</b></div>
        </div>
        <div class="actions"><button class="go" id="go" type="button">${won ? 'Run it again' : 'Retry'}</button>${viewButton()}</div>`;
      screen.hidden = false;
      wire();
    },

    showError(title, text) {
      card.classList.add('error');
      card.innerHTML = `<h1>${title}</h1><p>${text}</p>`;
      screen.hidden = false;
    }
  };
}
