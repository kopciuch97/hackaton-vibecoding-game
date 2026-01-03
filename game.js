const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

let gameSpeed = 6;
let isGameOver = false;
let isGameStarted = false; // Start screen state
let score = 0;
let highScore = localStorage.getItem('boldareRunHighScore') || 0;
const maxSpeed = 15;
let ammo = 3;
const maxAmmo = 5;
let lastSpawnWasPOChange = false;
let lastObstacleType = null; // 'ground', 'flying', or 'pochange'
let gameFrame = 0; // Animation frame counter

// Input state for crouching and jetpack
const keys = {
    down: false,
    up: false,
    left: false // Left arrow for jetpack thrust
};

// Crouch constants
const CROUCH_HEIGHT_RATIO = 0.5; // Crouch to 50% height

// ==========================================
// PROCEDURAL SOUND SYSTEM (Web Audio API)
// ==========================================
class SoundManager {
    constructor() {
        this.audioContext = null;
        this.masterGain = null;
        this.isInitialized = false;
        this.isMuted = false;
        this.volume = 0.7; // Master volume (0-1)
        this.jetpackNode = null; // For looping jetpack sound
        this.jetpackGain = null;
        // Music system
        this.musicInterval = null;
        this.isMusicPlaying = false;
        this.isMusicMuted = false;
        this.musicVolume = 0.25; // Lower than SFX
        this.currentNote = 0;
        // Cyberpunk bassline: A minor pentatonic, driving rhythm at 120 BPM
        // Notes: A1, C2, D2, E2, G2, A2 (low frequencies for bass)
        this.bassline = [55, 65, 73, 82, 98, 110, 82, 73]; // 8-note sequence
    }

    // Initialize AudioContext (must be called after user interaction)
    init() {
        if (this.isInitialized) return;

        try {
            this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
            this.masterGain = this.audioContext.createGain();
            this.masterGain.connect(this.audioContext.destination);
            this.masterGain.gain.value = this.volume;
            this.isInitialized = true;
        } catch (e) {
            console.warn('Web Audio API not supported:', e);
        }
    }

    // Set master volume (0-1)
    setVolume(vol) {
        this.volume = Math.max(0, Math.min(1, vol));
        if (this.masterGain) {
            this.masterGain.gain.value = this.isMuted ? 0 : this.volume;
        }
    }

    // Toggle mute
    toggleMute() {
        this.isMuted = !this.isMuted;
        if (this.masterGain) {
            this.masterGain.gain.value = this.isMuted ? 0 : this.volume;
        }
        return this.isMuted;
    }

    // Generate a simple tone
    playTone(freq, type = 'sine', duration = 0.1, volume = 1) {
        if (!this.isInitialized || this.isMuted) return;

        const osc = this.audioContext.createOscillator();
        const gain = this.audioContext.createGain();

        osc.type = type;
        osc.frequency.value = freq;

        gain.gain.value = volume * this.volume;
        gain.gain.exponentialRampToValueAtTime(0.001, this.audioContext.currentTime + duration);

        osc.connect(gain);
        gain.connect(this.masterGain);

        osc.start();
        osc.stop(this.audioContext.currentTime + duration);
    }

    // Generate white noise
    playNoise(duration = 0.2, volume = 0.5) {
        if (!this.isInitialized || this.isMuted) return;

        const bufferSize = this.audioContext.sampleRate * duration;
        const buffer = this.audioContext.createBuffer(1, bufferSize, this.audioContext.sampleRate);
        const data = buffer.getChannelData(0);

        for (let i = 0; i < bufferSize; i++) {
            data[i] = Math.random() * 2 - 1;
        }

        const noise = this.audioContext.createBufferSource();
        const gain = this.audioContext.createGain();

        noise.buffer = buffer;
        gain.gain.value = volume * this.volume;
        gain.gain.exponentialRampToValueAtTime(0.001, this.audioContext.currentTime + duration);

        noise.connect(gain);
        gain.connect(this.masterGain);

        noise.start();
        noise.stop(this.audioContext.currentTime + duration);
    }

    // === SPECIFIC SFX METHODS ===

    // Jump: Sine wave sliding pitch up (200Hz to 600Hz)
    jump() {
        if (!this.isInitialized || this.isMuted) return;

        const osc = this.audioContext.createOscillator();
        const gain = this.audioContext.createGain();

        osc.type = 'sine';
        osc.frequency.setValueAtTime(200, this.audioContext.currentTime);
        osc.frequency.exponentialRampToValueAtTime(600, this.audioContext.currentTime + 0.15);

        gain.gain.setValueAtTime(0.3 * this.volume, this.audioContext.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, this.audioContext.currentTime + 0.2);

        osc.connect(gain);
        gain.connect(this.masterGain);

        osc.start();
        osc.stop(this.audioContext.currentTime + 0.2);
    }

    // Shoot: Sawtooth wave sliding pitch down (pew-pew)
    shoot() {
        if (!this.isInitialized || this.isMuted) return;

        const osc = this.audioContext.createOscillator();
        const gain = this.audioContext.createGain();

        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(800, this.audioContext.currentTime);
        osc.frequency.exponentialRampToValueAtTime(200, this.audioContext.currentTime + 0.1);

        gain.gain.setValueAtTime(0.2 * this.volume, this.audioContext.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, this.audioContext.currentTime + 0.15);

        osc.connect(gain);
        gain.connect(this.masterGain);

        osc.start();
        osc.stop(this.audioContext.currentTime + 0.15);
    }

    // Explosion: Burst of white noise fading out
    explosion() {
        if (!this.isInitialized || this.isMuted) return;

        const duration = 0.3;
        const bufferSize = this.audioContext.sampleRate * duration;
        const buffer = this.audioContext.createBuffer(1, bufferSize, this.audioContext.sampleRate);
        const data = buffer.getChannelData(0);

        for (let i = 0; i < bufferSize; i++) {
            data[i] = (Math.random() * 2 - 1) * (1 - i / bufferSize); // Fade out
        }

        const noise = this.audioContext.createBufferSource();
        const gain = this.audioContext.createGain();
        const filter = this.audioContext.createBiquadFilter();

        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(2000, this.audioContext.currentTime);
        filter.frequency.exponentialRampToValueAtTime(200, this.audioContext.currentTime + duration);

        noise.buffer = buffer;
        gain.gain.setValueAtTime(0.4 * this.volume, this.audioContext.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, this.audioContext.currentTime + duration);

        noise.connect(filter);
        filter.connect(gain);
        gain.connect(this.masterGain);

        noise.start();
        noise.stop(this.audioContext.currentTime + duration);
    }

    // Collect: High-pitched "ding" (two rapid sine waves)
    collect() {
        if (!this.isInitialized || this.isMuted) return;

        // First ding
        const osc1 = this.audioContext.createOscillator();
        const gain1 = this.audioContext.createGain();
        osc1.type = 'sine';
        osc1.frequency.value = 1000;
        gain1.gain.setValueAtTime(0.25 * this.volume, this.audioContext.currentTime);
        gain1.gain.exponentialRampToValueAtTime(0.001, this.audioContext.currentTime + 0.1);
        osc1.connect(gain1);
        gain1.connect(this.masterGain);
        osc1.start();
        osc1.stop(this.audioContext.currentTime + 0.1);

        // Second ding (slightly delayed, higher pitch)
        const osc2 = this.audioContext.createOscillator();
        const gain2 = this.audioContext.createGain();
        osc2.type = 'sine';
        osc2.frequency.value = 1500;
        gain2.gain.setValueAtTime(0, this.audioContext.currentTime);
        gain2.gain.setValueAtTime(0.25 * this.volume, this.audioContext.currentTime + 0.08);
        gain2.gain.exponentialRampToValueAtTime(0.001, this.audioContext.currentTime + 0.2);
        osc2.connect(gain2);
        gain2.connect(this.masterGain);
        osc2.start();
        osc2.stop(this.audioContext.currentTime + 0.2);
    }

    // Jetpack: Low-frequency rumbling noise (looping)
    startJetpack() {
        if (!this.isInitialized || this.isMuted || this.jetpackNode) return;

        // Create noise buffer for looping
        const bufferSize = this.audioContext.sampleRate * 0.5;
        const buffer = this.audioContext.createBuffer(1, bufferSize, this.audioContext.sampleRate);
        const data = buffer.getChannelData(0);

        for (let i = 0; i < bufferSize; i++) {
            data[i] = Math.random() * 2 - 1;
        }

        this.jetpackNode = this.audioContext.createBufferSource();
        this.jetpackGain = this.audioContext.createGain();
        const filter = this.audioContext.createBiquadFilter();

        filter.type = 'lowpass';
        filter.frequency.value = 300; // Low rumble

        this.jetpackNode.buffer = buffer;
        this.jetpackNode.loop = true;
        this.jetpackGain.gain.value = 0.15 * this.volume;

        this.jetpackNode.connect(filter);
        filter.connect(this.jetpackGain);
        this.jetpackGain.connect(this.masterGain);

        this.jetpackNode.start();
    }

    stopJetpack() {
        if (this.jetpackNode) {
            this.jetpackGain.gain.exponentialRampToValueAtTime(0.001, this.audioContext.currentTime + 0.1);
            this.jetpackNode.stop(this.audioContext.currentTime + 0.1);
            this.jetpackNode = null;
            this.jetpackGain = null;
        }
    }

    // Game Over: Sad sequence of tones descending
    gameOver() {
        if (!this.isInitialized || this.isMuted) return;

        const notes = [400, 350, 300, 200];
        const duration = 0.25;

        notes.forEach((freq, i) => {
            const osc = this.audioContext.createOscillator();
            const gain = this.audioContext.createGain();

            osc.type = 'square';
            osc.frequency.value = freq;

            const startTime = this.audioContext.currentTime + i * duration;
            gain.gain.setValueAtTime(0.2 * this.volume, startTime);
            gain.gain.exponentialRampToValueAtTime(0.001, startTime + duration - 0.05);

            osc.connect(gain);
            gain.connect(this.masterGain);

            osc.start(startTime);
            osc.stop(startTime + duration);
        });
    }

    // Crouch/Dive: Quick low thump
    crouch() {
        if (!this.isInitialized || this.isMuted) return;

        const osc = this.audioContext.createOscillator();
        const gain = this.audioContext.createGain();

        osc.type = 'sine';
        osc.frequency.setValueAtTime(150, this.audioContext.currentTime);
        osc.frequency.exponentialRampToValueAtTime(50, this.audioContext.currentTime + 0.1);

        gain.gain.setValueAtTime(0.3 * this.volume, this.audioContext.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, this.audioContext.currentTime + 0.1);

        osc.connect(gain);
        gain.connect(this.masterGain);

        osc.start();
        osc.stop(this.audioContext.currentTime + 0.1);
    }

    // === BACKGROUND MUSIC SYSTEM ===

