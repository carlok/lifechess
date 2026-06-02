const canvas = document.querySelector("#grid");
const ctx = canvas.getContext("2d");
const setupView = document.querySelector("#setup");
const gameView = document.querySelector("#gameView");
const rosterAEl = document.querySelector("#rosterA");
const rosterBEl = document.querySelector("#rosterB");
const piecesAEl = document.querySelector("#piecesA");
const piecesBEl = document.querySelector("#piecesB");
const newGameButton = document.querySelector("#newGame");
const resetSetupButton = document.querySelector("#resetSetup");
const turnLabel = document.querySelector("#turnLabel");
const biomassLabel = document.querySelector("#biomassLabel");
const resultLabel = document.querySelector("#resultLabel");
const messageEl = document.querySelector("#message");
const dirButtons = [...document.querySelectorAll("[data-dir]")];

ctx.imageSmoothingEnabled = false;

const palette = ["#101215", "#e7c857", "#57c7a3", "#e25d5d"];
let pieces = [];
let game = null;
let selectedDeployPieceId = null;
let selectedDirection = 0;
let animationFrames = [];
let frameIndex = 0;
let lastTick = 0;

init().catch((error) => setMessage(error.message));

async function init() {
  const response = await fetch("/api/pieces");
  const body = await response.json();
  pieces = body.pieces;
  buildRoster(rosterAEl, ["a", "b", "c", "d"]);
  buildRoster(rosterBEl, ["a", "b", "c", "d"]);
  renderStatus();
  requestAnimationFrame(tick);
}

function buildRoster(container, defaults) {
  container.innerHTML = "";
  for (let slot = 0; slot < 4; slot += 1) {
    const row = document.createElement("div");
    row.className = "slot-row";
    const label = document.createElement("label");
    label.textContent = `Slot ${slot + 1}`;
    const select = document.createElement("select");
    select.dataset.slot = String(slot);
    for (const piece of pieces) {
      const option = document.createElement("option");
      option.value = piece.key;
      option.textContent = `${piece.name}: ${piece.ruleId}`;
      select.append(option);
    }
    select.value = defaults[slot];
    row.append(label, select);
    container.append(row);
  }
}

async function startGame() {
  const rosterA = getRoster(rosterAEl);
  const rosterB = getRoster(rosterBEl);
  const response = await fetch("/api/game/new", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      rosterA,
      rosterB,
      options: {
        width: 128,
        height: 128,
        pulseSteps: 16384,
        frameEvery: 512
      }
    })
  });
  const body = await readJsonResponse(response);
  game = body.game;
  selectedDeployPieceId = null;
  animationFrames = [];
  frameIndex = 0;
  setupView.classList.add("hidden");
  gameView.classList.remove("hidden");
  setMessage("Player A: deploy a reserve piece or activate a living piece.");
  renderGame();
}

function getRoster(container) {
  return [...container.querySelectorAll("select")].map((select) => select.value);
}

function resetSetup() {
  game = null;
  selectedDeployPieceId = null;
  animationFrames = [];
  frameIndex = 0;
  setupView.classList.remove("hidden");
  gameView.classList.add("hidden");
  setMessage("Choose rosters and start.");
}

function renderGame() {
  renderStatus();
  renderPieces();
  drawCurrentBoard();
}

function renderStatus() {
  if (!game) {
    turnLabel.textContent = "-";
    biomassLabel.textContent = "-";
    resultLabel.textContent = "-";
    return;
  }

  const active = playerName(game.activePlayer);
  turnLabel.textContent = game.ended ? "ended" : `${active} (${game.turnsTaken[0]} / ${game.turnsTaken[1]})`;
  biomassLabel.textContent = `A ${game.biomassA} / B ${game.biomassB}`;
  resultLabel.textContent = game.ended ? `${game.winner}${game.endReason ? `, ${game.endReason}` : ""}` : "running";
}

function renderPieces() {
  renderPlayerPieces(piecesAEl, 0);
  renderPlayerPieces(piecesBEl, 1);
}

