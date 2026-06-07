const CONFIG = {
    totalKeys: 88,
    startMidi: 21, // A0
    pixelsPerBeat: 100,
    noteHeight: 20, // Vertical resolution for grid
    bpm: 120,
};

const NOTES_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];

class PlayerPiano {
    constructor() {
        this.canvas = document.getElementById('piano-roll');
        this.ctx = this.canvas.getContext('2d');
        this.keysContainer = document.getElementById('piano-keys-container');
        
        this.isPlaying = false;
        this.isEditMode = document.getElementById('mode-toggle').checked;
        this.isDeleteMode = document.getElementById('delete-toggle').checked;
        this.currentTime = 0; // In beats
        this.song = {
            name: "My Song",
            timeSignature: "4/4",
            notes: [] // { midi, start, duration }
        };

        this.synth = new Tone.PolySynth(Tone.Synth).toDestination();
        this.activeMidis = new Set();

        this.scrollOffset = 0; // Vertical scroll in beats
        this.lastTime = 0;

        this.initKeys();
        this.initControls();
        this.initEventListeners();
        this.resize();
        this.loadSongList();

        window.addEventListener('resize', () => this.resize());
        requestAnimationFrame((t) => this.loop(t));
    }

    getMidiName(midi) {
        const name = NOTES_NAMES[midi % 12];
        const octave = Math.floor(midi / 12) - 1;
        return `${name}${octave}`;
    }

    isBlackKey(midi) {
        const n = midi % 12;
        return [1, 3, 6, 8, 10].includes(n);
    }

    initKeys() {
        this.keysContainer.innerHTML = '';
        for (let i = 0; i < CONFIG.totalKeys; i++) {
            const midi = CONFIG.startMidi + i;
            const key = document.createElement('div');
            key.className = `key ${this.isBlackKey(midi) ? 'black' : 'white'}`;
            key.dataset.midi = midi;
            this.keysContainer.appendChild(key);
        }
    }

    initControls() {
        document.getElementById('mode-toggle').addEventListener('change', (e) => {
            this.isEditMode = e.target.checked;
            if (!this.isEditMode) {
                this.canvas.style.cursor = 'default';
            }
        });

        document.getElementById('delete-toggle').addEventListener('change', (e) => {
            this.isDeleteMode = e.target.checked;
        });

        document.getElementById('play-pause').addEventListener('click', () => {
            this.togglePlay();
        });

        document.getElementById('stop').addEventListener('click', () => {
            this.stop();
        });

        document.getElementById('save-song').addEventListener('click', () => {
            this.saveSong();
        });

        document.getElementById('load-song').addEventListener('change', (e) => {
            if (e.target.value) this.loadSong(e.target.value);
        });

        document.getElementById('time-signature').addEventListener('change', (e) => {
            this.song.timeSignature = e.target.value;
        });

        document.getElementById('instrument-type').addEventListener('change', (e) => {
            this.setInstrument(e.target.value);
        });
    }

    setInstrument(type) {
        // Release any currently hanging notes
        this.activeMidis.forEach(midi => this.synth.triggerRelease(this.getMidiName(midi)));
        this.activeMidis.clear();
        this.synth.dispose();

        switch(type) {
            case 'raw-triangle':
                this.synth = new Tone.PolySynth(Tone.Synth, { 
                    oscillator: { type: 'triangle' },
                    envelope: { attack: 0.001, decay: 0, sustain: 1, release: 0.001 }
                }).toDestination();
                break;
            case 'triangle':
                this.synth = new Tone.PolySynth(Tone.Synth, { oscillator: { type: 'triangle' } }).toDestination();
                break;
            case 'square':
                this.synth = new Tone.PolySynth(Tone.Synth, { oscillator: { type: 'square' } }).toDestination();
                break;
            case 'sawtooth':
                this.synth = new Tone.PolySynth(Tone.Synth, { oscillator: { type: 'sawtooth' } }).toDestination();
                break;
            case 'fmsynth':
                this.synth = new Tone.PolySynth(Tone.FMSynth).toDestination();
                break;
            case 'amsynth':
                this.synth = new Tone.PolySynth(Tone.AMSynth).toDestination();
                break;
            default:
                this.synth = new Tone.PolySynth(Tone.Synth).toDestination();
                break;
        }
    }

