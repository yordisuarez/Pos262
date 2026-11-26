const SOUND_ENABLED_STORAGE_KEY = 'pos_262_sound_enabled';

type WebkitAudioWindow = Window & {
  webkitAudioContext?: typeof AudioContext;
};

let sharedAudioContext: AudioContext | null = null;

export function getInitialSoundEnabled(): boolean {
  try {
    return localStorage.getItem(SOUND_ENABLED_STORAGE_KEY) !== 'false';
  } catch {
    return true;
  }
}

export function persistSoundEnabled(enabled: boolean): void {
  try {
    localStorage.setItem(SOUND_ENABLED_STORAGE_KEY, String(enabled));
  } catch {
    // Ignore storage errors (private mode / quota)
  }
}

function getOrCreateAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;

  try {
    if (sharedAudioContext && sharedAudioContext.state === 'closed') {
      sharedAudioContext = null;
    }
    if (sharedAudioContext) {
      return sharedAudioContext;
    }

    const AudioCtx =
      window.AudioContext || (window as WebkitAudioWindow).webkitAudioContext;
    if (typeof AudioCtx !== 'function') {
      return null;
    }

    sharedAudioContext = new AudioCtx();
    return sharedAudioContext;
  } catch {
    return null;
  }
}

function runWithAudioContext(callback: (ctx: AudioContext) => void): void {
  const ctx = getOrCreateAudioContext();
  if (!ctx) return;

  try {
    if (ctx.state === 'suspended') {
      void ctx
        .resume()
        .then(() => {
          if (ctx.state === 'running') {
            try {
              callback(ctx);
            } catch {
              // Ignore audio scheduling errors
            }
          }
        })
        .catch(() => {
          // Ignore autoplay/blocked audio errors
        });
      return;
    }

    if (ctx.state === 'running') {
      callback(ctx);
    }
  } catch {
    // Ignore blocked/unsupported audio errors
  }
}

export function primePosAudio(enabled = true): void {
  if (!enabled) return;
  const ctx = getOrCreateAudioContext();
  if (!ctx) return;

  try {
    if (ctx.state === 'suspended') {
      void ctx.resume().catch(() => {
        // Ignore blocked audio resume
      });
    }
  } catch {
    // Ignore audio context errors
  }
}

function scheduleTone(
  ctx: AudioContext,
  options: {
    type: OscillatorType;
    startFreq: number;
    endFreq?: number;
    freqRampDuration?: number;
    startTime: number;
    attackDuration: number;
    peakGain: number;
    endTime: number;
  }
): void {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();

  osc.type = options.type;
  osc.frequency.setValueAtTime(options.startFreq, options.startTime);
  if (options.endFreq !== undefined && options.freqRampDuration !== undefined) {
    osc.frequency.exponentialRampToValueAtTime(
      Math.max(20, options.endFreq),
      options.startTime + options.freqRampDuration
    );
  }

  gain.gain.setValueAtTime(0.0001, options.startTime);
  gain.gain.linearRampToValueAtTime(
    options.peakGain,
    options.startTime + options.attackDuration
  );
  gain.gain.exponentialRampToValueAtTime(0.0001, options.endTime);

  osc.connect(gain);
  gain.connect(ctx.destination);

  osc.onended = () => {
    try {
      osc.disconnect();
      gain.disconnect();
    } catch {
      // Ignore cleanup errors
    }
  };

  osc.start(options.startTime);
  osc.stop(options.endTime + 0.01);
}

/**
 * Soft, quick pop/blip feedback when adding a product to the cart.
 */
export function playAddToCartSound(enabled = true): void {
  if (!enabled) return;

  runWithAudioContext((ctx) => {
    const now = ctx.currentTime;

    scheduleTone(ctx, {
      type: 'sine',
      startFreq: 540,
      endFreq: 900,
      freqRampDuration: 0.045,
      startTime: now,
      attackDuration: 0.005,
      peakGain: 0.065,
      endTime: now + 0.085,
    });

    scheduleTone(ctx, {
      type: 'triangle',
      startFreq: 1080,
      endFreq: 1420,
      freqRampDuration: 0.035,
      startTime: now,
      attackDuration: 0.004,
      peakGain: 0.018,
      endTime: now + 0.06,
    });
  });
}

/**
 * Crisp cash-register-style chime/ding when confirming/completing a sale.
 */
export function playCashRegisterSound(enabled = true): void {
  if (!enabled) return;

  runWithAudioContext((ctx) => {
    const now = ctx.currentTime;

    // First bell strike (B5 + octave)
    scheduleTone(ctx, {
      type: 'sine',
      startFreq: 987.77,
      startTime: now,
      attackDuration: 0.004,
      peakGain: 0.06,
      endTime: now + 0.14,
    });
    scheduleTone(ctx, {
      type: 'sine',
      startFreq: 1975.53,
      startTime: now,
      attackDuration: 0.003,
      peakGain: 0.018,
      endTime: now + 0.09,
    });

    // Second bright register ding (E6 + bell harmonics)
    const secondStart = now + 0.068;
    scheduleTone(ctx, {
      type: 'sine',
      startFreq: 1318.51,
      startTime: secondStart,
      attackDuration: 0.004,
      peakGain: 0.085,
      endTime: secondStart + 0.42,
    });
    scheduleTone(ctx, {
      type: 'sine',
      startFreq: 2637.02,
      startTime: secondStart,
      attackDuration: 0.003,
      peakGain: 0.025,
      endTime: secondStart + 0.24,
    });
    scheduleTone(ctx, {
      type: 'sine',
      startFreq: 3951.07,
      startTime: secondStart,
      attackDuration: 0.003,
      peakGain: 0.009,
      endTime: secondStart + 0.14,
    });
  });
}
