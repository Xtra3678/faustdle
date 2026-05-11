/**
 * Manages the display and formatting of game results.
 * Handles both visual feedback and emoji grid generation.
 */
export class ResultsManager {
    /**
     * Displays the results of a guess in the results table.
     * @param {string} guessName - The name that was guessed
     * @param {Array} results - Array of result objects containing match data
     */
    displayResults(guessName, results) {
        console.log('Displaying results for guess', guessName);
        const tbody = document.getElementById('results-table').querySelector('tbody');
        const row = document.createElement('tr');
        
        // Create name cell
        const nameCell = document.createElement('td');
        nameCell.textContent = guessName;
        row.appendChild(nameCell);
        
        // Create result cells with appropriate styling
        results.forEach(result => {
            const cell = document.createElement('td');
            cell.textContent = result.text;
            // Apply appropriate styling based on match result
            if (result.match) {
                cell.classList.add('match');
            } else if (result.direction) {
                cell.classList.add('error', `hint-${result.direction}`);
            } else {
                cell.classList.add('error');
            }
            
            row.appendChild(cell);
        });
        
        // Insert new row at the top of the table
        tbody.insertBefore(row, tbody.firstChild);
    }

    /**
     * Displays cached results from a previous game session.
     * @param {Array} guessHistory - Array of previous guesses and their results
     */
    displayCachedResults(guessHistory) {
        const tbody = document.getElementById('results-table').querySelector('tbody');
        tbody.innerHTML = ''; // Clear existing results
        
        // Display each guess from the history
        guessHistory.forEach(guess => {
            const row = document.createElement('tr');
            
            // Add name cell first
            const nameCell = document.createElement('td');
            nameCell.textContent = guess.name;
            row.appendChild(nameCell);
            
            // Add result cells
            guess.results.forEach(result => {
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
        });
        
        this.copyResultsTable();
    }

    /**
     * Generates an emoji grid representation of the game results.
     * @param {Array} guessHistory - Array of guess results
     * @returns {string} Emoji grid string
     */
    generateEmojiGrid(guessHistory) {
        return [...guessHistory].reverse().map(guess => {
            // Handle both formats: array of results or array of { name, results }
            const resultsArray = guess.results || guess;
            
            return resultsArray.map(result => {
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

    /**
     * Copies the results table to the final results display.
     */
    copyResultsTable() {
        const originalTable = document.getElementById('results-table');
        const finalTable = document.getElementById('results-table-final');
        const tbody = finalTable.querySelector('tbody');
        tbody.innerHTML = originalTable.querySelector('tbody').innerHTML;
    }

    /**
     * Clears all result displays.
     */
    clearResults() {
        document.getElementById('results-table').querySelector('tbody').innerHTML = '';
        document.getElementById('results-table-final').querySelector('tbody').innerHTML = '';
        document.getElementById('emoji-grid').textContent = '';
    }
}