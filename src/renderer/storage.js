import { remote } from 'electron';

import { existsSync, exists, stat, move, remove, writeJson, readJSON, readdir } from 'fs-extra';

import { join, dirname, basename, extname } from 'path';
import { homedir, tmpdir, platform } from 'os';

import * as settings from 'electron-json-config';

/** @type {{ download: (win: Electron.BrowserWindow, url: string, options: { saveAs: boolean, directory: string, filename: string, openFolderWhenDone: boolean, showBadge: boolean, onStarted: (item: Electron.DownloadItem) => void, onProgress: (percentage: number) => void, onCancel: () => void }) => Promise<Electron.DownloadItem> }}
*/
const { download: dl  } = remote.require('electron-dl');

import { parseFile as getMetadata } from 'music-metadata';
import getWiki from 'wikijs';

import { createElement, createIcon } from './renderer.js';
import { mainWindow, appendDirectoryNode } from './options.js';

const { isDebug } = remote.require(join(__dirname, '../main/window.js'));

/** @typedef { import('music-metadata').IAudioMetadata } Metadata
*/

/** @typedef { Object } StorageInfo
* @property { number } date
*/

/** @typedef { Object } Storage
* @property { Object<string, {  artist: string, tracks: string[], duration: number, element: HTMLDivElement }> } albums
* @property { Object<string, { tracks: string[], albums: string[], bio: string, pictureUrl: string, element: HTMLDivElement }> } artists
* @property { Object<string, { url: string, artists: string[], duration: number, element: HTMLDivElement }> } tracks
*/

const AUDIO_EXTENSIONS_REGEX = /.mp3$|.mpeg$|.opus$|.ogg$|.wav$|.aac$|.m4a$|.flac$/;

/* the base directory for the app config files
*/
const configDir = dirname(settings.file());

/**  @type { string }
*/
let missingPicture;

const wiki = getWiki();

/**  @type { HTMLDivElement }
*/
const albumsContainer = document.body.querySelector('.albums.container');

/**  @type { HTMLDivElement }
*/
const artistsContainer = document.body.querySelector('.artists.container');

