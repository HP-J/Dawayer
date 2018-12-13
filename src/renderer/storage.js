import { existsSync, statSync } from 'fs';

import { writeJson, readJSON, readdir } from 'fs-extra';

import { join, dirname, basename, extname } from 'path';
import { homedir, platform } from 'os';

import { parseFile as getMetadata } from 'music-metadata';
import * as settings from 'electron-json-config';

import { createElement } from './renderer.js';
import { appendDirectoryNode } from './options.js';
import { base64 as lqip } from './lqip.js';

/** @typedef { Object } Storage
* @property { Object<string, {  artist: string, tracks: string[] }> } albums
* @property { Object<string, { tracks: string[] }> } artists
* @property { Object<string, { url: string, artists: string[] }> } tracks
*/

/** @typedef { Object } StorageInfo
* @property { number } date
* @property { number } albums
* @property { number } artists
* @property { number } tracks
*/

const AUDIO_EXTENSIONS_REGEX = /.mp3$|.mpeg$|.opus$|.ogg$|.wav$|.aac$|.m4a$|.flac$/;

/**  @type { HTMLDivElement }
*/
const albumsContainer = document.body.querySelector('.albums.container');

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

      if (!existsSync(dir))
        continue;

      promises.push(readdir(dir).then((list) =>
      {
        list.forEach((file) =>
        {
          file = join(dir, file);

          const stat = statSync(file);

          if (stat && stat.isDirectory())
            promises.push(walk([ file ].then((files) => results.push(...files))));
          else
            results.push(file);
        });
      }));
    }

    Promise.all(promises).then(() => resolve(results));
  });
}

function getDefaultMusicDir()
{
  // .ADD test on windows
  const currentPlatform = platform();

  if (currentPlatform === 'linux' || currentPlatform === 'win32')
    return join(homedir(), '/Music');
}

/** @param { HTMLDivElement } placeholder
* @param { string } picture
* @param { string } title
* @param { string } artist
*/
function updateAlbumElement(placeholder, picture, title, artist)
{
  if (placeholder.classList.contains('placeholder'))
    placeholder.classList.remove('placeholder');

  placeholder.children[0].children[0].style.backgroundImage = `url(${picture})`;

  placeholder.children[0].children[1].children[0].appendChild(createElement('.album.track'));
  placeholder.children[0].children[1].children[0].appendChild(createElement('.album.track'));

  placeholder.children[0].children[1].children[0].children[0].innerText = 'Dawayer (Circles) [ft. Mazaher]';
  placeholder.children[0].children[1].children[0].children[1].innerText = 'Fi Belad El Agayeb (In Wonderland)';

  placeholder.children[0].children[1].children[2].innerText = title;
  placeholder.children[0].children[1].children[3].innerText = '41:25';
  placeholder.children[0].children[1].children[4].innerText = artist;
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
  const time = createElement('.album.time');
  const artist = createElement('.album.artist');

  // .album.wrapper.placeholder
  //   .album.container
  //     .album.cover(style=background-image)
  //     .album.card
  //       .album.tracks
  //       .album.background
  //       .album.title
  //       .album.time
  //       .album.artist

  placeholder.appendChild(container);

  container.appendChild(cover);
  container.appendChild(card);

  card.appendChild(tracks);
  card.appendChild(background);
  card.appendChild(title);
  card.appendChild(time);
  card.appendChild(artist);

  albumsContainer.appendChild(placeholder);

  return placeholder;
}

/** initialize the cache system and loads local tracks, albums and artists, appending an element
* for each of them
*/
export function initStorage()
{
  // ADD test changing the directory (from ~/Music to /mnt/k/Music Tester) during runtime
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
  if (existsSync(storageConfig))
  {
    let storageInfo;

    readJSON(storageInfoConfig).then((data) =>
    {
      storageInfo = data;

      return readJSON(storageConfig);
    })
      .then((storage) =>
      {
        appendItems(storageInfo, storage);

        // ADD if the cache is too old create a new cache for the next time
        // the app starts
        // if (isStorageOld(storageInfo.date))
        //   scanCacheAudioFiles().then((scan) =>
        //   {
        //     cacheStorage(scan.storageInfo, scan.storage);
        //   });
      });
  }
  // if not, then scan the audio directories for the audio files,
  // load them and then create a new cache for them
  else
  {
    scanCacheAudioFiles().then((scan) =>
    {
      appendItems(scan.storageInfo, scan.storage);
      cacheStorage(scan.storageInfo, scan.storage);
    });
  }
}

/** scan the audio directories for audio files then parses them for their metadata,
* and adds the important data to the storage object
*/
export function scanCacheAudioFiles()
{
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
            getMetadata(file)
              .then((metadata) =>
              {
                // then using the track's picture
                // create a lqip version of it then return the metadata and
                // the lqip picture to the next promise

                return new Promise((resolve) =>
                {
                  lqip(metadata.common.picture[0]).then((res) =>
                  {
                    resolve({ metadata: metadata, lqip: res });
                  });
                });
              })
              .then(({ metadata, lqip }) =>
              {
                // using the metadata and the lqip picture fill
                // the storage object and cache it to the
                // hard disk

                const title = basename(file, extname(file));

                // if the audio metadata belongs in an album
                if (metadata.common.album)
                {
                  if (storage.albums[metadata.common.album])
                  {
                    storage.albums[metadata.common.album].tracks.push(title);
                  }
                  else
                  {
                    storage.albums[metadata.common.album] = {
                      artist: metadata.common.albumartist,
                      tracks: [ title ]
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
                    }
                    else
                    {
                      storage.artists[artists[i]] = {
                        tracks: [ title ]
                      };
                    }
                  }
                }

                // store the track important metadata
                storage.tracks[title] = {
                  url: file,
                  lqip: lqip,
                  artists: metadata.common.artists
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
          date: Date.now(),
          albums: Object.keys(storage.albums).length,
          artists: Object.keys(storage.artists).length,
          tracks: Object.keys(storage.tracks).length
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

/** @param  { number } time
* @return { Boolean }
*/
function isStorageOld(time)
{
  const date = new Date(time);

  // add 2 days
  date.setDate(date.getDate() + 2);

  const now = new Date();

  return (now.getTime() >= date.getTime());
}

/**  @param  { StorageInfo } storageInfo
* @param  { Storage } storage
*/
function appendItems(storageInfo, storage)
{
  return new Promise((resolve) =>
  {
    for (let i = 0; i < storageInfo.albums; i++)
    {
      appendAlbumPlaceholder();
    }

    // remove all children from albums, tracks and artists pages
    // removeAllChildren(albumsContainer);

    // const albums = Object.keys(storage.albums);
    //
    // for (let i = 0; i < albums.length; i++)
    // {
    //   const placeholder = appendAlbumPlaceholder();
    //
    //   updateAlbumElement(placeholder, storage.tracks[storage.albums[albums[i]].tracks[0]].lqip, albums[i], storage.albums[albums[i]].artist);
    //
    //   // Promise.resolve(appendAlbumPlaceholder())
    //   //   .then((placeholder) =>
    //   //   {
    //   //     updateAlbumElement(placeholder, storage.tracks[storage.albums[albums[i]].tracks[0]].lqip, albums[i], storage.albums[albums[i]].artist);
    //   //   });
    // }

    resolve();
  });
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
