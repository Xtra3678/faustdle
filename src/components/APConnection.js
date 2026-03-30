import { apClient } from '../archipelago/client.js';
import { gameConsole } from './Console.js';

/**
 * Manages the Archipelago connection UI and interactions
 * Handles connection dialog, status updates, and hint display
 */
export class APConnection {
    /**
     * Creates a new APConnection instance
     * @param {HTMLElement} container - Container element for AP connection UI
     */
    constructor(container) {
        this.container = container;
        this.visible = false;
        this.deathLinkState = false; // Store checkbox state separately
        this.deathLinkGroupState = ''; // Store group name separately
        this.createUI();
        this.setupHintsDisplay();
        this.setupEventListeners();
    }
 
    /**
     * Creates and initializes all UI elements for AP connection
     * Includes connection dialog, buttons, and hints container
     */
    createUI() {
        // Create Other button
        const otherButton = document.createElement('button');
        otherButton.id = 'other-toggle';
        otherButton.className = 'btn btn-other';
        otherButton.textContent = 'Other';
        otherButton.onclick = () => this.toggleOtherDialog();

        // Create main connection toggle button (now in Other dialog)
        const connectButton = document.createElement('button');
        connectButton.id = 'archipelago-toggle';
        connectButton.className = 'btn btn-ap';
        connectButton.textContent = 'Connect to Archipelago';
        connectButton.onclick = () => this.toggleConnectionDialog();

        // Create test hint button (hidden by default)
        
        // Create Other dialog
        const otherDialog = document.createElement('div');
        otherDialog.id = 'other-dialog';
        otherDialog.className = 'other-dialog hidden';
        otherDialog.innerHTML = `
            <div class="other-dialog-content">
                <h3>Other Options</h3>
                <div class="other-buttons">
                    <button id="faq-button" class="btn btn-faq">FAQ</button>
                    <button id="ap-connect-button" class="btn btn-ap">Connect to Archipelago</button>
                    <button id="generate-seed" class="btn btn-generate">Obtain seed for character</button>
                    <a href="https://discord.gg/339W2PB4gD" target="_blank" class="btn btn-discord">Join our Discord</a>
                    <button id="other-cancel" class="btn btn-secondary">Back</button>
                </div>
            </div>
        `;
        
        // Create connection dialog
        const dialog = document.createElement('div');
        dialog.id = 'ap-connection-dialog';
        dialog.className = 'ap-dialog hidden';
        
        // Create dialog content using DOM methods for better control
        const dialogContent = document.createElement('div');
        dialogContent.className = 'ap-dialog-content';
        
        // Title
        const title = document.createElement('h3');
        title.textContent = 'Connect to Archipelago';
        dialogContent.appendChild(title);
        
        // Address input
        const addressGroup = document.createElement('div');
        addressGroup.className = 'input-group';
        const addressInput = document.createElement('input');
        addressInput.type = 'text';
        addressInput.id = 'ap-address';
        addressInput.placeholder = 'Server address';
        addressInput.value = 'archipelago.gg';
        addressGroup.appendChild(addressInput);
        dialogContent.appendChild(addressGroup);
        
        // Port input
        const portGroup = document.createElement('div');
        portGroup.className = 'input-group';
        const portInput = document.createElement('input');
        portInput.type = 'number';
        portInput.id = 'ap-port';
        portInput.placeholder = 'Port';
        portInput.value = '';
        portGroup.appendChild(portInput);
        dialogContent.appendChild(portGroup);
        
        // Slot input
        const slotGroup = document.createElement('div');
        slotGroup.className = 'input-group';
        const slotInput = document.createElement('input');
        slotInput.type = 'text';
        slotInput.id = 'ap-slot';
        slotInput.placeholder = 'Slot name';
        slotGroup.appendChild(slotInput);
        dialogContent.appendChild(slotGroup);
        
        // Password input
        const passwordGroup = document.createElement('div');
        passwordGroup.className = 'input-group';
        const passwordInput = document.createElement('input');
        passwordInput.type = 'password';
        passwordInput.id = 'ap-password';
        passwordInput.placeholder = 'Password (optional)';
        passwordGroup.appendChild(passwordInput);
        dialogContent.appendChild(passwordGroup);
        
        // Death Link Checkbox - Created as real DOM element
        const checkboxGroup = document.createElement('div');
        checkboxGroup.className = 'checkbox-group';
        const label = document.createElement('label');
        label.style.display = 'flex';
        label.style.alignItems = 'center';
        label.style.gap = '8px';
        label.style.width = 'fit-content';
        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.id = 'ap-deathlink';
        const labelText = document.createTextNode('Enable Death Link');
        label.appendChild(labelText);
        label.appendChild(checkbox);
        checkboxGroup.appendChild(label);
        dialogContent.appendChild(checkboxGroup);
        
        // Add immediate listener to checkbox right after creation
        checkbox.addEventListener('change', (e) => {
            this.deathLinkState = e.target.checked; // Store state in instance variable
        });
        checkbox.addEventListener('click', (e) => {
            this.deathLinkState = e.target.checked; // Store state in instance variable
        });
        
        // Death Link Group input
        const groupGroup = document.createElement('div');
        groupGroup.className = 'input-group';
        const groupInput = document.createElement('input');
        groupInput.type = 'text';
        groupInput.id = 'ap-deathlink-group';
        groupInput.placeholder = 'Death Link Group (optional)';
        
        // Attach listeners to store group value in instance variable
        groupInput.addEventListener('input', (e) => {
            this.deathLinkGroupState = e.target.value;
        });
        groupInput.addEventListener('change', (e) => {
            this.deathLinkGroupState = e.target.value;
        });
        
        groupGroup.appendChild(groupInput);
        dialogContent.appendChild(groupGroup);
        
        // Status container
        const statusContainer = document.createElement('div');
        statusContainer.id = 'ap-connection-status';
        statusContainer.className = 'ap-status hidden';
        const statusMessage = document.createElement('p');
        statusMessage.className = 'status-message';
        statusContainer.appendChild(statusMessage);
        dialogContent.appendChild(statusContainer);
        
        // Buttons
        const buttonContainer = document.createElement('div');
        buttonContainer.className = 'ap-buttons';
        const connectBtn = document.createElement('button');
        connectBtn.id = 'ap-connect';
        connectBtn.className = 'btn';
        connectBtn.textContent = 'Connect';
        const cancelBtn = document.createElement('button');
        cancelBtn.id = 'ap-cancel';
        cancelBtn.className = 'btn btn-secondary';
        cancelBtn.textContent = 'Cancel';
        buttonContainer.appendChild(connectBtn);
        buttonContainer.appendChild(cancelBtn);
        dialogContent.appendChild(buttonContainer);
        
        dialog.appendChild(dialogContent);

        // Create hints container
        const hintsContainer = document.createElement('div');
        hintsContainer.id = 'ap-hints-container';
        hintsContainer.className = 'ap-hints-container';
        hintsContainer.style.display = 'none';

        // Find or create the button container
        const seedGenerator = document.querySelector('.seed-generator');
        if (seedGenerator) {
            let buttonGroup = seedGenerator.querySelector('.button-group');
            if (!buttonGroup) {
                buttonGroup = document.createElement('div');
                buttonGroup.className = 'button-group';
                seedGenerator.appendChild(buttonGroup);
            }
            buttonGroup.appendChild(otherButton);
        }

        this.container.appendChild(dialog);
        this.container.appendChild(otherDialog);
        this.container.appendChild(hintsContainer);
    }

