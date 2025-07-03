/**
 * Manages background music playbook for the Faustdle game using local audio files.
 */
export class MusicManager {
    constructor() {
        this.currentAudio = null;
        this.isPlaying = false;
        this.isMuted = false;
        this.volume = 30; // Default volume (30%)
        this.currentTrackIndex = 0;
        this.audioFiles = [
            '/audio/audio files/The Best Oden Shop in the World!.mp3',
            '/audio/audio files/Luffys Fierce Attack!.mp3',
            '/audio/audio files/Im Going to be the Pirate King!.mp3',
            '/audio/audio files/Luffy vs. Ratchet, Round 1.mp3',
            '/audio/audio files/Woonan and the Stone Storage Room.mp3',
            '/audio/audio files/The 3 Towers.mp3',
            '/audio/audio files/Rampage! Zoro and Franky.mp3',
            '/audio/audio files/Straw Hat Pirates, Initiate Counterattack!.mp3',
            '/audio/audio files/Gear Fourth.mp3',
            '/audio/audio files/My Peak.mp3',
            '/audio/audio files/One Piece Unlimited Cruise 1 - Title Menu.mp3',
            '/audio/audio files/Cornered.mp3',
            '/audio/audio files/Resort Island.mp3',
            '/audio/audio files/Baron Omatsuri Appears.mp3',
            '/audio/audio files/Run!.mp3',
            '/audio/audio files/Luffys Pace.mp3',
            '/audio/audio files/Desperate Situation.mp3',
            '/audio/audio files/Rubber Bazooka!!.mp3',
            '/audio/audio files/One Piece Odyssey OST - Generic Theme 4.mp3',
            '/audio/audio files/ONE PIECE WORLD SEEKER - Steel City.mp3',
            '/audio/audio files/Im Here With You Too.mp3',
            '/audio/audio files/ONE PIECE WORLD SEEKER - Sapphire Island.mp3',
            '/audio/audio files/One Piece Unlimited Cruise 1 - The Thousand Sunny.mp3',
            '/audio/audio files/To the Grand Line!.mp3',
            '/audio/audio files/A Serious Duel!.mp3',
            '/audio/audio files/One Piece Odyssey OST - Usopp Factory.mp3',
            '/audio/audio files/One Piece Odyssey OST - Camp Theme.mp3',
            '/audio/audio files/Luffy.mp3',
            '/audio/audio files/One Piece Pirate Warriors 4 OST - Germa 66.mp3',
            '/audio/audio files/One Piece Pirate Warriors 4 OST- Main Theme.mp3',
            '/audio/audio files/OVER THE TOP (instrumental).mp3',
            '/audio/audio files/One Piece Unlimited Cruise 1 - Cave Isle.mp3',
            '/audio/audio files/ONE PIECE WORLD SEEKER - Decisive Battle.mp3',
            '/audio/audio files/One Piece Dragon Dream Map theme extended.mp3'
        ];
        
        // Display names for tracks that have apostrophes removed from file names
        this.displayNames = {
            '/audio/audio files/Luffys Fierce Attack!.mp3': "Luffy's Fierce Attack!",
            '/audio/audio files/Im Going to be the Pirate King!.mp3': "I'm Going to be the Pirate King!",
            '/audio/audio files/Luffys Pace.mp3': "Luffy's Pace",
            '/audio/audio files/Im Here With You Too.mp3': "I'm Here With You Too"
        };
        
        // Easter egg tracks mapping
        this.easterEggTracks = {
            'slushbucket': '/audio/easter egg audio/slushbucket.mp3',
            'xtra3678': '/audio/easter egg audio/xtra3678.mp3',
            'boomdacow': '/audio/easter egg audio/boomdacow.mp3'
        };
        
        // Custom display names for easter egg tracks
        this.easterEggDisplayNames = {
            'slushbucket': 'Rosalina\'s Ice World MK8DXBCP',
            'xtra3678': 'The Amazing Digital Circus Theme',
            'boomdacow': 'the real shit'
        };
        
        // Special logo tracks
        this.specialLogoTracks = {
            'My Peak': 'gear5faustdle.png',
            'Gear Fourth': 'gear4faustdle.png'
        };
        
        this.shuffledPlaylist = [];
        this.playlistIndex = 0;
        this.isEnabled = this.getStoredPreference();
        this.isLooping = true;
        this.isShuffled = true; // Always use shuffle mode
        this.isEasterEggMode = false; // Track if we're in easter egg mode
        this.currentEasterEggTrack = null; // Current easter egg track
        this.isMinimized = this.getMinimizedPreference();
        this.isVisible = false; // Start hidden by default (for debug mode)
        this.alwaysPlaying = true; // New: always playing mode
        this.trackAnnouncementElement = null; // Track announcement UI element
        this.announcementTimeout = null; // Track announcement timeout
        this.isFirstSong = true; // Track if this is the first song on startup
        this.firstSongLoaded = false; // Track if first song has loaded
        this.firstSongStarted = false; // Track if first song has started playing
        this.pendingFirstSongAnnouncement = null; // Store first song announcement data
        this.audioLoadTimeout = null; // Timeout for audio loading
        this.currentLogoOverlay = null; // Track current logo overlay element
        this.logoOverlayTransition = null; // Track current logo overlay transition
        
        // Initialize shuffled playlist
        this.createShuffledPlaylist();
        
        // Load stored volume
        const storedVolume = localStorage.getItem('faustdle-music-volume');
        if (storedVolume) {
            this.volume = parseInt(storedVolume);
        }

        // Check if volume is 0 (muted)
        this.isMuted = this.volume === 0;
    }

