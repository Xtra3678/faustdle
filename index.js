import { names, arcs, haki } from './data/characters.js';
import { compareTraits } from './utils/gameLogic.js';
import { GameClient } from './src/archipelago/client.js';
import { ArchipelagoConnect } from './src/components/ArchipelagoConnect.js';

class GameApp {
    constructor() {
        this.chosenCharacter = null;
        this.currentSeed = null;
        this.guessHistory = [];
        this.gameMode = null;
        this.startTime = null;
        this.elapsedTimeInterval = null;
        this.archipelagoClient = null;
        this.guessCount = 0;
        
        // Initialize components after DOM is loaded
        document.addEventListener('DOMContentLoaded', () => this.initialize());
    }

    initialize() {
        try {
            this.initializeArchipelago();
            this.setupEventListeners();
            this.updateDailyCountdown();
            this.setupAutocomplete();
            console.log('GameApp initialized');
        } catch (error) {
            console.error('Error during initialization:', error);
        }
    }

    initializeArchipelago() {
        try {
            this.archipelagoClient = new GameClient();
            new ArchipelagoConnect(this);
            
            document.addEventListener('apDeathLink', () => {
                this.handleDeathLink();
            });
        } catch (error) {
            console.error('Error initializing Archipelago:', error);
        }
    }

    async connectToArchipelago(address, name, password) {
        try {
            return await this.archipelagoClient.connect(address, name, password);
        } catch (error) {
            console.error('Error connecting to Archipelago:', error);
            return false;
        }
    }

    handleDeathLink() {
        this.stopElapsedTimer();
        document.getElementById('game-play').classList.add('hidden');
        document.getElementById('game-over').classList.remove('hidden');
        document.getElementById('game-over-message').textContent = 'Game Over - Death Link Activated!';
        document.getElementById('correct-character').textContent = this.chosenCharacter?.name || 'Unknown';
    }

