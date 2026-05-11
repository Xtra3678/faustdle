import { getUTCDateString } from './dateUtils.js';

const EDGE_FUNCTION_URL = 'https://qrprexuziojupqvvdefy.supabase.co/functions/v1/post-game-results';

/**
 * Manages saving daily game results to Supabase database
 * Stores emoji grid, time taken, and Discord user ID for shareable results
 * 
 * NOTE: When in Discord Activity, this submits to the edge function instead of
 * directly to Supabase, because the Discord proxy doesn't support upsert's
 * onConflict parameters. The edge function has the service role key and can
 * properly handle upsert with conflict resolution.
 * Uses DiscordProxy to bypass CSP restrictions on fetch calls.
 */
export class DailyResultsStorage {
    constructor(supabase, discordProxy = null) {
        this.supabase = supabase;
        this.discordProxy = discordProxy;
    }

    /**
     * Saves daily game completion results to Supabase
     * @param {string} discordUserId - The Discord user ID
     * @param {string} emojiGrid - The emoji grid representation of results
     * @param {string} timeTaken - The time taken (e.g., "2:45")
     * @param {string} [channelId] - Optional Discord channel ID for activity sessions
     * @returns {Promise<{success: boolean, error?: string}>}
     */
    async saveDailyResults(discordUserId, emojiGrid, timeTaken, channelId = null) {
        if (!discordUserId) {
            console.error('DailyResultsStorage: Discord user ID is required');
            return { success: false, error: 'Discord user ID required' };
        }

        try {
            console.log('DailyResultsStorage: Saving results for user', discordUserId, 'channel:', channelId);

            // If we have a channel ID, we're in a Discord Activity and should use the edge function
            // The edge function has proper upsert support with the service role key
            if (channelId) {
                console.log('DailyResultsStorage: Using edge function for activity completion');
                
                // Use DiscordProxy for fetch to bypass CSP restrictions
                const fetchFn = this.discordProxy ? 
                    (url, opts) => this.discordProxy.fetch(url, opts) : 
                    fetch;
                
                const response = await fetchFn(EDGE_FUNCTION_URL, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        type: 'activity_completion',
                        userId: discordUserId,
                        channelId: channelId,
                        emojiGrid: emojiGrid,
                        timeTaken: timeTaken
                    })
                });

                if (!response.ok) {
                    console.error('DailyResultsStorage: HTTP error:', response.status);
                    const errorText = await response.text();
                    console.error('Response:', errorText);
                    return { success: false, error: `HTTP ${response.status}` };
                }

                const data = await response.json();
                
                if (!data.success) {
                    console.error('DailyResultsStorage: Edge function error:', data.error);
                    return { success: false, error: data.error };
                }

                console.log('DailyResultsStorage: Results saved via edge function');
                return { success: true };
            } else {
                // No channel ID - not in an activity, use direct Supabase (shouldn't happen in Activity)
                console.warn('DailyResultsStorage: No channel ID provided - skipping save');
                // In Activity mode, we should always have a channel ID
                // Silently fail rather than throw an error
                return { success: false, error: 'Not in Activity context' };
            }
        } catch (error) {
            console.error('DailyResultsStorage: Error saving results:', error);
            return { success: false, error: error.message };
        }
    }

    /**
     * Updates an existing channel entry with local cached game data
     * Used when user plays in one channel, completes the puzzle, then loads the game in another channel
     * Updates the new channel's entry with the completed game results from local cache
     * @param {string} discordUserId - The Discord user ID
     * @param {string} channelId - The new Discord channel ID to update
     * @param {string} emojiGrid - The emoji grid from local cache
     * @param {string} timeTaken - The time taken from local cache (e.g., "2:45")
     * @returns {Promise<{success: boolean, error?: string}>}
     */
    async updateChannelEntryFromLocalCache(discordUserId, channelId, emojiGrid, timeTaken) {
        if (!discordUserId || !channelId) {
            console.error('DailyResultsStorage: userId and channelId are required');
            return { success: false, error: 'Missing required parameters' };
        }

        try {
            console.log('DailyResultsStorage: Updating channel entry from local cache for user', discordUserId, 'channel:', channelId);

            // Use DiscordProxy for fetch to bypass CSP restrictions
            const fetchFn = this.discordProxy ? 
                (url, opts) => this.discordProxy.fetch(url, opts) : 
                fetch;
            
            const response = await fetchFn(EDGE_FUNCTION_URL, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    type: 'sync_cached_results',
                    userId: discordUserId,
                    channelId: channelId,
                    emojiGrid: emojiGrid,
                    timeTaken: timeTaken
                })
            });

            if (!response.ok) {
                console.error('DailyResultsStorage: HTTP error:', response.status);
                const errorText = await response.text();
                console.error('Response:', errorText);
                return { success: false, error: `HTTP ${response.status}` };
            }

            const data = await response.json();
            
            if (!data.success) {
                console.error('DailyResultsStorage: Edge function error:', data.error);
                return { success: false, error: data.error };
            }

            console.log('DailyResultsStorage: Channel entry updated from local cache');
            return { success: true };
        } catch (error) {
            console.error('DailyResultsStorage: Error updating from cache:', error);
            return { success: false, error: error.message };
        }
    }
}
