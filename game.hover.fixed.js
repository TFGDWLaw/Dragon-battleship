'use strict';

const SCREEN_WIDTH = 1920;
const SCREEN_HEIGHT = 1080;
const CANVAS_WIDTH = 1920;
const CANVAS_HEIGHT = 1080;
const VIEW_SCALE = CANVAS_HEIGHT / SCREEN_HEIGHT;
const VIEW_OFFSET_X = (CANVAS_WIDTH - SCREEN_WIDTH * VIEW_SCALE) / 2;
const VIEW_MIN_X = -VIEW_OFFSET_X / VIEW_SCALE;
const VIEW_WIDTH = CANVAS_WIDTH / VIEW_SCALE;
const GRID_SIZE = 10;
const CELL_SIZE = 75;
const BOARD_OFFSET_Y = 190;
const PLAYER_X = 70;
const COMP_X = 1080;

const PHASE = {
  PLACEMENT: 'PLACEMENT',
  PLAYER_TURN: 'PLAYER_TURN',
  ENEMY_TURN: 'ENEMY_TURN',
  TURN_BANNER: 'TURN_BANNER',
  PROJECTILE: 'PROJECTILE',
  GAME_OVER: 'GAME_OVER'
};

const FLEET = [
  { name: 'Carrier', length: 5, element: 'Fire', color: '#f05c32', glow: '#ffc34c', symbol: '🔥' },
  { name: 'Battleship', length: 4, element: 'Water', color: '#32bce8', glow: '#b5f4ff', symbol: '💧' },
  { name: 'Destroyer', length: 3, element: 'Plant', color: '#73c849', glow: '#d5ff8e', symbol: '🌿' },
  { name: 'Submarine', length: 3, element: 'Earth', color: '#a9784d', glow: '#f0c987', symbol: '🪨' },
  { name: 'Patrol Boat', length: 2, element: 'Wind', color: '#8ca9f4', glow: '#ecf8ff', symbol: '🌪' }
];
const FLEET_BY_NAME = Object.fromEntries(FLEET.map((ship) => [ship.name, ship]));
// The supplied files are sprite sheets. This crop isolates the top-down ship.
const SHIP_ART_CROP = { x: 35, y: 45, width: 400, height: 1320 };
const SHIP_ART = {};
FLEET.forEach((ship) => {
  const image = new Image();
  image.src = `assets/Ship/cleaned/${ship.element}.png?v=transparent-v2`;
  SHIP_ART[ship.element] = image;
});
const ANIMATION_ASSETS = {
  playerTurn: loadImageAsset('assets/Animation/Your turn.png?v=banner-v1'),
  enemyTurn: loadImageAsset('assets/Animation/Enemy turn.png?v=banner-v1'),
  scope: loadImageAsset('assets/Animation/cleaned/ống ngắm.png?v=transparent-v1'),
  playerTorpedo: loadImageAsset('assets/Animation/cleaned/Ngư lôi xanh.png?v=transparent-v2'),
  enemyTorpedo: loadImageAsset('assets/Animation/cleaned/Ngư lôi đỏ.png?v=transparent-v2'),
  miss: loadImageAsset('assets/Animation/cleaned/Miss.png?v=transparent-v1'),
  explosion: loadImageAsset('assets/Animation/cleaned/vụ nổ.png?v=transparent-v1'),
  flame: loadImageAsset('assets/Animation/cleaned/flame.png?v=transparent-v2')
};
const DRAGON_ICON = loadImageAsset('assets/ui/dragon-favicon.png?v=1');

function loadImageAsset(src) {
  const image = new Image();
  image.src = src;
  return image;
}

const SETTINGS_KEY = 'battleship-command-settings';
const settings = loadSettings();
const pendingMissCells = new Set();

const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
ctx.imageSmoothingEnabled = true;
ctx.imageSmoothingQuality = 'high';
let mouse = { x: -1, y: -1 };

const dom = {
  mainMenu: document.getElementById('mainMenu'),
  gameScreen: document.getElementById('gameScreen'),
  startGameBtn: document.getElementById('startGameBtn'),
  howToPlayBtn: document.getElementById('howToPlayBtn'),
  settingsBtn: document.getElementById('settingsBtn'),
  exitBtn: document.getElementById('exitBtn'),
  returnToMenuBtn: document.getElementById('returnToMenuBtn'),
  shuffleBtn: document.getElementById('shuffleBtn'),
  pauseBtn: document.getElementById('pauseBtn'),
  howToPlayDialog: document.getElementById('howToPlayDialog'),
  settingsDialog: document.getElementById('settingsDialog'),
  exitDialog: document.getElementById('exitDialog'),
  pauseDialog: document.getElementById('pauseDialog'),
  restartGameBtn: document.getElementById('restartGameBtn'),
  pauseSoundBtn: document.getElementById('pauseSoundBtn'),
  pauseExitBtn: document.getElementById('pauseExitBtn'),
  soundToggle: document.getElementById('soundToggle'),
  musicToggle: document.getElementById('musicToggle'),
  audioStatus: document.getElementById('audioStatus')
};

class Board {
  constructor(xOffset, yOffset, isPlayer) {
    this.xOffset = xOffset;
    this.yOffset = yOffset;
    this.isPlayer = isPlayer;
    this.reset();
  }

  reset() {
    this.grid = Array.from({ length: GRID_SIZE }, () => Array(GRID_SIZE).fill(0));
    this.ships = [];
    this.sunkShipsTracked = [];
  }

  getCellFromPos(x, y) {
    const col = Math.floor((x - this.xOffset) / CELL_SIZE);
    const row = Math.floor((y - this.yOffset) / CELL_SIZE);
    if (row < 0 || row >= GRID_SIZE || col < 0 || col >= GRID_SIZE) return null;
    return { row, col };
  }

  canPlaceShip(row, col, length, horizontal) {
    for (let i = 0; i < length; i += 1) {
      const r = horizontal ? row : row + i;
      const c = horizontal ? col + i : col;
      if (r < 0 || r >= GRID_SIZE || c < 0 || c >= GRID_SIZE || this.grid[r][c] !== 0) return false;
    }
    return true;
  }

  placeShip(row, col, ship, horizontal) {
    const coords = [];
    for (let i = 0; i < ship.length; i += 1) {
      const r = horizontal ? row : row + i;
      const c = horizontal ? col + i : col;
      this.grid[r][c] = 1;
      coords.push({ row: r, col: c, hit: false });
    }
    this.ships.push({ name: ship.name, coords, horizontal });
  }

  autoPlaceShips() {
    for (const ship of FLEET) {
      let placed = false;
      while (!placed) {
        const row = randomInt(GRID_SIZE);
        const col = randomInt(GRID_SIZE);
        const horizontal = Math.random() < 0.5;
        if (this.canPlaceShip(row, col, ship.length, horizontal)) {
          this.placeShip(row, col, ship, horizontal);
          placed = true;
        }
      }
    }
  }

  receiveShot(row, col) {
    if (this.grid[row][col] === 1) {
      this.grid[row][col] = 3;
      for (const ship of this.ships) {
        const found = ship.coords.find((coord) => coord.row === row && coord.col === col);
        if (found) found.hit = true;
      }
      return 'HIT';
    }
    if (this.grid[row][col] === 0) {
      this.grid[row][col] = 2;
      return 'MISS';
    }
    return 'ALREADY_SHOT';
  }

  getNewlySunkShip() {
    for (const ship of this.ships) {
      if (!this.sunkShipsTracked.includes(ship.name) && ship.coords.every((coord) => coord.hit)) {
        this.sunkShipsTracked.push(ship.name);
        return ship.name;
      }
    }
    return null;
  }

  hasLost() {
    return this.grid.every((line) => line.every((cell) => cell !== 1));
  }
}

class Game {
  constructor() {
    this.playerBoard = new Board(PLAYER_X, BOARD_OFFSET_Y, true);
    this.enemyBoard = new Board(COMP_X, BOARD_OFFSET_Y, false);
    this.phase = PHASE.PLACEMENT;
    this.aiTimer = null;
    this.bannerTimer = null;
    this.effects = [];
    pendingMissCells.clear();
    this.turnBanner = null;
    this.restartButton = { x: 790, y: 580, w: 340, h: 56 };
    this.exitButton = { x: 790, y: 654, w: 340, h: 56 };
    this.reset();
  }