    // Play a single bass note with attack/decay envelope
    playBassNote(freq) {
        if (!this.isInitialized || this.isMusicMuted) return;

        const now = this.audioContext.currentTime;
        const duration = 0.2; // Short punchy notes

        // Main bass oscillator (sawtooth for grit)
        const osc1 = this.audioContext.createOscillator();
        const gain1 = this.audioContext.createGain();
        const filter = this.audioContext.createBiquadFilter();

        osc1.type = 'sawtooth';
        osc1.frequency.value = freq;

        // Sub bass (triangle, one octave lower)
        const osc2 = this.audioContext.createOscillator();
        const gain2 = this.audioContext.createGain();

        osc2.type = 'triangle';
        osc2.frequency.value = freq / 2; // Octave lower

        // Low-pass filter for warmth
        filter.type = 'lowpass';
        filter.frequency.value = 400;
        filter.Q.value = 2;

        // Envelope: quick attack, medium decay
        const vol = this.musicVolume * this.volume;
        gain1.gain.setValueAtTime(0, now);
        gain1.gain.linearRampToValueAtTime(vol * 0.6, now + 0.01); // Attack
        gain1.gain.exponentialRampToValueAtTime(0.001, now + duration); // Decay

        gain2.gain.setValueAtTime(0, now);
        gain2.gain.linearRampToValueAtTime(vol * 0.4, now + 0.01);
        gain2.gain.exponentialRampToValueAtTime(0.001, now + duration);

        // Connect: osc -> filter -> gain -> master
        osc1.connect(filter);
        filter.connect(gain1);
        gain1.connect(this.masterGain);

        osc2.connect(gain2);
        gain2.connect(this.masterGain);

        osc1.start(now);
        osc1.stop(now + duration);
        osc2.start(now);
        osc2.stop(now + duration);
    }

    // Start the background music loop (120 BPM = 500ms per beat)
    startMusic() {
        if (!this.isInitialized || this.isMusicPlaying) return;

        this.isMusicPlaying = true;
        this.currentNote = 0;

        // 120 BPM = 2 beats per second = 500ms per beat
        // For 8th notes at 120 BPM: 250ms interval
        const beatInterval = 250;

        this.musicInterval = setInterval(() => {
            if (!this.isMusicMuted) {
                this.playBassNote(this.bassline[this.currentNote]);
            }
            this.currentNote = (this.currentNote + 1) % this.bassline.length;
        }, beatInterval);

        // Play first note immediately
        if (!this.isMusicMuted) {
            this.playBassNote(this.bassline[0]);
        }
    }

    // Stop the background music
    stopMusic() {
        if (this.musicInterval) {
            clearInterval(this.musicInterval);
            this.musicInterval = null;
        }
        this.isMusicPlaying = false;
        this.currentNote = 0;
    }

    // Toggle music mute (M key)
    toggleMusic() {
        this.isMusicMuted = !this.isMusicMuted;
        return this.isMusicMuted;
    }
}

// Global sound manager instance (initialized on game start)
const soundManager = new SoundManager();

// Fast Fall constants
const FAST_FALL_ACCELERATION = 0; // No extra gravity - just crouched hitbox in air
const FAST_FALL_MIN_VELOCITY = 0; // No minimum speed boost

class Obstacle {
    constructor(x, surfaceY) {
        this.type = 'bug';
        this.width = 30 + Math.random() * 20;
        this.height = 40 + Math.random() * 40;
        this.x = x || canvas.width;
        this.y = (surfaceY || canvas.height - 100) - this.height;
        this.color = '#FF0000';
    }

    update() {
        this.x -= gameSpeed;
    }

    draw() {
        const x = this.x;
        const y = this.y;
        const w = this.width;
        const h = this.height;

        // Glitchy red glow
        ctx.shadowColor = '#FF0000';
        ctx.shadowBlur = 8 + Math.sin(gameFrame * 0.2) * 3;

        // Base block
        ctx.fillStyle = '#FF0000';
        ctx.fillRect(x, y, w, h);

        // Glitchy black lines (random positions based on gameFrame)
        ctx.fillStyle = '#000000';
        const seed = Math.floor(gameFrame * 0.1) % 10;
        for (let i = 0; i < 5; i++) {
            const lineY = y + ((seed + i * 17) % h);
            const lineW = 5 + ((seed + i * 7) % (w - 10));
            const lineX = x + ((seed + i * 3) % (w - lineW));
            ctx.fillRect(lineX, lineY, lineW, 2);
        }

        // Jagged edge effect (left side)
        ctx.fillStyle = '#880000';
        for (let i = 0; i < h; i += 8) {
            const jag = ((i + seed) % 3) * 3;
            ctx.fillRect(x, y + i, jag, 4);
        }

        // Jagged edge effect (right side)
        for (let i = 0; i < h; i += 8) {
            const jag = ((i + seed + 5) % 3) * 3;
            ctx.fillRect(x + w - jag, y + i, jag, 4);
        }

        // "FIX ME" or "{}" text
        ctx.shadowBlur = 0;
        ctx.fillStyle = '#FFCCCC';
        ctx.font = 'bold 8px "Courier New", monospace';
        ctx.textAlign = 'center';
        if (h > 50) {
            ctx.fillText('FIX', x + w / 2, y + h / 2 - 3);
            ctx.fillText('ME!', x + w / 2, y + h / 2 + 7);
        } else {
            ctx.fillText('{ }', x + w / 2, y + h / 2 + 3);
        }

        // Corrupt pixel effect
        ctx.fillStyle = '#FF6666';
        for (let i = 0; i < 4; i++) {
            const px = x + ((gameFrame + i * 13) % w);
            const py = y + ((gameFrame + i * 7) % h);
            ctx.fillRect(px, py, 3, 3);
        }

        ctx.shadowBlur = 0;
    }
}

class POChange {
    constructor(x, surfaceY) {
        this.type = 'pochange';
        this.width = 40;
        this.height = 100; // Twice player height
        this.x = x || canvas.width;
        this.y = (surfaceY || canvas.height - 100) - this.height;
        this.color = '#9932CC'; // Purple
    }

    update() {
        this.x -= gameSpeed;
    }

    draw() {
        const x = this.x;
        const y = this.y;
        const w = this.width;
        const h = this.height;

        // Imposing purple glow
        ctx.shadowColor = '#9932CC';
        ctx.shadowBlur = 15;

        // Main monolith body
        ctx.fillStyle = '#9932CC';
        ctx.fillRect(x, y, w, h);

        // Darker gradient effect (top to bottom)
        const gradient = ctx.createLinearGradient(x, y, x, y + h);
        gradient.addColorStop(0, 'rgba(60, 20, 80, 0.7)');
        gradient.addColorStop(0.5, 'rgba(153, 50, 204, 0)');
        gradient.addColorStop(1, 'rgba(30, 10, 40, 0.5)');
        ctx.fillStyle = gradient;
        ctx.fillRect(x, y, w, h);

        // Stone/monolith texture lines
        ctx.strokeStyle = '#7B28A8';
        ctx.lineWidth = 1;
        for (let i = 20; i < h; i += 25) {
            ctx.beginPath();
            ctx.moveTo(x + 3, y + i);
            ctx.lineTo(x + w - 3, y + i);
            ctx.stroke();
        }

        // Glowing edges
        ctx.strokeStyle = '#CC66FF';
        ctx.lineWidth = 2;
        ctx.strokeRect(x + 1, y + 1, w - 2, h - 2);

        // Top cap (pyramid hint)
        ctx.fillStyle = '#7B28A8';
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x + w / 2, y - 8);
        ctx.lineTo(x + w, y);
        ctx.fill();

        ctx.shadowBlur = 0;

        // Pulsing "?" or "!" symbol
        const pulse = Math.sin(gameFrame * 0.08) * 0.3 + 0.7;
        ctx.fillStyle = `rgba(255, 255, 255, ${pulse})`;
        ctx.font = 'bold 28px "Courier New", monospace';
        ctx.textAlign = 'center';
        const symbol = Math.floor(gameFrame * 0.02) % 2 === 0 ? '?' : '!';
        ctx.fillText(symbol, x + w / 2, y + 50);

        // "SCOPE" text at bottom
        ctx.fillStyle = '#DDAAFF';
        ctx.font = 'bold 9px "Courier New", monospace';
        ctx.fillText('SCOPE', x + w / 2, y + h - 25);
        ctx.fillText('CREEP', x + w / 2, y + h - 12);
    }
}

// Flying obstacle - must crouch to pass under
class FlyingObstacle {
    constructor(x, surfaceY) {
        this.type = 'flying';
        this.width = 60;
        this.height = 20;
        this.x = x || canvas.width;
        // Position calculation:
        // - Standing player: top at groundY - 50, must HIT this obstacle
        // - Crouching player: top at groundY - 25, must PASS UNDER
        // - Obstacle bottom must be > crouching top (groundY - 25) but < standing top area
        // Set obstacle so bottom is at groundY - 28 (just above crouch height of 25)
        const groundY = surfaceY || canvas.height - 100;
        this.y = groundY - 28 - this.height; // Top of obstacle, bottom at groundY - 28
        this.color = '#FF6600'; // Orange
        this.pulseOffset = Math.random() * Math.PI * 2;
    }

    update() {
        this.x -= gameSpeed;
        this.pulseOffset += 0.1;
    }

    draw() {
        const x = this.x;
        const y = this.y;
        const w = this.width;
        const h = this.height;

        // Pulsing glow effect
        const pulse = Math.sin(this.pulseOffset) * 0.3 + 0.7;

        // Notification glow
        ctx.shadowColor = '#FF6600';
        ctx.shadowBlur = 12 * pulse;

        // Speech bubble / notification shape
        ctx.fillStyle = '#FF6600';
        ctx.beginPath();
        // Rounded rectangle
        const radius = 6;
        ctx.moveTo(x + radius, y);
        ctx.lineTo(x + w - radius, y);
        ctx.quadraticCurveTo(x + w, y, x + w, y + radius);
        ctx.lineTo(x + w, y + h - radius);
        ctx.quadraticCurveTo(x + w, y + h, x + w - radius, y + h);
        // Speech bubble tail
        ctx.lineTo(x + 15, y + h);
        ctx.lineTo(x + 8, y + h + 6);
        ctx.lineTo(x + 12, y + h);
        ctx.lineTo(x + radius, y + h);
        ctx.quadraticCurveTo(x, y + h, x, y + h - radius);
        ctx.lineTo(x, y + radius);
        ctx.quadraticCurveTo(x, y, x + radius, y);
        ctx.fill();

        // Inner lighter area
        ctx.fillStyle = '#FF8833';
        ctx.beginPath();
        ctx.moveTo(x + radius + 2, y + 2);
        ctx.lineTo(x + w - radius - 2, y + 2);
        ctx.quadraticCurveTo(x + w - 2, y + 2, x + w - 2, y + radius + 2);
        ctx.lineTo(x + w - 2, y + h - radius - 2);
        ctx.quadraticCurveTo(x + w - 2, y + h - 2, x + w - radius - 2, y + h - 2);
        ctx.lineTo(x + radius + 2, y + h - 2);
        ctx.quadraticCurveTo(x + 2, y + h - 2, x + 2, y + h - radius - 2);
        ctx.lineTo(x + 2, y + radius + 2);
        ctx.quadraticCurveTo(x + 2, y + 2, x + radius + 2, y + 2);
        ctx.fill();

        ctx.shadowBlur = 0;

        // Notification badge (red dot)
        ctx.fillStyle = '#FF0000';
        ctx.beginPath();
        ctx.arc(x + w - 5, y + 5, 5, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#FFFFFF';
        ctx.font = 'bold 7px "Courier New", monospace';
        ctx.textAlign = 'center';
        ctx.fillText('!', x + w - 5, y + 8);

        // "@" or envelope icon
        ctx.fillStyle = '#FFFFFF';
        ctx.font = 'bold 11px "Courier New", monospace';
        ctx.textAlign = 'center';
        const icon = Math.floor(gameFrame * 0.05) % 2 === 0 ? '@' : '📩';
        ctx.fillText(icon, x + w / 2 - 5, y + h / 2 + 4);

        // "PING" text
        ctx.fillStyle = '#FFE0CC';
        ctx.font = 'bold 8px "Courier New", monospace';
        ctx.fillText('PING', x + w / 2 + 10, y + h / 2 + 4);
    }
}

const obstacles = [];

class Collectible {
    constructor(x, y) {
        this.radius = 15;
        this.x = x || canvas.width + this.radius;
        this.y = y || canvas.height - 200 - Math.random() * 100;
        this.pulseOffset = Math.random() * Math.PI * 2;
        this.steamOffset = Math.random() * Math.PI * 2;
    }

