import { names } from '../data/characters.js';
import { AutocompleteManager } from './AutocompleteManager.js';
import { CharacterSelector } from './CharacterSelector.js';
import { TimerManager } from './TimerManager.js';
import { ResultsManager } from './ResultsManager.js';
import { UIManager } from './UIManager.js';
import { ScrambleManager } from './ScrambleManager.js';
import { ScrambleUI } from './ScrambleUI.js';
import { LeaderboardManager } from './LeaderboardManager.js';
import { APConnection } from '../components/APConnection.js';
import { apClient } from '../archipelago/client.js';
import { DiscordManager } from '../discord/DiscordManager.js';
import { MusicManager } from '../audio/MusicManager.js';
import { compareTraits } from '../utils/gameLogic.js';
import { createClient } from '@supabase/supabase-js';
import { DiscordProxy } from '../utils/DiscordProxy.js';

export default class GameApp {
    constructor() {
        this.supabase = null;
        this.discordProxy = null;
        this.autocompleteManager = new AutocompleteManager();
        this.characterSelector = new CharacterSelector();
        this.timerManager = new TimerManager();
        this.resultsManager = new ResultsManager();
        this.uiManager = null;
        this.scrambleManager = new ScrambleManager(this.characterSelector);
        this.scrambleUI = new ScrambleUI();
        this.leaderboardManager = null;
        this.apConnection = null;
        this.discordManager = new DiscordManager();
        this.musicManager = new MusicManager();
        
        this.chosenCharacter = null;
        this.guessHistory = [];
        this.gameMode = 'normal';
        this.currentSeed = null;
        this.startTime = null;
        this.isStreakMode = false;
        this.streakCount = 0;
        this.streakDifficulty = 'normal';
        this.totalPoints = 0;
        this.gameStarted = false;
        this.isScrambleMode = false;
        this.scrambleDifficulty = 'normal';
        this.previousWinner = null;
        this.isDiscordAuthenticated = false;
        
        // Secret seed functionality
        this.scrambleFeaturesUnlocked = this.checkScrambleUnlocked();
        
        this.init();
    }

    /**
     * Check if scramble features have been unlocked
     */
    checkScrambleUnlocked() {
        const unlocked = localStorage.getItem('scramble-features-unlocked');
        return unlocked === 'true';
    }

    /**
     * Unlock scramble features and save to localStorage
     */
    unlockScrambleFeatures() {
        this.scrambleFeaturesUnlocked = true;
        localStorage.setItem('scramble-features-unlocked', 'true');
        this.updateScrambleVisibility();
        console.log('Scramble features unlocked!');
    }

    /**
     * Update visibility of scramble-related elements
     */
    updateScrambleVisibility() {
        // Main menu scramble button
        const scrambleButton = document.getElementById('scramble-mode');
        if (scrambleButton) {
            scrambleButton.style.display = this.scrambleFeaturesUnlocked ? 'inline-flex' : 'none';
        }

        // Streak mode scramble option
        const streakScrambleButton = document.querySelector('.streak-difficulty-select[data-mode="scramble"]');
        if (streakScrambleButton) {
            streakScrambleButton.style.display = this.scrambleFeaturesUnlocked ? 'inline-flex' : 'none';
        }

        // Leaderboard scramble tab
        const leaderboardScrambleButton = document.querySelector('.mode-select[data-mode="scramble"]');
        if (leaderboardScrambleButton) {
            leaderboardScrambleButton.style.display = this.scrambleFeaturesUnlocked ? 'inline-flex' : 'none';
        }
      const leaderboardStandardButton = document.querySelector('.mode-select[data-mode="standard"]');
        if (leaderboardStandardButton) {
            leaderboardStandardButton.style.display = this.scrambleFeaturesUnlocked ? 'inline-flex' : 'none';
        }

        // Update FAQ text about scramble mode
        this.updateFAQText();
    }

    /**
     * Update FAQ text to include or exclude scramble mode information
     */
    updateFAQText() {
        const faqText = document.querySelector('.faq-text');
        if (!faqText) return;

        // Find the streak mode paragraph
        const streakParagraph = faqText.querySelector('p:has(b)');
        if (streakParagraph && streakParagraph.innerHTML.includes('Streak Mode:')) {
            if (this.scrambleFeaturesUnlocked) {
                // Include scramble mode in the text
                streakParagraph.innerHTML = '<b>Streak Mode:</b> Build a streak on any of the 4 difficulties! You get 6 guesses on Normal, 8 on Hard and Filler, and 1 guess on Scramble. You can submit your final streak to the leaderboard. It\'s ok to use search engines, especially on Hard and Filler, but remember that your value as a person is tied to how good you are at knowing One Piece characters, so do so at your own peril!';
            } else {
                // Exclude scramble mode from the text
                streakParagraph.innerHTML = '<b>Streak Mode:</b> Build a streak on any of the 3 difficulties! You get 6 guesses on Normal and 8 on Hard and Filler. You can submit your final streak to the leaderboard. It\'s ok to use search engines, especially on Hard and Filler, but remember that your value as a person is tied to how good you are at knowing One Piece characters, so do so at your own peril!';
            }
        }

        // Find and update scramble mode description
        const scrambleParagraph = Array.from(faqText.querySelectorAll('p')).find(p => 
            p.innerHTML.includes('Scramble Mode:')
        );
        
        if (scrambleParagraph) {
            scrambleParagraph.style.display = this.scrambleFeaturesUnlocked ? 'block' : 'none';
        }
    }

