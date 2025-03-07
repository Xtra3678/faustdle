import { EventEmitter } from 'events';

class FaustdleAPClient extends EventEmitter {
    constructor() {
        super();
        this.socket = null;
        this.connected = false;
        this.hints = [];
        this.gameMode = null;
        this.slot = null;
    }

    async connect(hostname, port, slot, password = '') {
        try {
            const effectivePort = port || 38281;
            const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
            const wsUrl = `${protocol}//${hostname}:${effectivePort}`;
            
            if (this.socket) {
                this.socket.close();
            }
            
            this.socket = new WebSocket(wsUrl);
            this.slot = slot;
            
            this.socket.onopen = () => {
                console.log('WebSocket connected');
                this.sendConnect(slot, password);
            };
            
            this.socket.onmessage = (event) => {
                try {
                    const data = JSON.parse(event.data);
                    this.handleMessage(data);
                } catch (error) {
                    console.warn('Failed to parse message:', error);
                }
            };
            
            this.socket.onerror = (error) => {
                console.warn('WebSocket connection error:', error);
                this.connected = false;
                this.emit('connection_error', error);
            };
            
            this.socket.onclose = () => {
                console.log('WebSocket closed');
                this.connected = false;
                this.emit('disconnected');
            };
            
            return new Promise((resolve) => {
                const timeout = setTimeout(() => {
                    if (!this.connected) {
                        if (this.socket) {
                            this.socket.close();
                        }
                        resolve(false);
                    }
                }, 5000);

                this.once('connected', () => {
                    clearTimeout(timeout);
                    resolve(true);
                });

                this.once('connection_error', () => {
                    clearTimeout(timeout);
                    resolve(false);
                });
            });
        } catch (error) {
            console.warn('Connection setup failed:', error);
            return false;
        }
    }

    sendConnect(slot, password) {
        const connectPacket = {
            cmd: 'Connect',
            password: password,
            game: 'Faustdle',
            name: slot,
            uuid: crypto.randomUUID(),
            version: {
                major: 0,
                minor: 4,
                build: 2,
                class: 'Version'  // Add class identifier for proper version comparison
            },
            items_handling: 0b000,
            tags: ['AP'],
            slot_data: {},
            slot_info: {}
        };
        
        this.send(connectPacket);
    }

    send(packet) {
        if (this.socket && this.socket.readyState === WebSocket.OPEN) {
            try {
                // Ensure packet has required fields
                if (!packet.cmd) {
                    console.warn('Packet missing cmd field:', packet);
                    return;
                }

                console.log('Sending:', packet);
                this.socket.send(JSON.stringify([packet])); // Send as array of packets
            } catch (error) {
                console.warn('Failed to send message:', error);
            }
        }
    }

    handleMessage(data) {
        console.log('Received:', data);
        // Handle array of packets
        if (Array.isArray(data)) {
            data.forEach(packet => this.handlePacket(packet));
        } else {
            this.handlePacket(data);
        }
    }

    handlePacket(packet) {
        if (typeof packet === 'object' && packet !== null) {
            switch (packet.cmd) {
                case 'Connected':
                    this.connected = true;
                    this.emit('connected');
                    document.dispatchEvent(new Event('ap-connected'));
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
                    console.log('Server message:', packet.data);
                    break;
                case 'ConnectionRefused':
                    console.warn('Connection refused:', packet.errors);
                    this.emit('connection_error', packet.errors);
                    break;
                case 'Error':
                    console.warn('Server error:', packet);
                    this.emit('server_error', packet);
                    break;
            }
        }
    }

    processReceivedItems(items) {
        try {
            const newHints = items.map(item => this.convertItemToHint(item));
            this.hints.push(...newHints);
            this.emit('hintsUpdated', this.hints);
        } catch (error) {
            console.warn('Failed to process received items:', error);
        }
    }

    convertItemToHint(item) {
        const hintTypes = {
            normal: ['gender', 'affiliation', 'devil_fruit'],
            hard: ['bounty', 'height', 'arc'],
            filler: ['all']
        };

        try {
            const selectedType = this.getHintType();
            return {
                type: selectedType,
                value: item.item || 'Unknown',
                progression: Math.random() < 0.7
            };
        } catch (error) {
            console.warn('Failed to convert item to hint:', error);
            return {
                type: 'unknown',
                value: 'Error processing hint',
                progression: false
            };
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
            try {
                this.socket.close();
            } catch (error) {
                console.warn('Error closing socket:', error);
            }
            this.socket = null;
            this.connected = false;
            this.hints = [];
        }
    }
}

export const apClient = new FaustdleAPClient();