    setupEventListeners() {
        console.log('Setting up event listeners');
        
        // Game mode buttons
        document.getElementById('normal-mode')?.addEventListener('click', () => this.startGame('normal'));
        document.getElementById('hard-mode')?.addEventListener('click', () => this.startGame('hard'));
        document.getElementById('filler-mode')?.addEventListener('click', () => this.startGame('filler'));
        document.getElementById('daily-mode')?.addEventListener('click', () => this.startDailyGame());
        document.getElementById('seed-start')?.addEventListener('click', () => this.startGameWithSeed());
        document.getElementById('guess-button')?.addEventListener('click', () => this.makeGuess());
        document.getElementById('skip-button')?.addEventListener('click', () => this.skipGame());
        document.getElementById('play-again')?.addEventListener('click', () => this.resetGame());
        document.getElementById('generate-seed')?.addEventListener('click', () => {
            document.getElementById('game-setup').classList.add('hidden');
            document.getElementById('seed-generator').classList.remove('hidden');
            this.setupCharacterAutocomplete();
        });
        document.getElementById('generate-seed-for-character')?.addEventListener('click', () => this.generateSeedForCharacter());
        document.getElementById('use-generated-seed')?.addEventListener('click', () => {
            const generatedSeed = document.getElementById('seed-result').textContent;
            document.getElementById('seed-generator').classList.add('hidden');
            document.getElementById('game-setup').classList.remove('hidden');
            document.getElementById('seed-input').value = generatedSeed;
        });
        document.getElementById('back-to-main')?.addEventListener('click', () => {
            document.getElementById('seed-generator').classList.add('hidden');
            document.getElementById('game-setup').classList.remove('hidden');
            document.getElementById('character-input').value = '';
            document.getElementById('generated-seed').classList.add('hidden');
        });

        // Setup input enter key handlers
        document.getElementById('guess-input')?.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') this.makeGuess();
        });

        document.getElementById('seed-input')?.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') this.startGameWithSeed();
        });

        document.getElementById('character-input')?.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') this.generateSeedForCharacter();
        });
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
            if (countdownTimer) countdownTimer.textContent = timerText;
            if (resultCountdownTimer) resultCountdownTimer.textContent = timerText;
        };

        updateTimer();
        setInterval(updateTimer, 1000);
    }

    startElapsedTimer() {
        if (this.elapsedTimeInterval) {
            clearInterval(this.elapsedTimeInterval);
        }

        this.startTime = Date.now();
        const elapsedTimer = document.getElementById('elapsed-timer');
        
        const updateElapsedTime = () => {
            const elapsed = Date.now() - this.startTime;
            const minutes = Math.floor(elapsed / 60000);
            const seconds = Math.floor((elapsed % 60000) / 1000);
            if (elapsedTimer) {
                elapsedTimer.textContent = `${minutes}:${seconds.toString().padStart(2, '0')}`;
            }
        };

        updateElapsedTime(); // Update immediately
        this.elapsedTimeInterval = setInterval(updateElapsedTime, 1000);
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
            const finalTime = document.getElementById('final-time');
            if (finalTime) {
                finalTime.textContent = `${minutes}:${seconds.toString().padStart(2, '0')}`;
            }
        }
    }

    generateSeedForCharacter() {
        const characterInput = document.getElementById('character-input');
        const character = characterInput.value;
        
        if (!names[character]) {
            alert('Invalid character name, please try again.');
            return;
        }

        const characterSeed = this.generateUniqueSeedForCharacter(character);
        
        document.getElementById('seed-result').textContent = characterSeed;
        document.getElementById('generated-seed').classList.remove('hidden');
    }

    generateUniqueSeedForCharacter(character) {
        let attempts = 0;
        const maxAttempts = 1000;
        let seed;
        
        do {
            seed = Math.random().toString(36).substring(2, 15);
            Math.seedrandom(seed);
            const characterNames = Object.keys(names);
            const index = Math.floor(Math.random() * characterNames.length);
            const selectedName = characterNames[index];
            
            if (selectedName === character) {
                const difficulty = names[character][9];
                if (difficulty === 'E' || difficulty === 'H' || difficulty === 'F') {
                    return seed;
                }
            }
            
            attempts++;
        } while (attempts < maxAttempts);
        
        throw new Error('Could not generate a valid seed for the character');
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

    getDailySeed() {
        const date = new Date();
        return `${date.getUTCFullYear()}-${date.getUTCMonth() + 1}-${date.getUTCDate()}`;
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

    startGameWithSeed() {
        console.log('Starting game with seed');
        const seedInput = document.getElementById('seed-input');
        if (!seedInput.value) {
            alert('Please enter a seed value');
            return;
        }

        if (seedInput.value.toLowerCase() === 'imu') {
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

    startGame(mode) {
        console.log('Starting game in mode:', mode);
        this.gameMode = mode;
        this.currentSeed = Math.floor(Math.random() * 1000000).toString();
        document.getElementById('game-setup').classList.add('hidden');
        document.getElementById('game-play').classList.remove('hidden');
        document.getElementById('skip-button').classList.remove('hidden');
        this.chosenCharacter = this.selectRandomCharacter(mode, this.currentSeed);
        this.startElapsedTimer();
    }

    generateEmojiGrid() {
        return [...this.guessHistory].reverse().map(guess => {
            return guess.map(result => {
                if (result.match) {
                    return '🟩';
                } else if (result.direction === 'up') {
                    return '⬆️';
                } else if (result.direction === 'down') {
                    return '⬇️';
                } else {
                    return '🟥';
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

    skipGame() {
        if (this.gameMode === 'daily') return;
        
        this.stopElapsedTimer();
        document.getElementById('game-play').classList.add('hidden');
        document.getElementById('game-over').classList.remove('hidden');
        document.getElementById('game-over-message').textContent = 'Game skipped - No hint given!';
        document.getElementById('correct-character').textContent = this.chosenCharacter.name;
        document.getElementById('game-seed').textContent = this.currentSeed;
        document.getElementById('emoji-grid').textContent = this.generateEmojiGrid();
        this.copyResultsTable();
    }

    makeGuess() {
        console.log('Making guess');
        const guessInput = document.getElementById('guess-input');
        const guess = guessInput.value;
        
        if (!names[guess]) {
            alert('Invalid name, try again.');
            return;
        }

        this.guessCount++;
        
        if (this.guessCount > 10 && this.archipelagoClient?.deathLink) {
            this.archipelagoClient.sendDeathLink();
            this.handleDeathLink();
            return;
        }
        
        if (guess === this.chosenCharacter.name) {
            const results = compareTraits(names[guess], this.chosenCharacter.traits);
            this.guessHistory.push(results);
            
            if (this.archipelagoClient?.connected) {
                this.archipelagoClient.sendHint(this.chosenCharacter.traits[9]);
            }
            
            this.stopElapsedTimer();
            document.getElementById('game-play').classList.add('hidden');
            document.getElementById('game-over').classList.remove('hidden');
            document.getElementById('game-over-message').textContent = 'Congratulations! You found the correct character!';
            document.getElementById('correct-character').textContent = this.chosenCharacter.name;
            
            const gameSeedContainer = document.getElementById('game-seed-container');
            if (this.gameMode === 'daily') {
                gameSeedContainer.classList.add('hidden');
            } else {
                gameSeedContainer.classList.remove('hidden');
                document.getElementById('game-seed').textContent = this.currentSeed;
            }
            
            document.getElementById('emoji-grid').textContent = this.generateEmojiGrid();
            
            if (this.gameMode === 'daily') {
                document.getElementById('daily-result-countdown').classList.remove('hidden');
            }
            
            this.copyResultsTable();
            return;
        }
        
        const results = compareTraits(names[guess], this.chosenCharacter.traits);
        this.guessHistory.push(results);
        this.displayResultsUI(guess, results);
        guessInput.value = '';
    }

    resetGame() {
        console.log('Resetting game');
        document.getElementById('game-over').classList.add('hidden');
        document.getElementById('game-setup').classList.remove('hidden');
        document.getElementById('seed-input').value = '';
        document.getElementById('results-table').querySelector('tbody').innerHTML = '';
        document.getElementById('results-table-final').querySelector('tbody').innerHTML = '';
        document.getElementById('emoji-grid').textContent = '';
        document.getElementById('elapsed-timer').textContent = '0:00';
        document.getElementById('daily-result-countdown').classList.add('hidden');
        document.getElementById('game-seed-container').classList.remove('hidden');
        this.chosenCharacter = null;
        this.currentSeed = null;
        this.guessHistory = [];
        this.gameMode = null;
        this.startTime = null;
        this.guessCount = 0;
        if (this.elapsedTimeInterval) {
            clearInterval(this.elapsedTimeInterval);
            this.elapsedTimeInterval = null;
        }
    }

    selectRandomCharacter(mode, seed) {
        console.log('Selecting random character in mode:', mode);
        Math.seedrandom(seed);
        const characterNames = Object.keys(names);
        let selectedName;
        let selectedTraits;
        let attempts = 0;
        const maxAttempts = 1000;
        
        do {
            const index = Math.floor(Math.random() * characterNames.length);
            selectedName = characterNames[index];
            selectedTraits = names[selectedName];
            attempts++;
            
            if (attempts >= maxAttempts) {
                console.error('Could not find a valid character for the selected mode');
                alert('Error: Could not find a valid character. Please try again.');
                this.resetGame();
                return null;
            }
        } while (!this.isValidCharacterForMode(selectedTraits[9], mode));
        
        return { name: selectedName, traits: selectedTraits };
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

    setupAutocomplete() {
        const guessInput = document.getElementById('guess-input');
        if (!guessInput) return;

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
}

// Initialize the game
window.addEventListener('load', () => {
    new GameApp();
});