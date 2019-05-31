import { remote, ipcRenderer } from 'electron';

import { EventEmitter } from 'events';

import { basename, extname, join } from 'path';
import { union } from 'lodash';

import { parseFile as getMetadata } from 'music-metadata';
import { Howl, Howler as howler } from 'howler';

import * as settings from '../settings.js';

import { createElement, createContextMenu, setSeekTimeWithUI, switchPlayingMode } from './renderer.js';
import { artistsRegex, audioExtensionsRegex, missingPicture, getTrackPicture, removeAllChildren } from './storage.js';

const { isDebug } = remote.require(join(__dirname, '../main/window.js'));

/** @typedef { import('./storage.js').Storage } Storage
*/

const events = new EventEmitter();

/**  @type { [ { url: string, index: number, title: string, artists: string[], album: string, picture: string, duration: number } ] }
*/
let queue = [];

/** @type { HTMLDivElement[] }
*/
let queueElements = [];

const queueCurrentElement = document.body.querySelector('.queue.card');

const queueClearElement = document.body.querySelector('.queue.clear');

/** @type { HTMLDivElement }
*/
const queueContainer = document.body.querySelector('.queue.itemsContainer');

const playingBackground = document.body.querySelector('.playing.background');

let rewindTime = 0;
let skipTime = 0;

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
  // the ui for those settings initialize after this function

  rewindTime = settings.get('rewindTime', 10);
  skipTime = settings.get('skipTime', 30);

  howler.volume(settings.get('currentVolume', 0.75));

  shuffleMode = settings.get('shuffleMode', 'shuffled');
  repeatMode = settings.get('repeatMode', 'looping');

  queueClearElement.onclick = clearQueue;

  // loading the queue will take those settings into account

  // space button switches the playing mode
  window.addEventListener('keydown', (event) =>
  {
    if (event.key === ' ')
    {
      event.preventDefault();

      switchPlayingMode();
    }
  });

  /** @type { string[] }
  */
  let args = remote.getGlobal('argv');
  
  args = args.filter((arg) => typeof arg === 'string' && arg.match(audioExtensionsRegex));
  
  if (args.length > 0)
    queueTracks(false, undefined, undefined, true, ...args);
  else
    loadQueue();

  // allows the main process to queue tracks on the case it might needs to
  ipcRenderer.on('queueTracks', (...args) =>
  {
    args = args.filter((arg) => typeof arg === 'string' && arg.match(audioExtensionsRegex));
    
    if (args.length > 0)
      queueTracks(false, undefined, undefined, true, ...args);
  });

  // save playing percentage on unload
  window.onbeforeunload = () =>
  {
    settings.set('playingPercentage', getSeekTime() / getDuration());
  };
}

export function getDuration()
{
  if (playingIndex > -1 && currentHowl && currentHowl.state() === 'loaded')
    return queue[playingIndex].duration;
  else
    return -1;
}

export function getSeekTime()
{
  if (playingIndex > -1 && currentHowl && currentHowl.state() === 'loaded')
  {
    const seekTime = currentHowl.seek();
    
    if (typeof seekTime === 'number')
      return seekTime;
    else if (currentHowl.seekTimeProgress)
      return currentHowl.seekTimeProgress / 1000;
    else
      return 0;
  }
  else
    return 0;
}

/** @param { number } index
*/
export function setPlayingIndex(index)
{
  if (playingIndex !== index)
  {
    playingIndex = index;

    resortQueue(playingIndex);
    changeQueue();
  }
}

