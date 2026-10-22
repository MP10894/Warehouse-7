// Briefing screen and after-action report.
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

    showMenu(world) {
      card.innerHTML = `
        <div class="eyebrow"><span>Test slice · v0.2</span><span>Working title TBD</span></div>
        <h1>Ruined City</h1>
        <p>Survive ${fmtTime(world.timeLeft)} in a 100 m slice of Level 1. You start with a pistol. Enemies drop their weapons.</p>
        <ol class="steps">
          <li>Clear the compound east of the crossroads. It becomes your base.</li>
          <li>Fetch the construction crate from the roof of the tall building (north-west). It slows you down.</li>
          <li>Build walls at your base, then hold out. Every build brings the next wave sooner.</li>
        </ol>
        <div class="ctrl">
          <div><h2>Phone</h2><ul><li>Left thumb <kbd>move</kbd> · right thumb <kbd>look</kbd></li><li><kbd>FIRE</kbd> (drag it to aim too) · <kbd>AIM</kbd> toggles sights</li><li><kbd>RELOAD</kbd> · <kbd>SWAP</kbd> · yellow button to use</li></ul></div>
          <div><h2>Desktop</h2><ul><li><kbd>WASD</kbd> move · click to lock the mouse</li><li>Click fire · right-click aim</li><li><kbd>R</kbd> reload · <kbd>Q</kbd> swap · <kbd>E</kbd> use</li></ul></div>
        </div>
        <span class="rot">Hold your phone sideways. If the picture is upside down, tap View to flip it.</span>
        <div class="actions"><button class="go" id="go" type="button">Start</button>${viewButton()}</div>`;
      screen.hidden = false;
      wire();
    },

    showResults(world, player) {
      const won = world.status === 'won';
      const acc = player.stats.shots ? Math.round(player.stats.hits / player.stats.shots * 100) : 0;
      const survived = world.data.levels[world.levelId].time_limit - world.timeLeft;
      card.innerHTML = `
        <div class="eyebrow"><span>After-action report</span><span>${won ? 'Status: survived' : 'Status: killed in action'}</span></div>
        <h1>${won ? 'Held out' : 'KIA'}</h1>
        <p>${won ? `You survived until the timer ran out${world.base.claimed ? `, holding the ${world.base.name.toLowerCase()}` : ' without a base'}.` : 'Single-player death is permanent: the level is lost.'}</p>
        <div class="results">
          <div><span>Survived</span><b>${fmtTime(survived)}</b></div>
          <div><span>Kills</span><b>${player.stats.kills}</b></div>
          <div><span>Accuracy</span><b>${acc}%</b></div>
          <div><span>Waves</span><b>${world.waves.number}</b></div>
        </div>
        <div class="actions"><button class="go" id="go" type="button">${won ? 'Play again' : 'Retry'}</button>${viewButton()}</div>`;
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
