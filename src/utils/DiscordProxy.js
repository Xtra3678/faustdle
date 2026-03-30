/**
 * Discord Proxy Utility for handling external requests in Discord activities
 * Uses Discord's built-in proxy system to bypass CSP restrictions
 */
export class DiscordProxy {
    constructor(discordSDK) {
        this.discordSDK = discordSDK;
        this.isDiscordActivity = this.detectDiscordEnvironment();
        this.discordAppId = '1351722811718373447';
        this.proxyBaseUrl = `https://${this.discordAppId}.discordsays.com`;
        
        console.log('DiscordProxy initialized:', {
            isDiscordActivity: this.isDiscordActivity,
            hasSDK: !!this.discordSDK,
            proxyBaseUrl: this.proxyBaseUrl
        });
    }

    /**
     * Detect if we're running in Discord's activity environment
     */
    detectDiscordEnvironment() {
        const hostname = window.location.hostname;
        const isDiscordDomain = hostname.includes('discordsays.com');
        const hasDiscordParent = window.parent !== window;
        const hasDiscordUserAgent = navigator.userAgent.includes('Discord');
        
        console.log('Discord environment detection:', {
            hostname,
            isDiscordDomain,
            hasDiscordParent,
            hasDiscordUserAgent
        });
        
        return isDiscordDomain || hasDiscordParent || hasDiscordUserAgent;
    }

    /**
     * Main fetch method that routes through Discord proxy
     */
    async fetch(url, options = {}) {
        if (!this.isDiscordActivity) {
            console.log('Not in Discord, using regular fetch');
            return fetch(url, options);
        }

        console.log('Discord proxy fetch requested for:', url);

        // Always use Supabase proxy for any Supabase URL
        if (url.includes('supabase.co')) {
            return await this.fetchViaSupabaseProxy(url, options);
        }

        // For other URLs, try general proxy methods
        return await this.fetchViaProxyEndpoint(url, options);
    }

    /**
     * Special handling for Supabase URLs using Discord's proxy
     * Uses the specific target path configured in Discord Activity URL Mappings
     */
    async fetchViaSupabaseProxy(url, options) {
        console.log('Using Supabase proxy method for URL:', url);
        
        try {
            // Parse the original Supabase URL
            const originalUrl = new URL(url);
            
            // Extract API key from environment or URL
            const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
            
            // Extract everything after the domain (path + query + hash)
            let pathAndQuery = originalUrl.pathname + originalUrl.search + originalUrl.hash;
            
            // Ensure apikey is in query params for Supabase
            if (!pathAndQuery.includes('apikey=')) {
                const separator = pathAndQuery.includes('?') ? '&' : '?';
                pathAndQuery += `${separator}apikey=${supabaseAnonKey}`;
            }
            
            // Build the proxy URL using Discord's proxy format
            // This maps to: Target: /.proxy/supabase, Prefix: https://qrprexuziojupqvvdefy.supabase.co/
            const proxyUrl = `${this.proxyBaseUrl}/.proxy/supabase${pathAndQuery}`;
            
            console.log('Original URL:', url);
            console.log('Proxy URL:', proxyUrl);
            
            // Prepare headers for the proxy request
            const proxyHeaders = {
                'Content-Type': 'application/json',
                'Accept': 'application/json',
                'X-Discord-Proxy': 'true'
            };

            // Add Supabase API key to headers as backup
            if (supabaseAnonKey) {
                proxyHeaders['apikey'] = supabaseAnonKey;
            }

            // Handle any additional headers from options
            if (options.headers) {
                // Copy over important headers from the original request
                Object.keys(options.headers).forEach(key => {
                    const lowerKey = key.toLowerCase();
                    // Skip content-type as we already set it
                    if (lowerKey !== 'content-type' && lowerKey !== 'host') {
                        proxyHeaders[key] = options.headers[key];
                    }
                });
            }

            const proxyOptions = {
                ...options,
                headers: proxyHeaders,
                mode: 'cors',
                credentials: 'omit' // Don't send credentials to Discord proxy
            };

            console.log('Proxy request options:', {
                url: proxyUrl,
                method: proxyOptions.method || 'GET',
                headers: proxyHeaders
            });

            const response = await fetch(proxyUrl, proxyOptions);
            
            console.log('Proxy response:', {
                status: response.status,
                statusText: response.statusText,
                headers: Object.fromEntries(response.headers.entries())
            });
            
            if (!response.ok) {
                const errorText = await response.text().catch(() => '');
                console.error('Proxy response error:', errorText);
                throw new Error(`Proxy request failed: ${response.status} ${response.statusText} - ${errorText}`);
            }
            
            return response;
        } catch (error) {
            console.error('Supabase proxy failed:', error);
            throw new Error(`Discord Supabase proxy failed: ${error.message}`);
        }
    }

    /**
     * Use Discord's .proxy/ endpoint for general URLs
     */
    async fetchViaProxyEndpoint(url, options) {
        console.log('Trying Discord proxy endpoint for general URL');
        
        // Convert URL to proxy format
        const proxyUrl = this.convertToProxyUrl(url);
        console.log('General proxy URL:', proxyUrl);

        const proxyOptions = {
            ...options,
            headers: {
                ...options.headers,
                'X-Discord-Proxy': 'true',
                'X-Requested-With': 'XMLHttpRequest'
            }
        };

        return await fetch(proxyUrl, proxyOptions);
    }

    /**
     * Convert URL to Discord proxy format for general URLs
     * Format: https://[app-id].discordsays.com/.proxy/[encoded-url]
     */
    convertToProxyUrl(originalUrl) {
        try {
            // Remove protocol and encode
            const urlWithoutProtocol = originalUrl.replace(/^https?:\/\//, '');
            
            // Use URL encoding for better compatibility
            const encodedUrl = encodeURIComponent(urlWithoutProtocol);
            
            return `${this.proxyBaseUrl}/.proxy/${encodedUrl}`;
        } catch (error) {
            console.error('Failed to convert to proxy URL:', error);
            return originalUrl;
        }
    }

    /**
     * Check if we're in Discord environment
     */
    isInDiscord() {
        return this.isDiscordActivity;
    }

    /**
     * Get proxy status for debugging
     */
    getProxyStatus() {
        return {
            isDiscordActivity: this.isDiscordActivity,
            hasSDK: !!this.discordSDK,
            proxyBaseUrl: this.proxyBaseUrl,
            currentUrl: window.location.href,
            expectedProxyFormat: `${this.proxyBaseUrl}/.proxy/supabase/rest/v1/...`
        };
    }
}