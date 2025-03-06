export class ArchipelagoConnect {
    constructor(gameApp) {
        this.gameApp = gameApp;
        this.setupUI();
    }

    setupUI() {
        const container = document.createElement('div');
        container.className = 'archipelago-connect';
        container.innerHTML = `
            <div class="ap-connection-form">
                <h2>Connect to Archipelago</h2>
                <div class="input-group">
                    <input type="text" id="ap-address" placeholder="Server address" value="archipelago.gg">
                    <input type="text" id="ap-name" placeholder="Player name">
                    <input type="password" id="ap-password" placeholder="Password (optional)">
                    <button id="ap-connect" class="btn">Connect</button>
                </div>
            </div>
        `;

        document.querySelector('.container').insertBefore(
            container, 
            document.getElementById('game-setup')
        );

        this.setupEventListeners();
    }

    setupEventListeners() {
        const connectButton = document.getElementById('ap-connect');
        connectButton.addEventListener('click', () => this.connect());
    }

    async connect() {
        const address = document.getElementById('ap-address').value;
        const name = document.getElementById('ap-address').value;
        const password = document.getElementById('ap-password').value;

        const success = await this.gameApp.connectToArchipelago(address, name, password);
        
        if (success) {
            document.querySelector('.ap-connection-form').innerHTML = 
                '<p class="success">Connected to Archipelago!</p>';
        } else {
            alert('Failed to connect to Archipelago server');
        }
    }
}