    /**
     * Creates a shuffled playlist from all available tracks
     */
    createShuffledPlaylist() {
        // Create array of indices
        this.shuffledPlaylist = Array.from({ length: this.audioFiles.length }, (_, i) => i);
        
        // Fisher-Yates shuffle algorithm
        for (let i = this.shuffledPlaylist.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [this.shuffledPlaylist[i], this.shuffledPlaylist[j]] = [this.shuffledPlaylist[j], this.shuffledPlaylist[i]];
        }
        
        this.playlistIndex = 0;
        console.log('Created shuffled playlist with', this.shuffledPlaylist.length, 'tracks');
    }

    /**
     * Gets the current track index from the shuffled playlist
     */
    getCurrentTrackIndex() {
        if (this.isEasterEggMode) {
            return -1; // Special value for easter egg mode
        }
        return this.shuffledPlaylist[this.playlistIndex];
    }

    /**
     * Gets the current track filename for display
     */
    getCurrentTrackName() {
        if (this.isEasterEggMode && this.currentEasterEggTrack) {
            // Return the custom display name for easter egg tracks
            return this.easterEggDisplayNames[this.currentEasterEggTrack.toLowerCase()] || this.currentEasterEggTrack;
        }
        
        const trackIndex = this.getCurrentTrackIndex();
        const fullPath = this.audioFiles[trackIndex];
        
        // Check if this track has a custom display name
        if (this.displayNames[fullPath]) {
            return this.displayNames[fullPath];
        }
        
        // Otherwise use the filename without extension
        const filename = fullPath.split('/').pop().replace('.mp3', '');
        return filename;
    }

    /**
     * Handles logo overlay transitions for special tracks
     */
    handleLogoTransition(trackName) {
        const logoElement = document.querySelector('h1 img');
        if (!logoElement) {
            console.warn('Logo element not found');
            return;
        }

        // Check if this track requires a special logo
        const specialLogo = this.specialLogoTracks[trackName];
        
        if (specialLogo) {
            console.log(`Creating logo overlay for track: ${trackName}`);
            this.createLogoOverlay(logoElement, specialLogo);
            this.logoOverlayTransition = trackName;
        } else if (this.logoOverlayTransition) {
            // If we were showing a special logo but now playing a normal track, remove overlay
            console.log('Removing logo overlay');
            this.removeLogoOverlay();
            this.logoOverlayTransition = null;
        }
    }

    /**
     * Creates a logo overlay element that sits perfectly on top of the original logo
     */
    createLogoOverlay(logoElement, overlayImageSrc) {
        // Remove any existing overlay first
        this.removeLogoOverlay();

        // Get the logo container (h1 element)
        const logoContainer = logoElement.parentElement;
        if (!logoContainer) {
            console.warn('Logo container not found');
            return;
        }

        // Create overlay element
        this.currentLogoOverlay = document.createElement('img');
        this.currentLogoOverlay.src = overlayImageSrc;
        this.currentLogoOverlay.className = 'logo-overlay';
        this.currentLogoOverlay.alt = 'Special Logo';
        
        // Get the exact position and dimensions of the original logo
        const logoRect = logoElement.getBoundingClientRect();
        const containerRect = logoContainer.getBoundingClientRect();
        
        // Calculate the exact position relative to the container
        const relativeTop = logoRect.top - containerRect.top;
        const relativeLeft = logoRect.left - containerRect.left;
        
        // Position overlay exactly over the original logo using the exact computed dimensions
        this.currentLogoOverlay.style.position = 'absolute';
        this.currentLogoOverlay.style.top = relativeTop + 'px';
        this.currentLogoOverlay.style.left = relativeLeft + 'px';
        this.currentLogoOverlay.style.width = logoRect.width + 'px';
        this.currentLogoOverlay.style.height = logoRect.height + 'px';
        
        // Ensure perfect visual matching
        this.currentLogoOverlay.style.objectFit = 'contain';
        this.currentLogoOverlay.style.display = 'block';
        this.currentLogoOverlay.style.opacity = '0';
        this.currentLogoOverlay.style.transition = 'opacity 0.5s ease-in-out';
        this.currentLogoOverlay.style.zIndex = '10';
        this.currentLogoOverlay.style.pointerEvents = 'none'; // Allow clicks to pass through
        
        // Ensure the logo container has relative positioning for absolute positioning to work
        const containerStyle = getComputedStyle(logoContainer);
        if (containerStyle.position === 'static') {
            logoContainer.style.position = 'relative';
        }
        
        // Add overlay to the logo container
        logoContainer.appendChild(this.currentLogoOverlay);
        
        // Handle window resize to keep overlay aligned
        this.resizeHandler = () => {
            if (this.currentLogoOverlay && logoElement) {
                const newLogoRect = logoElement.getBoundingClientRect();
                const newContainerRect = logoContainer.getBoundingClientRect();
                const newRelativeTop = newLogoRect.top - newContainerRect.top;
                const newRelativeLeft = newLogoRect.left - newContainerRect.left;
                
                this.currentLogoOverlay.style.top = newRelativeTop + 'px';
                this.currentLogoOverlay.style.left = newRelativeLeft + 'px';
                this.currentLogoOverlay.style.width = newLogoRect.width + 'px';
                this.currentLogoOverlay.style.height = newLogoRect.height + 'px';
            }
        };
        
        window.addEventListener('resize', this.resizeHandler);
        
        // Force a reflow to ensure the element is rendered before starting animation
        this.currentLogoOverlay.offsetHeight;
        
        // Fade in the overlay
        requestAnimationFrame(() => {
            if (this.currentLogoOverlay) {
                this.currentLogoOverlay.style.opacity = '1';
            }
        });
    }