/**  @type { HTMLDivElement }
*/
const tracksContainer = document.body.querySelector('.tracks.container');

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

  missingPicture = join(__dirname, '../../missing.png');

  storageInfoConfig = join(configDir, '/storageInfo.json');
  storageConfig = join(configDir, '/storage.json');

  // loaded the saved audio directories

  const savedAudioDirectories = settings.get('audioDirectories');

  // if now audio directories are saved, then use the OS default directory for music
  if (!savedAudioDirectories || !savedAudioDirectories.length <= 0)
    addNewDirectories([ getDefaultMusicDir() ]);
  else
    addNewDirectories(savedAudioDirectories);

  window.onbeforeunload = storageNavigation;

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
    remove(join(configDir, 'cache')).then(() =>
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

                  const title = metadata.common.title || basename(file, extname(file));
                  const artists = metadata.common.artists || [ 'Unknown Artist' ];

                  // store the track important metadata
                  storage.tracks[title] = {
                    url: file,
                    artists: artists,
                    duration: metadata.format.duration
                  };

                  // store the artist
                  for (let i = 0; i < artists.length; i++)
                  {
                    // if the artist isn't in the storage object yet
                    // add them
                    if (!storage.artists[artists[i]])
                    {
                      storage.artists[artists[i]] = {
                        tracks: [],
                        albums: []
                      };
                    }

                    // if the track does belong in an album and
                    // the album isn't added to the artist yet, and
                    // the album's artist is the same as the track's artist
                    if (metadata.common.album && metadata.common.albumartist === artists[i])
                    {
                      if (!storage.artists[artists[i]].albums.includes(metadata.common.album))
                        storage.artists[artists[i]].albums.push(metadata.common.album);
                    }
                    else if (!storage.artists[artists[i]].tracks.includes(title))
                      storage.artists[artists[i]].tracks.push(title);
                  }

                  // if the track belongs in an album, store the album
                  if (metadata.common.album)
                  {
                    const album = metadata.common.album;

                    // if the track's album is in the storage object already
                    if (storage.albums[album])
                    {
                      // push the new track to the album's list
                      storage.albums[album].tracks.push(title);

                      // add the track's duration to the overall album duration
                      storage.albums[album].duration =
                        storage.albums[album].duration +
                        metadata.format.duration;
                    }
                    else
                    {
                      // add the album to the storage object
                      storage.albums[album] = {
                        artist: metadata.common.albumartist || 'Unknown Artist',
                        tracks: [ title ],
                        duration: metadata.format.duration
                      };
                    }
                  }

                  // if there's a known artist, then get and store som information about them
                  // from Wikipeida
                  if (metadata.common.artists && metadata.common.artists.length > 0)
                  {
                    return metadata.common.artists;
                  }
                })
                // cache and store info like pictures, bio about the artists form Wikipedia
                .then(artists =>
                {
                  if (!artists)
                    return;

                  return new Promise((resolve) =>
                  {
                    const promises = [];

                    for (let i = 0; i < artists.length; i++)
                    {
                      if (!storage.artists[artists[i]].cachedWikiInfo)
                        promises.push(cacheArtist(artists[i], storage));
                    }

                    Promise.all(promises).then(resolve);
                  });
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

/** adds a summary and a picture url for an artist to the storage object
* @param { string } artist
* @param { Storage } storage
*/
function cacheArtist(artist, storage)
{
  // set a boolean to stop caching for every track from the same artist
  storage.artists[artist].cachedWikiInfo = true;

  return new Promise((resolve) =>
  {
    const regex = /[0-9a-zA-z\s]/g;
    const promises = [];

    wiki.search(artist)
      .then(search =>
      {
        for (let i = 0; i < search.results.length; i++)
        {
          if (search.results[i].match(regex)[0].indexOf(artist.match(regex)[0]) > -1)
            return wiki.page(search.results[i]);
        }
      })
      .then(page =>
      {
        if (page)
        {
          promises.push(page.summary().then(summary => storage.artists[artist].bio = summary));
          promises.push(page.mainImage().then(imageUrl => storage.artists[artist].pictureUrl = imageUrl));
        }

        Promise.all(promises).then(resolve);
      });
  });
}

function appendAlbumPlaceholder()
{
  const placeholderWrapper = createElement('.album.wrapper.placeholder');

  const albumContainer = createElement('.album.container');

  const cover = createElement('.album.cover');
  const card = createElement('.album.card');

  const tracks = createElement('.album.tracks');
  const background = createElement('.album.background');
  const title = createElement('.album.title');
  const duration = createElement('.album.duration');
  const artist = createElement('.album.artist');

  placeholderWrapper.appendChild(albumContainer);

  albumContainer.appendChild(cover);
  albumContainer.appendChild(card);

  card.appendChild(tracks);
  card.appendChild(background);
  card.appendChild(title);
  card.appendChild(duration);
  card.appendChild(artist);

  albumsContainer.appendChild(placeholderWrapper);

  return placeholderWrapper;
}

/** @param { HTMLDivElement } placeholder
* @param { { picture: string, title: string, artist: string, tracks: string[], duration: string } } options
*/
function updateAlbumElement(placeholder, options)
{
  if (placeholder.classList.contains('placeholder'))
    placeholder.classList.remove('placeholder');

  if (options.picture)
  {
    placeholder.querySelector('.album.cover').style.backgroundImage = `url(${options.picture})`;
  }

  if (options.title)
    placeholder.querySelector('.album.title').innerText = options.title;

  if (options.duration)
    placeholder.querySelector('.album.duration').innerText = options.duration;

  if (options.artist)
    placeholder.querySelector('.album.artist').innerHTML =
    `by <a href='artists:${options.artist}' class='album artistLink'>${options.artist}</a>`;

  if (options.tracks)
  {
    const tracksContainer = placeholder.querySelector('.album.tracks');

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

  placeholder.dispatchEvent(new Event('albumItemUpdate'));
}

/** @param { Storage } storage
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

    const img = new Image();

    img.src = missingPicture;

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

    const track = storage.tracks[storage.albums[albums[i]].tracks[0]];

    getMetadata(track.url)
      .then(metadata =>
      {
        if (metadata.common.picture && metadata.common.picture.length > 0)
          img.src = toBase64(metadata.common.picture[0]);
      });
  }
}

function appendArtistPlaceholder()
{
  const placeholderWrapper = createElement('.artist.wrapper.placeholder');
  const placeholderContainer = createElement('.artist.container');

  const cover = createElement('.artist.cover');
  const card = createElement('.artist.card');

  const title = createElement('.artist.title');
  const stats = createElement('.artist.stats');

  const overlayWrapper = createElement('.artistOverlay.wrapper');
  const overlayBackground = createElement('.artistOverlay.background');
  const overlayContainer = createElement('.artistOverlay.container');

  const overlayCard = createElement('.artistOverlay.card');

  const overlayCover = createElement('.artistOverlay.cover');
  const overlayHide = createElement('.artistOverlay.hide');
  const overlayDownward = createIcon('downward', '.artistOverlay.downward');
  const overlayTitle = createElement('.artistOverlay.title');
  const overlayButton = createElement('.artistOverlay.button');

  const overlayBio = createElement('.artistOverlay.bio');

  const albumsText = createElement('.artistOverlay.text.albums');
  const albumsContainer = createElement('.albums.container');

  const tracksText = createElement('.artistOverlay.text.tracks');
  const tracksContainer = createElement('.tracks.container');

  placeholderWrapper.appendChild(placeholderContainer);
  placeholderWrapper.appendChild(overlayBackground);
  placeholderWrapper.appendChild(overlayWrapper);

  overlayWrapper.appendChild(overlayContainer);

  placeholderContainer.appendChild(cover);
  placeholderContainer.appendChild(card);

  card.appendChild(title);
  card.appendChild(stats);

  overlayContainer.appendChild(overlayCard);

  overlayCard.appendChild(overlayCover);
  overlayCard.appendChild(overlayHide);
  overlayHide.appendChild(overlayDownward);
  overlayCard.appendChild(overlayTitle);
  overlayCard.appendChild(overlayButton);

  overlayContainer.appendChild(overlayBio);

  overlayContainer.appendChild(albumsText);
  overlayContainer.appendChild(albumsContainer);

  overlayContainer.appendChild(tracksText);
  overlayContainer.appendChild(tracksContainer);

  artistsContainer.appendChild(placeholderWrapper);

  return placeholderWrapper;
}

/** @param { HTMLDivElement } placeholder
* @param { { picture: string, title: string, bio: string, albums: string[], tracks: string[], storage: Storage } } options
*/
function updateArtistElement(placeholder, options)
{
  if (placeholder.classList.contains('placeholder'))
  {
    placeholder.classList.remove('placeholder');

    placeholder.querySelector('.artist.container').onclick =
    placeholder.querySelector('.artistOverlay.hide').onclick =
    () => placeholder.classList.toggle('activeOverlay');
  }

  if (options.picture)
    placeholder.querySelector('.artist.cover').style.backgroundImage =
    placeholder.querySelector('.artistOverlay.cover').style.backgroundImage = `url(${options.picture})`;

  if (options.title)
  {
    placeholder.querySelector('.artist.title').innerText =
    placeholder.querySelector('.artistOverlay.title').innerText = options.title;

    placeholder.querySelector('.artistOverlay.button').innerHTML =
    `<a href='play-artist:${options.title}' class='artistOverlay button'> Play</a>`;
  }

  if (options.bio)
    placeholder.querySelector('.artistOverlay.bio').innerText = options.bio;

  if (options.albums.length > 0 || options.tracks.length > 0)
  {
    const stats = placeholder.querySelector('.artist.stats');

    const albumsText = placeholder.querySelector('.text.albums');
    const albumsContainer = placeholder.querySelector('.albums.container');

    const tracksText = placeholder.querySelector('.text.tracks');
    const tracksContainer = placeholder.querySelector('.tracks.container');

    stats.innerText = '';

    albumsText.innerText = '';
    tracksText.innerText = '';

    if (options.albums.length > 0)
    {
      removeAllChildren(albumsContainer);

      stats.innerText =
      `${options.albums.length} Album${(options.albums.length > 1) ? 's' : ''}`;

      albumsText.innerText = 'Albums';

      for (let i = 0; i < options.albums.length; i++)
      {
        const album = options.storage.albums[options.albums[i]];
        const clone = album.element.cloneNode(true);

        albumsContainer.appendChild(clone);

        album.element.addEventListener('albumItemUpdate', () =>
        {
          clone.innerHTML = album.element.innerHTML;
        });
      }
    }

    if (options.tracks.length > 0)
    {
      removeAllChildren(tracksContainer);

      if (stats.innerText.length > 0)
        stats.innerText = stats.innerText + ' | ';

      stats.innerText = stats.innerText +
      `${options.tracks.length} Track${(options.tracks.length > 1) ? 's' : ''}`;

      tracksText.innerText = 'Tracks';

      for (let i = 0; i < options.tracks.length; i++)
      {
        const track = options.storage.tracks[options.tracks[i]];
        const clone = track.element.cloneNode(true);

        tracksContainer.appendChild(clone);

        track.element.addEventListener('trackItemUpdate', () =>
        {
          clone.innerHTML = track.element.innerHTML;
        });
      }
    }
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
    const artistPicture = join(configDir, 'cache', artists[i]);
    const placeholder = appendArtistPlaceholder();

    const img = new Image();

    img.src = missingPicture;

    img.onload = () =>
    {
      updateArtistElement(placeholder, {
        picture: img.src,
        title: artists[i],
        bio: storage.artists[artists[i]].bio,
        albums: storage.artists[artists[i]].albums,
        tracks: storage.artists[artists[i]].tracks,
        storage: storage
      });
    };

    // if image for the artist exists
    exists(artistPicture).then((exists) =>
    {
      // if it does load it
      if (exists)
      {
        img.src = artistPicture;
      }
      // else download/cache one form Wikipedia then load it
      else if (storage.artists[artists[i]].pictureUrl)
      {
        dl(mainWindow, storage.artists[artists[i]].pictureUrl, {
          directory: tmpdir(),
          filename: artists[i],
          showBadge: false
        })
          .then(() => move(join(tmpdir(), artists[i]), artistPicture))
          .then(() => img.src = artistPicture);
      }
    });
  }
}

function appendTracksPlaceholder()
{
  const placeholderWrapper = createElement('.track.wrapper.placeholder');
  const placeholderContainer = createElement('.track.container');

  const cover = createElement('.track.cover');
  const card = createElement('.track.card');

  const artist = createElement('.track.artist');
  const title = createElement('.track.title');
  const duration = createElement('.track.duration');

  placeholderWrapper.appendChild(placeholderContainer);

  placeholderContainer.appendChild(cover);
  placeholderContainer.appendChild(card);

  card.appendChild(artist);
  card.appendChild(title);
  card.appendChild(duration);

  tracksContainer.appendChild(placeholderWrapper);

  return placeholderWrapper;
}

/** @param { HTMLDivElement } placeholder
* @param { { picture: string, artist: string, title: string, duration: string } } options
*/
function updateTracksElement(placeholder, options)
{
  if (placeholder.classList.contains('placeholder'))
    placeholder.classList.remove('placeholder');

  if (options.picture)
    placeholder.querySelector('.track.cover').style.backgroundImage = `url(${options.picture})`;

  if (options.artist)
    placeholder.querySelector('.track.artist').innerHTML =
    `<a href='artists:${options.artist}' class='track artistLink'>${options.artist}</a>`;

  if (options.title)
    placeholder.querySelector('.track.title').innerText = options.title;

  if (options.duration)
    placeholder.querySelector('.track.duration').innerText = options.duration;

  placeholder.dispatchEvent(new Event('trackItemUpdate'));
}

/** @param  { Storage } storage
*/
function appendTracksPageItems(storage)
{
  // remove all children from tracks pages
  removeAllChildren(tracksContainer);

  const tracks = Object.keys(storage.tracks);

  for (let i = 0; i < tracks.length; i++)
  {
    const placeholder = appendTracksPlaceholder();

    storage.tracks[tracks[i]].element = placeholder;

    const track = storage.tracks[tracks[i]];
    const img = new Image();

    img.src = missingPicture;

    img.onload = () =>
    {
      updateTracksElement(placeholder, {
        picture: img.src,
        artist: track.artists.join(', '),
        title: tracks[i],
        duration: secondsToDuration(track.duration)
      });
    };

    getMetadata(track.url)
      .then(metadata =>
      {
        if (metadata.common.picture && metadata.common.picture.length > 0)
          img.src = toBase64(metadata.common.picture[0]);
      });
  }
}

/** @param  { Storage } storage
*/
function appendItems(storage)
{
  appendAlbumsPageItems(storage);
  appendTracksPageItems(storage);
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

function storageNavigation()
{
  // storage key
  // console.log(document.activeElement.href.match(/.+:/)[0].slice(0, -1));

  // storage value
  // console.log(document.activeElement.href.match(/:.+/)[0].substring(1));
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
