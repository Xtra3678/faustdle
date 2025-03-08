import { EventEmitter } from 'events';
import seedrandom from 'seedrandom';
import { names, arcs, haki } from './data/characters.js';
import { compareTraits } from './utils/gameLogic.js';
import { APConnection } from './src/components/APConnection.js';
import { apClient } from './src/archipelago/client.js';

class GameApp {
    constructor() {
        this.chosenCharacter = null;
        this.currentSeed = null;
        this.guessHistory = [];
        this.gameMode = null;
        this.startTime = null;
        this.elapsedTimeInterval = null;
        
        // Add death link event listener
        document.addEventListener('death_link_triggered', (event) => {
            this.handleDeathLink(`Death Link from ${event.detail.source}`);
        });

        this.initializeAP();
        this.updateDailyCountdown();
        this.setupEventListeners();
        console.log('GameApp initialized');
    }

    initializeAP() {
        const seedGenerator = document.querySelector('.seed-generator');
        if (seedGenerator) {
            new APConnection(seedGenerator);
        }

        document.addEventListener('ap-connect-request', async (event) => {
            const { address, port, slot, password, deathLink } = event.detail;
            const success = await apClient.connect(address, port, slot, password, deathLink);
            
            if (success) {
                alert('Connected to Archipelago!');
                this.updateGameModesVisibility(true);
                this.setupAPHints();
            } else {
                alert('Failed to connect to Archipelago. Please check your connection details.');
            }
        });

        apClient.on('connected', () => {
            this.updateGameModesVisibility(true);
        });

        apClient.on('disconnected', () => {
            this.updateGameModesVisibility(false);
        });

        apClient.on('connection_error', () => {
            alert('Connection to Archipelago failed. The server might be unavailable.');
        });

        apClient.on('server_error', (error) => {
            alert(`Archipelago server error: ${error.text || 'Unknown error'}`);
        });
    }

    updateGameModesVisibility(isConnected) {
        const dailyModeButton = document.getElementById('daily-mode');
        const seedSection = document.getElementById('seed-section');
        const archipelagoToggle = document.getElementById('archipelago-toggle');
        const connectedButton = document.getElementById('ap-connect-button');

        if (isConnected) {
            dailyModeButton.style.display = 'none';
            seedSection.style.display = 'none';
            archipelagoToggle.style.display = 'none';
            
            connectedButton.style.display = 'block';
            connectedButton.textContent = 'Connected to AP';
            connectedButton.classList.add('connected');
        } else {
            dailyModeButton.style.display = 'block';
            seedSection.style.display = 'block';
            archipelagoToggle.style.display = 'block';
            
            connectedButton.style.display = 'block';
            connectedButton.textContent = 'Connect to Archipelago';
            connectedButton.classList.remove('connected');
        }
    }

    setupAPHints() {
        let hintsContainer = document.getElementById('ap-hints');
        if (!hintsContainer) {
            hintsContainer = document.createElement('div');
            hintsContainer.id = 'ap-hints';
            hintsContainer.className = 'ap-hints-container';
            document.querySelector('.container').appendChild(hintsContainer);
        }

        apClient.addListener('hintsUpdated', (hints) => {
            hintsContainer.innerHTML = '';
            hints.forEach(hint => {
                const hintElement = document.createElement('div');
                hintElement.className = 'ap-hint';
                if (hint.flags > 0) {
                    hintElement.classList.add('progression');
                }
                hintElement.textContent = this.formatHint(hint);
                hintsContainer.appendChild(hintElement);
            });
        });
    }

    formatHint(hint) {
        if (!hint) return 'Invalid hint';
        
        let text = `Hint from ${this.getPlayerName(hint.player)}: `;
        
        if (hint.guess) {
            text += `Guessed ${hint.guess}`;
            if (hint.result) {
                text += ` (${hint.result})`;
            }
        } else {
            text += 'Made a guess';
        }
        
        return text;
    }

    getPlayerName(playerId) {
        const player = apClient.players.get(playerId?.toString());
        return player?.name || 'Unknown Player';
    }

