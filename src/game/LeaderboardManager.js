/**
 * Manages leaderboard functionality including display, pagination, and score submission.
 * Handles interaction with Supabase database for leaderboard data.
 */
export class LeaderboardManager {
    /**
     * Initializes the leaderboard manager.
     * @param {Object} supabase - Supabase client instance
     */
    constructor(supabase) {
        this.supabase = supabase;
        this.currentPage = 0;         // Current page in pagination
        this.entriesPerPage = 50;     // Number of entries to display per page
        this.currentMode = 'standard'; // Track current mode
        this.currentDifficulty = 'normal'; // Track current difficulty
    }

    /**
     * Creates and initializes the leaderboard dialog UI.
     * Sets up the structure for displaying scores and pagination controls.
     */
    createLeaderboardDialog() {
        const dialog = document.createElement('div');
        dialog.id = 'leaderboard-dialog';
        dialog.className = 'leaderboard-dialog hidden';
        dialog.innerHTML = `
            <div class="leaderboard-content">
                <h3>Leaderboard</h3>
                <div class="mode-selector">
                    <button class="btn btn-standard mode-select" data-mode="standard">Standard</button>
                    <button class="btn btn-scramble mode-select" data-mode="scramble">Scramble</button>
                </div>
                <div id="difficulty-selector" class="mode-selector" style="margin-top: 1rem;">
                    <button class="btn difficulty-select active" data-difficulty="normal">Normal</button>
                    <button class="btn btn-hard difficulty-select" data-difficulty="hard">Hard</button>
                    <button class="btn btn-filler difficulty-select" data-difficulty="filler">Filler</button>
                </div>
                <div class="leaderboard-table">
                    <table>
                        <thead>
                            <tr>
                                <th>Rank</th>
                                <th>Player</th>
                                <th>Streak</th>
                                <th>Points</th>
                                <th>Date</th>
                            </tr>
                        </thead>
                        <tbody></tbody>
                    </table>
                </div>
                <div class="pagination">
                    <button class="btn btn-secondary prev-page" disabled>Previous</button>
                    <span class="page-info">Page 1</span>
                    <button class="btn btn-secondary next-page" disabled>Next</button>
                </div>
                <button class="btn btn-secondary close-leaderboard">Close</button>
            </div>
        `;
        document.querySelector('.container').appendChild(dialog);
        this.setupLeaderboardEvents();
    }

    /**
     * Sets up event listeners for leaderboard interactions.
     * Handles mode selection, pagination, and dialog closing.
     */
    setupLeaderboardEvents() {
        const dialog = document.getElementById('leaderboard-dialog');
        
        // Main mode selection (Standard vs Scramble)
        dialog.querySelectorAll('.mode-select').forEach(button => {
            button.addEventListener('click', () => {
                dialog.querySelectorAll('.mode-select').forEach(b => b.classList.remove('active'));
                button.classList.add('active');
                this.currentPage = 0;
                
                const mode = button.dataset.mode;
                this.currentMode = mode;
                
                // Reset to normal difficulty when switching modes
                this.currentDifficulty = 'normal';
                
                // Update difficulty selector buttons
                const difficultyButtons = dialog.querySelectorAll('.difficulty-select');
                difficultyButtons.forEach(b => b.classList.remove('active'));
                const normalButton = dialog.querySelector('.difficulty-select[data-difficulty="normal"]');
                if (normalButton) {
                    normalButton.classList.add('active');
                }
                
                this.loadLeaderboard();
            });
        });

        // Difficulty selection
        dialog.querySelectorAll('.difficulty-select').forEach(button => {
            button.addEventListener('click', () => {
                dialog.querySelectorAll('.difficulty-select').forEach(b => b.classList.remove('active'));
                button.classList.add('active');
                this.currentPage = 0;
                
                this.currentDifficulty = button.dataset.difficulty;
                this.loadLeaderboard();
            });
        });

        // Pagination
        dialog.querySelector('.prev-page').addEventListener('click', () => {
            if (this.currentPage > 0) {
                this.currentPage--;
                this.loadLeaderboard();
            }
        });

        dialog.querySelector('.next-page').addEventListener('click', () => {
            this.currentPage++;
            this.loadLeaderboard();
        });

        // Close button
        dialog.querySelector('.close-leaderboard').addEventListener('click', () => {
            dialog.classList.add('hidden');
        });
    }

