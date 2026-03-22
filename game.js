/* ============================================
   DRAGON'S GAMBIT — GAME ENGINE
   Full Checkers Logic with Fire vs Ice
   ============================================ */

// ---- CONSTANTS ----
const EMPTY = 0;
const FIRE = 1;       // Player 1 — fire (top of board, moves down)
const ICE = 2;        // Player 2 — ice (bottom of board, moves up)
const FIRE_KING = 3;
const ICE_KING = 4;

// ---- STATE ----
let board = [];
let currentPlayer = FIRE;
let selectedPiece = null;    // { row, col }
let validMoves = [];         // [{ row, col, jumps: [{row,col}] }]
let moveHistory = [];
let fireName = 'Emberclaw';
let iceName = 'Frostfang';
let gameOver = false;
let mustJumpPieces = [];     // pieces that must jump this turn
let multiJumpPiece = null;   // piece currently in a multi-jump chain

// ---- INITIALIZATION ----
function initBoard() {
    board = Array.from({ length: 8 }, () => Array(8).fill(EMPTY));
    // Fire pieces (top 3 rows)
    for (let r = 0; r < 3; r++) {
        for (let c = 0; c < 8; c++) {
            if ((r + c) % 2 === 1) board[r][c] = FIRE;
        }
    }
    // Ice pieces (bottom 3 rows)
    for (let r = 5; r < 8; r++) {
        for (let c = 0; c < 8; c++) {
            if ((r + c) % 2 === 1) board[r][c] = ICE;
        }
    }
}

function startGame() {
    const fireInput = document.getElementById('fire-name').value.trim();
    const iceInput = document.getElementById('ice-name').value.trim();
    fireName = fireInput || 'Emberclaw';
    iceName = iceInput || 'Frostfang';

    document.getElementById('fire-player-name').textContent = fireName;
    document.getElementById('ice-player-name').textContent = iceName;

    initBoard();
    const firstTurnValue = document.querySelector('input[name="first-turn"]:checked')?.value || 'fire';
    if (firstTurnValue === 'random') {
        currentPlayer = Math.random() < 0.5 ? FIRE : ICE;
    } else {
        currentPlayer = firstTurnValue === 'ice' ? ICE : FIRE;
    }
    selectedPiece = null;
    validMoves = [];
    moveHistory = [];
    gameOver = false;
    multiJumpPiece = null;

    document.getElementById('splash-screen').classList.remove('active');
    document.getElementById('game-screen').classList.add('active');

    findMustJumps();
    renderBoard();
    updateUI();
}

function resetGame() {
    stopBreathEffect();
    document.getElementById('victory-modal').classList.remove('active');
    const dragonEl = document.getElementById('victory-dragon');
    if (dragonEl) dragonEl.className = 'victory-dragon';
    initBoard();
    currentPlayer = FIRE;
    selectedPiece = null;
    validMoves = [];
    moveHistory = [];
    gameOver = false;
    multiJumpPiece = null;

    findMustJumps();
    renderBoard();
    updateUI();
}

function backToSplash() {
    document.getElementById('victory-modal').classList.remove('active');
    document.getElementById('game-screen').classList.remove('active');
    document.getElementById('splash-screen').classList.add('active');
}

// ---- HELPERS ----
function isFire(piece) { return piece === FIRE || piece === FIRE_KING; }
function isIce(piece) { return piece === ICE || piece === ICE_KING; }
function isKing(piece) { return piece === FIRE_KING || piece === ICE_KING; }
function isCurrentPlayer(piece) {
    return (currentPlayer === FIRE && isFire(piece)) || (currentPlayer === ICE && isIce(piece));
}
function isOpponent(piece) {
    return (currentPlayer === FIRE && isIce(piece)) || (currentPlayer === ICE && isFire(piece));
}

function countPieces(player) {
    let count = 0;
    for (let r = 0; r < 8; r++)
        for (let c = 0; c < 8; c++)
            if ((player === FIRE && isFire(board[r][c])) || (player === ICE && isIce(board[r][c])))
                count++;
    return count;
}

// ---- MOVE COMPUTATION ----
function getDirections(piece) {
    if (piece === FIRE) return [{ dr: 1, dc: -1 }, { dr: 1, dc: 1 }];
    if (piece === ICE) return [{ dr: -1, dc: -1 }, { dr: -1, dc: 1 }];
    // Kings go all 4 directions
    return [{ dr: 1, dc: -1 }, { dr: 1, dc: 1 }, { dr: -1, dc: -1 }, { dr: -1, dc: 1 }];
}

