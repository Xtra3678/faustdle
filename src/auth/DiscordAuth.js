/**
 * Discord Authentication Manager for Supabase integration
 * Handles Discord OAuth flow and Supabase session management
 */
export class DiscordAuth {
    constructor(supabase, discordSDK, discordProxy = null) {
        this.supabase = supabase;
        this.discordSDK = discordSDK;
        this.discordProxy = discordProxy;
        this.user = null;
        this.userId = null;
        this.session = null;
        this.isAuthenticated = false;
        this.isDiscordActivity = window.location.href.includes('discordsays.com');
        
        // Discord OAuth configuration
        this.discordClientId = '1351722811718373447'; // Your Discord app client ID
        this.redirectUri = window.location.origin; // Your site's URL
    }

    /**
     * Initialize Discord authentication
     */
    async initialize() {
        try {
            // Check if we're in Discord environment
            if (!this.discordSDK) {
                console.log('Not in Discord environment, skipping Discord auth');
                return false;
            }

            // Check for existing session
            const { data: { session } } = await this.supabase.auth.getSession();
            if (session) {
                this.session = session;
                this.user = session.user;
                this.isAuthenticated = true;
                console.log('Existing Supabase session found');
                return true;
            }

            // Try to authenticate with Discord
            return await this.authenticateWithDiscord();
        } catch (error) {
            console.error('Discord auth initialization failed:', error);
            return false;
        }
    }

    /**
     * Authenticate user with Discord and create Supabase session
     * SDK has already called authorize() and authenticate() with access token
     * Now we need to retrieve the authenticated user info
     */
    async authenticateWithDiscord() {
        try {
            console.log('Retrieving Discord user after authentication...');
            
            // After authenticate() call, user info should be available
            // Try various methods to get user
            return await this.tryGetAuthenticatedUser();
            
        } catch (error) {
            console.error('Discord authentication failed:', error);
            return await this.createAnonymousSession();
        }
    }

    /**
     * Get user after SDK has been fully authenticated
     * For Discord Activities, user context is implicit in the Activity frame
     */
    async tryGetAuthenticatedUser() {
        try {
            console.log('Attempting to get authenticated user from Activity SDK...');
            
            // Give the SDK a moment to initialize all context
            await new Promise(resolve => setTimeout(resolve, 500));
            
            // Method 1: Check authResult stored by DiscordManager
            if (this.discordSDK?.authResult?.user?.id) {
                console.log('Got user from SDK.authResult:', this.discordSDK.authResult.user.username);
                const accessToken = this.discordSDK.authResult.access_token;
                return await this.createAuthenticatedSession(this.discordSDK.authResult.user, accessToken);
            }
            
            // Method 2: For Activities, check if we have guild/channel context (Activity identity)
            // This confirms we're in a Discord Activity iframe
            const authResult = this.discordSDK?.authResult;
            const guildId = authResult?.guildId || this.discordSDK?.guildId || this.discordSDK?.guild?.id;
            const channelId = authResult?.channelId || this.discordSDK?.channelId || this.discordSDK?.channel?.id;
            
            if (guildId && channelId) {
                console.log('✓ Activity context confirmed - in Discord Guild:', guildId, 'Channel:', channelId);
                
                // For Activities, user ID might come from SDK properties after a moment
                if (this.discordSDK?.user?.id) {
                    console.log('Got user from SDK.user:', this.discordSDK.user.username);
                    return await this.createAuthenticatedSession(this.discordSDK.user, null);
                }
                
                // If still no user, create session for Activity context
                console.log('Using implicit Activity user context');
                // Store the context info for use in sharing
                this.guildId = guildId;
                this.channelId = channelId;
                return await this.createAnonymousSession();
            }
            
            // Method 3: Try checking user property after authorize
            if (this.discordSDK?.user?.id) {
                console.log('Got user from SDK.user property:', this.discordSDK.user.username);
                return await this.createAuthenticatedSession(this.discordSDK.user, null);
            }
            
            // Method 4: Check internal SDK user context
            if (this.discordSDK?._user?.id) {
                console.log('Got user from SDK._user:', this.discordSDK._user.username);
                return await this.createAuthenticatedSession(this.discordSDK._user, null);
            }
            
            // Method 5: Try getUser command with identify scope
            if (this.discordSDK?.commands?.getUser) {
                try {
                    console.log('Calling getUser command...');
                    const userInfo = await this.discordSDK.commands.getUser();
                    if (userInfo?.id) {
                        console.log('Got user from getUser():', userInfo.username);
                        return await this.createAuthenticatedSession(userInfo, null);
                    }
                } catch (e) {
                    console.log('getUser command not available:', e.message);
                }
            }
            
            // Method 6: Subscribe to CURRENT_USER_UPDATE event
            try {
                if (this.discordSDK?.subscribe) {
                    console.log('Subscribing to CURRENT_USER_UPDATE event...');
                    
                    let userReceived = false;
                    let receiveTimeout;
                    
                    const subscriptionId = await this.discordSDK.subscribe('CURRENT_USER_UPDATE', (user) => {
                        console.log('CURRENT_USER_UPDATE received:', user?.username || user?.id);
                        if (user?.id) {
                            this.userId = user.id;
                            this.user = user;
                            userReceived = true;
                            if (receiveTimeout) clearTimeout(receiveTimeout);
                        }
                    });
                    
                    // Wait for event with timeout
                    await new Promise(resolve => {
                        receiveTimeout = setTimeout(() => resolve(), 2000);
                        const checkInterval = setInterval(() => {
                            if (userReceived) {
                                clearInterval(checkInterval);
                                resolve();
                            }
                        }, 100);
                    });
                    
                    if (userReceived && this.userId) {
                        console.log('User acquired via CURRENT_USER_UPDATE event');
                        return await this.createAnonymousSession();
                    }
                }
            } catch (e) {
                console.log('Could not subscribe to user update event:', e.message);
            }
            
            console.warn('Could not retrieve user from SDK, creating anonymous session');
            return await this.createAnonymousSession();
            
        } catch (e) {
            console.error('Failed to get authenticated user:', e.message);
            return await this.createAnonymousSession();
        }
    }