  reset() {
    this.clearTimers();
    this.playerBoard.reset();
    this.enemyBoard.reset();
    this.enemyBoard.autoPlaceShips();
    this.phase = PHASE.PLACEMENT;
    this.shipsToPlace = [...FLEET];
    this.currentPlacementIndex = 0;
    this.horizontal = true;
    this.aiHits = [];
    this.playerShotIndex = 0;
    this.enemyShotIndex = 0;
    this.effects = [];
    this.turnBanner = null;
    this.winner = null;
    this.tutorialActive = true;
    this.statusMessage = 'Deploy your dragon warships. Press R to rotate the current vessel.';
  }

  clearTimers() {
    if (this.aiTimer) window.clearTimeout(this.aiTimer);
    if (this.bannerTimer) window.clearTimeout(this.bannerTimer);
    this.aiTimer = null;
    this.bannerTimer = null;
  }

  toggleRotation() {
    if (this.phase === PHASE.PLACEMENT) this.horizontal = !this.horizontal;
  }

  shuffleFleet() {
    if (this.phase !== PHASE.PLACEMENT) return;
    this.playerBoard.reset();
    this.playerBoard.autoPlaceShips();
    this.currentPlacementIndex = this.shipsToPlace.length;
    this.tutorialActive = false;
    this.statusMessage = 'Dragon fleet shuffled and deployed!';
    this.showTurnBanner('PLAYER', () => {
      this.phase = PHASE.PLAYER_TURN;
      this.statusMessage = 'Your Turn â€” choose an enemy grid cell.';
    });
  }

  showTurnBanner(side, onDone) {
    this.phase = PHASE.TURN_BANNER;
    this.turnBanner = { side, start: performance.now(), duration: 1100 };
    this.bannerTimer = window.setTimeout(() => {
      this.turnBanner = null;
      onDone();
    }, 1100);
  }

  handleClick(x, y) {
    if (this.phase === PHASE.GAME_OVER) {
      if (contains(this.restartButton, x, y)) this.reset();
      if (contains(this.exitButton, x, y)) showMenu();
      return;
    }

    if (this.phase === PHASE.PLACEMENT) {
      const cell = this.playerBoard.getCellFromPos(x, y);
      if (!cell) return;
      const ship = this.shipsToPlace[this.currentPlacementIndex];
      if (!this.playerBoard.canPlaceShip(cell.row, cell.col, ship.length, this.horizontal)) return;
      this.playerBoard.placeShip(cell.row, cell.col, ship, this.horizontal);
      this.tutorialActive = false;
      this.currentPlacementIndex += 1;
      if (this.currentPlacementIndex === this.shipsToPlace.length) {
        this.statusMessage = 'Fleet deployed. Prepare to fire.';
        this.showTurnBanner('PLAYER', () => {
          this.phase = PHASE.PLAYER_TURN;
          this.statusMessage = 'Your Turn — choose an enemy grid cell.';
        });
      }
      return;
    }

    if (this.phase !== PHASE.PLAYER_TURN) return;
    const cell = this.enemyBoard.getCellFromPos(x, y);
    if (!cell || ![0, 1].includes(this.enemyBoard.grid[cell.row][cell.col])) return;
    this.launchShot('PLAYER', cell.row, cell.col);
  }

  launchShot(attacker, row, col) {
    const ownBoard = attacker === 'PLAYER' ? this.playerBoard : this.enemyBoard;
    const targetBoard = attacker === 'PLAYER' ? this.enemyBoard : this.playerBoard;
    const ship = this.getAttackingShip(ownBoard, attacker);
    const from = getShipCenter(ownBoard, ship);
    const to = getCellCenter(targetBoard, row, col);
    const duration = 680;
    this.phase = PHASE.PROJECTILE;
    this.statusMessage = attacker === 'PLAYER' ? `${ship.element} attack launched!` : `Enemy ${ship.element.toLowerCase()} attack incoming!`;
    this.effects.push({ kind: 'targetLock', x: to.x, y: to.y, start: performance.now(), duration });
    this.effects.push({ kind: 'projectile', attacker, ship, from, to, row, col, start: performance.now(), duration });
  }

  getAttackingShip(board, attacker) {
    const living = board.ships.filter((ship) => ship.coords.some((coord) => !coord.hit));
    if (!living.length) return FLEET[0];
    let turnIndex;
    if (attacker === 'PLAYER') {
      turnIndex = this.playerShotIndex || 0;
      this.playerShotIndex = turnIndex + 1;
    } else {
      turnIndex = this.enemyShotIndex || 0;
      this.enemyShotIndex = turnIndex + 1;
    }
    const chosen = living[turnIndex % living.length];
    return FLEET_BY_NAME[chosen.name];
  }

  resolveShot(attacker, row, col, ship) {
    const target = attacker === 'PLAYER' ? this.enemyBoard : this.playerBoard;
    const result = target.receiveShot(row, col);
    if (result === 'ALREADY_SHOT') {
      this.phase = attacker === 'PLAYER' ? PHASE.PLAYER_TURN : PHASE.ENEMY_TURN;
      return;
    }

    if (result === 'HIT') {
      this.addExplosion(target, row, col, ship);
      const sunk = target.getNewlySunkShip();
      this.statusMessage = sunk ? `[SUNK] ${sunk} destroyed!` : `[HIT] ${ship.element} strike landed!`;
      if (target.hasLost()) {
        this.winner = attacker;
        this.phase = PHASE.GAME_OVER;
        this.statusMessage = attacker === 'PLAYER' ? 'Victory! Enemy fleet defeated.' : 'Defeat! Your fleet has fallen.';
        return;
      }
      if (attacker === 'PLAYER') {
        this.phase = PHASE.PLAYER_TURN;
      } else {
        this.phase = PHASE.ENEMY_TURN;
        this.scheduleEnemyTurn(650);
      }
      return;
    }

    if (attacker === 'PLAYER') {
      this.statusMessage = '[MISS] Your attack missed.';
      this.showTurnBanner('ENEMY', () => {
        this.phase = PHASE.ENEMY_TURN;
        this.statusMessage = 'Enemy Turn';
        this.scheduleEnemyTurn(250);
      });
    } else {
      this.statusMessage = '[ENEMY MISS] The enemy attack missed.';
      this.showTurnBanner('PLAYER', () => {
        this.phase = PHASE.PLAYER_TURN;
        this.statusMessage = 'Your Turn — choose an enemy grid cell.';
      });
    }
  }

  scheduleEnemyTurn(delay) {
    if (this.aiTimer) window.clearTimeout(this.aiTimer);
    this.aiTimer = window.setTimeout(() => this.enemyTurn(), delay);
  }

  enemyTurn() {
    if (this.phase !== PHASE.ENEMY_TURN) return;
    const target = this.chooseAiTarget();
    this.launchShot('ENEMY', target.row, target.col);
  }

  chooseAiTarget() {
    while (true) {
      if (this.aiHits.length) {
        const latest = this.aiHits[this.aiHits.length - 1];
        const candidates = [[-1, 0], [1, 0], [0, -1], [0, 1]]
          .map(([dr, dc]) => ({ row: latest.row + dr, col: latest.col + dc }))
          .filter(({ row, col }) => row >= 0 && row < GRID_SIZE && col >= 0 && col < GRID_SIZE && [0, 1].includes(this.playerBoard.grid[row][col]));
        if (candidates.length) return candidates[randomInt(candidates.length)];
        this.aiHits.pop();
      } else {
        const row = randomInt(GRID_SIZE);
        const col = randomInt(GRID_SIZE);
        if ([0, 1].includes(this.playerBoard.grid[row][col])) return { row, col };
      }
    }
  }

  addExplosion(board, row, col, ship) {
    const pos = getCellCenter(board, row, col);
    this.effects.push({
      kind: 'impact',
      x: pos.x,
      y: pos.y,
      color: ship.color,
      glow: ship.glow,
      start: performance.now(),
      duration: 320,
      sparks: Array.from({ length: 14 }, () => ({ angle: Math.random() * Math.PI * 2, speed: 0.5 + Math.random() * 1.8, size: 2 + Math.random() * 3 }))
    });
  }