    /**
     * Removes the current logo overlay with fade out effect
     */
    removeLogoOverlay() {
        if (this.currentLogoOverlay) {
            console.log('Fading out logo overlay');
            
            // Remove resize handler
            if (this.resizeHandler) {
                window.removeEventListener('resize', this.resizeHandler);
                this.resizeHandler = null;
            }
            
            // Fade out the overlay
            this.currentLogoOverlay.style.opacity = '0';
            
            // Remove the element after fade out completes
            setTimeout(() => {
                if (this.currentLogoOverlay && this.currentLogoOverlay.parentNode) {
                    this.currentLogoOverlay.parentNode.removeChild(this.currentLogoOverlay);
                }
                this.currentLogoOverlay = null;
            }, 500); // Match transition duration
        }
    }

    /**
     * Removes logo overlay when special track ends
     */
    revertLogoToOriginal() {
        if (this.logoOverlayTransition) {
            console.log('Reverting logo overlay after special track ended');
            this.removeLogoOverlay();
            this.logoOverlayTransition = null;
        }
    }

    /**
     * Shows track announcement with Deltarune-style animation
     * Enhanced with multiple fallback strategies for first song
     */
    showTrackAnnouncement(trackName) {
        // Don't show announcement if music is disabled or muted
        if (!this.isEnabled || this.isMuted) return;

        // Clear any existing announcement timeout
        if (this.announcementTimeout) {
            clearTimeout(this.announcementTimeout);
        }

        // For first song, use multiple strategies to ensure it shows
        if (this.isFirstSong) {
            this.showFirstSongAnnouncement(trackName);
            return;
        }

        // For subsequent songs, show immediately with 2-second delay
        this.announcementTimeout = setTimeout(() => {
            this.displayTrackAnnouncement(trackName);
        }, 2000);
    }

    /**
     * Special handling for first song announcement with multiple fallback strategies
     */
    showFirstSongAnnouncement(trackName) {
        console.log('Setting up first song announcement for:', trackName);
        
        // Store the track name for the first song
        this.pendingFirstSongAnnouncement = trackName;
        
        // Strategy 1: Wait for audio to be fully loaded (canplaythrough event)
        // This is handled in handleAudioReady()
        
        // Strategy 2: Fallback timeout - if audio doesn't load within 8 seconds, show anyway
        if (this.audioLoadTimeout) {
            clearTimeout(this.audioLoadTimeout);
        }
        
        this.audioLoadTimeout = setTimeout(() => {
            console.log('Audio load timeout reached, showing first song announcement anyway');
            if (this.pendingFirstSongAnnouncement && !this.firstSongLoaded) {
                this.triggerFirstSongAnnouncement();
            }
        }, 8000); // 8 second timeout
        
        // Strategy 3: If audio starts playing before fully loaded, show announcement
        // This is handled in playCurrentTrack() when play() succeeds
    }

    /**
     * Triggers the first song announcement (called from multiple places for reliability)
     */
    triggerFirstSongAnnouncement() {
        if (!this.pendingFirstSongAnnouncement || this.firstSongLoaded) {
            return; // Already handled or no pending announcement
        }
        
        console.log('Triggering first song announcement:', this.pendingFirstSongAnnouncement);
        this.firstSongLoaded = true;
        
        // Clear the timeout since we're handling it now
        if (this.audioLoadTimeout) {
            clearTimeout(this.audioLoadTimeout);
            this.audioLoadTimeout = null;
        }
        
        // Show the announcement with 2-second delay
        this.announcementTimeout = setTimeout(() => {
            this.displayTrackAnnouncement(this.pendingFirstSongAnnouncement);
            this.pendingFirstSongAnnouncement = null;
        }, 2000);
    }

