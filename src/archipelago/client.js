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
        this.connectedGame = null;
        this.checkedLocations = new Set();
        this.missingLocations = new Set();
        this.teamId = null;
        this.slotId = null;
        this.locationFlags = new Map();
        this.sentHints = new Set();
        this.deathLinkEnabled = false;
    }

    log(...args) {
        if (this.debug) {
            console.log('[AP Client]', ...args);
        }
    }

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
            this.hostName = hostname;
            this.deathLinkEnabled = deathLink;

            const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
            const wsUrl = hostname.startsWith('ws://') || hostname.startsWith('wss://') 
                ? hostname 
                : `${protocol}//${hostname}:${effectivePort}`;
            
            this.log('Connecting to:', wsUrl);
            
            return new Promise((resolve) => {
                try {
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
                        this.emit('connection_error', ['Connection error occurred']);
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
                const tags = ['Faustdle'];
                if (this.deathLinkEnabled) {
                    tags.push('DeathLink');
                }
                
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
                    tags: tags,
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

    handleDeathLink(packet) {
        if (!packet.data) return;
        
        const deathData = packet.data;
        const source = deathData.source || 'Unknown';
        this.log('Death link received from:', source);
        this.emit('death_link_received', { source });
    }

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

    processLocationInfo(locations) {
        if (!locations || typeof locations !== 'object') return;

        for (const [locationId, info] of Object.entries(locations)) {
            const flags = info?.flags || 0;
            this.locationFlags.set(parseInt(locationId), flags);
            this.log(`Location ${locationId} has flags: ${flags}`);
        }
    }

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

    sendTestHint() {
        if (!this.connected) {
            this.log('Cannot send test hint: not connected');
            return;
        }

        const locationId = this.getRandomMissingLocation();
        if (locationId !== null) {
            this.log('Sending test hint for location:', locationId);
            this.sentHints.add(locationId);
            this.sendRaw({
                cmd: 'LocationScouts',
                locations: [locationId],
                create_as_hint: true
            });
        }
    }

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

    setGameMode(mode) {
        this.gameMode = mode;
    }

    getHints() {
        return [...this.hints];
    }

    isConnected() {
        return this.connected;
    }

    isDeathLinkEnabled() {
        return this.deathLinkEnabled;
    }

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