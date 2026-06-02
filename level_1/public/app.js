const canvas = document.querySelector("#grid");
const ctx = canvas.getContext("2d");
const newMatchButton = document.querySelector("#newMatch");
const playPauseButton = document.querySelector("#playPause");
const speedInput = document.querySelector("#speed");
const noLimitStepsInput = document.querySelector("#noLimitSteps");
const nButtons = [...document.querySelectorAll("[data-n]")];
const modeButtons = [...document.querySelectorAll("[data-mode]")];
const winnerRuleSelect = document.querySelector("#winnerRule");
const customRuleAInput = document.querySelector("#customRuleA");
const customRuleBInput = document.querySelector("#customRuleB");

ctx.imageSmoothingEnabled = false;

const fields = {
  ruleA: document.querySelector("#ruleA"),
  ruleB: document.querySelector("#ruleB"),
  frame: document.querySelector("#frame"),
  active: document.querySelector("#active"),
  biomass: document.querySelector("#biomass"),
  winner: document.querySelector("#winner")
};

const palettes = {
  2: ["#101215", "#e7c857"],
  3: ["#101215", "#e7c857", "#57c7a3"],
  4: ["#101215", "#e7c857", "#57c7a3", "#e25d5d"]
};

const winnerRules = [
  { nColors: 4, ruleId: "2R_0L_1R_0R", label: "512 mixed #1" },
  { nColors: 4, ruleId: "3L_0R_0R_1L", label: "512 mixed #2" },
  { nColors: 4, ruleId: "2L_2R_3L_0R", label: "512 mixed #3" },
  { nColors: 3, ruleId: "2L_0R_1L", label: "512 mixed best N3" },
  { nColors: 2, ruleId: "1R_0L", label: "512 mixed best N2" },
  { nColors: 4, ruleId: "3L_2R_3L_1L", label: "64 N4 #1" },
  { nColors: 3, ruleId: "2R_1R_0L", label: "32 N3 #1" }
];

let nColors = 2;
let mode = "match";
let match = null;
let frameIndex = 0;
let playing = true;
let lastTick = 0;

const SOLO_FRAME_EVERY = 128;
const SOLO_EXTEND_STEPS = 4096;
const MAX_SOLO_FRAMES = 800;

function setStatus(text) {
  fields.winner.textContent = text;
}

async function loadMatch() {
  setStatus("loading");
  const response = mode === "solo"
    ? await fetchSoloShape()
    : mode === "custom"
      ? await fetchCustomMatch()
      : await fetchRandomMatch();
  if (!response.ok) {
    const body = await response.json().catch(() => ({ error: response.statusText }));
    throw new Error(body.error);
  }

  match = await response.json();
  frameIndex = 0;
  playing = true;
  playPauseButton.textContent = "Pause";
  fields.ruleA.textContent = match.ruleA;
  fields.ruleB.textContent = match.mode === "solo" ? "-" : match.ruleB;
  draw();
}

function fetchRandomMatch() {
  return fetch(`/api/random-match?n=${nColors}&width=128&height=128&pulseSteps=2048&frameEvery=64`);
}

function fetchSoloShape() {
  const rule = customRuleAInput.value.trim();
  return fetch(`/api/solo-shape?n=${nColors}&rule=${encodeURIComponent(rule)}&width=192&height=192&pulseSteps=4096&pulses=8&frameEvery=128`);
}

function fetchCustomMatch() {
  return fetch("/api/simulate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      nColors,
      ruleA: customRuleAInput.value.trim(),
      ruleB: customRuleBInput.value.trim(),
      options: {
        width: 128,
        height: 128,
        pulseSteps: 2048,
        frameEvery: 64,
        includeFrames: true
      }
    })
  });
}

