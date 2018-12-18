import { remote } from 'electron';

import { existsSync, exists, stat, writeJson, readJSON, readdir } from 'fs-extra';

import { join, dirname, basename, extname } from 'path';
import { homedir, platform } from 'os';

import { parseFile as getMetadata } from 'music-metadata';
import * as settings from 'electron-json-config';

import { createElement } from './renderer.js';
import { appendDirectoryNode } from './options.js';

const { isDebug } = remote.require(join(__dirname, '../main/window.js'));

/** @typedef { import('music-metadata').IAudioMetadata } Metadata
*/

/** @typedef { Object } StorageInfo
* @property { number } date
*/

/** @typedef { Object } Storage
* @property { Object<string, {  artist: string, tracks: string[], duration: number, element: HTMLDivElement }> } albums
* @property { Object<string, { tracks: string[], duration: number, element: HTMLDivElement }> } artists
* @property { Object<string, { url: string, artists: string[], duration: number, element: HTMLDivElement }> } tracks
*/

const AUDIO_EXTENSIONS_REGEX = /.mp3$|.mpeg$|.opus$|.ogg$|.wav$|.aac$|.m4a$|.flac$/;

/**  @type { HTMLDivElement }
*/
const albumsContainer = document.body.querySelector('.albums.container');

/**  @type { HTMLDivElement }
*/
const artistsContainer = document.body.querySelector('.artists.container');

/** @type { string[] }
*/
const audioDirectories = [];

/** @type { string }
*/
let storageInfoConfig;

/** @type { string }
*/
let storageConfig;

/** @param { string[] } directories
* @returns { string[] }
*/
function walk(directories)
{
  return new Promise((resolve) =>
  {
    const results = [];
    const promises = [];

    for (let i = 0; i < directories.length; i++)
    {
      const dir = directories[i];

      exists(dir).then((existsValue) =>
      {
        if (!existsValue)
          return;

        readdir(dir).then((list) =>
        {
          list.forEach((file, index) =>
          {
            file = join(dir, file);

            stat(file).then((statValue) =>
            {
              if (statValue && statValue.isDirectory())
                promises.push(walk([ file ]).then((files) => results.push(...files)));
              else
                results.push(file);

              if (i === directories.length - 1 && index === list.length - 1)
                Promise.all(promises).then(() => resolve(results));
            });
          });
        });
      });
    }
  });
}

function getDefaultMusicDir()
{
  // TEST the default music dir on windows
  const currentPlatform = platform();

  if (currentPlatform === 'linux' || currentPlatform === 'win32')
    return join(homedir(), '/Music');
}

/** initialize the cache system and loads local tracks, albums and artists, appending an element
* for each of them
*/
export function initStorage()
{
  // TEST changing the directory (from ~/Music to /mnt/k/Music Tester) during runtime
  // and then re-scanning

  // the base directory for the app config files
  const configDir = dirname(settings.file());

  storageInfoConfig = join(configDir, '/storageInfo.json');
  storageConfig = join(configDir, '/storage.json');

  // loaded the saved audio directories

  const savedAudioDirectories = settings.get('audioDirectories');

  // if now audio directories are saved, then use the OS default directory for music
  if (!savedAudioDirectories || !savedAudioDirectories.length <= 0)
    addNewDirectories([ getDefaultMusicDir() ]);
  else
    addNewDirectories(savedAudioDirectories);

  // if a cached storage object exists
  if (!isDebug() && existsSync(storageConfig))
  {
    let storageInfo;

    readJSON(storageInfoConfig).then((data) =>
    {
      storageInfo = data;

      return readJSON(storageConfig);
    })
      .then((storage) =>
      {
        appendItems(storage);

        // update the cache if it's older than 2 days
        // take effect when the app is re-opened
        if (isStorageOld(storageInfo.date))
        {
          scanCacheAudioFiles().then((scan) =>
          {
            cacheStorage(scan.storageInfo, scan.storage);
          });
        }
      });
  }
  // if not, then scan the audio directories for the audio files,
  // load them and then create a new cache for them
  else
  {
    scanCacheAudioFiles().then((scan) =>
    {
      appendItems(scan.storage);
      cacheStorage(scan.storageInfo, scan.storage);
    });
  }
}