/** @param { number } time
* @param { boolean } [visualOnly]
* @param { boolean } [isInPercentage]
*/
export function setSeekTime(time, visualOnly, isInPercentage)
{
  function set(time)
  {
    if (isInPercentage)
      time = time * getDuration();

    currentHowl.seek(time);

    currentHowl.seekTimeProgress = time * 1000;
    
    events.emit('position', getSeekTime());
  }

  if (playingIndex > -1 && currentHowl)
  {
    if (!visualOnly)
    {
      if (currentHowl.state() !== 'loaded')
      {
        currentHowl.setTimeOnLoad = time;

        currentHowl.once('load', () =>
        {
          set(currentHowl.setTimeOnLoad);

          events.emit('seekTime', getSeekTime());
        });
      }
      else
      {
        set(time);

        events.emit('seekTime', getSeekTime());
      }
    }

    return true;
  }
  else if (time === 0)
  {
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

    events.emit('volume', volume);

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

export function getSkipTiming()
{
  return skipTime;
}

/** @param { number } skip
*/
export function setSkipTiming(skip)
{
  if (skip !== skipTime)
  {
    skipTime = skip;

    settings.set('skipTime', skip);

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
  if (mode !== playingMode)
  {
    if (playingIndex > -1)
    {
      playingMode = mode;

      if (playingMode === 'paused')
        currentHowl.pause();
      else
        currentHowl.play();

      events.emit('playingMode', playingMode);
  
      return true;
    }
    else if (mode === 'paused')
    {
      playingMode = mode;

      events.emit('playingMode', playingMode);

      return true;
    }
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

    // apply the shuffle mode to the queue
    shuffleQueue();

    events.emit('shuffleMode', shuffleMode);

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

    // some ui elements in the queue changes depending on
    // the current repeat mode
    if (playingIndex > -1)
      resortQueue(playingIndex);

    events.emit('repeatMode', repeatMode);

    return true;
  }

  return false;
}

/** @param { number } time
*/
export function rewindBackwards(time)
{
  if (playingIndex <= -1)
    return;

  if (typeof time !== 'number')
    time = rewindTime;

  const duration = queue[playingIndex].duration;

  const seekTime = Math.max(getSeekTime() - time, 0);

  setSeekTimeWithUI(seekTime / duration);
}

/** @param { number } time
*/
export function skipForward(time)
{
  if (playingIndex <= -1)
    return;

  if (typeof time !== 'number')
    time = skipTime;

  const duration = queue[playingIndex].duration;

  const seekTime = Math.min(getSeekTime() + time, duration);
  
  setSeekTimeWithUI(seekTime / duration);
}

export function previouslyOnQueue()
{
  if (playingIndex <= -1)
    return;

  // change to the previous track in the queue
  // or reset the seek-time to 0
  // if seek-time hasn't passed the reset limit
  if (playingIndex - 1 > -1)
  {
    const duration = getDuration();
    const resetLimit = (duration > 10) ? 5 : 1;

    // reset the seek-time to the beginning
    if (getSeekTime() > resetLimit)
    {
      setSeekTimeWithUI(0);
    }
    // change to the previous track
    else
    {
      playingIndex = playingIndex - 1;

      changeQueue();
      resortQueue(playingIndex);
    }
  }
  // this is the first track in the queue
  // keep resetting the seek-time to 0
  else
  {
    setSeekTimeWithUI(0);
  }
}

export function nextInQueue()
{
  if (playingIndex <= -1)
    return;

  // change to the next track in the queue
  if (queue.length > playingIndex + 1)
  {
    playingIndex = playingIndex + 1;

    changeQueue();
    resortQueue(playingIndex);
  }
  // this is the last track in the queue
  // act according to the repeat mode
  else
  {
    setSeekTimeWithUI(1);
  }
}

/** randomly shuffle an array
* https://stackoverflow.com/a/2450976/1293256
* @param { [] } array
* @return { string }
*/
function shuffleArray(array)
{
  let currentIndex = array.length;
  let temporaryValue, randomIndex;

  // while there remain elements to shuffle
  while (0 !== currentIndex)
  {
    // pick a remaining element
    randomIndex = Math.floor(Math.random() * currentIndex);
    currentIndex = currentIndex - 1;

    // and swap it with the current element

    temporaryValue = array[currentIndex];
    array[currentIndex] = array[randomIndex];
    array[randomIndex] = temporaryValue;
  }

  return array;
}

/** @param { number } index
*/
function updateCurrentCard(index)
{
  queueCurrentElement.setAttribute('style', '');

  queueCurrentElement.querySelector('.cover').style.backgroundImage =
  playingBackground.style.backgroundImage = queue[index].picture;

  queueCurrentElement.querySelector('.artist').innerText =  queue[index].artists.join(',');
  queueCurrentElement.querySelector('.title').innerText = queue[index].title;
}

/** @param { Storage } storage
* @param { string } title
* @param { string } url
* @returns { Promise<{ title: string, artists: string[], album: string, picture: string, duration: number }> }
*/
function getTrackMetadata(storage, url)
{
  if (
    storage &&
    storage.tracks[url] &&
    storage.tracks[url].element.querySelector('.cover').style.backgroundImage
  )
  {
    return new Promise((resolve) =>
    {
      resolve({
        title: storage.tracks[url].title,
        artists: storage.tracks[url].artists,
        album: storage.tracks[url].album,
        picture: storage.tracks[url].element.querySelector('.cover').style.backgroundImage || `url(${missingPicture})`,
        duration: storage.tracks[url].duration
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

        // auto split artists by comma
        artists = union(...[].concat(artists).map((v) => v.split(artistsRegex)));

        if (metadata.common.picture && metadata.common.picture.length > 0)
        {
          return new Promise((resolve) =>
          {
            getTrackPicture(url).then((picture) =>
            {
              resolve({
                title: title,
                artists: artists,
                album: metadata.common.album,
                picture: `url(${picture})`,
                duration: metadata.format.duration
              });
            });
          });
        }
        else
        {
          return new Promise((resolve) =>
          {
            resolve({
              title: title,
              artists: artists,
              album: metadata.common.album,
              picture: `url(${missingPicture})`,
              duration: metadata.format.duration
            });
          });
        }
      });
  }
}

/** @param { number } index
* @param { string } title
* @param { string } artist
*/
function appendQueueItem()
{
  const queueItem = createElement('.queueItem.container');

  const indexElement = createElement('.queueItem.index');
  const artistElement = createElement('.queueItem.artist');
  const titleElement = createElement('.queueItem.title');

  queueItem.appendChild(indexElement);
  queueItem.appendChild(artistElement);
  queueItem.appendChild(titleElement);

  return queueContainer.appendChild(queueItem);
}

/** add a callback to a playback event
* @param {  'track' | 'position' | 'seekTime' | 'volume' | 'clear' | 'playingMode' | 'shuffleMode' | 'repeatMode' } eventName
* @param { (...args) => void } callback
*/
export function on(eventName, callback)
{
  events.on(eventName, callback);
}

/** the main way to handle queuing tracks in dawayer, using the storage object to obtain the required metadata
* @param { Storage } storage
* @param { string } playingTrackUrl
* @param { number } urls
* @param { boolean } clear
* @param { string } tracks
*/
export function queueStorageTracks(storage, playingTrackUrl, seekTime, clear, ...tracks)
{
  return new Promise((resolve) =>
  {
    if (clear)
      partialClearQueue();
    
    const promises = [];

    for (let i = 0; i < tracks.length; i++)
    {
      const exists = queue.find((obj) => obj.url === tracks[i]);

      // if the same track already exists in the queue
      if (exists && tracks.length === 1)
      {
        resortQueue(exists.index);
      }
      else if (!exists)
      {
        promises.push(getTrackMetadata(storage, tracks[i]).then((obj) =>
        {
          queue.push({
            url: tracks[i],
            index: queue.length,
            title: obj.title,
            artists: obj.artists,
            album: obj.album,
            picture: obj.picture,
            duration: obj.duration
          });

          queueElements.push(appendQueueItem());
        }));
      }
    }

    Promise.all(promises).then(() =>
    {
      if (playingTrackUrl)
      {
        resortQueue(queue.findIndex((item) => item.url === playingTrackUrl));
      }
      else
      {
        if (playingIndex < 0)
        {
          let newIndex = 0;

          if (shuffleMode === 'shuffled')
            newIndex = Math.floor(Math.random() * queue.length);

          resortQueue(newIndex);
        }
        else
        {
          resortQueue(playingIndex);
        }
      }

      saveQueue();
      
      shuffleQueue();
      changeQueue();

      if (seekTime)
        setSeekTimeWithUI(seekTime / getDuration());

      resolve();
    });
  });
}

/** should be used to load track from urls, used to load saved queues or files that are not stored
* @param { boolean } quiet
* @param { string } playingTrackUrl
* @param { number } playingPercentage
* @param { boolean } clear
* @param { string[] } urls
*/
function queueTracks(quiet, playingTrackUrl, playingPercentage, clear, ...urls)
{
  return new Promise((resolve) =>
  {
    if (clear)
      partialClearQueue();

    const promises = [];

    for (let i = 0; i < urls.length; i++)
    {
      promises.push(getTrackMetadata(undefined, urls[i]).then((obj) =>
      {
        queue.push({
          url: urls[i],
          index: queue.length,
          title: obj.title,
          artists: obj.artists,
          album: obj.album,
          picture: obj.picture,
          duration: obj.duration
        });
  
        queueElements.push(appendQueueItem());
      }));
    }
  
    Promise.all(promises).then(() =>
    {
      if (playingTrackUrl)
      {
        resortQueue(queue.findIndex((item) => item.url === playingTrackUrl));
      }
      else
      {
        if (playingIndex < 0)
        {
          let newIndex = 0;

          if (shuffleMode === 'shuffled')
            newIndex = Math.floor(Math.random() * queue.length);

          resortQueue(newIndex);
        }
        else
        {
          resortQueue(playingIndex);
        }
      }
  
      saveQueue();
      
      shuffleQueue();
      changeQueue(quiet);

      if (playingPercentage)
        setSeekTimeWithUI(playingPercentage);

      resolve();
    });
  });
}

function shuffleQueue()
{
  let newQueue;

  if (getShuffleMode() === 'shuffled')
  {
    // shuffle the queue array
    newQueue = shuffleArray(queue.concat());
  }
  else
  {
    // restore original indices
    newQueue = queue.concat().sort((a, b) =>
    {
      if (a.index < b.index)
        return -1;
      if (a.index > b.index)
        return 1;

      return 0;
    });
  }

  // update the playing index
  if (playingIndex > -1)
  {
    const playingUrl = queue[playingIndex].url;

    playingIndex = newQueue.findIndex((v) => v.url === playingUrl);

    queue = newQueue;
  }

  // update the queue ui
  resortQueue(playingIndex);
}

/** @param { string } fromIndex
*/
function resortQueue(fromIndex)
{
  if (queue.length <= 0 || (fromIndex === undefined && playingIndex <= -1))
    return;

  // update the playing index
  if (fromIndex !== undefined)
    playingIndex = fromIndex;

  // update the current track card
  updateCurrentCard(playingIndex);

  // if the queue was empty then remove the queue is empty element
  const clearElement = queueContainer.querySelector('.queueItem.clear');

  if (clearElement)
    queueContainer.removeChild(clearElement);

  // if the clear queue button is invisible then make it visible
  if (queueClearElement.classList.contains('empty'))
    queueClearElement.classList.remove('empty');

  for (let i = 0; i < queue.length; i++)
  {
    // if a queue item is clicked
    // it should play its track
    queueElements[i].onclick = () =>
    {
      playingIndex = i;

      resortQueue(playingIndex);
      changeQueue();
    };

    // create a context menu for the queue item
    createContextMenu(queueElements[i], {
      'Play': () =>
      {
        playingIndex = i;

        resortQueue(playingIndex);
        changeQueue();
      },
      'Remove from Queue': () =>
      {
        // if removing last track in queue
        // then trigger clear queue
        if (queue.length === 1)
        {
          clearQueue();

          return;
        }

        // else remove the track from the queue

        // stop playback events using playing index and getting a different track
        if (currentHowl && playingMode === 'playing')
        {
          cancelAnimationFrame(currentHowl.updateSeekTimeHandle);

          currentHowl.eventCanceled = true;
        }

        queue.splice(i, 1);
        queueContainer.removeChild(queueElements.splice(i, 1)[0]);

        // save the queue after the removal of the track
        saveQueue();

        // if queue ended, call the end event so it can handle
        // the repeat mode
        if (playingIndex === i && i === queue.length)
        {
          playingIndex = queue.length - 1;

          endEvent();
        }
        // else if the removed track is lower then the current
        else if (playingIndex > i)
        {
          playingIndex = playingIndex - 1;

          resortQueue(playingIndex);
          changeQueue();
        }
        // if the removed track is higher then the current
        else
        {
          resortQueue(playingIndex);
          changeQueue();
        }

        // if the event was canceled
        if (currentHowl && currentHowl.eventCanceled)
        {
          currentHowl.updateSeekTimeHandle = requestAnimationFrame(updateSeekTimeEvent);

          currentHowl.eventCanceled = undefined;
        }
      }
    }, queueContainer.parentElement);

    if (playingIndex > i)
    {
      queueElements[i].children[0].innerText = -(playingIndex - i);

      if (!queueElements[i].classList.contains('played'))
        queueElements[i].classList.add('played');
    }
    else
    {
      if (i - playingIndex === 0 && getRepeatMode() === 'repeating')
        queueElements[i].children[0].innerText = '∞';
      else
        queueElements[i].children[0].innerText = i - playingIndex;

      if (queueElements[i].classList.contains('played'))
        queueElements[i].classList.remove('played');
    }

    // update the artist and the title
    queueElements[i].children[1].innerText = queue[i].artists.join(',');
    queueElements[i].children[2].innerText = queue[i].title;
  }
}

/** clears everything about the queue definitely
*/
function clearQueue()
{
  // stop playback
  playingIndex = -1;

  // if there is a current howl, stop it too
  // saves the playing index as -1
  changeQueue();

  // empty queue array
  queue = [];
  queueElements = [];

  // save the queue as empty
  saveQueue();

  // emit
  events.emit('clear');

  // empty the seek-bar ui
  setSeekTimeWithUI(0);

  // pause
  if (playingMode === 'playing')
    switchPlayingMode();

  // hide the current card ui
  queueCurrentElement.setAttribute('style', 'display: none;');

  // set the playing background picture as default
  playingBackground.setAttribute('style', '');

  // hide the clear queue button
  queueClearElement.classList.add('empty');

  // remove all the tracks from the queue ui
  removeAllChildren(queueContainer);

  // add element to notify the user that the queue is empty
  const queueEmptyElement = appendQueueItem();

  // set the title and make it less visible
  queueEmptyElement.children[2].innerText = 'Nothing is queued to play.';
  queueEmptyElement.classList.add('played', 'clear');
}

/** partially clears the queue to allow a new queue to take the spotlight
*/
function partialClearQueue()
{
  // stop playback
  playingIndex = -1;

  // if there is a current howl, stop it too
  // saves the playing index as -1
  changeQueue();

  // empty queue array
  queue = [];
  queueElements = [];

  // empty the seek-bar ui
  setSeekTimeWithUI(0);

  // remove all the tracks from the queue ui
  removeAllChildren(queueContainer);
}

function saveQueue()
{
  settings.set('queueTracks', queue.map(item => item.url));
}

function savePlayingTrack()
{
  if (playingIndex > 0)
    settings.set('playingTrack', queue[playingIndex].url);
  else
    settings.remove('playingTrack');
}

function loadQueue()
{
  // don't load the queue in the debug mode
  if (isDebug())
    return false;

  const tracks = settings.get('queueTracks', []);

  if (tracks.length > 0)
  {
    // queue the saved queue
    queueTracks(
      true,
      settings.get('playingTrack'),
      settings.get('playingPercentage', 0),
      true, ...tracks);
  }
}

/** @param { boolean } quiet
*/
function changeQueue(quiet)
{
  // save the playing index
  savePlayingTrack();

  // if playing index is -1, this is a clear, not a change
  if (playingIndex === -1 && !currentHowl)
  {
    events.emit('track', undefined);

    return;
  }

  if (currentHowl)
  {
    // if nothing changed, don't do anything
    if (playingIndex > -1 && currentHowl.url === queue[playingIndex].url)
    {
      if (!quiet)
      {
        // if pause then start playing
        if (playingMode === 'paused')
          switchPlayingMode();
      }
      else
      {
        // if playing mode is set to playing then set it to paused
        if (playingMode === 'playing')
          switchPlayingMode();
      }

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
    {
      currentHowl = undefined;

      events.emit('track', undefined);

      return;
    }
  }

  const url = queue[playingIndex].url;

  const howl = new Howl({
    src: url,
  });

  howl.url = url;
  currentHowl = howl;

  howl.on('play', playEvent);

  howl.on('pause', pauseEvent);

  howl.on('end', endEvent);

  // emit a track change event
  howl.once('load', () =>
  {
    events.emit('track', {
      title: queue[playingIndex].title,
      artists: queue[playingIndex].artists,
      album: queue[playingIndex].album,
      picture: queue[playingIndex].picture,
      duration: queue[playingIndex].duration
    });
  });

  // set the seek-bar ui
  setSeekTimeWithUI(0, true);

  // start playback
  if (!quiet)
  {
    // if playing mode is set to paused then set it to playing
    if (playingMode === 'paused')
      switchPlayingMode();

    howl.play();
  }
  else
  {
    // if playing mode is set to playing then set it to paused
    if (playingMode === 'playing')
      switchPlayingMode();
  }
}

function playEvent()
{
  currentHowl.seekTimeProgress = currentHowl.seek() * 1000;
  currentHowl.last = undefined;

  currentHowl.updateSeekTimeHandle = requestAnimationFrame(updateSeekTimeEvent);
}

function pauseEvent()
{
  // stop updating the seek-bar ui
  cancelAnimationFrame(currentHowl.updateSeekTimeHandle);
}

function updateSeekTimeEvent()
{
  const now = Date.now();

  if (currentHowl.last === undefined)
    currentHowl.last = now;

  const delta = now - currentHowl.last;

  currentHowl.last = now;

  currentHowl.seekTimeProgress = currentHowl.seekTimeProgress + delta;

  setSeekTimeWithUI(
    Math.min(
      (currentHowl.seekTimeProgress / 1000) / queue[playingIndex].duration,
      queue[playingIndex].duration
    ), true);

  currentHowl.updateSeekTimeHandle = requestAnimationFrame(updateSeekTimeEvent);
}

function endEvent()
{
  // stop updating the seek-bar ui
  cancelAnimationFrame(currentHowl.updateSeekTimeHandle);

  // empty the seek-bar ui
  setSeekTimeWithUI(0, true);

  // repeating the same track
  if (getRepeatMode() === 'repeating')
  {
    // reset the track to the beginning
    setSeekTimeWithUI(0);

    // howl stops when the track ends and needs to be re-played
    currentHowl.play();
  }
  // queue ended
  else if (queue.length <= playingIndex + 1)
  {
    // if repeat mode is once
    // then reset the queue to the first track and stop playback
    if ((getRepeatMode() === 'once'))
    {
      // reset the queue to the first track
      playingIndex = 0;

      // change the queue to playback the first track in the queue
      // but in paused mode, won't start until the user switch
      // the mode back to playing
      changeQueue(true);
    }
    // else if repeat mode is looping
    // then reset the queue to the first track and continue playback
    else
    {
      // if the queue is 1 track long then just repeat it
      if (queue.length === 1)
      {
        setSeekTimeWithUI(0, true);

        currentHowl.play();
      }
      // else play the first track
      else
      {
        // reset the queue to the first track
        playingIndex = 0;

        // start playing the first track in the queue
        changeQueue();
      }
    }
  }
  // queue has more track to play before it ends
  // start playing the next track
  else
  {
    // switch the next track in the queue
    playingIndex = playingIndex + 1;

    // start playing the next track in the queue
    changeQueue();
  }

  // update the queue ui to show the current state of itself
  resortQueue(playingIndex);
}