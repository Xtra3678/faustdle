import { ArchipelagoClient } from 'archipelago.js';

export class GameClient {
    constructor() {
        this.client = null;
        this.connected = false;
        this.deathLink = false;
    }

    async connect(address, name, password = '') {
        try {
            this.client = new ArchipelagoClient();
            
            await this.client.connect({
                hostname: address,
                port: 38281,
                game: 'Faustdle',
                name: name,
                password: password,
                tags: ['DeathLink'],
                version: {
                    major: 0,
                    minor: 4,
                    build: 2
                }
            });

            this.connected = true;
            this.setupListeners();
            return true;
        } catch (error) {
            console.error('Failed to connect:', error);
            return false;
        }
    }

    setupListeners() {
        this.client.addListener('RoomUpdate', (packet) => {
            if (packet.tags?.includes('DeathLink')) {
                this.deathLink = true;
            }
        });

        this.client.addListener('ReceivedItems', (packet) => {
            if (packet.type === 'DeathLink' && this.deathLink) {
                this.onDeathLinkReceived();
            }
        });
    }

    sendHint(difficulty) {
        if (!this.connected) return;

        const hintWeight = this.calculateHintWeight(difficulty);
        this.client.send({
            cmd: 'Hint',
            weight: hintWeight,
            found: true
        });
    }

    calculateHintWeight(difficulty) {
        switch(difficulty) {
            case 'E': return 1;
            case 'H': return 2;
            case 'F': return 3;
            default: return 1;
        }
    }

    sendDeathLink() {
        if (!this.connected || !this.deathLink) return;

        this.client.send({
            cmd: 'DeathLink',
            cause: 'Failed to guess character'
        });
    }

    onDeathLinkReceived() {
        // Trigger a death in the game
        document.dispatchEvent(new CustomEvent('apDeathLink'));
    }

    disconnect() {
        if (this.client) {
            this.client.disconnect();
            this.connected = false;
        }
    }
}