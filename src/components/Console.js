/**
 * Console system for displaying game logs and messages
 * Displays timestamped, color-coded messages on the UI
 */

import { apClient } from '../archipelago/client.js';

export class Console {
    constructor() {
        this.messages = [];
        this.maxMessages = 100;
        this.containerElement = null;
        this.apClient = apClient;
        
        // Name lookup dictionaries organized by game (like CommonClient.py)
        this.itemNameMap = {};       // structure: { gameName: { itemId: itemName } }
        this.locationNameMap = {};   // structure: { gameName: { locationId: locationName } }
        
        this.createUI();
        this.setupDataPackageListener();
    }
    
    /**
     * Listens for dataPackage updates and rebuilds name maps
     * @private
     */
    setupDataPackageListener() {
        // Check if dataPackage is already loaded
        if (this.apClient && this.apClient.dataPackage) {
            this.buildNameMaps(this.apClient.dataPackage);
        }
        
        // Listen for dataPackage updates
        const checkDataPackage = setInterval(() => {
            if (this.apClient && this.apClient.dataPackage && Object.keys(this.itemNameMap).length === 0) {
                this.buildNameMaps(this.apClient.dataPackage);
                if (Object.keys(this.itemNameMap).length > 0) {
                    clearInterval(checkDataPackage);
                }
            }
        }, 100);
    }
    
    /**
     * Builds name lookup maps from dataPackage 
     * @private
     */
    buildNameMaps(dataPackage) {
        if (!dataPackage || !dataPackage.games) {
            return;
        }
        
        // Iterate through all games in the dataPackage
        for (const gameName of Object.keys(dataPackage.games)) {
            const gameData = dataPackage.games[gameName];
            
            // Initialize game entries if they don't exist
            if (!this.itemNameMap[gameName]) {
                this.itemNameMap[gameName] = {};
            }
            if (!this.locationNameMap[gameName]) {
                this.locationNameMap[gameName] = {};
            }
            
            // Build item name map: transform name_to_id to id_to_name
            if (gameData.item_name_to_id) {
                for (const [itemName, itemId] of Object.entries(gameData.item_name_to_id)) {
                    this.itemNameMap[gameName][itemId] = itemName;
                }
            }
            
            // Build location name map: transform name_to_id to id_to_name
            if (gameData.location_name_to_id) {
                for (const [locationName, locationId] of Object.entries(gameData.location_name_to_id)) {
                    this.locationNameMap[gameName][locationId] = locationName;
                }
            }
        }
    }

    /**
     * Creates the console UI element
     */
    createUI() {
        const container = document.createElement('div');
        container.id = 'game-console';
        container.className = 'console-container hidden';
        
        const output = document.createElement('div');
        output.id = 'console-output';
        output.className = 'console-output';
        
        container.appendChild(output);
        
        // Add input section
        const inputSection = document.createElement('div');
        inputSection.className = 'console-input-section';
        
        const input = document.createElement('input');
        input.id = 'console-input';
        input.type = 'text';
        input.className = 'console-input';
        input.placeholder = 'Type command or message...';
        
        inputSection.appendChild(input);
        container.appendChild(inputSection);
        
        // Insert after game-play section
        const gamePlay = document.getElementById('game-play');
        if (gamePlay && gamePlay.parentNode) {
            gamePlay.parentNode.insertBefore(container, gamePlay.nextSibling);
        } else {
            document.body.appendChild(container);
        }
        
        this.containerElement = container;
        this.inputElement = input;
        
        // Setup input handler
        this.setupInputHandler();
    }

    /**
     * Looks up a name by ID in the specified game 
     * @private
     */
    lookupInGame(id, mapType, gameName) {
        const map = mapType === 'item' ? this.itemNameMap : this.locationNameMap;
        if (map[gameName] && map[gameName][id] !== undefined) {
            return map[gameName][id];
        }
        return null;  // Return null if not found, caller will use original ID
    }
    