function draw() {
  if (!match?.frames?.length) return;

  const frame = match.frames[frameIndex];
  const width = match.width;
  const height = match.height;
  const image = ctx.createImageData(width, height);
  const colors = palettes[match.nColors];

  for (let index = 0; index < frame.colors.length; index += 1) {
    const color = hexToRgb(colors[frame.colors[index]]);
    const owner = frame.owners[index];
    const offset = index * 4;
    const tint = owner === 0 ? [20, 55, 95] : owner === 1 ? [95, 24, 35] : [0, 0, 0];

    image.data[offset] = Math.min(255, color[0] + tint[0]);
    image.data[offset + 1] = Math.min(255, color[1] + tint[1]);
    image.data[offset + 2] = Math.min(255, color[2] + tint[2]);
    image.data[offset + 3] = 255;
  }

  markAnt(image, width, height, frame.antA.x, frame.antA.y, [120, 180, 255]);
  if (match.mode !== "solo") {
    markAnt(image, width, height, frame.antA.coreX, frame.antA.coreY, [30, 120, 255]);
  }
  if (frame.antB) {
    markAnt(image, width, height, frame.antB.x, frame.antB.y, [255, 96, 112]);
    markAnt(image, width, height, frame.antB.coreX, frame.antB.coreY, [255, 40, 64]);
  }

  const buffer = document.createElement("canvas");
  buffer.width = width;
  buffer.height = height;
  const bufferCtx = buffer.getContext("2d");
  bufferCtx.imageSmoothingEnabled = false;
  bufferCtx.putImageData(image, 0, 0);
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(buffer, 0, 0, canvas.width, canvas.height);

  fields.frame.textContent = `${frameIndex + 1} / ${match.frames.length} (${frame.step} steps)`;
  fields.active.textContent = match.mode === "solo" ? "solo" : frame.activeAnt === 0 ? "A" : "B";
  fields.biomass.textContent = match.mode === "solo" ? `${frame.biomassA}` : `A ${frame.biomassA} / B ${frame.biomassB}`;
  fields.winner.textContent = match.mode === "solo"
    ? `shape ${frame.biomassA} cells`
    : frameIndex === match.frames.length - 1
      ? `${match.winner}${match.coreKill ? " by core kill" : ""}`
      : "running";
}

function extendSoloFrames() {
  if (match?.mode !== "solo" || !match.frames?.length) return false;

  const rule = parseRule(match.ruleA, match.ruleAColors ?? match.nColors);
  const width = match.width;
  const height = match.height;
  const lastFrame = match.frames[match.frames.length - 1];
  const colors = Uint8Array.from(lastFrame.colors);
  const owners = Int8Array.from(lastFrame.owners);
  const ant = { ...lastFrame.antA };
  let biomassA = lastFrame.biomassA;
  let totalSteps = lastFrame.step;
  const addedFrames = [];

  for (let step = 0; step < SOLO_EXTEND_STEPS; step += 1) {
    const index = ant.y * width + ant.x;
    const color = colors[index];
    const ruleColor = color % rule.nextColors.length;
    const previousOwner = owners[index];

    colors[index] = rule.nextColors[ruleColor];
    owners[index] = 0;
    if (previousOwner !== 0) {
      biomassA += 1;
    }

    ant.dir = (ant.dir + rule.turns[ruleColor] + 4) % 4;
    moveForward(ant, width, height);
    totalSteps += 1;

    if (totalSteps % SOLO_FRAME_EVERY === 0) {
      addedFrames.push(makeSoloFrame(totalSteps, colors, owners, ant, biomassA));
    }
  }

  if (!addedFrames.length || addedFrames[addedFrames.length - 1].step !== totalSteps) {
    addedFrames.push(makeSoloFrame(totalSteps, colors, owners, ant, biomassA));
  }

  match.frames.push(...addedFrames);
  if (match.frames.length > MAX_SOLO_FRAMES) {
    const removeCount = match.frames.length - MAX_SOLO_FRAMES;
    match.frames.splice(0, removeCount);
    frameIndex = Math.max(0, frameIndex - removeCount);
  }

  return true;
}

function makeSoloFrame(step, colors, owners, ant, biomassA) {
  return {
    step,
    macroTurn: Math.floor(step / 4096),
    activeAnt: 0,
    biomassA,
    biomassB: 0,
    antA: { ...ant },
    colors: Array.from(colors),
    owners: Array.from(owners)
  };
}

function parseRule(ruleId, expectedColors) {
  const parts = ruleId.split("_");
  if (parts.length !== expectedColors) {
    throw new Error(`Rule ${ruleId} does not have ${expectedColors} transitions`);
  }

  const nextColors = [];
  const turns = [];
  for (const part of parts) {
    const match = part.match(/^(\d+)([LR])$/);
    if (!match) {
      throw new Error(`Invalid rule transition: ${part}`);
    }

    const nextColor = Number(match[1]);
    if (nextColor < 0 || nextColor >= expectedColors) {
      throw new Error(`Rule color ${nextColor} is outside N=${expectedColors}`);
    }

    nextColors.push(nextColor);
    turns.push(match[2] === "L" ? -1 : 1);
  }

  return { nextColors, turns };
}

