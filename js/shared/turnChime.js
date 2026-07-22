/* ==================================================================================================
MODULE BOUNDARY: Shared Turn Chime
================================================================================================== */

// CURRENT STATE: Tiny, dependency-free audio cue used to alert a human player that it is their turn
// to act. Synthesizes a short two-tone chime with the Web Audio API so it works fully offline (no
// asset to fetch or precache) and stays consistent across the host table, remote table, and single
// (companion) views.
// TARGET STATE: Keep this module limited to "play a short cue sound" and simple mute-state storage.
// DO NOT PUT HERE: Turn-detection logic (who should hear the cue and when) — that stays with the
// callers in humanTurnController.js and its consumers.

const MUTE_STORAGE_KEY = "poker.turnChimeMuted";

// Low note then high note — kept intentionally simple so it reads as one clear "your turn" cue.
const CHIME_NOTES = [
	{ frequency: 587.33, offset: 0, duration: 0.14, gain: 0.35 },
	{ frequency: 880.0, offset: 0.11, duration: 0.22, gain: 0.4 },
];

let sharedAudioContext = null;

function getAudioContext() {
	const AudioContextClass = globalThis.AudioContext || globalThis.webkitAudioContext;
	if (!AudioContextClass) {
		return null;
	}
	if (!sharedAudioContext) {
		sharedAudioContext = new AudioContextClass();
	}
	return sharedAudioContext;
}

export function isTurnChimeMuted() {
	try {
		return globalThis.localStorage?.getItem(MUTE_STORAGE_KEY) === "true";
	} catch {
		return false;
	}
}

export function setTurnChimeMuted(muted) {
	try {
		globalThis.localStorage?.setItem(MUTE_STORAGE_KEY, muted ? "true" : "false");
	} catch {
		// Ignore storage failures (private browsing, disabled storage, etc.).
	}
}

function playTone(audioContext, { frequency, startTime, duration, gain, type = "triangle" }) {
	const oscillator = audioContext.createOscillator();
	const gainNode = audioContext.createGain();

	oscillator.type = type;
	oscillator.frequency.setValueAtTime(frequency, startTime);

	// Quick fade in/out to avoid audible clicks at the start/end of the tone.
	gainNode.gain.setValueAtTime(0, startTime);
	gainNode.gain.linearRampToValueAtTime(gain, startTime + 0.015);
	gainNode.gain.linearRampToValueAtTime(0, startTime + duration);

	oscillator.connect(gainNode);
	gainNode.connect(audioContext.destination);

	oscillator.start(startTime);
	oscillator.stop(startTime + duration + 0.02);
}

/**
 * Plays a short two-note chime (low, then high) to signal that it is now a human player's turn
 * to act. Safe to call liberally: it no-ops when muted or when Web Audio is unavailable.
 *
 * Notes are only scheduled once the AudioContext is confirmed running. Scheduling them against
 * a context that is still mid-`resume()` (e.g. on the very first call right after a user's first
 * page interaction) causes the earliest note(s) to be silently dropped, so the first cue of a
 * session can come out sounding like a single tone instead of the full two-note melody.
 */
export async function playTurnChime() {
	if (isTurnChimeMuted()) {
		return;
	}

	const audioContext = getAudioContext();
	if (!audioContext) {
		return;
	}

	if (audioContext.state === "suspended") {
		try {
			await audioContext.resume();
		} catch {
			// No user gesture has unlocked audio yet — skip this cue rather than play it broken.
			return;
		}
	}

	const now = audioContext.currentTime;
	CHIME_NOTES.forEach(({ frequency, offset, duration, gain }) => {
		playTone(audioContext, { frequency, startTime: now + offset, duration, gain });
	});
}