    /**
     * Create an authenticated session using Discord user info
     */
    async createAuthenticatedSession(discordUser, accessToken) {
        try {
            // Store the Discord user ID for later use (e.g., sharing to Discord)
            this.userId = discordUser.id;
            console.log('Stored Discord user ID:', this.userId);
            
            // If no access token passed, try to get it from SDK authResult
            let finalAccessToken = accessToken;
            if (!finalAccessToken && this.discordSDK?.authResult?.access_token) {
                finalAccessToken = this.discordSDK.authResult.access_token;
                console.log('Retrieved access token from SDK authResult');
            }
            
            // Sign in anonymously with Discord user metadata
            const { data, error } = await this.supabase.auth.signInAnonymously({
                options: {
                    data: {
                        discord_id: discordUser.id,
                        discord_username: discordUser.username,
                        discord_discriminator: discordUser.discriminator,
                        discord_global_name: discordUser.global_name,
                        avatar_url: discordUser.avatar ? 
                            `https://cdn.discordapp.com/avatars/${discordUser.id}/${discordUser.avatar}.png` : 
                            null,
                        provider: 'discord_sdk',
                        access_token: finalAccessToken
                    }
                }
            });

            if (error) {
                throw error;
            }

            this.session = data.session;
            this.user = data.user;
            this.isAuthenticated = true;

            console.log('Authenticated session created for Discord user:', discordUser.username);
            return true;
        } catch (error) {
            console.error('Failed to create authenticated session:', error);
            return false;
        }
    }

