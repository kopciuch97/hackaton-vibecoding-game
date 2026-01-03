const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

let gameSpeed = 6;
let frameCount = 0;
let spawnInterval = 100;
let isGameOver = false;
let score = 0;
let highScore = localStorage.getItem('boldareRunHighScore') || 0;
const maxSpeed = 15;
let ammo = 3;
const maxAmmo = 5;
let lastSpawnWasPOChange = false;

class Obstacle {
    constructor() {
        this.type = 'bug';
        this.width = 30 + Math.random() * 20;
        this.height = 40 + Math.random() * 40;
        this.x = canvas.width;
        this.y = canvas.height - 100 - this.height;
        this.color = '#FF0000';
    }

    update() {
        this.x -= gameSpeed;
    }

    draw() {
        ctx.fillStyle = this.color;
        ctx.fillRect(this.x, this.y, this.width, this.height);
    }
}

class POChange {
    constructor() {
        this.type = 'pochange';
        this.width = 40;
        this.height = 100; // Twice player height
        this.x = canvas.width;
        this.y = canvas.height - 100 - this.height;
        this.color = '#9932CC'; // Purple
    }

    update() {
        this.x -= gameSpeed;
    }

    draw() {
        ctx.fillStyle = this.color;
        ctx.fillRect(this.x, this.y, this.width, this.height);

        // Draw "PO" label
        ctx.fillStyle = '#FFFFFF';
        ctx.font = 'bold 14px "Courier New", monospace';
        ctx.textAlign = 'center';
        ctx.fillText('PO', this.x + this.width / 2, this.y + 25);
    }
}

const obstacles = [];

class Collectible {
    constructor() {
        this.radius = 15;
        this.x = canvas.width + this.radius;
        this.y = canvas.height - 200 - Math.random() * 100;
        this.color = '#00FFFF';
        this.pulseOffset = Math.random() * Math.PI * 2;
    }

    update() {
        this.x -= gameSpeed;
        this.pulseOffset += 0.15;
    }

    draw() {
        const pulseRadius = this.radius + Math.sin(this.pulseOffset) * 3;
        ctx.beginPath();
        ctx.arc(this.x, this.y, pulseRadius, 0, Math.PI * 2);
        ctx.fillStyle = this.color;
        ctx.fill();
        ctx.closePath();
    }

    // Bounding box for collision
    get width() { return this.radius * 2; }
    get height() { return this.radius * 2; }
    get left() { return this.x - this.radius; }
    get top() { return this.y - this.radius; }
}

const collectibles = [];
let collectibleFrameCount = 0;
let collectibleSpawnInterval = 200;

class Projectile {
    constructor(x, y) {
        this.x = x;
        this.y = y;
        this.width = 20;
        this.height = 4;
        this.speed = 12;
        this.color = '#FFFFFF';
    }

    update() {
        this.x += this.speed;
    }

    draw() {
        ctx.fillStyle = this.color;
        ctx.fillRect(this.x, this.y, this.width, this.height);
    }
}

const projectiles = [];
let lastShotTime = 0;
const shootCooldown = 500;

class BackgroundLayer {
    constructor(speedModifier, color, buildingCount, minHeight, maxHeight) {
        this.speedModifier = speedModifier;
        this.color = color;
        this.buildings = [];
        this.minHeight = minHeight;
        this.maxHeight = maxHeight;

        // Initialize buildings across the screen
        const buildingWidth = canvas.width / buildingCount;
        for (let i = 0; i < buildingCount + 2; i++) {
            this.buildings.push({
                x: i * buildingWidth,
                width: buildingWidth + 2,
                height: minHeight + Math.random() * (maxHeight - minHeight)
            });
        }
    }

    update() {
        const speed = gameSpeed * this.speedModifier;
        for (let building of this.buildings) {
            building.x -= speed;

            // Reset building to right side when off-screen
            if (building.x + building.width < 0) {
                const rightmost = this.buildings.reduce((max, b) => b.x > max ? b.x : max, 0);
                building.x = rightmost + building.width - 2;
                building.height = this.minHeight + Math.random() * (this.maxHeight - this.minHeight);
            }
        }
    }

