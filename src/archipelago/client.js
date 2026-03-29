import { EventEmitter } from '../utils/events.js';

/**
 * Client for connecting to and interacting with Archipelago multiworld servers
 * Handles WebSocket communication, game state, and hint management
 */
class FaustdleAPClient extends EventEmitter {
    /**
     * Initializes the Archipelago client with default state
     */
    constructor() {
        super();
        this.socket = null;
        this.connected = false;
        this.hints = [];
        this.gameMode = null;
        this.slot = null;
        this.password = '';
        this.hostName = '';
        this.effectivePort = 38281;
        this.players = new Map();
        this.slotData = null;
        this.dataPackage = null;
        this.debug = true;
        this.connectedGame = null;
        this.checkedLocations = new Set();
        this.missingLocations = new Set();
        this.teamId = null;
        this.slotId = null;
        this.locationFlags = new Map();
        this.sentHints = new Set();
        this.deathLinkEnabled = false;
        this.isDiscordActivity = window.location.href.includes('discordsays.com');
        this.discordAppId = '1351722811718373447';
    }

    /**
     * Logs debug messages if debug mode is enabled
     * @param {...any} args - Arguments to log
     */
    log(...args) {
        if (this.debug) {
            console.log('[AP Client]', ...args);
        }
    }

    /**
     * Attempts a simple connection to diagnose issues
     * @param {string} hostname - Server hostname
     * @param {number} port - Server port
     * @returns {Promise<Object>} Diagnostic results
     */
    async diagnoseConnection(hostname, port) {
        const diagnostics = {
            pageProtocol: window.location.protocol,
            hostname: hostname,
            port: port,
            wsProtocol: window.location.protocol === 'https:' ? 'wss:' : 'ws:',
            timestamp: new Date().toISOString(),
            results: {}
        };
        
        this.log('Running connection diagnostics...', diagnostics);
        
        // Test 1: Check if https page is trying to use ws
        if (window.location.protocol === 'https:' && port === 80) {
            diagnostics.results.httpsToWsWarning = 'WARNING: HTTPS page cannot connect to unsecured WS on port 80. Need WSS or different port.';
        }
        
        // Test 2: Check if hostname might be invalid
        if (hostname === 'archipelago.gg') {
            diagnostics.results.archipelagoGgNote = 'Note: archipelago.gg may not be a direct WebSocket server. You may need a specific server address.';
        }
        
        // Test 3: Attempt a quick connection
        const testUrl = window.location.protocol === 'https:' ? 
            `wss://${hostname}:${port}` : 
            `ws://${hostname}:${port}`;
        
        diagnostics.results.attemptUrl = testUrl;
        
        this.log('Diagnostics complete:', diagnostics);
        return diagnostics;
    }