  addMiss(board, row, col) {
    const pos = getCellCenter(board, row, col);
    const key = `${board.isPlayer ? 'player' : 'enemy'}:${row}:${col}`;
    pendingMissCells.add(key);
    this.effects.push({ kind: 'miss', key, x: pos.x, y: pos.y, start: performance.now(), duration: 760 });
  }

  draw() {
    ctx.setTransform(VIEW_SCALE, 0, 0, VIEW_SCALE, VIEW_OFFSET_X, 0);
    drawGameBackdrop();
    drawFantasyHeader(this.statusMessage);
    drawBoardFrame(this.playerBoard, 'FRIENDLY WATERS', '#79d9ff');
    drawBoardFrame(this.enemyBoard, 'ENEMY WATERS', '#ff916e');

    drawBoard(this.playerBoard, true);
    drawBoard(this.enemyBoard, this.phase === PHASE.GAME_OVER && this.winner === 'PLAYER');

    if (this.phase === PHASE.PLACEMENT && this.currentPlacementIndex < this.shipsToPlace.length) {
      const ship = this.shipsToPlace[this.currentPlacementIndex];
      drawPlacementInfo(ship, this.horizontal);
      drawPlacementPreview(this.playerBoard, ship, this.horizontal);
      if (this.tutorialActive) drawPlacementTutorial(this.playerBoard);
    }

    if (this.phase === PHASE.PLAYER_TURN) drawEnemyHover(this.enemyBoard);
    dom.shuffleBtn.disabled = this.phase !== PHASE.PLACEMENT;
    drawFleetLoadout(this.currentPlacementIndex);
    this.drawEffects();

    if (this.turnBanner) drawTurnBanner(this.turnBanner);
    if (this.phase === PHASE.GAME_OVER) drawFinalResult(this.winner, this.restartButton, this.exitButton, mouse);
  }

  drawEffects() {
    const now = performance.now();
    const live = [];
    for (const effect of this.effects) {
      const progress = Math.min(1, (now - effect.start) / effect.duration);
      if (effect.kind === 'projectile') {
        drawElementProjectile(effect, progress);
        if (progress >= 1) {
          const targetBoard = effect.attacker === 'PLAYER' ? this.enemyBoard : this.playerBoard;
          const result = targetBoard.receiveShot(effect.row, effect.col);
          if (result === 'HIT' && effect.attacker === 'ENEMY') this.aiHits.push({ row: effect.row, col: effect.col });
          // Restore before resolve because resolve uses board state for sunk / lost.
          if (result === 'ALREADY_SHOT') {
            this.phase = effect.attacker === 'PLAYER' ? PHASE.PLAYER_TURN : PHASE.ENEMY_TURN;
          } else {
            this.afterProjectile(effect, result);
          }
        } else {
          live.push(effect);
        }
      } else if (effect.kind === 'targetLock') {
        if (progress < 1) {
          drawTargetLock(effect, progress);
          live.push(effect);
        }
      } else if (effect.kind === 'impact') {
        if (progress < 1) {
          if (settings.effects) drawImpactEnergy(effect, progress);
          live.push(effect);
        } else {
          live.push({ kind: 'explosionAsset', x: effect.x, y: effect.y, start: now, duration: 560 });
        }
      } else if (effect.kind === 'explosionAsset') {
        if (progress < 1) {
          if (settings.effects) drawExplosionAsset(effect, progress);
          live.push(effect);
        } else {
          live.push({ kind: 'flame', x: effect.x, y: effect.y, start: now, duration: Number.POSITIVE_INFINITY });
        }
      } else if (effect.kind === 'flame') {
        if (settings.effects) drawFlameEffect(effect);
        live.push(effect);
      } else if (effect.kind === 'miss') {
        if (progress < 1) {
          if (settings.effects) drawMissSplash(effect, progress);
          live.push(effect);
        } else {
          pendingMissCells.delete(effect.key);
        }
      } else if (effect.kind === 'launch') {
        if (progress < 1) {
          if (settings.effects) drawTorpedoLaunch(effect, progress);
          live.push(effect);
        }
      }
    }
    this.effects = live;
  }

  afterProjectile(effect, result) {
    const target = effect.attacker === 'PLAYER' ? this.enemyBoard : this.playerBoard;
    if (result === 'HIT') {
      this.addExplosion(target, effect.row, effect.col, effect.ship);
      const sunk = target.getNewlySunkShip();
      this.statusMessage = sunk ? `[SUNK] ${sunk} destroyed!` : `[HIT] ${effect.ship.element} strike landed!`;
      if (target.hasLost()) {
        this.winner = effect.attacker;
        this.phase = PHASE.GAME_OVER;
        this.statusMessage = effect.attacker === 'PLAYER' ? 'Victory! Enemy fleet defeated.' : 'Defeat! Your fleet has fallen.';
      } else if (effect.attacker === 'PLAYER') {
        this.phase = PHASE.PLAYER_TURN;
      } else {
        this.phase = PHASE.ENEMY_TURN;
        this.scheduleEnemyTurn(650);
      }
    } else if (effect.attacker === 'PLAYER') {
      this.addMiss(target, effect.row, effect.col);
      this.statusMessage = '[MISS] Your attack missed.';
      this.showTurnBanner('ENEMY', () => {
        this.phase = PHASE.ENEMY_TURN;
        this.statusMessage = 'Enemy Turn';
        this.scheduleEnemyTurn(250);
      });
    } else {
      this.addMiss(target, effect.row, effect.col);
      this.statusMessage = '[ENEMY MISS] The enemy attack missed.';
      this.showTurnBanner('PLAYER', () => {
        this.phase = PHASE.PLAYER_TURN;
        this.statusMessage = 'Your Turn — choose an enemy grid cell.';
      });
    }
  }
}

