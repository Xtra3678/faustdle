/**
 * Manages UI elements specific to Scramble Mode
 * Handles scramble-specific displays and instructions
 */
export class ScrambleUI {
    constructor() {
        this.scrambleContainer = null;
    }

    /**
     * Creates the scramble mode UI elements
     */
    createScrambleUI() {
        // Remove existing scramble UI if it exists
        this.removeScrambleUI();

       
    }

    /**
     * Updates the scramble instructions for streak mode
     * @param {number} streakCount - Current streak count
     */
    updateStreakInstructions(streakCount) {
        const instructions = document.querySelector('.scramble-instructions');
        if (instructions) {
            instructions.innerHTML = `
                <h3>🎯 Scramble Mode - Streak ${streakCount}</h3>
                <p>5 random characters have been "guessed" for you. Study their traits and identify which one is the correct character in <strong>1 guess</strong>!</p>
            `;
        }
    }

    /**
     * Removes the scramble UI elements
     */
    removeScrambleUI() {
        if (this.scrambleContainer) {
            this.scrambleContainer.remove();
            this.scrambleContainer = null;
        }
    }

    /**
     * Shows game over message specific to scramble mode
     * @param {boolean} isCorrect - Whether the guess was correct
     * @param {string} correctCharacter - Name of the correct character
     */
    showScrambleGameOver(isCorrect, correctCharacter) {
        const message = isCorrect 
            ? 'Congratulations! You identified the correct character!' 
            : 'Game Over! Better luck next time!';
        
        return message;
    }
}