function renderPlayerPieces(container, player) {
  container.innerHTML = "";
  for (const piece of game.pieces.filter((candidate) => candidate.player === player)) {
    const card = document.createElement("article");
    card.className = `piece-card ${piece.player === game.activePlayer && !game.ended ? "active-side" : ""} ${piece.status === "dead" ? "dead" : ""}`;

    const title = document.createElement("div");
    title.className = "piece-title";
    title.innerHTML = `<span>${piece.id} / ${piece.ruleKey}</span><span>${piece.status}</span>`;

    const meta = document.createElement("div");
    meta.className = "piece-meta";
    meta.textContent = piece.status === "reserve"
      ? piece.ruleId
      : `${piece.ruleId} | core ${piece.coreX},${piece.coreY} | kills ${piece.killCount}`;

    const button = document.createElement("button");
    button.className = `piece-button ${selectedDeployPieceId === piece.id ? "selected" : ""}`;
    button.type = "button";
    button.disabled = game.ended || piece.player !== game.activePlayer || piece.status === "dead";

    if (piece.status === "reserve") {
      button.textContent = selectedDeployPieceId === piece.id ? "Click Board" : "Deploy";
      button.addEventListener("click", () => {
        selectedDeployPieceId = piece.id;
        setMessage(`${piece.id}: click a cell to deploy, direction ${directionLabel(selectedDirection)}.`);
        renderPieces();
      });
    } else {
      button.textContent = "Activate";
      button.addEventListener("click", () => sendAction({ type: "activate", pieceId: piece.id }).catch((error) => setMessage(error.message)));
    }

    card.append(title, meta, button);
    container.append(card);
  }
}

function drawCurrentBoard() {
  if (!game) return;
  const frame = animationFrames[frameIndex];
  const source = frame ?? {
    colors: game.board.colors,
    owners: game.board.owners,
    pieces: game.pieces,
    biomassA: game.biomassA,
    biomassB: game.biomassB
  };
  drawBoard(source.colors, source.owners, source.pieces);
  if (frame) {
    biomassLabel.textContent = `A ${frame.biomassA} / B ${frame.biomassB}`;
  }
}

function drawBoard(colors, owners, framePieces) {
  const width = game.width;
  const height = game.height;
  const image = ctx.createImageData(width, height);
  for (let index = 0; index < colors.length; index += 1) {
    const color = hexToRgb(palette[colors[index]]);
    const owner = owners[index];
    const tint = owner === 0 ? [24, 56, 104] : owner === 1 ? [104, 28, 42] : [0, 0, 0];
    const offset = index * 4;
    image.data[offset] = Math.min(255, color[0] + tint[0]);
    image.data[offset + 1] = Math.min(255, color[1] + tint[1]);
    image.data[offset + 2] = Math.min(255, color[2] + tint[2]);
    image.data[offset + 3] = 255;
  }

  for (const piece of framePieces) {
    if (piece.status !== "alive") continue;
    const rgb = piece.player === 0 ? [105, 168, 255] : [255, 88, 104];
    markCore(image, width, height, piece.coreX, piece.coreY, rgb);
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
}

async function sendAction(action) {
  selectedDeployPieceId = null;
  setMessage("Resolving burst...");
  const response = await fetch("/api/game/action", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ gameId: game.id, action })
  });
  const body = await readJsonResponse(response);
  game = body.game;
  animationFrames = body.frames;
  frameIndex = 0;
  const killed = body.killedPieceIds.length ? ` Killed ${body.killedPieceIds.join(", ")}.` : "";
  setMessage(game.ended ? `Game ended: ${game.winner}.${killed}` : `${playerName(game.activePlayer)} to move.${killed}`);
  renderGame();
}

async function readJsonResponse(response) {
  const body = await response.json().catch(() => ({ error: response.statusText }));
  if (!response.ok) {
    throw new Error(body.error ?? response.statusText);
  }
  return body;
}

function canvasCell(event) {
  const rect = canvas.getBoundingClientRect();
  const x = Math.floor((event.clientX - rect.left) / rect.width * game.width);
  const y = Math.floor((event.clientY - rect.top) / rect.height * game.height);
  return { x, y };
}

function tick(now) {
  if (animationFrames.length > 0 && now - lastTick > 50) {
    frameIndex += 1;
    if (frameIndex >= animationFrames.length) {
      animationFrames = [];
      frameIndex = 0;
      renderGame();
    } else {
      drawCurrentBoard();
    }
    lastTick = now;
  }
  requestAnimationFrame(tick);
}

function markCore(image, width, height, x, y, rgb) {
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

function setMessage(text) {
  messageEl.textContent = text;
}

function playerName(player) {
  return player === 0 ? "Player A" : "Player B";
}

function directionLabel(dir) {
  return ["N", "E", "S", "W"][dir];
}

newGameButton.addEventListener("click", () => startGame().catch((error) => setMessage(error.message)));
resetSetupButton.addEventListener("click", resetSetup);
canvas.addEventListener("click", (event) => {
  if (!game || game.ended || !selectedDeployPieceId) return;
  const { x, y } = canvasCell(event);
  sendAction({ type: "deploy", pieceId: selectedDeployPieceId, x, y, dir: selectedDirection }).catch((error) => setMessage(error.message));
});

dirButtons.forEach((button) => {
  button.addEventListener("click", () => {
    selectedDirection = Number(button.dataset.dir);
    dirButtons.forEach((candidate) => candidate.classList.toggle("active", candidate === button));
  });
});