    /**
     * Looks up a name by ID in the specified slot 
     * @private
     */
    lookupInSlot(id, mapType, playerSlot) {
        if (!this.apClient || !this.apClient.slot_info) {
            return null;
        }
        
        // Get the slot_info for this player to find their game
        const slotInfo = this.apClient.slot_info[playerSlot];
        if (!slotInfo || !slotInfo.game) {
            return null;  // No game info for this slot
        }
        
        // Now look up in that specific game
        return this.lookupInGame(id, mapType, slotInfo.game);
    }

    /**
     * Resolves a typed message part (converts IDs to names using AP data)
     * @private
     * @param {Object} part - Message part with possible type field
     * @returns {string} Resolved text
     */
    resolvePart(part) {
        if (!part || typeof part !== 'object') {
            return String(part);
        }
        
        if (!part.type) {
            // No type, just return the text
            return String(part.text || '');
        }
        
        const text = String(part.text);
        
        // Resolve different types
        switch (part.type) {
            case 'player_id': {
                // Look up player name by slot ID
                const playerId = parseInt(text);
                if (this.apClient && this.apClient.player_names && this.apClient.player_names[playerId]) {
                    return this.apClient.player_names[playerId];
                }
                return text;
            }
                
            case 'item_id': {
                // Look up item name by ID and player slot 
                if (this.apClient && part.player !== undefined) {
                    const itemId = parseInt(text);
                    const playerSlot = part.player;
                    
                    // Use lookup_in_slot to get the game from slot_info
                    const itemName = this.lookupInSlot(itemId, 'item', playerSlot);
                    if (itemName) {
                        return itemName;
                    }
                }
                return text;
            }
                
            case 'location_id': {
                // Look up location name by ID and player slot 
                if (this.apClient && part.player !== undefined) {
                    const locationId = parseInt(text);
                    const playerSlot = part.player;
                    
                    // Use lookup_in_slot to get the game from slot_info
                    const locationName = this.lookupInSlot(locationId, 'location', playerSlot);
                    if (locationName) {
                        return locationName;
                    }
                }
                return text;
            }
                
            case 'hint_status': {
                // Format hint status
                const statusNames = {
                    0: '(unspecified)',
                    1: '(found)',
                    2: '(unfound)',
                    3: '(flagged for collection)'
                };
                return statusNames[parseInt(text)] || text;
            }
                
            default:
                return text;
        }
    }

    /**
     * Logs a message to the console
     * @param {string|Array|Object} message - The message to log (can be string, array, or object)
     * @param {string} type - Message type: 'info', 'success', 'error', 'warning', 'debug'
     * @param {boolean} includeTimestamp - Whether to add a console timestamp (default: true)
     */
    log(message, type = 'info', includeTimestamp = true) {
        if (message === null || message === undefined) return;
        
        const timestamp = includeTimestamp ? this.getTimestamp() : '';
        
        // Handle array of typed message parts (for PrintJSON packets with arrays)
        if (Array.isArray(message)) {
            // Resolve all parts and concatenate
            const resolvedText = message.map(part => this.resolvePart(part)).join('');
            this.addMessageToBuffer(resolvedText, type, timestamp);
        } else if (typeof message === 'object') {
            // Single object, resolve its parts
            const resolved = this.resolvePart(message);
            this.addMessageToBuffer(resolved, type, timestamp);
        } else {
            // String or primitive
            this.addMessageToBuffer(String(message), type, timestamp);
        }
        
        this.render();
    }

    /**
     * Adds a single message to the message buffer
     * @private
     */
    addMessageToBuffer(message, type, timestamp) {
        // At this point, message should already be a string (resolved by log method)
        let textMessage = String(message);
        
        // Skip empty messages
        if (!textMessage.trim()) {
            return;
        }
        
        const messageObj = {
            text: textMessage,
            type: type,
            timestamp: timestamp,
            time: new Date()
        };
        
        this.messages.push(messageObj);
        
        // Keep only the latest messages
        if (this.messages.length > this.maxMessages) {
            this.messages.shift();
        }
    }