function drawGameBackdrop() {
  const sky = ctx.createLinearGradient(0, 0, 0, SCREEN_HEIGHT);
  sky.addColorStop(0, '#8be0f1');
  sky.addColorStop(.28, '#46b7dc');
  sky.addColorStop(.6, '#167aa0');
  sky.addColorStop(1, '#0a3e5d');
  ctx.fillStyle = sky;
  ctx.fillRect(VIEW_MIN_X, 0, VIEW_WIDTH, SCREEN_HEIGHT);

  ctx.fillStyle = 'rgba(255,255,255,.22)';
  for (let i = 0; i < 13; i += 1) {
    ctx.beginPath();
    ctx.arc(70 + i * 104, 145 + (i % 3) * 12, 34 + (i % 4) * 8, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.fillStyle = '#075a83';
  ctx.fillRect(VIEW_MIN_X, 595, VIEW_WIDTH, 155);
  ctx.strokeStyle = 'rgba(159,244,255,.34)';
  ctx.lineWidth = 2;
  for (let y = 615; y < SCREEN_HEIGHT; y += 22) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    for (let x = 0; x <= SCREEN_WIDTH; x += 60) ctx.quadraticCurveTo(x + 30, y - 7, x + 60, y);
    ctx.stroke();
  }
}

function drawFantasyHeader(status) {
  drawWoodPanel(645, 14, 630, 104, 18, '#57321d', '#e3b955');
  drawAssetContain(DRAGON_ICON, 708, 62, 68, 68, 0, 1);
  drawCentered('BATTLESHIP DRAGONS', 985, 57, 'bold 38px Trebuchet MS', '#fff0b4', '#743b12');
  drawCentered('DRAGON ISLAND SKIRMISH', 985, 81, 'bold 15px Trebuchet MS', '#bceeff', '#174268');
  drawWoodPanel(545, 95, 830, 34, 12, '#3f2a4e', '#d6b05e');
  drawCentered(status, 960, 119, 'bold 16px Trebuchet MS', '#fff7d2', '#2a1825');
}

function drawBoardFrame(board, title, color) {
  const x = board.xOffset - 17;
  const y = board.yOffset - 49;
  const w = GRID_SIZE * CELL_SIZE + 34;
  const h = GRID_SIZE * CELL_SIZE + 68;
  drawWoodPanel(x, y, w, h, 16, '#55351f', '#d9ae54');
  ctx.fillStyle = color;
  ctx.font = 'bold 18px Trebuchet MS';
  ctx.fillText(title, x + 18, y + 30);
  ctx.fillStyle = '#f6dc86';
  ctx.font = '13px Trebuchet MS';
  ctx.fillText(board.isPlayer ? 'DRAGON HARBOR' : 'UNKNOWN FLEET', x + 18, y + 47);
}

function drawBoard(board, revealShips) {
  ctx.fillStyle = '#0d3041';
  ctx.fillRect(board.xOffset, board.yOffset, GRID_SIZE * CELL_SIZE, GRID_SIZE * CELL_SIZE);

  for (let row = 0; row < GRID_SIZE; row += 1) {
    for (let col = 0; col < GRID_SIZE; col += 1) {
      drawWaterTile(board.xOffset + col * CELL_SIZE, board.yOffset + row * CELL_SIZE, row, col);
    }
  }

  if (revealShips) {
    for (const ship of board.ships) drawDragonWarship(board, ship, 0.9);
  } else if (board.isPlayer) {
    for (const ship of board.ships) drawDragonWarship(board, ship, 1);
  } else {
    for (const ship of board.ships) {
      if (ship.coords.every((coord) => coord.hit)) drawDragonWarship(board, ship, 0.9);
    }
  }

  for (let row = 0; row < GRID_SIZE; row += 1) {
    for (let col = 0; col < GRID_SIZE; col += 1) {
      const x = board.xOffset + col * CELL_SIZE;
      const y = board.yOffset + row * CELL_SIZE;
      const cell = board.grid[row][col];
      if (cell === 2 && !pendingMissCells.has(`${board.isPlayer ? 'player' : 'enemy'}:${row}:${col}`)) drawMiss(x, y);
      if (cell === 3) drawHitCell(x, y);
      ctx.strokeStyle = 'rgba(169, 233, 244, .45)';
      ctx.lineWidth = 1;
      ctx.strokeRect(x + .5, y + .5, CELL_SIZE, CELL_SIZE);
    }
  }
}

function drawWaterTile(x, y, row, col) {
  const tile = ctx.createLinearGradient(x, y, x, y + CELL_SIZE);
  tile.addColorStop(0, row % 2 ? '#31bdeb' : '#43c8ef');
  tile.addColorStop(1, row % 2 ? '#159bcf' : '#1da9d9');
  ctx.fillStyle = tile;
  ctx.fillRect(x, y, CELL_SIZE, CELL_SIZE);
  ctx.save();
  ctx.strokeStyle = 'rgba(196, 247, 255, .25)';
  ctx.lineWidth = 1.2;
  for (let waveRow = 0; waveRow < 3; waveRow += 1) {
    const waveY = y + 14 + waveRow * 21;
    ctx.beginPath();
    ctx.moveTo(x + 2, waveY);
    for (let segment = 0; segment < 3; segment += 1) {
      const startX = x + 2 + segment * 25 + (col % 2 ? 5 : 0);
      ctx.quadraticCurveTo(startX + 6, waveY - 5, startX + 12, waveY);
      ctx.quadraticCurveTo(startX + 18, waveY + 5, startX + 25, waveY);
    }
    ctx.stroke();
  }
  ctx.restore();
}

function removeShipBackground(image) {
  try {
    const cleaned = document.createElement('canvas');
    cleaned.width = image.naturalWidth;
    cleaned.height = image.naturalHeight;
    const cleanedCtx = cleaned.getContext('2d', { willReadFrequently: true });
    if (!cleanedCtx) return null;
    cleanedCtx.drawImage(image, 0, 0);
    const pixels = cleanedCtx.getImageData(0, 0, cleaned.width, cleaned.height);
    let minX = cleaned.width;
    let minY = cleaned.height;
    let maxX = -1;
    let maxY = -1;

    for (let index = 0; index < pixels.data.length; index += 4) {
      const red = pixels.data[index];
      const green = pixels.data[index + 1];
      const blue = pixels.data[index + 2];
      const x = (index / 4) % cleaned.width;
      const y = Math.floor(index / 4 / cleaned.width);
      if (red > 218 && green > 218 && blue > 218) {
        pixels.data[index + 3] = 0;
      } else {
        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        maxX = Math.max(maxX, x);
        maxY = Math.max(maxY, y);
      }
    }

    cleanedCtx.putImageData(pixels, 0, 0);
    if (maxX < minX || maxY < minY) return null;
    const padding = 8;
    const cropX = Math.max(0, minX - padding);
    const cropY = Math.max(0, minY - padding);
    const cropWidth = Math.min(cleaned.width - cropX, maxX - minX + 1 + padding * 2);
    const cropHeight = Math.min(cleaned.height - cropY, maxY - minY + 1 + padding * 2);
    const sprite = document.createElement('canvas');
    sprite.width = cropWidth;
    sprite.height = cropHeight;
    sprite.getContext('2d').drawImage(cleaned, cropX, cropY, cropWidth, cropHeight, 0, 0, cropWidth, cropHeight);
    return sprite;
  } catch (error) {
    console.warn('Ship texture could not be cleaned:', error);
    return null;
  }
}

function drawDragonWarship(board, ship, alpha = 1) {
  const conf = FLEET_BY_NAME[ship.name];
  const rows = ship.coords.map((c) => c.row);
  const cols = ship.coords.map((c) => c.col);
  const minRow = Math.min(...rows);
  const minCol = Math.min(...cols);
  const x = board.xOffset + minCol * CELL_SIZE;
  const y = board.yOffset + minRow * CELL_SIZE;
  const slotLength = ship.coords.length * CELL_SIZE - 6;
  const image = SHIP_ART[conf.element];
  ctx.save();
  ctx.globalAlpha = alpha;
  if (image?.naturalWidth) {
    const thickness = slotLength * (image.naturalWidth / image.naturalHeight);
    ctx.translate(
      ship.horizontal ? x + slotLength / 2 + 3 : x + CELL_SIZE / 2,
      ship.horizontal ? y + CELL_SIZE / 2 : y + slotLength / 2
    );
    if (ship.horizontal) ctx.rotate(Math.PI / 2);
    ctx.drawImage(image, -thickness / 2, -slotLength / 2, thickness, slotLength);
  } else {
    const thickness = Math.min(CELL_SIZE - 12, 58);
    ctx.translate(
      ship.horizontal ? x + slotLength / 2 + 3 : x + CELL_SIZE / 2,
      ship.horizontal ? y + CELL_SIZE / 2 : y + slotLength / 2
    );
    if (!ship.horizontal) ctx.rotate(-Math.PI / 2);
    drawTacticalShip(-slotLength / 2, -thickness / 2, slotLength, thickness, conf);
  }
  ctx.restore();
}

function drawTacticalShip(x, y, width, height, ship) {
  const hull = ctx.createLinearGradient(x, y, x, y + height);
  hull.addColorStop(0, ship.glow);
  hull.addColorStop(.25, ship.color);
  hull.addColorStop(.7, '#263746');
  hull.addColorStop(1, '#101b25');
  ctx.save();
  ctx.shadowColor = ship.color;
  ctx.shadowBlur = 10;
  ctx.beginPath();
  ctx.moveTo(x, y + height / 2);
  ctx.lineTo(x + width * .11, y + height * .13);
  ctx.lineTo(x + width * .78, y + height * .08);
  ctx.lineTo(x + width * .96, y + height * .3);
  ctx.lineTo(x + width, y + height / 2);
  ctx.lineTo(x + width * .96, y + height * .7);
  ctx.lineTo(x + width * .78, y + height * .92);
  ctx.lineTo(x + width * .11, y + height * .87);
  ctx.closePath();
  ctx.fillStyle = hull;
  ctx.fill();
  ctx.lineWidth = 2.4;
  ctx.strokeStyle = ship.glow;
  ctx.stroke();
  ctx.shadowBlur = 0;

  roundedRect(x + width * .16, y + height * .27, width * .57, height * .46, height * .14, '#233846', ship.color, 1.5);
  roundedRect(x + width * .42, y + height * .19, width * .18, height * .62, height * .1, '#16242f', ship.glow, 1.2);

  for (const ratio of [.28, .5, .72]) {
    const turretX = x + width * ratio;
    ctx.fillStyle = ship.color;
    ctx.beginPath();
    ctx.arc(turretX, y + height / 2, height * .14, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#ecf8ff';
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.strokeStyle = ship.glow;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(turretX + height * .08, y + height / 2);
    ctx.lineTo(turretX + height * .28, y + height / 2);
    ctx.stroke();
  }
  ctx.fillStyle = ship.glow;
  ctx.beginPath();
  ctx.moveTo(x + width * .9, y + height * .5);
  ctx.lineTo(x + width * .77, y + height * .28);
  ctx.lineTo(x + width * .77, y + height * .72);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function drawWarshipShape(x, y, w, h, ship) {
  const wood = ctx.createLinearGradient(x, y, x, y + h);
  wood.addColorStop(0, '#7a4d2a');
  wood.addColorStop(1, '#382014');
  ctx.save();
  ctx.shadowColor = ship.color;
  ctx.shadowBlur = 8;
  ctx.beginPath();
  ctx.moveTo(x + w * .04, y + h * .45);
  ctx.quadraticCurveTo(x + w * .38, y + h * .2, x + w * .79, y + h * .34);
  ctx.lineTo(x + w * .96, y + h * .47);
  ctx.lineTo(x + w * .82, y + h * .78);
  ctx.quadraticCurveTo(x + w * .4, y + h * .93, x + w * .06, y + h * .72);
  ctx.closePath();
  ctx.fillStyle = wood;
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = '#efc76a';
  ctx.stroke();
  ctx.restore();

  // Dragon prow
  ctx.beginPath();
  ctx.moveTo(x + w * .77, y + h * .47);
  ctx.quadraticCurveTo(x + w * .9, y + h * .04, x + w * .98, y + h * .3);
  ctx.lineTo(x + w * 1.03, y + h * .45);
  ctx.lineTo(x + w * .95, y + h * .58);
  ctx.lineTo(x + w * .8, y + h * .59);
  ctx.closePath();
  ctx.fillStyle = ship.color;
  ctx.fill();
  ctx.strokeStyle = '#f5d981';
  ctx.stroke();

  // sail / wing
  ctx.beginPath();
  ctx.moveTo(x + w * .37, y + h * .22);
  ctx.quadraticCurveTo(x + w * .55, y + h * .02, x + w * .64, y + h * .48);
  ctx.lineTo(x + w * .38, y + h * .49);
  ctx.closePath();
  ctx.fillStyle = ship.glow;
  ctx.globalAlpha = .85;
  ctx.fill();
  ctx.globalAlpha = 1;
  ctx.strokeStyle = ship.color;
  ctx.stroke();

  ctx.fillStyle = '#3b2313';
  ctx.fillRect(x + w * .38, y + h * .2, Math.max(2, w * .025), h * .58);

  // Element design differences
  if (ship.element === 'Fire') {
    for (let i = 0; i < 3; i += 1) drawFlame(x + w * (.5 + i * .09), y + h * .45, h * .42, ship.glow);
  } else if (ship.element === 'Water') {
    ctx.strokeStyle = ship.glow; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(x + w * .15, y + h * .68); ctx.quadraticCurveTo(x + w * .35, y + h * .9, x + w * .56, y + h * .67); ctx.stroke();
  } else if (ship.element === 'Plant') {
    drawLeaf(x + w * .3, y + h * .26, w * .16, h * .16, ship.glow);
    drawLeaf(x + w * .56, y + h * .25, w * .16, h * .16, ship.color);
  } else if (ship.element === 'Earth') {
    for (let i = 0; i < 4; i += 1) roundedRect(x + w * (.18 + i * .13), y + h * .65, Math.max(5, w * .09), Math.max(4, h * .15), 2, '#8d6b4b', '#efc77f', 1);
  } else if (ship.element === 'Wind') {
    ctx.strokeStyle = ship.glow; ctx.lineWidth = 1.6;
    ctx.beginPath(); ctx.arc(x + w * .5, y + h * .45, h * .2, Math.PI * .2, Math.PI * 1.6); ctx.stroke();
  }
}

function drawPlacementInfo(ship, horizontal) {
  drawWoodPanel(70, 960, 760, 76, 14, '#4d3020', '#d6ae58');
  ctx.font = 'bold 17px Trebuchet MS';
  ctx.fillStyle = ship.glow;
  ctx.fillText(`${ship.symbol} ${ship.element.toUpperCase()} DRAGON WARSHIP`, 90, 990);
  ctx.font = '15px Trebuchet MS';
  ctx.fillStyle = '#fff1c8';
  ctx.fillText(`${ship.name} • ${ship.length} tiles • Orientation: ${horizontal ? 'Horizontal' : 'Vertical'} • Press R to rotate`, 90, 1017);
}

function drawPlacementPreview(board, ship, horizontal) {
  const cell = board.getCellFromPos(mouse.x, mouse.y);
  if (!cell) return;
  const valid = board.canPlaceShip(cell.row, cell.col, ship.length, horizontal);
  const coords = [];
  for (let i = 0; i < ship.length; i += 1) coords.push({ row: horizontal ? cell.row : cell.row + i, col: horizontal ? cell.col + i : cell.col });
  if (coords.some((coord) => coord.row < 0 || coord.row >= GRID_SIZE || coord.col < 0 || coord.col >= GRID_SIZE)) return;
  drawDragonWarship(board, { name: ship.name, coords, horizontal }, valid ? .45 : .18);
  for (const coord of coords) {
    const x = board.xOffset + coord.col * CELL_SIZE;
    const y = board.yOffset + coord.row * CELL_SIZE;
    ctx.strokeStyle = valid ? '#a8ff8a' : '#ff7665';
    ctx.lineWidth = 2;
    ctx.strokeRect(x + 4, y + 4, CELL_SIZE - 8, CELL_SIZE - 8);
  }
}

function drawPlacementTutorial(board) {
  const target = getCellCenter(board, 4, 4);
  const bob = Math.sin(performance.now() / 260) * 7;
  const pulse = .76 + Math.sin(performance.now() / 220) * .14;
  ctx.save();
  ctx.strokeStyle = `rgba(224, 252, 255, ${pulse})`;
  ctx.lineWidth = 3;
  for (let ring = 0; ring < 2; ring += 1) {
    ctx.beginPath();
    ctx.ellipse(target.x, target.y + 18, 18 + ring * 10, 7 + ring * 4, 0, 0, Math.PI * 2);
    ctx.stroke();
  }

  ctx.translate(target.x, target.y - 58 + bob);
  ctx.fillStyle = '#f8ffff';
  ctx.strokeStyle = '#5d9eb5';
  ctx.lineWidth = 2;
  roundedRect(-10, -22, 20, 47, 10, '#f8ffff', '#5d9eb5', 2);
  ctx.beginPath();
  ctx.arc(0, 25, 14, Math.PI * .05, Math.PI * .95);
  ctx.fill();
  ctx.stroke();
  roundedRect(-5, -57, 10, 40, 5, '#f8ffff', '#5d9eb5', 2);
  ctx.restore();

  drawCentered('PLACE YOUR FIRST DRAGON SHIP', target.x, target.y - 96, 'bold 15px Trebuchet MS', '#efffff', '#174268');
}

function drawEnemyHover(board) {
  const cell = board.getCellFromPos(mouse.x, mouse.y);
  if (!cell || ![0, 1].includes(board.grid[cell.row][cell.col])) return;
  drawAssetContain(ANIMATION_ASSETS.scope, board.xOffset + cell.col * CELL_SIZE + CELL_SIZE / 2, board.yOffset + cell.row * CELL_SIZE + CELL_SIZE / 2, CELL_SIZE * .94, CELL_SIZE * .94, 0, .9);
  ctx.strokeStyle = '#ffe373';
  ctx.lineWidth = 3;
  ctx.strokeRect(board.xOffset + cell.col * CELL_SIZE + 3, board.yOffset + cell.row * CELL_SIZE + 3, CELL_SIZE - 6, CELL_SIZE - 6);
}

function drawTargetLock(effect, progress) {
  const blink = .3 + Math.abs(Math.sin(progress * Math.PI * 7)) * .7;
  drawAssetContain(ANIMATION_ASSETS.scope, effect.x, effect.y, CELL_SIZE * .92, CELL_SIZE * .92, progress * .25, blink);
  ctx.save();
  ctx.strokeStyle = `rgba(255, 233, 105, ${blink})`;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(effect.x, effect.y, CELL_SIZE * (.26 + progress * .08), 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}

function drawMiss(x, y) {
  const inset = 3;
  const size = CELL_SIZE - inset * 2;
  const water = ctx.createLinearGradient(x, y, x, y + CELL_SIZE);
  water.addColorStop(0, '#9af07c');
  water.addColorStop(.5, '#4dcd66');
  water.addColorStop(1, '#239a52');
  roundedRect(x + inset, y + inset, size, size, 7, water, '#baff9f', 1.2);
}

function drawMissSplash(effect, progress) {
  const alpha = 1 - progress;
  ctx.save();
  if (isImageReady(ANIMATION_ASSETS.miss)) {
    const splashAlpha = Math.sin(progress * Math.PI) * .92;
    const width = CELL_SIZE * (.54 + progress * .66);
    drawAssetContain(ANIMATION_ASSETS.miss, effect.x, effect.y + 2, width, width * .76, 0, splashAlpha);
  }

  ctx.strokeStyle = `rgba(199, 247, 255, ${alpha})`;
  ctx.fillStyle = `rgba(226, 253, 255, ${alpha})`;
  ctx.lineWidth = 2;

  for (const delay of [0, .12, .25]) {
    const waveProgress = Math.max(0, Math.min(1, (progress - delay) / (1 - delay)));
    const ring = 8 + waveProgress * CELL_SIZE * .48;
    ctx.beginPath();
    ctx.ellipse(effect.x, effect.y + 8, ring, ring * .3, 0, 0, Math.PI * 2);
    ctx.stroke();
  }

  if (progress < .72) {
    const t = progress / .72;
    for (let index = 0; index < 11; index += 1) {
      const angle = (Math.PI * 2 * index) / 11 + .22;
      const speed = 18 + (index % 4) * 5;
      const distance = speed * t;
      const lift = (18 + (index % 3) * 8) * t - 30 * t * t;
      const x = effect.x + Math.cos(angle) * distance;
      const y = effect.y + 7 + Math.sin(angle) * distance * .35 - lift;
      ctx.beginPath();
      ctx.arc(x, y, 1.4 + (index % 3) * .45, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.restore();
}

function drawHitCell(x, y) {
  roundedRect(x + 4, y + 4, CELL_SIZE - 8, CELL_SIZE - 8, 7, 'rgba(92, 29, 22, .72)', '#ffb14e', 1.5);
}

function drawElementProjectile(effect, progress) {
  const image = effect.attacker === 'PLAYER' ? ANIMATION_ASSETS.playerTorpedo : ANIMATION_ASSETS.enemyTorpedo;
  const eased = progress * progress;
  const x = effect.to.x;
  const y = lerp(-105, effect.to.y, eased);
  if (isImageReady(image)) {
    drawAssetContain(image, x, y, 46, 60, Math.PI * .72, 1);
    return;
  }
  const prevProgress = Math.max(0, progress - .08);
  const prevEased = prevProgress * prevProgress;
  const px = effect.to.x;
  const py = lerp(-105, effect.to.y, prevEased);
  const ship = effect.ship;
  ctx.save();
  ctx.strokeStyle = hexToRgba(ship.color, .42);
  ctx.lineWidth = 5;
  ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(x, y); ctx.stroke();

  if (ship.element === 'Fire') {
    const g = ctx.createRadialGradient(x, y, 1, x, y, 13); g.addColorStop(0, '#fff3b1'); g.addColorStop(.45, ship.glow); g.addColorStop(1, ship.color); ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, 10, 0, Math.PI * 2); ctx.fill(); drawFlame(x - 2, y + 8, 10, ship.glow);
  } else if (ship.element === 'Water') {
    ctx.fillStyle = ship.color; ctx.beginPath(); ctx.moveTo(x, y - 12); ctx.quadraticCurveTo(x + 9, y - 2, x, y + 12); ctx.quadraticCurveTo(x - 9, y - 2, x, y - 12); ctx.fill();
  } else if (ship.element === 'Plant') {
    ctx.translate(x, y); ctx.rotate(progress * 12); ctx.fillStyle = ship.color; ctx.beginPath(); ctx.moveTo(0, -11); ctx.lineTo(9, 0); ctx.lineTo(0, 11); ctx.lineTo(-9, 0); ctx.closePath(); ctx.fill(); ctx.strokeStyle = ship.glow; ctx.stroke();
  } else if (ship.element === 'Earth') {
    ctx.fillStyle = '#8d6b4b'; ctx.beginPath(); ctx.moveTo(x - 9, y - 6); ctx.lineTo(x + 2, y - 11); ctx.lineTo(x + 11, y - 2); ctx.lineTo(x + 6, y + 10); ctx.lineTo(x - 7, y + 8); ctx.closePath(); ctx.fill(); ctx.strokeStyle = ship.glow; ctx.stroke();
  } else {
    ctx.strokeStyle = ship.glow; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(x, y, 10, progress * 5, progress * 5 + Math.PI * 1.4); ctx.stroke(); ctx.beginPath(); ctx.arc(x, y, 5, -progress * 5, -progress * 5 + Math.PI * 1.2); ctx.stroke();
  }
  ctx.restore();
}

function drawTorpedoLaunch(effect, progress) {
  const alpha = 1 - progress;
  const color = effect.attacker === 'PLAYER' ? '#74eaff' : '#ff9a63';
  const forwardX = Math.cos(effect.angle);
  const forwardY = Math.sin(effect.angle);
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';

  const glow = ctx.createRadialGradient(effect.x, effect.y, 2, effect.x, effect.y, 34 + progress * 18);
  glow.addColorStop(0, `rgba(255, 250, 180, ${alpha})`);
  glow.addColorStop(.45, hexToRgba(color, alpha * .8));
  glow.addColorStop(1, 'rgba(255, 160, 55, 0)');
  ctx.fillStyle = glow;
  ctx.beginPath();
  ctx.arc(effect.x, effect.y, 34 + progress * 18, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = `rgba(255, 235, 112, ${alpha})`;
  ctx.lineWidth = 2.4;
  for (let ring = 0; ring < 3; ring += 1) {
    const radius = 9 + ring * 8 + progress * 22;
    ctx.beginPath();
    ctx.arc(effect.x, effect.y, radius, effect.angle - .58, effect.angle + .58);
    ctx.stroke();
  }

  ctx.fillStyle = `rgba(255, 244, 145, ${alpha})`;
  for (let spark = 0; spark < 11; spark += 1) {
    const spread = (spark - 5) * .13;
    const distance = 14 + progress * (30 + (spark % 3) * 10);
    const x = effect.x + Math.cos(effect.angle + spread) * distance + forwardX * progress * 16;
    const y = effect.y + Math.sin(effect.angle + spread) * distance + forwardY * progress * 16;
    ctx.beginPath();
    ctx.arc(x, y, spark % 2 ? 2.3 : 3.2, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

function drawTorpedoDropTrail(x, y, progress, attacker) {
  const color = attacker === 'PLAYER' ? '#63d8ff' : '#ff7c5c';
  ctx.save();
  ctx.strokeStyle = hexToRgba(color, .18 + progress * .3);
  ctx.lineWidth = 5;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(x, Math.max(-60, y - 95));
  ctx.lineTo(x, y - 18);
  ctx.stroke();
  if (progress > .8) {
    const ring = 7 + (progress - .8) * 80;
    ctx.strokeStyle = hexToRgba(color, 1 - progress);
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.ellipse(x, y + 12, ring * 1.5, ring * .42, 0, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.restore();
}

function drawImpactEnergy(effect, progress) {
  const alpha = 1 - progress;
  const radius = 8 + progress * 27;
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  const g = ctx.createRadialGradient(effect.x, effect.y, 1, effect.x, effect.y, radius);
  g.addColorStop(0, `rgba(255,255,205,${alpha})`);
  g.addColorStop(.32, `rgba(255,191,53,${alpha * .92})`);
  g.addColorStop(.7, `rgba(255,91,25,${alpha * .55})`);
  g.addColorStop(1, 'rgba(255,70,0,0)');
  ctx.fillStyle = g;
  ctx.beginPath(); ctx.arc(effect.x, effect.y, radius, 0, Math.PI * 2); ctx.fill();

  ctx.strokeStyle = `rgba(255,230,105,${alpha})`;
  ctx.lineWidth = 2;
  ctx.beginPath(); ctx.arc(effect.x, effect.y, 8 + progress * 22, 0, Math.PI * 2); ctx.stroke();
  for (let spark = 0; spark < 14; spark += 1) {
    const angle = spark * (Math.PI * 2 / 14) + .2;
    const distance = 8 + progress * (18 + (spark % 3) * 7);
    const size = (spark % 3 === 0 ? 3.2 : 2) * (1 - progress * .45);
    ctx.fillStyle = spark % 2 ? `rgba(255,216,80,${alpha})` : `rgba(255,126,35,${alpha})`;
    ctx.beginPath();
    ctx.arc(effect.x + Math.cos(angle) * distance, effect.y + Math.sin(angle) * distance, size, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

function drawExplosionAsset(effect, progress) {
  const image = ANIMATION_ASSETS.explosion;
  const eased = 1 - Math.pow(1 - progress, 3);
  const fade = progress < .72 ? 1 : (1 - progress) / .28;
  if (isImageReady(image)) {
    const size = CELL_SIZE * (.42 + eased * .53);
    drawAssetContain(image, effect.x, effect.y, size, size, progress * .12, fade);
    return;
  }
  drawImpactEnergy({ ...effect, duration: 1 }, Math.min(1, progress * 1.35));
}

function drawFlameEffect(effect) {
  if (isImageReady(ANIMATION_ASSETS.flame)) {
    const pulse = 1 + Math.sin(performance.now() / 150) * .06;
    drawAssetContain(ANIMATION_ASSETS.flame, effect.x, effect.y + 4, CELL_SIZE * .72 * pulse, CELL_SIZE * .84 * pulse, 0, .94);
    return;
  }
  ctx.save();
  const flicker = .82 + Math.sin(performance.now() / 120) * .18;
  const glow = ctx.createRadialGradient(effect.x, effect.y, 2, effect.x, effect.y, CELL_SIZE * .45);
  glow.addColorStop(0, `rgba(255, 214, 72, ${.42 * flicker})`);
  glow.addColorStop(.55, `rgba(255, 81, 25, ${.28 * flicker})`);
  glow.addColorStop(1, 'rgba(255, 60, 10, 0)');
  ctx.fillStyle = glow;
  ctx.beginPath();
  ctx.arc(effect.x, effect.y, CELL_SIZE * .45, 0, Math.PI * 2);
  ctx.fill();

  for (let marker = 0; marker < 3; marker += 1) {
    const x = effect.x + (marker - 1) * 16;
    const y = effect.y + (marker % 2 ? 4 : -4);
    const radius = (6 + (marker === 1 ? 1 : 0)) * flicker;
    ctx.fillStyle = '#ffbf25';
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#fff3a5';
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.strokeStyle = '#ffe465';
    ctx.lineWidth = 2;
    for (let ray = 0; ray < 8; ray += 1) {
      const angle = ray * Math.PI / 4 + performance.now() / 900;
      ctx.beginPath();
      ctx.moveTo(x + Math.cos(angle) * (radius + 2), y + Math.sin(angle) * (radius + 2));
      ctx.lineTo(x + Math.cos(angle) * (radius + 7), y + Math.sin(angle) * (radius + 7));
      ctx.stroke();
    }
  }
  ctx.fillStyle = '#fff6b0';
  for (let ember = 0; ember < 4; ember += 1) {
    const angle = performance.now() / 650 + ember * 1.57;
    const distance = 18 + ember * 2;
    ctx.beginPath();
    ctx.arc(effect.x + Math.cos(angle) * distance, effect.y + Math.sin(angle) * distance * .5, 1.5, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

function isImageReady(image) { return image?.complete && image.naturalWidth > 0; }

function drawAssetContain(image, centerX, centerY, maxWidth, maxHeight, rotation = 0, alpha = 1) {
  if (!isImageReady(image)) return;
  const scale = Math.min(maxWidth / image.naturalWidth, maxHeight / image.naturalHeight);
  const width = image.naturalWidth * scale;
  const height = image.naturalHeight * scale;
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.translate(centerX, centerY);
  ctx.rotate(rotation);
  ctx.drawImage(image, -width / 2, -height / 2, width, height);
  ctx.restore();
}

function drawTurnBanner(banner) {
  const bannerImage = banner.side === 'PLAYER' ? ANIMATION_ASSETS.playerTurn : ANIMATION_ASSETS.enemyTurn;
  if (isImageReady(bannerImage)) {
    const alpha = Math.sin(Math.min(1, (performance.now() - banner.start) / banner.duration) * Math.PI);
    drawAssetContain(bannerImage, SCREEN_WIDTH / 2, 430, 440, 126, 0, alpha);
    return;
  }
  const t = Math.min(1, (performance.now() - banner.start) / 170);
  const alpha = Math.sin(Math.min(1, (performance.now() - banner.start) / banner.duration) * Math.PI);
  const isPlayer = banner.side === 'PLAYER';
  const color = isPlayer ? '#70d7ff' : '#ff7c58';
  ctx.save();
  ctx.globalAlpha = alpha;
  drawWoodPanel(730, 430 - (1 - t) * 16, 460, 132, 18, isPlayer ? '#284e68' : '#6a3428', color);
  drawCentered(isPlayer ? 'YOUR TURN' : 'ENEMY TURN', 960, 489, 'bold 36px Trebuchet MS', '#fff4cc', '#482312');
  drawCentered(isPlayer ? 'Choose a target on Enemy Waters' : 'The enemy fleet is preparing a volley', 960, 523, 'bold 16px Trebuchet MS', color, '#201510');
  ctx.restore();
}

function drawFinalResult(winner, restartRect, exitRect, point) {
  ctx.fillStyle = 'rgba(5,13,20,.66)';
  ctx.fillRect(0, 0, SCREEN_WIDTH, SCREEN_HEIGHT);
  const won = winner === 'PLAYER';
  drawWoodPanel(685, 210, 550, 540, 22, won ? '#365a43' : '#6a322d', won ? '#a7f26a' : '#ff9774');
  drawCentered(won ? 'YOU WIN!' : 'ENEMY WIN!', 960, 320, 'bold 54px Trebuchet MS', won ? '#e8ffb9' : '#ffd0bf', '#382014');
  drawCentered(won ? 'All enemy dragon warships have been destroyed.' : 'Your dragon fleet has been defeated.', 960, 367, 'bold 18px Trebuchet MS', '#fff2cc', '#382014');
  drawCentered('Choose an option below.', 960, 402, '15px Trebuchet MS', '#f4dfb6', '#382014');

  const restartHovered = contains(restartRect, point.x, point.y);
  roundedRect(restartRect.x, restartRect.y, restartRect.w, restartRect.h, 12, restartHovered ? '#ffc84a' : '#da8618', '#fff0a7', 3);
  drawCentered('PLAY AGAIN', restartRect.x + restartRect.w / 2, restartRect.y + 37, 'bold 24px Trebuchet MS', '#fffdf0', '#753a0e');

  const exitHovered = contains(exitRect, point.x, point.y);
  roundedRect(exitRect.x, exitRect.y, exitRect.w, exitRect.h, 12, exitHovered ? '#f07b55' : '#a9442b', '#ffd0af', 3);
  drawCentered('EXIT', exitRect.x + exitRect.w / 2, exitRect.y + 37, 'bold 24px Trebuchet MS', '#fffdf0', '#5e2317');
}

function drawFleetLoadout(currentIndex) {
  drawWoodPanel(1030, 960, 690, 87, 15, '#3f2a4e', '#cda85b');
  ctx.font = 'bold 15px Trebuchet MS'; ctx.fillStyle = '#fff2ba'; ctx.fillText('DRAGON FLEET LOADOUT', 1050, 985);
  FLEET.forEach((ship, index) => {
    const col = index < 3 ? index : index - 3;
    const row = index < 3 ? 0 : 1;
    const x = 1050 + col * 210;
    const y = 995 + row * 27;
    const active = currentIndex === index;
    roundedRect(x, y, 195, 22, 6, active ? hexToRgba(ship.color, .33) : 'rgba(255,255,255,.08)', ship.color, 1);
    ctx.fillStyle = '#fff0cb'; ctx.font = '12px Trebuchet MS'; ctx.fillText(`${ship.symbol} ${ship.element} • ${ship.length}`, x + 7, y + 15);
  });
}

function drawWoodPanel(x, y, width, height, radius, fill, stroke) {
  roundedRect(x, y, width, height, radius, fill, stroke, 3);
  ctx.strokeStyle = 'rgba(255,241,179,.35)';
  ctx.lineWidth = 1;
  ctx.strokeRect(x + 6, y + 6, width - 12, height - 12);
}

function drawCentered(text, x, y, font, color, shadow = null) {
  ctx.save();
  ctx.font = font;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  if (shadow) { ctx.shadowColor = shadow; ctx.shadowBlur = 0; ctx.shadowOffsetY = 2; }
  ctx.fillStyle = color;
  ctx.fillText(text, x, y);
  ctx.restore();
}

function drawFlame(x, y, size, color) {
  ctx.save();
  ctx.translate(x, y);
  const g = ctx.createLinearGradient(0, 0, 0, -size * 1.8);
  g.addColorStop(0, '#ff4b20'); g.addColorStop(.5, color); g.addColorStop(1, 'rgba(255,245,185,0)');
  ctx.fillStyle = g;
  ctx.beginPath(); ctx.moveTo(0, 0); ctx.quadraticCurveTo(size * .65, -size * .55, 0, -size * 1.8); ctx.quadraticCurveTo(-size * .65, -size * .55, 0, 0); ctx.fill();
  ctx.restore();
}

function drawLeaf(x, y, width, height, color) {
  ctx.save(); ctx.translate(x, y); ctx.fillStyle = color; ctx.beginPath(); ctx.moveTo(0, 0); ctx.quadraticCurveTo(width * .65, -height, width, 0); ctx.quadraticCurveTo(width * .65, height, 0, 0); ctx.fill(); ctx.restore();
}

function roundedRect(x, y, width, height, radius, fill = null, stroke = null, lineWidth = 1) {
  ctx.beginPath();
  ctx.roundRect(x, y, width, height, radius);
  if (fill) { ctx.fillStyle = fill; ctx.fill(); }
  if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = lineWidth; ctx.stroke(); }
}

function getCellCenter(board, row, col) {
  return { x: board.xOffset + col * CELL_SIZE + CELL_SIZE / 2, y: board.yOffset + row * CELL_SIZE + CELL_SIZE / 2 };
}

function getShipCenter(board, conf) {
  const ship = board.ships.find((candidate) => candidate.name === conf.name && candidate.coords.some((coord) => !coord.hit)) || board.ships[0];
  if (!ship) return { x: board.xOffset + 210, y: board.yOffset + 210 };
  const row = ship.coords.reduce((sum, coord) => sum + coord.row, 0) / ship.coords.length;
  const col = ship.coords.reduce((sum, coord) => sum + coord.col, 0) / ship.coords.length;
  return getCellCenter(board, row, col);
}

function contains(rect, x, y) { return x >= rect.x && x <= rect.x + rect.w && y >= rect.y && y <= rect.y + rect.h; }
function randomInt(max) { return Math.floor(Math.random() * max); }
function lerp(a, b, t) { return a + (b - a) * t; }
function hexToRgba(hex, alpha) {
  const value = hex.replace('#', '');
  const number = parseInt(value.length === 3 ? value.split('').map((char) => char + char).join('') : value, 16);
  return `rgba(${(number >> 16) & 255}, ${(number >> 8) & 255}, ${number & 255}, ${alpha})`;
}

function loadSettings() {
  try {
    return { effects: true, contrast: false, sound: true, music: true, ...JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}') };
  } catch {
    return { effects: true, contrast: false, sound: true, music: true };
  }
}

function applySettings() {
  dom.soundToggle.checked = settings.sound;
  dom.musicToggle.checked = settings.music;
  dom.audioStatus.textContent = 'Sound settings are saved and ready for audio files to be added later.';
  if (dom.pauseSoundBtn) dom.pauseSoundBtn.textContent = `SOUND: ${settings.sound ? 'ON' : 'OFF'}`;
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
}

let gamePaused = false;
let pauseStartedAt = 0;
function showDialog(dialog) { if (typeof dialog.showModal === 'function') dialog.showModal(); }
function closeDialogs() { document.querySelectorAll('dialog[open]').forEach((dialog) => dialog.close()); }
function showGame() { gamePaused = false; dom.mainMenu.classList.add('hidden'); dom.gameScreen.classList.remove('hidden'); closeDialogs(); game.reset(); }
function showMenu() { gamePaused = false; game.clearTimers(); dom.gameScreen.classList.add('hidden'); dom.mainMenu.classList.remove('hidden'); closeDialogs(); }
function quitGame() {
  window.close();
  window.setTimeout(() => {
    if (!window.closed) showDialog(dom.exitDialog);
  }, 200);
}

const game = new Game();

function pauseGame() {
  if (gamePaused) return;
  gamePaused = true;
  pauseStartedAt = performance.now();
  game.clearTimers();
  showDialog(dom.pauseDialog);
}

function resumeGame() {
  if (!gamePaused) return;
  const pausedFor = performance.now() - pauseStartedAt;
  game.effects.forEach((effect) => { effect.start += pausedFor; });
  if (game.turnBanner) {
    const side = game.turnBanner.side;
    game.turnBanner = null;
    game.phase = side === 'PLAYER' ? PHASE.PLAYER_TURN : PHASE.ENEMY_TURN;
  }
  gamePaused = false;
  if (game.phase === PHASE.ENEMY_TURN) game.scheduleEnemyTurn(250);
}

canvas.addEventListener('mousemove', (event) => {
  const rect = canvas.getBoundingClientRect();
  const canvasX = (event.clientX - rect.left) * (CANVAS_WIDTH / rect.width);
  const canvasY = (event.clientY - rect.top) * (CANVAS_HEIGHT / rect.height);
  mouse.x = (canvasX - VIEW_OFFSET_X) / VIEW_SCALE;
  mouse.y = canvasY / VIEW_SCALE;
});
canvas.addEventListener('mouseleave', () => { mouse = { x: -1, y: -1 }; });
canvas.addEventListener('click', () => game.handleClick(mouse.x, mouse.y));
window.addEventListener('keydown', (event) => {
  if (!gamePaused && event.key.toLowerCase() === 'r') { event.preventDefault(); game.toggleRotation(); }
});

dom.startGameBtn.addEventListener('click', showGame);
dom.howToPlayBtn.addEventListener('click', () => showDialog(dom.howToPlayDialog));
dom.settingsBtn.addEventListener('click', () => showDialog(dom.settingsDialog));
dom.exitBtn.addEventListener('click', quitGame);
dom.returnToMenuBtn.addEventListener('click', showMenu);
dom.shuffleBtn.addEventListener('click', () => game.shuffleFleet());
dom.pauseBtn.addEventListener('click', pauseGame);
dom.restartGameBtn.addEventListener('click', () => { game.reset(); gamePaused = false; dom.pauseDialog.close(); });
dom.pauseSoundBtn.addEventListener('click', () => { settings.sound = !settings.sound; settings.music = settings.sound; applySettings(); });
dom.pauseExitBtn.addEventListener('click', showMenu);
dom.pauseDialog.addEventListener('cancel', (event) => { event.preventDefault(); resumeGame(); dom.pauseDialog.close(); });
dom.pauseDialog.addEventListener('click', (event) => {
  if (event.target === dom.pauseDialog) { resumeGame(); dom.pauseDialog.close(); }
});
document.querySelectorAll('[data-close-dialog]').forEach((button) => button.addEventListener('click', () => button.closest('dialog')?.close()));

dom.soundToggle.addEventListener('change', () => { settings.sound = dom.soundToggle.checked; applySettings(); });
dom.musicToggle.addEventListener('change', () => { settings.music = dom.musicToggle.checked; applySettings(); });

applySettings();
(function loop() { if (!gamePaused) game.draw(); requestAnimationFrame(loop); })();

// Clean-build readiness marker: helps distinguish a loaded build from a stale cached one.
document.documentElement.dataset.battleshipBuild = 'clean-fixed-20260618';
