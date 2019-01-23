import * as settings from '../settings.js';

let rewindTime = 0;
let forwardTime = 0;

let seekTime = 0;
let currentVolume = 0;

/** @type { 'paused' | 'playing' }
*/
let playingMode;

/** @type { 'shuffled' | 'normal' }
*/
let shuffleMode;

/** @type { 'looping' | 'repeating' | 'once' }
*/
let repeatMode;

export function initPlayback()
{
  // ADD save and load seek-time and current queue
  // ADD when playing mode is set to playing after loading the saved queue, start playing the first track in said queue immediately,
  // then load the metadata for the tracks, when loading load the metadata for them, don't try to use a storage info since they might not exists for the wait might take too long

  rewindTime = settings.get('rewindTime', 10);
  forwardTime = settings.get('forwardTime', 30);

  currentVolume = settings.get('currentVolume', 0.75);

  playingMode = settings.get('playingMode', 'paused');

  shuffleMode = settings.get('shuffleMode', 'shuffled');
  repeatMode = settings.get('repeatMode', 'looping');
}

export function getSeekTime()
{
  return seekTime;
}

/** @param { number } time
*/
export function setSeekTime(time)
{
  seekTime = time;
}

export function getVolume()
{
  return currentVolume;
}

/** @param { number } volume
*/
export function setVolume(volume)
{
  if (volume !== currentVolume)
  {
    settings.set('currentVolume', volume);

    currentVolume = volume;
  }
}

export function getRewindTiming()
{
  return rewindTime;
}

/** @param { number } rewind
*/
export function setRewindTiming(rewind)
{
  if (rewind !== rewindTime)
  {
    rewindTime = rewind;

    settings.set('rewindTime', rewind);
  }
}

export function getForwardTiming()
{
  return forwardTime;
}

/** @param { number } forward
*/
export function setForwardTiming(forward)
{
  if (forward !== forwardTime)
  {
    forwardTime = forward;

    settings.set('forwardTime', forward);
  }
}

export function getPlayingMode()
{
  return playingMode;
}

/** @param { 'paused' | 'playing' } mode
*/
export function setPlayingMode(mode)
{
  if (mode !== playingMode)
  {
    playingMode = mode;

    settings.set('playingMode', mode);
  }
}

export function getShuffleMode()
{
  return shuffleMode;
}

/** @param { 'shuffled' | 'normal' } mode
*/
export function setShuffleMode(mode)
{
  if (mode !== shuffleMode)
  {
    shuffleMode = mode;

    settings.set('shuffleMode', mode);
  }
}

export function getRepeatMode()
{
  return repeatMode;
}

/** @param { 'looping' | 'repeating' | 'once' } mode
*/
export function setRepeatMode(mode)
{
  if (mode !== repeatMode)
  {
    repeatMode = mode;

    settings.set('repeatMode', mode);
  }
}
