import seedrandom from 'seedrandom';

/**
 * Manages Scramble Mode functionality
 * Handles character selection, validation, and game logic for scramble mode
 */
export class ScrambleManager {
    constructor(characterSelector) {
        this.characterSelector = characterSelector;
        this.scrambleCharacters = [];
        this.correctCharacter = null;
        this.difficulty = 'normal';
    }

    /**
     * Generates a scramble game with 5 random characters
     * @param {string} difficulty - Game difficulty (normal, hard, filler)
     * @param {string} seed - Random seed for character selection
     * @returns {Object} Scramble game data
     */
    generateScrambleGame(difficulty, seed) {
        this.difficulty = difficulty;
        const rng = seedrandom(seed);

        // Get all valid characters for this difficulty mode
        const validCharacters = this.characterSelector.getCharactersByMode(difficulty);
        
        if (validCharacters.length < 6) { // Need at least 6 to ensure we can pick 5 + 1 correct
            throw new Error(`Not enough characters available for ${difficulty} mode. Found ${validCharacters.length}, need at least 6.`);
        }

        // Shuffle the valid characters using the seeded RNG
        const shuffledCharacters = [...validCharacters];
        for (let i = shuffledCharacters.length - 1; i > 0; i--) {
            const j = Math.floor(rng() * (i + 1));
            [shuffledCharacters[i], shuffledCharacters[j]] = [shuffledCharacters[j], shuffledCharacters[i]];
        }

        // Select the correct character first (index 0 after shuffle)
        this.correctCharacter = shuffledCharacters[0];
        
        // Select 5 different characters for the table (excluding the correct one)
        const tableCharacters = shuffledCharacters.slice(1, 6);
        
        this.scrambleCharacters = tableCharacters;

        return {
            characters: tableCharacters,
            correctCharacter: this.correctCharacter.name,
            traits: this.correctCharacter.traits
        };
    }

    /**
     * Gets the scramble characters with their traits for display
     * @returns {Array} Array of character objects with names and traits
     */
    getScrambleCharactersWithTraits() {
        return this.scrambleCharacters.map(character => ({
            name: character.name,
            traits: character.traits
        }));
    }

    /**
     * Gets the correct character's traits for comparison
     * @returns {Array} Correct character's traits
     */
    getCorrectCharacterTraits() {
        return this.correctCharacter ? this.correctCharacter.traits : null;
    }

    /**
     * Checks if the guess is correct
     * @param {string} guess - The guessed character name
     * @returns {boolean} True if guess is correct
     */
    isCorrectGuess(guess) {
        return guess === this.correctCharacter.name;
    }

    /**
     * Gets the correct character
     * @returns {Object} Correct character data
     */
    getCorrectCharacter() {
        return this.correctCharacter;
    }

    /**
     * Resets the scramble manager
     */
    reset() {
        this.scrambleCharacters = [];
        this.correctCharacter = null;
        this.difficulty = 'normal';
    }
}