    initEventListeners() {
        this.canvas.addEventListener('pointerdown', (e) => this.handlePointerDown(e));
        window.addEventListener('pointermove', (e) => this.handlePointerMove(e));
        window.addEventListener('pointerup', (e) => this.handlePointerUp(e));
        this.canvas.addEventListener('contextmenu', (e) => e.preventDefault());
        
        // Handle scrolling via mouse wheel
        this.canvas.addEventListener('wheel', (e) => {
            if (!this.isPlaying) {
                this.scrollOffset = Math.max(0, this.scrollOffset + e.deltaY * 0.01);
            }
            e.preventDefault();
        }, { passive: false });
    }

    resize() {
        this.canvas.width = this.canvas.clientWidth;
        this.canvas.height = this.canvas.clientHeight;
    }

    togglePlay() {
        if (!this.isPlaying) {
            Tone.start();
            this.isPlaying = true;
            document.getElementById('play-pause').textContent = 'Pause';
            this.lastTime = performance.now();
        } else {
            this.isPlaying = false;
            document.getElementById('play-pause').textContent = 'Play';
            this.activeMidis.forEach(midi => this.synth.triggerRelease(this.getMidiName(midi)));
            this.activeMidis.clear();
            this.updateKeyVisuals();
        }
    }

    stop() {
        this.isPlaying = false;
        this.currentTime = 0;
        this.scrollOffset = 0;
        document.getElementById('play-pause').textContent = 'Play';
        this.activeMidis.forEach(midi => this.synth.triggerRelease(this.getMidiName(midi)));
        this.activeMidis.clear();
        this.updateKeyVisuals();
    }

    getMousePos(e) {
        const rect = this.canvas.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        const colWidth = this.canvas.width / CONFIG.totalKeys;
        const midi = CONFIG.startMidi + Math.floor(x / colWidth);
        const beatsFromBottom = (this.canvas.height - y) / CONFIG.pixelsPerBeat;
        const beatTime = this.scrollOffset + beatsFromBottom;
        return { x, y, midi, beatTime };
    }

    handlePointerDown(e) {
        if (!this.isEditMode) return;
        const pos = this.getMousePos(e);

        // Check if clicked on a note
        const clickedNote = this.song.notes.find(n => {
            return n.midi === pos.midi && pos.beatTime >= n.start && pos.beatTime <= n.start + n.duration;
        });

        // Delete mode or right click
        if (this.isDeleteMode || e.button === 2) {
            if (clickedNote) {
                this.song.notes = this.song.notes.filter(n => n !== clickedNote);
            }
            return;
        }

        if (e.button === 0 || e.pointerType === 'touch') {
            if (clickedNote) {
                const progress = (pos.beatTime - clickedNote.start) / clickedNote.duration;
                let type = 'move';
                if (progress < 0.25) type = 'resize-bottom';
                else if (progress > 0.75) type = 'resize-top';

                this.dragState = {
                    note: clickedNote,
                    type: type,
                    startPos: pos,
                    originalStart: clickedNote.start,
                    originalDuration: clickedNote.duration,
                    originalEnd: clickedNote.start + clickedNote.duration,
                    originalMidi: clickedNote.midi
                };
            } else {
                // Background drag: setup potential scroll OR potential new note
                this.dragState = {
                    type: 'scroll',
                    startPos: pos,
                    originalScroll: this.scrollOffset,
                    potentialNewNote: {
                        midi: pos.midi,
                        start: Math.round(pos.beatTime * 4) / 4,
                        duration: 0.5
                    }
                };
            }
        }
    }

