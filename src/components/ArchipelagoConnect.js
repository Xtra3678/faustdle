export class ArchipelagoConnect {
    constructor(gameApp) {
        this.gameApp = gameApp;
        this.setupUI();
    }

    setupUI() {
        const archipelagoToggle = document.getElementById('archipelago-toggle');
        const apConnect = document.getElementById('ap-connect');
        const apBack = document.getElementById('ap-back');
        const deathLinkCheckbox = document.getElementById('ap-deathlink');

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

        if (deathLinkCheckbox) {
            deathLinkCheckbox.addEventListener('change', (e) => {
                this.gameApp.archipelagoClient.deathLink = e.target.checked;
            });
        }
    }

    async connect() {
        const address = document.getElementById('ap-address').value;
        const name = document.getElementById('ap-name').value;
        const password = document.getElementById('ap-password').value;
        const deathLink = document.getElementById('ap-deathlink')?.checked || false;

        const success = await this.gameApp.connectToArchipelago(address, name, password);
        
        if (success) {
            const statusDiv = document.getElementById('ap-status');
            if (statusDiv) {
                statusDiv.classList.remove('hidden');
                const message = statusDiv.querySelector('.status-message');
                if (message) {
                    message.textContent = 'Connected to Archipelago!';
                    message.classList.add('success');
                }
            }
            
            this.gameApp.archipelagoClient.deathLink = deathLink;
            
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