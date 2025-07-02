import { names } from '../data/characters.js';

/**
 * Manages all UI-related functionality and updates.
 * Handles display updates, animations, and UI state management.
 */
export class UIManager {
    /**
     * Initializes the UI manager.
     * @param {Object} supabase - Supabase client instance for database operations
     */
    constructor(supabase) {
        this.supabase = supabase;
        this.currentCharacter = null;
    }

    toggleStreakModeUI(enabled) {
        const dailyModeButton = document.getElementById('daily-mode');
        const seedSection = document.getElementById('seed-section');
        
        if (enabled) {
            if (dailyModeButton) dailyModeButton.style.display = 'none';
            if (seedSection) seedSection.style.display = 'none';
            document.getElementById('other-dialog').classList.add('hidden');
        } else {
            if (dailyModeButton) dailyModeButton.style.display = 'block';
            if (seedSection) seedSection.style.display = 'block';
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
            if (countdownTimer) countdownTimer.textContent = timerText;
            if (resultCountdownTimer) resultCountdownTimer.textContent = timerText;
        };

        updateTimer();
        setInterval(updateTimer, 1000);
    }

    getDailyChallengeNumber() {
        const startDate = new Date('2025-03-04');
        const today = new Date();
        const diffTime = Math.abs(today - startDate);
        const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
        return diffDays + 1;
    }

    updateDailyPlayerCount(count) {
        if (window.gameMode !== 'daily') return;

        // Remove any existing count display
        this.removeDailyPlayerCount();

        // Create and add new count display
        const countElement = document.createElement('div');
        countElement.className = 'daily-player-count';
        countElement.textContent = `${count} ${count === 1 ? 'player has' : 'players have'} completed today's challenge`;
        
        const emojiGrid = document.getElementById('emoji-grid');
        if (emojiGrid && emojiGrid.parentNode) {
            emojiGrid.parentNode.insertBefore(countElement, emojiGrid.nextSibling);
        }
    }

    removeDailyPlayerCount() {
        const existingCount = document.querySelector('.daily-player-count');
        if (existingCount) {
            existingCount.remove();
        }
    }

    showGameOver(message, character, seed, isStreak = false, streakCount = 0, completionTime = null, roundPoints = null, totalPoints = null, isInDiscord = false) {
        const gamePlay = document.getElementById('game-play');
        const gameOver = document.getElementById('game-over');
        const gameOverMessage = document.getElementById('game-over-message');
        const correctCharacter = document.getElementById('correct-character');
        const seedContainer = document.getElementById('game-seed-container');
        const gameSeed = document.getElementById('game-seed');
        const emojiGrid = document.getElementById('emoji-grid');
        const resultsTable = document.getElementById('results-table-final');
        const finalTime = document.getElementById('final-time');
        const gameMode = window.gameMode;
        
        this.currentCharacter = character;
        
        if (gamePlay) gamePlay.classList.add('hidden');
        if (gameOver) gameOver.classList.remove('hidden');
        if (gameOverMessage) gameOverMessage.textContent = message;
        
        // Create wiki link for character name
        if (correctCharacter) {
            const characterData = names[character];
            if (characterData && characterData[11]) { // Check if wiki URL exists
                const link = document.createElement('a');
                link.href = characterData[11];
                link.textContent = character;
                link.target = '_blank';
                link.className = 'character-name';
                correctCharacter.innerHTML = ''; // Clear existing content
                correctCharacter.appendChild(link);
            } else {
                const span = document.createElement('span');
                span.textContent = character;
                span.className = 'character-name';
                correctCharacter.innerHTML = '';
                correctCharacter.appendChild(span);
            }
        }

        // Set completion time if provided
        if (finalTime && completionTime) {
            finalTime.textContent = completionTime;
        }
        
        // Always show emoji grid and results table
        if (emojiGrid) emojiGrid.style.display = 'block';
        if (resultsTable) resultsTable.style.display = 'block';
        
        this.removeStreakCounter();
        this.removeDailyElements();
        this.removeShareButtons();
        this.removePointsDisplay();
        
        // Handle seed container visibility
        if (seedContainer && gameSeed) {
            if (isStreak || gameMode === 'daily') {
                seedContainer.classList.add('hidden');
            } else {
                seedContainer.classList.remove('hidden');
                gameSeed.textContent = seed;
            }
        }
        
        if (isStreak) {
            this.addStreakCounter(streakCount);
            if (roundPoints !== null || totalPoints !== null) {
                this.addPointsDisplay(roundPoints, totalPoints);
            }
            this.addCopyButton('streak');
        } else if (gameMode === 'daily') {
            this.addDailyTitle();
            this.addShareButtons();
        } else {
            this.addCopyButton('normal');
        }
    }

    addPointsDisplay(roundPoints, totalPoints) {
        this.removePointsDisplay(); // Remove any existing points display first
        
        const pointsContainer = document.createElement('div');
        pointsContainer.className = 'points-display';
        
        if (roundPoints !== null && roundPoints > 0) {
            const roundPointsElement = document.createElement('div');
            roundPointsElement.className = 'round-points';
            roundPointsElement.textContent = `Round Points: +${roundPoints}`;
            pointsContainer.appendChild(roundPointsElement);
        }
        
        if (totalPoints !== null) {
            const totalPointsElement = document.createElement('div');
            totalPointsElement.className = 'total-points';
            totalPointsElement.textContent = `Total Points: ${totalPoints}`;
            pointsContainer.appendChild(totalPointsElement);
        }
        
        const streakCounter = document.querySelector('.streak-count');
        if (streakCounter && streakCounter.parentNode) {
            streakCounter.parentNode.insertBefore(pointsContainer, streakCounter.nextSibling);
        }
    }

