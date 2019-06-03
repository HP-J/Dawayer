import { readFile } from 'fs-extra';

import request from 'request-promise-native';
import feedParse from 'davefeedread';

import { createElement } from './renderer.js';

const podcastsContainer = document.body.querySelector('.podcasts.container');

export function initPodcasts()
{

}

function appendPodcastPlaceholder()
{
  const placeholderWrapper = createElement('.podcast.wrapper.placeholder');

  const podcastContainer = createElement('.podcast.container');

  const cover = createElement('.podcast.cover');
  const artist = createElement('.podcast.artist');
  const title = createElement('.podcast.title');

  const card = createElement('.podcast.card');
  const details = createElement('.podcast.details');

  placeholderWrapper.appendChild(podcastContainer);

  podcastContainer.appendChild(cover);
  podcastContainer.appendChild(artist);
  podcastContainer.appendChild(title);

  podcastContainer.appendChild(card);

  card.appendChild(details);

  podcastsContainer.appendChild(placeholderWrapper);

  return placeholderWrapper;
}

/** @param { HTMLDivElement } element
* @param { { picture: string, artist: string, title: string, details: sting } } options
*/
function updatePodcastElement(element, options)
{
  if (element.classList.contains('placeholder'))
    element.classList.remove('placeholder');

  if (options.picture)
  {
    element.querySelector('.podcast.cover').style.backgroundImage = `url(${options.picture})`;
  }

  if (options.artist)
  {
    element.querySelector('.podcast.artist').innerText = options.artist;
  }

  if (options.title)
  {
    element.querySelector('.podcast.title').innerText = options.title;

    // element.onclick = () => navigation('play-album', options.title);

    // useContextMenu(element, [ options.title ], 'album', element);
  }

  if (options.details)
  {
    element.querySelector('.podcast.details').innerText = options.details;
  }
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