import { remote, app } from 'electron';
import { join } from 'path';
import { existsSync, readFileSync, writeFileSync } from 'fs';

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

  saveConfig(config);
}

/** @param { string } key
*/
export function remove(key)
{
  const config = getConfig();

  config[key] = undefined;
  
  saveConfig(config);
}

export function all()
{
  return getConfig();
}

export function purge()
{
  saveConfig({});
}

export function getPath()
{
  if (remote)
    return join(remote.app.getPath('appData'), remote.app.getName(), 'config.json');
  else
    return join(app.getPath('appData'), app.getName(), 'config.json');
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