function getJumpsForPiece(r, c, boardState) {
    const piece = boardState[r][c];
    const dirs = getDirections(piece);
    const jumps = [];

    for (const { dr, dc } of dirs) {
        const mr = r + dr, mc = c + dc;       // middle (opponent)
        const lr = r + 2 * dr, lc = c + 2 * dc; // landing

        if (lr >= 0 && lr < 8 && lc >= 0 && lc < 8 &&
            isOpponentPiece(boardState[mr][mc], piece) &&
            boardState[lr][lc] === EMPTY) {
            jumps.push({ row: lr, col: lc, capturedRow: mr, capturedCol: mc });
        }
    }
    return jumps;
}

function isOpponentPiece(target, mover) {
    if (isFire(mover) && isIce(target)) return true;
    if (isIce(mover) && isFire(target)) return true;
    return false;
}

function getSimpleMovesForPiece(r, c) {
    const piece = board[r][c];
    const dirs = getDirections(piece);
    const moves = [];

    for (const { dr, dc } of dirs) {
        const nr = r + dr, nc = c + dc;
        if (nr >= 0 && nr < 8 && nc >= 0 && nc < 8 && board[nr][nc] === EMPTY) {
            moves.push({ row: nr, col: nc, jumps: [] });
        }
    }
    return moves;
}

function findMustJumps() {
    mustJumpPieces = [];
    for (let r = 0; r < 8; r++) {
        for (let c = 0; c < 8; c++) {
            if (isCurrentPlayer(board[r][c])) {
                const jumps = getJumpsForPiece(r, c, board);
                if (jumps.length > 0) {
                    mustJumpPieces.push({ row: r, col: c });
                }
            }
        }
    }
}

function getMovesForPiece(r, c) {
    if (gameOver) return [];
    const piece = board[r][c];
    if (!isCurrentPlayer(piece)) return [];

    // If there's a multi-jump in progress and this isn't that piece, no moves
    if (multiJumpPiece && (multiJumpPiece.row !== r || multiJumpPiece.col !== c)) return [];

    const jumps = getJumpsForPiece(r, c, board);

    // Must jump: if any piece can jump, only jump moves are allowed
    if (mustJumpPieces.length > 0 || multiJumpPiece) {
        // If this piece has jumps, return them; otherwise empty
        return jumps.map(j => ({
            row: j.row, col: j.col,
            jumps: [{ row: j.capturedRow, col: j.capturedCol }]
        }));
    }

    // No jumps available for anyone — return simple moves
    return getSimpleMovesForPiece(r, c);
}

// ---- BOARD RENDERING ----
function renderBoard() {
    const boardEl = document.getElementById('board');
    boardEl.innerHTML = '';

    for (let r = 0; r < 8; r++) {
        for (let c = 0; c < 8; c++) {
            const cell = document.createElement('div');
            cell.className = 'cell ' + ((r + c) % 2 === 0 ? 'light' : 'dark');
            cell.dataset.row = r;
            cell.dataset.col = c;

            // Mark valid move cells
            const moveInfo = validMoves.find(m => m.row === r && m.col === c);
            if (moveInfo) {
                cell.classList.add(moveInfo.jumps.length > 0 ? 'valid-jump' : 'valid-move');
                cell.addEventListener('click', () => movePiece(r, c));
            }

            // Piece
            const piece = board[r][c];
            if (piece !== EMPTY) {
                const pieceEl = document.createElement('div');
                pieceEl.className = 'piece';
                if (isFire(piece)) pieceEl.classList.add('fire');
                if (isIce(piece)) pieceEl.classList.add('ice');
                if (isKing(piece)) pieceEl.classList.add('king');
                if (selectedPiece && selectedPiece.row === r && selectedPiece.col === c) {
                    pieceEl.classList.add('selected');
                }

                // Highlight must-jump pieces subtly
                if (mustJumpPieces.some(p => p.row === r && p.col === c) && !selectedPiece) {
                    pieceEl.style.animation = 'pulseGlow 1s ease-in-out infinite';
                }

                pieceEl.addEventListener('click', (e) => {
                    e.stopPropagation();
                    selectPiece(r, c);
                });
                cell.appendChild(pieceEl);
            }

            boardEl.appendChild(cell);
        }
    }
}

