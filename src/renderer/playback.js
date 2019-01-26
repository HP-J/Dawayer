import { parseFile as getMetadata } from 'music-metadata';

import * as settings from '../settings.js';

import { createElement } from './renderer.js';
import { missingPicture, toBase64 } from './storage.js';

/**  @type { [ { url: string, index: string, element: HTMLDivElement } ] }
*/
let queue = [];

const queueCurrent = document.body.querySelector('.queue.card');

/**  @type { HTMLDivElement }
*/
const queueContainer = document.body.querySelector('.queue.tracks');

const playingBackground = document.body.querySelector('.playing.background');

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
  rewindTime = settings.get('rewindTime', 10);
  forwardTime = settings.get('forwardTime', 30);

  currentVolume = settings.get('currentVolume', 0.75);

  playingMode = settings.get('playingMode', 'paused');

  shuffleMode = settings.get('shuffleMode', 'shuffled');
  repeatMode = settings.get('repeatMode', 'looping');

  // ADD save and load seek-time and current queue
  emptyQueue();
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

  return true;
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

  return true;
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

  return true;
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

  return true;
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

  return true;
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

  return true;
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

  return true;
}

/** @param { string } url
* @param { string } artist
* @param { string } title
*/
function updateCurrent(url, artist, title)
{
  const img = new Image();

  img.src = missingPicture;

  img.onload = () =>
  {
    queueCurrent.querySelector('.cover').style.backgroundImage =
    playingBackground.style.backgroundImage = `url(${img.src})`;
  };

  queueCurrent.querySelector('.artist').innerText = artist;
  queueCurrent.querySelector('.title').innerText = title;

  if (url)
  {
    getMetadata(url)
      .then(metadata =>
      {
        if (metadata.common.picture && metadata.common.picture.length > 0)
          img.src = toBase64(metadata.common.picture[0]);
      });
  }
}

/** @param { number } index
* @param { string } artist
* @param { string } title
*/
function createQueueItem(index, artist, title)
{
  const queueItem = createElement('.queueItem.container');

  const indexElement = createElement('.queueItem.index');
  const artistElement = createElement('.queueItem.artist');
  const titleElement = createElement('.queueItem.title');

  queueItem.appendChild(indexElement);
  queueItem.appendChild(artistElement);
  queueItem.appendChild(titleElement);

  indexElement.innerText = index;
  artistElement.innerText = artist;
  titleElement.innerText = title;

  return queueItem;
}

function emptyQueue()
{
  queue = [];

  updateCurrent(undefined, 'the Queue', 'Is Empty');
  queueContainer.appendChild(createQueueItem('', '', 'Nothing else is queued.')).classList.add('played');
}