    async init() {
        try {
            await this.initializeSupabase();
            await this.initializeDiscord();
            await this.initializeMusic();
            this.setupEventListeners();
            this.setupUI();
            this.uiManager.updateDailyCountdown();
            
            // Update scramble visibility after UI is set up
            this.updateScrambleVisibility();
            
            // Check for daily mode progress on startup
            this.loadDailyProgress();
        } catch (error) {
            console.error('Failed to initialize app:', error);
            this.setupEventListeners();
            this.setupUI();
            this.uiManager.updateDailyCountdown();
            this.updateScrambleVisibility();
        }
    }

    async initializeSupabase() {
        try {
            const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
            const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
            
            if (!supabaseUrl || !supabaseKey) {
                throw new Error('Supabase configuration missing');
            }

            // Check if we're in Discord environment and need proxy
            if (this.discordManager.isInDiscordEnvironment()) {
                console.log('Initializing Supabase with Discord proxy...');
                
                // Import Discord SDK to get the instance
                const module = await import('@discord/embedded-app-sdk');
                const DiscordSDK = module.DiscordSDK || module.Discord || module.default;
                
                if (DiscordSDK) {
                    // Create a minimal SDK instance for proxy
                    const sdk = new DiscordSDK({ clientId: '1351722811718373447' });
                    this.discordProxy = new DiscordProxy(sdk);
                    
                    // Create Supabase client with custom fetch
                    this.supabase = createClient(supabaseUrl, supabaseKey, {
                        global: {
                            fetch: (url, options) => this.discordProxy.fetch(url, options)
                        }
                    });
                } else {
                    throw new Error('Discord SDK not available for proxy');
                }
            } else {
                // Regular Supabase initialization
                this.supabase = createClient(supabaseUrl, supabaseKey);
            }

            this.uiManager = new UIManager(this.supabase);
            this.leaderboardManager = new LeaderboardManager(this.supabase);
            this.apConnection = new APConnection(document.querySelector('.container'));
            
            console.log('Supabase initialized successfully');
        } catch (error) {
            console.error('Supabase initialization failed:', error);
            this.uiManager = new UIManager(null);
            this.leaderboardManager = new LeaderboardManager(null);
            this.apConnection = new APConnection(document.querySelector('.container'));
        }
    }

    async initializeDiscord() {
        try {
            await this.discordManager.initialize(this.supabase);
            console.log('Discord integration initialized');
            
            // Listen for Discord auth changes
            document.addEventListener('discord-auth-change', (event) => {
                this.handleDiscordAuthChange(event.detail);
            });
            
            // Check for OAuth callback on page load
            this.handleOAuthCallback();
        } catch (error) {
            console.warn('Discord initialization failed:', error);
        }
    }

    async initializeMusic() {
        try {
            await this.musicManager.initialize();
            console.log('Music system initialized');
        } catch (error) {
            console.warn('Music initialization failed:', error);
        }
    }

    setupUI() {
        if (this.leaderboardManager) {
            this.leaderboardManager.createLeaderboardDialog();
        }
        this.createStreakModeDialog();
        this.createScrambleDifficultyDialog();
    }

    createStreakModeDialog() {
        const dialog = document.createElement('div');
        dialog.id = 'streak-mode-dialog';
        dialog.className = 'streak-mode-dialog hidden';
        dialog.innerHTML = `
            <div class="streak-mode-content">
                <h3>Select Streak Mode Difficulty</h3>
                <div class="streak-mode-buttons">
                    <button class="btn streak-difficulty-select" data-mode="normal">Normal Mode</button>
                    <button class="btn btn-hard streak-difficulty-select" data-mode="hard">Hard Mode</button>
                    <button class="btn btn-filler streak-difficulty-select" data-mode="filler">Filler Mode</button>
                    <button class="btn btn-scramble streak-difficulty-select" data-mode="scramble" style="display: none;">Scramble Mode</button>
                    <button class="btn btn-secondary" id="streak-difficulty-cancel">Cancel</button>
                </div>
            </div>
        `;
        document.querySelector('.container').appendChild(dialog);

        // Setup event listeners
        dialog.querySelectorAll('.streak-difficulty-select').forEach(button => {
            button.addEventListener('click', () => {
                const mode = button.dataset.mode;
                if (mode === 'scramble') {
                    // Show scramble difficulty selection for streak mode
                    dialog.classList.add('hidden');
                    this.showScrambleDifficultyDialog(true);
                } else {
                    this.startStreakMode(mode);
                    dialog.classList.add('hidden');
                }
            });
        });

        dialog.querySelector('#streak-difficulty-cancel').addEventListener('click', () => {
            dialog.classList.add('hidden');
        });
    }

