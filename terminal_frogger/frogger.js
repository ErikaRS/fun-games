import { Application, Assets, Sprite, Container, Text } from './pixi.mjs';
class Frogger {
    constructor() {
        // Width in cells of the board
        // For now, this sohould be divisible by 4 to make the goal spacing
        // work but that should be fixed later
        this.width = 32;
        this.middle = Math.floor(this.width / 2);
        // Height in cells of the board
        this.height = 15;
        this.cellSize = 40;
        this.score = 0;
        this.gameOver = false;

        this.initGame();
        this.addResetButton();
    }

    addResetButton() {
        const resetButton = new Text({
            text: 'Reset Game',
            style: {
                fontFamily: 'Impact',
                fontSize: 24,
            }
        });
        
        resetButton.position.set(
            this.toPixelSpace(this.middle),
            this.toPixelSpace(this.height) + 20
        );
        resetButton.eventMode = 'static';
        resetButton.cursor = 'pointer';
        
        resetButton.on('pointerdown', () => {
            this.app.stage.removeChildren();
            this.score = 0;
            this.gameOver = false;
            this.initGame();
            this.addResetButton();
        });
        
        this.app.stage.addChild(resetButton);
    }

    async initGame() {
        // Create and initialize PIXI application. Only do so once.
        if (!this.app) {
            this.app = new Application();
            await this.app.init({ 
                background: '#1099bb',
                width: this.width * this.cellSize,
                // Height is increased to account for the reset button
                // TODO: Abstract the "20" and "60" constants
                height: this.height * this.cellSize + 60
            });
            document.body.appendChild(this.app.canvas);
            await this.loadAssets();
            this.setupInput();
        }

        // Create game container. This is recreated each time the game is reset.
        this.gameContainer = new Container();
        this.app.stage.addChild(this.gameContainer);

        this.createGameObjects();
        
        // Start game loop
        this.app.ticker.remove(this.gameLoop, this);
        this.app.ticker.add(this.gameLoop, this);
    }

    async loadAssets() {
        const sprites = {
            frog: 'assets/frog.png',
            car: 'assets/car.png',
            log: 'assets/log.png',
            water: 'assets/water.png',
            goal: 'assets/house.png'
        };

        // Load all assets
        const textures = await Promise.all(
            Object.entries(sprites).map(([key, url]) => 
                Assets.load(url).then(texture => [key, texture])
            )
        );

        // Store textures for later use
        this.textures = Object.fromEntries(textures);
    }

    createGameObjects() {
        /*
        // Create background zones
        const background = new Container();
        
        // Green grass background (bottom)
        const grassZone = new Graphics();
        grassZone.beginFill(0x2ecc71);
        grassZone.drawRect(0, this.toPixelSpace(11), this.width * this.cellSize, this.toPixelSpace(4));
        background.addChild(grassZone);
        
        // Grey road background (middle)
        const roadZone = new Graphics();
        roadZone.beginFill(0x95a5a6);
        roadZone.drawRect(0, this.toPixelSpace(6), this.width * this.cellSize, this.toPixelSpace(5));
        background.addChild(roadZone);
        
        // Blue water background (top)
        const waterZone = new Graphics();
        waterZone.beginFill(0x1099bb);
        waterZone.drawRect(0, 0, this.width * this.cellSize, this.toPixelSpace(6));
        background.addChild(waterZone);
        
        this.gameContainer.addChild(background);
        */
        
        this.initFrog();
        this.initObstacles();
    }
    initFrog() {
        // Create a frog in the middle of the bottom row
        this.frog = new Sprite(this.textures.frog);
        this.setStandardDimensions(this.frog);
        this.frog.position.set(
            this.toPixelSpace(this.middle),
            this.toPixelSpace(this.height - 1)
        );
        this.gameContainer.addChild(this.frog);
    }

    initObstacles() {
        this.cars = [];
        this.logs = [];
        this.waterTiles = [];
        this.goals = [];

        // Create cars in rows on the road section
        // Each row has 2 cars positioned at intervals
        // Cars are placed in 3 rows starting from the bottom of the road section
        for (let i = 0; i < 3; i++) {
            for (let j = 0; j < 2; j++) {
                const car = new Sprite(this.textures.car);
                this.setStandardDimensions(car);
                car.position.set(
                    this.toPixelSpace(j * this.middle),
                    this.toPixelSpace(this.height - 3 - i)
                );
                this.cars.push(car);
                this.gameContainer.addChild(car);
            }
        }

        // Create water tiles in the river section
        // Water tiles are placed in 4 rows starting from the top of the game area
        // Each row spans the entire width of the game area
        for (let i = 0; i < this.width; i++) {
            for (let j = 0; j < 4; j++) {
                const water = new Sprite(this.textures.water);
                this.setStandardDimensions(water);
                water.position.set(
                    this.toPixelSpace(i),
                    this.toPixelSpace(j + 1)
                );
                this.waterTiles.push(water);
                this.gameContainer.addChild(water);
            }
        }

        // Create logs in the river section
        // Each row has 2 logs positioned at intervals
        // Logs are placed in 4 rows starting from the top of the river section
        for (let i = 0; i < 4; i++) {
            for (let j = 0; j < 2; j++) {
                const log = new Sprite(this.textures.log);
                this.setStandardDimensions(log);
                log.position.set(
                    this.toPixelSpace(j * this.middle),
                    this.toPixelSpace(i + 1)
                );
                this.logs.push(log);
                this.gameContainer.addChild(log);
            }
        }

        // Create goal positions at the top of the game area
        // Goals are evenly spaced across the width of the game area
        // Each goal represents a target position for the frog to reach
        for (let i = 0; i < 5; i++) {
            const goal = new Sprite(this.textures.goal);
            this.setStandardDimensions(goal);
            goal.position.set(
                this.toPixelSpace(i * (this.width / 4)),
                this.toPixelSpace(0)
            );
            this.goals.push(goal);
            this.gameContainer.addChild(goal);
        }    
    }