    handlePointerMove(e) {
        const pos = this.getMousePos(e);
        
        if (this.dragState && this.isEditMode) {
            const diff = pos.beatTime - this.dragState.startPos.beatTime;
            const note = this.dragState.note;

            if (this.dragState.type === 'move') {
                note.start = Math.max(0, Math.round((this.dragState.originalStart + diff) * 4) / 4);
                note.midi = pos.midi;
            } else if (this.dragState.type === 'resize-bottom') {
                const newStart = Math.min(this.dragState.originalEnd - 0.25, Math.max(0, Math.round((this.dragState.originalStart + diff) * 4) / 4));
                note.start = newStart;
                note.duration = this.dragState.originalEnd - newStart;
            } else if (this.dragState.type === 'resize-top') {
                const newEnd = Math.max(note.start + 0.25, Math.round((this.dragState.originalEnd + diff) * 4) / 4);
                note.duration = newEnd - note.start;
            } else if (this.dragState.type === 'scroll') {
                // Drag background to scroll
                const pixelDiff = e.clientY - (this.dragState.startPos.y + this.canvas.getBoundingClientRect().top);
                const beatDiff = pixelDiff / CONFIG.pixelsPerBeat;
                
                if (Math.abs(pixelDiff) > 10) {
                    this.scrollOffset = Math.max(0, this.dragState.originalScroll + beatDiff);
                    delete this.dragState.potentialNewNote;
                }
            }
        } else {
            // Hover cursor signaling (for mouse users)
            if (!this.isEditMode) return;

            const hoveredNote = this.song.notes.find(n => {
                return n.midi === pos.midi && pos.beatTime >= n.start && pos.beatTime <= n.start + n.duration;
            });

            if (hoveredNote) {
                const progress = (pos.beatTime - hoveredNote.start) / hoveredNote.duration;
                if (progress < 0.25 || progress > 0.75) {
                    this.canvas.style.cursor = 'ns-resize';
                } else {
                    this.canvas.style.cursor = 'move';
                }
            } else {
                this.canvas.style.cursor = 'crosshair';
            }
        }
    }

    handlePointerUp() {
        if (this.dragState && this.dragState.potentialNewNote) {
            this.song.notes.push(this.dragState.potentialNewNote);
        }
        this.dragState = null;
    }

    loop(t) {
        const dt = (t - this.lastTime) / 1000;
        this.lastTime = t;

        if (this.isPlaying) {
            const beatsPerSec = CONFIG.bpm / 60;
            this.currentTime += dt * beatsPerSec;
            this.scrollOffset = this.currentTime; // Auto-scroll

            // Auto-stop after last note
            if (this.song.notes.length > 0) {
                const lastNoteEnd = Math.max(...this.song.notes.map(n => n.start + n.duration));
                if (this.currentTime > lastNoteEnd + 1) { // 1 beat buffer
                    this.stop();
                }
            }
        }

        this.updateAudio();
        this.draw();
        this.updateKeyVisuals();

        requestAnimationFrame((t) => this.loop(t));
    }

    updateAudio() {
        if (!this.isPlaying) return;

        const currentMidis = new Set();
        this.song.notes.forEach(note => {
            if (this.currentTime >= note.start && this.currentTime <= note.start + note.duration) {
                currentMidis.add(note.midi);
            }
        });

        // Trigger new notes
        currentMidis.forEach(midi => {
            if (!this.activeMidis.has(midi)) {
                this.synth.triggerAttack(this.getMidiName(midi), Tone.now());
            }
        });

        // Release old notes
        this.activeMidis.forEach(midi => {
            if (!currentMidis.has(midi)) {
                this.synth.triggerRelease(this.getMidiName(midi), Tone.now());
            }
        });

        this.activeMidis = currentMidis;
    }

    updateKeyVisuals() {
        const keys = this.keysContainer.querySelectorAll('.key');
        keys.forEach(key => {
            const midi = parseInt(key.dataset.midi);
            if (this.activeMidis.has(midi)) {
                key.classList.add('active');
            } else {
                key.classList.remove('active');
            }
        });
    }