    /**
     * Actually displays the track announcement with animation
     * Fixed to ensure consistent fade-in effect
     */
    displayTrackAnnouncement(trackName) {
        // Double-check mute status right before showing
        if (!this.isEnabled || this.isMuted) return;

        const announcement = this.createTrackAnnouncementElement();
        announcement.textContent = `♪ ${trackName} ♪`;

        console.log('Displaying track announcement:', trackName);

        // CRITICAL: Force the element to be rendered in its initial state first
        // This ensures the CSS transition will work properly
        announcement.style.right = '-300px'; // Start position (off-screen)
        announcement.style.opacity = '0'; // Start opacity
        
        // Force a reflow to ensure the initial styles are applied
        announcement.offsetHeight;

        // Use a small delay to ensure the element is fully rendered before starting animation
        requestAnimationFrame(() => {
            requestAnimationFrame(() => {
                // Phase 1: Slide in from right and fade in (move from -300px to 2rem)
                announcement.style.right = '2rem';
                announcement.style.opacity = '1';

                // Phase 2: Stay in position for 5 seconds
                setTimeout(() => {
                    // Phase 3: Slide out to left and fade out (move from 2rem to calc(100vw - 2rem))
                    announcement.style.right = 'calc(100vw - 2rem)';
                    announcement.style.opacity = '0';

                    // Phase 4: Remove element after animation
                    setTimeout(() => {
                        if (announcement && announcement.parentNode) {
                            announcement.remove();
                        }
                    }, 800); // Match transition duration
                }, 5000); // Stay visible for 5 seconds
            });
        });
    }

    /**
     * Creates the track announcement UI element
     */
    createTrackAnnouncementElement() {
        if (this.trackAnnouncementElement) {
            this.trackAnnouncementElement.remove();
        }

        this.trackAnnouncementElement = document.createElement('div');
        this.trackAnnouncementElement.className = 'track-announcement';
        
        // Add special class for easter egg tracks to use gold outline
        if (this.isEasterEggMode) {
            this.trackAnnouncementElement.classList.add('easter-egg-track');
        }
        
        document.body.appendChild(this.trackAnnouncementElement);
        return this.trackAnnouncementElement;
    }

    /**
     * Creates the volume control for the Other menu
     */
    createVolumeControl() {
        // Remove existing volume control if it exists
        const existingControl = document.getElementById('music-volume-control');
        if (existingControl) {
            existingControl.remove();
        }

        const volumeControl = document.createElement('div');
        volumeControl.id = 'music-volume-control';
        volumeControl.className = 'music-volume-control';
        volumeControl.innerHTML = `
            <div class="volume-control-row">
                <span class="volume-label">🎵 Music Volume</span>
                <input type="range" id="music-volume-slider" class="volume-slider" 
                       min="0" max="100" value="${this.volume}">
                <span class="volume-value">${this.volume}%</span>
            </div>
        `;

        // Add event listener for volume changes
        const slider = volumeControl.querySelector('#music-volume-slider');
        const valueDisplay = volumeControl.querySelector('.volume-value');
        
        slider.addEventListener('input', (e) => {
            const newVolume = parseInt(e.target.value);
            this.setVolume(newVolume);
            valueDisplay.textContent = `${newVolume}%`;
        });

        return volumeControl;
    }

    /**
     * Adds volume control to the Other menu
     */
    addVolumeControlToOtherMenu() {
        const otherButtons = document.querySelector('.other-buttons');
        if (otherButtons) {
            const volumeControl = this.createVolumeControl();
            // Insert before the "Back" button
            const backButton = otherButtons.querySelector('#other-cancel');
            if (backButton) {
                otherButtons.insertBefore(volumeControl, backButton);
            } else {
                otherButtons.appendChild(volumeControl);
            }
        }
    }

    /**
     * Checks if a seed is the test seed to show music player
     * @param {string} seed - The seed to check
     * @returns {boolean} True if it's the test seed
     */
    isTestSeed(seed) {
        return seed.toLowerCase() === 'debugmusic';
    }

    /**
     * Shows the music player (for testing purposes)
     */
    showMusicPlayer() {
        this.isVisible = true;
        this.createMusicControls();
        console.log('Music player is now visible for testing');
        alert('Music player is now visible for testing!');
    }

    /**
     * Hides the music player
     */
    hideMusicPlayer() {
        this.isVisible = false;
        const controls = document.getElementById('music-controls');
        if (controls) {
            controls.remove();
        }
        console.log('Music player is now hidden');
    }

    /**
     * Checks if a seed is an easter egg track name
     * @param {string} seed - The seed to check
     * @returns {boolean} True if it's an easter egg track
     */
    isEasterEggSeed(seed) {
        return this.easterEggTracks.hasOwnProperty(seed.toLowerCase());
    }

    /**
     * Activates easter egg mode with a specific track
     * @param {string} trackName - Name of the easter egg track
     */
    activateEasterEggMode(trackName) {
        const lowerTrackName = trackName.toLowerCase();
        if (!this.easterEggTracks[lowerTrackName]) {
            console.warn('Easter egg track not found:', trackName);
            return false;
        }

        this.isEasterEggMode = true;
        this.currentEasterEggTrack = trackName;
        
        // Stop current music and start easter egg track
        this.stopMusic();
        this.playEasterEggTrack();
        
        // Update UI to reflect easter egg mode
        this.updateEasterEggUI();
        
        console.log('Activated easter egg mode with track:', trackName);
        return true;
    }

    /**
     * Deactivates easter egg mode and returns to normal playlist
     */
    deactivateEasterEggMode() {
        this.isEasterEggMode = false;
        this.currentEasterEggTrack = null;
        
        // Stop current music
        this.stopMusic();
        
        // Recreate normal UI if visible
        if (this.isVisible) {
            this.createMusicControls();
        }

        // Resume normal playback if enabled
        if (this.alwaysPlaying && this.isEnabled) {
            setTimeout(() => this.playCurrentTrack(), 500);
        }
        
        console.log('Deactivated easter egg mode');
    }

