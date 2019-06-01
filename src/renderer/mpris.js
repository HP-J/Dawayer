import { remote } from 'electron';

import { join } from 'path';

import Player from 'mpris-service';

import {
  on as onDawayer, getVolume, getPlayingMode,
  getSeekTime, getRepeatMode, getShuffleMode,
  previouslyOnQueue, nextInQueue, skipForward
} from './playback.js';

import {
  setVolumeWithUI, setSeekTimeWithUI, switchPlayingMode,
  forcePlayingMode, forceShuffleMode, forceRepeatMode
} from './renderer.js';

const { showHide, quit } = remote.require(join(__dirname, '../main/window.js'));

/** MPRIS sets volume twice at the start of the app
* to 0 then to the correct volume
* the second time is sometimes bugged and returns 0.1 instead of the correct number
* as the workaround we ignore the first two times MPRIS sets the volume **/
let volumeBugWorkaround = 0;

/** @type { Player }
*/
let player;

let counter = 0;

export function initMPRISPlayer()
{
  // register the Dawayer MPRIS Player

  // the timeout is another workaround for a bug where a lot of times
  // the mpris player shows up incomplete
  // the delay seems to fix that
  setTimeout(() =>
  {
    player = new Player({
      name: 'Dawayer',
      identity: 'Dawayer',
      supportedUriSchemes: [ 'file' ],
      supportedMimeTypes: [ 'audio/mpeg3', 'audio/mpeg', 'audio/opus', 'application/ogg', 'audio/wav', 'audio/acc', 'audio/flac' ],
      supportedInterfaces: [ 'player' ],
      desktopEntry: 'Dawayer'
    });

    mprisStartingState();
  
    mprisReceiveEvents();
    mprisSendEvents();
  }, 1000);
}

function mprisStartingState()
{
  player.volume = getVolume();

  const shuffleMode = getShuffleMode();
  const repeatMode = getRepeatMode();

  if (shuffleMode === 'normal')
    player.shuffle = false;
  else if (shuffleMode === 'shuffled')
    player.shuffle = true;

  if (repeatMode === 'once')
    player.loopStatus = 'None';
  else if (repeatMode === 'repeating')
    player.loopStatus = 'Track';
  else if (repeatMode === 'looping')
    player.loopStatus = 'Playlist';
}

function mprisReceiveEvents()
{
  // MPRIS gets its position from this function
  player.getPosition = () =>
  {
    return getSeekTime() * 1000 * 1000;
  };

  onDawayer('track', (trackObj) =>
  {
    if (trackObj === undefined)
    {
      player.playbackStatus = Player.PLAYBACK_STATUS_STOPPED;
      player.loading = true;

      return;
    }

    player.metadata = {
      'mpris:trackid': player.objectPath(++counter),
      'xesam:title': trackObj.title,
      'xesam:artist': trackObj.artists,
      'xesam:album': trackObj.album,
      'mpris:artUrl': `file://${trackObj.picture}`,
      'mpris:length': Math.floor(trackObj.duration) * 1000 * 1000
    };
    
    player.duration = trackObj.duration;
    player.seeked(0);

    player.playbackStatus = (getPlayingMode() === 'playing') ? Player.PLAYBACK_STATUS_PLAYING : Player.PLAYBACK_STATUS_PAUSED;
    player.loading = false;
  });

  onDawayer('seekTime', (seekTime) =>
  {
    player.seeked(seekTime * 1000 * 1000);
  });

  onDawayer('volume', (volume) =>
  {
    player.volume = volume;
  });

  onDawayer('clear', () =>
  {
    player.metadata = {
      'mpris:trackid': player.objectPath(0),
      'xesam:title': '',
      'xesam:artist': '',
      'xesam:album': '',
      'mpris:length': -1
    };
  });

  onDawayer('playingMode', (playingMode) =>
  {
    if (!player.loading)
      player.playbackStatus = (playingMode === 'playing') ? Player.PLAYBACK_STATUS_PLAYING : Player.PLAYBACK_STATUS_PAUSED;
  });

  onDawayer('shuffleMode', (shuffleMode) =>
  {
    if (shuffleMode === 'normal')
      player.shuffle = false;
    else if (shuffleMode === 'shuffled')
      player.shuffle = true;
  });

  onDawayer('repeatMode', (repeatMode) =>
  {
    if (repeatMode === 'once')
      player.loopStatus = 'None';
    else if (repeatMode === 'repeating')
      player.loopStatus = 'Track';
    else if (repeatMode === 'looping')
      player.loopStatus = 'Playlist';
  });
}

function mprisSendEvents()
{
  // client callbacks

  player.on('raise', () => showHide('focus'));

  player.on('quit', () => quit());

  // playback callbacks

  player.on('playpause', () =>
  {
    if (player.loading)
      return;

    switchPlayingMode();
  });

  player.on('play', () =>
  {
    if (player.loading)
      return;
    
    forcePlayingMode('playing');
  });

  player.on('pause', () =>
  {
    if (player.loading)
      return;

    forcePlayingMode('paused');
  });

  player.on('stop', () =>
  {
    if (player.loading)
      return;
    
    forcePlayingMode('paused');

    setSeekTimeWithUI(0);
  });

  player.on('previous', previouslyOnQueue);

  player.on('next', nextInQueue);

  // control events

  player.on('shuffle', (mode) =>
  {
    if (player.loading)
      return;

    if (mode)
      forceShuffleMode('shuffled');
    else
      forceShuffleMode('normal');
  });

  player.on('loopStatus', (mode) =>
  {
    if (mode === 'None')
      forceRepeatMode('once');
    else if (mode === 'Track')
      forceRepeatMode('repeating');
    else if (mode === 'Playlist')
      forceRepeatMode('looping');
  });

  player.on('seek', (seekTime) =>
  {
    skipForward(seekTime / 1000 / 1000);
  });

  player.on('volume', (volume) =>
  {
    if (volumeBugWorkaround < 2)
      volumeBugWorkaround = volumeBugWorkaround + 1;
    else
      setVolumeWithUI(volume);
  });
}