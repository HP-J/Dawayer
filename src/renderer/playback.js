import { remote, ipcRenderer } from 'electron';

import { EventEmitter } from 'events';

import { basename, extname, join } from 'path';
import { union } from 'lodash';

import { parseFile as getMetadata } from 'music-metadata';
import { Howl, Howler as howler } from 'howler';

import * as settings from '../settings.js';

import { artistsRegex } from './storage.js';

import {
  createElement, createContextMenu, removeAllChildren,
  setSeekTimeWithUI, switchPlayingMode, toggleSeekBarLoading,
  defaultPicture, toggleSeekBarBuffering, setSeekBarBuffering
} from './renderer.js';

/** @typedef { Object } QueueObject
* @property { string } url
* @property { number } index
* @property { string } title
* @property { string[] } artists
* @property { string } album
* @property { string } picture
*/

export const audioExtensions =[ 'mp3', 'mpeg', 'opus', 'ogg', 'wav', 'aac', 'acc' ];

export const audioExtensionsRegex = /.mp3$|.mpeg$|.opus$|.ogg$|.wav$|.aac$|.flac$/;

export const audioUrlTypeRegex = /https?:\/\/(www\.)?[-a-zA-Z0-9@:%._+~#=]{2,256}\.[a-z]{2,6}\b([-a-zA-Z0-9@:%_+.~#?&//=]*)/gi;

const { isDebug } = remote.require(join(__dirname, '../main/window.js'));

/** @typedef { import('./storage.js').Storage } Storage
*/

const events = new EventEmitter();

/** @type { QueueObject[] }
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
      if (document.activeElement.tagName !== 'INPUT')
      {
        event.preventDefault();
        
        switchPlayingMode();
      }
    }
  });

  /** @type { string[] }
  */
  let args = remote.getGlobal('argv');
  
  args = args.filter((arg) => typeof arg === 'string' && arg.match(audioExtensionsRegex)).map((x) =>
  {
    return {
      url: x
    };
  });
  
  if (args.length > 0)
    queueTracks(false, undefined, undefined, true, ...args);
  else
    loadQueue();

  // allows the main process to queue tracks on the case it might needs to
  ipcRenderer.on('queueTracks', (...args) =>
  {
    args = args.filter((arg) => typeof arg === 'string' && arg.match(audioExtensionsRegex)).map((x) =>
    {
      return {
        url: x
      };
    });

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
    return currentHowl.duration();
  else
    return -1;
}

export function getSeekTime()
{
  if (playingIndex <= -1 || !currentHowl || currentHowl.state() !== 'loaded')
    return 0;
  
  const seekTime = currentHowl.seek();
  
  if (typeof seekTime === 'number')
    return seekTime;
  else if (currentHowl.seekTimeProgress)
    return currentHowl.seekTimeProgress / 1000;
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
  function set(time, isInPercentage)
  {
    if (isInPercentage)
      time = time * getDuration();

    currentHowl.seek(time);

    currentHowl.seekTimeProgress = time * 1000;
    
    events.emit('position', getSeekTime());
  }

  // toggling seek-bar loading indicator

  if (!currentHowl)
  {
    toggleSeekBarLoading(false);
  }
  else
  {
    if (currentHowl.state() !== 'loaded')
    {
      toggleSeekBarLoading(true);

      currentHowl.once('load', () =>
      {
        toggleSeekBarLoading(false);
      });
    }
    else
    {
      toggleSeekBarLoading(false);
    }
  }

  // setting the seek-time

  if (playingIndex > -1 && currentHowl)
  {
    if (!visualOnly)
    {
      if (currentHowl.state() !== 'loaded')
      {
        currentHowl.setTimeOnLoad = {
          time: time,
          isInPercentage: isInPercentage
        };

        currentHowl.once('load', () =>
        {
          set(currentHowl.setTimeOnLoad.time, currentHowl.setTimeOnLoad.isInPercentage);

          events.emit('seekTime', getSeekTime());
        });
      }
      else
      {
        set(time, isInPercentage);

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
  if (playingIndex <= -1 || !currentHowl || currentHowl.state() !== 'loaded')
    return;

  if (typeof time !== 'number')
    time = rewindTime;

  const duration = getDuration();

  if (duration <= 0)
    return;

  const seekTime = Math.max(getSeekTime() - parseFloat(time), 0);

  setSeekTimeWithUI(seekTime / duration);
}

/** @param { number } time
*/
export function skipForward(time)
{
  if (playingIndex <= -1 || !currentHowl || currentHowl.state() !== 'loaded')
    return;

  if (typeof time !== 'number')
    time = skipTime;

  const duration = getDuration();

  if (duration <= 0)
    return;

  const seekTime = Math.min(parseFloat(time) + getSeekTime(), duration);

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
 
  queueCurrentElement.querySelector('.artist').innerText =  queue[index].artists.join(', ');
  queueCurrentElement.querySelector('.title').innerText = queue[index].title;
  queueCurrentElement.querySelector('.cover').style.backgroundImage =
  playingBackground.style.backgroundImage = `url("${defaultPicture}")`;

  // load cached track image
  if (queue[index].picture)
  {
    settings.receiveCachedImage(queue[index].picture).then((imagePath) =>
    {
      queueCurrentElement.querySelector('.cover').style.backgroundImage =
      playingBackground.style.backgroundImage = `url("${imagePath}")`;
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

/** queue tracks that are cached on the storage object by
* obtaining the cached metadata instead of parsing the file over and over again
* @param { Storage } storage
* @param { string } startingTrackUrl
* @param { boolean } clearQueue
* @param { string[] } urls
*/
export function queueStorageTracks(storage, startingTrackUrl, clearQueue, ...urls)
{
  /** @type { QueueObject[] }
  */
  const tracks = [];

  for (let i = 0; i < urls.length; i++)
  {
    const url = urls[i];

    tracks.push({
      url: url,
      title: storage.tracks[url].title,
      artists: storage.tracks[url].artists,
      album: storage.tracks[url].album,
      picture: storage.tracks[url].picture
    });
  }

  return queueTracks(false, startingTrackUrl, undefined, clearQueue, ...tracks);
}

/** can be used to queue tracks from file or remote urls
* @param { boolean } quiet
* @param { string } startingTrackUrl
* @param { number } startingTrackPercentage
* @param { boolean } clearQueue
* @param { QueueObject[] } tracks
*/
export function queueTracks(quiet, startingTrackUrl, startingTrackPercentage, clearQueue, ...tracks)
{
  return new Promise((resolve, reject) =>
  {
    if (clearQueue)
      partialClearQueue();

    let loading = false;

    // feedback that queuing is in progress
    // incase missing metadata takes couple of seconds to load
    if (queue.length <= 0)
    {
      toggleSeekBarLoading(true);

      loading = true;
    }

    const promises = [];

    for (let i = 0; i < tracks.length; i++)
    {
      /** @type { QueueObject }
      */
      const queueObject = {};

      queueObject.index = queue.length;

      // essential variables
      queueObject.url = tracks[i].url;
      queueObject.title = tracks[i].title;
      queueObject.artists = tracks[i].artists;

      // non-essential variables
      queueObject.album = tracks[i].album;
      queueObject.picture = tracks[i].picture;

      if (!queueObject.url)
        continue;

      // if essential variables are missing

      if (!queueObject.title || !queueObject.artists)
      {
        // if remote url
        if (audioUrlTypeRegex.test(queueObject.url))
        {
          if (!queueObject.title)
            queueObject.title = basename(queueObject.url, extname(queueObject.url));

          if (!queueObject.artists)
            queueObject.artists = [ 'Unknown Artist' ];
        }
        // else if file url
        else
        {
          promises.push(getMetadata(queueObject.url)
            .then(metadata =>
            {
              const title = metadata.common.title || basename(queueObject.url, extname(queueObject.url));

              // if title is missing
              if (!queueObject.title)
                queueObject.title = title;

              // if artists is missing
              if (!queueObject.artists)
              {
                const artists = metadata.common.artists || [ 'Unknown Artist' ];
                
                // auto split artists by comma
                queueObject.artists = union(...[].concat(artists).map((v) => v.split(artistsRegex)));
              }

              // fill other non-essential variables if they were missing

              if (!queueObject.album)
                queueObject.artists = metadata.common.album;

              if (!queueObject.picture)
                queueObject.picture =  settings.cacheImage(metadata.common.picture[0]);
            }));
        }
      }

      queue.push(queueObject);
    }
  
    Promise.all(promises).then(() =>
    {
      if (loading)
        toggleSeekBarLoading(false);

      // if queue is empty then we didn't queue anything with this call
      // return an error
      if (queue.length <= 0)
      {
        reject('Empty Queue');

        return;
      }

      // make sure queue UI elements equals the number of track on queue
      // before they get updated
      while (queueElements.length < queue.length)
      {
        queueElements.push(appendQueueItem());
      }

      let insertAfterUrl;

      // if the queue should start playing from a certain track
      if (startingTrackUrl)
      {
        if (playingIndex < 0)
          resortQueue(queue.findIndex((item) => item.url === startingTrackUrl));
        else
          insertAfterUrl = startingTrackUrl;
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
      
      // make sure that the targeted track is played after the current playing track
      // after the shuffle
      shuffleQueue(insertAfterUrl);
      
      changeQueue(quiet);

      // if the track playing should start from a certain seek-time
      if (startingTrackPercentage)
        setSeekTimeWithUI(startingTrackPercentage);

      resolve();
    });
  });
}

/** @param { string } insertAfterUrl
*/
function shuffleQueue(insertAfterUrl)
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
  resortQueue(playingIndex, queue.findIndex((item) => item.url === insertAfterUrl));
}

/** @param { number } fromIndex
* @param { number } after
*/
function resortQueue(fromIndex, insertAfterIndex)
{
  if (queue.length <= 0 || (fromIndex === undefined && playingIndex <= -1))
    return;

  // update the playing index
  if (fromIndex !== undefined)
    playingIndex = fromIndex;

  // update the current track card
  updateCurrentCard(playingIndex);

  if (insertAfterIndex > -1)
  {
    let replaceIndex = playingIndex + 1;

    if (replaceIndex >= queue.length)
      replaceIndex = 0;

    const temp = queue[replaceIndex];

    queue[replaceIndex] = queue[insertAfterIndex];
    queue[insertAfterIndex] = temp;
  }

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
    }, queueContainer.parentElement.parentElement);

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
    queueElements[i].children[1].innerText = queue[i].artists.join(', ');
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
  settings.set('queueTracks', queue.map(item =>
  {
    return {
      url: item.url
    };
  }));
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
    toggleSeekBarBuffering(false);
    
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

    toggleSeekBarBuffering(false);

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
    // defaults to html5 for faster load times and remote streaming
    html5: true,
    preload: false,
    format: audioExtensions
  });

  howl.url = url;
  currentHowl = howl;

  howl.on('play', playEvent);

  howl.on('pause', pauseEvent);

  howl.on('end', endEvent);

  howl.on('load', bufferEvent);

  howl.on('loaderror', (error) =>
  {
    console.error(error);

    endEvent();
  });

  howl.on('playerror', (error) =>
  {
    console.error(error);

    endEvent();
  });

  // emit a track change event
  howl.once('load', () =>
  {
    events.emit('track', {
      title: queue[playingIndex].title,
      artists: queue[playingIndex].artists,
      album: queue[playingIndex].album,
      picture: queue[playingIndex].picture,
      duration: getDuration()
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

function bufferEvent()
{
  const node = currentHowl._sounds[0]._node;

  node.addEventListener('progress', () =>
  {
    const duration = currentHowl.duration();

    if (duration > 0)
    {
      for (let i = 0; i < node.buffered.length; i++)
      {
        if (node.buffered.start(node.buffered.length - 1 - i) < node.currentTime)
        {
          const bufferProgress = (node.buffered.end(node.buffered.length - 1 - i) / duration) * 100;

          toggleSeekBarBuffering(true);
          setSeekBarBuffering(bufferProgress);
          
          break;
        }
      }
    }
  });
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

  const duration = getDuration();

  setSeekTimeWithUI(
    Math.min(
      (currentHowl.seekTimeProgress / 1000) / duration,
      duration
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