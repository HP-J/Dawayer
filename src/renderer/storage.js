import { remote } from 'electron';

import { existsSync, pathExists, stat, emptyDir, writeJson, readJSON, readdir } from 'fs-extra';

import { join, basename, extname } from 'path';
import { homedir, platform } from 'os';

import { union } from 'lodash';

import * as settings from '../settings.js';

import { parseFile as getMetadata } from 'music-metadata';

import { createElement, createIcon, createContextMenu, switchPlayingMode } from './renderer.js';

import { appendDirectoryNode } from './options.js';
import { queueStorageTracks } from './playback.js';

const { isDebug } = remote.require(join(__dirname, '../main/window.js'));

/** @typedef { import('music-metadata').IAudioMetadata } Metadata
*/

/** @typedef { Object } StorageInfo
* @property { number } date
*/

/** @typedef { Object } Album
* @property { string[] } artist
* @property { string[] } tracks
* @property { number } duration
* @property { HTMLDivElement } element
*/

/** @typedef { Object } Artist
* @property { string[] } tracks
* @property { string[] } albums
* @property { string } summary
* @property { HTMLDivElement } artistElement
* @property { HTMLDivElement } overlayElement
*/

/** @typedef { Object } Track
* @property { string } title
* @property { string } picture
* @property { string[] } artists
* @property { string[] } album
* @property { number } duration
* @property { HTMLDivElement } element
*/

/** @typedef { Object } Storage
* @property { Object<string, Album> } albums
* @property { Object<string, Artist> } artists
* @property { Object<string, Track> } tracks
*/

export const audioExtensionsRegex = /.mp3$|.mpeg$|.opus$|.ogg$|.wav$|.aac$|.m4a$|.flac$/;

/* the base directory for the app config files
*/
const configDir = settings.getDirectory();

export const artistsRegex = /,\s+|\s+ft.?\s+|\s+feat.?\s+/g;

/**  @type { string }
*/
export const defaultPicture = join(__dirname, '../../missing.png');

/**  @type { HTMLDivElement }
*/
const albumsContainer = document.body.querySelector('.albums.container');

/**  @type { HTMLDivElement }
*/
const artistsContainer = document.body.querySelector('.artists.container');

/**  @type { HTMLDivElement }
*/
const tracksContainer = document.body.querySelector('.tracks.container');

/**  @type { HTMLDivElement }
*/
const tracksCharactersScrollbar = document.body.querySelector('.tracks.charactersContainer');

/** @type { string[] }
*/
const audioDirectories = [];

/** @type { (target: string) => {} }
*/
let navigation;

/** @type { string }
*/
const storageInfoConfigPath = join(configDir, '/storageInfo.json');

/** @type { string }
*/
const storageConfigPath = join(configDir, '/storage.json');

/** @type { Object<string, { groupContainer: HTMLDivElement, tracks: string[] }> }
*/
let tracksPerCharacter = {};