    draw() {
        const ctx = this.ctx;
        const w = this.canvas.width;
        const h = this.canvas.height;
        const colWidth = w / CONFIG.totalKeys;

        ctx.fillStyle = '#1a1a1a';
        ctx.fillRect(0, 0, w, h);

        // Draw Column Backgrounds (slightly darker for black keys)
        for (let i = 0; i < CONFIG.totalKeys; i++) {
            const midi = CONFIG.startMidi + i;
            if (this.isBlackKey(midi)) {
                ctx.fillStyle = '#111';
                ctx.fillRect(i * colWidth, 0, colWidth, h);
            }
        }

        // Draw Grid Lines (Beats)
        const [num, den] = this.song.timeSignature.split('/').map(Number);
        const startVisibleBeat = Math.floor(this.scrollOffset);
        const endVisibleBeat = startVisibleBeat + Math.ceil(h / CONFIG.pixelsPerBeat) + 1;

        ctx.lineWidth = 1;
        for (let b = startVisibleBeat; b <= endVisibleBeat; b++) {
            const y = h - (b - this.scrollOffset) * CONFIG.pixelsPerBeat;
            if (y < -10 || y > h + 10) continue;

            ctx.beginPath();
            if (b % num === 0) {
                ctx.strokeStyle = '#444'; // Measure line
                ctx.lineWidth = 2;
            } else {
                ctx.strokeStyle = '#2a2a2a'; // Beat line
                ctx.lineWidth = 1;
            }
            ctx.moveTo(0, y);
            ctx.lineTo(w, y);
            ctx.stroke();
        }

        // Draw Column Lines
        ctx.strokeStyle = '#222';
        ctx.lineWidth = 1;
        for (let i = 0; i < CONFIG.totalKeys; i++) {
            const x = i * colWidth;
            ctx.beginPath();
            ctx.moveTo(x, 0);
            ctx.lineTo(x, h);
            ctx.stroke();
        }

        // Draw Notes
        this.song.notes.forEach(note => {
            const x = (note.midi - CONFIG.startMidi) * colWidth;
            const noteYStart = h - (note.start - this.scrollOffset) * CONFIG.pixelsPerBeat;
            const noteYEnd = h - (note.start + note.duration - this.scrollOffset) * CONFIG.pixelsPerBeat;

            // Simple frustum culling
            if (noteYStart < 0 || noteYEnd > h) return;

            const isBlack = this.isBlackKey(note.midi);
            ctx.fillStyle = isBlack ? '#ff0055' : '#ff4d88';
            
            // Highlight if being dragged
            if (this.dragState && this.dragState.note === note) {
                ctx.fillStyle = '#ff80aa';
            }

            const padding = 1;
            ctx.fillRect(x + padding, noteYEnd, colWidth - padding * 2, noteYStart - noteYEnd);
            
            ctx.strokeStyle = 'white';
            ctx.lineWidth = 0.5;
            ctx.strokeRect(x + padding, noteYEnd, colWidth - padding * 2, noteYStart - noteYEnd);
        });

        // Playhead / Hit Line
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.8)';
        ctx.lineWidth = 2;
        ctx.setLineDash([5, 5]);
        ctx.beginPath();
        ctx.moveTo(0, h - 2);
        ctx.lineTo(w, h - 2);
        ctx.stroke();
        ctx.setLineDash([]);
    }


    saveSong() {
        const name = document.getElementById('song-name').value || "Untitled";
        this.song.name = name;
        const songs = JSON.parse(localStorage.getItem('piano-songs') || '{}');
        songs[name] = this.song;
        localStorage.setItem('piano-songs', JSON.stringify(songs));
        this.loadSongList();
        alert('Song saved!');
    }

    loadSongList() {
        const select = document.getElementById('load-song');
        const songs = JSON.parse(localStorage.getItem('piano-songs') || '{}');
        select.innerHTML = '<option value="">Load Song...</option>';
        Object.keys(songs).forEach(name => {
            const opt = document.createElement('option');
            opt.value = name;
            opt.textContent = name;
            select.appendChild(opt);
        });
    }

    loadSong(name) {
        const songs = JSON.parse(localStorage.getItem('piano-songs') || '{}');
        if (songs[name]) {
            this.song = songs[name];
            document.getElementById('song-name').value = this.song.name;
            document.getElementById('time-signature').value = this.song.timeSignature;
            this.stop();
        }
    }
}

// Start app
window.addEventListener('DOMContentLoaded', () => {
    new PlayerPiano();
});