    /**
     * Sets up the hints display system and death link handlers
     * Listens for hint updates and death link events from AP client
     */
    setupHintsDisplay() {
        // Handle hint updates
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

        // Handle death link events
        apClient.on('death_link_received', ({ source }) => {
            this.showStatus(`Death Link received from ${source}! Game Over!`, 'error');
            // Trigger game over event
            const event = new CustomEvent('death_link_triggered', {
                detail: { source }
            });
            document.dispatchEvent(event);
        });
    }

    /**
     * Sets up all event listeners for AP connection
     * Handles connection, disconnection, and status updates
     */
    setupEventListeners() {
        // Use event delegation to handle dynamically created buttons
        document.addEventListener('click', (e) => {
            if (e.target.id === 'ap-connect') {
                e.preventDefault();
                e.stopPropagation();
                this.handleConnect();
            } else if (e.target.id === 'ap-cancel') {
                e.preventDefault();
                e.stopPropagation();
                this.toggleConnectionDialog();
            } else if (e.target.id === 'other-cancel') {
                e.preventDefault();
                e.stopPropagation();
                this.toggleOtherDialog();
            } else if (e.target.id === 'ap-connect-button') {
                e.preventDefault();
                e.stopPropagation();
                this.toggleOtherDialog();
                this.toggleConnectionDialog();
            }
        });
        
        // Also try direct attachment with retry
        const attachListeners = () => {
            const connectBtn = document.getElementById('ap-connect');
            if (connectBtn && !connectBtn.hasListener) {
                console.log('[APConnection] Found ap-connect button, attaching direct listener');
                connectBtn.addEventListener('click', () => {
                    console.log('[APConnection] Connect button clicked directly');
                    this.handleConnect();
                });
                connectBtn.hasListener = true;
            } else if (connectBtn) {
                console.log('[APConnection] ap-connect button already has listener');
            } else {
                console.log('[APConnection] ap-connect button not found yet, retrying in 100ms');
                setTimeout(attachListeners, 100);
            }
        };
        attachListeners();

        // AP client event handlers
        apClient.on('connected', () => {
            this.showStatus('Connected successfully!', 'success');
            const otherButton = document.getElementById('other-toggle');
            if (otherButton) {
                otherButton.style.display = 'none';
            }
            
            // Hide non-AP game modes
            const dailyModeBtn = document.getElementById('daily-mode');
            const dailyCountdown = document.getElementById('daily-countdown');
            const seedSection = document.getElementById('seed-section');
            const streakModeBtn = document.getElementById('streak-mode');
            
            if (dailyModeBtn) dailyModeBtn.style.display = 'none';
            if (dailyCountdown) dailyCountdown.style.display = 'none';
            if (seedSection) seedSection.style.display = 'none';
            if (streakModeBtn) streakModeBtn.style.display = 'none';
            
            setTimeout(() => {
                this.toggleConnectionDialog();
            }, 1500);
        });

        apClient.on('connection_error', (errors) => {
            const errorMessage = Array.isArray(errors) ? errors.join('\n') : 'Connection failed';
            gameConsole.log(`Connection Error: ${errorMessage}`, 'error');
            this.showStatus(errorMessage, 'error');
        });

        apClient.on('connection_status', (message) => {
            gameConsole.log(message, 'info');
            this.showStatus(message, 'info');
        });

        apClient.on('server_error', (error) => {
            const errorMessage = error.text || 'Server error occurred';
            gameConsole.log(`Server Error: ${errorMessage}`, 'error');
            this.showStatus(errorMessage, 'error');
        });

        apClient.on('disconnected', () => {
            const otherButton = document.getElementById('other-toggle');
            const hintsContainer = document.getElementById('ap-hints-container');
            if (otherButton) {
                otherButton.style.display = 'block';
            }
            
            // Show non-AP game modes
            const dailyModeBtn = document.getElementById('daily-mode');
            const dailyCountdown = document.getElementById('daily-countdown');
            const seedSection = document.getElementById('seed-section');
            const streakModeBtn = document.getElementById('streak-mode');
            
            if (dailyModeBtn) dailyModeBtn.style.display = 'block';
            if (dailyCountdown) dailyCountdown.style.display = 'block';
            if (seedSection) seedSection.style.display = 'block';
            if (streakModeBtn) streakModeBtn.style.display = 'block';
            
            if (hintsContainer) {
                hintsContainer.style.display = 'none';
            }
            
            gameConsole.log('Disconnected from Archipelago', 'info');
            gameConsole.onAPDisconnect();
            this.showStatus('Disconnected from server', 'warning');
        });
        apClient.on('server_message', (message) => {
            // Log server messages to console (these can include room info, permissions, etc)
            // Pass directly to console - it handles all types (string, array, object)
            // Server messages already include timestamps, so don't add our own
            gameConsole.log(message, 'info', false);
            // Only show string messages in status bar, not arrays/objects
            if (typeof message === 'string') {
                this.showStatus(message, 'info');
            }
        });


    }