// ---- PIECE SELECTION ----
function selectPiece(r, c) {
    if (gameOver) return;
    const piece = board[r][c];
    if (!isCurrentPlayer(piece)) return;

    // If multi-jump in progress, only that piece
    if (multiJumpPiece && (multiJumpPiece.row !== r || multiJumpPiece.col !== c)) return;

    // If must jump and this piece can't jump, ignore
    if (mustJumpPieces.length > 0 && !mustJumpPieces.some(p => p.row === r && p.col === c)) return;

    selectedPiece = { row: r, col: c };
    validMoves = getMovesForPiece(r, c);
    renderBoard();
    updateHint();
}

// ---- MOVE EXECUTION ----
function movePiece(toRow, toCol) {
    if (!selectedPiece || gameOver) return;
    const move = validMoves.find(m => m.row === toRow && m.col === toCol);
    if (!move) return;

    const fromRow = selectedPiece.row;
    const fromCol = selectedPiece.col;
    const piece = board[fromRow][fromCol];

    // Save state for undo
    moveHistory.push({
        board: board.map(row => [...row]),
        player: currentPlayer
    });

    // Execute move
    board[toRow][toCol] = piece;
    board[fromRow][fromCol] = EMPTY;

    // Capture
    let captured = false;
    for (const jump of move.jumps) {
        board[jump.row][jump.col] = EMPTY;
        captured = true;
    }

    // King promotion
    let promoted = false;
    if (piece === FIRE && toRow === 7) {
        board[toRow][toCol] = FIRE_KING;
        promoted = true;
    }
    if (piece === ICE && toRow === 0) {
        board[toRow][toCol] = ICE_KING;
        promoted = true;
    }

    // Multi-jump check
    if (captured && !promoted) {
        const furtherJumps = getJumpsForPiece(toRow, toCol, board);
        if (furtherJumps.length > 0) {
            multiJumpPiece = { row: toRow, col: toCol };
            selectedPiece = { row: toRow, col: toCol };
            validMoves = furtherJumps.map(j => ({
                row: j.row, col: j.col,
                jumps: [{ row: j.capturedRow, col: j.capturedCol }]
            }));
            mustJumpPieces = [{ row: toRow, col: toCol }];
            renderBoard();
            updateUI();
            return; // continue the multi-jump
        }
    }

    // End turn
    multiJumpPiece = null;
    selectedPiece = null;
    validMoves = [];
    currentPlayer = currentPlayer === FIRE ? ICE : FIRE;
    findMustJumps();

    renderBoard();
    updateUI();
    checkWin();
}

// ---- UNDO ----
function undoMove() {
    if (moveHistory.length === 0 || gameOver) return;
    const state = moveHistory.pop();
    board = state.board;
    currentPlayer = state.player;
    selectedPiece = null;
    validMoves = [];
    multiJumpPiece = null;
    findMustJumps();
    renderBoard();
    updateUI();
}

// ---- WIN DETECTION ----
function checkWin() {
    const fireCount = countPieces(FIRE);
    const iceCount = countPieces(ICE);

    if (fireCount === 0) {
        showVictory(ICE);
        return;
    }
    if (iceCount === 0) {
        showVictory(FIRE);
        return;
    }

    // Check if current player has any moves at all
    let hasMoves = false;
    for (let r = 0; r < 8 && !hasMoves; r++) {
        for (let c = 0; c < 8 && !hasMoves; c++) {
            if (isCurrentPlayer(board[r][c])) {
                const moves = getMovesForPiece(r, c);
                if (moves.length > 0) hasMoves = true;
            }
        }
    }

    if (!hasMoves) {
        showVictory(currentPlayer === FIRE ? ICE : FIRE);
    }
}

