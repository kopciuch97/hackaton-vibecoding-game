# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

"Boldare Run: Sprint to MVP" - A browser-based 2D endless runner game using HTML5 Canvas and vanilla JavaScript. No build tools or dependencies.

## Running the Game

Open `index.html` directly in a browser. No server required.

## Architecture

**Single-file game engine in `game.js`:**
- All game logic in one file (~770 lines)
- No external dependencies or frameworks
- Canvas 2D rendering with `requestAnimationFrame` game loop

**Key Classes:**
- `Obstacle`, `POChange`, `FlyingObstacle` - three obstacle types requiring different player actions
- `Collectible` - ammo pickups
- `Projectile` - player shooting mechanic
- `GroundBlock`, `Platform` - procedurally generated terrain
- `BackgroundLayer` - parallax scrolling backgrounds

**Player object** (not a class) contains movement, physics, collision, and crouch state.

**Terrain generation:** `generateTerrainChunk()` creates ground blocks with gaps, platforms, obstacles, and collectibles. Fair play constants (`ENTRY_BUFFER`, `EXIT_BUFFER`, `MIN_GROUND_WIDTH`) ensure obstacles spawn in reachable positions.

## Development Guidelines

- Keep all logic in `game.js` - single file architecture preferred
- Use Canvas primitives (rects/circles) for graphics
- When fixing bugs, read the file content first before making changes
- Iterate without breaking existing features
- Brand colors: Orange #FFA500, Black #111, White #FFF

## Game Mechanics Reference

See `CONTEXT.md` for complete game rules including controls, obstacle types, scoring, and terrain generation parameters.


# CLAUDE CODE INSTRUCTIONS

## COMMANDS
- **update-rules**: Update `context.md` based on `game.js`. You must ONLY replace the content between `` and ``. Keep all other sections intact.

## BEHAVIORS
- **Sync Logic:** When updating rules, read values directly from code constants (e.g., `GRAVITY`, `JUMP_FORCE`).
- **Formatting:** Maintain the Markdown table format for Controls and Obstacles.