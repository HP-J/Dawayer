import * as settings from '../settings.js';

import { readFile } from 'fs-extra';

import request from 'request-promise-native';
import feedParse from 'davefeedread';

export function initPodcasts()
{

}

/** @param { string } filename
*/
function readFeedFile(filename)
{
  return new Promise((resolve, reject) =>
  {
    readFile(filename, { encoding: 'utf8' })
      .then((xmlFile) =>
      {
        feedParse.parseString(xmlFile, undefined, (err, feed) =>
        {
          if (err)
          {
            reject(err);

            return;
          }
          
          resolve(feed);
        });
      })
      .catch((err) =>
      {
        reject(err);
      });
  });
}

/** @param { string } url
*/
function readFeedURL(url)
{
  return new Promise((resolve, reject) =>
  {
    request(url, { encoding: 'utf8', timeout: 30000 })
      .then((xmlFile) =>
      {
        feedParse.parseString(xmlFile, undefined, (err, feed) =>
        {
          if (err)
          {
            reject(err);

            return;
          }
          
          resolve(feed);
        });
      })
      .catch((err) =>
      {
        reject(err);
      });
  });
}