    update() {
        this.x -= gameSpeed;
        this.pulseOffset += 0.15;
        this.steamOffset += 0.1;
    }

    draw() {
        const x = this.x;
        const y = this.y;

        // Coffee cup glow
        ctx.shadowColor = '#8B4513';
        ctx.shadowBlur = 8;

        // Cup body (trapezoid shape)
        ctx.fillStyle = '#FFFFFF'; // White paper cup
        ctx.beginPath();
        ctx.moveTo(x - 10, y - 8);  // Top left
        ctx.lineTo(x + 10, y - 8);  // Top right
        ctx.lineTo(x + 8, y + 12);  // Bottom right
        ctx.lineTo(x - 8, y + 12);  // Bottom left
        ctx.closePath();
        ctx.fill();

        // Cup sleeve (brown band)
        ctx.fillStyle = '#8B4513'; // Brown
        ctx.beginPath();
        ctx.moveTo(x - 9, y - 2);
        ctx.lineTo(x + 9, y - 2);
        ctx.lineTo(x + 8, y + 6);
        ctx.lineTo(x - 8, y + 6);
        ctx.closePath();
        ctx.fill();

        // Cup lid
        ctx.fillStyle = '#654321';
        ctx.fillRect(x - 11, y - 12, 22, 4);
        ctx.fillStyle = '#8B4513';
        ctx.fillRect(x - 3, y - 14, 6, 3); // Lid opening

        ctx.shadowBlur = 0;

        // Steam (3 animated wavy lines)
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.6)';
        ctx.lineWidth = 1.5;
        for (let i = 0; i < 3; i++) {
            const steamX = x - 4 + i * 4;
            const waveOffset = this.steamOffset + i * 0.8;
            const steamHeight = 8 + Math.sin(waveOffset) * 2;

            ctx.beginPath();
            ctx.moveTo(steamX, y - 14);
            // Wavy steam rising
            ctx.quadraticCurveTo(
                steamX + Math.sin(waveOffset) * 4,
                y - 14 - steamHeight / 2,
                steamX + Math.sin(waveOffset + 1) * 3,
                y - 14 - steamHeight
            );
            ctx.stroke();
        }

        // "COFFEE" tiny label (optional)
        ctx.fillStyle = '#654321';
        ctx.font = 'bold 5px "Courier New", monospace';
        ctx.textAlign = 'center';
        ctx.fillText('☕', x, y + 3);
    }

    // Bounding box for collision
    get width() { return this.radius * 2; }
    get height() { return this.radius * 2; }
    get left() { return this.x - this.radius; }
    get top() { return this.y - this.radius; }
}

const collectibles = [];

// Jetpack Fuel system (resource-based)
let jetpackFuel = 0; // 0 to 100
const JETPACK_MAX_FUEL = 100;
const JETPACK_FUEL_PER_PICKUP = 40; // +40 fuel per booster collected
const JETPACK_THRUST = -1.2; // Upward thrust force per frame
const JETPACK_FUEL_CONSUMPTION = 0.5; // Fuel used per frame while thrusting
const JETPACK_MAX_UP_VELOCITY = -12; // Cap upward speed

// Booster collectible class
class Booster {
    constructor(x, y) {
        this.width = 30;
        this.height = 30;
        this.x = x || canvas.width;
        this.y = y || canvas.height - 200;
        this.color = '#00AAFF'; // Blue
        this.pulseOffset = Math.random() * Math.PI * 2;
        this.particles = []; // Decorative particles around the booster
        this.type = 'booster';
    }

    update() {
        this.x -= gameSpeed;
        this.pulseOffset += 0.1;

        // Update decorative particles
        if (Math.random() < 0.3) {
            this.particles.push({
                x: this.x + this.width / 2 + (Math.random() - 0.5) * 20,
                y: this.y + this.height / 2 + (Math.random() - 0.5) * 20,
                vx: (Math.random() - 0.5) * 2,
                vy: (Math.random() - 0.5) * 2,
                life: 20,
                size: 3 + Math.random() * 3
            });
        }

        for (let i = this.particles.length - 1; i >= 0; i--) {
            const p = this.particles[i];
            p.x += p.vx;
            p.y += p.vy;
            p.life--;
            if (p.life <= 0) {
                this.particles.splice(i, 1);
            }
        }
    }

    draw() {
        const x = this.x;
        const y = this.y;
        const w = this.width;
        const h = this.height;
        const pulse = Math.sin(this.pulseOffset) * 0.3 + 0.7;

        // Draw particles first (behind)
        for (const p of this.particles) {
            const alpha = p.life / 20;
            ctx.fillStyle = `rgba(0, 170, 255, ${alpha * 0.6})`;
            ctx.beginPath();
            ctx.arc(p.x, p.y, p.size * alpha, 0, Math.PI * 2);
            ctx.fill();
        }

        // Glow effect
        ctx.shadowColor = '#00AAFF';
        ctx.shadowBlur = 20 * pulse;

        // Chip base (dark background)
        ctx.fillStyle = '#1a1a2e';
        ctx.fillRect(x, y, w, h);

        // Chip border (metallic)
        ctx.strokeStyle = '#00AAFF';
        ctx.lineWidth = 2;
        ctx.strokeRect(x + 1, y + 1, w - 2, h - 2);

        // Chip pins (left and right sides)
        ctx.fillStyle = '#C0C0C0';
        for (let i = 0; i < 4; i++) {
            // Left pins
            ctx.fillRect(x - 4, y + 4 + i * 6, 5, 3);
            // Right pins
            ctx.fillRect(x + w - 1, y + 4 + i * 6, 5, 3);
        }
        // Top and bottom pins
        for (let i = 0; i < 3; i++) {
            ctx.fillRect(x + 5 + i * 8, y - 4, 3, 5);
            ctx.fillRect(x + 5 + i * 8, y + h - 1, 3, 5);
        }

        // Inner circuit pattern
        ctx.strokeStyle = '#00FFFF';
        ctx.lineWidth = 1;
        // Horizontal lines
        ctx.beginPath();
        ctx.moveTo(x + 5, y + 10);
        ctx.lineTo(x + w - 5, y + 10);
        ctx.moveTo(x + 5, y + h - 10);
        ctx.lineTo(x + w - 5, y + h - 10);
        ctx.stroke();
        // Vertical lines
        ctx.beginPath();
        ctx.moveTo(x + 10, y + 5);
        ctx.lineTo(x + 10, y + h - 5);
        ctx.moveTo(x + w - 10, y + 5);
        ctx.lineTo(x + w - 10, y + h - 5);
        ctx.stroke();

        // Central brain/AI core (pulsing)
        ctx.fillStyle = `rgba(0, 170, 255, ${pulse})`;
        ctx.beginPath();
        ctx.arc(x + w / 2, y + h / 2, 6, 0, Math.PI * 2);
        ctx.fill();

        // Brain pattern (simplified neural network)
        ctx.strokeStyle = `rgba(0, 255, 255, ${pulse * 0.8})`;
        ctx.lineWidth = 1;
        ctx.beginPath();
        // Neural connections
        ctx.moveTo(x + w / 2, y + h / 2 - 6);
        ctx.lineTo(x + w / 2 - 5, y + 6);
        ctx.moveTo(x + w / 2, y + h / 2 - 6);
        ctx.lineTo(x + w / 2 + 5, y + 6);
        ctx.moveTo(x + w / 2, y + h / 2 + 6);
        ctx.lineTo(x + w / 2 - 5, y + h - 6);
        ctx.moveTo(x + w / 2, y + h / 2 + 6);
        ctx.lineTo(x + w / 2 + 5, y + h - 6);
        ctx.stroke();

        ctx.shadowBlur = 0;

        // "AI" label
        ctx.fillStyle = '#FFFFFF';
        ctx.font = 'bold 8px "Courier New", monospace';
        ctx.textAlign = 'center';
        ctx.fillText('AI', x + w / 2, y + h / 2 + 3);
    }
}

const boosters = [];

// Thrust particles for active jetpack
const thrustParticles = [];

function spawnThrustParticles() {
    // Emit 2-3 particles per frame when thrusting
    for (let i = 0; i < 2 + Math.random(); i++) {
        thrustParticles.push({
            x: player.x + player.width / 2 + (Math.random() - 0.5) * 20,
            y: player.y + player.height,
            vx: (Math.random() - 0.5) * 3,
            vy: 3 + Math.random() * 4, // Downward velocity
            life: 15 + Math.random() * 10,
            size: 4 + Math.random() * 6,
            color: Math.random() < 0.5 ? '#FF6600' : '#FFAA00' // Orange/yellow fire
        });
    }
}

function updateThrustParticles() {
    for (let i = thrustParticles.length - 1; i >= 0; i--) {
        const p = thrustParticles[i];
        p.x += p.vx - gameSpeed; // Move with game scroll
        p.y += p.vy;
        p.vy += 0.1; // Slight gravity on particles
        p.life--;
        p.size *= 0.95; // Shrink over time
        if (p.life <= 0 || p.size < 1) {
            thrustParticles.splice(i, 1);
        }
    }
}

function drawThrustParticles() {
    for (const p of thrustParticles) {
        const alpha = p.life / 25;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fillStyle = p.color.replace(')', `, ${alpha})`).replace('rgb', 'rgba').replace('#FF6600', `rgba(255, 102, 0, ${alpha})`).replace('#FFAA00', `rgba(255, 170, 0, ${alpha})`);
        // Simpler approach for hex colors
        if (p.color === '#FF6600') {
            ctx.fillStyle = `rgba(255, 102, 0, ${alpha})`;
        } else {
            ctx.fillStyle = `rgba(255, 170, 0, ${alpha})`;
        }
        ctx.fill();
    }
}

// Fast Fall wind trail particles
const fastFallParticles = [];

function spawnFastFallParticles() {
    // Emit wind lines moving upward from player
    for (let i = 0; i < 2; i++) {
        fastFallParticles.push({
            x: player.x + Math.random() * player.width,
            y: player.y + player.height * 0.3,
            vy: -8 - Math.random() * 6, // Upward velocity (wind effect)
            life: 8 + Math.random() * 6,
            length: 10 + Math.random() * 15,
            alpha: 0.6 + Math.random() * 0.4
        });
    }
}

function updateFastFallParticles() {
    for (let i = fastFallParticles.length - 1; i >= 0; i--) {
        const p = fastFallParticles[i];
        p.x -= gameSpeed; // Move with game scroll
        p.y += p.vy;
        p.life--;
        p.alpha *= 0.9;
        if (p.life <= 0 || p.alpha < 0.1) {
            fastFallParticles.splice(i, 1);
        }
    }
}

function drawFastFallParticles() {
    ctx.strokeStyle = '#FFFFFF';
    ctx.lineWidth = 2;
    for (const p of fastFallParticles) {
        ctx.globalAlpha = p.alpha;
        ctx.beginPath();
        ctx.moveTo(p.x, p.y);
        ctx.lineTo(p.x, p.y - p.length);
        ctx.stroke();
    }
    ctx.globalAlpha = 1;
}

class Projectile {
    constructor(x, y) {
        this.x = x;
        this.y = y - 10; // Offset up to better hit flying obstacles
        this.width = 30;
        this.height = 35; // Taller hitbox to hit flying obstacles easier
        this.speed = 14;
        this.trail = []; // Speed trail positions
    }

    update() {
        // Store trail positions
        this.trail.push({ x: this.x, y: this.y + this.height / 2 });
        if (this.trail.length > 8) {
            this.trail.shift();
        }
        this.x += this.speed;
    }