/** @param { string[] } directories
* @returns { Promise<string[]> }
*/
function walk(directories)
{
  return new Promise((resolve) =>
  {
    // return empty array if directories array is empty
    if (directories.length <= 0)
    {
      resolve([]);

      return;
    }

    const results = [];
    const promises = [];

    let nonExisting = 0;

    for (let i = 0; i < directories.length; i++)
    {
      const dir = directories[i];

      pathExists(dir).then((existsValue) =>
      {
        if (!existsValue)
        {
          nonExisting = nonExisting + 1;
 
          // return empty array if all directories don't exists
          if (nonExisting === directories.length)
            resolve([]);
          
          // don't attempt to read directory
          return;
        }

        readdir(dir).then((list) =>
        {
          if (list.length > 0)
          {
            list.forEach((file, index) =>
            {
              file = join(dir, file);
  
              stat(file).then((statValue) =>
              {
                if (statValue && statValue.isDirectory())
                {
                  promises.push(walk([ file ]).then((files) =>
                  {
                    results.push(...files);
                  }));
                }
                else
                {
                  results.push(file);
                }
  
                if (i === directories.length - 1 && index === list.length - 1)
                  Promise.all(promises).then(() => resolve(results));
              });
            });
          }
          else
          {
            if (i === directories.length - 1)
              Promise.all(promises).then(() => resolve(results));
          }
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
  // load the saved audio directories

  const savedAudioDirectories = settings.get('audioDirectories');

  // skip button hides any active artist overlay
  window.addEventListener('keydown', (event) =>
  {
    // escape button hides any active overlay
    if (event.key === 'Escape')
    {
      event.preventDefault();

      hideActiveOverlay();
    }

    // space button switches between pause and play
    if (event.key === 'Space')
    {
      event.preventDefault();

      switchPlayingMode();
    }
  });

  // if no audio directories are found
  // then use the OS default directory for music
  if (!savedAudioDirectories || savedAudioDirectories.length <= 0)
    addNewDirectories([ getDefaultMusicDir() ]);
  else
    addNewDirectories(savedAudioDirectories);

  // if a cached storage config and storage info config both exists exists
  if (!isDebug() && existsSync(storageInfoConfigPath) && existsSync(storageConfigPath))
  {
    // read the storage info config
    readJSON(storageInfoConfigPath).then((storageInfo) =>
    {
      // if the storage is too old then dismiss it
      if (isStorageOld(storageInfo.date))
      {
        rescanStorage();
      }
      // else use it
      else
      {
        // read the storage config
        readJSON(storageConfigPath).then((storage) =>
        {
          // appends items to the dom using the info from the cached storage
          appendItems(storage);

          // navigation is the function that gets called every time a click on artist happens
          // it's responsible for opening the artist's overlay
          navigation = (...keys) => storageNavigation(storage, ...keys);
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

/** rescan the storage and re-caches it,
* used by options.js for the rescan button
*/
export function rescanStorage()
{
  // delete the cached images directory
  emptyDir(settings.cachedImagesDirectory)
    // create storage objects from local files
    .then(() => scanCacheAppendFiles())
    .then((scan) =>
    {
      // cache them locally
      cacheStorage(scan.storageInfo, scan.storage);
  
      // create albums, tracks, artists items
      appendItems(scan.storage);
      
      // link the navigation function with the storage object
      navigation = (...keys) => storageNavigation(scan.storage, ...keys);
    });
}

/** scan the audio directories for audio files then parses them for their metadata,
* and adds the important data to the storage object,
* and appends UI items for the tracks, albums and artists
*/
function scanCacheAppendFiles()
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
  rescanElement.classList.add('clean');

  return new Promise((resolve) =>
  {
    // walk through all the listed audio directories
    walk(audioDirectories)
      // filter files for audio files only
      .then((files) =>
      {
        return files
          // if the file matches any of those supported audio extensions
          .filter((file) => file.match(audioExtensionsRegex));
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

                // auto split artists by comma
                artists = union(...[].concat(artists).map((v) => v.split(artistsRegex)));

                const albumTitle = undefined;
                let albumArtist = metadata.common.albumartist || 'Unknown Artist';

                // auto split artists by comma
                albumArtist = albumArtist.split(artistsRegex);

                // store the track important metadata
                // using the url as a key
                storage.tracks[file] = {
                  title: title,
                  artists: artists,
                  album: albumTitle,
                  duration: duration
                };

                if (metadata.common.picture && metadata.common.picture.length > 0)
                  storage.tracks[file].picture = settings.cacheImage(metadata.common.picture[0]);

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
                if (albumTitle && storage.albums[albumTitle])
                {
                  // push the new track to the album's list
                  storage.albums[albumTitle].tracks.push(file);

                  // add the track's duration to the overall album duration
                  storage.albums[albumTitle].duration =
                storage.albums[albumTitle].duration + duration;
                }
                // if the track belongs in an album and the track's album is already in storage
                else if (albumTitle)
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
                    if (albumTitle && !storage.artists[albumArtist[i]].albums.includes(albumTitle))
                      storage.artists[albumArtist[i]].albums.push(albumTitle);
                  }
                  else
                  {
                    storage.artists[albumArtist[i]] = {
                      tracks: [],
                      albums: (albumTitle) ? [ albumTitle ] : undefined
                    };
                  }
                }
              })
          );
        }

        // when all files are parsed and added to the storage object
        // fill the storage info then cache them,
        // then resolve this promise
        Promise.all(promises).then(() =>
        {
          const storageInfo = {
            date: Date.now()
          };

          /** @type { Storage }
          */
          const sortedStorage = {
            albums: {},
            tracks: {},
            artists: {}
          };

          const albums = sort(Object.keys(storage.albums));
          const tracks = sortBasedOnKey(Object.keys(storage.tracks), storage.tracks, 'title');
          const artists = sort(Object.keys(storage.artists));

          // sort albums
          for (let i = 0; i < albums.length; i++)
          {
            const key = albums[i];

            sortedStorage.albums[key] = storage.albums[key];

            if (sortedStorage.albums[key].tracks)
              sortedStorage.albums[key].tracks = sort(sortedStorage.albums[key].tracks);
          }

          // sort tracks
          for (let i = 0; i < tracks.length; i++)
          {
            const key = tracks[i];

            sortedStorage.tracks[key] = storage.tracks[key];
          }

          // sort artists
          for (let i = 0; i < artists.length; i++)
          {
            const key = artists[i];

            sortedStorage.artists[key] = storage.artists[key];

            if (sortedStorage.artists[key].albums)
              sortedStorage.artists[key].albums = sort(sortedStorage.artists[key].albums);
          
            if (sortedStorage.artists[key].tracks)
              sortedStorage.artists[key].tracks = sort(sortedStorage.artists[key].tracks);
          }

          rescanElement.innerText = 'Rescan';
          rescanElement.classList.remove('clean');

          resolve({
            storageInfo: storageInfo,
            storage: sortedStorage
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
    writeJson(storageInfoConfigPath, storageInfo);

  if (storage)
    writeJson(storageConfigPath, storage);
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

/** @param { HTMLDivElement } element
* @param { { picture: string, title: string, artist: string[], tracks: string[], duration: string } } options
* @param { Storage } storage
*/
function updateAlbumElement(element, options, storage)
{
  if (element.classList.contains('placeholder'))
    element.classList.remove('placeholder');

  if (options.picture)
  {
    element.querySelector('.album.cover').style.backgroundImage = `url(${options.picture})`;
  }

  if (options.title)
  {
    element.querySelector('.album.title').innerText = options.title;

    element.onclick = () => navigation('play-album', options.title);

    useContextMenu(element, [ options.title ], 'album', element);
  }

  if (options.duration)
    element.querySelector('.album.duration').innerText = options.duration;

  if (options.artist)
  {
    const artist = element.querySelector('.album.artist');

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
    const tracksContainer = element.querySelector('.album.tracks');

    for (let i = 0; i < options.tracks.length; i++)
    {
      // if updating the album's tracks
      if (tracksContainer.children.length - 1 >= i)
      {
        tracksContainer.children[i].innerText = storage.tracks[options.tracks[i]].title;
        tracksContainer.children[i].onclick = (event) =>
        {
          event.stopPropagation();

          navigation('play-album-track', options.title, options.tracks[i]);
        };

        useContextMenu(tracksContainer.children[i], [ options.title, options.tracks[i] ], 'album-track', element);
      }
      else
      {
        const track = createElement('.album.track');

        track.innerText = storage.tracks[options.tracks[i]].title;
        track.onclick = (event) =>
        {
          event.stopPropagation();

          navigation('play-album-track', options.title, options.tracks[i]);
        };

        useContextMenu(track, [ options.title, options.tracks[i] ], 'album-track', element);

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

    img.src = defaultPicture;

    // search all track in the the album for a picture
    // returns the first picture it finds
    // if none found returns the default picture

    for (let x = 0; x < storage.albums[albums[i]].tracks.length; x++)
    {
      const trackUrl = storage.albums[albums[i]].tracks[x];
      const track = storage.tracks[trackUrl];
      
      if (track.picture)
      {
        settings.receiveCachedImage(track.picture).then((imagePath) => img.src = imagePath);

        break;
      }
    }

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

  placeholderWrapper.appendChild(placeholderContainer);

  placeholderContainer.appendChild(cover);
  placeholderContainer.appendChild(card);

  card.appendChild(title);
  card.appendChild(stats);

  artistsContainer.appendChild(placeholderWrapper);

  return placeholderWrapper;
}

function createArtistOverlay()
{
  const overlayWrapper = createElement('.artistOverlay.wrapper');
  const overlayBackground = createElement('.artistOverlay.background');
  const overlayContainer = createElement('.artistOverlay.container');

  const overlayCard = createElement('.artistOverlay.card');

  const overlayCover = createElement('.artistOverlay.cover');
  const overlayHide = createElement('.artistOverlay.hide');
  const overlayDownward = createIcon('downward', '.artistOverlay.downward');
  const overlayTitle = createElement('.artistOverlay.title');
  const overlayButton = createElement('.artistOverlay.button');

  const overlaySummary = createElement('.artistOverlay.summary');

  const albumsText = createElement('.artistOverlay.text.albums');
  const albumsContainer = createElement('.albums.container');

  const tracksText = createElement('.artistOverlay.text.tracks');
  const tracksContainer = createElement('.tracks.container');

  overlayWrapper.appendChild(overlayContainer);
  
  overlayWrapper.appendChild(overlayBackground);
  overlayContainer.appendChild(overlayCard);

  overlayCard.appendChild(overlayCover);
  overlayCard.appendChild(overlayHide);
  overlayHide.appendChild(overlayDownward);
  overlayCard.appendChild(overlayTitle);
  overlayCard.appendChild(overlayButton);

  overlayContainer.appendChild(overlaySummary);

  overlayContainer.appendChild(albumsText);
  overlayContainer.appendChild(albumsContainer);

  overlayContainer.appendChild(tracksText);
  overlayContainer.appendChild(tracksContainer);

  return overlayWrapper;
}

/** @param { HTMLDivElement } element
* @param { HTMLDivElement } overlay
* @param { { picture: string, title: string, summary: string, albums: string[], tracks: string[], storage: Storage } } options
*/
function updateArtistElement(element, overlay, options)
{
  if (element.classList.contains('placeholder'))
  {
    element.classList.remove('placeholder');

    overlay.querySelector('.artistOverlay.hide').onclick = hideActiveOverlay;
  }

  if (options.picture)
  {
    element.querySelector('.artist.cover').style.backgroundImage =
    overlay.querySelector('.artistOverlay.cover').style.backgroundImage = `url(${options.picture})`;
  }

  if (options.title)
  {
    element.querySelector('.artist.container').onclick = () => navigation('artists', options.title);

    element.querySelector('.artist.title').innerText =
    overlay.querySelector('.artistOverlay.title').innerText = options.title;

    const playElement = overlay.querySelector('.artistOverlay.button');

    playElement.innerText = 'Play';
    playElement.onclick = () => navigation('play-artist', options.title);

    useContextMenu(element, [ options.title ], 'artist', element);
  }

  if (options.summary)
  {
    overlay.querySelector('.artistOverlay.summary').innerText = options.summary;
  }

  if ((options.albums && options.albums.length > 0) || (options.tracks && options.tracks.length > 0))
  {
    const stats = element.querySelector('.artist.stats');

    const albumsText = overlay.querySelector('.text.albums');
    const tracksText = overlay.querySelector('.text.tracks');

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
    const placeholder = appendArtistPlaceholder();
    const overlayElement = createArtistOverlay();

    storage.artists[artists[i]].artistElement = placeholder;
    storage.artists[artists[i]].overlayElement = overlayElement;

    const img = new Image();

    img.src = defaultPicture;

    // TODO load artist picture if it exists in cache

    img.onload = () =>
    {
      updateArtistElement(
        placeholder,
        overlayElement, {
          picture: img.src,
          title: artists[i],
          summary: storage.artists[artists[i]].summary,
          albums: storage.artists[artists[i]].albums,
          tracks: storage.artists[artists[i]].tracks,
          storage: storage
        });
    };
  }
}

function getTrackPlaceholder()
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

  return placeholderWrapper;
}

/** @param { HTMLDivElement } element
* @param { { picture: string, artist: string[], title: string, url: string, duration: string } } options
*/
function updateTrackElement(element, options)
{
  if (element.classList.contains('placeholder'))
    element.classList.remove('placeholder');

  if (options.picture)
    element.querySelector('.track.cover').style.backgroundImage = `url(${options.picture})`;

  if (options.artist)
  {
    const artist = element.querySelector('.track.artist');

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
    element.querySelector('.track.title').innerText = options.title;

    element.onclick = () => navigation('play-track', options.url);

    useContextMenu(element, [ options.url ], 'track', element);
  }

  if (options.duration)
    element.querySelector('.track.duration').innerText = options.duration;
}

/** @param  { Storage } storage
*/
function appendTracksPageItems(storage)
{
  // remove all children from tracks pages
  removeAllChildren(tracksContainer);

  tracksPerCharacter = [];

  const tracks = Object.keys(storage.tracks);

  for (let i = 0; i < tracks.length; i++)
  {
    const track = storage.tracks[tracks[i]];
    const placeholder = getTrackPlaceholder();

    let firstCharacter = track.title.substring(0, 1).toUpperCase();

    // group all symbols together under group '#'
    if (firstCharacter.match(/[-!$%^&*()_+|~=`{}@[\]:";'<>?,./]/))
      firstCharacter = '#';

    // group all numbers together under group '0'
    if (firstCharacter.match(/[0-9]/))
      firstCharacter = '0';

    if (!tracksPerCharacter[firstCharacter])
    {
      const groupWrapper = createElement(`.tracksGroup.wrapper.${firstCharacter}`);
      const groupContainer = createElement('.tracksGroup.container');

      const characterNavigator = createElement('.tracks.characterNavigator');
      const characterObserver = createElement('.tracks.characterObserver');

      characterObserver.innerText = characterNavigator.innerText = firstCharacter;

      tracksCharactersScrollbar.appendChild(characterNavigator);

      groupContainer.appendChild(characterObserver);
      groupWrapper.appendChild(groupContainer);

      if (i === 0)
      {
        characterNavigator.classList.add('selected');

        tracksContainer.appendChild(groupWrapper);
      }

      tracksPerCharacter[firstCharacter] = {
        groupContainer: groupContainer,
        tracks: []
      };

      characterNavigator.onclick = () =>
      {
        tracksCharactersScrollbar.querySelector('.selected').classList.remove('selected');
        characterNavigator.classList.add('selected');

        tracksContainer.removeChild(tracksContainer.firstChild);
        tracksContainer.appendChild(groupWrapper);
      };
    }

    tracksPerCharacter[firstCharacter].groupContainer.appendChild(placeholder);
    tracksPerCharacter[firstCharacter].tracks.push(tracks[i]);

    track.element = placeholder;

    const img = new Image();

    // track picture
    img.src = defaultPicture;

    // load cached track image
    if (track.picture)
      settings.receiveCachedImage(track.picture).then((imagePath) => img.src = imagePath);
    
    img.onload = () =>
    {
      updateTrackElement(placeholder, {
        picture: img.src,
        artist: track.artists,
        title: track.title,
        url: tracks[i],
        duration: secondsToDuration(track.duration)
      });
    };
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

/** @param { HTMLElement } parent
*/
export function removeAllChildren(parent, fromIndex)
{
  if (fromIndex !== undefined)
  {
    const children = [ ...parent.children ];

    children.slice(fromIndex);

    for (let i = fromIndex; i < children.length; i++)
    {
      const child = children[i];
  
      parent.removeChild(child);
    }
  }
  else
  {
    while (parent.lastChild)
    {
      parent.removeChild(parent.lastChild);
    }
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
    showArtistOverlay(storage, keys[1]);
  }
  // play the track
  else if (keys[0] === 'play-track' || keys[0] === 'add-track')
  {
    // clear the queue then play the track
    if (keys[0] === 'play-track')
      queueStorageTracks(storage, undefined, undefined, true, keys[1]);
    // queue the track at bottom
    else
      queueStorageTracks(storage, undefined, undefined, false, keys[1]);
  }
  // play the album from a selected track
  else if (keys[0] === 'play-album-track' || keys[0] === 'add-album-track')
  {
    queueStorageTracks(storage,
      keys[2],
      undefined,
      (keys[0] === 'play-album-track'),
      ...storage.albums[keys[1]].tracks);
  }
  // play the album
  else if (keys[0] === 'play-album' || keys[0] === 'add-album')
  {
    // clear the queue then play the album
    if (keys[0] === 'play-album')
      queueStorageTracks(storage, undefined, undefined, true, ...storage.albums[keys[1]].tracks);
    // queue the album at bottom
    else
      queueStorageTracks(storage, undefined, undefined, false, ...storage.albums[keys[1]].tracks);
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
      queueStorageTracks(storage, undefined, undefined, true, ...tracks);
    // queue the tracks at bottom
    else
      queueStorageTracks(storage, undefined, undefined, false, ...tracks);
  }
}

/** sort array of string alphabetically
* @param { string[] } array
*/
function sort(array)
{
  return array.sort((a, b) =>
  {
    a = a.toLowerCase();
    b = b.toLowerCase();

    if (a < b)
      return -1;
    if (a > b)
      return 1;
    
    return 0;
  });
}

/** sort array of string alphabetically based on a string key and an object
* @param { string[] } array
* @param { {} } obj
* @param { string } key
*/
function sortBasedOnKey(array, obj, key)
{
  return array.sort((a, b) =>
  {
    a = obj[a][key].toLowerCase();
    b = obj[b][key].toLowerCase();

    if (a < b)
      return -1;
    if (a > b)
      return 1;
    
    return 0;
  });
}

/** @param { Storage } storage
* @param { string } artist
*/
function showArtistOverlay(storage, artist)
{
  // only one overlay is to be shown at once
  if (window.activeArtistOverlay)
    return;

  // the artist name
  const overlayElement = storage.artists[artist].overlayElement;

  // set the overlay as active
  window.activeArtistOverlay = {
    overlayElement: overlayElement,
    albumPlaceholders: [],
    trackPlaceholders: []
  };

  // add the overlay to the body
  document.body.appendChild(overlayElement);
  
  // trigger the overlay animation
  setTimeout(() =>
  {
    overlayElement.classList.add('active');

    const albums = storage.artists[artist].albums;

    const overlayAlbumsContainer = overlayElement.querySelector('.albums.container');

    for (let i = 0; i < albums.length; i++)
    {
      const placeholder = appendAlbumPlaceholder();
      const albumElement = storage.albums[albums[i]].element;

      window.activeArtistOverlay.albumPlaceholders.push(placeholder);

      albumsContainer.replaceChild(placeholder, albumElement);
      overlayAlbumsContainer.appendChild(albumElement);
    }
    
    const tracks = storage.artists[artist].tracks;

    const overlayTracksContainer = overlayElement.querySelector('.tracks.container');

    for (let i = 0; i < tracks.length; i++)
    {
      const placeholder = getTrackPlaceholder();
      const trackElement = storage.tracks[tracks[i]].element;

      window.activeArtistOverlay.trackPlaceholders.push(placeholder);

      trackElement.parentElement.replaceChild(placeholder, trackElement);
      overlayTracksContainer.appendChild(trackElement);
    }
  }, 100);
}

export function hideActiveOverlay()
{
  /** @type { { overlayElement: HTMLElement, visibility: string, albumPlaceholders: HTMLElement[], trackPlaceholders: HTMLElement[] } }
  */
  const activeOverlayObject = window.activeArtistOverlay;

  // if no overlay is currently active then return
  if (!activeOverlayObject)
    return;

  // hide the overlay from the user
  activeOverlayObject.overlayElement.classList.remove('active');

  setTimeout(() =>
  {
    const albumPlaceholders = activeOverlayObject.albumPlaceholders;
    
    if (albumPlaceholders)
    {
      const overlayAlbumsContainer = activeOverlayObject.overlayElement.querySelector('.albums.container');

      for (let i = 0; i < albumPlaceholders.length; i++)
      {
        albumsContainer.replaceChild(overlayAlbumsContainer.firstChild, albumPlaceholders[i]);
      }
    }

    const trackPlaceholders = activeOverlayObject.trackPlaceholders;

    if (trackPlaceholders)
    {
      const overlayTracksContainer = activeOverlayObject.overlayElement.querySelector('.tracks.container');

      for (let i = 0; i < trackPlaceholders.length; i++)
      {
        trackPlaceholders[i].parentElement.replaceChild(overlayTracksContainer.firstChild, trackPlaceholders[i]);
      }
    }
  }, 100);
  
  // wait the transaction time (0.35s)
  // then return the rented element to their original places
  setTimeout(() =>
  {
    // remove the overlay from body
    document.body.removeChild(activeOverlayObject.overlayElement);

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

/** adds the directories to the save file and the scan array,
* and in the audio directories panel
* @param { string[] } directories
*/
export function addNewDirectories(directories)
{
  if (!directories || directories.length <= 0)
    return;

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