/** scan the audio directories for audio files then parses them for their metadata,
* and adds the important data to the storage object
*/
export function scanCacheAudioFiles()
{
  /** @type { Storage }
  */
  const storage = {
    albums: {},
    artists: {},
    tracks: {}
  };

  return new Promise((resolve) =>
  {
    // walk through all the listed audio directories
    walk(audioDirectories).then((files) =>
    {
      const promises = [];

      // loop through all files in the audio directories
      for (let i = 0; i < files.length; i++)
      {
        const file = files[i];

        // if the file matches any of those supported audio extensions
        if (file.match(AUDIO_EXTENSIONS_REGEX))
        {
          promises.push(
            // parse the file for the metadata
            getMetadata(file, { duration: true })
              .then((metadata) =>
              {
                // using the metadata fill
                // the storage object and cache it to the
                // hard disk

                const title = basename(file, extname(file));

                // if the audio metadata belongs in an album
                if (metadata.common.album)
                {
                  if (storage.albums[metadata.common.album])
                  {
                    storage.albums[metadata.common.album].tracks.push(title);

                    storage.albums[metadata.common.album].duration =
                      storage.albums[metadata.common.album].duration +
                      metadata.format.duration;
                  }
                  else
                  {
                    storage.albums[metadata.common.album] = {
                      artist: metadata.common.albumartist,
                      tracks: [ title ],
                      duration: metadata.format.duration
                    };
                  }
                }

                // if the audio metadata has a known artist
                if (metadata.common.artists)
                {
                  const artists = metadata.common.artists;

                  for (let i = 0; i < artists.length; i++)
                  {
                    if (storage.artists[artists[i]])
                    {
                      storage.artists[artists[i]].tracks.push(title);

                      storage.artists[artists[i]].duration =
                        storage.artists[artists[i]].duration +
                        metadata.format.duration;
                    }
                    else
                    {
                      storage.artists[artists[i]] = {
                        tracks: [ title ],
                        duration: metadata.format.duration
                      };
                    }
                  }
                }

                // store the track important metadata
                storage.tracks[title] = {
                  url: file,
                  artists: metadata.common.artists,
                  duration: metadata.format.duration
                };
              }));
        }
      }

      // when all files are parsed and added to the storage object
      // fill the storage info, then cache them,
      // then resolve this promise
      Promise.all(promises).then(() =>
      {
        const storageInfo = {
          date: Date.now()
        };

        resolve({ storageInfo, storage });
      });
    });
  });
}

/** @param  { StorageInfo } storageInfo
* @param  { Storage } storage
*/
function cacheStorage(storageInfo, storage)
{
  writeJson(storageInfoConfig, storageInfo);
  writeJson(storageConfig, storage);
}

/** @param  { number } date
* @return { Boolean }
*/
function isStorageOld(date)
{
  date = new Date(date);

  // add two days
  date.setDate(date.getDate() + 2);

  const now = new Date();

  // compares the current time with the cache time
  // if the cache time + two days < the current time
  // then that means it's been more than two days since the last time
  // storage been cached
  return (now.getTime() >= date.getTime());
}

function appendAlbumPlaceholder()
{
  const placeholder = createElement('.album.wrapper.placeholder');

  const container = createElement('.album.container');

  const cover = createElement('.album.cover');
  const card = createElement('.album.card');

  const tracks = createElement('.album.tracks');
  const background = createElement('.album.background');
  const title = createElement('.album.title');
  const duration = createElement('.album.duration');
  const artist = createElement('.album.artist');

  placeholder.appendChild(container);

  container.appendChild(cover);
  container.appendChild(card);

  card.appendChild(tracks);
  card.appendChild(background);
  card.appendChild(title);
  card.appendChild(duration);
  card.appendChild(artist);

  albumsContainer.appendChild(placeholder);

  return placeholder;
}

/** @param { HTMLDivElement } placeholder
* @param { { picture: string, title: string, artist: string, tracks: string[], duration: string } } options
*/
function updateAlbumElement(placeholder, options)
{
  if (placeholder.classList.contains('placeholder'))
    placeholder.classList.remove('placeholder');

  if (options.picture)
    placeholder.children[0].children[0].style.backgroundImage = `url(${options.picture})`;

  if (options.title)
    placeholder.children[0].children[1].children[2].innerText = options.title;

  if (options.duration)
    placeholder.children[0].children[1].children[3].innerText = options.duration;

  if (options.artist)
    placeholder.children[0].children[1].children[4].innerText = options.artist;

  if (options.tracks)
  {
    const tracksContainer = placeholder.children[0].children[1].children[0];

    for (let i = 0; i < options.tracks.length; i++)
    {
      if (tracksContainer.children.length - 1 >= i)
      {
        tracksContainer.children[i].innerText = options.tracks[i];
      }
      else
      {
        tracksContainer
          .appendChild(createElement('.album.track'))
          .innerText = options.tracks[i];
      }
    }
  }
}