    draw() {
        // Draw speed trail
        for (let i = 0; i < this.trail.length; i++) {
            const t = this.trail[i];
            const alpha = (i / this.trail.length) * 0.5;
            const width = (i / this.trail.length) * 15;
            ctx.strokeStyle = `rgba(0, 255, 255, ${alpha})`;
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(t.x - width, t.y);
            ctx.lineTo(t.x, t.y);
            ctx.stroke();
        }

        // Glow effect
        ctx.shadowColor = '#00FFFF';
        ctx.shadowBlur = 12;

        // Draw code syntax "</>" symbol
        ctx.fillStyle = '#00FFFF';
        ctx.font = 'bold 14px "Courier New", monospace';
        ctx.textAlign = 'center';
        ctx.fillText('</>', this.x + this.width / 2, this.y + this.height / 2 + 5);

        // Outer brackets glow
        ctx.fillStyle = '#FFFFFF';
        ctx.font = 'bold 16px "Courier New", monospace';
        ctx.fillText('{ }', this.x + this.width / 2, this.y + this.height / 2 + 5);

        ctx.shadowBlur = 0;
    }
}

const projectiles = [];
let lastShotTime = 0;
const shootCooldown = 500;

// Impact effects (floating text when hitting obstacles)
const impactEffects = [];

function spawnImpactEffect(x, y, type) {
    const messages = {
        'bug': ['Bug Fixed!', 'Refactored!', 'Clean Code!', 'Debugged!'],
        'pochange': ['Scope Handled!', 'Requirements Met!', 'Change Accepted!'],
        'flying': ['Ping Dismissed!', 'Notification Off!', '@Handled!']
    };
    const colors = {
        'bug': '#00FF00',
        'pochange': '#CC66FF',
        'flying': '#FFAA00'
    };

    const msgList = messages[type] || messages['bug'];
    const text = msgList[Math.floor(Math.random() * msgList.length)];

    impactEffects.push({
        x: x,
        y: y,
        text: text,
        color: colors[type] || '#00FF00',
        life: 60,
        maxLife: 60,
        vy: -2 // Float upward
    });
}

function updateImpactEffects() {
    for (let i = impactEffects.length - 1; i >= 0; i--) {
        const e = impactEffects[i];
        e.y += e.vy;
        e.x -= gameSpeed * 0.5; // Drift with game scroll
        e.life--;
        if (e.life <= 0) {
            impactEffects.splice(i, 1);
        }
    }
}

function drawImpactEffects() {
    for (const e of impactEffects) {
        const alpha = e.life / e.maxLife;
        const scale = 1 + (1 - alpha) * 0.5; // Grow slightly as it fades

        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.fillStyle = e.color;
        ctx.font = `bold ${12 * scale}px "Courier New", monospace`;
        ctx.textAlign = 'center';
        ctx.shadowColor = e.color;
        ctx.shadowBlur = 10;
        ctx.fillText(e.text, e.x, e.y);
        ctx.restore();
    }
    ctx.globalAlpha = 1;
    ctx.shadowBlur = 0;
}

// Ground and Platform classes
class GroundBlock {
    constructor(x, width) {
        this.x = x;
        this.width = width;
        this.height = 100;
        this.y = canvas.height - this.height;
        this.color = '#333';
        this.type = 'ground';
    }

    update() {
        this.x -= gameSpeed;
    }

    draw() {
        ctx.fillStyle = this.color;
        ctx.fillRect(this.x, this.y, this.width, this.height);
        // Top edge highlight
        ctx.fillStyle = '#444';
        ctx.fillRect(this.x, this.y, this.width, 4);
    }

    getTopY() {
        return this.y;
    }
}

class Platform {
    constructor(x, y, width) {
        this.x = x;
        this.y = y;
        this.width = width;
        this.height = 12;
        this.color = '#00FF88';
        this.type = 'platform';
    }

    update() {
        this.x -= gameSpeed;
    }

    draw() {
        // Neon glow effect
        ctx.shadowColor = this.color;
        ctx.shadowBlur = 10;
        ctx.fillStyle = this.color;
        ctx.fillRect(this.x, this.y, this.width, this.height);
        ctx.shadowBlur = 0;

        // Inner line
        ctx.fillStyle = '#AAFFCC';
        ctx.fillRect(this.x + 2, this.y + 2, this.width - 4, 2);
    }

    getTopY() {
        return this.y;
    }
}

const groundBlocks = [];
const platforms = [];

// ==========================================
// CYBERPUNK PARALLAX BACKGROUND SYSTEM
// ==========================================

// FAR LAYER: Retro-wave grid + binary code rain
class FarBackgroundLayer {
    constructor() {
        this.gridOffset = 0;
        this.gridSpacing = 60;
        this.horizonY = canvas.height * 0.4; // Horizon line

        // Binary code rain
        this.binaryColumns = [];
        const columnCount = Math.ceil(canvas.width / 25);
        for (let i = 0; i < columnCount; i++) {
            this.binaryColumns.push({
                x: i * 25,
                chars: [],
                speed: 0.3 + Math.random() * 0.5,
                nextSpawn: Math.random() * 100
            });
        }
    }

    update() {
        // Scroll grid
        this.gridOffset = (this.gridOffset + gameSpeed * 0.15) % this.gridSpacing;

        // Update binary rain
        for (let col of this.binaryColumns) {
            // Move existing chars down
            for (let char of col.chars) {
                char.y += col.speed * gameSpeed * 0.5;
                char.opacity -= 0.003;
            }
            // Remove faded chars
            col.chars = col.chars.filter(c => c.opacity > 0 && c.y < canvas.height);

            // Spawn new chars
            col.nextSpawn -= gameSpeed * 0.3;
            if (col.nextSpawn <= 0) {
                col.chars.push({
                    y: 0,
                    value: Math.random() > 0.5 ? '1' : '0',
                    opacity: 0.15 + Math.random() * 0.2
                });
                col.nextSpawn = 30 + Math.random() * 60;
            }
        }
    }

    draw() {
        const bottomY = canvas.height; // Extend grid to full canvas height

        // Draw retro-wave grid on the "floor" (perspective effect)
        ctx.strokeStyle = 'rgba(0, 255, 136, 0.08)'; // Neon green, very subtle
        ctx.lineWidth = 1;

        // Horizontal lines (receding into distance) - extend to bottom
        const lineCount = 20;
        for (let i = 0; i < lineCount; i++) {
            const t = i / lineCount;
            const y = this.horizonY + (bottomY - this.horizonY) * Math.pow(t, 0.7);
            const alpha = 0.03 + t * 0.08;
            ctx.strokeStyle = `rgba(0, 255, 136, ${alpha})`;
            ctx.beginPath();
            ctx.moveTo(0, y);
            ctx.lineTo(canvas.width, y);
            ctx.stroke();
        }

        // Vertical lines (converging to horizon) - extend to bottom
        const verticalLines = 20;
        for (let i = 0; i <= verticalLines; i++) {
            const baseX = (i / verticalLines) * canvas.width;
            const offsetX = ((baseX - canvas.width / 2) * 0.3);

            ctx.strokeStyle = 'rgba(0, 255, 136, 0.05)';
            ctx.beginPath();
            ctx.moveTo(canvas.width / 2 + offsetX - this.gridOffset * 0.5, this.horizonY);
            ctx.lineTo(baseX - this.gridOffset, bottomY);
            ctx.stroke();
        }

        // Draw binary code rain
        ctx.font = '12px "Courier New", monospace';
        for (let col of this.binaryColumns) {
            for (let char of col.chars) {
                const greenShade = Math.floor(80 + char.opacity * 100);
                ctx.fillStyle = `rgba(0, ${greenShade}, 50, ${char.opacity})`;
                ctx.fillText(char.value, col.x, char.y);
            }
        }
    }
}

// MIDDLE LAYER: Server rack / city building silhouettes
class MidBackgroundLayer {
    constructor() {
        this.buildings = [];
        this.initBuildings();
    }

    initBuildings() {
        this.buildings = [];
        let x = 0;
        while (x < canvas.width + 200) {
            const isServerRack = Math.random() > 0.4;
            const width = isServerRack ? 40 + Math.random() * 30 : 60 + Math.random() * 80;
            const height = isServerRack ? 150 + Math.random() * 200 : 100 + Math.random() * 250;

            this.buildings.push({
                x: x,
                width: width,
                height: height,
                isServerRack: isServerRack,
                windowRows: Math.floor(height / 25),
                windowCols: Math.floor(width / 15),
                lights: this.generateLights(isServerRack, Math.floor(height / 25), Math.floor(width / 15))
            });
            x += width + 20 + Math.random() * 40;
        }
    }

    generateLights(isServerRack, rows, cols) {
        const lights = [];
        for (let r = 0; r < rows; r++) {
            for (let c = 0; c < cols; c++) {
                if (Math.random() < (isServerRack ? 0.7 : 0.3)) {
                    lights.push({
                        row: r,
                        col: c,
                        on: Math.random() > 0.3,
                        blinkRate: Math.random() * 0.02,
                        phase: Math.random() * Math.PI * 2
                    });
                }
            }
        }
        return lights;
    }

    update() {
        const speed = gameSpeed * 0.4;

        for (let building of this.buildings) {
            building.x -= speed;

            // Update blinking lights
            for (let light of building.lights) {
                light.phase += light.blinkRate;
            }
        }

        // Remove off-screen buildings and add new ones
        this.buildings = this.buildings.filter(b => b.x + b.width > -50);

        if (this.buildings.length > 0) {
            const rightmost = this.buildings.reduce((max, b) => Math.max(max, b.x + b.width), 0);
            if (rightmost < canvas.width + 100) {
                const isServerRack = Math.random() > 0.4;
                const width = isServerRack ? 40 + Math.random() * 30 : 60 + Math.random() * 80;
                const height = isServerRack ? 150 + Math.random() * 200 : 100 + Math.random() * 250;

                this.buildings.push({
                    x: rightmost + 20 + Math.random() * 40,
                    width: width,
                    height: height,
                    isServerRack: isServerRack,
                    windowRows: Math.floor(height / 25),
                    windowCols: Math.floor(width / 15),
                    lights: this.generateLights(isServerRack, Math.floor(height / 25), Math.floor(width / 15))
                });
            }
        }
    }

    draw() {
        const floorY = canvas.height - 100;

        for (let building of this.buildings) {
            // Building silhouette - extends all the way to bottom of canvas
            const buildingTop = floorY - building.height;
            const buildingFullHeight = canvas.height - buildingTop; // Extend to canvas bottom

            ctx.fillStyle = '#1a1a1a';
            ctx.fillRect(building.x, buildingTop, building.width, buildingFullHeight);

            // Building outline glow (only on visible part above ground)
            ctx.strokeStyle = 'rgba(0, 170, 255, 0.1)';
            ctx.lineWidth = 1;
            ctx.strokeRect(building.x, buildingTop, building.width, building.height);

            // Draw lights/LEDs
            for (let light of building.lights) {
                const lx = building.x + 5 + light.col * 15;
                const ly = buildingTop + 10 + light.row * 25;

                if (building.isServerRack) {
                    // Server rack LEDs - small, blinking
                    const blink = Math.sin(light.phase) > 0;
                    if (blink) {
                        const colors = ['#00ff00', '#ff6600', '#00aaff', '#ff0000'];
                        ctx.fillStyle = colors[Math.floor(light.phase * 2) % colors.length];
                        ctx.globalAlpha = 0.6;
                        ctx.fillRect(lx, ly, 3, 3);
                        ctx.globalAlpha = 1;
                    }
                } else {
                    // Building windows - larger, some lit
                    if (light.on) {
                        ctx.fillStyle = 'rgba(255, 200, 100, 0.15)';
                        ctx.fillRect(lx, ly, 8, 12);
                    }
                }
            }
        }
    }
}