function showVictory(winner) {
    gameOver = true;
    const modal = document.getElementById('victory-modal');
    const title = document.getElementById('victory-title');
    const message = document.getElementById('victory-message');
    const dragonEl = document.getElementById('victory-dragon');
    const dragonImg = document.getElementById('victory-dragon-img');
    const winnerName = winner === FIRE ? fireName : iceName;
    const loserName = winner === FIRE ? iceName : fireName;
    const element = winner === FIRE ? 'Fire' : 'Ice';

    const fireSayings = [
        `The ${element} Dragon ${winnerName} has vanquished ${loserName}! The realm trembles with their power.`,
        `${winnerName}'s inferno consumes all! ${loserName} crumbles to ash beneath the flames.`,
        `From the ashes of battle, ${winnerName} rises supreme! The board burns in their glory.`,
        `${loserName}'s defenses melt like wax before ${winnerName}'s unstoppable blaze!`,
        `The fires of ${winnerName} rage eternal! None can withstand the dragon's fury.`,
        `${winnerName} scorches the battlefield! ${loserName} retreats into the shadows, defeated.`,
        `By claw and flame, ${winnerName} claims total dominion! Let the realm bow before the inferno.`,
        `The last piece falls... ${winnerName}'s roar echoes across the scorched earth!`,
        `${loserName} never stood a chance. ${winnerName}'s fire burns brighter than a thousand suns!`,
        `A river of molten fury flows where ${loserName}'s army once stood. ${winnerName} reigns!`,
        `The embers of ${winnerName}'s wrath will smolder for eternity. Total annihilation!`,
        `Like a phoenix, ${winnerName} rises from the chaos of war. ${loserName} is no more.`,
        `${winnerName} unleashes a firestorm! The board is reduced to cinders and legend.`,
        `Witness the fury of dragonfire! ${winnerName} stands unchallenged upon the molten throne.`,
        `${loserName}'s strategy turned to smoke. ${winnerName}'s cunning burns hotter than their flame!`,
        `The prophecy is fulfilled — ${winnerName} the Scorcher claims the Dragon's Gambit!`
    ];
    const iceSayings = [
        `The ${element} Dragon ${winnerName} has vanquished ${loserName}! The realm trembles with their power.`,
        `${winnerName}'s frost shatters all resistance! ${loserName} is frozen in eternal defeat.`,
        `A glacial silence falls... ${winnerName} stands victorious over the frozen battlefield.`,
        `${loserName}'s forces shatter like ice! ${winnerName}'s blizzard knows no mercy.`,
        `The cold grip of ${winnerName} freezes the realm! Nothing escapes the dragon's winter.`,
        `${winnerName} encases the board in crystal! ${loserName} is lost to the endless frost.`,
        `By fang and frost, ${winnerName} claims absolute victory! The realm enters an eternal ice age.`,
        `The last piece shatters... ${winnerName}'s howl echoes through the frozen wastes!`,
        `${loserName} is entombed in permafrost. ${winnerName}'s glacial reign begins!`,
        `An avalanche of crystalline fury buries ${loserName}. ${winnerName} is unstoppable!`,
        `The temperature drops to absolute zero. ${winnerName} freezes time itself in victory!`,
        `Like a blizzard at midnight, ${winnerName} swept across the board. ${loserName} never saw it coming.`,
        `${winnerName} summons the frozen heart of winter! ${loserName}'s army shatters into a million shards.`,
        `Behold the majesty of the frost wyrm! ${winnerName} reigns supreme over the frozen domain.`,
        `${loserName}'s plans crumble like thin ice. ${winnerName}'s patience was colder than death itself!`,
        `The ancient prophecy speaks true — ${winnerName} the Frost Sovereign claims the Dragon's Gambit!`
    ];
    const sayings = winner === FIRE ? fireSayings : iceSayings;
    const saying = sayings[Math.floor(Math.random() * sayings.length)];

    // Set dragon image and element class
    dragonImg.src = winner === FIRE ? 'images/fire_dragon.png' : 'images/ice_dragon.png';
    dragonEl.className = 'victory-dragon ' + (winner === FIRE ? 'fire-dragon' : 'ice-dragon');

    title.textContent = `${winnerName} Wins!`;
    title.className = 'victory-title ' + (winner === FIRE ? 'fire-win' : 'ice-win');
    message.textContent = saying;

    modal.classList.add('active');

    // Start breath effect after dragon lands (1.8s fly-in)
    setTimeout(() => {
        dragonEl.classList.add('landed');
        startBreathEffect(winner);
    }, 2000);
}

