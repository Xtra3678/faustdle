import { EventEmitter } from 'events';
import { ArchipelagoClient } from 'archipelago.js';

class FaustdleAPClient extends EventEmitter {
    constructor() {
        super();
        this.client = null;
        this.connected = false;
        this.hints = [];
        this.gameMode = null;
    }

    async connect(address, port, slot, password = '') {
        try {
            this.client = new ArchipelagoClient();
            await this.client.connect({ hostname: address, port, game: 'Faustdle', name: slot, password });
            
            this.connected = true;
            this.setupListeners();
            this.emit('connected');
            return true;
        } catch (error) {
            console.error('Failed to connect:', error);
            this.emit('error', error);
            return false;
        }
    }

    disconnect() {
        if (this.client) {
            this.client.disconnect();
            this.client = null;
            this.connected = false;
            this.hints = [];
            this.emit('disconnected');
        }
    }

    setupListeners() {
        if (!this.client) return;

        this.client.addListener('ReceivedItems', (items) => {
            this.processReceivedItems(items);
        });

        this.client.addListener('RoomUpdate', (room) => {
            this.emit('roomUpdate', room);
        });
    }

    processReceivedItems(items) {
        const newHints = items.map(item => this.convertItemToHint(item));
        this.hints.push(...newHints);
        this.emit('hintsUpdated', this.hints);
    }

    convertItemToHint(item) {
        const hintTypes = {
            normal: ['gender', 'affiliation', 'devil_fruit', 'haki', 'origin'],
            hard: ['bounty', 'height', 'arc', 'status', 'occupation'],
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

    addListener(event, callback) {
        this.on(event, callback);
    }
}

export const apClient = new FaustdleAPClient();