// NEAR LAYER: Fast data streams / particles
class NearBackgroundLayer {
    constructor() {
        this.particles = [];
        this.dataStreams = [];

        // Initialize particles
        for (let i = 0; i < 30; i++) {
            this.particles.push(this.createParticle());
        }

        // Initialize data streams
        for (let i = 0; i < 5; i++) {
            this.dataStreams.push(this.createDataStream());
        }
    }

    createParticle() {
        return {
            x: Math.random() * canvas.width,
            y: Math.random() * canvas.height,
            size: 1 + Math.random() * 2,
            speed: 2 + Math.random() * 3,
            opacity: 0.1 + Math.random() * 0.3,
            color: Math.random() > 0.7 ? '#00aaff' : '#ffffff'
        };
    }

    createDataStream() {
        return {
            x: canvas.width + Math.random() * 200,
            y: 50 + Math.random() * (canvas.height - 200),
            length: 50 + Math.random() * 150,
            speed: 8 + Math.random() * 6,
            opacity: 0.1 + Math.random() * 0.15,
            thickness: 1 + Math.random() * 2
        };
    }

    update() {
        // Update particles
        for (let p of this.particles) {
            p.x -= p.speed * gameSpeed * 0.3;

            if (p.x < -10) {
                p.x = canvas.width + 10;
                p.y = Math.random() * canvas.height;
            }
        }

        // Update data streams
        for (let stream of this.dataStreams) {
            stream.x -= stream.speed * gameSpeed * 0.2;

            if (stream.x + stream.length < 0) {
                stream.x = canvas.width + Math.random() * 100;
                stream.y = 50 + Math.random() * (canvas.height - 200);
                stream.length = 50 + Math.random() * 150;
                stream.opacity = 0.1 + Math.random() * 0.15;
            }
        }
    }

    draw() {
        // Draw dust particles
        for (let p of this.particles) {
            ctx.fillStyle = p.color;
            ctx.globalAlpha = p.opacity;
            ctx.beginPath();
            ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
            ctx.fill();
        }
        ctx.globalAlpha = 1;

        // Draw data streams (horizontal light trails)
        for (let stream of this.dataStreams) {
            const gradient = ctx.createLinearGradient(stream.x, 0, stream.x + stream.length, 0);
            gradient.addColorStop(0, `rgba(0, 170, 255, 0)`);
            gradient.addColorStop(0.3, `rgba(0, 170, 255, ${stream.opacity})`);
            gradient.addColorStop(1, `rgba(0, 255, 255, ${stream.opacity * 0.5})`);

            ctx.strokeStyle = gradient;
            ctx.lineWidth = stream.thickness;
            ctx.beginPath();
            ctx.moveTo(stream.x, stream.y);
            ctx.lineTo(stream.x + stream.length, stream.y);
            ctx.stroke();
        }
    }
}

// Initialize cyberpunk background layers
const farLayer = new FarBackgroundLayer();
const midLayer = new MidBackgroundLayer();
const nearLayer = new NearBackgroundLayer();

