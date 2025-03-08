import { apClient } from '../archipelago/client.js';

export class APConnection {
    constructor(container) {
        this.container = container;
        this.visible = false;
        this.createUI();
        this.setupHintsDisplay();
        this.setupEventListeners();
    }

    createUI() {
        const buttonContainer = document.createElement('div');
        buttonContainer.className = 'button-group';

        const connectButton = document.createElement('button');
        connectButton.id = 'archipelago-toggle';
        connectButton.className = 'btn btn-ap';
        connectButton.textContent = 'Connect to Archipelago';
        connectButton.onclick = () => this.toggleConnectionDialog();

        const testHintButton = document.createElement('button');
        testHintButton.id = 'ap-test-hint';
        testHintButton.className = 'btn btn-ap';
        testHintButton.textContent = 'Send Test Hint';
        testHintButton.onclick = () => apClient.sendTestHint();
        testHintButton.style.display = 'none';
        
        buttonContainer.appendChild(connectButton);
        buttonContainer.appendChild(testHintButton);
        
        const dialog = document.createElement('div');
        dialog.id = 'ap-connection-dialog';
        dialog.className = 'ap-dialog hidden';
        dialog.innerHTML = `
            <div class="ap-dialog-content">
                <h3>Connect to Archipelago</h3>
                <div class="input-group">
                    <input type="text" id="ap-address" placeholder="Server address" value="archipelago.gg">
                </div>
                <div class="input-group">
                    <input type="number" id="ap-port" placeholder="Port" value="38281">
                </div>
                <div class="input-group">
                    <input type="text" id="ap-slot" placeholder="Slot name">
                </div>
                <div class="input-group">
                    <input type="password" id="ap-password" placeholder="Password (optional)">
                </div>
                <div class="checkbox-group">
                    <label>
                        <input type="checkbox" id="ap-deathlink" checked>
                        Enable Death Link
                    </label>
                </div>
                <div id="ap-connection-status" class="ap-status hidden">
                    <p class="status-message"></p>
                </div>
                <div class="ap-buttons">
                    <button id="ap-connect" class="btn">Connect</button>
                    <button id="ap-cancel" class="btn btn-secondary">Cancel</button>
                </div>
            </div>
        `;

        const hintsContainer = document.createElement('div');
        hintsContainer.id = 'ap-hints-container';
        hintsContainer.className = 'ap-hints-container';
        hintsContainer.style.display = 'none';

        this.container.appendChild(dialog);
        this.container.appendChild(hintsContainer);

        // Insert the button container after the "Get character seed" button
        const seedGenerator = document.querySelector('.seed-generator .button-group');
        if (seedGenerator) {
            seedGenerator.appendChild(connectButton);
        }
    }

    setupHintsDisplay() {
        apClient.on('hintsUpdated', (hints) => {
            const container = document.getElementById('ap-hints-container');
            if (!container) return;

            container.innerHTML = '';
            if (hints.length > 0) {
                container.style.display = 'block';
                hints.forEach(hint => {
                    const hintElement = document.createElement('div');
                    hintElement.className = 'ap-hint';
                    if (hint.flags > 0) {
                        hintElement.classList.add('progression');
                    }
                    const player = apClient.players.get(hint.player?.toString());
                    const playerName = player?.name || 'Unknown Player';
                    hintElement.textContent = `Hint for ${playerName}: Location ${hint.location}`;
                    container.appendChild(hintElement);
                });
            }
        });

        apClient.on('death_link_received', ({ source }) => {
            this.showStatus(`Death Link received from ${source}! Game Over!`, 'error');
            // Trigger game over
            const event = new CustomEvent('death_link_triggered', {
                detail: { source }
            });
            document.dispatchEvent(event);
        });
    }

    setupEventListeners() {
        document.getElementById('ap-connect')?.addEventListener('click', () => this.handleConnect());
        document.getElementById('ap-cancel')?.addEventListener('click', () => this.toggleConnectionDialog());

        apClient.on('connected', () => {
            this.showStatus('Connected successfully!', 'success');
            const connectButton = document.getElementById('archipelago-toggle');
            const testHintButton = document.getElementById('ap-test-hint');
            if (connectButton) {
                connectButton.textContent = 'Connected to AP';
                connectButton.classList.add('connected');
            }
            if (testHintButton) {
                testHintButton.style.display = 'block';
            }
            setTimeout(() => {
                this.toggleConnectionDialog();
            }, 1500);
        });

        apClient.on('connection_error', (errors) => {
            const errorMessage = Array.isArray(errors) ? errors.join('\n') : 'Connection failed';
            this.showStatus(errorMessage, 'error');
        });

        apClient.on('connection_status', (message) => {
            this.showStatus(message, 'info');
        });

        apClient.on('server_error', (error) => {
            const errorMessage = error.text || 'Server error occurred';
            this.showStatus(errorMessage, 'error');
        });

        apClient.on('disconnected', () => {
            const connectButton = document.getElementById('archipelago-toggle');
            const testHintButton = document.getElementById('ap-test-hint');
            const hintsContainer = document.getElementById('ap-hints-container');
            if (connectButton) {
                connectButton.textContent = 'Connect to Archipelago';
                connectButton.classList.remove('connected');
            }
            if (testHintButton) {
                testHintButton.style.display = 'none';
            }
            if (hintsContainer) {
                hintsContainer.style.display = 'none';
            }
            this.showStatus('Disconnected from server', 'warning');
        });

        apClient.on('server_message', (message) => {
            this.showStatus(message, 'info');
        });
    }

    showStatus(message, type = 'info') {
        const statusContainer = document.getElementById('ap-connection-status');
        const statusMessage = statusContainer?.querySelector('.status-message');
        
        if (statusContainer && statusMessage) {
            statusContainer.className = 'ap-status';
            statusContainer.classList.add(type, 'visible');
            statusMessage.textContent = message;
        }
    }

    toggleConnectionDialog() {
        const dialog = document.getElementById('ap-connection-dialog');
        if (dialog) {
            this.visible = !this.visible;
            dialog.classList.toggle('hidden', !this.visible);
            
            if (!this.visible) {
                const statusContainer = document.getElementById('ap-connection-status');
                if (statusContainer) {
                    statusContainer.className = 'ap-status hidden';
                }
            }
        }
    }

    async handleConnect() {
        const address = document.getElementById('ap-address')?.value;
        const port = parseInt(document.getElementById('ap-port')?.value || '38281');
        const slot = document.getElementById('ap-slot')?.value;
        const password = document.getElementById('ap-password')?.value;
        const deathLink = document.getElementById('ap-deathlink')?.checked;

        if (!slot) {
            this.showStatus('Please enter a slot name', 'error');
            return;
        }

        this.showStatus('Connecting...', 'info');
        
        const event = new CustomEvent('ap-connect-request', {
            detail: { address, port, slot, password, deathLink }
        });
        document.dispatchEvent(event);
    }
}