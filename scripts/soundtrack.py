#!/usr/bin/env python3
"""Procedural original stereo music and signal effects; no external samples required."""
import math, wave, sys
import numpy as np

RATE = 48000
DURATION = 24
n = RATE * DURATION
t = np.arange(n, dtype=np.float64) / RATE
left = np.zeros(n, dtype=np.float64)
right = np.zeros(n, dtype=np.float64)
rng = np.random.default_rng(917)

def add(signal, start, pan=0):
    i = int(start * RATE)
    if i >= n: return
    signal = signal[:n-i]
    left[i:i+len(signal)] += signal * math.sqrt((1-pan)/2)
    right[i:i+len(signal)] += signal * math.sqrt((1+pan)/2)

def tone(freq, duration, volume=.1, decay=1.2):
    x = np.arange(int(duration*RATE))/RATE
    env = (1-np.exp(-x*30))*np.exp(-x*decay)
    return volume*env*(np.sin(2*np.pi*freq*x)+.24*np.sin(2*np.pi*freq*2*x)+.1*np.sin(2*np.pi*freq*3*x))

# Warm, unobtrusive four-chord bed with an eighth-note pulse.
chords = [[110,138.59,164.81], [98,123.47,146.83], [87.31,110,130.81], [82.41,103.83,123.47]]
for bar in range(4):
    start = bar*6
    for j, f in enumerate(chords[bar]): add(tone(f, 6.4, .055, .25), start, [-.55, 0, .55][j])
    for beat in range(12):
        f = chords[bar][beat%3]* (2 if beat%4 else 4)
        add(tone(f, .62, .046, 4.2), start+beat*.5, -.35 if beat%2 else .35)
        # Rounded synthetic tick on each beat.
        x=np.arange(int(.075*RATE))/RATE
        tick=.022*np.exp(-x*75)*(np.sin(2*np.pi*720*x)+.35*rng.standard_normal(len(x)))
        add(tick,start+beat*.5, .2)

# Radio chirps, short synthesized packets and airy sweeps accent the story beats.
def chirp(start, f0, f1, duration, vol=.12, pan=0):
    x=np.arange(int(duration*RATE))/RATE
    phase=2*np.pi*(f0*x+(f1-f0)/(2*duration)*x*x)
    env=np.sin(np.pi*x/duration)**1.5
    add(vol*env*(np.sin(phase)+.15*np.sin(phase*2)),start,pan)
def sweep(start, duration, vol=.075, pan=0):
    x=np.arange(int(duration*RATE))/RATE
    noise=rng.standard_normal(len(x))
    # Moving, tonal air with high-frequency texture that remains audible on phones.
    airy=.3*noise+.7*np.sin(2*np.pi*(500*x+1300*x*x/duration))
    add(vol*np.sin(np.pi*x/duration)**2*airy,start,pan)

chirp(.12, 480, 850, .24, .08, -.25)
for at in [1.0, 2.0, 3.0, 4.0, 5.0]: chirp(at, 880, 1160, .09, .045, -.2)
sweep(5.65,.65,.055,.2)
for at in [6.25, 7.35, 8.45, 9.55, 10.65]: chirp(at, 550, 1000, .28, .075, .45)
sweep(11.65,.7,.06,-.1)
for at in [12.2,13.7,15.2,16.7]:
    chirp(at, 700, 1050, .13, .08, -.35);chirp(at+.17,1050,1400,.12,.06,.35)
sweep(17.65,.7,.06,.25)
for at in [18.3,19.1,19.9,20.7]: chirp(at,680,1200,.18,.075,-.5+(at-18.3)/2.4)
chirp(21.2,880,1320,.25,.10,.3);chirp(21.47,1108,1660,.45,.10,.3)
# Fade whole mix, gentle soft limiting, stereo 16-bit PCM.
fade=np.minimum(np.clip(t/.15,0,1),np.clip((DURATION-t)/1.0,0,1))
audio=np.stack([left,right],axis=1)*fade[:,None]
audio=np.tanh(audio*1.6)*.8
pcm=(np.clip(audio,-1,1)*32767).astype('<i2')
out=sys.argv[1] if len(sys.argv)>1 else 'output/soundtrack.wav'
with wave.open(out,'wb') as f:
    f.setnchannels(2);f.setsampwidth(2);f.setframerate(RATE);f.writeframes(pcm.tobytes())
print(f'Soundtrack -> {out}, {DURATION}s, peak {np.max(np.abs(audio)):.3f}')
