import { EventEmitter } from 'events';

class FaustdleAPClient extends EventEmitter {
    constructor() {
        super();
        this.socket = null;
        this.connected = false;
        this.hints = [];
        this.gameMode = null;
    }

    async connect(hostname, port, slot, password = '') {
        try {
            const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
            const wsUrl = `${protocol}//${hostname}:${port}`;
            
            this.socket = new WebSocket(wsUrl);
            
            this.socket.onopen = () => {
                console.log('WebSocket connected');
                this.sendConnect(slot, password);
            };
            
            this.socket.onmessage = (event) => {
                try {
                    const data = JSON.parse(event.data);
                    this.handleMessage(data);
                } catch (error) {
                    console.error('Failed to parse message:', error);
                }
            };
            
            this.socket.onerror = (error) => {
                console.error('WebSocket error:', error);
                this.emit('error', error);
            };
            
            this.socket.onclose = () => {
                console.log('WebSocket closed');
                this.connected = false;
                this.emit('disconnected');
            };
            
            return true;
        } catch (error) {
            console.error('Connection failed:', error);
            return false;
        }
    }

    sendConnect(slot, password) {
        const packet = {
            cmd: 'Connect',
            game: 'Faustdle',
            name: slot,
            password: password,
            uuid: crypto.randomUUID(),
            items_handling: 0,
            version: {
                major: 0,
                minor: 4,
                build: 2
            },
            tags: ['AP']
        };
        this.send(packet);
    }

    send(packet) {
        if (this.socket && this.socket.readyState === WebSocket.OPEN) {
            const message = JSON.stringify(packet);
            console.log('Sending:', message);
            this.socket.send(message);
        }
    }

    handleMessage(data) {
        console.log('Received:', data);
        if (typeof data === 'object' && data !== null) {
            switch (data.cmd) {
                case 'Connected':
                    this.connected = true;
                    this.emit('connected');
                    break;
                case 'ReceivedItems':
                    this.processReceivedItems(data.items);
                    break;
                case 'RoomUpdate':
                    this.emit('roomUpdate', data);
                    break;
            }
        }
    }

    processReceivedItems(items) {
        const newHints = items.map(item => this.convertItemToHint(item));
        this.hints.push(...newHints);
        this.emit('hintsUpdated', this.hints);
    }

    convertItemToHint(item) {
        const hintTypes = {
            normal: ['gender', 'affiliation', 'devil_fruit'],
            hard: ['bounty', 'height', 'arc'],
            filler: ['all']
        };

        const selectedType = this.getHintType();
        return {
            type: selectedType,
            value: item.item,
            progression: Math.random() < 0.7
        };
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
        return this.hints;
    }

    isConnected() {
        return this.connected;
    }

    disconnect() {
        if (this.socket) {
            this.socket.close();
            this.socket = null;
            this.connected = false;
            this.hints = [];
        }
    }
}

export const apClient = new FaustdleAPClient();