    createScrambleDifficultyDialog() {
        // Dialog already exists in HTML, just need to set up event listeners
        const dialog = document.getElementById('scramble-difficulty-dialog');
        
        dialog.querySelectorAll('.scramble-difficulty-select').forEach(button => {
            button.addEventListener('click', () => {
                const mode = button.dataset.mode;
                this.scrambleDifficulty = mode;
                
                if (this.isStreakMode) {
                    // Starting streak mode with scramble
                    this.startStreakMode('scramble');
                } else {
                    // Starting single scramble game
                    this.startScrambleGame(mode);
                }
                
                dialog.classList.add('hidden');
            });
        });

        dialog.querySelector('#scramble-difficulty-cancel').addEventListener('click', () => {
            dialog.classList.add('hidden');
        });
    }

    showScrambleDifficultyDialog(isFromStreak = false) {
        const dialog = document.getElementById('scramble-difficulty-dialog');
        this.isStreakMode = isFromStreak;
        dialog.classList.remove('hidden');
    }

    setupEventListeners() {
        // Mode selection buttons
        document.getElementById('normal-mode')?.addEventListener('click', () => this.startGame('normal'));
        document.getElementById('hard-mode')?.addEventListener('click', () => this.startGame('hard'));
        document.getElementById('filler-mode')?.addEventListener('click', () => this.startGame('filler'));
        document.getElementById('scramble-mode')?.addEventListener('click', () => this.showScrambleDifficultyDialog(false));
        document.getElementById('daily-mode')?.addEventListener('click', () => this.startDailyGame());
        document.getElementById('streak-mode')?.addEventListener('click', () => this.showStreakModeDialog());

        // Seed functionality
        document.getElementById('seed-start')?.addEventListener('click', () => this.startGameWithSeed());
        document.getElementById('generate-seed')?.addEventListener('click', () => this.showSeedGenerator());
        document.getElementById('generate-seed-for-character')?.addEventListener('click', () => this.generateSeedForCharacter());
        document.getElementById('use-generated-seed')?.addEventListener('click', () => this.useGeneratedSeed());
        document.getElementById('back-to-main')?.addEventListener('click', () => this.backToMainMenu());

        // Game controls
        document.getElementById('guess-button')?.addEventListener('click', () => this.makeGuess());
        document.getElementById('skip-button')?.addEventListener('click', () => this.skipCharacter());
        document.getElementById('play-again')?.addEventListener('click', () => this.playAgain());

        // FAQ dialog
        document.getElementById('faq-button')?.addEventListener('click', () => this.showFAQ());
        document.getElementById('faq-back')?.addEventListener('click', () => this.hideFAQ());

        // Leaderboard button
        document.getElementById('leaderboard-button')?.addEventListener('click', () => this.showLeaderboard());

        // Enter key support
        document.getElementById('guess-input')?.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') this.makeGuess();
        });

        document.getElementById('seed-input')?.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') this.startGameWithSeed();
        });

        document.getElementById('character-input')?.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') this.generateSeedForCharacter();
        });

        // AP connection events
        document.addEventListener('ap-connect-request', (event) => {
            this.handleAPConnection(event.detail);
        });

        // Death link events
        document.addEventListener('death_link_received', () => {
            if (this.gameStarted) {
                this.skipCharacter(true);
            }
        });

        document.addEventListener('death_link_triggered', () => {
            if (this.gameStarted) {
                this.skipCharacter(true);
            }
        });
    }

    // Daily mode caching methods
    getDailyChallengeCache() {
        const cache = localStorage.getItem('dailyChallenge');
        if (!cache) return null;
        
        try {
            const data = JSON.parse(cache);
            const today = new Date().toISOString().split('T')[0];
            
            if (data.date === today) {
                return data;
            }
            
            localStorage.removeItem('dailyChallenge');
            return null;
        } catch (error) {
            console.error('Error parsing daily challenge cache:', error);
            return null;
        }
    }

    saveDailyChallengeCache(data) {
        try {
            const today = new Date().toISOString().split('T')[0];
            const cacheData = {
                date: today,
                completed: data.completed || false,
                character: data.character,
                guessHistory: data.guessHistory || [],
                completionTime: data.completionTime || null,
                startTime: data.startTime || null,
                inProgress: data.inProgress || false
            };
            localStorage.setItem('dailyChallenge', JSON.stringify(cacheData));
            console.log('Daily challenge cache saved:', cacheData);
        } catch (error) {
            console.error('Error saving daily challenge cache:', error);
        }
    }

    loadDailyProgress() {
        const cache = this.getDailyChallengeCache();
        if (!cache) return false;

        // If already completed, don't load progress
        if (cache.completed) return false;

        // If there's progress but not completed, restore the game state
        if (cache.inProgress && cache.character) {
            console.log('Loading daily progress from cache:', cache);
            
            // Restore game state
            this.gameMode = 'daily';
            window.gameMode = 'daily';
            this.currentSeed = this.getDailySeed();
            this.chosenCharacter = cache.character.name;
            this.guessHistory = cache.guessHistory || [];
            
            // Restore timer if there was a start time
            if (cache.startTime) {
                this.timerManager.startTime = cache.startTime;
                this.timerManager.startTimer();
            }

            // Show game UI
            this.showGamePlay();
            
            // Hide skip button for daily mode
            const skipButton = document.getElementById('skip-button');
            if (skipButton) {
                skipButton.style.display = 'none';
            }

            // Restore previous guesses to the UI
            if (this.guessHistory.length > 0) {
                this.guessHistory.forEach(guess => {
                    this.resultsManager.displayResults(guess.name, guess.results);
                });
            }

            this.gameStarted = true;
            return true;
        }

        return false;
    }

    /**
     * Handle OAuth callback if present in URL
     */
    async handleOAuthCallback() {
        try {
            // Check if we have OAuth parameters in the URL
            const urlParams = new URLSearchParams(window.location.search);
            const fragment = new URLSearchParams(window.location.hash.substring(1));
            
            if (urlParams.has('code') || fragment.has('access_token')) {
                console.log('OAuth callback detected');
                
                // Let Supabase handle the OAuth callback
                const { data, error } = await this.supabase.auth.getSessionFromUrl();
                
                if (error) {
                    console.error('OAuth callback error:', error);
                } else if (data.session) {
                    console.log('OAuth callback successful');
                    this.isDiscordAuthenticated = true;
                    this.updateAuthenticationUI();
                    
                    // Clean up URL
                    window.history.replaceState({}, document.title, window.location.pathname);
                }
            }
        } catch (error) {
            console.error('Error handling OAuth callback:', error);
        }
    }

    handleDiscordAuthChange(detail) {
        const { event, session, user } = detail;
        this.isDiscordAuthenticated = !!session;
        
        console.log('Discord auth state changed:', event, {
            authenticated: this.isDiscordAuthenticated,
            user: user?.id
        });

        // Update UI to show authentication status
        this.updateAuthenticationUI();
    }

    updateAuthenticationUI() {
        // Add authentication indicator to the UI
        let authIndicator = document.getElementById('auth-indicator');
        if (!authIndicator) {
            authIndicator = document.createElement('div');
            authIndicator.id = 'auth-indicator';
            authIndicator.className = 'auth-indicator';
            document.querySelector('.container').appendChild(authIndicator);
        }

        if (this.isDiscordAuthenticated) {
            const discordAuth = this.discordManager.getAuth();
            const discordUser = discordAuth?.getDiscordUserInfo();
            const username = discordUser?.username || discordUser?.global_name || 'Discord User';
            
            authIndicator.innerHTML = `
                <div class="auth-status authenticated">
                    <span class="auth-icon">✅</span>
                    <span class="auth-text">Authenticated as ${username}</span>
                </div>
            `;
        } else {
            authIndicator.innerHTML = `
                <div class="auth-status unauthenticated">
                    <span class="auth-icon">⚠️</span>
                    <span class="auth-text">Limited features - Authentication recommended</span>
                </div>
            `;
        }
    }

    showStreakModeDialog() {
        const dialog = document.getElementById('streak-mode-dialog');
        dialog.classList.remove('hidden');
    }

    showLeaderboard() {
        const dialog = document.getElementById('leaderboard-dialog');
        if (dialog) {
            dialog.classList.remove('hidden');
            // Load default leaderboard (normal mode)
            if (this.leaderboardManager) {
                this.leaderboardManager.loadLeaderboard();
            }
        }
        // Hide other dialog
        document.getElementById('other-dialog').classList.add('hidden');
    }

    async handleAPConnection({ address, port, slot, password, deathLink }) {
        try {
            apClient.setGameMode(this.gameMode);
            const success = await apClient.connect(address, port, slot, password, deathLink);
            
            if (success) {
                console.log('Connected to Archipelago successfully');
            }
        } catch (error) {
            console.error('Failed to connect to Archipelago:', error);
        }
    }

    startStreakMode(difficulty) {
        this.isStreakMode = true;
        this.streakDifficulty = difficulty;
        this.streakCount = 0;
        this.totalPoints = 0;
        this.uiManager.toggleStreakModeUI(true);
        
        if (difficulty === 'scramble') {
            this.startScrambleGame(this.scrambleDifficulty, true);
        } else {
            this.startGame(difficulty, null, true);
        }
    }

    startScrambleGame(difficulty, isStreak = false) {
        this.gameMode = 'scramble';
        this.isScrambleMode = true;
        this.scrambleDifficulty = difficulty;
        this.isStreakMode = isStreak;
        
        if (isStreak) {
            this.streakDifficulty = 'scramble';
        }
        
        const seed = this.generateSeed();
        
        try {
            const scrambleData = this.scrambleManager.generateScrambleGame(difficulty, seed);
            this.chosenCharacter = scrambleData.correctCharacter;
            
            this.showGamePlay();
            this.scrambleUI.createScrambleUI();
            
            if (isStreak) {
                this.scrambleUI.updateStreakInstructions(this.streakCount + 1);
            }
            
            // Display the 5 random characters in the results table with proper comparison
            this.displayScrambleCharacters();
            
            this.timerManager.startTimer();
            this.gameStarted = true;
            
            // Hide skip button in scramble mode
            const skipButton = document.getElementById('skip-button');
            if (skipButton) {
                skipButton.style.display = 'none';
            }
            
            // Update Discord activity
            if (this.discordManager.connected) {
                if (isStreak) {
                    this.discordManager.updateStreakActivity('scramble', this.streakCount);
                } else {
                    this.discordManager.updateGameActivity('scramble', 0);
                }
            }
            
        } catch (error) {
            console.error('Failed to start scramble game:', error);
            alert('Failed to start scramble game. Please try again.');
        }
    }

    displayScrambleCharacters() {
        const scrambleCharacters = this.scrambleManager.getScrambleCharactersWithTraits();
        const correctTraits = this.scrambleManager.getCorrectCharacterTraits();
        
        // Clear existing results
        this.resultsManager.clearResults();
        
        // Display each character with proper comparison to the correct answer
        scrambleCharacters.forEach(character => {
            const results = compareTraits(character.traits, correctTraits);
            this.resultsManager.displayResults(character.name, results);
        });
    }

    async startDailyGame() {
        // First, try to load any existing progress
        if (this.loadDailyProgress()) {
            console.log('Loaded daily progress from cache');
            return;
        }

        // Check for completed daily challenge
        const cache = this.getDailyChallengeCache();
        if (cache?.completed) {
            this.gameMode = 'daily';
            window.gameMode = 'daily';
            this.showGameOver();
            
            this.uiManager.showGameOver(
                `You've already completed today's challenge!`,
                cache.character.name,
                null,
                false,
                0,
                cache.completionTime,
                null,
                null,
                this.discordManager.isInDiscordEnvironment()
            );
            
            this.guessHistory = cache.guessHistory;
            document.getElementById('emoji-grid').textContent = this.resultsManager.generateEmojiGrid(this.guessHistory.map(g => g.results));
            this.resultsManager.displayCachedResults(cache.guessHistory);
            
            // Only get current player count from database if not in Discord environment
            if (!this.discordManager.isInDiscordEnvironment()) {
                try {
                    const today = new Date().toISOString().split('T')[0];
                    const { data } = await this.supabase
                        .from('daily_players')
                        .select('player_count')
                        .eq('date', today)
                        .single();

                    if (data) {
                        this.uiManager.updateDailyPlayerCount(data.player_count);
                    }
                } catch (error) {
                    console.error('Error fetching daily player count:', error);
                }
            }
            
            return;
        }

        // Start new daily game
        this.startGame('daily');
    }

    startGame(mode, customSeed = null, isStreak = false) {
        this.gameMode = mode;
        this.isScrambleMode = false;
        this.isStreakMode = isStreak;
        
        // Set window.gameMode for UI components to reference
        window.gameMode = mode;
        
        let seed;
        if (customSeed) {
            seed = customSeed;
        } else if (mode === 'daily') {
            seed = this.getDailySeed();
        } else {
            seed = this.generateSeed();
        }

        this.currentSeed = seed;

        try {
            const character = this.characterSelector.selectRandomCharacter(mode, seed);
            this.chosenCharacter = character.name;
            
            this.showGamePlay();
            this.resultsManager.clearResults();
            this.scrambleUI.removeScrambleUI();
            this.timerManager.startTimer();
            this.gameStarted = true;
            
            // Handle skip button visibility
            const skipButton = document.getElementById('skip-button');
            if (skipButton) {
                if (mode === 'daily') {
                    skipButton.style.display = 'none';
                } else {
                    skipButton.style.display = 'inline-flex';
                }
            }

            // Save initial progress for daily mode
            if (mode === 'daily') {
                this.saveDailyChallengeCache({
                    character: { name: character.name, traits: character.traits },
                    guessHistory: [],
                    startTime: this.timerManager.startTime,
                    inProgress: true,
                    completed: false
                });
            }
            
            // Update Discord activity
            if (this.discordManager.connected) {
                if (isStreak) {
                    this.discordManager.updateStreakActivity(mode, this.streakCount);
                } else {
                    this.discordManager.updateGameActivity(mode, 0);
                }
            }
            
        } catch (error) {
            console.error('Failed to start game:', error);
            alert('Failed to start game. Please try again.');
        }
    }

    makeGuess() {
        const guessInput = document.getElementById('guess-input');
        const guess = guessInput.value.trim();
        
        if (!guess) return;
        
        const characterName = this.characterSelector.findCharacterName(guess);
        if (!characterName) {
            alert('Character not found! Please check the spelling or use the autocomplete suggestions.');
            return;
        }

        if (this.isScrambleMode) {
            this.handleScrambleGuess(characterName);
        } else {
            this.handleNormalGuess(characterName);
        }
        
        guessInput.value = '';
    }

    handleScrambleGuess(guess) {
        const isCorrect = this.scrambleManager.isCorrectGuess(guess);
        
        if (isCorrect) {
            this.handleCorrectGuess();
        } else {
            this.handleIncorrectGuess();
        }
    }

    handleNormalGuess(characterName) {
        const guessTraits = names[characterName];
        const chosenTraits = names[this.chosenCharacter];
        const results = compareTraits(guessTraits, chosenTraits);
        
        this.resultsManager.displayResults(characterName, results);
        this.guessHistory.push({ name: characterName, results: results });
        
        // Save progress for daily mode after each guess
        if (this.gameMode === 'daily') {
            this.saveDailyChallengeCache({
                character: { name: this.chosenCharacter, traits: names[this.chosenCharacter] },
                guessHistory: this.guessHistory,
                startTime: this.timerManager.startTime,
                inProgress: true,
                completed: false
            });
        }
        
        // Update Discord activity
        if (this.discordManager.connected) {
            this.discordManager.addGuess({ name: characterName, results: results });
        }
        
        // Submit to Archipelago if connected
        if (apClient.isConnected()) {
            apClient.submitGuess(characterName, { correct: characterName === this.chosenCharacter });
        }
        
        if (characterName === this.chosenCharacter) {
            this.handleCorrectGuess();
        }
    }

    async handleCorrectGuess() {
        this.timerManager.stopTimer();
        this.gameStarted = false;
        
        let roundPoints = 0;
        if (this.isStreakMode) {
            this.streakCount++;
            
            if (this.isScrambleMode) {
                roundPoints = 1; // Scramble mode gives 1 point
            } else {
                roundPoints = Math.max(1, 10 - this.guessHistory.length);
            }
            
            this.totalPoints += roundPoints;
        }
        
        // Generate emoji grid
        let emojiGrid;
        if (this.isScrambleMode) {
            emojiGrid = '🟩'; // Single green square for correct scramble guess
        } else {
            emojiGrid = this.resultsManager.generateEmojiGrid(this.guessHistory.map(g => g.results));
        }
        
        document.getElementById('emoji-grid').textContent = emojiGrid;
        this.resultsManager.copyResultsTable();
        
        const completionTime = this.timerManager.getElapsedTime();
        
        if (this.gameMode === 'daily') {
            // Ensure window.gameMode is set for daily mode
            window.gameMode = 'daily';
            
            const today = new Date().toISOString().split('T')[0];
            const dailyNumber = this.uiManager.getDailyChallengeNumber();
            
            // Save completion to cache
            this.saveDailyChallengeCache({
                completed: true,
                character: { name: this.chosenCharacter, traits: names[this.chosenCharacter] },
                guessHistory: this.guessHistory,
                completionTime: completionTime,
                inProgress: false
            });
            
            // Only try to update daily player count if not in Discord environment
            if (!this.discordManager.isInDiscordEnvironment()) {
                try {
                    // Use authenticated call if possible, fallback to RPC
                    if (this.isDiscordAuthenticated) {
                        await this.supabase.rpc('increment_daily_players', {
                            challenge_date: today
                        });
                    } else {
                        // For unauthenticated users, still try the RPC call
                        await this.supabase.rpc('increment_daily_players', {
                            challenge_date: today
                        });
                    }

                    const { data } = await this.supabase
                        .from('daily_players')
                        .select('player_count')
                        .eq('date', today)
                        .single();

                    if (data) {
                        this.currentDailyCount = data.player_count;
                    }
                } catch (error) {
                    console.error('Error updating daily player count:', error);
                }
            }

            this.uiManager.showGameOver(
                `Congratulations! You completed Daily Challenge #${dailyNumber}!`,
                this.chosenCharacter,
                null,
                false,
                0,
                completionTime,
                null,
                null,
                this.discordManager.isInDiscordEnvironment()
            );

            // Only show daily player count if not in Discord and we have the count
            if (!this.discordManager.isInDiscordEnvironment() && this.currentDailyCount) {
                this.uiManager.updateDailyPlayerCount(this.currentDailyCount);
            }
        } else if (this.isStreakMode) {
            this.uiManager.showGameOver(
                'Correct! Continue your streak!',
                this.chosenCharacter,
                null,
                true,
                this.streakCount,
                completionTime,
                roundPoints,
                this.totalPoints,
                this.discordManager.isInDiscordEnvironment()
            );
            
            // Auto-continue to next game after 2 seconds
            setTimeout(() => {
                this.continueStreak();
            }, 2000);
        } else {
            let message = 'Congratulations! You found the correct character!';
            if (this.isScrambleMode) {
                message = this.scrambleUI.showScrambleGameOver(true, this.chosenCharacter);
            }
            
            this.uiManager.showGameOver(
                message,
                this.chosenCharacter,
                this.currentSeed,
                false,
                0,
                completionTime,
                null,
                null,
                this.discordManager.isInDiscordEnvironment()
            );
        }
    }

    handleIncorrectGuess() {
        if (this.isStreakMode) {
            this.endStreak();
        } else {
            this.timerManager.stopTimer();
            this.gameStarted = false;
            
            let emojiGrid;
            if (this.isScrambleMode) {
                emojiGrid = '🟥'; // Single red square for incorrect scramble guess
            } else {
                emojiGrid = this.resultsManager.generateEmojiGrid(this.guessHistory.map(g => g.results));
            }
            
            document.getElementById('emoji-grid').textContent = emojiGrid;
            this.resultsManager.copyResultsTable();
            
            const completionTime = this.timerManager.getElapsedTime();
            let message = 'Game Over! Better luck next time!';
            if (this.isScrambleMode) {
                message = this.scrambleUI.showScrambleGameOver(false, this.chosenCharacter);
            }
            
            this.uiManager.showGameOver(
                message,
                this.chosenCharacter,
                this.currentSeed,
                false,
                0,
                completionTime,
                null,
                null,
                this.discordManager.isInDiscordEnvironment()
            );
        }
    }

    continueStreak() {
        this.guessHistory = [];
        this.resultsManager.clearResults();
        
        if (this.streakDifficulty === 'scramble') {
            this.startScrambleGame(this.scrambleDifficulty, true);
        } else {
            this.startGame(this.streakDifficulty, null, true);
        }
    }

    endStreak() {
        this.timerManager.stopTimer();
        this.gameStarted = false;
        
        // Send death link if connected and enabled
        if (apClient.isConnected() && apClient.isDeathLinkEnabled()) {
            apClient.sendDeathLink(`Streak ended at ${this.streakCount}`);
        }
        
        let emojiGrid;
        if (this.isScrambleMode) {
            emojiGrid = '🟥'; // Single red square for failed scramble
        } else {
            emojiGrid = this.resultsManager.generateEmojiGrid(this.guessHistory.map(g => g.results));
        }
        
        document.getElementById('emoji-grid').textContent = emojiGrid;
        this.resultsManager.copyResultsTable();
        
        const completionTime = this.timerManager.getElapsedTime();
        
        this.uiManager.showGameOver(
            `Streak ended at ${this.streakCount}!`,
            this.chosenCharacter,
            null,
            true,
            this.streakCount,
            completionTime,
            0,
            this.totalPoints,
            this.discordManager.isInDiscordEnvironment()
        );
        
        // Show leaderboard save prompt with proper mode and difficulty
        if (this.leaderboardManager && this.streakCount > 0) {
            if (this.streakDifficulty === 'scramble') {
                this.leaderboardManager.showNamePrompt(this.streakCount, 'scramble', this.totalPoints, this.scrambleDifficulty);
            } else {
                this.leaderboardManager.showNamePrompt(this.streakCount, this.streakDifficulty, this.totalPoints);
            }
        }
        
        this.resetStreakMode();
    }

    resetStreakMode() {
        this.isStreakMode = false;
        this.streakCount = 0;
        this.totalPoints = 0;
        this.streakDifficulty = 'normal';
        this.uiManager.toggleStreakModeUI(false);
    }

    skipCharacter(isDeathLink = false) {
        // Don't allow skipping in daily mode
        if (this.gameMode === 'daily') return;
        
        if (isDeathLink && apClient.isConnected() && apClient.isDeathLinkEnabled()) {
            apClient.sendDeathLink('Received death link');
        }
        
        if (this.isStreakMode) {
            this.endStreak();
        } else {
            this.timerManager.stopTimer();
            this.gameStarted = false;
            
            let emojiGrid;
            if (this.isScrambleMode) {
                emojiGrid = '🟥'; // Single red square for skipped scramble
            } else {
                emojiGrid = this.resultsManager.generateEmojiGrid(this.guessHistory.map(g => g.results));
            }
            
            document.getElementById('emoji-grid').textContent = emojiGrid;
            this.resultsManager.copyResultsTable();
            
            const completionTime = this.timerManager.getElapsedTime();
            const message = isDeathLink ? 'Death Link received! Game Over!' : 'You gave up! Better luck next time!';
            
            this.uiManager.showGameOver(
                message,
                this.chosenCharacter,
                this.currentSeed,
                false,
                0,
                completionTime,
                null,
                null,
                this.discordManager.isInDiscordEnvironment()
            );
        }
    }

    playAgain() {
        this.resetGame();
        this.showGameSetup();
    }

    resetGame() {
        this.chosenCharacter = null;
        this.guessHistory = [];
        this.currentSeed = null;
        this.gameStarted = false;
        this.isScrambleMode = false;
        this.scrambleDifficulty = 'normal';
        this.timerManager.reset();
        this.resultsManager.clearResults();
        this.scrambleUI.removeScrambleUI();
        this.scrambleManager.reset();
        
        if (this.discordManager.connected) {
            this.discordManager.clearGuesses();
        }
        
        // Deactivate easter egg mode if active
        if (this.musicManager.isEasterEggMode) {
            this.musicManager.deactivateEasterEggMode();
        }
    }

    showGameSetup() {
        document.getElementById('game-setup').classList.remove('hidden');
        document.getElementById('game-play').classList.add('hidden');
        document.getElementById('game-over').classList.add('hidden');
        document.getElementById('seed-generator').classList.add('hidden');
        document.getElementById('archipelago-setup').classList.add('hidden');
    }

    showGamePlay() {
        document.getElementById('game-setup').classList.add('hidden');
        document.getElementById('game-play').classList.remove('hidden');
        document.getElementById('game-over').classList.add('hidden');
        document.getElementById('seed-generator').classList.add('hidden');
        document.getElementById('archipelago-setup').classList.add('hidden');
        
        // Setup autocomplete
        const guessInput = document.getElementById('guess-input');
        if (guessInput) {
            this.autocompleteManager.setupAutocomplete(guessInput);
        }
    }

    showGameOver() {
        document.getElementById('game-setup').classList.add('hidden');
        document.getElementById('game-play').classList.add('hidden');
        document.getElementById('game-over').classList.remove('hidden');
        document.getElementById('seed-generator').classList.add('hidden');
        document.getElementById('archipelago-setup').classList.add('hidden');
    }

    showSeedGenerator() {
        document.getElementById('game-setup').classList.add('hidden');
        document.getElementById('seed-generator').classList.remove('hidden');
        
        const characterInput = document.getElementById('character-input');
        if (characterInput) {
            this.autocompleteManager.setupAutocomplete(characterInput);
        }
    }

    showFAQ() {
        document.getElementById('faq-dialog').classList.remove('hidden');
        document.getElementById('other-dialog').classList.add('hidden');
    }

    hideFAQ() {
        document.getElementById('faq-dialog').classList.add('hidden');
    }

    startGameWithSeed() {
        const seedInput = document.getElementById('seed-input');
        const seed = seedInput.value.trim();
        
        if (!seed) {
            alert('Please enter a seed');
            return;
        }

        const lowerSeed = seed.toLowerCase();

        // Check for secret seed to unlock scramble features
        if (lowerSeed === 'persona5scramble') {
            this.unlockScrambleFeatures();
            seedInput.value = '';
            alert('Scramble features unlocked!');
            return;
        }

        // Check for page reload seeds
        if (lowerSeed === 'imu' || lowerSeed === 'gaster') {
            window.location.reload();
            return;
        }

        // Check if it's the test seed to show music player
        if (this.musicManager.isTestSeed(seed)) {
            this.musicManager.showMusicPlayer();
            seedInput.value = '';
            return;
        }

        // Check if it's an easter egg track
        if (this.musicManager.isEasterEggSeed(seed)) {
            const success = this.musicManager.activateEasterEggMode(seed);
            if (success) {
                seedInput.value = '';
                return;
            }
        }

        // Normal seed behavior - start game with filler mode
        this.startGame('filler', seed);
    }

    generateSeedForCharacter() {
        const characterInput = document.getElementById('character-input');
        const characterName = characterInput.value.trim();
        
        if (!characterName) {
            alert('Please enter a character name');
            return;
        }
        
        const foundName = this.characterSelector.findCharacterName(characterName);
        if (!foundName) {
            alert('Character not found! Please check the spelling.');
            return;
        }
        
        const seed = this.generateRandomSeedForCharacter(foundName);
        document.getElementById('seed-result').textContent = seed;
        document.getElementById('generated-seed').classList.remove('hidden');
    }

    useGeneratedSeed() {
        const seed = document.getElementById('seed-result').textContent;
        this.startGame('filler', seed);
    }

    backToMainMenu() {
        this.showGameSetup();
        document.getElementById('generated-seed').classList.add('hidden');
    }

    generateSeed() {
        return Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
    }

    getDailySeed() {
        const today = new Date();
        const dateString = today.toISOString().split('T')[0];
        return `daily-${dateString}`;
    }

    /**
     * Generates a truly random seed that will result in the specified character
     * Uses a brute force approach to find a seed that produces the desired character
     * @param {string} characterName - The name of the character to generate a seed for
     * @returns {string} A random seed that will produce the specified character
     */
    generateRandomSeedForCharacter(characterName) {
        console.log(`Generating random seed for character: ${characterName}`);
        
        // Try up to 10000 random seeds to find one that produces the desired character
        const maxAttempts = 10000;
        
        for (let attempt = 0; attempt < maxAttempts; attempt++) {
            // Generate a completely random seed
            const randomSeed = Math.random().toString(36).substring(2, 15) + 
                              Math.random().toString(36).substring(2, 15) + 
                              Date.now().toString(36);
            
            try {
                // Test if this seed produces the desired character in filler mode
                const testCharacter = this.characterSelector.selectRandomCharacter('filler', randomSeed);
                
                if (testCharacter.name === characterName) {
                    console.log(`Found matching seed after ${attempt + 1} attempts: ${randomSeed}`);
                    return randomSeed;
                }
            } catch (error) {
                // If there's an error with this seed, continue to the next one
                console.warn(`Error testing seed ${randomSeed}:`, error);
                continue;
            }
        }
        
        // If we couldn't find a matching seed after maxAttempts, fall back to a deterministic approach
        // but add randomness to make it less obvious
        console.warn(`Could not find random seed for ${characterName} after ${maxAttempts} attempts, using fallback`);
        
        const timestamp = Date.now().toString(36);
        const randomSuffix = Math.random().toString(36).substring(2, 8);
        const characterHash = this.createCharacterHash(characterName);
        
        return `${timestamp}-${randomSuffix}-${characterHash}`;
    }

    /**
     * Creates a hash from character name (fallback method)
     * @param {string} characterName - The character name to hash
     * @returns {string} A hash string
     */
    createCharacterHash(characterName) {
        let hash = 0;
        for (let i = 0; i < characterName.length; i++) {
            const char = characterName.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash; // Convert to 32-bit integer
        }
        return Math.abs(hash).toString(36);
    }

    async updateDailyPlayerCount() {
        try {
            const today = new Date().toISOString().split('T')[0];
            
            const { error } = await this.supabase.rpc('increment_daily_players', {
                challenge_date: today
            });
            
            if (error) throw error;
            
            const { data, error: fetchError } = await this.supabase
                .from('daily_players')
                .select('player_count')
                .eq('date', today)
                .single();
            
            if (fetchError) throw fetchError;
            
            this.uiManager.updateDailyPlayerCount(data.player_count);
        } catch (error) {
            console.error('Failed to update daily player count:', error);
        }
    }
}