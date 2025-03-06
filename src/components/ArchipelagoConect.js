export class ArchipelagoConnect {
    constructor(gameApp) {
        this.gameApp = gameApp;
        this.setupEventListeners();
    }

    setupEventListeners() {
        const archipelagoToggle = document.getElementById('archipelago-toggle');
        const apConnect = document.getElementById('ap-connect');
        const apBack = document.getElementById('ap-back');

        if (archipelagoToggle) {
            archipelagoToggle.addEventListener('click', () => {
                document.getElementById('game-setup').classList.add('hidden');
                document.getElementById('archipelago-setup').classList.remove('hidden');
            });
        }

        if (apConnect) {
            apConnect.addEventListener('click', () => this.connect());
        }

        if (apBack) {
            apBack.addEventListener('click', () => {
                document.getElementById('archipelago-setup').classList.add('hidden');
                document.getElementById('game-setup').classList.remove('hidden');
            });
        }
    }

    async connect() {
        const address = document.getElementById('ap-address').value;
        const name = document.getElementById('ap-name').value;
        const password = document.getElementById('ap-password').value;

        const success = await this.gameApp.connectToArchipelago(address, name, password);
        
        if (success) {
            const statusDiv = document.getElementById('ap-status');
            statusDiv.classList.remove('hidden');
            statusDiv.querySelector('.status-message').textContent = 'Connected to Archipelago!';
            statusDiv.querySelector('.status-message').classList.add('success');
            
            // Return to game setup after successful connection
            setTimeout(() => {
                document.getElementById('archipelago-setup').classList.add('hidden');
                document.getElementById('game-setup').classList.remove('hidden');
            }, 1500);
        } else {
            alert('Failed to connect to Archipelago server');
        }
    }
}