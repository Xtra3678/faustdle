export class APConnection {
    constructor(container) {
        this.container = container;
        this.visible = false;
        this.createUI();
    }

    createUI() {
        const button = document.createElement('button');
        button.id = 'ap-connect-button';
        button.className = 'btn btn-ap';
        button.textContent = 'Connect to Archipelago';
        button.onclick = () => this.toggleConnectionDialog();
        
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
                <div class="ap-buttons">
                    <button id="ap-connect" class="btn">Connect</button>
                    <button id="ap-cancel" class="btn btn-secondary">Cancel</button>
                </div>
            </div>
        `;

        this.container.appendChild(button);
        this.container.appendChild(dialog);

        this.setupEventListeners();
    }

    setupEventListeners() {
        document.getElementById('ap-connect').onclick = () => this.handleConnect();
        document.getElementById('ap-cancel').onclick = () => this.toggleConnectionDialog();
    }

    toggleConnectionDialog() {
        const dialog = document.getElementById('ap-connection-dialog');
        this.visible = !this.visible;
        dialog.classList.toggle('hidden', !this.visible);
    }

    async handleConnect() {
        const address = document.getElementById('ap-address').value;
        const port = parseInt(document.getElementById('ap-port').value);
        const slot = document.getElementById('ap-slot').value;
        const password = document.getElementById('ap-password').value;

        // Emit custom event for connection
        const event = new CustomEvent('ap-connect-request', {
            detail: { address, port, slot, password }
        });
        document.dispatchEvent(event);
    }
}