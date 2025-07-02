export class DiscordManager {
    constructor() {
        this.connected = false;
        this.startTimestamp = null;
        this.sdk = null;
        this.clientId = '1351722811718373447';
        this.guessHistory = [];
        this.currentMode = null;
        this.auth = null;
        this.isDiscordActivity = this.detectDiscordEnvironment();
    }

    /**
     * Detect Discord environment more reliably
     */
    detectDiscordEnvironment() {
        const hostname = window.location.hostname;
        const urlParams = new URLSearchParams(window.location.search);
        const hasFrameId = urlParams.has('frame_id');
        const isDiscordDomain = hostname.includes('discordsays.com');
        const hasDiscordParent = window.parent !== window;
        const hasDiscordUserAgent = navigator.userAgent.includes('Discord');
        
        console.log('Discord environment detection:', {
            hostname,
            hasFrameId,
            isDiscordDomain,
            hasDiscordParent,
            hasDiscordUserAgent,
            fullUrl: window.location.href
        });
        
        // Only consider it a Discord environment if:
        // 1. It's on a Discord domain, OR
        // 2. It's in an iframe AND has the required frame_id parameter
        return isDiscordDomain || (hasDiscordParent && hasFrameId) || (hasDiscordUserAgent && hasFrameId);
    }

    /**
     * Check if we're in Discord environment (public method for other components)
     */
    isInDiscordEnvironment() {
        return this.isDiscordActivity;
    }

    async initialize(supabase) {
        try {
            // Add Discord embed meta tags
            this.addDiscordMetaTags();

            // Only initialize Discord SDK if we're in Discord environment
            if (this.isDiscordActivity) {
                console.log('Initializing Discord SDK in Discord environment...');
                await this.initializeDiscordSDK(supabase);
            } else {
                console.log('Not in Discord environment, Discord features disabled');
            }
        } catch (error) {
            console.warn('Discord initialization failed:', error);
            this.connected = false;
        }
    }

    async initializeDiscordSDK(supabase) {
        try {
            // Import Discord SDK with better error handling
            console.log('Importing Discord SDK...');
            const module = await import('@discord/embedded-app-sdk');
            
            // Try different possible exports
            const DiscordSDK = module.DiscordSDK || module.Discord || module.default;
            
            if (!DiscordSDK) {
                console.error('Available exports:', Object.keys(module));
                throw new Error('Discord SDK constructor not found in module');
            }

            console.log('Creating Discord SDK instance...');
            
            // Create SDK instance with proper configuration - FIX: Pass clientId as string
            this.sdk = new DiscordSDK({
                clientId: this.clientId, // This is already a string
                disableConsoleLogOverride: true
            });

            console.log('Discord SDK created, waiting for ready...');
            
            // Wait for SDK to be ready
            await this.sdk.ready();
            
            this.connected = true;
            this.startTimestamp = Date.now();
            
            console.log('Discord SDK ready! Connected successfully.');
            
            // Initialize authentication if Supabase is available
            if (supabase) {
                await this.initializeAuth(supabase);
            }

            // Set initial activity
            await this.setDefaultActivity();
            
        } catch (error) {
            console.error('Discord SDK initialization failed:', error);
            throw error;
        }
    }

    async initializeAuth(supabase) {
        try {
            console.log('Initializing Discord authentication...');
            
            // Import auth module
            const { DiscordAuth } = await import('../auth/DiscordAuth.js');
            
            this.auth = new DiscordAuth(supabase, this.sdk);
            const authSuccess = await this.auth.initialize();
            
            if (authSuccess) {
                console.log('Discord authentication successful');
                
                // Set up auth state listener
                this.auth.onAuthStateChange((event, session) => {
                    console.log('Auth state changed:', event, !!session);
                    
                    // Emit custom event for other parts of the app
                    document.dispatchEvent(new CustomEvent('discord-auth-change', {
                        detail: { 
                            event, 
                            session, 
                            user: session?.user 
                        }
                    }));
                });
            } else {
                console.warn('Discord authentication failed, some features may be limited');
            }
        } catch (error) {
            console.error('Discord auth initialization failed:', error);
        }
    }

    addDiscordMetaTags() {
        const metaTags = {
            'og:title': 'Faustdle',
            'og:description': 'One Piece Character Guessing Game',
            'og:image': 'https://faustdle.com/Faustdle-3-4-2025.png',
            'og:url': 'https://faustdle.com',
            'discord:application:id': this.clientId
        };

        Object.entries(metaTags).forEach(([property, content]) => {
            let meta = document.querySelector(`meta[property="${property}"]`);
            if (!meta) {
                meta = document.createElement('meta');
                meta.setAttribute('property', property);
                document.head.appendChild(meta);
            }
            meta.setAttribute('content', content);
        });
    }

    getElapsedTimeText() {
        if (!this.startTimestamp) return '';
        const elapsed = Date.now() - this.startTimestamp;
        const minutes = Math.floor(elapsed / 60000);
        const seconds = Math.floor((elapsed % 60000) / 1000);
        return `${minutes}:${seconds.toString().padStart(2, '0')}`;
    }

    async setDefaultActivity() {
        if (!this.connected || !this.sdk) return;

        try {
            await this.sdk.commands.setActivity({
                activity: {
                    details: 'Playing Faustdle',
                    state: 'Waiting to start...',
                    assets: {
                        large_image: 'faustdle',
                        large_text: 'Faustdle'
                    },
                    timestamps: {
                        start: this.startTimestamp
                    },
                    instance: false
                }
            });
        } catch (error) {
            console.warn('Failed to set default activity:', error);
        }
    }

    async updateGameActivity(mode, guessCount) {
        if (!this.connected || !this.sdk) return;

        this.currentMode = mode;
        const modeText = this.getModeText(mode);
        const guessText = this.getGuessText(guessCount);
        const emojiGrid = this.generateEmojiGrid();
        const elapsedTime = this.getElapsedTimeText();

        try {
            await this.sdk.commands.setActivity({
                activity: {
                    details: `${modeText} - ${guessText}`,
                    state: `Time: ${elapsedTime}`,
                    assets: {
                        large_image: 'faustdle',
                        large_text: emojiGrid || 'No guesses yet',
                        small_image: mode.toLowerCase(),
                        small_text: modeText
                    },
                    timestamps: {
                        start: this.startTimestamp
                    },
                    instance: false
                }
            });
        } catch (error) {
            console.warn('Failed to update game activity:', error);
        }
    }

    async updateStreakActivity(mode, streak) {
        if (!this.connected || !this.sdk) return;

        this.currentMode = mode;
        const modeText = this.getModeText(mode);
        const emojiGrid = this.generateEmojiGrid();
        const elapsedTime = this.getElapsedTimeText();

        try {
            await this.sdk.commands.setActivity({
                activity: {
                    details: `${modeText} Streak Mode`,
                    state: `Streak: ${streak} | Time: ${elapsedTime}`,
                    assets: {
                        large_image: 'faustdle',
                        large_text: emojiGrid || 'Starting new streak...',
                        small_image: 'streak',
                        small_text: `${streak} Streak`
                    },
                    timestamps: {
                        start: this.startTimestamp
                    },
                    instance: false
                }
            });
        } catch (error) {
            console.warn('Failed to update streak activity:', error);
        }
    }

    getModeText(mode) {
        switch (mode) {
            case 'normal': return 'Normal Mode';
            case 'hard': return 'Hard Mode';
            case 'filler': return 'Filler Mode';
            case 'daily': return 'Daily Challenge';
            default: return 'Playing Faustdle';
        }
    }

    getGuessText(guessCount) {
        return `Guesses: ${guessCount}`;
    }

    generateEmojiGrid() {
        if (!this.guessHistory.length) return '';
        
        return this.guessHistory.map(guess => {
            return guess.results.map(result => {
                if (result.match) return '🟩';
                if (result.direction === 'up') return '⬆️';
                if (result.direction === 'down') return '⬇️';
                return '🟥';
            }).join('');
        }).join('\n');
    }

    addGuess(guess) {
        this.guessHistory.push(guess);
        if (this.currentMode) {
            this.updateGameActivity(this.currentMode, this.guessHistory.length);
        }
    }

    clearGuesses() {
        this.guessHistory = [];
        this.setDefaultActivity();
    }

    // Authentication methods
    getAuth() {
        return this.auth;
    }

    isAuthenticated() {
        return this.auth?.isUserAuthenticated() || false;
    }

    getCurrentUser() {
        return this.auth?.getCurrentUser() || null;
    }

    async signOut() {
        if (this.auth) {
            await this.auth.signOut();
        }
    }

    disconnect() {
        if (this.connected && this.sdk) {
            this.sdk.close();
        }
        this.connected = false;
        this.sdk = null;
        this.auth = null;
        this.startTimestamp = null;
        this.guessHistory = [];
        this.currentMode = null;
    }
}