    /**
     * Plays the current easter egg track
     */
    async playEasterEggTrack() {
        if (!this.isEasterEggMode || !this.currentEasterEggTrack) return;

        try {
            this.createAudioElement();
            const trackPath = this.easterEggTracks[this.currentEasterEggTrack.toLowerCase()];
            this.currentAudio.src = trackPath;
            this.currentAudio.loop = true; // Loop the easter egg track
            
            await this.currentAudio.play();
            this.isPlaying = true;
            
            // Show track announcement - use custom display name
            const displayName = this.easterEggDisplayNames[this.currentEasterEggTrack.toLowerCase()] || this.currentEasterEggTrack;
            this.showTrackAnnouncement(displayName);
            
            // Update play/pause button if visible
            const playPauseButton = document.getElementById('play-pause');
            if (playPauseButton) {
                playPauseButton.innerHTML = '⏸️';
            }
            
        } catch (error) {
            console.error('Failed to play easter egg track:', error);
        }
    }

    /**
     * Updates the UI for easter egg mode
     */
    updateEasterEggUI() {
        // Only create controls if music player is visible
        if (!this.isVisible) return;
        
        // Recreate controls with easter egg styling
        this.createMusicControls();
        
        // Add special styling to indicate easter egg mode
        const controls = document.getElementById('music-controls');
        if (controls && !this.isMinimized) {
            controls.style.background = 'linear-gradient(135deg, rgba(255, 215, 0, 0.9) 0%, rgba(255, 193, 7, 0.95) 100%)';
            controls.style.border = '2px solid gold';
            controls.style.boxShadow = '0 0 20px rgba(255, 215, 0, 0.5)';
        }
    }

    /**
     * Gets the stored music preference from localStorage
     * @returns {boolean} Whether music is enabled
     */
    getStoredPreference() {
        const stored = localStorage.getItem('faustdle-music-enabled');
        return stored !== null ? JSON.parse(stored) : true; // Default to enabled
    }

    /**
     * Gets the stored minimized preference from localStorage
     * @returns {boolean} Whether music player is minimized
     */
    getMinimizedPreference() {
        const stored = localStorage.getItem('faustdle-music-minimized');
        return stored !== null ? JSON.parse(stored) : false; // Default to expanded
    }

    /**
     * Stores the music preference in localStorage
     * @param {boolean} enabled - Whether music should be enabled
     */
    setStoredPreference(enabled) {
        localStorage.setItem('faustdle-music-enabled', JSON.stringify(enabled));
        this.isEnabled = enabled;
    }

    /**
     * Stores the minimized preference in localStorage
     * @param {boolean} minimized - Whether music player should be minimized
     */
    setMinimizedPreference(minimized) {
        localStorage.setItem('faustdle-music-minimized', JSON.stringify(minimized));
        this.isMinimized = minimized;
    }

    /**
     * Initializes the music system and starts playing if enabled
     */
    async initialize() {
        console.log('Music system initialized');
        
        // Add volume control to Other menu
        this.addVolumeControlToOtherMenu();
        
        // Start playing music if enabled and in always-playing mode
        if (this.alwaysPlaying && this.isEnabled) {
            // Small delay to ensure page is loaded
            setTimeout(() => {
                this.playCurrentTrack();
            }, 1000);
        }
    }

