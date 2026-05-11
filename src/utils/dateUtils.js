/**
 * Utility functions for consistent UTC date handling
 * Ensures all date operations use UTC, never local timezone
 */

/**
 * Get today's date in UTC as YYYY-MM-DD format
 * This is the ONLY function to use for daily game dates
 * @returns {string} UTC date in YYYY-MM-DD format (e.g., "2026-03-31")
 */
export function getUTCDateString() {
    const now = new Date();
    const utcYear = now.getUTCFullYear();
    const utcMonth = String(now.getUTCMonth() + 1).padStart(2, '0');
    const utcDay = String(now.getUTCDate()).padStart(2, '0');
    
    const dateString = `${utcYear}-${utcMonth}-${utcDay}`;
    console.log('[UTC Date]', { method: 'getUTCDateString()', result: dateString, actualUTC: now.toISOString() });
    
    return dateString;
}