    // TODO: only do this once. Not on reset. Otherwise the frog keeps
    // moving further and further each time the game is reset.
    setupInput() {
        window.addEventListener('keydown', (e) => {
            if (this.gameOver) return

            switch (e.key) {
                case 'ArrowUp':
                    if (this.frog.y > 0) this.frog.y -= this.cellSize;
                    break;
                case 'ArrowDown':
                    if (this.frog.y < this.toPixelSpace(this.height - 1))
                        this.frog.y += this.cellSize;
                    break;
                case 'ArrowLeft':
                    if (this.frog.x > 0) this.frog.x -= this.cellSize;
                    break;
                case 'ArrowRight':
                    if (this.frog.x < this.toPixelSpace(this.width - 1))
                        this.frog.x += this.cellSize;
                    break;
            }
        });
    }

    gameLoop() {
        if (this.gameOver) return

        // Updates the position of each car in the game
        // Cars move from right to left and wrap around when they reach the edge
        // Speed: 2 pixels per frame
        this.cars.forEach(car => {
            car.x -= 2
            if (car.x < -car.width) {
                car.x = this.toPixelSpace(this.width)
            }
        })

        // Updates the position of each log in the game
        // Logs move from left to right and wrap around when they reach the edge
        // Speed: 1 pixel per frame
        this.logs.forEach(log => {
            log.x += 1
            if (log.x > this.toPixelSpace(this.width)) {
                log.x = -log.width
            }
        })
        this.checkCollisions()
    }

    checkCollisions() {
        // Check if frog reached a goal
        for (let goal of this.goals) {
            if (this.checkOverlap(this.frog, goal)) {
                this.score += 100
                this.endGame(true)
                return
            }
        }

        // Check car collisions
        for (let car of this.cars) {
            if (this.checkOverlap(this.frog, car)) {
                console.log('hit car')
                this.endGame()
                return
            }
        }

        // Checks if the frog is in the water section (rows 1-4)
        // If frog is in water, it must be on a log to survive
        // Frog will snap to log position when overlapping by 75% or more
        // If frog is in water but not on a log, game ends
        if (this.frog.y >= this.toPixelSpace(1) && this.frog.y <= this.toPixelSpace(4)) {
            let onLog = false
            for (let log of this.logs) {
                const overlap = this.getOverlapAmount(this.frog, log)
                if (overlap > this.cellSize * 0.75) {
                    onLog = true
                    // Snap frog to log position
                    this.frog.x = log.x
                    // Move frog to front
                    this.gameContainer.removeChild(this.frog)
                    this.gameContainer.addChild(this.frog)
                    // Move with log
                    this.frog.x -= 1
                    break
                }
            }
            if (!onLog) {
                console.log('hit water')
                this.endGame()
            }
        } else {
            // Snap to nearest grid cell when on land
            const cellX = Math.round(this.frog.x / this.cellSize)
            this.frog.x = this.toPixelSpace(cellX)
        }
    }
    /**
     * Calculates the amount of horizontal overlap between two sprites
     * @param {PIXI.Sprite} sprite1 - The first sprite to check
     * @param {PIXI.Sprite} sprite2 - The second sprite to check
     * @returns {number} The amount of horizontal overlap in pixels, or 0 if sprites are on different rows
     */
    getOverlapAmount(sprite1, sprite2) {
        const bounds1 = sprite1.getBounds()
        const bounds2 = sprite2.getBounds()
        
        if (bounds1.y !== bounds2.y) return 0
        
        const left = Math.max(bounds1.x, bounds2.x)
        const right = Math.min(bounds1.x + bounds1.width, bounds2.x + bounds2.width)
        
        return Math.max(0, right - left)
    }

    /**
     * Checks if two sprites overlap/collide with each other
     * @param {PIXI.Sprite} sprite1 - The first sprite to check
     * @param {PIXI.Sprite} sprite2 - The second sprite to check
     * @returns {boolean} True if the sprites have any overlap, false otherwise
     */
    checkOverlap(sprite1, sprite2) {
        const bounds1 = sprite1.getBounds()
        const bounds2 = sprite2.getBounds()
        return bounds1.x < bounds2.x + bounds2.width
            && bounds1.x + bounds1.width > bounds2.x
            && bounds1.y < bounds2.y + bounds2.height
            && bounds1.y + bounds1.height > bounds2.y
    }

    endGame(playerWon = false) {
        this.gameOver = true
        const message = playerWon ? 'You Win!' : 'Game Over!'
        const gameOverText = new Text({
            text: `${message} Score: ${this.score}`, 
            style: {
                fontFamily: 'Impact',
                fontSize: 48,
                fill: 0xfd700f,
                dropShadow: true,
                dropShadowColor: '#000000'
            }
        })

        gameOverText.position.set(
            this.app.screen.width / 2 - gameOverText.width / 2,
            this.app.screen.height / 2
        )
        this.app.stage.addChild(gameOverText)
    }

    toPixelSpace(cellIndex) {
        return cellIndex * this.cellSize;
    }

    setStandardDimensions(sprite) {
        sprite.width = this.cellSize;
        sprite.height = this.cellSize;
    }
}

// Initialize game
new Frogger();