    updateDailyCountdown() {
        const updateTimer = () => {
            const now = new Date();
            const tomorrow = new Date(now);
            tomorrow.setUTCHours(24, 0, 0, 0);
            const timeLeft = tomorrow - now;

            const hours = Math.floor(timeLeft / (1000 * 60 * 60));
            const minutes = Math.floor((timeLeft % (1000 * 60 * 60)) / (1000 * 60));
            const seconds = Math.floor((timeLeft % (1000 * 60)) / 1000);

            const countdownTimer = document.getElementById('countdown-timer');
            const resultCountdownTimer = document.getElementById('result-countdown-timer');
            
            const timerText = `${hours}h ${minutes}m ${seconds}s`;
            if (countdownTimer) {
                countdownTimer.textContent = timerText;
            }
            if (resultCountdownTimer) {
                resultCountdownTimer.textContent = timerText;
            }
        };

        updateTimer();
        setInterval(updateTimer, 1000);
    }

    setupEventListeners() {
        // Game mode buttons
        const normalModeButton = document.getElementById('normal-mode');
        const hardModeButton = document.getElementById('hard-mode');
        const fillerModeButton = document.getElementById('filler-mode');
        const dailyModeButton = document.getElementById('daily-mode');
        const seedStartButton = document.getElementById('seed-start');
        const guessButton = document.getElementById('guess-button');
        const skipButton = document.getElementById('skip-button');
        const playAgainButton = document.getElementById('play-again');
        const generateSeedButton = document.getElementById('generate-seed');
        const generateSeedForCharacterButton = document.getElementById('generate-seed-for-character');
        const useGeneratedSeedButton = document.getElementById('use-generated-seed');
        const backToMainButton = document.getElementById('back-to-main');

        if (normalModeButton) {
            normalModeButton.addEventListener('click', () => {
                console.log('Normal mode button clicked');
                this.startGame('normal');
            });
        }

        if (hardModeButton) {
            hardModeButton.addEventListener('click', () => {
                console.log('Hard mode button clicked');
                this.startGame('hard');
            });
        }

        if (fillerModeButton) {
            fillerModeButton.addEventListener('click', () => {
                console.log('Filler mode button clicked');
                this.startGame('filler');
            });
        }

        if (dailyModeButton) {
            dailyModeButton.addEventListener('click', () => {
                console.log('Daily mode button clicked');
                this.startDailyGame();
            });
        }

        if (generateSeedButton) {
            generateSeedButton.addEventListener('click', () => {
                console.log('Generate seed button clicked');
                document.getElementById('game-setup').classList.add('hidden');
                document.getElementById('seed-generator').classList.remove('hidden');
                this.setupCharacterAutocomplete();
            });
        }

        if (generateSeedForCharacterButton) {
            generateSeedForCharacterButton.addEventListener('click', () => {
                this.generateSeedForCharacter();
            });
        }

        if (useGeneratedSeedButton) {
            useGeneratedSeedButton.addEventListener('click', () => {
                const generatedSeed = document.getElementById('seed-result').textContent;
                document.getElementById('seed-generator').classList.add('hidden');
                document.getElementById('game-setup').classList.remove('hidden');
                document.getElementById('seed-input').value = generatedSeed;
            });
        }

        if (backToMainButton) {
            backToMainButton.addEventListener('click', () => {
                document.getElementById('seed-generator').classList.add('hidden');
                document.getElementById('game-setup').classList.remove('hidden');
                document.getElementById('character-input').value = '';
                document.getElementById('generated-seed').classList.add('hidden');
            });
        }

        if (seedStartButton) {
            seedStartButton.addEventListener('click', () => {
                console.log('Seed start button clicked');
                this.startGameWithSeed();
            });
        }

        if (guessButton) {
            guessButton.addEventListener('click', () => {
                console.log('Guess button clicked');
                this.makeGuess();
            });
        }

        if (skipButton) {
            skipButton.addEventListener('click', () => {
                console.log('Skip button clicked');
                this.skipGame();
            });
        }

        if (playAgainButton) {
            playAgainButton.addEventListener('click', () => {
                console.log('Play again button clicked');
                this.resetGame();
            });
        }

        // Setup guess input enter key
        const guessInput = document.getElementById('guess-input');
        if (guessInput) {
            guessInput.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') {
                    console.log('Enter key pressed in guess input');
                    this.makeGuess();
                }
            });
        }

        // Setup seed input enter key
        const seedInput = document.getElementById('seed-input');
        if (seedInput) {
            seedInput.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') {
                    console.log('Enter key pressed in seed input');
                    this.startGameWithSeed();
                }
            });
        }

        // Setup character input enter key
        const characterInput = document.getElementById('character-input');
        if (characterInput) {
            characterInput.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') {
                    console.log('Enter key pressed in character input');
                    this.generateSeedForCharacter();
                }
            });
        }
    }

    makeGuess() {
        console.log('Making guess');
        const guessInput = document.getElementById('guess-input');
        const guess = guessInput.value;
        
        if (!names[guess]) {
            alert('Invalid name, try again.');
            return;
        }
        
        const results = compareTraits(names[guess], this.chosenCharacter.traits);
        this.guessHistory.push(results);
        
        if (apClient.isConnected()) {
            apClient.submitGuess(guess, {
                correct: guess === this.chosenCharacter.name,
                matches: results.filter(r => r.match).length,
                total: results.length
            });

            // Check for death link condition (more than 8 guesses)
            if (apClient.isDeathLinkEnabled() && this.guessHistory.length > 8) {
                apClient.sendDeathLink('Too many guesses');
                this.handleDeathLink('Too many guesses');
                return;
            }
        }

        if (guess === this.chosenCharacter.name) {
            this.handleCorrectGuess();
        } else {
            this.displayResultsUI(guess, results);
            guessInput.value = '';
        }
    }

    skipGame() {
        if (!this.chosenCharacter || this.gameMode === 'daily') return;
        
        this.stopElapsedTimer();
        document.getElementById('game-play').classList.add('hidden');
        document.getElementById('game-over').classList.remove('hidden');
        document.getElementById('game-over-message').textContent = 'Game skipped!';
        document.getElementById('correct-character').textContent = this.chosenCharacter.name;
        document.getElementById('game-seed').textContent = this.currentSeed;
        document.getElementById('emoji-grid').textContent = this.generateEmojiGrid();
        this.copyResultsTable();

        // Send death link if enabled and skipped
        if (apClient.isConnected() && apClient.isDeathLinkEnabled()) {
            apClient.sendDeathLink('Skipped game');
            this.handleDeathLink('Skipped game');
        }
    }

    handleDeathLink(reason) {
        this.stopElapsedTimer();
        document.getElementById('game-play').classList.add('hidden');
        document.getElementById('game-over').classList.remove('hidden');
        document.getElementById('game-over-message').textContent = `Game Over - Death Link: ${reason}`;
        document.getElementById('correct-character').textContent = this.chosenCharacter.name;
        document.getElementById('game-seed').textContent = this.currentSeed;
        document.getElementById('emoji-grid').textContent = this.generateEmojiGrid();
        this.copyResultsTable();
    }

    startGame(mode) {
        console.log('Starting game in mode:', mode);
        this.gameMode = mode;
        this.currentSeed = Math.random().toString(36).substring(2, 15);
        document.getElementById('game-setup').classList.add('hidden');
        document.getElementById('game-play').classList.remove('hidden');
        document.getElementById('skip-button').classList.remove('hidden');
        this.chosenCharacter = this.selectRandomCharacter(mode, this.currentSeed);
        this.startElapsedTimer();
        
        if (apClient.isConnected()) {
            apClient.setGameMode(mode);
        }
    }

    selectRandomCharacter(mode, seed) {
        console.log('Selecting random character in mode:', mode);
        try {
            const rng = new seedrandom(seed);
            const characterNames = Object.keys(names);
            let selectedName;
            let selectedTraits;
            let attempts = 0;
            const maxAttempts = 1000;
            
            do {
                const index = Math.floor(rng() * characterNames.length);
                selectedName = characterNames[index];
                selectedTraits = names[selectedName];
                attempts++;
                
                if (attempts >= maxAttempts) {
                    throw new Error('Could not find a valid character for the selected mode');
                }
            } while (!this.isValidCharacterForMode(selectedTraits[9], mode));
            
            return { name: selectedName, traits: selectedTraits };
        } catch (error) {
            console.warn('Error selecting random character:', error);
            alert('Error: Could not find a valid character. Please try again.');
            this.resetGame();
            return null;
        }
    }

    isValidCharacterForMode(difficulty, mode) {
        switch(mode) {
            case 'normal':
                return difficulty === 'E';
            case 'hard':
                return difficulty === 'E' || difficulty === 'H';
            case 'filler':
                return true;
            default:
                return difficulty === 'E';
        }
    }

    startDailyGame() {
        console.log('Starting daily game');
        this.gameMode = 'daily';
        this.currentSeed = this.getDailySeed();
        document.getElementById('game-setup').classList.add('hidden');
        document.getElementById('game-play').classList.remove('hidden');
        document.getElementById('skip-button').classList.add('hidden');
        this.chosenCharacter = this.selectRandomCharacter('normal', this.currentSeed);
        this.startElapsedTimer();
    }

    getDailySeed() {
        const date = new Date();
        return `${date.getUTCFullYear()}-${date.getUTCMonth() + 1}-${date.getUTCDate()}`;
    }

    startGameWithSeed() {
        console.log('Starting game with seed');
        const seedInput = document.getElementById('seed-input');
        if (!seedInput.value) {
            alert('Please enter a seed value');
            return;
        }

        // Easter egg: Check for "imu" seed
        if (seedInput.value.toLowerCase() === 'imu') {
            // Reload the page
            window.location.reload();
            return;
        }

        this.gameMode = 'filler';
        this.currentSeed = seedInput.value;
        document.getElementById('game-setup').classList.add('hidden');
        document.getElementById('game-play').classList.remove('hidden');
        document.getElementById('skip-button').classList.remove('hidden');
        this.chosenCharacter = this.selectRandomCharacter('filler', this.currentSeed);
        this.startElapsedTimer();
    }

    generateSeedForCharacter() {
        try {
            const characterInput = document.getElementById('character-input');
            const character = characterInput.value;
            
            if (!names[character]) {
                alert('Invalid character name, please try again.');
                return;
            }

            // Generate a unique seed for this character
            const characterSeed = this.generateUniqueSeedForCharacter(character);
            
            if (characterSeed) {
                document.getElementById('seed-result').textContent = characterSeed;
                document.getElementById('generated-seed').classList.remove('hidden');
            } else {
                alert('Could not generate a valid seed for this character. Please try a different character.');
            }
        } catch (error) {
            console.warn('Error generating seed:', error);
            alert('An error occurred while generating the seed. Please try again.');
        }
    }

    generateUniqueSeedForCharacter(character) {
        let attempts = 0;
        const maxAttempts = 1000;
        
        while (attempts < maxAttempts) {
            try {
                const seed = Math.random().toString(36).substring(2, 15);
                const rng = new seedrandom(seed);
                const characterNames = Object.keys(names);
                const index = Math.floor(rng() * characterNames.length);
                const selectedName = characterNames[index];
                
                // Check if the selected character matches the desired character
                if (selectedName === character) {
                    // Verify that the character would actually be selectable in some mode
                    const difficulty = names[character][9];
                    if (difficulty === 'E' || difficulty === 'H' || difficulty === 'F') {
                        return seed;
                    }
                }
                
                attempts++;
            } catch (error) {
                console.warn('Error in seed generation attempt:', error);
                attempts++;
            }
        }
        
        return null;
    }

    setupCharacterAutocomplete() {
        const characterInput = document.getElementById('character-input');
        const autocompleteList = document.createElement('ul');
        autocompleteList.className = 'autocomplete-list';
        characterInput.parentNode.appendChild(autocompleteList);

        characterInput.addEventListener('input', (e) => {
            const input = e.target.value;
            autocompleteList.innerHTML = '';
            
            if (input.length >= 2) {
                const matches = Object.keys(names).filter(name => 
                    name.toLowerCase().startsWith(input.toLowerCase())
                );
                
                matches.forEach(match => {
                    const li = document.createElement('li');
                    li.textContent = match;
                    li.addEventListener('click', () => {
                        characterInput.value = match;
                        autocompleteList.innerHTML = '';
                    });
                    autocompleteList.appendChild(li);
                });
            }
        });

        document.addEventListener('click', (e) => {
            if (!characterInput.contains(e.target)) {
                autocompleteList.innerHTML = '';
            }
        });
    }

    setupAutocomplete() {
        const guessInput = document.getElementById('guess-input');
        const autocompleteList = document.createElement('ul');
        autocompleteList.className = 'autocomplete-list';
        guessInput.parentNode.appendChild(autocompleteList);

        guessInput.addEventListener('input', (e) => {
            const input = e.target.value;
            autocompleteList.innerHTML = '';
            
            if (input.length >= 2) {
                const matches = Object.keys(names).filter(name => 
                    name.toLowerCase().startsWith(input.toLowerCase())
                );
                
                matches.forEach(match => {
                    const li = document.createElement('li');
                    li.textContent = match;
                    li.addEventListener('click', () => {
                        guessInput.value = match;
                        autocompleteList.innerHTML = '';
                    });
                    autocompleteList.appendChild(li);
                });
            }
        });

        document.addEventListener('click', (e) => {
            if (!guessInput.contains(e.target)) {
                autocompleteList.innerHTML = '';
            }
        });
    }

    startElapsedTimer() {
        this.startTime = Date.now();
        const elapsedTimer = document.getElementById('elapsed-timer');
        
        if (this.elapsedTimeInterval) {
            clearInterval(this.elapsedTimeInterval);
        }

        this.elapsedTimeInterval = setInterval(() => {
            const elapsed = Date.now() - this.startTime;
            const minutes = Math.floor(elapsed / 60000);
            const seconds = Math.floor((elapsed % 60000) / 1000);
            elapsedTimer.textContent = `${minutes}:${seconds.toString().padStart(2, '0')}`;
        }, 1000);
    }

    stopElapsedTimer() {
        if (this.elapsedTimeInterval) {
            clearInterval(this.elapsedTimeInterval);
            this.elapsedTimeInterval = null;
        }

        if (this.startTime) {
            const elapsed = Date.now() - this.startTime;
            const minutes = Math.floor(elapsed / 60000);
            const seconds = Math.floor((elapsed % 60000) / 1000);
            document.getElementById('final-time').textContent = 
                `${minutes}:${seconds.toString().padStart(2, '0')}`;
        }
    }

    handleCorrectGuess() {
        this.stopElapsedTimer();
        document.getElementById('game-play').classList.add('hidden');
        document.getElementById('game-over').classList.remove('hidden');
        document.getElementById('game-over-message').textContent = 'Congratulations! You found the correct character!';
        document.getElementById('correct-character').textContent = this.chosenCharacter.name;
        
        const gameSeedContainer = document.getElementById('game-seed-container');
        if (this.gameMode === 'daily') {
            gameSeedContainer.classList.add('hidden');
            document.getElementById('daily-result-countdown').classList.remove('hidden');
        } else {
            gameSeedContainer.classList.remove('hidden');
            document.getElementById('game-seed').textContent = this.currentSeed;
        }
        
        document.getElementById('emoji-grid').textContent = this.generateEmojiGrid();
        this.copyResultsTable();
    }

    resetGame() {
        console.log('Resetting game');
        document.getElementById('game-over').classList.add('hidden');
        document.getElementById('game-setup').classList.remove('hidden');
        document.getElementById('seed-input').value = '';
        document.getElementById('results-table').querySelector('tbody').innerHTML = '';
        document.getElementById('results-table-final').querySelector('tbody').innerHTML = '';
        document.getElementById('emoji-grid').textContent = '';
        document.getElementById('elapse d-timer').textContent = '0:00';
        document.getElementById('daily-result-countdown').classList.add('hidden');
        document.getElementById('game-seed-container').classList.remove('hidden');
        this.chosenCharacter = null;
        this.currentSeed = null;
        this.guessHistory = [];
        this.gameMode = null;
        this.startTime = null;
        if (this.elapsedTimeInterval) {
            clearInterval(this.elapsedTimeInterval);
            this.elapsedTimeInterval = null;
        }
    }

    displayResultsUI(guessName, results) {
        console.log('Displaying results for guess', guessName);
        const tbody = document.getElementById('results-table').querySelector('tbody');
        const row = document.createElement('tr');
        
        const nameCell = document.createElement('td');
        nameCell.textContent = guessName;
        row.appendChild(nameCell);
        
        results.forEach(result => {
            const cell = document.createElement('td');
            cell.textContent = result.text;
            
            if (result.match) {
                cell.classList.add('match');
            } else if (result.direction) {
                cell.classList.add('error', `hint-${result.direction}`);
            } else {
                cell.classList.add('error');
            }
            
            row.appendChild(cell);
        });
        
        tbody.insertBefore(row, tbody.firstChild);
    }

    generateEmojiGrid() {
        return [...this.guessHistory].reverse().map(guess => {
            return guess.map(result => {
                if (result.match) {
                    return '🟩'; // Green square emoji
                } else if (result.direction === 'up') {
                    return '⬆️'; // Up arrow emoji
                } else if (result.direction === 'down') {
                    return '⬇️'; // Down arrow emoji
                } else {
                    return '🟥'; // Red square emoji
                }
            }).join('');
        }).join('\n');
    }

    copyResultsTable() {
        const originalTable = document.getElementById('results-table');
        const finalTable = document.getElementById('results-table-final');
        const tbody = finalTable.querySelector('tbody');
        tbody.innerHTML = originalTable.querySelector('tbody').innerHTML;
    }
}

// Initialize the game when the DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    console.log('DOM fully loaded and parsed');
    const game = new GameApp();
    game.setupAutocomplete();
});