    /**
     * Loads and displays leaderboard entries for the current mode and difficulty.
     * Handles pagination and updates the UI with retrieved data.
     */
    async loadLeaderboard() {
        const dialog = document.getElementById('leaderboard-dialog');
        const tbody = dialog.querySelector('tbody');
        const prevButton = dialog.querySelector('.prev-page');
        const nextButton = dialog.querySelector('.next-page');
        const pageInfo = dialog.querySelector('.page-info');

        try {
            let modeFilter;
            
            // Determine the database mode filter based on current selection
            if (this.currentMode === 'scramble') {
                // For scramble mode, we store entries with mode = 'scramble_difficulty'
                modeFilter = `scramble_${this.currentDifficulty}`;
            } else {
                // For standard modes, mode = difficulty name directly
                modeFilter = this.currentDifficulty;
            }

            // Get total count
            const { count } = await this.supabase
                .from('leaderboard_entries')
                .select('id', { count: 'exact', head: true })
                .eq('mode', modeFilter);

            // Get paginated data, ordered by streak first, then points
            const { data: entries, error } = await this.supabase
                .from('leaderboard_entries')
                .select('*')
                .eq('mode', modeFilter)
                .order('streak', { ascending: false })
                .order('points', { ascending: false, nullsLast: true })
                .range(this.currentPage * this.entriesPerPage, 
                       (this.currentPage + 1) * this.entriesPerPage - 1);

            if (error) throw error;

            // Update pagination controls
            prevButton.disabled = this.currentPage === 0;
            nextButton.disabled = (this.currentPage + 1) * this.entriesPerPage >= count;
            pageInfo.textContent = `Page ${this.currentPage + 1}`;

            // Clear and populate table
            tbody.innerHTML = '';
            if (entries.length === 0) {
                tbody.innerHTML = '<tr><td colspan="5">No entries found for this mode</td></tr>';
            } else {
                entries.forEach((entry, index) => {
                    const rank = this.currentPage * this.entriesPerPage + index + 1;
                    const row = document.createElement('tr');
                    row.innerHTML = `
                        <td>${rank}</td>
                        <td>${entry.player_name}</td>
                        <td>${entry.streak}</td>
                        <td>${entry.points !== null ? entry.points : 'N/A'}</td>
                        <td>${new Date(entry.created_at).toLocaleDateString()}</td>
                    `;
                    tbody.appendChild(row);
                });
            }
        } catch (error) {
            console.error('Error loading leaderboard:', error);
            tbody.innerHTML = '<tr><td colspan="5">Error loading leaderboard</td></tr>';
        }
    }

    /**
     * Saves a player's score to the leaderboard.
     * @param {string} playerName - Name of the player
     * @param {number} streak - Player's streak count
     * @param {string} mode - Game mode the streak was achieved in
     * @param {number} points - Player's total points (optional)
     * @returns {Promise<boolean>} Success status of the save operation
     */
    async saveScore(playerName, streak, mode, points = null) {
        try {
            const entry = {
                player_name: playerName,
                streak: streak,
                mode: mode
            };
            
            // Only add points if provided
            if (points !== null) {
                entry.points = points;
            }
            
            const { error } = await this.supabase
                .from('leaderboard_entries')
                .insert([entry]);

            if (error) throw error;
            return true;
        } catch (error) {
            console.error('Error saving score:', error);
            return false;
        }
    }

    /**
     * Saves a scramble mode score with specific difficulty
     * @param {string} playerName - Name of the player
     * @param {number} streak - Player's streak count
     * @param {string} difficulty - Scramble difficulty (normal, hard, filler)
     * @param {number} points - Player's total points (optional)
     * @returns {Promise<boolean>} Success status of the save operation
     */
    async saveScrambleScore(playerName, streak, difficulty, points = null) {
        try {
            const entry = {
                player_name: playerName,
                streak: streak,
                mode: `scramble_${difficulty}`
            };
            
            // Only add points if provided
            if (points !== null) {
                entry.points = points;
            }
            
            const { error } = await this.supabase
                .from('leaderboard_entries')
                .insert([entry]);

            if (error) throw error;
            return true;
        } catch (error) {
            console.error('Error saving scramble score:', error);
            return false;
        }
    }

    /**
     * Displays a prompt for the player to enter their name when saving a score.
     * @param {number} streak - Player's streak to save
     * @param {string} mode - Game mode the streak was achieved in
     * @param {number} points - Player's total points (optional)
     * @param {string} difficulty - Difficulty for scramble mode (optional)
     */
    showNamePrompt(streak, mode, points = null, difficulty = null) {
        const dialog = document.createElement('div');
        dialog.className = 'name-prompt-dialog';
        
        let pointsText = '';
        if (points !== null) {
            pointsText = `<p>Your points: ${points}</p>`;
        }
        
        dialog.innerHTML = `
            <div class="name-prompt-content">
                <h3>Save Your Score</h3>
                <p>Your streak: ${streak}</p>
                ${pointsText}
                <input type="text" id="player-name-input" placeholder="Enter your name" maxlength="20">
                <div class="button-group">
                    <button class="btn save-score">Save</button>
                    <button class="btn btn-secondary cancel-save">Cancel</button>
                </div>
            </div>
        `;

        document.body.appendChild(dialog);

        const handleSave = async () => {
            const nameInput = document.getElementById('player-name-input');
            const name = nameInput.value.trim();
            
            if (name) {
                let success;
                if (mode === 'scramble' && difficulty) {
                    success = await this.saveScrambleScore(name, streak, difficulty, points);
                } else {
                    success = await this.saveScore(name, streak, mode, points);
                }
                
                if (success) {
                    alert('Score saved successfully!');
                } else {
                    alert('Failed to save score. Please try again.');
                }
            } else {
                alert('Please enter a name');
                return;
            }
            
            dialog.remove();
        };

        dialog.querySelector('.save-score').addEventListener('click', handleSave);
        dialog.querySelector('.cancel-save').addEventListener('click', () => dialog.remove());
        dialog.querySelector('#player-name-input').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') handleSave();
        });
    }
}