    /**
     * Create an anonymous session for Discord users when SDK auth unavailable
     */
    async createAnonymousSession() {
        try {
            console.log('Creating anonymous Supabase session...');
            
            // For anonymous sessions in Discord Activity, try to get basic user context
            let discordUserData = null;
            let accessToken = null;
            
            // First, check authResult for user and token
            if (this.discordSDK?.authResult) {
                if (this.discordSDK.authResult.user?.id) {
                    discordUserData = this.discordSDK.authResult.user;
                    this.userId = discordUserData.id;
                    console.log('Got user from SDK authResult for anonymous session:', discordUserData.username);
                }
                if (this.discordSDK.authResult.access_token) {
                    accessToken = this.discordSDK.authResult.access_token;
                    console.log('Got access token from SDK authResult for anonymous session');
                }
            }
            
            // If no user from authResult, try other methods
            if (!discordUserData) {
                try {
                    // Try to get user from SDK if available
                    if (this.discordSDK?.user?.id) {
                        discordUserData = this.discordSDK.user;
                        console.log('Got user from SDK.user property for anonymous session');
                    } else if (this.discordSDK?.commands?.getUser) {
                        discordUserData = await this.discordSDK.commands.getUser?.();
                        if (discordUserData) {
                            console.log('Got user from SDK commands.getUser() for anonymous session');
                        }
                    }
                } catch (e) {
                    console.log('Could not get Discord user context for anonymous session:', e.message);
                }
            }

            // Sign in anonymously
            const { data, error } = await this.supabase.auth.signInAnonymously({
                options: {
                    data: {
                        ...(discordUserData && {
                            discord_id: discordUserData.id,
                            discord_username: discordUserData.username,
                            discord_discriminator: discordUserData.discriminator,
                            discord_global_name: discordUserData.global_name,
                            avatar_url: discordUserData.avatar ? 
                                `https://cdn.discordapp.com/avatars/${discordUserData.id}/${discordUserData.avatar}.png` : 
                                null,
                        }),
                        provider: 'discord_anonymous',
                        access_token: accessToken
                    }
                }
            });

            if (error) {
                throw error;
            }

            this.session = data.session;
            this.user = data.user;
            this.isAuthenticated = true;
            
            // Store Discord user ID if available
            if (discordUserData?.id) {
                this.userId = discordUserData.id;
            }

            console.log('Anonymous session created');
            return true;
        } catch (error) {
            console.error('Failed to create anonymous session:', error);
            return false;
        }
    }

    /**
     * Handle OAuth callback (for when user returns from Discord OAuth)
     */
    async handleOAuthCallback() {
        try {
            const { data, error } = await this.supabase.auth.getSessionFromUrl();
            
            if (error) {
                throw error;
            }

            if (data.session) {
                this.session = data.session;
                this.user = data.session.user;
                this.isAuthenticated = true;
                console.log('OAuth callback successful');
                return true;
            }

            return false;
        } catch (error) {
            console.error('OAuth callback failed:', error);
            return false;
        }
    }

    /**
     * Sign out user
     */
    async signOut() {
        try {
            await this.supabase.auth.signOut();
            this.session = null;
            this.user = null;
            this.isAuthenticated = false;
            console.log('User signed out');
        } catch (error) {
            console.error('Sign out failed:', error);
        }
    }

    /**
     * Get current user
     */
    getCurrentUser() {
        return this.user;
    }

    /**
     * Get current session
     */
    getCurrentSession() {
        return this.session;
    }

    /**
     * Check if user is authenticated
     */
    isUserAuthenticated() {
        return this.isAuthenticated;
    }

    /**
     * Get Discord user info from session metadata
     */
    /**
     * Get Discord user ID
     */
    getDiscordUserId() {
        // Return stored userId from direct authentication
        if (this.userId) {
            return this.userId;
        }
        // Fall back to user metadata
        if (this.user?.user_metadata?.discord_id) {
            return this.user.user_metadata.discord_id;
        }
        return null;
    }

    /**
     * Set Discord user ID (when fetched later)
     */
    setDiscordUserId(userId) {
        if (userId) {
            this.userId = userId;
            console.log('Updated Discord user ID:', userId);
        }
    }

    /**
     * Get Discord user info
     */
    getDiscordUserInfo() {
        if (this.user?.user_metadata) {
            return {
                discord_id: this.user.user_metadata.discord_id,
                username: this.user.user_metadata.discord_username || this.user.user_metadata.user_name,
                discriminator: this.user.user_metadata.discord_discriminator,
                global_name: this.user.user_metadata.discord_global_name || this.user.user_metadata.full_name,
                avatar_url: this.user.user_metadata.avatar_url
            };
        }
        return null;
    }

    /**
     * Listen for auth state changes
     */
    onAuthStateChange(callback) {
        return this.supabase.auth.onAuthStateChange((event, session) => {
            this.session = session;
            this.user = session?.user || null;
            this.isAuthenticated = !!session;
            callback(event, session);
        });
    }
}