    draw() {
        ctx.fillStyle = this.color;
        const floorY = canvas.height - 100;
        for (let building of this.buildings) {
            ctx.fillRect(building.x, floorY - building.height, building.width, building.height);
        }
    }
}

// Parallax background layers
const farLayer = new BackgroundLayer(0.2, '#1a1a1a', 8, 150, 300);
const midLayer = new BackgroundLayer(0.5, '#2a2a2a', 12, 80, 180);

const player = {
    x: 100,
    y: 0,
    width: 50,
    height: 50,
    velocityY: 0,
    jumpPower: -18,
    gravity: 0.8,
    color: '#FFA500',
    grounded: false,

    update() {
        this.velocityY += this.gravity;
        this.y += this.velocityY;

        const floorY = canvas.height - 100;
        if (this.y + this.height >= floorY) {
            this.y = floorY - this.height;
            this.velocityY = 0;
            this.grounded = true;
        } else {
            this.grounded = false;
        }
    },

    draw() {
        ctx.fillStyle = this.color;
        ctx.fillRect(this.x, this.y, this.width, this.height);
    },

    jump() {
        if (this.grounded) {
            this.velocityY = this.jumpPower;
            this.grounded = false;
        }
    }
};

function checkCollision(rect1, rect2) {
    return rect1.x < rect2.x + rect2.width &&
           rect1.x + rect1.width > rect2.x &&
           rect1.y < rect2.y + rect2.height &&
           rect1.y + rect1.height > rect2.y;
}

function checkCollectibleCollision(player, collectible) {
    return player.x < collectible.x + collectible.radius &&
           player.x + player.width > collectible.x - collectible.radius &&
           player.y < collectible.y + collectible.radius &&
           player.y + player.height > collectible.y - collectible.radius;
}

function shoot() {
    const now = Date.now();
    if (now - lastShotTime >= shootCooldown && !isGameOver && ammo > 0) {
        const projectileX = player.x + player.width;
        const projectileY = player.y + player.height / 2 - 2;
        projectiles.push(new Projectile(projectileX, projectileY));
        lastShotTime = now;
        ammo--;
    }
}

function resetGame() {
    player.x = 100;
    player.y = canvas.height - 100 - player.height;
    player.velocityY = 0;
    player.grounded = true;
    obstacles.length = 0;
    collectibles.length = 0;
    projectiles.length = 0;
    gameSpeed = 6;
    frameCount = 0;
    spawnInterval = 100;
    collectibleFrameCount = 0;
    collectibleSpawnInterval = 200;
    score = 0;
    ammo = 3;
    lastSpawnWasPOChange = false;
    isGameOver = false;
}

function drawGameOver() {
    ctx.fillStyle = '#FF0000';
    ctx.font = 'bold 64px "Courier New", monospace';
    ctx.textAlign = 'center';
    ctx.fillText('SPRINT FAILED', canvas.width / 2, canvas.height / 2 - 50);

    ctx.fillStyle = '#FFA500';
    ctx.font = '28px "Courier New", monospace';
    ctx.fillText('Score: ' + score, canvas.width / 2, canvas.height / 2 + 10);

    ctx.fillStyle = '#FFFFFF';
    ctx.font = '24px "Courier New", monospace';
    ctx.fillText('Press Space to Restart', canvas.width / 2, canvas.height / 2 + 60);
}

function resizeCanvas() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    player.y = canvas.height - 100 - player.height;
}

function draw() {
    // Gradient sky background
    const gradient = ctx.createLinearGradient(0, 0, 0, canvas.height);
    gradient.addColorStop(0, '#000022');
    gradient.addColorStop(1, '#111');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Draw parallax layers (back to front)
    farLayer.draw();
    midLayer.draw();

    // Draw ground
    ctx.fillStyle = '#333';
    ctx.fillRect(0, canvas.height - 100, canvas.width, 100);
}

function drawScore() {
    ctx.fillStyle = '#FFA500';
    ctx.font = 'bold 24px "Courier New", monospace';
    ctx.textAlign = 'right';
    ctx.fillText('Sprint Points: ' + score, canvas.width - 20, 40);

    ctx.fillStyle = '#FFFFFF';
    ctx.font = '18px "Courier New", monospace';
    ctx.fillText('Best Sprint: ' + highScore, canvas.width - 20, 65);

    // Draw ammo
    ctx.textAlign = 'left';
    ctx.fillStyle = '#FFFFFF';
    ctx.font = 'bold 20px "Courier New", monospace';
    ctx.fillText('Hotfixes: ' + ammo, 20, 40);
}