function appendArtistPlaceholder()
{
  const placeholder = createElement('.artist.container.placeholder');

  const cover = createElement('.artist.cover');
  const title = createElement('.artist.title');

  placeholder.appendChild(cover);
  placeholder.appendChild(title);

  artistsContainer.appendChild(placeholder);

  return placeholder;
}

/** @param { HTMLDivElement } placeholder
* @param { { picture: string, title: string, description: string, albums: string[], tracks: string[] } } options
*/
function updateArtistElement(placeholder, options)
{
  if (placeholder.classList.contains('placeholder'))
    placeholder.classList.remove('placeholder');

  if (options.picture)
    placeholder.children[0].style.backgroundImage = `url(${options.picture})`;

  if (options.title)
    placeholder.children[1].innerText = options.title;
}

/** @param  { Storage } storage
*/
function appendAlbumsPageItems(storage)
{
  // remove all children from albums page
  removeAllChildren(albumsContainer);

  const albums = Object.keys(storage.albums);

  for (let i = 0; i < albums.length; i++)
  {
    const placeholder = appendAlbumPlaceholder();

    storage.albums[albums[i]].element = placeholder;

    const albumArtist = storage.albums[albums[i]].artist;
    const albumTracks = storage.albums[albums[i]].tracks;

    const track = storage.tracks[storage.albums[albums[i]].tracks[0]];

    const img = new Image();

    img.onload = () =>
    {
      updateAlbumElement(placeholder, {
        picture: img.src,
        title: albums[i],
        artist: albumArtist,
        tracks: albumTracks,
        duration: secondsToDuration(storage.albums[albums[i]].duration)
      });
    };

    getMetadata(track.url)
      .then(metadata =>
      {
        img.src = toBase64(metadata.common.picture[0]);
      });
  }
}

/** @param  { Storage } storage
*/
function appendArtistsPageItems(storage)
{
  // remove all children from artists pages
  removeAllChildren(artistsContainer);

  const artists = Object.keys(storage.artists);

  for (let i = 0; i < artists.length; i++)
  {
    const placeholder = appendArtistPlaceholder();

    const img = new Image();

    const track = storage.tracks[storage.artists[artists[i]].tracks[0]];

    img.onload = () =>
    {
      updateArtistElement(placeholder, {
        picture: img.src,
        title: artists[i]
      });
    };

    getMetadata(track.url)
      .then(metadata =>
      {
        img.src = toBase64(metadata.common.picture[0]);
      });
  }
}

/** @param  { Storage } storage
*/
function appendItems(storage)
{
  appendAlbumsPageItems(storage);
  appendArtistsPageItems(storage);
}

/** @param { HTMLElement } element
*/
function removeAllChildren(element)
{
  while (element.lastChild)
  {
    element.removeChild(element.lastChild);
  }
}

/** adds the directories to the save file and the scan array,
* and in the audio directories panel
* @param { string[] } directories
*/
export function addNewDirectories(directories)
{
  // add the new directories to the array
  audioDirectories.push(...directories);

  // add the new directories to the save file
  settings.set('audioDirectories', audioDirectories);

  // create a new dom element for each directory
  for (let i = 0; i < directories.length; i++)
  {
    appendDirectoryNode(directories[i]);
  }
}

/** removes the directory from the save file and the scan array
* @param { string } directory
*/
export function removeDirectory(directory)
{
  // remove the directory from the array
  audioDirectories.splice(audioDirectories.indexOf(directory), 1);

  // remove the directory from the save file
  settings.set('audioDirectories', audioDirectories);
}

/** @param { { format: string, data: Buffer } } picture
*/
function toBase64(picture)
{
  return `data:${picture.format};base64,${picture.data.toString('base64')}`;
}

/**@param { number } seconds
*/
function secondsToDuration(seconds)
{
  const minutes = Math.floor(seconds / 60);

  seconds = Math.floor(seconds - minutes * 60).toString();

  if (seconds.length > 2)
    seconds.substring(0, 2);
  else if (seconds.length === 1)
    seconds = `0${seconds}`;

  return `${minutes}:${seconds}`;
}