    /**
     * Gets formatted timestamp
     * @returns {string}
     */
    getTimestamp() {
        const now = new Date();
        const hours = String(now.getHours()).padStart(2, '0');
        const minutes = String(now.getMinutes()).padStart(2, '0');
        const seconds = String(now.getSeconds()).padStart(2, '0');
        return `${hours}:${minutes}:${seconds}`;
    }

    /**
     * Renders all messages to the console output
     */
    render() {
        const output = document.getElementById('console-output');
        if (!output) return;
        
        output.innerHTML = '';
        
        this.messages.forEach(msg => {
            const line = document.createElement('div');
            line.className = `console-line console-${msg.type}`;
            // Only show timestamp if one was provided
            if (msg.timestamp) {
                line.innerHTML = `<span class="console-time">[${msg.timestamp}]</span> <span class="console-msg">${this.escapeHtml(msg.text)}</span>`;
            } else {
                line.innerHTML = `<span class="console-msg">${this.escapeHtml(msg.text)}</span>`;
            }
            output.appendChild(line);
        });
        
        // Auto-scroll to bottom
        output.scrollTop = output.scrollHeight;
    }

    /**
     * Sets up input handler for console commands
     * @private
     */
    setupInputHandler() {
        if (!this.inputElement) return;
        
        this.inputElement.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                const command = this.inputElement.value.trim();
                if (command) {
                    this.handleCommand(command);
                    this.inputElement.value = '';
                }
            }
        });
    }

    /**
     * Handles console commands and messages
     * @param {string} input - The command or message to execute
     * @private
     */
    handleCommand(input) {
        // Log the input as user input
        this.log(`> ${input}`, 'debug');
        
        // Check if it's a local command (starts with /)
        if (input.startsWith('/')) {
            const command = input.toLowerCase();
            
            // Handle built-in commands
            if (command === '/help') {
                this.log('Available commands:', 'info');
                this.log('  /help - Show this help message', 'info');
                this.log('  /clear - Clear console', 'info');
                this.log('  /disconnect - Disconnect from server', 'info');
            } else if (command === '/clear') {
                this.clear();
            } else if (command === '/disconnect') {
                // Dispatch disconnect event
                const event = new CustomEvent('ap-disconnect-request');
                document.dispatchEvent(event);
            } else {
                this.log(`Unknown command: ${input}. Type /help for available commands.`, 'warning');
            }
        } else {
            // Message to send - could be chat or server command (! prefix)
            import('../archipelago/client.js').then(({ apClient }) => {
                if (apClient && apClient.connected) {
                    apClient.sendMessage(input);
                    // Only show "You: " for regular chat, not for server commands (! prefix)
                    if (!input.startsWith('!')) {
                        this.log(`You: ${input}`, 'success');
                    }
                } else {
                    this.log('Not connected to Archipelago server. Use /help for commands or connect to AP first.', 'warning');
                }
            });
        }
    }

    /**
     * Escapes HTML special characters
     * @param {string} text
     * @returns {string}
     */
    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    /**
     * Clears all messages from the console
     */
    clear() {
        this.messages = [];
        this.render();
    }

    /**
     * Toggles console visibility
     */
    toggle() {
        if (this.containerElement) {
            this.containerElement.classList.toggle('hidden');
        }
    }

    /**
     * Shows the console
     */
    show() {
        if (this.containerElement) {
            this.containerElement.classList.remove('hidden');
        }
    }

    /**
     * Hides the console
     */
    hide() {
        if (this.containerElement) {
            this.containerElement.classList.add('hidden');
        }
    }

    /**
     * Shows the console when AP connects
     */
    onAPConnect() {
        this.show();
    }

    /**
     * Hides the console when AP disconnects
     */
    onAPDisconnect() {
        this.hide();
    }
}

// Global console instance
export const gameConsole = new Console();
