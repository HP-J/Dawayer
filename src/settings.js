import { remote, app } from 'electron';

import { join } from 'path';
import { existsSync, readFileSync, writeFileSync } from 'fs';

import md5 from 'md5';
import { ensureDir, writeFile } from 'fs-extra';
import { EventEmitter } from 'events';

import download from './dl.js';

const currentlyCaching = {};

const changes = new EventEmitter();

/** the directory where the default app config is stored
*/
export const configPath = join(getDirectory(), 'config.json');

/** the directory where cached images are stored
*/
export const cachedImagesDirectory = join(getDirectory(), 'CachedImages');

/** @param { string } key
*/
export function has(key)
{
  return getConfig()[key] !== undefined;
}

/** @param { string } key
* @param { any } [defaultValue]
*/
export function get(key, defaultValue)
{
  const obj = getConfig()[key];

  if (obj !== undefined)
    return obj;
  else
    return defaultValue;
}

/** @param { string } key
* @param { any } value
*/
export function set(key, value)
{
  const config = getConfig();

  config[key] = value;

  changes.emit(key, value);

  saveConfig(config);
}

/** @param { string } key
*/
export function remove(key)
{
  const config = getConfig();

  config[key] = undefined;
  
  changes.emit(key, undefined);

  saveConfig(config);
}

/** @param { string } key
* @param { (value: any) => void } callback
*/
export function onChange(key, callback)
{
  changes.on(key, callback);
}

export function all()
{
  return getConfig();
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

  ensureDir(cachedImagesDirectory)
    .then(() =>
    {
      // if already cached or currently caching
      if (existsSync(filename) || currentlyCaching[token])
        return;
      
      currentlyCaching[token] = [];

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

function getConfig()
{
  if (existsSync(configPath))
    return JSON.parse(readFileSync(configPath));
  else
    return {};
}

function saveConfig(config)
{
  writeFileSync(configPath, JSON.stringify(config));
}