// Breath particle system
let breathAnimFrame = null;
function startBreathEffect(winner) {
    const canvas = document.getElementById('breath-canvas');
    const ctx = canvas.getContext('2d');
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;

    const particles = [];
    const cx = canvas.width / 2;
    const cy = canvas.height * 0.32; // dragon mouth position
    const isFire = winner === FIRE;

    class BreathParticle {
        constructor() {
            this.reset();
        }
        reset() {
            this.x = cx + (Math.random() - 0.5) * 30;
            this.y = cy + 40;
            this.size = Math.random() * 8 + 3;
            // Shoot downward and outward in a cone
            const angle = (Math.random() * 60 + 60) * (Math.PI / 180); // 60-120 degrees (downward cone)
            const speed = Math.random() * 4 + 2;
            this.vx = Math.cos(angle) * speed * (Math.random() > 0.5 ? 1 : -1);
            this.vy = Math.sin(angle) * speed;
            this.life = 1.0;
            this.decay = Math.random() * 0.015 + 0.008;

            if (isFire) {
                this.r = 255;
                this.g = Math.floor(Math.random() * 80);
                this.b = 0;
            } else {
                this.r = Math.floor(Math.random() * 60 + 150);
                this.g = Math.floor(Math.random() * 40 + 220);
                this.b = 255;
            }
        }
        update() {
            this.x += this.vx;
            this.y += this.vy;
            this.vy += 0.05; // slight gravity
            this.size *= 0.995;
            this.life -= this.decay;
            if (this.life <= 0) this.reset();
        }
        draw() {
            ctx.beginPath();
            ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
            const grd = ctx.createRadialGradient(this.x, this.y, 0, this.x, this.y, this.size);
            grd.addColorStop(0, `rgba(${this.r},${this.g},${this.b},${this.life})`);
            grd.addColorStop(1, `rgba(${this.r},${this.g},${this.b},0)`);
            ctx.fillStyle = grd;
            ctx.fill();
        }
    }

    // Create initial particles
    for (let i = 0; i < 120; i++) {
        const p = new BreathParticle();
        p.life = Math.random(); // stagger initial particles
        particles.push(p);
    }

    function animateBreath() {
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        // Add glow behind the breath
        const glowGrd = ctx.createRadialGradient(cx, cy + 60, 10, cx, cy + 60, 200);
        if (isFire) {
            glowGrd.addColorStop(0, 'rgba(255, 60, 0, 0.15)');
            glowGrd.addColorStop(1, 'rgba(255, 30, 0, 0)');
        } else {
            glowGrd.addColorStop(0, 'rgba(0, 180, 255, 0.15)');
            glowGrd.addColorStop(1, 'rgba(0, 100, 255, 0)');
        }
        ctx.fillStyle = glowGrd;
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        particles.forEach(p => { p.update(); p.draw(); });
        breathAnimFrame = requestAnimationFrame(animateBreath);
    }
    animateBreath();
}

function stopBreathEffect() {
    if (breathAnimFrame) {
        cancelAnimationFrame(breathAnimFrame);
        breathAnimFrame = null;
    }
    const canvas = document.getElementById('breath-canvas');
    if (canvas) {
        const ctx = canvas.getContext('2d');
        ctx.clearRect(0, 0, canvas.width, canvas.height);
    }
}

// ---- UI UPDATES ----
function updateUI() {
    const playerName = currentPlayer === FIRE ? fireName : iceName;
    const element = currentPlayer === FIRE ? 'Fire' : 'Ice';
    document.getElementById('game-status').textContent =
        multiJumpPiece ? `${playerName} — continue the attack!` : `${playerName}'s turn — ${element} strikes`;

    document.getElementById('fire-pieces').textContent = countPieces(FIRE);
    document.getElementById('ice-pieces').textContent = countPieces(ICE);

    // Turn indicators
    const fireIndicator = document.getElementById('fire-turn-indicator');
    const iceIndicator = document.getElementById('ice-turn-indicator');

    fireIndicator.textContent = currentPlayer === FIRE ? 'YOUR TURN' : 'WAITING';
    iceIndicator.textContent = currentPlayer === ICE ? 'YOUR TURN' : 'WAITING';

    fireIndicator.className = 'turn-indicator' + (currentPlayer === FIRE ? ' active-fire' : '');
    iceIndicator.className = 'turn-indicator' + (currentPlayer === ICE ? ' active-ice' : '');

    // Captured pieces display
    updateCapturedDisplay();

    // Contextual hints
    updateHint();
}

