import { default as GameApp } from './src/game/GameApp.js';

/**
 * Preload the high-resolution background image
 * Once loaded, swap from low-res to high-res version
 */
function preloadBackgroundImage() {
    const img = new Image();
    img.onload = () => {
        document.body.classList.add('bg-loaded');
    };
    img.src = 'bgfaustdle.png';
}

// Initialize the game when the DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    console.log('DOM fully loaded and parsed');
    const game = new GameApp();
    
    // Start loading high-res background in parallel (non-blocking)
    preloadBackgroundImage();
});