    /**
     * Creates the music control UI elements (for debug mode)
     */
    createMusicControls() {
        // Don't create controls if not visible
        if (!this.isVisible) return;
        
        // Remove existing controls if they exist
        const existingControls = document.getElementById('music-controls');
        if (existingControls) {
            existingControls.remove();
        }

        // Create music controls container
        const controlsContainer = document.createElement('div');
        controlsContainer.id = 'music-controls';
        controlsContainer.className = `music-controls ${this.isMinimized ? 'minimized' : ''}`;
        
        if (this.isMinimized) {
            // Minimized state - just show the expand button
            const expandButton = document.createElement('button');
            expandButton.id = 'music-minimize';
            expandButton.className = 'btn btn-music-minimize';
            expandButton.innerHTML = this.isEasterEggMode ? '🎵' : '🎵';
            expandButton.title = 'Expand music player';
            expandButton.onclick = () => this.toggleMinimize();
            
            controlsContainer.appendChild(expandButton);
        } else {
            // Expanded state - show all controls
            
            // Control buttons row (including minimize button)
            const buttonRow = document.createElement('div');
            buttonRow.className = 'button-row';
            
            // Minimize button
            const minimizeButton = document.createElement('button');
            minimizeButton.id = 'music-minimize';
            minimizeButton.className = 'btn btn-music-small';
            minimizeButton.innerHTML = '−';
            minimizeButton.title = 'Minimize music player';
            minimizeButton.onclick = () => this.toggleMinimize();
            
            // Previous track button (disabled in easter egg mode)
            const prevButton = document.createElement('button');
            prevButton.id = 'prev-track';
            prevButton.className = 'btn btn-music-small';
            prevButton.innerHTML = '⏮️';
            prevButton.title = 'Previous track';
            prevButton.disabled = this.isEasterEggMode;
            prevButton.onclick = () => this.previousTrack();
            
            // Play/Pause button
            const playPauseButton = document.createElement('button');
            playPauseButton.id = 'play-pause';
            playPauseButton.className = 'btn btn-music-small';
            playPauseButton.innerHTML = this.isPlaying ? '⏸️' : '▶️';
            playPauseButton.title = 'Play/Pause';
            playPauseButton.onclick = () => this.togglePlayPause();
            
            // Next track button (disabled in easter egg mode)
            const nextButton = document.createElement('button');
            nextButton.id = 'next-track';
            nextButton.className = 'btn btn-music-small';
            nextButton.innerHTML = '⏭️';
            nextButton.title = 'Next track';
            nextButton.disabled = this.isEasterEggMode;
            nextButton.onclick = () => this.nextTrack();
            
            // Exit easter egg mode button (only shown in easter egg mode)
            if (this.isEasterEggMode) {
                const exitButton = document.createElement('button');
                exitButton.id = 'exit-easter-egg';
                exitButton.className = 'btn btn-music-small';
                exitButton.innerHTML = 'X';
                exitButton.title = 'Exit secret mode';
                exitButton.onclick = () => this.deactivateEasterEggMode();
                buttonRow.appendChild(exitButton);
            }
            
            // Volume control
            const volumeContainer = document.createElement('div');
            volumeContainer.className = 'volume-control';
            
            const volumeLabel = document.createElement('span');
            volumeLabel.textContent = '🔊';
            volumeLabel.className = 'volume-label';
            
            const volumeSlider = document.createElement('input');
            volumeSlider.type = 'range';
            volumeSlider.id = 'volume-slider';
            volumeSlider.min = '0';
            volumeSlider.max = '100';
            volumeSlider.value = this.volume;
            volumeSlider.className = 'volume-slider';
            volumeSlider.oninput = (e) => this.setVolume(parseInt(e.target.value));
            
            // Track info display
            const trackInfo = document.createElement('div');
            trackInfo.id = 'track-info';
            trackInfo.className = 'track-info';
            
            if (this.isEasterEggMode) {
                const displayName = this.easterEggDisplayNames[this.currentEasterEggTrack.toLowerCase()] || this.currentEasterEggTrack;
                trackInfo.textContent = `🎵 Playing: ${displayName}`;
            } else {
                trackInfo.textContent = this.isEnabled ? `🎵 ${this.audioFiles.length} tracks ready` : 'Music disabled';
            }
            
            // Assemble the UI
            buttonRow.appendChild(minimizeButton);
            buttonRow.appendChild(prevButton);
            buttonRow.appendChild(playPauseButton);
            buttonRow.appendChild(nextButton);
            
            volumeContainer.appendChild(volumeLabel);
            volumeContainer.appendChild(volumeSlider);
            
            controlsContainer.appendChild(buttonRow);
            controlsContainer.appendChild(volumeContainer);
            controlsContainer.appendChild(trackInfo);
        }
        
        // Add to page
        document.body.appendChild(controlsContainer);
    }

    /**
     * Toggles the minimize state of the music player
     */
    toggleMinimize() {
        this.isMinimized = !this.isMinimized;
        this.setMinimizedPreference(this.isMinimized);
        
        // Recreate the controls with the new state
        this.createMusicControls();
        
        // Reapply easter egg styling if needed
        if (this.isEasterEggMode && !this.isMinimized) {
            this.updateEasterEggUI();
        }
    }

    /**
     * Creates and configures an audio element
     */
    createAudioElement() {
        if (this.currentAudio) {
            this.currentAudio.pause();
            this.currentAudio.removeEventListener('ended', this.handleTrackEnd.bind(this));
            this.currentAudio.removeEventListener('error', this.handleAudioError.bind(this));
            this.currentAudio.removeEventListener('canplaythrough', this.handleAudioReady.bind(this));
        }

        this.currentAudio = new Audio();
        this.currentAudio.volume = this.volume / 100;
        this.currentAudio.preload = 'auto';
        this.currentAudio.crossOrigin = 'anonymous'; // Add CORS support
        
        // Add event listeners
        this.currentAudio.addEventListener('ended', this.handleTrackEnd.bind(this));
        this.currentAudio.addEventListener('error', this.handleAudioError.bind(this));
        this.currentAudio.addEventListener('canplaythrough', this.handleAudioReady.bind(this));
        this.currentAudio.addEventListener('loadstart', () => {
            this.updateTrackInfo('Loading...');
        });
        this.currentAudio.addEventListener('canplay', () => {
            if (this.isEasterEggMode) {
                const displayName = this.easterEggDisplayNames[this.currentEasterEggTrack.toLowerCase()] || this.currentEasterEggTrack;
                this.updateTrackInfo(`🎵 Playing: ${displayName}`);
            } else {
                const trackName = this.getCurrentTrackName();
                this.updateTrackInfo(`♪ ${trackName.substring(0, 30)}${trackName.length > 30 ? '...' : ''} ♪`);
            }
        });
        
        return this.currentAudio;
    }

