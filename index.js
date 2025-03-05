import { names, arcs, haki } from './data/characters.js';
import { compareTraits } from './utils/gameLogic.js';

class GameApp {
    constructor() {
        this.chosenCharacter = null;
        this.currentSeed = null;
        this.guessHistory = [];
        this.gameMode = null;
        this.startTime = null;
        this.elapsedTimeInterval = null;
        this.setupEventListeners();
        this.updateDailyCountdown();
        console.log('GameApp initialized');
    }

    setupEventListeners() {
        console.log('Setting up event listeners');
        
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
        const backToMenuButton = document.getElementById('back-to-menu');

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

        if (backToMenuButton) {
            backToMenuButton.addEventListener('click', () => {
                this.resetGame();
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

    generateSeedForCharacter() {
        const characterInput = document.getElementById('character-input');
        const character = characterInput.value;
        
        if (!names[character]) {
            alert('Invalid character name, please try again.');
            return;
        }

        // Generate a unique seed for this character
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
                return seed;
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
        this.gameMode = 'normal';
        this.currentSeed = seedInput.value;
        document.getElementById('game-setup').classList.add('hidden');
        document.getElementById('game-play').classList.remove('hidden');
        document.getElementById('skip-button').classList.remove('hidden');
        this.chosenCharacter = this.selectRandomCharacter('normal', this.currentSeed);
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

    skipGame() {
        if (this.gameMode === 'daily') return;
        
        this.stopElapsedTimer();
        document.getElementById('game-play').classList.add('hidden');
        document.getElementById('game-over').classList.remove('hidden');
        document.getElementById('game-over-message').textContent = 'Game skipped!';
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
        
        if (guess === this.chosenCharacter.name) {
            const results = compareTraits(names[guess], this.chosenCharacter.traits);
            this.guessHistory.push(results);
            
            this.stopElapsedTimer();
            document.getElementById('game-play').classList.add('hidden');
            document.getElementById('game-over').classList.remove('hidden');
            document.getElementById('game-over-message').textContent = 'Congratulations! You found the correct character!';
            document.getElementById('correct-character').textContent = this.chosenCharacter.name;
            
            // Only show seed if not in daily mode
            if (this.gameMode !== 'daily') {
                document.getElementById('game-seed-container').classList.remove('hidden');
                document.getElementById('game-seed').textContent = this.currentSeed;
            }
            
            document.getElementById('emoji-grid').textContent = this.generateEmojiGrid();
            
            // Show daily countdown in results for daily mode
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
        document.getElementById('game-play').classList.add('hidden');
        document.getElementById('game-setup').classList.remove('hidden');
        document.getElementById('seed-input').value = '';
        document.getElementById('results-table').querySelector('tbody').innerHTML = '';
        document.getElementById('results-table-final').querySelector('tbody').innerHTML = '';
        document.getElementById('emoji-grid').textContent = '';
        document.getElementById('elapsed-timer').textContent = '0:00';
        document.getElementById('daily-result-countdown').classList.add('hidden');
        document.getElementById('game-seed-container').classList.add('hidden');
        this.chosenCharacter = null;
        this.currentSeed = null;
        this.guessHistory = [];
        this.gameMode = null;
        this. startTime = null;
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
        const maxAttempts = 1000; // Prevent infinite loop
        
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

// Initialize the game when the DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    console.log('DOM fully loaded and parsed');
    const game = new GameApp();
    game.setupAutocomplete();
});