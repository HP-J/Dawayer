import { remote } from 'electron';

import { existsSync, exists, stat, emptyDir, writeFile, writeJson, readJSON, readdir } from 'fs-extra';

import { union } from 'lodash';
import { join, dirname, basename, extname } from 'path';
import { homedir, platform } from 'os';

import * as settings from '../settings.js';

import download from 'download';

import { parseFile as getMetadata } from 'music-metadata';
import getLastFm from 'last-fm';

import { createElement, createIcon, createContextMenu } from './renderer.js';
import { appendDirectoryNode } from './options.js';
import { queueStorageTracks, setPlayingIndex } from './playback.js';

const { isDebug } = remote.require(join(__dirname, '../main/window.js'));

/** @typedef { import('music-metadata').IAudioMetadata } Metadata
*/

/** @typedef { Object } StorageInfo
* @property { number } date
*/

/** @typedef { Object } Storage
* @property { Object<string, {  artist: string[], tracks: string[], duration: number, element: HTMLDivElement }> } albums
* @property { Object<string, { tracks: string[], albums: string[], bio: string, element: HTMLDivElement }> } artists
* @property { Object<string, { title: string, picture: boolean, artists: string[], duration: number, element: HTMLDivElement }> } tracks
*/

export const audioExtensionsRegex = /.mp3$|.mpeg$|.opus$|.ogg$|.wav$|.aac$|.m4a$|.flac$/;

/* the base directory for the app config files
*/
const configDir = dirname(settings.getPath());

export const artistsRegex = /,\s+|\s+ft.?\s+|\s+feat.?\s+/g;

/**  @type { string }
*/
export const missingPicture = join(__dirname, '../../missing.png');

const lastfm = new getLastFm('f7bad3bd904131752e9bf050562a00ee');

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

/** @type { (target: string) => {} }
*/
let navigation;

/** @type { string }
*/
const storageInfoConfig = join(configDir, '/storageInfo.json');

/** @type { string }
*/
const storageConfig = join(configDir, '/storage.json');

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
  const currentPlatform = platform();

  if (currentPlatform === 'linux' || currentPlatform === 'win32')
    return join(homedir(), '/Music');
}

/** initialize the cache system and loads local tracks, albums and artists, appending an element
* for each of them
*/
export function initStorage()
{
  // loaded the saved audio directories

  const savedAudioDirectories = settings.get('audioDirectories');

  // TEST the default music dir on windows
  // console.log(getDefaultMusicDir());

  // skip button hides any active artist overlay
  window.addEventListener('keydown', (event) =>
  {
    if (event.key === 'Escape')
    {
      event.preventDefault();

      hideActiveArtistOverlay();
    }
  });

  // if now audio directories are saved then use the OS default directory for music
  if (!savedAudioDirectories || savedAudioDirectories.length <= 0)
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

        navigation = (...keys) => storageNavigation(storage, ...keys);

        // update the cache if it's older than 2 days
        // take effect when the app is re-opened
        if (isStorageOld(storageInfo.date))
        {
          scanCacheAudioFiles().then((scan) =>
          {
            cacheStorage(scan.storageInfo, scan.storage);
            cacheArtists(scan.storage);
          });
        }
      });
  }
  // if not then scan the audio directories for the audio files,
  // load them and then create a new cache for them
  else
  {
    rescanStorage();
  }
}

