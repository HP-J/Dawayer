import { remote, app } from 'electron';

import { join } from 'path';
import { existsSync, readFileSync, writeFileSync } from 'fs';

import md5 from 'md5';
import { ensureDir, writeFile } from 'fs-extra';
import { EventEmitter } from 'events';

import download from './dl.js';

const currentlyCaching = {};

/** @type { Object<string, EventEmitter> }
*/
const changes = {};

/** the directory where cached images are stored
*/
export const cachedImagesDirectory = join(getDirectory(), 'CachedImages');

/** @param { string } key
* @param { string } [configKey]
*/
export function has(key, configKey)
{
  return getConfig(configKey || 'config')[key] !== undefined;
}

/** @param { string } key
* @param { any } [defaultValue]
* @param { string } [configKey]
*/
export function get(key, defaultValue, configKey)
{
  const obj = getConfig(configKey || 'config')[key];

  if (obj !== undefined)
    return obj;
  else
    return defaultValue;
}

/** @param { string } key
* @param { any } value
* @param { string } [configKey]
*/
export function set(key, value, configKey)
{
  configKey = configKey || 'config' ;

  const config = getConfig(configKey);

  config[key] = value;

  emitChange(key, value, configKey);

  saveConfig(config);
}

/** @param { string } key
* @param { string } [configKey]
*/
export function remove(key, configKey)
{
  set(key, undefined, configKey);
}

/** @param { string } key
* @param { (value: any) => void } callback
* @param { string } [configKey]
*/
export function onChange(key, callback, configKey)
{
  configKey = configKey || 'config' ;

  if (changes[configKey] === undefined)
    changes[configKey] = new EventEmitter();

  changes[configKey].on(key, callback);
}

/** @param { any } value
* @param { string } [configKey]
*/
function emitChange(key, value, configKey)
{
  if (changes[configKey])
    changes[configKey].emit(key, value);
}

/** @param { string } [configKey]
*/
export function all(configKey)
{
  return getConfig(configKey || 'config');
}

export function getDirectory()
{
  if (remote)
    return join(remote.app.getPath('appData'), remote.app.getName());
  else
    return join(app.getPath('appData'), app.getName());
}

/** caches images locally from url or buffer and returns the image file path
* @param { string | { data: Buffer } } image
*/
export function cacheImage(image)
{
  const token = (image.data !== undefined) ? md5(image.data) : md5(image);
  const filename = join(cachedImagesDirectory, token);

  // if already cached or currently caching
  if (existsSync(filename) || currentlyCaching[token])
    return token;

  // notifier as the image is
  currentlyCaching[token] = [];

  ensureDir(cachedImagesDirectory)
    .then(() =>
    {
      // if buffer start write to disk
      if (image.data !== undefined)
      {
        writeFile(filename, image.data)
          .then(() =>
          {
            currentlyCaching[token].forEach(callback => callback());

            delete currentlyCaching[token];
          })
          .catch((err) =>
          {
            currentlyCaching[token].forEach(callback => callback(err));

            delete currentlyCaching[token];

            console.error(err);
          });
      }
      // else download from the web
      else
      {
        download(image, {
          dir: cachedImagesDirectory,
          filename: token,
          onDone: () =>
          {
            currentlyCaching[token].forEach(callback => callback());

            delete currentlyCaching[token];
          },
          onError: (err) =>
          {
            currentlyCaching[token].forEach(callback => callback(err));

            delete currentlyCaching[token];

            console.error(err);
          }
        });
      }
    })
    .catch((err) =>
    {
      currentlyCaching[token].forEach(callback => callback(err));

      delete currentlyCaching[token];

      console.error(err);
    });

  return token;
}

export function receiveCachedImage(image)
{
  return new Promise((resolve, reject) =>
  {
    const filename = join(cachedImagesDirectory, image);

    if (currentlyCaching[image])
      currentlyCaching[image].push((err) =>
      {
        if (err)
        {
          reject(err);

          return;
        }

        resolve(filename);
      });
    else if (existsSync(filename))
      resolve(filename);
    else
      reject('This image is not cached');
  });
}

/** @param { string } [configKey]
*/
function getConfig(configKey)
{
  configKey = configKey || 'config';

  const configPath = join(getDirectory(), configKey + '.json');

  if (existsSync(configPath))
    return JSON.parse(readFileSync(configPath));
  else
    return {};
}

/** @param { {} } config
* @param { string } [configKey]
*/
function saveConfig(config, configKey)
{
  configKey = configKey || 'config';

  const configPath = join(getDirectory(), configKey + '.json');

  writeFileSync(configPath, JSON.stringify(config));
}