    /**
     * Shows a status message in the connection dialog
     * @param {string} message - Status message to display
     * @param {string} [type='info'] - Message type ('info', 'success', 'error', 'warning')
     */
    showStatus(message, type = 'info') {
        const statusContainer = document.getElementById('ap-connection-status');
        const statusMessage = statusContainer?.querySelector('.status-message');
        
        if (statusContainer && statusMessage) {
            statusContainer.className = 'ap-status';
            statusContainer.classList.add(type, 'visible');
            statusMessage.textContent = message;
        }
    }

    /**
     * Toggles the visibility of the connection dialog
     */
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

    /**
     * Toggles the visibility of the other dialog
     */
    toggleOtherDialog() {
        const dialog = document.getElementById('other-dialog');
        if (dialog) {
            dialog.classList.toggle('hidden');
        }
    }

    /**
     * Handles the connection attempt
     * Validates input and initiates connection to AP server
     */
    async handleConnect() {
        const addressInput = document.getElementById('ap-address');
        const portInput = document.getElementById('ap-port');
        const slotInput = document.getElementById('ap-slot');
        const passwordInput = document.getElementById('ap-password');
        
        const address = addressInput?.value || 'archipelago.gg';
        const port = parseInt(portInput?.value || '');
        const slot = slotInput?.value;
        const password = passwordInput?.value || '';
        const deathLink = this.deathLinkState;
        const deathLinkGroup = this.deathLinkGroupState;

        if (!slot || slot.trim() === '') {
            this.showStatus('Please enter a slot name', 'error');
            return;
        }

        this.showStatus('Connecting...', 'info');
        
        const event = new CustomEvent('ap-connect-request', {
            detail: { address, port, slot, password, deathLink, deathLinkGroup }
        });
        document.dispatchEvent(event);
    }
}