    /**
     * Handles when audio is fully loaded and ready to play
     */
    handleAudioReady() {
        console.log('Audio is ready to play');
        
        // For first song, trigger announcement now that audio is loaded
        if (this.isFirstSong && this.pendingFirstSongAnnouncement) {
            console.log('First song loaded, triggering announcement');
            this.triggerFirstSongAnnouncement();
        }
    }

    /**
     * Handles when a track ends
     */
    handleTrackEnd() {
        // Revert logo when special track ends
        this.revertLogoToOriginal();
        
        if (this.isEasterEggMode) {
            // Easter egg tracks should loop automatically, but just in case
            this.playEasterEggTrack();
        } else if (this.isLooping && this.alwaysPlaying && this.isEnabled) {
            this.nextTrack();
        } else {
            this.stopMusic();
        }
    }

    /**
     * Handles audio loading errors
     */
    handleAudioError(event) {
        console.error('Audio error:', event);
        console.error('Audio error details:', {
            error: event.target?.error,
            src: event.target?.src,
            networkState: event.target?.networkState,
            readyState: event.target?.readyState
        });
        
        // Revert logo on error
        this.revertLogoToOriginal();
        
        if (this.isEasterEggMode) {
            this.updateTrackInfo('Easter egg error - exiting...');
            setTimeout(() => this.deactivateEasterEggMode(), 2000);
        } else if (this.alwaysPlaying && this.isEnabled) {
            this.updateTrackInfo('Error - trying next...');
            setTimeout(() => this.nextTrack(), 1000);
        }
    }

    /**
     * Sets the volume level
     * @param {number} volume - Volume level (0-100)
     */
    setVolume(volume) {
        this.volume = Math.max(0, Math.min(100, volume));
        this.isMuted = this.volume === 0;
        
        if (this.currentAudio) {
            this.currentAudio.volume = this.volume / 100;
        }
        
        localStorage.setItem('faustdle-music-volume', this.volume.toString());
        
        // Update volume control in Other menu if it exists
        const volumeSlider = document.getElementById('music-volume-slider');
        const volumeValue = document.querySelector('.volume-value');
        if (volumeSlider) {
            volumeSlider.value = this.volume;
        }
        if (volumeValue) {
            volumeValue.textContent = `${this.volume}%`;
        }

        // Clear any pending announcements if muted
        if (this.isMuted) {
            this.pendingFirstSongAnnouncement = null;
            if (this.announcementTimeout) {
                clearTimeout(this.announcementTimeout);
                this.announcementTimeout = null;
            }
            if (this.audioLoadTimeout) {
                clearTimeout(this.audioLoadTimeout);
                this.audioLoadTimeout = null;
            }
            // Remove any visible announcement
            if (this.trackAnnouncementElement) {
                this.trackAnnouncementElement.remove();
                this.trackAnnouncementElement = null;
            }
        }
    }

    /**
     * Stops the current music
     */
    stopMusic() {
        if (this.currentAudio) {
            this.currentAudio.pause();
            this.currentAudio.currentTime = 0;
        }
        
        this.isPlaying = false;
        
        // Revert logo when music stops
        this.revertLogoToOriginal();
        
        if (this.isEasterEggMode) {
            const displayName = this.easterEggDisplayNames[this.currentEasterEggTrack.toLowerCase()] || this.currentEasterEggTrack;
            this.updateTrackInfo(`🎵 ${displayName} stopped`);
        } else {
            this.updateTrackInfo('Stopped');
        }
        
        // Update play/pause button
        const playPauseButton = document.getElementById('play-pause');
        if (playPauseButton) {
            playPauseButton.innerHTML = '▶️';
        }

        // Clear any pending announcements
        if (this.announcementTimeout) {
            clearTimeout(this.announcementTimeout);
            this.announcementTimeout = null;
        }
        if (this.audioLoadTimeout) {
            clearTimeout(this.audioLoadTimeout);
            this.audioLoadTimeout = null;
        }
        this.pendingFirstSongAnnouncement = null;
    }

    /**
     * Updates the track info display
     * @param {string} info - Information to display
     */
    updateTrackInfo(info) {
        const trackInfo = document.getElementById('track-info');
        if (trackInfo) {
            trackInfo.textContent = info;
        }
        console.log('Track info:', info);
    }

    /**
     * Skips to the next track in the shuffled playlist (disabled in easter egg mode)
     */
    nextTrack() {
        if (this.isEasterEggMode) return;
        
        // Revert logo before changing tracks
        this.revertLogoToOriginal();
        
        // Move to next track in shuffled playlist
        this.playlistIndex = (this.playlistIndex + 1) % this.shuffledPlaylist.length;
        
        // If we've reached the end of the playlist, create a new shuffle
        if (this.playlistIndex === 0) {
            this.createShuffledPlaylist();
            console.log('Reshuffled playlist for continuous playback');
        }
        
        // Reset first song flag for subsequent tracks
        this.isFirstSong = false;
        
        // If we were playing or in always-playing mode, start the new track
        if (this.isPlaying || (this.alwaysPlaying && this.isEnabled)) {
            this.playCurrentTrack();
        } else {
            const trackName = this.getCurrentTrackName();
            this.updateTrackInfo(`Next: ${trackName.substring(0, 25)}${trackName.length > 25 ? '...' : ''}`);
        }
    }