    removePointsDisplay() {
        const existingPoints = document.querySelector('.points-display');
        if (existingPoints) {
            existingPoints.remove();
        }
    }

    addShareButtons() {
        this.removeShareButtons(); // Remove any existing share buttons first
        
        const shareContainer = document.createElement('div');
        shareContainer.className = 'share-buttons';
        
        // Copy button
        const copyButton = document.createElement('button');
        copyButton.className = 'btn btn-share';
        copyButton.textContent = 'Copy Results';
        copyButton.onclick = () => this.copyResults('daily');
        
        // Twitter share button
        const twitterButton = document.createElement('button');
        twitterButton.className = 'btn btn-twitter';
        twitterButton.textContent = 'Share on Twitter';
        twitterButton.onclick = () => this.shareToTwitter();
        
        // Bluesky share button
        const blueskyButton = document.createElement('button');
        blueskyButton.className = 'btn btn-bluesky';
        blueskyButton.textContent = 'Share on Bluesky';
        blueskyButton.onclick = () => this.shareToBluesky();
        
        shareContainer.appendChild(copyButton);
        shareContainer.appendChild(twitterButton);
        shareContainer.appendChild(blueskyButton);
        
        const resultsTable = document.getElementById('results-table-final');
        resultsTable.parentNode.insertBefore(shareContainer, resultsTable);
    }

    addCopyButton(mode) {
        const shareContainer = document.createElement('div');
        shareContainer.className = 'share-buttons';
        
        const copyButton = document.createElement('button');
        copyButton.className = 'btn btn-share';
        copyButton.textContent = 'Copy Results';
        copyButton.onclick = () => this.copyResults(mode);
        
        shareContainer.appendChild(copyButton);
        
        const resultsTable = document.getElementById('results-table-final');
        resultsTable.parentNode.insertBefore(shareContainer, resultsTable);
    }

    removeShareButtons() {
        const existingShareButtons = document.querySelector('.share-buttons');
        if (existingShareButtons) {
            existingShareButtons.remove();
        }
    }

    copyResults(mode) {
        const emojiGrid = document.getElementById('emoji-grid').textContent;
        const finalTime = document.getElementById('final-time').textContent;
        let text = '';

        switch(mode) {
            case 'daily':
                text = `Faustdle Day #${this.getDailyChallengeNumber()}\nTime: ${finalTime}\n\n${emojiGrid}\n\nhttps://faustdle.com`;
                break;
            case 'streak':
                const streakCount = document.querySelector('.streak-count')?.textContent.match(/\d+/)[0] || '0';
                const totalPoints = document.querySelector('.total-points')?.textContent.match(/\d+/)[0] || '0';
                text = `Found ${this.currentCharacter}\nStreak: ${streakCount} | Points: ${totalPoints}\nTime: ${finalTime}\n\n${emojiGrid}\n\nhttps://faustdle.com`;
                break;
            default:
                text = `Found ${this.currentCharacter}\nTime: ${finalTime}\n\n${emojiGrid}\n\nhttps://faustdle.com`;
        }
        
        navigator.clipboard.writeText(text).then(() => {
            alert('Results copied to clipboard!');
        }).catch(err => {
            console.error('Failed to copy results:', err);
            alert('Failed to copy results');
        });
    }

    shareToTwitter() {
        const dailyTitle = `Faustdle Day #${this.getDailyChallengeNumber()}`;
        const emojiGrid = document.getElementById('emoji-grid').textContent;
        const text = encodeURIComponent(`${dailyTitle}\n\n${emojiGrid}\n\nhttps://faustdle.com #OnePiece`);
        window.open(`https://twitter.com/intent/tweet?text=${text}`, '_blank');
    }

    shareToBluesky() {
        const dailyTitle = `Faustdle Day #${this.getDailyChallengeNumber()}`;
        const emojiGrid = document.getElementById('emoji-grid').textContent;
        const text = encodeURIComponent(`${dailyTitle} \n \n${emojiGrid} \n \n https://faustdle.com #OnePiece`);
        window.open(`https://bsky.app/intent/compose?text=${text}`, '_blank');
    }

    addDailyTitle() {
        this.removeDailyTitle();
        
        const dailyTitle = document.createElement('div');
        dailyTitle.className = 'daily-title';
        dailyTitle.textContent = `Faustdle Day #${this.getDailyChallengeNumber()}`;
        
        const emojiGrid = document.getElementById('emoji-grid');
        if (emojiGrid && emojiGrid.parentNode) {
            emojiGrid.parentNode.insertBefore(dailyTitle, emojiGrid);
        }
    }

    removeDailyTitle() {
        const existingTitle = document.querySelector('.daily-title');
        if (existingTitle) {
            existingTitle.remove();
        }
    }

    removeDailyElements() {
        this.removeDailyTitle();
        this.removeDailyPlayerCount();
        this.removeShareButtons();
    }

    removeStreakCounter() {
        const existingStreak = document.querySelector('.streak-count');
        if (existingStreak) {
            existingStreak.remove();
        }
    }

    addStreakCounter(count) {
        const emojiGrid = document.getElementById('emoji-grid');
        const streakText = document.createElement('div');
        streakText.className = 'streak-count';
        streakText.textContent = `Current Streak: ${count}`;
        if (emojiGrid && emojiGrid.parentNode) {
            emojiGrid.parentNode.insertBefore(streakText, emojiGrid);
        }
    }
}

export default UIManager;