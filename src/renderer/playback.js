import { parseFile as getMetadata } from 'music-metadata';

import { basename, extname } from 'path';
import { union } from 'lodash';

import * as settings from '../settings.js';

import { createElement } from './renderer.js';
import { missingPicture, artistsRegex, toBase64, removeAllChildren } from './storage.js';

/** @typedef { import('./storage.js').Storage } Storage
*/

/**  @type { [ { url: string, index: number, title: string, artist: string, picture: string, element: HTMLDivElement } ] }
*/
let queue = [];

const queueCurrent = document.body.querySelector('.queue.card');

/**  @type { HTMLDivElement }
*/
const queueContainer = document.body.querySelector('.queue.tracks');

const playingBackground = document.body.querySelector('.playing.background');

let rewindTime = 0;
let forwardTime = 0;

let playingIndex = -1;

let seekTime = 0;
let currentVolume = 0;

/** @type { 'paused' | 'playing' }
*/
let playingMode = 'paused';

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

  // if there is a saved queue
  if (!loadQueue())
    clearQueue();

  // ADD if shuffled shuffle the queue indices
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
  if (time !== seekTime && queue.length > 0)
  {
    settings.set('seekTime', time);

    seekTime = time;

    return true;
  }
  
  return false;
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

    return true;
  }

  return false;
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

    return true;
  }

  return false;
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

    return true;
  }

  return false;
}

export function getPlayingMode()
{
  return playingMode;
}

/** @param { 'paused' | 'playing' } mode
*/
export function setPlayingMode(mode)
{
  if (mode !== playingMode && queue.length > 0)
  {
    playingMode = mode;

    return true;
  }

  return false;
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

    return true;
  }

  return false;
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

    return true;
  }

  return false;
}

/** @param { string } url
*/
function updateCurrentCard(index)
{
  queueCurrent.setAttribute('style', '');

  queueCurrent.querySelector('.cover').style.backgroundImage =
  playingBackground.style.backgroundImage = queue[index].picture;

  queueCurrent.querySelector('.artist').innerText =  queue[index].artist;
  queueCurrent.querySelector('.title').innerText = queue[index].title;
}

/** @param { Storage } storage
* @param { string } title
* @param { string } url
*/
function getTrackMetadata(storage, title, url)
{
  if (
    storage &&
    storage.tracks[title] &&
    storage.tracks[title].element.querySelector('.cover').style.backgroundImage
  )
  {
    return new Promise((resolve) =>
    {
      resolve({
        title: title,
        artist: storage.tracks[title].artists.join(', '),
        picture: storage.tracks[title].element.querySelector('.cover').style.backgroundImage
      });
    });
  }
  else
  {
    return getMetadata(url)
      .then(metadata =>
      {
        const title = metadata.common.title || basename(url, extname(url));
        let artists = metadata.common.artists || [ 'Unknown Artist' ];

        let picture;

        // split artists by comma
        artists = union(...[].concat(artists).map((v) => v.split(artistsRegex))).join(', ');

        if (metadata.common.picture && metadata.common.picture.length > 0)
          picture = `url(${toBase64(metadata.common.picture[0])})`;

        return { title: title, artist: artists, picture: picture };
      });
  }
}

/** @param { number } index
* @param { string } title
* @param { string } artist
*/
function appendQueueItem(index, title, artist)
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

  return queueContainer.appendChild(queueItem);
}

/** @param { Storage } storage
* @param { string } tracks
*/
export function queueStorageTracks(storage, ...tracks)
{
  for (let i = 0; i < tracks.length; i++)
  {
    const url = storage.tracks[tracks[i]].url;

    const exists = queue.find((obj) => obj.url === url);

    // if the same track already exists in the queue
    if (exists && tracks.length === 1)
    {
      resortQueue(exists.index);
    }
    else if (!exists)
    {
      getTrackMetadata(storage, tracks[i], url).then((obj) =>
      {
        queue.push({
          url: url,
          index: queue.length,
          title: obj.title,
          artist: obj.artist,
          picture: obj.picture,
          element: appendQueueItem(queue.length, obj.title, obj.artist)
        });
  
        if (playingIndex < 0)
          resortQueue(0);
        else if (tracks.length === 1)
          resortQueue(queue.length - 1);
        else
          resortQueue(playingIndex);

        saveQueue();
      });
    }
  }
}

/** @param { string[] } urls
*/
function queueTracks(...urls)
{
  for (let i = 0; i < urls.length; i++)
  {
    getTrackMetadata(undefined, undefined, urls[i]).then((obj) =>
    {
      queue.push({
        url: urls[i],
        index: queue.length,
        title: obj.title,
        artist: obj.artist,
        picture: obj.picture,
        element: appendQueueItem(queue.length, obj.title, obj.artist)
      });

      if (playingIndex < 0)
        resortQueue(0);
      else if (urls.length === 1)
        resortQueue(queue.length - 1);
      else
        resortQueue(playingIndex);

      saveQueue();
    });
  }
}

/** @param { string } fromIndex
*/
function resortQueue(fromIndex)
{
  const clearElement = queueContainer.querySelector('.clear');
  
  playingIndex = fromIndex;
  updateCurrentCard(fromIndex);

  if (clearElement)
    queueContainer.removeChild(clearElement);

  for (let i = 0; i < queue.length; i++)
  {
    if (playingIndex > i)
    {
      queue[i].element.querySelector('.index').innerText = -(playingIndex - i);

      if (!queue[i].element.classList.contains('played'))
        queue[i].element.classList.add('played');
    }
    else
    {
      queue[i].element.querySelector('.index').innerText = i - playingIndex;
      
      if (queue[i].element.classList.contains('played'))
        queue[i].element.classList.remove('played');
    }
  }
}

function clearQueue()
{
  // reset to the default picture
  const img = new Image();

  img.src = missingPicture;

  img.onload = () =>
  {
    queueCurrent.querySelector('.cover').style.backgroundImage =
    playingBackground.style.backgroundImage = `url(${img.src})`;
  };

  // end playback
  // TODO update playing mode and seek-time graphics to paused and 0
  playingMode = 'paused';
  seekTime = 0;
  playingIndex = -1;

  // empty queue array
  queue = [];

  // hide the current card
  queueCurrent.setAttribute('style', 'display: none;');

  // reset the queue list
  removeAllChildren(queueContainer);
  appendQueueItem('', 'Nothing is queued to play.', '').classList.add('played', 'clear');
}

function saveQueue()
{
  settings.set('playingIndex', playingIndex);
  settings.set('queueTracks', queue.map(item => item.url));
}

function loadQueue()
{
  const tracks = settings.get('queueTracks', []);

  if (tracks.length > 0)
  {
    queueTracks(...tracks);

    playingIndex = settings.get('playingIndex', -1);
    seekTime = settings.get('seekTime', 0);

    return true;
  }
}