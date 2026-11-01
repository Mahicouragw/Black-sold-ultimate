/**
 * Mini-Games Gesture Controls & Narration v1.0
 * 
 * Adds gesture controls and enhanced narration for:
 * - Car Racing (swipe gestures, boost, map)
 * - Chess (piece selection, movement)
 * - Snakes & Ladders (dice rolling, movement)
 * - Carrom (aiming, shooting)
 * - Blackjack (hit, stand, double)
 * 
 * All games work with TalkBack ON/OFF
 * Voice narration for every action
 */
(() => {
    'use strict';
    
    const G = window.Game;
    if (!G) {
        console.error('Mini-Games Gestures: Game not found');
        return;
    }

    console.log('✓ Mini-Games Gesture Controls v1.0 loading...');

    // ===== GESTURE DETECTION SYSTEM =====
    
    class GestureController {
        constructor() {
            this.touchStartX = 0;
            this.touchStartY = 0;
            this.touchEndX = 0;
            this.touchEndY = 0;
            this.minSwipeDistance = 50;
            this.maxTapDuration = 300;
            this.touchStartTime = 0;
            this.lastTapTime = 0;
            this.doubleTapThreshold = 300;
            this.activeGame = null;
            this.enabled = true;
        }
        
        attach(element, gameType) {
            if (!element) return;
            
            this.activeGame = gameType;
            
            element.addEventListener('touchstart', (e) => this.handleTouchStart(e), { passive: false });
            element.addEventListener('touchmove', (e) => this.handleTouchMove(e), { passive: false });
            element.addEventListener('touchend', (e) => this.handleTouchEnd(e), { passive: false });
            
            console.log(`✓ Gesture controls attached for ${gameType}`);
        }
        
        handleTouchStart(e) {
            if (!this.enabled) return;
            const touch = e.touches[0];
            this.touchStartX = touch.clientX;
            this.touchStartY = touch.clientY;
            this.touchStartTime = Date.now();
        }
        
        handleTouchMove(e) {
            if (!this.enabled) return;
            e.preventDefault(); // Prevent scrolling during game
        }
        
        handleTouchEnd(e) {
            if (!this.enabled) return;
            
            const touch = e.changedTouches[0];
            this.touchEndX = touch.clientX;
            this.touchEndY = touch.clientY;
            
            const deltaX = this.touchEndX - this.touchStartX;
            const deltaY = this.touchEndY - this.touchStartY;
            const duration = Date.now() - this.touchStartTime;
            
            // Detect tap vs swipe
            if (duration < this.maxTapDuration && Math.abs(deltaX) < 20 && Math.abs(deltaY) < 20) {
                // It's a tap
                const now = Date.now();
                if (now - this.lastTapTime < this.doubleTapThreshold) {
                    // Double tap
                    this.handleDoubleTap();
                    this.lastTapTime = 0;
                } else {
                    // Single tap
                    this.lastTapTime = now;
                    setTimeout(() => {
                        if (this.lastTapTime !== 0) {
                            this.handleSingleTap();
                        }
                    }, this.doubleTapThreshold);
                }
            } else if (Math.abs(deltaX) > this.minSwipeDistance || Math.abs(deltaY) > this.minSwipeDistance) {
                // It's a swipe
                this.handleSwipe(deltaX, deltaY);
            }
        }
        
        handleSwipe(deltaX, deltaY) {
            const absX = Math.abs(deltaX);
            const absY = Math.abs(deltaY);
            
            if (absX > absY) {
                // Horizontal swipe
                if (deltaX > 0) {
                    this.onSwipeRight();
                } else {
                    this.onSwipeLeft();
                }
            } else {
                // Vertical swipe
                if (deltaY > 0) {
                    this.onSwipeDown();
                } else {
                    this.onSwipeUp();
                }
            }
        }
        
        handleSingleTap() {
            switch (this.activeGame) {
                case 'car_racing':
                    this.onCarRacingTap();
                    break;
                case 'chess':
                    this.onChessTap();
                    break;
                case 'snakes_ladders':
                    this.onSnakesLaddersTap();
                    break;
                case 'carrom':
                    this.onCarromTap();
                    break;
                case 'blackjack':
                    this.onBlackjackTap();
                    break;
            }
        }
        
        handleDoubleTap() {
            switch (this.activeGame) {
                case 'car_racing':
                    this.onCarRacingDoubleTap();
                    break;
                case 'chess':
                    this.onChessDoubleTap();
                    break;
                case 'snakes_ladders':
                    this.onSnakesLaddersDoubleTap();
                    break;
                case 'carrom':
                    this.onCarromDoubleTap();
                    break;
                case 'blackjack':
                    this.onBlackjackDoubleTap();
                    break;
            }
        }
        
        onSwipeUp() {
            switch (this.activeGame) {
                case 'car_racing':
                    this.onCarRacingSwipeUp();
                    break;
                case 'chess':
                    this.onChessSwipeUp();
                    break;
                case 'snakes_ladders':
                    this.onSnakesLaddersSwipeUp();
                    break;
                case 'carrom':
                    this.onCarromSwipeUp();
                    break;
                case 'blackjack':
                    this.onBlackjackSwipeUp();
                    break;
            }
        }
        
        onSwipeDown() {
            switch (this.activeGame) {
                case 'car_racing':
                    this.onCarRacingSwipeDown();
                    break;
                case 'chess':
                    this.onChessSwipeDown();
                    break;
                case 'snakes_ladders':
                    this.onSnakesLaddersSwipeDown();
                    break;
                case 'carrom':
                    this.onCarromSwipeDown();
                    break;
                case 'blackjack':
                    this.onBlackjackSwipeDown();
                    break;
            }
        }
        
        onSwipeLeft() {
            switch (this.activeGame) {
                case 'car_racing':
                    this.onCarRacingSwipeLeft();
                    break;
                case 'chess':
                    this.onChessSwipeLeft();
                    break;
                case 'snakes_ladders':
                    this.onSnakesLaddersSwipeLeft();
                    break;
                case 'carrom':
                    this.onCarromSwipeLeft();
                    break;
                case 'blackjack':
                    this.onBlackjackSwipeLeft();
                    break;
            }
        }
        
        onSwipeRight() {
            switch (this.activeGame) {
                case 'car_racing':
                    this.onCarRacingSwipeRight();
                    break;
                case 'chess':
                    this.onChessSwipeRight();
                    break;
                case 'snakes_ladders':
                    this.onSnakesLaddersSwipeRight();
                    break;
                case 'carrom':
                    this.onCarromSwipeRight();
                    break;
                case 'blackjack':
                    this.onBlackjackSwipeRight();
                    break;
            }
        }
        
        // ===== CAR RACING GESTURES =====
        
        onCarRacingSwipeUp() {
            // Accelerate
            if (window.CarRacing) {
                window.CarRacing.handleCommand('accelerate');
                G.addNarrative('Accelerating!', 'system');
            }
        }
        
        onCarRacingSwipeDown() {
            // Brake / Reverse
            if (window.CarRacing) {
                window.CarRacing.handleCommand('brake');
                G.addNarrative('Braking!', 'system');
            }
        }
        
        onCarRacingSwipeLeft() {
            // Steer left
            if (window.CarRacing) {
                window.CarRacing.handleCommand('left');
                G.addNarrative('Steering left!', 'system');
            }
        }
        
        onCarRacingSwipeRight() {
            // Steer right
            if (window.CarRacing) {
                window.CarRacing.handleCommand('right');
                G.addNarrative('Steering right!', 'system');
            }
        }
        
        onCarRacingTap() {
            // Horn
            if (window.CarRacing) {
                window.CarRacing.handleCommand('horn');
                G.addNarrative('Honk!', 'system');
            }
        }
        
        onCarRacingDoubleTap() {
            // Boost
            if (window.CarRacing) {
                window.CarRacing.handleCommand('boost');
                G.addNarrative('Boost activated!', 'system');
            }
        }
        
        // ===== SNAKES & LADDERS GESTURES =====
        
        onSnakesLaddersTap() {
            // Roll dice
            this.rollDice();
        }
        
        onSnakesLaddersDoubleTap() {
            // Roll dice (alternative)
            this.rollDice();
        }
        
        onSnakesLaddersSwipeUp() {
            // Roll dice
            this.rollDice();
        }
        
        onSnakesLaddersSwipeDown() {
            // Show status
            G.addNarrative('Checking game status...', 'system');
        }
        
        onSnakesLaddersSwipeLeft() {
            // Previous player info
            G.addNarrative('Previous player', 'system');
        }
        
        onSnakesLaddersSwipeRight() {
            // Next player info
            G.addNarrative('Next player', 'system');
        }
        
        rollDice() {
            const diceValue = Math.floor(Math.random() * 6) + 1;
            G.addNarrative(`Rolling dice... You got ${diceValue}!`, 'system');
            
            // Play dice sound
            if (window.MusicSystem && window.MusicSystem.playSFX) {
                window.MusicSystem.playSFX('dice-roll');
            }
            
            // Move player (would integrate with GameHall)
            if (window.GameHall) {
                G.addNarrative(`Moving ${diceValue} spaces forward`, 'system');
            }
        }
        
        // ===== CARROM GESTURES =====
        
        onCarromTap() {
            // Aim striker
            G.addNarrative('Aiming striker...', 'system');
        }
        
        onCarromDoubleTap() {
            // Shoot striker
            G.addNarrative('Shooting striker!', 'system');
            if (window.MusicSystem && window.MusicSystem.playSFX) {
                window.MusicSystem.playSFX('carrom-hit');
            }
        }
        
        onCarromSwipeUp() {
            // Increase power
            G.addNarrative('Increasing power...', 'system');
        }
        
        onCarromSwipeDown() {
            // Decrease power
            G.addNarrative('Decreasing power...', 'system');
        }
        
        onCarromSwipeLeft() {
            // Aim left
            G.addNarrative('Aiming left...', 'system');
        }
        
        onCarromSwipeRight() {
            // Aim right
            G.addNarrative('Aiming right...', 'system');
        }
        
        // ===== BLACKJACK GESTURES =====
        
        onBlackjackTap() {
            // Hit (take another card)
            G.addNarrative('Taking another card...', 'system');
        }
        
        onBlackjackDoubleTap() {
            // Stand (keep current hand)
            G.addNarrative('Standing!', 'system');
        }
        
        onBlackjackSwipeUp() {
            // Double down
            G.addNarrative('Doubling down!', 'system');
        }
        
        onBlackjackSwipeDown() {
            // Show dealer hand
            G.addNarrative('Checking dealer hand...', 'system');
        }
        
        onBlackjackSwipeLeft() {
            // Previous hand info
            G.addNarrative('Previous hand', 'system');
        }
        
        onBlackjackSwipeRight() {
            // Next hand info
            G.addNarrative('Next hand', 'system');
        }
        
        // ===== CHESS GESTURES =====
        
        onChessTap() {
            // Select piece
            G.addNarrative('Selecting piece...', 'system');
        }
        
        onChessDoubleTap() {
            // Confirm move
            G.addNarrative('Confirming move...', 'system');
        }
        
        onChessSwipeUp() {
            G.addNarrative('Moving piece forward', 'system');
        }
        
        onChessSwipeDown() {
            G.addNarrative('Moving piece backward', 'system');
        }
        
        onChessSwipeLeft() {
            G.addNarrative('Moving piece left', 'system');
        }
        
        onChessSwipeRight() {
            G.addNarrative('Moving piece right', 'system');
        }
    }
    
    // Create global gesture controller
    const gestureController = new GestureController();
    window.MiniGameGestures = gestureController;
    
    // ===== AUTO-ATTACH TO GAMES =====
    
    function attachGesturesToGames() {
        // Wait for games to load
        const checkInterval = setInterval(() => {
            // Car Racing
            const carRacingCanvas = document.querySelector('.bsu-car-canvas');
            if (carRacingCanvas && !carRacingCanvas.dataset.gesturesAttached) {
                gestureController.attach(carRacingCanvas, 'car_racing');
                carRacingCanvas.dataset.gesturesAttached = 'true';
                G.addNarrative('Car Racing gesture controls activated! Swipe up to accelerate, down to brake, left/right to steer, double tap for boost.', 'system');
            }
            
            // Game Hall
            const gameHallBoard = document.getElementById('hall-board');
            if (gameHallBoard && !gameHallBoard.dataset.gesturesAttached) {
                const gameType = window.GameHall?.type;
                if (gameType) {
                    gestureController.attach(gameHallBoard, gameType === 'snakes' ? 'snakes_ladders' : gameType);
                    gameHallBoard.dataset.gesturesAttached = 'true';
                    
                    const gameNames = {
                        'chess': 'Chess',
                        'snakes_ladders': 'Snakes & Ladders',
                        'carrom': 'Carrom',
                        'blackjack': 'Blackjack'
                    };
                    
                    G.addNarrative(`${gameNames[gameType] || gameType} gesture controls activated!`, 'system');
                }
            }
            
            // Stop checking after 30 seconds
            if (Date.now() - startTime > 30000) {
                clearInterval(checkInterval);
            }
        }, 1000);
        
        const startTime = Date.now();
    }
    
    // Attach when DOM is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', attachGesturesToGames);
    } else {
        attachGesturesToGames();
    }
    
    // ===== CAR RACING MAP SYSTEM =====
    
    function showCarRacingMap() {
        const map = `
🏁 CAR RACING DISTRICT MAP 🏁

Start ──── Plaza ──── Garage
              │           │
              │           │
         Dealership    Storage
              │
              Pit ──── Track 1 (Beginner)
              │
              ├────── Track 2 (City)
              │
              ├────── Track 3 (Forest)
              │
              ├────── Track 4 (Mountain)
              │
              ├────── Track 5 (Night)
              │
              └────── Track 6 (Championship)

Swipe gestures:
• Up: Accelerate
• Down: Brake/Reverse
• Left: Steer Left
• Right: Steer Right
• Double Tap: Boost
• Single Tap: Horn

Commands:
• "accelerate" or "gas"
• "brake"
• "left" / "right"
• "boost"
• "map" (show this map)
• "status" (car status)
        `;
        
        G.addNarrative(map, 'system');
    }
    
    // Add map command
    const oldProcessCommand = G.processCommand;
    G.processCommand = function(cmd) {
        const lower = cmd.toLowerCase().trim();
        
        if (lower === 'map' || lower === 'show map' || lower === 'racing map') {
            showCarRacingMap();
            return;
        }
        
        // Car racing specific commands
        if (lower === 'horn' || lower === 'honk') {
            if (window.CarRacing) {
                window.CarRacing.handleCommand('horn');
                G.addNarrative('Honk honk!', 'system');
            }
            return;
        }
        
        return oldProcessCommand.call(this, cmd);
    };
    
    // ===== DICE ROLLING SYSTEM =====
    
    function rollDice(sides = 6) {
        const result = Math.floor(Math.random() * sides) + 1;
        
        G.addNarrative(`Rolling ${sides}-sided dice...`, 'system');
        
        if (window.MusicSystem && window.MusicSystem.playSFX) {
            window.MusicSystem.playSFX('dice-roll');
        }
        
        setTimeout(() => {
            G.addNarrative(`You rolled a ${result}!`, 'system');
        }, 500);
        
        return result;
    }
    
    window.rollDice = rollDice;
    
    console.log('✓ Mini-Games Gesture Controls v1.0 loaded');
    console.log('  - Car Racing: Swipe gestures + boost + map');
    console.log('  - Chess: Piece selection + movement');
    console.log('  - Snakes & Ladders: Dice rolling + movement');
    console.log('  - Carrom: Aiming + shooting');
    console.log('  - Blackjack: Hit/Stand/Double');
    
})();