const player = {
    x: 100,
    y: 0,
    width: 50,
    height: 50,
    baseHeight: 50, // Original height for crouch calculations
    velocityY: 0,
    jumpPower: -18,
    gravity: 0.8,
    color: '#FFA500',
    grounded: false,
    lastY: 0,
    isCrouching: false,
    isFastFalling: false,
    wasThrusting: false,

    update() {
        this.lastY = this.y;

        // Fast Fall: in air + holding Down/S (overrides jetpack)
        const wantsFastFall = !this.grounded && keys.down;
        this.isFastFalling = wantsFastFall;

        // Handle fast fall hitbox (crouch in air)
        if (this.isFastFalling && !this.isCrouching) {
            // Shrink hitbox to crouched size for diving under obstacles
            const newHeight = this.baseHeight * CROUCH_HEIGHT_RATIO;
            this.height = newHeight;
            // Don't adjust Y - we're in the air, top stays same
            this.isCrouching = true;
        }

        // Jetpack thrust: Shift key + has fuel + NOT fast falling
        const isThrusting = keys.left && jetpackFuel > 0 && !this.isFastFalling;

        // Handle jetpack sound start/stop
        if (isThrusting && !this.wasThrusting) {
            soundManager.startJetpack();
        } else if (!isThrusting && this.wasThrusting) {
            soundManager.stopJetpack();
        }
        this.wasThrusting = isThrusting;

        if (this.isFastFalling) {
            // Fast fall: apply extra gravity and set minimum downward velocity
            if (this.velocityY < FAST_FALL_MIN_VELOCITY) {
                this.velocityY = FAST_FALL_MIN_VELOCITY;
            }
            this.velocityY += FAST_FALL_ACCELERATION;
            // Spawn wind trail particles
            spawnFastFallParticles();
        } else if (isThrusting) {
            // Apply thrust to counteract/overcome gravity
            this.velocityY += JETPACK_THRUST;
            // Cap upward velocity
            if (this.velocityY < JETPACK_MAX_UP_VELOCITY) {
                this.velocityY = JETPACK_MAX_UP_VELOCITY;
            }
            // Consume fuel
            jetpackFuel -= JETPACK_FUEL_CONSUMPTION;
            if (jetpackFuel < 0) jetpackFuel = 0;
            // Spawn thrust particles
            spawnThrustParticles();
            // Jetpack lifts off ground
            this.grounded = false;
        }

        // Always apply gravity
        this.velocityY += this.gravity;

        // Cap maximum fall speed to prevent clipping through ground
        const maxFallSpeed = 25;
        if (this.velocityY > maxFallSpeed) {
            this.velocityY = maxFallSpeed;
        }

        this.y += this.velocityY;

        // Prevent flying off top of screen
        if (this.y < 0) {
            this.y = 0;
            this.velocityY = 0;
        }

        this.grounded = false;

        // Check collision with all surfaces (improved for high speeds)
        const surfaces = getAllSurfaces();
        for (let surface of surfaces) {
            // Only check if player is falling
            if (this.velocityY >= 0) {
                const playerBottom = this.y + this.height;
                const lastPlayerBottom = this.lastY + this.height;
                const surfaceTop = surface.getTopY();

                // Check horizontal overlap
                const horizontalOverlap = this.x + this.width > surface.x && this.x < surface.x + surface.width;

                // Improved collision: check if player crossed or is at surface level
                // This handles high-speed falls by checking the entire movement range
                if (horizontalOverlap && lastPlayerBottom <= surfaceTop && playerBottom >= surfaceTop) {
                    this.y = surfaceTop - this.height;
                    this.velocityY = 0;
                    this.grounded = true;
                    this.isFastFalling = false;
                    break;
                }
            }
        }

        // Handle crouching (only when not fast falling - fast fall manages its own crouch state)
        if (!this.isFastFalling) {
            this.updateCrouch();
        }
    },

    updateCrouch() {
        const wantsToCrouch = keys.down && this.grounded;

        if (wantsToCrouch && !this.isCrouching) {
            // Start crouching: reduce height, move y down to keep feet on ground
            const newHeight = this.baseHeight * CROUCH_HEIGHT_RATIO;
            const heightDiff = this.height - newHeight;
            this.height = newHeight;
            this.y += heightDiff; // Move down so feet stay on ground
            this.isCrouching = true;
            soundManager.crouch();
        } else if (!wantsToCrouch && this.isCrouching) {
            // Stop crouching: restore height, move y up
            const heightDiff = this.baseHeight - this.height;
            this.height = this.baseHeight;
            this.y -= heightDiff; // Move up to restore position
            this.isCrouching = false;
        }
    },

    draw() {
        const isThrusting = keys.left && jetpackFuel > 0 && !this.isFastFalling;
        const x = this.x;
        const y = this.y;
        const w = this.width;
        const h = this.height;

        // Animation values
        const legSwing = this.grounded ? Math.sin(gameFrame * 0.3) * 8 : 0;
        const breathe = Math.sin(gameFrame * 0.1) * 1;

        // State-based glow
        if (this.isFastFalling) {
            ctx.shadowColor = '#FFFFFF';
            ctx.shadowBlur = 20;
        } else if (isThrusting) {
            ctx.shadowColor = '#00AAFF';
            ctx.shadowBlur = 25;
        } else if (jetpackFuel > 0) {
            ctx.shadowColor = '#00AAFF';
            ctx.shadowBlur = 10;
        }

        if (this.isCrouching) {
            // === CROUCHING POSE (huddled over laptop) ===
            const crouchY = y; // Top of crouched hitbox

            // Legs (tucked under)
            ctx.fillStyle = '#333';
            ctx.fillRect(x + 10, crouchY + h - 8, 12, 8);
            ctx.fillRect(x + w - 22, crouchY + h - 8, 12, 8);

            // Body (compressed hoodie)
            ctx.fillStyle = this.isFastFalling ? '#FFCC00' : '#FFA500';
            ctx.fillRect(x + 5, crouchY + 5, w - 10, h - 13);

            // Head (ducked down)
            ctx.fillStyle = '#2a2a2a';
            ctx.beginPath();
            ctx.arc(x + w / 2, crouchY + 8, 10, 0, Math.PI * 2);
            ctx.fill();

            // Glasses
            ctx.fillStyle = '#FFFFFF';
            ctx.fillRect(x + w / 2 - 9, crouchY + 5, 7, 4);
            ctx.fillRect(x + w / 2 + 2, crouchY + 5, 7, 4);
            ctx.fillStyle = '#87CEEB';
            ctx.fillRect(x + w / 2 - 8, crouchY + 6, 5, 2);
            ctx.fillRect(x + w / 2 + 3, crouchY + 6, 5, 2);

            // Laptop (held close)
            ctx.fillStyle = '#C0C0C0';
            ctx.fillRect(x + 12, crouchY + h - 15, 26, 4);
            ctx.fillStyle = '#87CEEB';
            ctx.fillRect(x + 14, crouchY + h - 22, 22, 7);

        } else if (!this.grounded) {
            // === JUMPING/FALLING POSE ===
            const jumpTuck = Math.min(this.velocityY * 0.3, 5);

            // Legs (bent up for jump)
            ctx.fillStyle = '#333';
            // Left leg bent
            ctx.save();
            ctx.translate(x + 15, y + h - 15);
            ctx.rotate(-0.4);
            ctx.fillRect(-3, 0, 8, 12);
            ctx.restore();
            // Right leg bent
            ctx.save();
            ctx.translate(x + w - 15, y + h - 15);
            ctx.rotate(0.4);
            ctx.fillRect(-5, 0, 8, 12);
            ctx.restore();

            // Body (hoodie)
            ctx.fillStyle = isThrusting ? '#00AAFF' : (this.isFastFalling ? '#FFCC00' : '#FFA500');
            ctx.fillRect(x + 8, y + 18, w - 16, h - 33);

            // Hood detail
            ctx.fillStyle = isThrusting ? '#0088CC' : '#E59400';
            ctx.fillRect(x + 12, y + 18, w - 24, 5);

            // Head
            ctx.fillStyle = '#2a2a2a';
            ctx.beginPath();
            ctx.arc(x + w / 2, y + 12, 11, 0, Math.PI * 2);
            ctx.fill();

            // Hair tuft
            ctx.fillStyle = '#1a1a1a';
            ctx.beginPath();
            ctx.moveTo(x + w / 2 - 5, y + 3);
            ctx.lineTo(x + w / 2, y - 2);
            ctx.lineTo(x + w / 2 + 5, y + 3);
            ctx.fill();

            // Glasses
            ctx.fillStyle = '#FFFFFF';
            ctx.fillRect(x + w / 2 - 10, y + 9, 8, 5);
            ctx.fillRect(x + w / 2 + 2, y + 9, 8, 5);
            ctx.fillStyle = isThrusting ? '#00FFFF' : '#87CEEB';
            ctx.fillRect(x + w / 2 - 9, y + 10, 6, 3);
            ctx.fillRect(x + w / 2 + 3, y + 10, 6, 3);

            // Arms holding laptop
            ctx.fillStyle = isThrusting ? '#00AAFF' : '#FFA500';
            ctx.fillRect(x + 3, y + 22, 8, 15);
            ctx.fillRect(x + w - 11, y + 22, 8, 15);

            // Laptop
            ctx.fillStyle = '#C0C0C0';
            ctx.fillRect(x + 10, y + 35, 30, 5);
            ctx.fillStyle = isThrusting ? '#00FFFF' : '#87CEEB';
            ctx.fillRect(x + 12, y + 26, 26, 9);

            // Screen glow
            if (isThrusting) {
                ctx.fillStyle = 'rgba(0, 255, 255, 0.5)';
                ctx.fillRect(x + 14, y + 27, 22, 7);
            }

            // Jetpack flame from laptop!
            if (isThrusting) {
                const flameHeight = 15 + Math.random() * 10;
                const flameWidth = 20 + Math.random() * 5;
                ctx.fillStyle = '#FF6600';
                ctx.beginPath();
                ctx.moveTo(x + w / 2 - flameWidth / 2, y + 40);
                ctx.lineTo(x + w / 2, y + 40 + flameHeight);
                ctx.lineTo(x + w / 2 + flameWidth / 2, y + 40);
                ctx.fill();
                ctx.fillStyle = '#FFFF00';
                ctx.beginPath();
                ctx.moveTo(x + w / 2 - flameWidth / 4, y + 40);
                ctx.lineTo(x + w / 2, y + 40 + flameHeight * 0.6);
                ctx.lineTo(x + w / 2 + flameWidth / 4, y + 40);
                ctx.fill();
            }

        } else {
            // === RUNNING POSE (grounded) ===

            // Legs (animated swing)
            ctx.fillStyle = '#333';
            // Left leg
            ctx.save();
            ctx.translate(x + 15, y + h - 18);
            ctx.rotate(legSwing * 0.05);
            ctx.fillRect(-4, 0, 8, 18);
            ctx.restore();
            // Right leg
            ctx.save();
            ctx.translate(x + w - 15, y + h - 18);
            ctx.rotate(-legSwing * 0.05);
            ctx.fillRect(-4, 0, 8, 18);
            ctx.restore();

            // Body (hoodie)
            ctx.fillStyle = '#FFA500';
            ctx.fillRect(x + 8, y + 15 + breathe, w - 16, h - 33);

            // Hood detail
            ctx.fillStyle = '#E59400';
            ctx.fillRect(x + 12, y + 15 + breathe, w - 24, 5);

            // Head
            ctx.fillStyle = '#2a2a2a';
            ctx.beginPath();
            ctx.arc(x + w / 2, y + 10, 11, 0, Math.PI * 2);
            ctx.fill();

            // Hair tuft
            ctx.fillStyle = '#1a1a1a';
            ctx.beginPath();
            ctx.moveTo(x + w / 2 - 5, y + 1);
            ctx.lineTo(x + w / 2, y - 4);
            ctx.lineTo(x + w / 2 + 5, y + 1);
            ctx.fill();

            // Glasses
            ctx.fillStyle = '#FFFFFF';
            ctx.fillRect(x + w / 2 - 10, y + 7, 8, 5);
            ctx.fillRect(x + w / 2 + 2, y + 7, 8, 5);
            ctx.fillStyle = '#87CEEB';
            ctx.fillRect(x + w / 2 - 9, y + 8, 6, 3);
            ctx.fillRect(x + w / 2 + 3, y + 8, 6, 3);

            // Arms holding laptop (slight bob)
            ctx.fillStyle = '#FFA500';
            ctx.fillRect(x + 3, y + 20 + breathe, 8, 15);
            ctx.fillRect(x + w - 11, y + 20 + breathe, 8, 15);

            // Laptop
            ctx.fillStyle = '#C0C0C0';
            ctx.fillRect(x + 10, y + 33 + breathe, 30, 5);
            ctx.fillStyle = '#87CEEB';
            ctx.fillRect(x + 12, y + 24 + breathe, 26, 9);

            // Code on screen (animated)
            ctx.fillStyle = '#00FF00';
            const codeOffset = (gameFrame % 20) * 2;
            for (let i = 0; i < 3; i++) {
                const lineWidth = 8 + ((gameFrame + i * 7) % 12);
                ctx.fillRect(x + 14, y + 26 + breathe + i * 3, lineWidth, 1);
            }
        }

        ctx.shadowBlur = 0;
    },

    jump() {
        // Can't jump while crouching
        if (this.grounded && !this.isCrouching) {
            this.velocityY = this.jumpPower;
            this.grounded = false;
            soundManager.jump();
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
        soundManager.shoot();
        lastShotTime = now;
        ammo--;
    }
}

// ============================================
// PATTERN-BASED TERRAIN GENERATOR (HARD MODE)
// Precision and reflexes required
// ============================================

// Constants for level generation - HARD MODE (terrain) + FAIR (obstacles)
const MAX_GAP_WIDTH = 200; // Pushed to jump limit
const MIN_GAP_WIDTH = 160; // Wider minimum gaps
const ENTRY_BUFFER = 120; // Safe landing zone - plenty of time to react!
const EXIT_BUFFER = 150; // Safe exit - lots of space before jumps
const CONNECTOR_WIDTH = 200; // Connectors between patterns

// FAIR obstacle spacing - time to breathe between actions
const BASE_OBSTACLE_SPACING = 350; // More space between obstacles
const SPEED_SPACING_FACTOR = 12; // Good buffer at high speeds
const RHYTHMIC_SPAWN_INTERVAL = 450; // Slower rhythm - time to react

// HARD MODE terrain constants (keep the cool geometry!)
const STEP_HEIGHT = 50; // Height change for terrain steps
const HARD_ISLAND_MIN = 150; // Tiny landing zones
const HARD_ISLAND_MAX = 250; // Still small

// Pattern types
const PATTERN_TYPES = ['sprint', 'island_hopping', 'high_road', 'risk_reward'];

// Global tracking for cross-pattern obstacle spacing
let lastObstacleX = 0;

// Calculate minimum obstacle distance - fair spacing
function getMinObstacleDistance() {
    return BASE_OBSTACLE_SPACING + (gameSpeed * SPEED_SPACING_FACTOR);
}

// ============================================
// CRITICAL: Grounding Check System
// Ensures obstacles only spawn on solid ground
// ============================================
function getGroundHeightAt(xPos) {
    // Check all ground blocks and platforms for the surface at this X
    for (const block of groundBlocks) {
        if (xPos >= block.x && xPos <= block.x + block.width) {
            return block.getTopY();
        }
    }
    for (const plat of platforms) {
        if (xPos >= plat.x && xPos <= plat.x + plat.width) {
            return plat.getTopY();
        }
    }
    return null; // No ground at this position (it's a gap!)
}

function hasGroundAt(xPos) {
    return getGroundHeightAt(xPos) !== null;
}

// Terrain Generator state
const terrainGenerator = {
    lastPatternType: null,
    needsConnector: false,

    // Select next pattern (avoid repeating same pattern)
    selectNextPattern() {
        let available = PATTERN_TYPES.filter(p => p !== this.lastPatternType);
        const selected = available[Math.floor(Math.random() * available.length)];
        this.lastPatternType = selected;
        return selected;
    },

    // ==========================================
    // MINI-CONNECTOR: Safe Zone (250px)
    // Allows player to land and reset before next pattern
    // ==========================================
    generateConnector(startX) {
        const ground = new GroundBlock(startX, CONNECTOR_WIDTH);
        groundBlocks.push(ground);

        // Optional coffee reward in connector (15% chance)
        if (Math.random() < 0.15) {
            const floorY = canvas.height - 100;
            collectibles.push(new Collectible(startX + CONNECTOR_WIDTH / 2, floorY - 80));
        }

        // Reset obstacle tracking for fair play
        lastObstacleType = null;
        lastSpawnWasPOChange = false;

        return startX + CONNECTOR_WIDTH;
    },

    // ==========================================
    // PATTERN: "The Sprint" (~1200px) - HARD MODE
    // UNEVEN TERRAIN with height steps
    // Can't zone out - must micro-adjust jumps
    // ==========================================
    generateSprint(startX) {
        const floorY = canvas.height - 100;
        const totalWidth = 1200 + Math.random() * 200; // 1200-1400px
        const endX = startX + totalWidth;

        // HARD MODE: Break into stepped segments instead of flat ground
        const segmentCount = 4 + Math.floor(Math.random() * 2); // 4-5 segments
        const segmentWidth = totalWidth / segmentCount;

        let x = startX;
        let currentHeight = floorY; // Track current ground height
        let obstacleIndex = 0;

        for (let seg = 0; seg < segmentCount; seg++) {
            // STEP UP or DOWN randomly (+/- 50px)
            if (seg > 0) {
                const stepDirection = Math.random() < 0.5 ? -1 : 1;
                currentHeight += stepDirection * STEP_HEIGHT;
                // Clamp to reasonable range
                currentHeight = Math.max(floorY - 100, Math.min(floorY + 50, currentHeight));
            }

            // Create ground segment at current height
            const segWidth = segmentWidth + (Math.random() - 0.5) * 50;
            const ground = new GroundBlock(x, segWidth);
            ground.y = currentHeight;
            ground.height = canvas.height - currentHeight;
            groundBlocks.push(ground);

            const surfaceY = ground.getTopY();

            // EDGE GUARDING: Spawn obstacle near START of segment (20px in)
            const obstacleX = x + ENTRY_BUFFER + Math.random() * 30;

            if (obstacleX < x + segWidth - EXIT_BUFFER) {
                // Cycle through obstacle types
                const pattern = ['ground', 'flying', 'ground', 'pochange', 'ground'];
                const obstacleType = pattern[obstacleIndex % pattern.length];

                if (obstacleType === 'ground') {
                    obstacles.push(new Obstacle(obstacleX, surfaceY));
                    lastObstacleType = 'ground';
                } else if (obstacleType === 'flying') {
                    obstacles.push(new FlyingObstacle(obstacleX, surfaceY));
                    lastObstacleType = 'flying';
                } else if (obstacleType === 'pochange') {
                    obstacles.push(new POChange(obstacleX, surfaceY));
                    lastObstacleType = 'pochange';
                }

                lastObstacleX = obstacleX;
                obstacleIndex++;
            }

            // Maybe add another obstacle near END of segment (edge guarding!)
            if (segWidth > 300 && Math.random() < 0.6) {
                const edgeObstacleX = x + segWidth - EXIT_BUFFER - 30;
                if (edgeObstacleX - lastObstacleX >= 200) {
                    obstacles.push(new Obstacle(edgeObstacleX, surfaceY));
                    lastObstacleType = 'ground';
                    lastObstacleX = edgeObstacleX;
                }
            }

            x += segWidth;
        }

        // Coffee reward at end (10% chance)
        if (Math.random() < 0.1) {
            collectibles.push(new Collectible(endX - 60, currentHeight - 80));
        }

        return endX;
    },

    // ==========================================
    // PATTERN: "Island Hopping" (~1400px) - HARD MODE
    // PRECISION MODE: Tiny platforms, wide gaps
    // Must land PERFECTLY - no room for error
    // ==========================================
    generateIslandHopping(startX) {
        const floorY = canvas.height - 100;
        let x = startX;
        const islandCount = 4 + Math.floor(Math.random() * 2); // 4-5 islands (more jumps!)
        const minDist = getMinObstacleDistance();

        for (let i = 0; i < islandCount; i++) {
            // Gap before island (except first) - HARD MODE: wider gaps!
            if (i > 0) {
                // Gaps pushed to jump limit (160-200px)
                const gapWidth = MIN_GAP_WIDTH + Math.random() * (MAX_GAP_WIDTH - MIN_GAP_WIDTH);

                // HARD MODE: Fewer helper platforms (40% chance)
                // Player must make the full jump more often
                if (Math.random() < 0.4) {
                    const platformWidth = 80 + Math.random() * 40; // Smaller helpers
                    const platformY = floorY - 90 - Math.random() * 30;
                    const platformX = x + gapWidth / 2 - platformWidth / 2;
                    platforms.push(new Platform(platformX, platformY, platformWidth));

                    // Coffee on platform (15% chance - reward for risky route)
                    if (Math.random() < 0.15) {
                        collectibles.push(new Collectible(platformX + platformWidth / 2, platformY - 35));
                    }
                }

                x += gapWidth;
            }

            // HARD MODE: Tiny islands (150-250px) - precision landing required!
            const islandWidth = HARD_ISLAND_MIN + Math.random() * (HARD_ISLAND_MAX - HARD_ISLAND_MIN);
            const island = new GroundBlock(x, islandWidth);
            groundBlocks.push(island);

            // EDGE GUARDING: Obstacle near the EDGE of tiny island (70% chance)
            // Forces early jump or quick reaction on landing
            if (Math.random() < 0.7) {
                const groundY = island.getTopY();

                // Spawn near the far edge (must jump quickly after landing!)
                const obstacleX = x + islandWidth - EXIT_BUFFER - 20 - Math.random() * 30;

                if (obstacleX > x + ENTRY_BUFFER && obstacleX - lastObstacleX >= minDist * 0.7) {
                    // 70% bugs, 30% flying
                    if (Math.random() < 0.7) {
                        obstacles.push(new Obstacle(obstacleX, groundY));
                        lastObstacleType = 'ground';
                    } else {
                        obstacles.push(new FlyingObstacle(obstacleX, groundY));
                        lastObstacleType = 'flying';
                    }
                    lastObstacleX = obstacleX;
                }
            }

            x += islandWidth;
        }

        // Booster reward at end (20% chance - earned it!)
        if (Math.random() < 0.2) {
            boosters.push(new Booster(x - 80, floorY - 150));
        }

        return x;
    },

    // ==========================================
    // PATTERN: "The High Road" (~1200px) - HARD MODE
    // EXTREME VERTICALITY: Wild height swings
    // Includes scary "drop down" platforms
    // ==========================================
    generateHighRoad(startX) {
        const floorY = canvas.height - 100;
        const totalWidth = 1100 + Math.random() * 200;
        const minDist = getMinObstacleDistance();

        const platformCount = 5 + Math.floor(Math.random() * 2); // 5-6 platforms
        const segmentWidth = totalWidth / platformCount;

        let x = startX;
        let lastPlatformY = floorY - 120; // Start higher

        for (let i = 0; i < platformCount; i++) {
            let platformY;

            // HARD MODE: Wild height variations
            if (i === 0) {
                // First platform at starting height
                platformY = lastPlatformY;
            } else if (Math.random() < 0.3) {
                // GAP TRAP (30%): Platform LOWER than previous - scary drop!
                platformY = lastPlatformY + 60 + Math.random() * 40; // Drop 60-100px
                platformY = Math.min(platformY, floorY - 60); // Don't go below safe height
            } else if (Math.random() < 0.5) {
                // HIGH JUMP: Platform much higher than previous
                platformY = lastPlatformY - 70 - Math.random() * 50; // Jump up 70-120px
                platformY = Math.max(platformY, floorY - 250); // Don't go too high
            } else {
                // Normal variation
                const heightVariation = (Math.random() - 0.5) * 80;
                platformY = lastPlatformY + heightVariation;
            }

            // Clamp to playable range
            platformY = Math.max(floorY - 250, Math.min(floorY - 60, platformY));

            // Bigger platforms for fair play with flying obstacles
            const platformWidth = 200 + Math.random() * 80; // 200-280px (was 120-180)
            const platformX = x + (segmentWidth - platformWidth) / 2;

            platforms.push(new Platform(platformX, platformY, platformWidth));

            // Flying obstacle only on SOME platforms (35% chance, was 60%)
            // And only in the MIDDLE of platform - not at landing zone!
            if (i > 0 && Math.random() < 0.35) {
                // Spawn in CENTER of platform - gives time to land, then duck
                const flyingX = platformX + platformWidth / 2 - 30 + Math.random() * 60;
                obstacles.push(new FlyingObstacle(flyingX, platformY));
                lastObstacleType = 'flying';
                lastObstacleX = flyingX;
            }

            // Coffee on HIGH platforms (reward for reaching them)
            if (platformY < floorY - 150 && Math.random() < 0.2) {
                collectibles.push(new Collectible(platformX + platformWidth / 2, platformY - 35));
            }

            lastPlatformY = platformY;
            x += segmentWidth;
        }

        // Booster on highest platform (25% chance)
        if (Math.random() < 0.25) {
            // Find the highest platform
            let highestPlat = platforms[platforms.length - platformCount];
            for (let i = platforms.length - platformCount; i < platforms.length; i++) {
                if (platforms[i].y < highestPlat.y) {
                    highestPlat = platforms[i];
                }
            }
            boosters.push(new Booster(highestPlat.x + highestPlat.width / 2 - 15, highestPlat.y - 55));
        }

        return startX + totalWidth;
    },

    // ==========================================
    // PATTERN: "Risk & Reward" (~1300px) - HARD MODE
    // Lower path is DANGEROUS, upper path requires precision
    // ==========================================
    generateRiskReward(startX) {
        const floorY = canvas.height - 100;
        const totalWidth = 1200 + Math.random() * 200;
        const minDist = getMinObstacleDistance();

        // Lower path: ground with DENSE obstacles (tighter rhythm)
        const ground = new GroundBlock(startX, totalWidth);
        groundBlocks.push(ground);

        const surfaceY = ground.getTopY();

        // HARD MODE: Faster rhythm (300px) and more obstacles
        let currentX = startX + ENTRY_BUFFER;
        while (currentX < startX + totalWidth - EXIT_BUFFER) {
            if (currentX - lastObstacleX >= minDist * 0.8) {
                // Mix of obstacle types
                const roll = Math.random();
                if (roll < 0.5) {
                    obstacles.push(new Obstacle(currentX, surfaceY));
                    lastObstacleType = 'ground';
                } else if (roll < 0.8) {
                    obstacles.push(new FlyingObstacle(currentX, surfaceY));
                    lastObstacleType = 'flying';
                } else {
                    obstacles.push(new POChange(currentX, surfaceY));
                    lastObstacleType = 'pochange';
                }
                lastObstacleX = currentX;
            }
            currentX += 300; // Tighter rhythm
        }

        // Upper path: HARDER to reach platforms (smaller, varying heights)
        const upperPlatformCount = 4; // More platforms
        const upperSpacing = (totalWidth - 150) / upperPlatformCount;
        let x = startX + 80;

        for (let i = 0; i < upperPlatformCount; i++) {
            // HARD MODE: Smaller platforms (100-150px)
            const platformWidth = 100 + Math.random() * 50;
            // More vertical variation
            const platformY = floorY - 130 - (i % 2) * 50 - Math.random() * 30;

            platforms.push(new Platform(x, platformY, platformWidth));

            // Rewards spread across platforms
            if (i === 1) {
                boosters.push(new Booster(x + platformWidth / 2 - 15, platformY - 45));
            } else if (Math.random() < 0.25) {
                collectibles.push(new Collectible(x + platformWidth / 2, platformY - 35));
            }

            x += upperSpacing;
        }

        return startX + totalWidth;
    },

    // Main pattern generator - with MINI-CONNECTORS for pacing
    generatePattern(startX) {
        // Add connector before new pattern (allows landing/reset)
        if (this.needsConnector) {
            startX = this.generateConnector(startX);
        }
        this.needsConnector = true;

        const patternType = this.selectNextPattern();

        switch (patternType) {
            case 'sprint':
                return this.generateSprint(startX);
            case 'island_hopping':
                return this.generateIslandHopping(startX);
            case 'high_road':
                return this.generateHighRoad(startX);
            case 'risk_reward':
                return this.generateRiskReward(startX);
            default:
                return this.generateSprint(startX);
        }
    },

    // Reset state for new game
    reset() {
        this.lastPatternType = null;
        this.needsConnector = false;
    }
};

// Terrain initialization
function initTerrain() {
    groundBlocks.length = 0;
    platforms.length = 0;
    terrainGenerator.reset();

    // Start with comfortable safe zone for player to get ready
    let x = 0;
    groundBlocks.push(new GroundBlock(x, 500)); // Safe starting area
    x += 500;

    // Generate initial patterns
    while (x < canvas.width + 800) {
        x = terrainGenerator.generatePattern(x);
    }
}

function updateTerrain() {
    // Update ground blocks
    for (let i = groundBlocks.length - 1; i >= 0; i--) {
        groundBlocks[i].update();
        if (groundBlocks[i].x + groundBlocks[i].width < 0) {
            groundBlocks.splice(i, 1);
        }
    }

    // Update platforms
    for (let i = platforms.length - 1; i >= 0; i--) {
        platforms[i].update();
        if (platforms[i].x + platforms[i].width < 0) {
            platforms.splice(i, 1);
        }
    }

    // Generate new patterns as needed (check both ground and platforms for rightmost edge)
    const rightmostGround = groundBlocks.reduce((max, g) => Math.max(max, g.x + g.width), 0);
    const rightmostPlatform = platforms.reduce((max, p) => Math.max(max, p.x + p.width), 0);
    const rightmostTerrain = Math.max(rightmostGround, rightmostPlatform);

    if (rightmostTerrain < canvas.width + 500) {
        terrainGenerator.generatePattern(rightmostTerrain);
    }
}

function drawTerrain() {
    for (let block of groundBlocks) {
        block.draw();
    }
    for (let platform of platforms) {
        platform.draw();
    }
}

// Get all surfaces for collision
function getAllSurfaces() {
    return [...groundBlocks, ...platforms];
}

function resetGame() {
    player.x = 100;
    player.height = player.baseHeight; // Reset height in case crouching
    player.y = canvas.height - 100 - player.height;
    player.velocityY = 0;
    player.grounded = true;
    player.lastY = player.y;
    player.isCrouching = false;
    player.isFastFalling = false;
    obstacles.length = 0;
    collectibles.length = 0;
    projectiles.length = 0;
    boosters.length = 0;
    thrustParticles.length = 0;
    fastFallParticles.length = 0;
    impactEffects.length = 0;
    gameSpeed = 6;
    score = 0;
    ammo = 3;
    lastSpawnWasPOChange = false;
    lastObstacleType = null;
    lastObstacleX = 0; // Reset cross-pattern obstacle tracking
    keys.down = false;
    keys.up = false;
    keys.left = false;
    jetpackFuel = 0; // Start with no fuel
    isGameOver = false;
    initTerrain();
    soundManager.startMusic(); // Restart background music
}

function drawStartScreen() {
    // Cyberpunk gradient background
    const gradient = ctx.createLinearGradient(0, 0, 0, canvas.height);
    gradient.addColorStop(0, '#000022');
    gradient.addColorStop(0.5, '#0a0a2e');
    gradient.addColorStop(1, '#111');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Animated grid lines (background effect)
    ctx.strokeStyle = 'rgba(0, 255, 136, 0.1)';
    ctx.lineWidth = 1;
    for (let i = 0; i < 20; i++) {
        const y = (i * 40 + gameFrame * 0.5) % canvas.height;
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(canvas.width, y);
        ctx.stroke();
    }

    // Glowing title
    const pulse = Math.sin(gameFrame * 0.05) * 0.3 + 0.7;
    ctx.shadowColor = '#FFA500';
    ctx.shadowBlur = 30 * pulse;
    ctx.fillStyle = '#FFA500';
    ctx.font = 'bold 56px "Courier New", monospace';
    ctx.textAlign = 'center';
    ctx.fillText('BOLDARE RUN', canvas.width / 2, 120);

    ctx.shadowBlur = 15 * pulse;
    ctx.fillStyle = '#00FFFF';
    ctx.font = 'bold 28px "Courier New", monospace';
    ctx.fillText('Sprint to MVP', canvas.width / 2, 160);
    ctx.shadowBlur = 0;

    // Controls section
    const controlsY = 220;
    ctx.fillStyle = '#00FF88';
    ctx.font = 'bold 22px "Courier New", monospace';
    ctx.fillText('< CONTROLS >', canvas.width / 2, controlsY);

    ctx.font = '18px "Courier New", monospace';
    ctx.fillStyle = '#FFFFFF';
    const controls = [
        ['↑ / SPACE', 'Jump'],
        ['←', 'Jetpack (hold)'],
        ['→', 'Shoot Hotfix'],
        ['↓', 'Crouch / Dive'],
        ['M', 'Toggle Music']
    ];

    controls.forEach((ctrl, i) => {
        ctx.fillStyle = '#00AAFF';
        ctx.textAlign = 'right';
        ctx.fillText(ctrl[0], canvas.width / 2 - 20, controlsY + 35 + i * 28);
        ctx.fillStyle = '#FFFFFF';
        ctx.textAlign = 'left';
        ctx.fillText(ctrl[1], canvas.width / 2 + 20, controlsY + 35 + i * 28);
    });

    // Obstacles section
    const obstaclesY = controlsY + 185;
    ctx.textAlign = 'center';
    ctx.fillStyle = '#FF6600';
    ctx.font = 'bold 22px "Courier New", monospace';
    ctx.fillText('< OBSTACLES >', canvas.width / 2, obstaclesY);

    ctx.font = '16px "Courier New", monospace';
    const obstacles = [
        ['#FF0000', 'Bug (Red)', 'Jump over or Shoot'],
        ['#9932CC', 'Scope Creep (Purple)', 'Must Shoot!'],
        ['#FF6600', 'Ping (Orange)', 'Crouch under or Shoot']
    ];

    obstacles.forEach((obs, i) => {
        // Color indicator
        ctx.fillStyle = obs[0];
        ctx.fillRect(canvas.width / 2 - 200, obstaclesY + 20 + i * 30, 15, 15);
        // Name
        ctx.fillStyle = '#FFFFFF';
        ctx.textAlign = 'left';
        ctx.fillText(obs[1], canvas.width / 2 - 175, obstaclesY + 33 + i * 30);
        // Action
        ctx.fillStyle = '#888888';
        ctx.textAlign = 'right';
        ctx.fillText(obs[2], canvas.width / 2 + 200, obstaclesY + 33 + i * 30);
    });

    // Collectibles section
    const collectY = obstaclesY + 130;
    ctx.textAlign = 'center';
    ctx.fillStyle = '#00FFFF';
    ctx.font = 'bold 22px "Courier New", monospace';
    ctx.fillText('< POWER-UPS >', canvas.width / 2, collectY);

    ctx.font = '16px "Courier New", monospace';
    ctx.fillStyle = '#8B4513';
    ctx.fillText('☕ Coffee = +1 Ammo', canvas.width / 2 - 100, collectY + 30);
    ctx.fillStyle = '#00AAFF';
    ctx.fillText('🔲 AI Chip = Jetpack Fuel', canvas.width / 2 + 100, collectY + 30);

    // Start prompt (blinking)
    if (Math.floor(gameFrame * 0.05) % 2 === 0) {
        ctx.shadowColor = '#00FF00';
        ctx.shadowBlur = 20;
        ctx.fillStyle = '#00FF00';
        ctx.font = 'bold 28px "Courier New", monospace';
        ctx.textAlign = 'center';
        ctx.fillText('[ PRESS SPACE TO START ]', canvas.width / 2, canvas.height - 80);
        ctx.shadowBlur = 0;
    }

    // High score
    if (highScore > 0) {
        ctx.fillStyle = '#FFD700';
        ctx.font = '18px "Courier New", monospace';
        ctx.fillText('Best Sprint: ' + highScore, canvas.width / 2, canvas.height - 40);
    }

    // Increment frame for animations
    gameFrame++;
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

    // Draw terrain (ground blocks and platforms)
    drawTerrain();

    // Draw near layer (in front of terrain, behind player)
    nearLayer.draw();
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

    // Crouch indicator
    if (player.isCrouching) {
        ctx.fillStyle = '#FFD700';
        ctx.font = 'bold 16px "Courier New", monospace';
        ctx.fillText('CROUCHING', 20, 65);
    }

    // AI Power (Fuel) bar - vertical bar on left side
    const barX = 20;
    const barY = 90;
    const barWidth = 20;
    const barHeight = 150;
    const fuelPercent = jetpackFuel / JETPACK_MAX_FUEL;

    // Background
    ctx.fillStyle = '#222';
    ctx.fillRect(barX, barY, barWidth, barHeight);

    // Fuel fill (from bottom up)
    if (jetpackFuel > 0) {
        const fillHeight = barHeight * fuelPercent;
        ctx.fillStyle = '#00AAFF';
        ctx.shadowColor = '#00AAFF';
        ctx.shadowBlur = fuelPercent > 0.3 ? 10 : 5;
        ctx.fillRect(barX, barY + barHeight - fillHeight, barWidth, fillHeight);
        ctx.shadowBlur = 0;
    }

    // Border
    ctx.strokeStyle = jetpackFuel > 0 ? '#00AAFF' : '#444';
    ctx.lineWidth = 2;
    ctx.strokeRect(barX, barY, barWidth, barHeight);

    // Label
    ctx.fillStyle = jetpackFuel > 0 ? '#00AAFF' : '#666';
    ctx.font = 'bold 10px "Courier New", monospace';
    ctx.textAlign = 'center';
    ctx.fillText('AI', barX + barWidth / 2, barY - 5);

    // Fuel percentage text
    if (jetpackFuel > 0) {
        ctx.fillStyle = '#FFFFFF';
        ctx.font = 'bold 12px "Courier New", monospace';
        ctx.fillText(Math.floor(jetpackFuel), barX + barWidth / 2, barY + barHeight + 15);
    }
}

function gameLoop() {
    // Show start screen if game hasn't started
    if (!isGameStarted) {
        drawStartScreen();
        requestAnimationFrame(gameLoop);
        return;
    }

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
    nearLayer.update();

    // Update terrain
    updateTerrain();

    // Update score and animation frame
    score++;
    gameFrame++;

    // Speed scaling every 500 points
    if (score % 500 === 0 && gameSpeed < maxSpeed) {
        gameSpeed += 0.5;
    }

    // Obstacles and collectibles are now spawned in generateTerrainChunk()
    // They scroll in naturally with their parent platforms

    // Update and draw obstacles
    for (let i = obstacles.length - 1; i >= 0; i--) {
        obstacles[i].update();
        obstacles[i].draw();

        // Check collision
        if (checkCollision(player, obstacles[i])) {
            isGameOver = true;
            soundManager.stopJetpack();
            soundManager.stopMusic();
            soundManager.gameOver();
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
            soundManager.collect();
            console.log('Coffee grabbed! +1 Hotfix ammo');
            continue;
        }

        // Remove off-screen collectibles
        if (collectibles[i].x + collectibles[i].radius < 0) {
            collectibles.splice(i, 1);
        }
    }

    // Update and draw boosters
    for (let i = boosters.length - 1; i >= 0; i--) {
        boosters[i].update();
        boosters[i].draw();

        // Check collision with player
        if (checkCollision(player, boosters[i])) {
            boosters.splice(i, 1);
            // Add fuel (stackable, up to max)
            jetpackFuel += JETPACK_FUEL_PER_PICKUP;
            if (jetpackFuel > JETPACK_MAX_FUEL) {
                jetpackFuel = JETPACK_MAX_FUEL;
            }
            score += 100;
            soundManager.collect();
            console.log('AI Booster collected! +' + JETPACK_FUEL_PER_PICKUP + ' fuel. Total: ' + Math.floor(jetpackFuel));
            continue;
        }

        // Remove off-screen boosters
        if (boosters[i].x + boosters[i].width < 0) {
            boosters.splice(i, 1);
        }
    }

    // Update and draw thrust particles
    updateThrustParticles();
    drawThrustParticles();

    // Update and draw fast fall particles
    updateFastFallParticles();
    drawFastFallParticles();

    // Update and draw impact effects
    updateImpactEffects();
    drawImpactEffects();

    // Update and draw projectiles
    for (let i = projectiles.length - 1; i >= 0; i--) {
        projectiles[i].update();
        projectiles[i].draw();

        // Check collision with obstacles
        let hitObstacle = false;
        for (let j = obstacles.length - 1; j >= 0; j--) {
            if (checkCollision(projectiles[i], obstacles[j])) {
                const obstacle = obstacles[j];
                const hitX = obstacle.x + obstacle.width / 2;
                const hitY = obstacle.y;

                // Spawn impact effect
                spawnImpactEffect(hitX, hitY, obstacle.type);

                const wasPoChange = obstacle.type === 'pochange';
                obstacles.splice(j, 1);
                hitObstacle = true;
                soundManager.explosion();
                if (wasPoChange) {
                    score += 100;
                } else {
                    score += 25;
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

    // Check pit death (fell off screen)
    if (player.y > canvas.height) {
        isGameOver = true;
        soundManager.stopJetpack();
        soundManager.stopMusic();
        soundManager.gameOver();
        if (score > highScore) {
            highScore = score;
            localStorage.setItem('boldareRunHighScore', highScore);
        }
    }

    player.draw();
    requestAnimationFrame(gameLoop);
}

window.addEventListener('resize', resizeCanvas);

// Keydown handler
window.addEventListener('keydown', (e) => {
    // Jump: Space or Arrow Up
    if (e.code === 'Space' || e.code === 'ArrowUp') {
        e.preventDefault();
        keys.up = true;
        // Start game from start screen
        if (!isGameStarted) {
            isGameStarted = true;
            soundManager.init(); // Initialize audio on first user interaction
            soundManager.startMusic(); // Start background music
            return;
        }
        if (isGameOver) {
            resetGame();
        } else {
            player.jump();
        }
    }
    // Jetpack: Left Arrow
    if (e.code === 'ArrowLeft') {
        e.preventDefault();
        keys.left = true;
    }
    // Shoot: Right Arrow
    if (e.code === 'ArrowRight') {
        e.preventDefault();
        shoot();
    }
    // Crouch/Dive: Down Arrow
    if (e.code === 'ArrowDown') {
        e.preventDefault();
        keys.down = true;
    }
    // Toggle Music: M key
    if (e.code === 'KeyM') {
        const muted = soundManager.toggleMusic();
        console.log('Music ' + (muted ? 'muted' : 'unmuted'));
    }
});

// Keyup handler for releasing keys
window.addEventListener('keyup', (e) => {
    if (e.code === 'ArrowDown') {
        keys.down = false;
    }
    if (e.code === 'Space' || e.code === 'ArrowUp') {
        keys.up = false;
    }
    if (e.code === 'ArrowLeft') {
        keys.left = false;
    }
});

resizeCanvas();
initTerrain();
gameLoop();
