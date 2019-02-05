import { parseFile as getMetadata } from 'music-metadata';

import { Howl, Howler as howler } from 'howler';

import { basename, extname } from 'path';
import { union } from 'lodash';

import * as settings from '../settings.js';

import { createElement, seekTimeControl, switchPlayingMode } from './renderer.js';
import { missingPicture, artistsRegex, toBase64, removeAllChildren } from './storage.js';

/** @typedef { import('./storage.js').Storage } Storage
*/

/**  @type { [ { url: string, index: number, title: string, artist: string, picture: string, duration: number, element: HTMLDivElement } ] }
*/
let queue = [];

const seekBarPlayed = document.body.querySelector('.seekBar.played');

const queueCurrentElement = document.body.querySelector('.queue.card');

/**  @type { HTMLDivElement }
*/
const queueContainer = document.body.querySelector('.queue.tracks');

const playingBackground = document.body.querySelector('.playing.background');

let rewindTime = 0;
let forwardTime = 0;

let currentHowl;
let playingIndex = -1;

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

  howler.volume(settings.get('currentVolume', 0.75));

  // if there is a saved queue
  // TODO load a saved queue
  // if (!loadQueue())
  clearQueue();

  // ADD if shuffled shuffle the queue indices
  shuffleMode = settings.get('shuffleMode', 'shuffled');
  repeatMode = settings.get('repeatMode', 'looping');
}

export function getDuration()
{
  if (playingIndex > -1)
    return queue[playingIndex].duration;
  else
    return -1;
}

export function getSeekTime()
{
  if (playingIndex > -1)
    return currentHowl.seek();
  else
    return 0;
}

/** @param { number } index
*/
export function setPlayingIndex(index)
{
  playingIndex = index;
}

/** @param { number } time
* @param { boolean } visual
*/
export function setSeekTime(time, visual)
{
  if (playingIndex > -1)
  {
    // TODO save seekTime
    // settings.set('seekTime', time);

    if (!visual)
    {
      currentHowl.seek(time);

      currentHowl.seekTimeProgress = time * 1000;
    }

    return true;
  }
  
  return false;
}

export function getVolume()
{
  return howler.volume();
}