function updateHint() {
    const hintBar = document.getElementById('hint-bar');
    const hintText = document.getElementById('hint-text');
    const hintIcon = document.getElementById('hint-icon');
    const playerName = currentPlayer === FIRE ? fireName : iceName;
    const hintClass = currentPlayer === FIRE ? 'fire-hint' : 'ice-hint';

    hintBar.className = 'hint-bar ' + hintClass;

    if (gameOver) {
        hintIcon.textContent = '🏆';
        hintText.textContent = 'Game over! Start a rematch or return to the menu.';
        return;
    }

    if (multiJumpPiece) {
        hintIcon.textContent = '⚡';
        hintText.textContent = `${playerName}: You captured a piece! Click a red square to continue jumping.`;
    } else if (selectedPiece) {
        if (validMoves.length === 0) {
            hintIcon.textContent = '🚫';
            hintText.textContent = `This piece has no available moves. Try another piece.`;
        } else if (validMoves.some(m => m.jumps.length > 0)) {
            hintIcon.textContent = '🔥';
            hintText.textContent = `${playerName}: Click a red-highlighted square to capture!`;
        } else {
            hintIcon.textContent = '👆';
            hintText.textContent = `${playerName}: Click a gold-highlighted square to move there.`;
        }
    } else if (mustJumpPieces.length > 0) {
        hintIcon.textContent = '⚠️';
        hintText.textContent = `${playerName}: You must capture! Click a glowing piece that can jump.`;
    } else {
        hintIcon.textContent = currentPlayer === FIRE ? '🔥' : '❄️';
        hintText.textContent = `${playerName}: Click one of your pieces to select it.`;
    }
}

function updateCapturedDisplay() {
    const fireCaptured = 12 - countPieces(FIRE); // fire pieces captured by ice
    const iceCaptured = 12 - countPieces(ICE);   // ice pieces captured by fire

    const firePipsEl = document.getElementById('captured-fire-pieces');
    const icePipsEl = document.getElementById('captured-ice-pieces');

    firePipsEl.innerHTML = '';
    for (let i = 0; i < fireCaptured; i++) {
        const pip = document.createElement('div');
        pip.className = 'captured-pip fire';
        firePipsEl.appendChild(pip);
    }

    icePipsEl.innerHTML = '';
    for (let i = 0; i < iceCaptured; i++) {
        const pip = document.createElement('div');
        pip.className = 'captured-pip ice';
        icePipsEl.appendChild(pip);
    }
}

// ---- PARTICLE BACKGROUND ----
(function initParticles() {
    const canvas = document.getElementById('particles');
    const ctx = canvas.getContext('2d');
    let particles = [];
    const COUNT = 80;

    function resize() {
        canvas.width = window.innerWidth;
        canvas.height = window.innerHeight;
    }
    window.addEventListener('resize', resize);
    resize();

    class Particle {
        constructor() { this.reset(); }
        reset() {
            this.size = Math.random() * 6 + 2;
            this.speedY = -(Math.random() * 0.5 + 0.15);
            this.speedX = (Math.random() - 0.5) * 0.4;
            this.opacity = Math.random() * 0.6 + 0.15;
            // Fire on left, ice on right
            if (Math.random() > 0.5) {
                this.x = Math.random() * canvas.width * 0.4;
                this.y = canvas.height * 0.3 + Math.random() * canvas.height * 0.7;
                this.r = 255;
                this.g = Math.floor(Math.random() * 100 + 50);
                this.b = 0;
            } else {
                this.x = canvas.width * 0.6 + Math.random() * canvas.width * 0.4;
                this.y = canvas.height * 0.3 + Math.random() * canvas.height * 0.7;
                this.r = 0;
                this.g = Math.floor(Math.random() * 60 + 180);
                this.b = 255;
            }
        }
        update() {
            this.y += this.speedY;
            this.x += this.speedX;
            this.opacity -= 0.001;
            if (this.y < 0 || this.opacity <= 0) this.reset();
        }
        draw() {
            ctx.beginPath();
            ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
            ctx.fillStyle = `rgba(${this.r},${this.g},${this.b},${this.opacity})`;
            ctx.fill();
        }
    }

    for (let i = 0; i < COUNT; i++) particles.push(new Particle());

    function animate() {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        particles.forEach(p => { p.update(); p.draw(); });
        requestAnimationFrame(animate);
    }
    animate();
})();

// ---- BUTTON EVENT LISTENERS ----
// Wire up all buttons via addEventListener to comply with CSP (no inline onclick)
document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('start-btn').addEventListener('click', startGame);
    document.getElementById('new-battle-btn').addEventListener('click', resetGame);
    document.getElementById('undo-btn').addEventListener('click', undoMove);
    document.getElementById('rematch-btn').addEventListener('click', resetGame);
    document.getElementById('main-menu-btn').addEventListener('click', backToSplash);
    document.getElementById('main-menu-game-btn').addEventListener('click', backToSplash);
});