    /**
     * Goes to the previous track in the shuffled playlist (disabled in easter egg mode)
     */
    previousTrack() {
        if (this.isEasterEggMode) return;
        
        // Revert logo before changing tracks
        this.revertLogoToOriginal();
        
        // Move to previous track in shuffled playlist
        this.playlistIndex = (this.playlistIndex - 1 + this.shuffledPlaylist.length) % this.shuffledPlaylist.length;
        
        // Reset first song flag for subsequent tracks
        this.isFirstSong = false;
        
        // If we were playing or in always-playing mode, start the new track
        if (this.isPlaying || (this.alwaysPlaying && this.isEnabled)) {
            this.playCurrentTrack();
        } else {
            const trackName = this.getCurrentTrackName();
            this.updateTrackInfo(`Prev: ${trackName.substring(0, 25)}${trackName.length > 25 ? '...' : ''}`);
        }
    }

    /**
     * Plays the current track from the shuffled playlist
     */
    async playCurrentTrack() {
        if (!this.isEnabled) return;

        if (this.isEasterEggMode) {
            await this.playEasterEggTrack();
            return;
        }
        
        try {
            this.createAudioElement();
            const trackIndex = this.getCurrentTrackIndex();
            this.currentAudio.src = this.audioFiles[trackIndex];
            
            this.updateTrackInfo('Loading...');
            
            // Set up announcement and logo transition
            const trackName = this.getCurrentTrackName();
            this.showTrackAnnouncement(trackName);
            this.handleLogoTransition(trackName);
            
            await this.currentAudio.play();
            this.isPlaying = true;
            this.firstSongStarted = true;
            
            // For first song, if announcement hasn't been triggered yet, trigger it now
            if (this.isFirstSong && this.pendingFirstSongAnnouncement && !this.firstSongLoaded) {
                console.log('First song started playing, triggering announcement');
                this.triggerFirstSongAnnouncement();
            }
            
            // Update play/pause button
            const playPauseButton = document.getElementById('play-pause');
            if (playPauseButton) {
                playPauseButton.innerHTML = '⏸️';
            }
            
        } catch (error) {
            console.error('Failed to play track:', error);
            console.error('Track details:', {
                trackIndex: this.getCurrentTrackIndex(),
                src: this.audioFiles[this.getCurrentTrackIndex()],
                error: error.message
            });
            this.updateTrackInfo('Failed - trying next...');
            if (this.alwaysPlaying && this.isEnabled) {
                setTimeout(() => this.nextTrack(), 1000);
            }
        }
    }

    /**
     * Toggles play/pause
     */
    async togglePlayPause() {
        const playPauseButton = document.getElementById('play-pause');
        
        try {
            if (this.isPlaying && this.currentAudio) {
                // Currently playing, so pause
                this.currentAudio.pause();
                this.isPlaying = false;
                playPauseButton.innerHTML = '▶️';
                
                if (this.isEasterEggMode) {
                    const displayName = this.easterEggDisplayNames[this.currentEasterEggTrack.toLowerCase()] || this.currentEasterEggTrack;
                    this.updateTrackInfo(`🎵 ${displayName} paused`);
                } else {
                    this.updateTrackInfo('Paused');
                }
            } else {
                // Not playing, so start
                if (this.isEasterEggMode) {
                    await this.playEasterEggTrack();
                } else {
                    const trackIndex = this.getCurrentTrackIndex();
                    if (!this.currentAudio || this.currentAudio.src !== this.audioFiles[trackIndex]) {
                        await this.playCurrentTrack();
                    } else {
                        // Resume existing track
                        await this.currentAudio.play();
                        this.isPlaying = true;
                        playPauseButton.innerHTML = '⏸️';
                        const trackName = this.getCurrentTrackName();
                        this.updateTrackInfo(`♪ ${trackName.substring(0, 30)}${trackName.length > 30 ? '...' : ''} ♪`);
                        // Handle logo transition for resumed track
                        this.handleLogoTransition(trackName);
                    }
                }
            }
        } catch (error) {
            console.error('Failed to toggle play/pause:', error);
            this.updateTrackInfo('Error - try again');
        }
    }

    /**
     * Cleans up the music manager
     */
    destroy() {
        this.stopMusic();
        
        // Clean up audio element
        if (this.currentAudio) {
            this.currentAudio.removeEventListener('ended', this.handleTrackEnd.bind(this));
            this.currentAudio.removeEventListener('error', this.handleAudioError.bind(this));
            this.currentAudio.removeEventListener('canplaythrough', this.handleAudioReady.bind(this));
            this.currentAudio = null;
        }
        
        // Remove controls
        const controls = document.getElementById('music-controls');
        if (controls) {
            controls.remove();
        }

        // Remove track announcement
        if (this.trackAnnouncementElement) {
            this.trackAnnouncementElement.remove();
        }

        // Remove volume control
        const volumeControl = document.getElementById('music-volume-control');
        if (volumeControl) {
            volumeControl.remove();
        }

        // Clear timeouts
        if (this.announcementTimeout) {
            clearTimeout(this.announcementTimeout);
        }
        if (this.audioLoadTimeout) {
            clearTimeout(this.audioLoadTimeout);
        }
        
        // Remove logo overlay
        this.removeLogoOverlay();
    }
}