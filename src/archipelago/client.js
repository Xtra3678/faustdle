import { EventEmitter } from 'events';

class FaustdleAPClient extends EventEmitter {
    constructor() {
        super();
        this.socket = null;
        this.connected = false;
        this.hints = [];
        this.gameMode = null;
        this.slot = null;
        this.hostName = '';
        this.players = new Map();
        this.slotData = null;
        this.dataPackage = null;
        this.debug = true;
        this.scoutedLocations = new Set();
    }

    log(...args) {
        if (this.debug) {
            console.log('[AP Client]', ...args);
        }
    }

    async connect(hostname, port, slot, password = '') {
        try {
            hostname = hostname.trim().toLowerCase();
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
            this.hostName = hostname;

            const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
            const wsUrl = hostname.startsWith('ws://') || hostname.startsWith('wss://') 
                ? hostname 
                : `${protocol}//${hostname}:${effectivePort}`;
            
            this.log('Connecting to:', wsUrl);
            
            return new Promise((resolve) => {
                this.socket = new WebSocket(wsUrl);
                
                this.socket.onopen = () => {
                    this.log('WebSocket connection established');
                    this.emit('connection_status', 'Connected to server, requesting data package...');
                    this.sendRaw({ cmd: 'GetDataPackage' });
                };
                
                this.socket.onmessage = (event) => {
                    try {
                        const messages = JSON.parse(event.data);
                        this.log('Received:', messages);
                        
                        if (Array.isArray(messages)) {
                            messages.forEach(packet => this.handlePacket(packet));
                        } else {
                            this.handlePacket(messages);
                        }
                    } catch (error) {
                        console.error('Failed to parse message:', error);
                    }
                };
                
                this.socket.onerror = (error) => {
                    console.error('WebSocket error:', error);
                    this.emit('connection_error', ['Connection error occurred']);
                    resolve(false);
                };
                
                this.socket.onclose = (event) => {
                    this.log('WebSocket closed:', event);
                    this.connected = false;
                    this.emit('disconnected');
                    resolve(false);
                };

                this.once('connected', () => {
                    this.scoutAllLocations();
                    resolve(true);
                });
            });
        } catch (error) {
            console.error('Connection setup failed:', error);
            return false;
        }
    }

    sendRaw(packet) {
        if (this.socket?.readyState === WebSocket.OPEN) {
            const data = JSON.stringify([packet]);
            this.log('Sending:', data);
            this.socket.send(data);
        }
    }

    handlePacket(packet) {
        if (!packet?.cmd) return;

        this.log('Processing:', packet.cmd);

        switch (packet.cmd) {
            case 'DataPackage':
                if (!packet.data) {
                    this.emit('connection_error', ['Invalid data package']);
                    return;
                }
                
                this.dataPackage = packet.data;
                this.sendRaw({
                    cmd: 'Connect',
                    game: '',
                    name: this.slot,
                    uuid: crypto.randomUUID(),
                    version: {
                        major: 0,
                        minor: 4,
                        build: 2,
                        class: 'Version'
                    },
                    items_handling: 0b000,
                    tags: ['AP', 'DeathLink', 'HintGame'],
                    password: ''
                });
                break;

            case 'Connected':
                this.connected = true;
                if (packet.slot_data) {
                    this.slotData = packet.slot_data;
                }
                if (packet.players) {
                    this.players = new Map(Object.entries(packet.players));
                }
                this.emit('connected');
                break;

            case 'ReceivedItems':
                if (Array.isArray(packet.items)) {
                    this.processReceivedItems(packet.items);
                }
                break;

            case 'RoomUpdate':
                this.emit('roomUpdate', packet);
                break;

            case 'PrintJSON':
                this.emit('server_message', packet.data);
                break;

            case 'ConnectionRefused':
                this.emit('connection_error', packet.errors);
                break;

            case 'Error':
                this.emit('server_error', packet);
                break;
        }
    }

    scoutAllLocations() {
        if (!this.connected || !this.dataPackage) return;

        const locations = this.dataPackage.games?.Faustdle?.locations || {};
        
        Object.keys(locations).forEach(location => {
            if (!this.scoutedLocations.has(location)) {
                this.sendLocationScout(location);
                this.scoutedLocations.add(location);
            }
        });
    }

    sendLocationScout(location) {
        this.sendRaw({
            cmd: 'LocationScouts',
            locations: [location],
            create_as_hint: true
        });
    }

    submitGuess(guess, result) {
        if (!this.connected) return;

        const locationName = `${guess}_${result.correct ? 'correct' : 'incorrect'}`;
        
        // Send a location scout for this guess
        this.sendRaw({
            cmd: 'LocationScouts',
            locations: [locationName],
            create_as_hint: true,
            found_items: result.correct ? 1 : 0
        });

        // If it's a correct guess, create an additional hint
        if (result.correct) {
            this.sendRaw({
                cmd: 'Say',
                text: `Found character: ${guess}!`
            });
        }
    }

    processReceivedItems(items) {
        try {
            const newHints = items.map(item => ({
                player: item.player,
                item: item.item,
                flags: item.flags || 0,
                type: this.getHintType(),
                result: item.location || null
            }));
            
            this.hints.push(...newHints);
            this.emit('hintsUpdated', this.hints);
        } catch (error) {
            console.error('Failed to process items:', error);
        }
    }

    getHintType() {
        const types = {
            normal: ['gender', 'affiliation', 'devil_fruit'],
            hard: ['bounty', 'height', 'arc'],
            filler: ['all']
        };

        const availableTypes = types[this.gameMode] || types.normal;
        return availableTypes[Math.floor(Math.random() * availableTypes.length)];
    }

    setGameMode(mode) {
        this.gameMode = mode;
    }

    getHints() {
        return [...this.hints];
    }

    isConnected() {
        return this.connected;
    }

    disconnect() {
        if (this.socket) {
            this.socket.close();
            this.socket = null;
        }
        this.connected = false;
        this.hints = [];
        this.scoutedLocations.clear();
    }
}

export const apClient = new FaustdleAPClient();