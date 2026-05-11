export class DiscordManager {
    constructor() {
        this.connected = false;
        this.startTimestamp = null;
        this.sdk = null;
        this.clientId = '1351722811718373447';
        this.guessHistory = [];
        this.currentMode = null;
        this.auth = null;
        this.discordProxy = null;
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

    async initialize(supabase, discordProxy = null) {
        try {
            // Store the proxy for use in auth initialization
            this.discordProxy = discordProxy;
            
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
            // Capture clientId OUTSIDE the async to avoid context loss
            const clientId = String(this.clientId);
            console.log('SDK init - clientId captured:', clientId, 'type:', typeof clientId);
            
            if (typeof clientId !== 'string' || !clientId) {
                throw new Error(`Invalid clientId: must be a non-empty string, got ${JSON.stringify(clientId)}`);
            }

            // Wrap the entire SDK initialization in a timeout to prevent hanging
            const initPromise = (async () => {
                // Import Discord SDK
                console.log('Importing Discord SDK...');
                const sdkModule = await import('@discord/embedded-app-sdk');
                const DiscordSDK = sdkModule.DiscordSDK || sdkModule.default;
                
                if (!DiscordSDK) {
                    throw new Error('Discord SDK constructor not found in module');
                }

                console.log('Creating Discord SDK instance with clientId:', clientId);
                
                const sdkInstance = new DiscordSDK(clientId);
                this.sdk = sdkInstance;
                console.log('SDK instantiated successfully');
                
                // First: Wait for SDK ready
                console.log('Waiting for SDK ready...');
                try {
                    const readyPromise = this.sdk.ready();
                    const readyTimeout = new Promise((_, reject) => 
                        setTimeout(() => reject(new Error('SDK ready timeout')), 8000)
                    );
                    
                    await Promise.race([readyPromise, readyTimeout]);
                    console.log('SDK ready event fired successfully');
                } catch (readyError) {
                    console.warn('SDK ready timeout:', readyError.message);
                }

                // Second: Authorize with Discord to get authorization code
                console.log('Authorizing SDK with Discord...');
                const { code } = await this.sdk.commands.authorize({
                    client_id: clientId,
                    response_type: 'code',
                    state: Math.random().toString(36).substring(7),
                    prompt: 'none',
                    scope: [
                        'guilds.members.read',
                        'rpc.activities.write',
                        'identify',
                        'applications.commands',
                        'guilds'
                    ]
                });

                console.log('SDK authorization successful, got code:', code ? 'yes' : 'no');
                
                // Third: Exchange auth code for user info and access token
                // Use the DiscordProxy to bypass CSP restrictions
                console.log('Exchanging authorization code for user info...');
                
                // For Activities, we need to get user info through backend token exchange
                try {
                    if (this.discordProxy) {
                        const tokenResponse = await this.discordProxy.fetch(
                            'https://qrprexuziojupqvvdefy.supabase.co/functions/v1/discord-token-exchange',
                            {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ code })
                            }
                        );
                        
                        const tokenData = await tokenResponse.json();
                        console.log('Token exchange response received');
                        console.log('Token exchange full response:', {
                            keys: Object.keys(tokenData),
                            user: tokenData.user,
                            hasAccessToken: !!tokenData.access_token,
                            hasUserId: !!tokenData.user?.id,
                            userId: tokenData.user?.id,
                        });
                        
                        // Token data may or may not include user info depending on Edge Function deployment
                        let user = tokenData.user;
                        
                        if (tokenData.access_token) {
                            // Authenticate the SDK with the access token - CRITICAL for setActivity() to work
                            // The authenticate() command returns AuthenticateResponse which includes the user object
                            let user = null;
                            try {
                                console.log('Authenticating SDK with access token...');
                                const authResponse = await this.sdk.commands.authenticate({ 
                                    access_token: tokenData.access_token 
                                });
                                
                                // Get user from the authenticate() response
                                if (authResponse?.user?.id) {
                                    user = authResponse.user;
                                    console.log('✓ Got user from authenticate() response:', {
                                        id: user.id,
                                        username: user.username,
                                        discriminator: user.discriminator
                                    });
                                } else {
                                    console.warn('authenticate() response missing user data:', authResponse);
                                }
                            } catch (authError) {
                                console.error('Failed to authenticate SDK:', authError);
                            }
                            
                            // If authenticate() didn't return user data, fetch from Discord API as fallback
                            if (!user?.id) {
                                try {
                                    console.log('Fetching user from Discord API as fallback...');
                                    const userResponse = await this.discordProxy.fetch(
                                        'https://discord.com/api/v10/users/@me',
                                        {
                                            method: 'GET',
                                            headers: {
                                                'Authorization': `Bearer ${tokenData.access_token}`
                                            }
                                        }
                                    );
                                    
                                    if (userResponse.ok) {
                                        user = await userResponse.json();
                                        console.log('✓ Got user from Discord API:', {
                                            id: user?.id,
                                            username: user?.username,
                                            discriminator: user?.discriminator
                                        });
                                    } else {
                                        console.log('Discord API user fetch failed:', userResponse.status, userResponse.statusText);
                                    }
                                } catch (fetchUserError) {
                                    console.log('Discord API fetch error:', fetchUserError.message);
                                }
                            }
                            
                            if (user?.id) {
                                console.log('✓ Successfully obtained Discord user ID:', user.id);
                                this.authResult = {
                                    user: user,
                                    access_token: tokenData.access_token,
                                    authenticated: true
                                };
                            } else {
                                console.warn('⚠️ No user data available from Discord API or token exchange');
                                this.authResult = {
                                    access_token: tokenData.access_token,
                                    authenticated: true
                                };
                            }
                            
                            // Also store authResult on SDK for DiscordAuth to access
                            if (this.sdk) {
                                this.sdk.authResult = this.authResult;
                            }
                        } else {
                            console.warn('Token exchange incomplete:', tokenData);
                            // Activity still valid even without explicit user
                            this.authResult = {
                                authenticated: true,
                                code
                            };
                        }
                    } else {
                        console.log('DiscordProxy not available, using Activity context only');
                        this.authResult = {
                            authenticated: true,
                            code
                        };
                    }
                } catch (tokenError) {
                    console.warn('Token exchange failed:', tokenError.message);
                    // Continue with Activity context anyway
                    this.authResult = {
                        authenticated: true,
                        code
                    };
                }
                
                // Capture Activity context (guild/channel) for additional context
                const guildId = this.sdk?.guild?.id || this.sdk?.guildId;
                const channelId = this.sdk?.channel?.id || this.sdk?.channelId;
                if (channelId) {
                    this.authResult.channelId = channelId;
                    console.log('Activity channel identified:', channelId);
                }
                if (guildId) {
                    this.authResult.guildId = guildId;
                }
                
                // Extract interaction token from entry point command launch
                // This is critical for message editing support
                const interactionToken = this.sdk?.interaction?.token;
                if (interactionToken) {
                    this.authResult.interactionToken = interactionToken;
                    console.log('✓ Entry point interaction token captured:', interactionToken.substring(0, 20) + '...');
                } else {
                    console.log('⚠️ No interaction token found on SDK - entry point may not be properly configured');
                }
                
                this.connected = true;
                this.startTimestamp = Date.now();
                
                console.log('Discord SDK initialization complete');
                
                // Initialize authentication if Supabase is available
                if (supabase) {
                    await this.initializeAuth(supabase, this.discordProxy);
                }

                // Set initial activity
                try {
                    await this.setDefaultActivity();
                } catch (e) {
                    console.log('Could not set default activity:', e.message);
                }
            })();
            
            // Add overall timeout for the entire initialization
            const timeoutPromise = new Promise((_, reject) =>
                setTimeout(() => reject(new Error('Discord SDK initialization timeout')), 20000)
            );
            
            await Promise.race([initPromise, timeoutPromise]);
            console.log('Discord SDK initialization complete');
            
        } catch (error) {
            console.error('Discord SDK initialization failed:', error);
            // Don't throw - allow app to continue without Discord
            this.connected = false;
        }
    }

    async initializeAuth(supabase, discordProxy = null) {
        try {
            console.log('Initializing Discord authentication...');
            
            // Import auth module
            const { DiscordAuth } = await import('../auth/DiscordAuth.js');
            
            this.auth = new DiscordAuth(supabase, this.sdk, discordProxy);
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

    async updateGameActivity(mode, guessCount, maxGuesses = 6) {
        if (!this.connected || !this.sdk) return;

        this.currentMode = mode;
        const modeText = this.getModeText(mode);
        const guessText = this.getGuessText(guessCount, maxGuesses);
        const elapsedTime = this.getElapsedTimeText();

        try {
            await this.sdk.commands.setActivity({
                activity: {
                    details: `${modeText} - ${guessText}`,
                    state: `Time: ${elapsedTime}`,
                    assets: {
                        large_image: 'faustdle',
                        large_text: 'Playing Faustdle',
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

    getGuessText(guessCount, maxGuesses = 6) {
        return `${guessCount}/${maxGuesses} Guesses`;
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

    /**
     * Update Discord activity when player wins
     */
    async updateGameWon(mode, guessCount, maxGuesses, elapsedTime) {
        if (!this.connected || !this.sdk) return;

        const modeText = this.getModeText(mode);
        const guessText = this.getGuessText(guessCount, maxGuesses);

        try {
            await this.sdk.commands.setActivity({
                activity: {
                    details: `${modeText} - Won! ${guessText}`,
                    state: `Time: ${elapsedTime}`,
                    assets: {
                        large_image: 'faustdle',
                        large_text: '✅ Challenge Complete!',
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
            console.warn('Failed to update win activity:', error);
        }
    }

    /**
     * Update Discord activity when player loses
     */
    async updateGameLost(mode, maxGuesses, correctCharacter, elapsedTime) {
        if (!this.connected || !this.sdk) return;

        const modeText = this.getModeText(mode);

        try {
            await this.sdk.commands.setActivity({
                activity: {
                    details: `${modeText} - Game Over`,
                    state: `The answer was: ${correctCharacter} | Time: ${elapsedTime}`,
                    assets: {
                        large_image: 'faustdle',
                        large_text: `❌ Out of Guesses (0/${maxGuesses})`,
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
            console.warn('Failed to update loss activity:', error);
        }
    }

    /**
     * Update Discord activity for streak mode completion
     */
    async updateStreakWon(mode, streak, points, totalPoints, elapsedTime) {
        if (!this.connected || !this.sdk) return;

        const modeText = this.getModeText(mode);

        try {
            await this.sdk.commands.setActivity({
                activity: {
                    details: `${modeText} Streak - Round Complete!`,
                    state: `Streak: ${streak} | Points: +${points} (Total: ${totalPoints}) | Time: ${elapsedTime}`,
                    assets: {
                        large_image: 'faustdle',
                        large_text: '🔥 Streak Continuing!',
                        small_image: 'streak',
                        small_text: `Streak: ${streak}`
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

    /**
     * Sync game state to Discord - updates the activity message in real-time
     * Call this whenever the game board changes or game ends
     */
    async syncGameStateToDiscord(gameData) {
        if (!this.connected || !this.sdk) {
            console.log('SDK not connected, skipping Discord sync');
            return;
        }
        
        const { character, mode, gridString, guessCount, totalTime } = gameData;
        const modeText = this.getModeText(mode || this.currentMode);
        
        try {
            const activity = {
                type: 0, // Playing
                details: `Faustdle - ${modeText}`,
                state: `${guessCount} guesses • ${totalTime}`,
                assets: {
                    large_image: 'game_logo',
                    large_text: gridString || `Playing Faustdle as ${character}`
                }
            };
            
            console.log('Calling setActivity with:', {
                details: activity.details,
                state: activity.state,
                gridString: gridString,
                guessCount,
                totalTime
            });
            
            const result = await this.sdk.commands.setActivity({ activity });
            
            console.log('✓ Game state synced to Discord', {
                character,
                guessCount,
                totalTime,
                result
            });
        } catch (error) {
            console.error('Failed to sync game state to Discord:', error);
        }
    }

    /**
     * Post shareable activity results to Discord using the /share slash command
     * Note: Discord Activities cannot directly invoke slash commands.
     * Users must type /share in Discord chat to post their results.
     */
    async startActivityInvite(gameData) {
        if (!this.connected || !this.sdk) {
            console.log('SDK not connected, cannot initiate share');
            return;
        }

        const { character, mode, gridString, guessCount, totalTime } = gameData;
        const modeText = this.getModeText(mode || this.currentMode);

        try {
            console.log('Share initiated - user must use /share command in Discord');
            
            // Show a share link dialog to the user
            const shareUrl = this.constructActivityUrl(gameData);
            const result = await this.sdk.commands.shareLink({
                message: `📊 I completed Faustdle - ${modeText}!\n\nTime: ${totalTime}`,
                custom_id: 'faustdle_result'
            });

            if (result?.success) {
                console.log('✓ Share link shown to user');
                return { success: true, method: 'share_link' };
            } else {
                console.log('User dismissed share dialog');
                return { success: false, reason: 'dismissed' };
            }

        } catch (error) {
            console.error('Error showing share dialog:', error);
            throw error;
        }
    }

    /**
     * Construct an activity share URL with game data
     */
    constructActivityUrl(gameData) {
        const { character, mode, gridString, guessCount, totalTime } = gameData;
        const params = new URLSearchParams({
            character: character || '',
            mode: mode || 'daily',
            grid: gridString || '',
            guesses: guessCount || 0,
            time: totalTime || ''
        });
        return `https://faustdle.com?activity=${params.toString()}`;
    }

    /**
     * Reset to default activity
     */
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

    /**
     * Invoke the /share command by calling our edge function
     * The edge function queries the database for today's results and posts to Discord
     */
    async invokeShareGameCommand(gameData) {
        try {
            console.log('=== Share Command Invocation ===');
            console.log('Game data being sent:', {
                userId: gameData.userId,
                channelId: gameData.channelId,
                character: gameData.character,
                mode: gameData.mode,
                time: gameData.time,
                gridLength: gameData.grid?.length || 0
            });

            // Store game data for potential fallback
            this.lastGameData = {
                character: gameData.character,
                mode: gameData.mode,
                grid: gameData.grid,
                time: gameData.time,
                userId: gameData.userId,
                channelId: gameData.channelId,
                timestamp: Date.now()
            };

            // Build the payload for the edge function
            // This format works with the "legacy direct POST" path in the edge function
            const payload = {
                type: 2,  // APPLICATION_COMMAND
                user: {
                    id: gameData.userId
                },
                member: {
                    user: {
                        id: gameData.userId
                    }
                },
                channel_id: gameData.channelId,
                data: {
                    name: 'share'
                }
            };

            console.log('Sending payload to edge function:', JSON.stringify(payload));

            // Call the edge function
            if (this.discordProxy) {
                const response = await this.discordProxy.fetch(
                    'https://qrprexuziojupqvvdefy.supabase.co/functions/v1/post-game-results',
                    {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(payload)
                    }
                );

                console.log('Edge function response status:', response.status, response.statusText);

                if (!response.ok) {
                    const errorText = await response.text();
                    console.error('Edge function error response:', errorText);
                    throw new Error(`Edge function failed: ${response.status} ${response.statusText} - ${errorText}`);
                }

                const result = await response.json();
                console.log('✓ Edge function response:', result);
                
                // Log the actual response message
                if (result.data?.content) {
                    console.log('Discord message content:', result.data.content);
                }
                
                return result;
            } else {
                console.error('Discord proxy not available');
                return { success: false, reason: 'proxy_unavailable' };
            }
        } catch (error) {
            console.error('❌ Error invoking share command:', error.message);
            console.error('Full error:', error);
            throw error;
        }
    }
}