function moveForward(ant, width, height) {
  if (ant.dir === 0) ant.y = wrap(ant.y - 1, height);
  if (ant.dir === 1) ant.x = wrap(ant.x + 1, width);
  if (ant.dir === 2) ant.y = wrap(ant.y + 1, height);
  if (ant.dir === 3) ant.x = wrap(ant.x - 1, width);
}

function wrap(value, limit) {
  if (value < 0) return limit - 1;
  if (value >= limit) return 0;
  return value;
}

function markAnt(image, width, height, x, y, rgb) {
  for (let dy = -1; dy <= 1; dy += 1) {
    for (let dx = -1; dx <= 1; dx += 1) {
      const px = (x + dx + width) % width;
      const py = (y + dy + height) % height;
      const offset = (py * width + px) * 4;
      image.data[offset] = rgb[0];
      image.data[offset + 1] = rgb[1];
      image.data[offset + 2] = rgb[2];
      image.data[offset + 3] = 255;
    }
  }
}

function hexToRgb(hex) {
  return [
    Number.parseInt(hex.slice(1, 3), 16),
    Number.parseInt(hex.slice(3, 5), 16),
    Number.parseInt(hex.slice(5, 7), 16)
  ];
}

function tick(now) {
  const speed = Number(speedInput.value);
  const interval = 260 - speed * 22;

  if (playing && match?.frames?.length && now - lastTick >= interval) {
    const atLastFrame = frameIndex === match.frames.length - 1;
    if (atLastFrame && noLimitStepsInput.checked && match.mode === "solo") {
      setStatus("extending shape");
      extendSoloFrames();
    }

    frameIndex = Math.min(frameIndex + 1, match.frames.length - 1);
    if (frameIndex === match.frames.length - 1 && !(noLimitStepsInput.checked && match.mode === "solo")) {
      playing = false;
      playPauseButton.textContent = "Play";
    }
    draw();
    lastTick = now;
  }

  requestAnimationFrame(tick);
}

nButtons.forEach((button) => {
  button.addEventListener("click", async () => {
    nColors = Number(button.dataset.n);
    nButtons.forEach((candidate) => candidate.classList.toggle("active", candidate === button));
    await loadMatch().catch((error) => setStatus(error.message));
  });
});

modeButtons.forEach((button) => {
  button.addEventListener("click", async () => {
    mode = button.dataset.mode;
    modeButtons.forEach((candidate) => candidate.classList.toggle("active", candidate === button));
    syncControls();
    await loadMatch().catch((error) => setStatus(error.message));
  });
});

winnerRuleSelect.addEventListener("change", () => {
  applySelectedWinnerRule();
  if (mode === "solo") {
    loadMatch().catch((error) => setStatus(error.message));
  }
});

newMatchButton.addEventListener("click", () => {
  loadMatch().catch((error) => setStatus(error.message));
});

playPauseButton.addEventListener("click", () => {
  playing = !playing;
  playPauseButton.textContent = playing ? "Pause" : "Play";
});

winnerRules.forEach((rule, index) => {
  const option = document.createElement("option");
  option.value = String(index);
  option.textContent = `${rule.label}: N${rule.nColors} ${rule.ruleId}`;
  winnerRuleSelect.append(option);
});
customRuleAInput.value = "1R_0L";
customRuleBInput.value = "0R_1L";

function syncControls() {
  winnerRuleSelect.disabled = mode !== "solo";
  customRuleAInput.disabled = mode !== "custom" && mode !== "solo";
  customRuleBInput.disabled = mode !== "custom";
  noLimitStepsInput.disabled = mode !== "solo";
  newMatchButton.textContent = mode === "solo" ? "Render Shape" : mode === "custom" ? "Run Match" : "New Match";
}

function applySelectedWinnerRule() {
  const selected = winnerRules[Number(winnerRuleSelect.value)] ?? winnerRules[0];
  nColors = selected.nColors;
  customRuleAInput.value = selected.ruleId;
  nButtons.forEach((candidate) => candidate.classList.toggle("active", Number(candidate.dataset.n) === nColors));
}

syncControls();

loadMatch().catch((error) => setStatus(error.message));
requestAnimationFrame(tick);
