/* Lightweight, local-only SVG playground. No benchmark or selection state is changed. */
(function () {
  "use strict";
  var names = ["Codex", "Claude Code", "DSH", "Grok", "Kimi Code", "Antigravity", "ZCode", "CodeBuddy"];
  var colors = ["#36e6ef", "#ffae83", "#8193ff", "#ffd36d", "#5de9b6", "#bc9aff", "#7cceff", "#ff92cb"];
  var paths = ["M8 7 3 12l5 5m8-10 5 5-5 5M14 4l-4 16", "M12 2v20M2 12h20M5 5l14 14M5 19 19 5", "M3 9q3-6 9 0t9 0M3 15q3 6 9 0t9 0", "m5 3 14 18M19 3 5 21M9 12h6", "M5 3v18M19 3 6 13l13 8", "m3 19 9-16 9 16M7 13h10", "M4 4h16L4 20h16", "m8 5-6 7 6 7m8-14 6 7-6 7M10 12h4"];
  var audio = null, sound = false, paused = false, uid = 0, lastTone = 0;
  function en() { return document.documentElement.lang.indexOf("en") === 0; }
  function label(zh, english) { return en() ? english : zh; }
  function html() {
    var id = "constellation-" + (++uid);
    var nodes = names.map(function (name, i) {
      return '<button type="button" class="constellation-node" data-star="' + i + '" aria-pressed="false" style="--node-color:' + colors[i] + ';' + (i < 4 ? 'left' : 'right') + ':6%;top:' + (21 + (i % 4) * 16) + '%">' +
        '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="' + paths[i] + '"/></svg><span>' + name + '</span></button>';
    }).join("");
    return '<figure class="iq-gap-art iq-gap-orbit constellation" data-language-neutral aria-label="Harness constellation" hidden>' +
      '<header><span>HARNESS / CONSTELLATION</span><div><button type="button" data-orbit-pause aria-pressed="false">' + label('暂停动画', 'Pause motion') + '</button><button type="button" data-orbit-sound aria-pressed="false">' + label('音效：关', 'Sound: off') + '</button></div></header>' +
      '<svg class="constellation-map" viewBox="0 0 900 340" preserveAspectRatio="none" aria-hidden="true"><defs><radialGradient id="' + id + '"><stop stop-color="#25e1d6" stop-opacity=".19"/><stop offset="1" stop-color="#25e1d6" stop-opacity="0"/></radialGradient></defs>' +
      '<ellipse cx="450" cy="170" rx="320" ry="155" fill="url(#' + id + ')"/>' +
      '<g class="constellation-wires" fill="none" stroke="#4dddd6" stroke-opacity=".3">' + names.map(function (_, i) { var x = i < 4 ? 160 : 740, y = 83 + (i % 4) * 54; return '<path data-wire="' + i + '" d="M' + x + ' ' + y + 'H' + (i < 4 ? 270 : 630) + 'L450 170"/>'; }).join('') + '</g></svg>' +
      '<svg class="constellation-core" viewBox="0 0 300 300" aria-hidden="true"><g fill="none" stroke="#4ddbd2"><circle cx="150" cy="150" r="132" opacity=".12"/><circle cx="150" cy="150" r="109" opacity=".25"/><circle cx="150" cy="150" r="78" opacity=".2"/><path d="M150 6v20m0 248v20M6 150h20m248 0h20" opacity=".7"/></g>' +
      '<g class="constellation-rotor" fill="none" stroke="#3fe6e7"><circle cx="150" cy="150" r="120" stroke-dasharray="90 22 2 22" opacity=".65"/><path d="M150 150 150 42A108 108 0 0 1 258 150Z" fill="#32cbb4" fill-opacity=".12" stroke="none"/><circle cx="150" cy="42" r="4" fill="#d6ffff"/></g>' +
      '<g class="constellation-counter" fill="none" stroke="#b497ff"><ellipse cx="150" cy="150" rx="96" ry="40" transform="rotate(-35 150 150)" opacity=".65"/><circle cx="230" cy="108" r="3" fill="#d5bcff"/></g>' +
      '<circle class="constellation-pulse" cx="150" cy="150" r="40" fill="none" stroke="#bcffff" stroke-width="2"/>' +
      '<path d="m150 111 34 20v38l-34 20-34-20v-38Z" fill="#071e24" stroke="#72f1ee" stroke-width="1.5"/></svg>' +
      '<button type="button" class="constellation-scan" data-orbit-scan aria-label="' + label('发射扫描波', 'Send a scan pulse') + '">⌁</button>' + nodes +
      '<figcaption aria-live="polite">' + label('点击图标，点亮星图 · 互动演示', 'Tap an icon to light the stars · Interactive demo') + '</figcaption></figure>';
  }
  function sync() {
    document.querySelectorAll('.constellation').forEach(function (el) {
      el.toggleAttribute('data-paused', paused);
      var a = el.querySelector('[data-orbit-sound]'), p = el.querySelector('[data-orbit-pause]');
      a.setAttribute('aria-pressed', String(sound));
      a.textContent = sound ? label('音效：开', 'Sound: on') : label('音效：关', 'Sound: off');
      p.setAttribute('aria-pressed', String(paused));
      p.textContent = paused ? label('继续动画', 'Resume motion') : label('暂停动画', 'Pause motion');
      el.querySelector('[data-orbit-scan]').setAttribute('aria-label', label('发射扫描波', 'Send a scan pulse'));
      var chosen = el.querySelector('[data-star][aria-pressed="true"]');
      el.querySelector('figcaption').textContent = chosen ? names[Number(chosen.dataset.star)] + label(' · 星图已点亮 · 互动演示', ' · Star illuminated · Interactive demo') : label('点击图标，点亮星图 · 互动演示', 'Tap an icon to light the stars · Interactive demo');
    });
  }
  async function tone(index) {
    if (!sound || document.hidden || Date.now() - lastTone < 100) return;
    lastTone = Date.now();
    try {
      var Audio = window.AudioContext || window.webkitAudioContext;
      if (!Audio) throw new Error('Audio unavailable');
      if (!audio) audio = new Audio();
      if (audio.state === 'suspended') await audio.resume();
      if (!sound || document.hidden) return;
      var t = audio.currentTime, osc = audio.createOscillator(), gain = audio.createGain();
      osc.type = 'sine'; osc.frequency.setValueAtTime(330 * Math.pow(2, index / 12), t);
      osc.frequency.exponentialRampToValueAtTime(660 * Math.pow(2, index / 12), t + .12);
      gain.gain.setValueAtTime(0, t); gain.gain.linearRampToValueAtTime(.035, t + .012);
      gain.gain.exponentialRampToValueAtTime(.001, t + .2);
      osc.connect(gain); gain.connect(audio.destination); osc.start(t); osc.stop(t + .22);
      osc.onended = function () { osc.disconnect(); gain.disconnect(); };
    } catch (_) { sound = false; sync(); }
  }
  document.addEventListener('click', function (event) {
    var button = event.target.closest('.constellation button');
    if (!button) return;
    var root = button.closest('.constellation');
    if (button.hasAttribute('data-orbit-sound')) {
      sound = !sound;
      if (!sound && audio) audio.suspend().catch(function () {});
      sync(); if (sound) tone(0); return;
    }
    if (button.hasAttribute('data-orbit-pause')) { paused = !paused; sync(); return; }
    var index = button.hasAttribute('data-star') ? Number(button.dataset.star) : 0;
    if (button.hasAttribute('data-star')) {
      root.querySelectorAll('[data-star]').forEach(function (node) { node.setAttribute('aria-pressed', String(node === button)); });
      root.querySelectorAll('[data-wire]').forEach(function (wire) { wire.classList.toggle('is-lit', Number(wire.dataset.wire) === index); });
    }
    root.classList.remove('is-pinging');
    void root.offsetWidth;
    root.classList.add('is-pinging'); sync(); tone(index);
  });
  document.addEventListener('dradar:languagechange', sync);
  document.addEventListener('visibilitychange', function () {
    if (document.hidden && audio) audio.suspend().catch(function () {});
  });
  window.DRadarConstellation = {html: html, sync: sync};
})();