function gameLoop() {
    draw();
    drawScore();

    if (isGameOver) {
        drawGameOver();
        requestAnimationFrame(gameLoop);
        return;
    }

    // Update background layers
    farLayer.update();
    midLayer.update();

    // Update score
    score++;

    // Speed scaling every 500 points
    if (score % 500 === 0 && gameSpeed < maxSpeed) {
        gameSpeed += 0.5;
    }

    // Spawn obstacles (mix of Bugs and PO Changes)
    frameCount++;
    if (frameCount >= spawnInterval) {
        // Don't spawn two PO Changes in a row (impossible without ammo)
        // 30% chance for PO Change if last wasn't one, otherwise spawn Bug
        if (!lastSpawnWasPOChange && Math.random() < 0.3) {
            obstacles.push(new POChange());
            lastSpawnWasPOChange = true;
            spawnInterval = 150 + Math.random() * 50; // More time after PO Change
        } else {
            obstacles.push(new Obstacle());
            lastSpawnWasPOChange = false;
            spawnInterval = 100 + Math.random() * 50;
        }
        frameCount = 0;
    }

    // Spawn collectibles (10% chance, rare ammo replenisher)
    collectibleFrameCount++;
    if (collectibleFrameCount >= collectibleSpawnInterval) {
        if (Math.random() < 0.1) {
            collectibles.push(new Collectible());
        }
        collectibleFrameCount = 0;
        collectibleSpawnInterval = 150 + Math.random() * 100;
    }

    // Update and draw obstacles
    for (let i = obstacles.length - 1; i >= 0; i--) {
        obstacles[i].update();
        obstacles[i].draw();

        // Check collision
        if (checkCollision(player, obstacles[i])) {
            isGameOver = true;
            // Save high score
            if (score > highScore) {
                highScore = score;
                localStorage.setItem('boldareRunHighScore', highScore);
            }
        }

        // Remove off-screen obstacles
        if (obstacles[i].x + obstacles[i].width < 0) {
            obstacles.splice(i, 1);
        }
    }

    // Update and draw collectibles
    for (let i = collectibles.length - 1; i >= 0; i--) {
        collectibles[i].update();
        collectibles[i].draw();

        // Check collision with player
        if (checkCollectibleCollision(player, collectibles[i])) {
            collectibles.splice(i, 1);
            if (ammo < maxAmmo) {
                ammo++;
            }
            score += 50;
            console.log('Coffee grabbed! +1 Hotfix ammo');
            continue;
        }

        // Remove off-screen collectibles
        if (collectibles[i].x + collectibles[i].radius < 0) {
            collectibles.splice(i, 1);
        }
    }

    // Update and draw projectiles
    for (let i = projectiles.length - 1; i >= 0; i--) {
        projectiles[i].update();
        projectiles[i].draw();

        // Check collision with obstacles
        let hitObstacle = false;
        for (let j = obstacles.length - 1; j >= 0; j--) {
            if (checkCollision(projectiles[i], obstacles[j])) {
                const wasPoChange = obstacles[j].type === 'pochange';
                obstacles.splice(j, 1);
                hitObstacle = true;
                if (wasPoChange) {
                    score += 100;
                    console.log('PO Change handled! +100');
                } else {
                    score += 25;
                    console.log('Bug Fixed! +25 (consider jumping instead!)');
                }
                break;
            }
        }

        if (hitObstacle) {
            projectiles.splice(i, 1);
            continue;
        }

        // Remove off-screen projectiles
        if (projectiles[i].x > canvas.width) {
            projectiles.splice(i, 1);
        }
    }

    player.update();
    player.draw();
    requestAnimationFrame(gameLoop);
}

window.addEventListener('resize', resizeCanvas);
window.addEventListener('keydown', (e) => {
    if (e.code === 'Space' || e.code === 'ArrowUp') {
        e.preventDefault();
        if (isGameOver) {
            resetGame();
        } else {
            player.jump();
        }
    }
    if (e.code === 'KeyF') {
        shoot();
    }
});

resizeCanvas();
gameLoop();