    /**
     * Generates a UUID, with fallback for environments without crypto.randomUUID
     * @returns {string} UUID string
     */
    generateUUID() {
        if (typeof crypto !== 'undefined' && crypto.randomUUID) {
            return crypto.randomUUID();
        }
        // Fallback UUID generation
        return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
            const r = Math.random() * 16 | 0;
            const v = c === 'x' ? r : (r & 0x3 | 0x8);
            return v.toString(16);
        });
    }

    /**
     * Constructs the WebSocket URL based on the environment
     * @param {string} hostname - Server hostname
     * @param {number} port - Server port
     * @returns {string} WebSocket URL
     */
    constructWebSocketUrl(hostname, port) {
        // Remove any protocol prefix and trailing slashes
        const cleanHostname = hostname.replace(/^(ws|wss|http|https):\/\//, '').replace(/\/$/, '');
        
        if (this.isDiscordActivity) {
            // For Discord activities, use the full Discord proxy URL with /proxy prefix
            const url = `wss://${this.discordAppId}.discordsays.com/proxy/:${port}`;
            this.log('Discord activity URL:', url);
            return url;
        } else {
            // Always use WSS (secure WebSocket) for better compatibility
            const url = `wss://${cleanHostname}:${port}`;
            return url;
        }
    }

    /**
     * Establishes connection to Archipelago server
     * @param {string} hostname - Server hostname
     * @param {number} port - Server port
     * @param {string} slot - Player slot name
     * @param {string} [password=''] - Optional server password
     * @param {boolean} [deathLink=false] - Whether to enable death link feature
     * @returns {Promise<boolean>} True if connection successful, false otherwise
     */
    async connect(hostname, port, slot, password = '', deathLink = false) {
        try {
            hostname = hostname?.trim().toLowerCase() || '';
            if (!hostname) {
                throw new Error('Hostname is required');
            }

            const effectivePort = port || 38281;
            if (effectivePort < 1 || effectivePort > 65535) {
                throw new Error('Invalid port number');
            }

            if (!slot || typeof slot !== 'string') {
                throw new Error('Valid slot name is required');
            }

            this.slot = slot;
            this.password = password;
            this.hostName = hostname;
            this.effectivePort = effectivePort;
            this.deathLinkEnabled = deathLink;

            const wsUrl = this.constructWebSocketUrl(hostname, effectivePort);
            this.log('Connecting to:', wsUrl);
            
            return new Promise((resolve) => {
                try {
                    if (this.socket) {
                        this.socket.close();
                        this.socket = null;
                    }

                    this.socket = new WebSocket(wsUrl);
                    
                    this.socket.onopen = () => {
                        this.log('WebSocket connection established');
                        this.emit('connection_status', 'Connected to server, requesting data package...');
                        this.sendRaw({ cmd: 'GetDataPackage' });
                    };
                    
                    this.socket.onmessage = (event) => {
                        try {
                            if (!event.data) {
                                this.log('Received empty message');
                                return;
                            }

                            let messages;
                            try {
                                messages = JSON.parse(event.data);
                            } catch (parseError) {
                                this.log('Failed to parse message:', event.data);
                                return;
                            }

                            if (!messages) {
                                this.log('Parsed message is null or undefined');
                                return;
                            }
                            
                            this.log('Received:', messages);
                            
                            if (Array.isArray(messages)) {
                                messages.forEach(packet => {
                                    if (packet && typeof packet === 'object') {
                                        this.handlePacket(packet);
                                    }
                                });
                            } else if (typeof messages === 'object') {
                                this.handlePacket(messages);
                            }
                        } catch (error) {
                            this.log('Error processing message:', error);
                        }
                    };
                    
                    this.socket.onerror = (error) => {
                        this.log('WebSocket error:', error);
                        this.emit('connection_error', ['Connection to Archipelago server failed. Please check the server address and port.']);
                        resolve(false);
                    };
                    
                    this.socket.onclose = (event) => {
                        this.log('WebSocket closed:', event);
                        this.connected = false;
                        this.emit('disconnected');
                        resolve(false);
                    };

                    this.once('connected', () => resolve(true));
                } catch (error) {
                    this.log('Socket creation error:', error);
                    resolve(false);
                }
            });
        } catch (error) {
            this.log('Connection setup failed:', error);
            return false;
        }
    }

    /**
     * Sends a raw packet to the server
     * @param {Object} packet - Packet to send
     */
    sendRaw(packet) {
        if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
            this.log('Cannot send message: socket not ready');
            return;
        }

        try {
            const data = JSON.stringify([packet]);
            this.log('Sending:', data);
            this.socket.send(data);
        } catch (error) {
            this.log('Error sending message:', error);
        }
    }

    /**
     * Handles incoming packets from the server
     * @param {Object} packet - Received packet
     */
    handlePacket(packet) {
        if (!packet || typeof packet !== 'object' || !packet.cmd) {
            this.log('Invalid packet received:', packet);
            return;
        }

        this.log('Processing:', packet.cmd);

        switch (packet.cmd) {
            case 'DataPackage':
                if (!packet.data) {
                    this.emit('connection_error', ['Invalid data package']);
                    return;
                }
                
                this.dataPackage = packet.data;
                const tags = ['HintGame','Faustdle'];
                if (this.deathLinkEnabled) {
                    tags.push('DeathLink');
                }
                
                this.sendRaw({
                    cmd: 'Connect',
                    game: '',
                    name: this.slot,
                    uuid: this.generateUUID(),
                    version: {
                        major: 0,
                        minor: 5,
                        build: 0,
                        class: 'Version'
                    },
                    items_handling: 0b000,
                    tags: tags,
                    password: this.password || ''
                });
                break;

            case 'Connected':
                this.connected = true;
                if (packet.slot_data) {
                    this.slotData = packet.slot_data;
                }
                if (packet.players) {
                    this.players = new Map(Object.entries(packet.players));
                    for (const [id, player] of this.players) {
                        if (player.slot === this.slot) {
                            this.connectedGame = player.game;
                            this.teamId = player.team;
                            this.slotId = parseInt(id);
                            this.log('Connected to game:', this.connectedGame, 'Team:', this.teamId, 'Slot:', this.slotId);
                            break;
                        }
                    }
                }

                if (packet.checked_locations) {
                    this.checkedLocations = new Set(packet.checked_locations);
                    this.log('Checked locations:', this.checkedLocations);
                }
                if (packet.missing_locations) {
                    this.missingLocations = new Set(packet.missing_locations);
                    this.log('Missing locations:', this.missingLocations);
                }

                this.emit('connected');
                this.scoutAllLocations();
                break;

            case 'ReceivedItems':
                if (Array.isArray(packet.items)) {
                    this.processReceivedItems(packet.items);
                }
                break;

            case 'RoomUpdate':
                if (packet.checked_locations) {
                    this.checkedLocations = new Set(packet.checked_locations);
                }
                if (packet.missing_locations) {
                    this.missingLocations = new Set(packet.missing_locations);
                }
                this.emit('roomUpdate', packet);
                break;

            case 'LocationInfo':
                if (packet.locations) {
                    this.processLocationInfo(packet.locations);
                }
                break;

            case 'PrintJSON':
                if (packet.data) {
                    this.emit('server_message', packet.data);
                }
                break;

            case 'ConnectionRefused':
                this.emit('connection_error', packet.errors || ['Connection refused']);
                break;

            case 'Error':
                this.emit('server_error', packet);
                break;

            case 'Bounced':
                if (packet.tags?.includes('DeathLink') && this.deathLinkEnabled) {
                    this.handleDeathLink(packet);
                }
                break;

            default:
                this.log('Unknown packet type:', packet.cmd);
                break;
        }
    }

    /**
     * Handles death link packets from other players
     * @param {Object} packet - Death link packet
     */
    handleDeathLink(packet) {
        if (!packet.data) return;
        
        const deathData = packet.data;
        const source = deathData.source || 'Unknown';
        this.log('Death link received from:', source);

        // Create a custom event with the source and force skip flag
        const event = new CustomEvent('death_link_received', {
            detail: { 
                source,
                forceSkip: true // Add flag to indicate this should force a skip
            }
        });
        document.dispatchEvent(event);
    }

    /**
     * Sends a death link to other players
     * @param {string} [reason='Failed to guess character'] - Reason for death
     */
    sendDeathLink(reason = 'Failed to guess character') {
        if (!this.connected || !this.deathLinkEnabled) return;

        this.log('Sending death link');
        this.sendRaw({
            cmd: 'Bounce',
            tags: ['DeathLink'],
            data: {
                time: Date.now(),
                source: this.slot,
                reason
            }
        });
    }

    /**
     * Scouts all missing locations
     */
    scoutAllLocations() {
        const locations = Array.from(this.missingLocations);
        if (locations.length > 0) {
            this.log('Scouting all locations:', locations);
            this.sendRaw({
                cmd: 'LocationScouts',
                locations,
                create_as_hint: false
            });
        }
    }

    /**
     * Processes location information from server
     * @param {Object} locations - Location data
     */
    processLocationInfo(locations) {
        if (!locations || typeof locations !== 'object') return;

        for (const [locationId, info] of Object.entries(locations)) {
            const flags = info?.flags || 0;
            this.locationFlags.set(parseInt(locationId), flags);
            this.log(`Location ${locationId} has flags: ${flags}`);
        }
    }

    /**
     * Gets a random missing location, prioritizing progression items based on game mode
     * @returns {number|null} Location ID or null if none available
     */
    getRandomMissingLocation() {
        if (!this.missingLocations.size) {
            this.log('No missing locations available');
            return null;
        }

        const availableLocations = Array.from(this.missingLocations)
            .filter(loc => !this.sentHints.has(loc));

        if (availableLocations.length === 0) {
            this.log('No unhinted locations available');
            return null;
        }

        const sortedLocations = availableLocations.sort((a, b) => {
            const flagsA = this.locationFlags.get(a) || 0;
            const flagsB = this.locationFlags.get(b) || 0;
            
            const isProgressionA = flagsA > 0;
            const isProgressionB = flagsB > 0;
            
            if (isProgressionA !== isProgressionB) {
                return isProgressionB ? 1 : -1;
            }
            
            return Math.random() - 0.5;
        });

        let progressionChance;
        switch (this.gameMode) {
            case 'normal':
                progressionChance = 0.1;
                break;
            case 'hard':
                progressionChance = 0.3;
                break;
            case 'filler':
                progressionChance = 0.4;
                break;
            default:
                progressionChance = 0.1;
        }

        const progressionLocations = sortedLocations.filter(loc => 
            this.locationFlags.get(loc) > 0
        );
        
        let selectedLocation;
        if (progressionLocations.length > 0 && Math.random() < progressionChance) {
            selectedLocation = progressionLocations[Math.floor(Math.random() * progressionLocations.length)];
            this.log('Selected progression location with chance:', progressionChance);
        } else {
            selectedLocation = sortedLocations[Math.floor(Math.random() * sortedLocations.length)];
            this.log('Selected random location');
        }
        
        this.log('Selected location:', selectedLocation, 'with flags:', this.locationFlags.get(selectedLocation));
        return selectedLocation;
    }

    /**
     * Submits a guess result and potentially sends a hint
     * @param {string} guess - The character that was guessed
     * @param {Object} result - Result of the guess
     */
    submitGuess(guess, result) {
        if (!this.connected || !result.correct) return;

        const locationId = this.getRandomMissingLocation();
        if (locationId !== null) {
            this.log('Sending hint for location:', locationId);
            this.sentHints.add(locationId);
            this.sendRaw({
                cmd: 'LocationScouts',
                locations: [locationId],
                create_as_hint: true
            });
        }
    }

    /**
     * Processes received items and updates hints
     * @param {Array} items - Array of received items
     */
    processReceivedItems(items) {
        if (!Array.isArray(items)) return;

        try {
            const newHints = items.map(item => ({
                player: item?.player,
                item: item?.item,
                flags: item?.flags || 0,
                location: item?.location,
                timestamp: Date.now()
            })).filter(hint => hint.player != null && hint.item != null);
            
            if (newHints.length > 0) {
                this.hints.push(...newHints);
                this.emit('hintsUpdated', this.hints);
            }
        } catch (error) {
            this.log('Failed to process items:', error);
        }
    }

    /**
     * Sets the current game mode
     * @param {string} mode - Game mode to set
     */
    setGameMode(mode) {
        this.gameMode = mode;
    }

    /**
     * Gets all current hints
     * @returns {Array} Array of hints
     */
    getHints() {
        return [...this.hints];
    }

    /**
     * Checks if client is connected to server
     * @returns {boolean} Connection status
     */
    isConnected() {
        return this.connected;
    }

    /**
     * Checks if death link is enabled
     * @returns {boolean} Death link status
     */
    isDeathLinkEnabled() {
        return this.deathLinkEnabled;
    }

    /**
     * Disconnects from the server and resets state
     */
    disconnect() {
        if (this.socket) {
            this.socket.close();
            this.socket = null;
        }
        this.connected = false;
        this.hints = [];
        this.checkedLocations.clear();
        this.missingLocations.clear();
        this.connectedGame = null;
        this.teamId = null;
        this.slotId = null;
        this.locationFlags.clear();
        this.sentHints.clear();
        this.deathLinkEnabled = false;
    }
}

export const apClient = new FaustdleAPClient();