/** scan the audio directories for audio files then parses them for their metadata,
* and adds the important data to the storage object
*/
function scanCacheAudioFiles()
{
  /** @type { Storage }
  */
  const storage = {
    albums: {},
    artists: {},
    tracks: {}
  };

  const rescanElement = document.body.querySelector('.option.rescan');

  rescanElement.innerText = 'Scanning';
  rescanElement.classList.add('.clean');

  return new Promise((resolve) =>
  {
    // empty the artists cache directory and ensures that it exists
    emptyDir(join(configDir, 'ArtistsCache')).then(() =>
    {
      // walk through all the listed audio directories
      walk(audioDirectories)
        // filter and sort files alphabetically
        .then((files) =>
        {
          return files
            // if the file matches any of those supported audio extensions
            .filter((file) => file.match(audioExtensionsRegex))
            // sort tracks alphabetically
            .sort((a, b) =>
            {
              a = a.toLowerCase();
              b = b.toLowerCase();

              if (a < b)
                return -1;
              if (a > b)
                return 1;
              
              return 0;
            });
        })
        // get metadata
        .then((files) =>
        {
          const promises = [];

          // loop through all files in the audio directories
          for (let i = 0; i < files.length; i++)
          {
            const file = files[i];

            promises.push(
              // parse the file for the metadata
              getMetadata(file, { duration: true })
                .then((metadata) =>
                {
                  // using the metadata fill
                  // the storage object and cache it to the
                  // hard disk

                  rescanElement.innerText = `Scanning ${Math.round((i / files.length) * 100)}%`;

                  const title = metadata.common.title || basename(file, extname(file));
                  const duration = metadata.format.duration;

                  let artists = metadata.common.artists || [ 'Unknown Artist' ];

                  // split artists by comma
                  artists = union(...[].concat(artists).map((v) => v.split(artistsRegex)));

                  const albumTitle = metadata.common.album || 'Other';
                  let albumArtist = metadata.common.albumartist || 'Unknown Artist';

                  // split artists by comma
                  albumArtist = albumArtist.split(artistsRegex);

                  // store the track important metadata
                  storage.tracks[file] = {
                    title: title,
                    picture: (metadata.common.picture && metadata.common.picture.length > 0),
                    artists: artists,
                    duration: duration
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
                    // and the artist isn't unknown
                    // the album's artist is the same as the track's artist
                    if (albumTitle && artists[i] !== 'Unknown Artist' && albumArtist.includes(artists[i]))
                    {
                      // if the album isn't added to the artist yet
                      if (!storage.artists[artists[i]].albums.includes(albumTitle))
                        storage.artists[artists[i]].albums.push(albumTitle);
                    }
                    else if (!storage.artists[artists[i]].tracks.includes(file))
                    {
                      storage.artists[artists[i]].tracks.push(file);
                    }
                  }

                  // if the track belongs in an album, store the album
                  // if the track's album is in the storage object already
                  if (storage.albums[albumTitle])
                  {
                    // push the new track to the album's list
                    storage.albums[albumTitle].tracks.push(file);

                    // add the track's duration to the overall album duration
                    storage.albums[albumTitle].duration =
                    storage.albums[albumTitle].duration + duration;
                  }
                  else
                  {
                    // add the album to the storage object
                    storage.albums[albumTitle] = {
                      artist: albumArtist,
                      tracks: [ file ],
                      duration: duration
                    };
                  }

                  // make sure that all artists of the album have entries and pages
                  for (let i = 0; i < albumArtist.length; i++)
                  {
                    if (albumArtist[i] === 'Unknown Artist')
                      continue;
                    
                    if (storage.artists[albumArtist[i]])
                    {
                      if (!storage.artists[albumArtist[i]].albums.includes(albumTitle))
                        storage.artists[albumArtist[i]].albums.push(albumTitle);
                    }
                    else
                    {
                      storage.artists[albumArtist[i]] = {
                        tracks: [],
                        albums: [ albumTitle ]
                      };
                    }
                  }
                }));
          }

          // when all files are parsed and added to the storage object
          // fill the storage info then cache them,
          // then resolve this promise
          Promise.all(promises).then(() =>
          {
            const storageInfo = {
              date: Date.now()
            };

            rescanElement.innerText = 'Rescan';
            rescanElement.classList.remove('.clean');

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
  if (storageInfo)
    writeJson(storageInfoConfig, storageInfo);

  if (storage)
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

/** cache and store info like pictures, bio about the artists form Wikipedia
* @param { Storage } storage
*/
function cacheArtists(storage)
{
  const promises = [];

  for (const track in storage.tracks)
  {
    const artists = storage.tracks[track].artists;

    if (!artists)
      continue;
    
    for (let i = 0; i < artists.length; i++)
    {
      if (!storage.artists[artists[i]].cachedWikiInfo)
        promises.push(cacheArtist(artists[i], storage));
    }
  }

  Promise.all(promises).then(() => cacheStorage(undefined, storage));
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
    // don't get info about unknown artists
    if (artist === 'Unknown Artist')
    {
      resolve();

      return;
    }

    const regex = /[^a-zA-Z0-9]+/g;
    
    lastfm.artistSearch({
      q: artist,
      limit: 3
    }, (err, data) =>
    {
      if (err)
      {
        resolve();

        return;
      }

      const artistForSearch = artist.replace(regex, ' ');

      for (let i = 0; i < data.result.length; i++)
      {
        if (data.result[i].name.replace(regex, ' ').indexOf(artistForSearch) > -1)
        {
          // the array is different sizes of the same picture
          // the third picture size is large
          if (data.result[i].images.length > 3)
            cacheImage(data.result[i].images[3]);

          cacheSummary(data.result[i].name);
          
          break;
        }
      }
    });

    function cacheImage(pictureUrl)
    {
      const picturePath = join(configDir, 'ArtistsCache', artist);

      download(pictureUrl).then((data) => writeFile(picturePath, data)).then(() =>
      {
        const img = new Image();

        img.src = picturePath;

        img.onload = () =>
        {
          updateArtistElement(storage.artists[artist].element, {
            picture: img.src
          });
        };
      });
    }

    function cacheSummary(name)
    {
      lastfm.artistInfo({
        name: name
      }, (err, data) =>
      {
        if (err || !data.summary)
        {
          resolve();

          return;
        }

        storage.artists[artist].bio = data.summary;

        updateArtistElement(storage.artists[artist].element, {
          bio: data.summary
        });

        resolve();
      });
    }
  });
}

function appendAlbumPlaceholder()
{
  const placeholderWrapper = createElement('.album.wrapper.placeholder');

  const albumContainer = createElement('.album.container');

  const cover = createElement('.album.cover');
  const tracks = createElement('.album.tracks');
  const card = createElement('.album.card');

  const title = createElement('.album.title');
  const duration = createElement('.album.duration');
  const artist = createElement('.album.artist');

  placeholderWrapper.appendChild(albumContainer);

  albumContainer.appendChild(cover);
  albumContainer.appendChild(tracks);
  albumContainer.appendChild(card);

  card.appendChild(title);
  card.appendChild(duration);
  card.appendChild(artist);

  albumsContainer.appendChild(placeholderWrapper);

  return placeholderWrapper;
}

/** @param { HTMLDivElement } placeholder
* @param { { picture: string, title: string, artist: string[], tracks: string[], duration: string } } options
* @param { Storage } storage
*/
function updateAlbumElement(placeholder, options, storage)
{
  if (placeholder.classList.contains('placeholder'))
    placeholder.classList.remove('placeholder');

  if (options.picture)
  {
    placeholder.querySelector('.album.cover').style.backgroundImage = `url(${options.picture})`;
  }

  if (options.title)
  {
    placeholder.querySelector('.album.title').innerText = options.title;

    placeholder.onclick = () => navigation('play-album', options.title);

    useContextMenu(placeholder, [ options.title ], 'album', placeholder);
  }

  if (options.duration)
    placeholder.querySelector('.album.duration').innerText = options.duration;

  if (options.artist)
  {
    const artist = placeholder.querySelector('.album.artist');

    removeAllChildren(artist);

    for (let i = 0; i < options.artist.length; i++)
    {
      const artistLink = createElement('.album.artistLink', 'a');

      artistLink.innerText = options.artist[i];
      artistLink.onclick = (event) =>
      {
        event.stopPropagation();

        navigation('artists', options.artist[i]);
      };

      if (i > 0)
        artist.appendChild(document.createTextNode(', '));
      else
        artist.appendChild(document.createTextNode('by '));

      artist.appendChild(artistLink);
    }
  }

  if (options.tracks)
  {
    const tracksContainer = placeholder.querySelector('.album.tracks');

    for (let i = 0; i < options.tracks.length; i++)
    {
      // if updating the album's tracks
      if (tracksContainer.children.length - 1 >= i)
      {
        tracksContainer.children[i].innerText = storage.tracks[options.tracks[i]].title;
        tracksContainer.children[i].onclick = (event) =>
        {
          event.stopPropagation();

          navigation('play-album-track', options.title, i);
        };

        useContextMenu(tracksContainer.children[i], [ options.title, i ], 'album-track', placeholder);
      }
      else
      {
        const track = createElement('.album.track');

        track.innerText = storage.tracks[options.tracks[i]].title;
        track.onclick = (event) =>
        {
          event.stopPropagation();

          navigation('play-album-track', options.title, i);
        };

        useContextMenu(track, [ options.title, i ], 'album-track', placeholder);

        tracksContainer.appendChild(track);
      }
    }
  }
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
      }, storage);
    };

    for (let x = 0; x < storage.albums[albums[i]].tracks.length; x++)
    {
      const trackUrl = storage.albums[albums[i]].tracks[x];

      if (storage.tracks[trackUrl].picture)
      {
        if (storage.tracks[trackUrl].picture)
        {
          getMetadata(trackUrl)
            .then(metadata =>
            {
              if (metadata.common.picture && metadata.common.picture.length > 0)
              {
                img.src = toBase64(metadata.common.picture[0]);
              }
            });

          break;
        }
      }
    }
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

    placeholder.querySelector('.artistOverlay.hide').onclick = hideActiveArtistOverlay;
  }

  if (options.picture)
  {
    placeholder.querySelector('.artist.cover').style.backgroundImage =
    placeholder.querySelector('.artistOverlay.cover').style.backgroundImage = `url(${options.picture})`;
  }

  if (options.title)
  {
    placeholder.querySelector('.artist.container').onclick = () => navigation('artists', options.title);

    placeholder.querySelector('.artist.title').innerText =
    placeholder.querySelector('.artistOverlay.title').innerText = options.title;

    const playElement = placeholder.querySelector('.artistOverlay.button');

    playElement.innerText = 'Play';
    playElement.onclick = () => navigation('play-artist', options.title);

    useContextMenu(placeholder, [ options.title ], 'artist', placeholder);
  }

  if (options.bio)
    placeholder.querySelector('.artistOverlay.bio').innerText = options.bio;

  if ((options.albums && options.albums.length > 0) || (options.tracks && options.tracks.length > 0))
  {
    const stats = placeholder.querySelector('.artist.stats');

    const albumsText = placeholder.querySelector('.text.albums');
    const tracksText = placeholder.querySelector('.text.tracks');

    // clear the text for albums and track outside the overlay
    stats.innerText = '';

    // clear the text for albums and track inside the overlay
    albumsText.innerText = '';
    tracksText.innerText = '';

    // if their is albums for the artist then
    // add the number of them to the outside of the overlay
    // and add the albums title inside of the overlay
    if (options.albums && options.albums.length > 0)
    {
      stats.innerText =
      `${options.albums.length} Album${(options.albums.length > 1) ? 's' : ''}`;

      albumsText.innerText = 'Albums';
    }

    // if their is tracks for the artist then
    // add the number of them to the outside of the overlay
    // and add the tracks title inside of the overlay
    if (options.tracks && options.tracks.length > 0)
    {
      stats.innerText = stats.innerText + ((stats.innerText.length > 0) ? ', ' : '') +
      `${options.tracks.length} Track${(options.tracks.length > 1) ? 's' : ''}`;

      tracksText.innerText = 'Tracks';
    }
  }
}

/** @param { Storage } storage
*/
function appendArtistsPageItems(storage)
{
  // remove all children from artists pages
  removeAllChildren(artistsContainer);

  const artists = Object.keys(storage.artists);

  for (let i = 0; i < artists.length; i++)
  {
    const artistPicture = join(configDir, 'ArtistsCache', artists[i]);
    
    const placeholder = appendArtistPlaceholder();

    storage.artists[artists[i]].element = placeholder;

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

    // if it does load it
    exists(artistPicture).then((exists) =>
    {
      if (exists)
        img.src = artistPicture;
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
* @param { { picture: string, artist: string[], title: string, url: string, duration: string } } options
*/
function updateTracksElement(placeholder, options)
{
  if (placeholder.classList.contains('placeholder'))
    placeholder.classList.remove('placeholder');

  if (options.picture)
    placeholder.querySelector('.track.cover').style.backgroundImage = `url(${options.picture})`;

  if (options.artist)
  {
    const artist = placeholder.querySelector('.track.artist');

    removeAllChildren(artist);

    for (let i = 0; i < options.artist.length; i++)
    {
      const artistLink = createElement('.track.artistLink', 'a');

      artistLink.innerText = options.artist[i];
      artistLink.onclick = (event) =>
      {
        event.stopPropagation();

        navigation('artists', options.artist[i]);
      };

      if (i > 0)
        artist.appendChild(document.createTextNode(', '));

      artist.appendChild(artistLink);
    }
  }

  if (options.title)
  {
    placeholder.querySelector('.track.title').innerText = options.title;

    placeholder.onclick = () => navigation('play-track', options.url);

    useContextMenu(placeholder, [ options.url ], 'track', placeholder);
  }

  if (options.duration)
    placeholder.querySelector('.track.duration').innerText = options.duration;
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
        artist: track.artists,
        title: track.title,
        url: tracks[i],
        duration: secondsToDuration(track.duration)
      });
    };

    getMetadata(tracks[i])
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
export function removeAllChildren(element)
{
  while (element.lastChild)
  {
    element.removeChild(element.lastChild);
  }
}

/** because clicking an artist name should take you to them
* @param { Storage } storage
* @param { string } target
*/
function storageNavigation(storage, ...keys)
{
  // toggle the artist's overlay
  if (keys[0] === 'artists')
  {
    showArtistOverlay(storage, storage.artists[keys[1]].element);
  }
  // play the track
  else if (keys[0] === 'play-track' || keys[0] === 'add-track')
  {
    // clear the queue then play the track
    if (keys[0] === 'play-track')
      queueStorageTracks(storage, true, keys[1]);
    // queue the track at bottom
    else
      queueStorageTracks(storage, false, keys[1]);
  }
  // play the album from a selected track
  else if (keys[0] === 'play-album-track' || keys[0] === 'add-album-track')
  {
    // clear the queue then play the album
    if (keys[0] === 'play-album-track')
    {
      queueStorageTracks(storage, true, ...storage.albums[keys[1]].tracks).then(() =>
      {
        // start playback from a selected track
        setPlayingIndex(parseInt(keys[2]));
      });
    }
    // queue the album at bottom
    else
    {
      queueStorageTracks(storage, false, ...storage.albums[keys[1]].tracks).then((queue) =>
      {
        const trackUrl = storage.albums[keys[1]].tracks[parseInt(keys[2])];
        const trackQueueIndex = queue.findIndex((value) => value.url === trackUrl);

        // start playback from a selected track
        setPlayingIndex(trackQueueIndex);
      });
    }
  }
  // play the album
  else if (keys[0] === 'play-album' || keys[0] === 'add-album')
  {
    // clear the queue then play the album
    if (keys[0] === 'play-album')
      queueStorageTracks(storage, true, ...storage.albums[keys[1]].tracks);
    // queue the album at bottom
    else
      queueStorageTracks(storage, false, ...storage.albums[keys[1]].tracks);
  }
  // play the artist's tracks and/or albums
  else if (keys[0] === 'play-artist' || keys[0] === 'add-artist')
  {
    const tracks = [];

    // push the albums
    for (let i = 0; i < storage.artists[keys[1]].albums.length; i++)
    {
      tracks.push(...storage.albums[storage.artists[keys[1]].albums[i]].tracks);
    }

    // push the individual tracks
    tracks.push(...storage.artists[keys[1]].tracks);

    // clear the queue then play the tracks
    if (keys[0] === 'play-artist')
      queueStorageTracks(storage, true, ...tracks);
    // queue the tracks at bottom
    else
      queueStorageTracks(storage, false, ...tracks);
  }
}

/** @param { Storage } storage
* @param { HTMLElement } element
*/
function showArtistOverlay(storage, element)
{
  // only one overlay is to be shown at once
  // TODO hide the opened one, and open the new one
  if (window.activeArtistOverlay)
    return;

  // the artist name
  const artist = element.querySelector('.title').innerText;

  // set the overlay as active
  window.activeArtistOverlay = {
    element: element,
    albumPlaceholders: [],
    trackPlaceholders: []
  };

  const albums = storage.artists[artist].albums;
  const tracks = storage.artists[artist].tracks;

  const overlayAlbumsContainer = element.querySelector('.albums.container');
  const overlayTracksContainer = element.querySelector('.tracks.container');

  for (let i = 0; i < albums.length; i++)
  {
    const placeholder = createElement();
    const albumElement = storage.albums[albums[i]].element;

    window.activeArtistOverlay.albumPlaceholders.push(placeholder);

    albumsContainer.replaceChild(placeholder, albumElement);
    overlayAlbumsContainer.appendChild(albumElement);
  }

  for (let i = 0; i < tracks.length; i++)
  {
    const placeholder = createElement();
    const trackElement = storage.tracks[tracks[i]].element;

    window.activeArtistOverlay.trackPlaceholders.push(placeholder);

    tracksContainer.replaceChild(placeholder, trackElement);
    overlayTracksContainer.appendChild(trackElement);
  }

  element.classList.add('activeOverlay');
}

function hideActiveArtistOverlay()
{
  /** @type { { element: HTMLElement, albumPlaceholders: HTMLElement[], trackPlaceholders: HTMLElement[] } }
  */
  const activeOverlayObject = window.activeArtistOverlay;

  // if no overlay is currently active then return
  if (!activeOverlayObject)
    return;
  
  // hide the overlay from the user
  activeOverlayObject.element.classList.remove('activeOverlay');

  // const artist = element.querySelector('.title').innerText;

  // wait the transaction time (0.35s)
  // then return the rented element to their original places
  setTimeout(() =>
  {
    const overlayAlbumsContainer = activeOverlayObject.element.querySelector('.albums.container');
    const overlayTracksContainer = activeOverlayObject.element.querySelector('.tracks.container');

    const albumPlaceholders = activeOverlayObject.albumPlaceholders;
    const trackPlaceholders = activeOverlayObject.trackPlaceholders;

    for (let i = 0; i < albumPlaceholders.length; i++)
    {
      albumsContainer.replaceChild(overlayAlbumsContainer.firstChild, albumPlaceholders[i]);
    }

    for (let i = 0; i < trackPlaceholders.length; i++)
    {
      tracksContainer.replaceChild(overlayTracksContainer.firstChild, trackPlaceholders[i]);
    }

    // set the active overlay as null
    window.activeArtistOverlay = undefined;
  }, 350);
}

/** @param { HTMLElement } element
* @param { string } title
* @param { string[] } navigationKeys
* @param { 'track' | 'album-track' | 'album' | 'artist' } type
* @param { HTMLElement } parentElement
*/
function useContextMenu(element, navigationKeys, type, parentElement)
{
  createContextMenu(element, {
    'Play': () =>
    {
      navigation(`play-${type}`, ...navigationKeys);
    },
    'Add to Queue': () =>
    {
      navigation(`add-${type}`, ...navigationKeys);
    }
  }, parentElement);
}

export function rescanStorage()
{
  scanCacheAudioFiles().then((scan) =>
  {
    cacheStorage(scan.storageInfo, scan.storage);

    appendItems(scan.storage);
    cacheArtists(scan.storage);
    
    navigation = (...keys) => storageNavigation(scan.storage, ...keys);
  });
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
export function toBase64(picture)
{
  return `data:${picture.format};base64,${picture.data.toString('base64')}`;
}

/**@param { number } seconds
*/
export function secondsToDuration(seconds)
{
  const minutes = Math.floor(seconds / 60);

  seconds = Math.floor(seconds - minutes * 60).toString();

  if (seconds.length > 2)
    seconds.substring(0, 2);
  else if (seconds.length === 1)
    seconds = `0${seconds}`;

  return `${minutes}:${seconds}`;
}
