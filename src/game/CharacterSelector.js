import seedrandom from 'seedrandom';
import { names } from '../data/characters.js';
import { alternateNames } from '../data/alternateNames.js';

export class CharacterSelector {
    selectRandomCharacter(mode, seed) {
        console.log('Selecting random character in mode:', mode);
        try {
            const rng = seedrandom(seed);
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
            throw error;
        }
    }

    /**
     * Gets all characters that are valid for the specified game mode
     * @param {string} mode - Game mode (normal, hard, filler)
     * @returns {Array} Array of character objects with name and traits
     */
    getCharactersByMode(mode) {
        const validCharacters = [];
        
        for (const [name, traits] of Object.entries(names)) {
            if (this.isValidCharacterForMode(traits[9], mode)) {
                validCharacters.push({ name, traits });
            }
        }
        
        return validCharacters;
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

    findCharacterName(input) {
        const lowerInput = input.toLowerCase();
        
        // First try direct match
        const directMatch = Object.keys(names).find(name => 
            name.toLowerCase() === lowerInput
        );
        if (directMatch) return directMatch;

        // Then check alternate names
        for (const [originalName, alternates] of Object.entries(alternateNames)) {
            if (alternates.some(alt => alt.toLowerCase() === lowerInput)) {
                return originalName;
            }
        }

        return null;
    }
}