/** @param { number } volume
*/
export function setVolume(volume)
{
  if (volume !== howler.volume())
  {
    settings.set('currentVolume', volume);

    howler.volume(volume);

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

// TEST all the (if) cases included in the function
/** @param { 'paused' | 'playing' } mode
*/
export function setPlayingMode(mode)
{
  if (mode !== playingMode && playingIndex > -1)
  {
    playingMode = mode;

    if (playingMode === 'paused')
    {
      currentHowl.pause();
    }
    else
    {
      // if the current howl url doesn't match the playing-index track url
      // restart playback to the playingIndex
      // TODO might need to be changed when implementing the looping system
      if (queue[playingIndex].url !== currentHowl.url)
        changeQueue();
      else
        currentHowl.play();
    }
      
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
  queueCurrentElement.setAttribute('style', '');

  queueCurrentElement.querySelector('.cover').style.backgroundImage =
  playingBackground.style.backgroundImage = queue[index].picture;

  queueCurrentElement.querySelector('.artist').innerText =  queue[index].artist;
  queueCurrentElement.querySelector('.title').innerText = queue[index].title;
}

/** @param { Storage } storage
* @param { string } title
* @param { string } url
* @returns { Promise<{ title: string, artist: string, picture: string, duration: number }> }
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
        picture: storage.tracks[title].element.querySelector('.cover').style.backgroundImage,
        duration: storage.tracks[title].duration
      });
    });
  }
  else
  {
    return getMetadata(url, { duration: true })
      .then(metadata =>
      {
        const title = metadata.common.title || basename(url, extname(url));
        let artists = metadata.common.artists || [ 'Unknown Artist' ];

        let picture;

        // split artists by comma
        artists = union(...[].concat(artists).map((v) => v.split(artistsRegex))).join(', ');

        if (metadata.common.picture && metadata.common.picture.length > 0)
          picture = `url(${toBase64(metadata.common.picture[0])})`;

        return {
          title: title,
          artist: artists,
          picture: picture,
          duration: metadata.format.duration
        };
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
  const promises = [];

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
      promises.push(getTrackMetadata(storage, tracks[i], url).then((obj) =>
      {
        queue.push({
          url: url,
          index: queue.length,
          title: obj.title,
          artist: obj.artist,
          picture: obj.picture,
          duration: obj.duration,
          element: appendQueueItem(queue.length, obj.title, obj.artist)
        });
      }));
    }
  }

  Promise.all(promises).then(() =>
  {
    if (playingIndex < 0)
      resortQueue(0);
    else if (tracks.length === 1)
      resortQueue(queue.length - 1);
    else
      resortQueue(playingIndex);

    saveQueue();
    changeQueue();
  });
}

/** @param { string[] } urls
*/
function queueTracks(...urls)
{
  const promises = [];

  for (let i = 0; i < urls.length; i++)
  {
    promises.push(getTrackMetadata(undefined, undefined, urls[i]).then((obj) =>
    {
      queue.push({
        url: urls[i],
        index: queue.length,
        title: obj.title,
        artist: obj.artist,
        picture: obj.picture,
        element: appendQueueItem(queue.length, obj.title, obj.artist)
      });
    }));
  }

  Promise.all(promises).then(() =>
  {
    if (playingIndex < 0)
      resortQueue(0);
    else if (urls.length === 1)
      resortQueue(queue.length - 1);
    else
      resortQueue(playingIndex);

    saveQueue();
    changeQueue();
  });
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

// TEST clearing the queue in multiple cases
function clearQueue()
{
  // reset to the default picture
  const img = new Image();

  img.src = missingPicture;

  img.onload = () =>
  {
    queueCurrentElement.querySelector('.cover').style.backgroundImage =
    playingBackground.style.backgroundImage = `url(${img.src})`;
  };

  // stop playback
  playingIndex = -1;

  // if there is a current howl, stop it too
  changeQueue();

  // empty queue array
  queue = [];

  // empty the seek-bar ui

  if (seekBarPlayed.classList.contains('loading'))
    seekBarPlayed.classList.remove('loading');

  seekTimeControl(0);

  // pause
  if (playingMode === 'playing')
    switchPlayingMode();

  // hide the current card ui
  queueCurrentElement.setAttribute('style', 'display: none;');

  // reset the queue list ui
  removeAllChildren(queueContainer);
  appendQueueItem('', 'Nothing is queued to play.', '').classList.add('played', 'clear');
}

function saveQueue()
{
  // settings.set('playingIndex', playingIndex);
  // settings.set('queueTracks', queue.map(item => item.url));
}

// function loadQueue()
// {
//   // const tracks = settings.get('queueTracks', []);

//   // if (tracks.length > 0)
//   // {
//   // queueTracks(...tracks);

//   // playingIndex = settings.get('playingIndex', -1);
//   // seekTime = settings.get('seekTime', 0);

//   //   return true;
//   // }
// }

function changeQueue()
{
  // if playing index is -1, this is a clear, not a change
  if (playingIndex === -1 && !currentHowl)
    return;

  if (currentHowl)
  {
    // if nothing changed, don't do anything
    if (playingIndex > -1 && currentHowl.url === queue[playingIndex].url)
    {
      // reset the track to the beginning
      seekTimeControl(0);

      // if pause then start playing
      if (playingMode === 'paused')
        switchPlayingMode();

      return;
    }

    // a new track is queued to play instantly,
    // so stop the current playing track

    currentHowl.stop();
    currentHowl.unload();
    
    // stop updating the seek-bar ui
    cancelAnimationFrame(currentHowl.updateSeekTimeHandle);

    // if playing index is -1, this is a clear, not a change
    if (playingIndex === -1)
      return;
  }

  const url = queue[playingIndex].url;

  const howl = new Howl({
    src: url,
  });

  function updateSeekTime()
  {
    if (!howl.seekTimeProgress)
      howl.seekTimeProgress = 0;

    const now = Date.now();

    if (howl.last === undefined)
      howl.last = now;

    const delta = now - howl.last;

    howl.last = now;

    howl.seekTimeProgress = howl.seekTimeProgress + delta;

    seekTimeControl(
      Math.min(
        (howl.seekTimeProgress / 1000) / queue[playingIndex].duration,
        queue[playingIndex].duration
      ), true);

    howl.updateSeekTimeHandle = requestAnimationFrame(updateSeekTime);
  }

  howl.on('play', () =>
  {
    howl.updateSeekTimeHandle = requestAnimationFrame(updateSeekTime);
  });

  howl.on('pause', () =>
  {
    // stop updating the seek-bar ui
    cancelAnimationFrame(howl.updateSeekTimeHandle);

    // set a more accurate seek-time
    howl.seekTimeProgress = howl.seek() * 1000;
    howl.last = undefined;
  });

  howl.on('end', () =>
  {
    // stop updating the seek-bar ui
    cancelAnimationFrame(howl.updateSeekTimeHandle);

    // update the seek-bar ui to show that the current track is done
    seekTimeControl(1, true);

    if (queue.length <= playingIndex + 1)
    {
      // queue ended
      // TODO add looping functionality
        
      playingIndex = 0;

      // make sure the playing mode is paused
      if (playingMode === 'playing')
        switchPlayingMode();
    }
    else
    {
      playingIndex = playingIndex + 1;

      // start playing the next track in the queue
      changeQueue();
    }

    // update the queue ui to show the current state of itself
    resortQueue(playingIndex);
  });

  howl.url = url;
  currentHowl = howl;

  seekTimeControl(0, true);

  // if playing mode is set to paused, then set it to playing
  if (playingMode === 'paused')
    switchPlayingMode();

  // start playback
  howl.play();
}