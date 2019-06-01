import { remote, app } from 'electron';

import { EventEmitter } from 'events';

import { join } from 'path';
import { existsSync, readFileSync, writeFileSync } from 'fs';

const changes = new EventEmitter();

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

export function getPath()
{
  return join(getDirectory(), 'config.json');
}

export function getDirectory()
{
  if (remote)
    return join(remote.app.getPath('appData'), remote.app.getName());
  else
    return join(app.getPath('appData'), app.getName());
}

function getConfig()
{
  if (existsSync(getPath()))
    return JSON.parse(readFileSync(getPath()));
  else
    return {};
}

function saveConfig(config)
{
  writeFileSync(getPath(), JSON.stringify(config));
}