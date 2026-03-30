/**
 * Discord Authentication Manager for Supabase integration
 * Handles Discord OAuth flow and Supabase session management
 */
export class DiscordAuth {
    constructor(supabase, discordSDK) {
        this.supabase = supabase;
        this.discordSDK = discordSDK;
        this.user = null;
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
     */
    async authenticateWithDiscord() {
        try {
            console.log('Starting Discord authentication flow...');
            
            // Step 1: Request authorization from Discord with required scopes
            const { code } = await this.discordSDK.commands.authorize({
                client_id: this.discordClientId,
                response_type: 'code',
                state: '',
                prompt: 'none',
                scope: ['identify', 'guilds']
            });

            console.log('Authorization code received, exchanging for access token via backend...');

            // Step 2: Exchange authorization code for access token via backend
            // For now, use a placeholder backend URL - in production, this should be your backend
            const tokenResponse = await fetch('/.proxy/api/token', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ code })
            }).catch(async (error) => {
                console.warn('Backend token exchange failed, falling back to anonymous session:', error);
                // Fallback for development without backend
                return null;
            });

            let access_token = null;
            if (tokenResponse && tokenResponse.ok) {
                const tokenData = await tokenResponse.json();
                access_token = tokenData.access_token;
            }

            // Step 3: Authenticate with Discord using the access token
            let authResponse = null;
            if (access_token) {
                authResponse = await this.discordSDK.commands.authenticate({
                    access_token
                });
                console.log('Discord authentication successful with access token');
            } else {
                console.log('No access token available, using anonymous session');
            }

            // Step 4: Create Supabase session with Discord user data
            if (authResponse && authResponse.user) {
                // Authenticated with Discord token
                return await this.createAuthenticatedSession(authResponse.user, access_token);
            } else {
                // Fallback to anonymous session
                console.log('Falling back to anonymous session');
                return await this.createAnonymousSession();
            }
        } catch (error) {
            console.error('Discord authentication failed:', error);
            
            // Fallback: create anonymous session
            return await this.createAnonymousSession();
        }
    }

    /**
     * Create an authenticated session using Discord user info
     */
    async createAuthenticatedSession(discordUser, accessToken) {
        try {
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

            console.log('Authenticated session created for Discord user:', discordUser.username);
            return true;
        } catch (error) {
            console.error('Failed to create authenticated session:', error);
            return false;
        }
    }

    /**
     * Create an anonymous session for Discord users when OAuth fails
     */
    async createAnonymousSession() {
        try {
            // For anonymous sessions in Discord Activity, try to get basic user context
            let discordUserData = null;
            
            try {
                // Try to get user from SDK if available - might fail if auth not set up
                // This is optional and only works if SDK is authenticated
                const discordUser = await this.discordSDK.commands.getUserId?.();
                if (discordUser) {
                    discordUserData = discordUser;
                }
            } catch (e) {
                console.log('Could not get Discord user context for anonymous session:', e);
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
                        provider: 'discord_anonymous'
                    }
                }
            });

            if (error) {
                throw error;
            }

            this.session = data.session;
            this.user = data.user;
            this.isAuthenticated = true;

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