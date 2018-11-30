import { readdirSync, existsSync, statSync } from 'fs';
import { join, basename, extname } from 'path';
import { homedir, platform } from 'os';

import { parseFile } from 'music-metadata';
import * as settings from 'electron-json-config';

import { createElement } from './renderer.js';
import { appendDirectoryNode } from './options.js';
import { base64 as lqip } from './lqip.js';

/** @typedef { Object } Storage
* @property { Object<string, {  artist: string, tracks: string[] }> } albums
* @property { Object<string, { tracks: string[] }> } artists
* @property { Object<string, { url: string, artists: string[] }> } tracks
*/

const AUDIO_EXTENSIONS_REGEX = /.mp3$|.mpeg$|.opus$|.ogg$|.wav$|.acc$|.m4a$|.flac$/;

/**  @type { HTMLDivElement }
*/
const albumsContainer = document.body.querySelector('.albums.container');

/** @type { string[] }
*/
const audioDirectories = [];

/** @type { Storage }
*/
const storage = {
  albums: {},
  artists: {},
  tracks: {}
};

/** @param { string[] } directories
* @returns { string[] }
*/
function walkSync(directories)
{
  let results = [];

  for (let i = 0; i < directories.length; i++)
  {
    const dir = directories[i];

    if (!existsSync(dir))
      continue;

    const list = readdirSync(dir);

    list.forEach((file) =>
    {
      file = join(dir, file);
      
      const stat = statSync(file);
  
      if (stat && stat.isDirectory())
        // Recurs into a subdirectory
        results = results.concat(walkSync([ file ]));
      else
        // Is a file
        results.push(file);
    });
  }

  return results;
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
  placeholder.children[0].children[1].children[4].innerText = 'by ';
  placeholder.children[0].children[1].children[5].innerText = artist;
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
  const text = createElement('.album.text');
  const artist = createElement('.album.artist');

  // .album.wrapper.placeholder
  //   .album.container
  //     .album.cover(style=background-image)
  //     .album.card
  //       .album.tracks
  //       .album.background
  //       .album.title
  //       .album.time
  //       .album.text by
  //       .album.artist

  placeholder.appendChild(container);

  container.appendChild(cover);
  container.appendChild(card);

  card.appendChild(tracks);
  card.appendChild(background);
  card.appendChild(title);
  card.appendChild(time);
  card.appendChild(text);
  card.appendChild(artist);

  albumsContainer.appendChild(placeholder);

  return placeholder;
}

/** initialize the cache system and loads local tracks, albums and artists, appending an element
* for each of them
*/
export function initStorage()
{
  // .ADD load 'audioDirectories' from settings, if none exists load default music dir
  addNewDirectories([ getDefaultMusicDir() ]);

  // .ADD load the cached storage instead of scan every time
  scanCacheAudioFiles().then(appendItems);
}

/** scan the audio directories for audio files then parses them for their metadata,
* and adds the important data to the storage object
*/
export function scanCacheAudioFiles()
{
  return new Promise((resolve) =>
  {
    // walk through all the listed audio directories
    const files = walkSync(audioDirectories);
    
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
          parseFile(file)
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

    // when all files are parsed and added to the storage object resolve this promise
    Promise.all(promises).then(resolve);
  });
}

function appendItems()
{
  return new Promise((resolve) =>
  {
    // remove all children from albums, tracks and artists pages
    // removeAllChildren(albumsContainer);

    const albums = Object.keys(storage.albums);

    for (let i = 0; i < albums.length; i++)
    {
      const placeholder = appendAlbumPlaceholder();

      updateAlbumElement(placeholder, storage.tracks[storage.albums[albums[i]].tracks[0]].lqip, albums[i], storage.albums[albums[i]].artist);

      // Promise.resolve(appendAlbumPlaceholder())
      //   .then((placeholder) =>
      //   {
      //     updateAlbumElement(placeholder, storage.tracks[storage.albums[albums[i]].tracks[0]].lqip, albums[i], storage.albums[albums[i]].artist);
      //   });
    }

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