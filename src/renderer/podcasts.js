import * as settings from '../settings.js';

import { homedir } from 'os';
import { join } from 'path';
import { readFile } from 'fs-extra';

import { searchPodcasts, getPodcastFeedUrl } from './apple-podcasts.js';

import request from 'request-promise-native';
import feedParse from 'davefeedread';

import { createElement, createIcon } from './renderer.js';
import { hideActiveOverlay } from './storage.js';

const podcastsContainer = document.body.querySelector('.podcasts.container');

export function initPodcasts()
{
  // const enabled = settings.get('podcasts', false);
  // settings.onChange('podcasts', watchForPodcastsDisable);

  // searchPodcasts('The Vergecast').then((podcast) =>
  // {
  //   getPodcastFeedUrl(podcast.results[0].collectionId).then((feedUrl) =>
  //   {
  //     console.log(feedUrl);
  //   });
  // });

  // readFeedFile(join(homedir(), 'Documents/vergecast.xml'))
  // // readFeedURL('https://feeds.megaphone.fm/vergecast')
  //   .then((feed) =>
  //   {
  //     console.log(feed);
  //   });
}

function watchForPodcastsDisable(state)
{

}

function appendPodcastPlaceholder()
{
  const placeholderWrapper = createElement('.podcast.wrapper.placeholder');

  const podcastContainer = createElement('.podcast.container');

  const cover = createElement('.podcast.cover');
  const artist = createElement('.podcast.artist');
  const title = createElement('.podcast.title');

  // const card = createElement('.podcast.card');
  // const details = createElement('.podcasts');

  placeholderWrapper.overlayElement = createPodcastOverlay();

  placeholderWrapper.appendChild(podcastContainer);

  podcastContainer.appendChild(cover);
  podcastContainer.appendChild(artist);
  podcastContainer.appendChild(title);

  // podcastContainer.appendChild(card);

  // card.appendChild(details);

  podcastsContainer.appendChild(placeholderWrapper);

  return placeholderWrapper;
}

function createPodcastOverlay()
{
  const overlayWrapper = createElement('.podcastOverlay.wrapper');
  const overlayBackground = createElement('.podcastOverlay.background');
  const overlayContainer = createElement('.podcastOverlay.container');

  const overlayCard = createElement('.podcastOverlay.card');

  const overlayCover = createElement('.podcastOverlay.cover');
  const overlayHide = createElement('.podcastOverlay.hide');
  const overlayDownward = createIcon('downward', '.podcastOverlay.downward');
  const overlayArtist = createElement('.podcastOverlay.artist');
  const overlayTitle = createElement('.podcastOverlay.title');

  const overlaySummary = createElement('.podcastOverlay.summary');

  const podcastsText = createElement('.podcastOverlay.episodes.text');
  const podcastEpisodes = createElement('.podcastEpisodes.container');

  overlayWrapper.appendChild(overlayContainer);
  
  overlayWrapper.appendChild(overlayBackground);
  overlayContainer.appendChild(overlayCard);

  overlayCard.appendChild(overlayCover);
  overlayCard.appendChild(overlayHide);
  overlayCard.appendChild(overlayArtist);
  overlayCard.appendChild(overlayTitle);

  overlayHide.appendChild(overlayDownward);

  overlayContainer.appendChild(overlaySummary);

  overlayContainer.appendChild(podcastsText);
  overlayContainer.appendChild(podcastEpisodes);

  return overlayWrapper;
}

/** @param { HTMLDivElement } element
* @param { HTMLDivElement } element
* @param { { picture: string, artist: string, title: string, summary: string } } options
*/
function updatePodcastElement(element, options)
{
  if (element.classList.contains('placeholder'))
  {
    element.classList.remove('placeholder');

    element.onclick = () => showPodcastOverlay(element.overlayElement);
    
    element.overlayElement.querySelector('.podcastOverlay.hide').onclick = hideActiveOverlay;

    // TODO
    // useContextMenu(element, [ options.title ], 'album', element);
  }

  if (options.picture)
  {
    element.querySelector('.podcast.cover').style.backgroundImage =
    element.overlayElement.querySelector('.podcastOverlay.cover').style.backgroundImage = `url(${options.picture})`;
  }

  if (options.artist)
  {
    element.querySelector('.podcast.artist').innerText =
    element.overlayElement.querySelector('.podcastOverlay.artist').innerText = options.artist;
  }

  if (options.title)
  {
    element.querySelector('.podcast.title').innerText =
    element.overlayElement.querySelector('.podcastOverlay.title').innerText = options.title;
  }

  if (options.summary)
  {
    element.overlayElement.querySelector('.podcastOverlay.summary').innerText = options.summary;
  }

  // if (options.details)
  {
    // element.querySelector('.podcast.details').innerText = /* options.details*/ 'TODO do better details';
  }

  // if (options.episodes)
  {
    const episodesText = element.overlayElement.querySelector('.episodes.text');
    const episodesContainer = element.overlayElement.querySelector('.podcastEpisodes.container');
    
    episodesText.innerText = 'Episodes';
  }
}

/** @param { HTMLElement } overlay
*/
function showPodcastOverlay(overlay)
{
  // only one overlay is to be shown at once
  if (window.activeArtistOverlay)
    return;
  
  window.activeArtistOverlay = {
    overlayElement: overlay
  };

  // add the overlay to the body
  document.body.appendChild(overlay);

  // triggers the animation
  setTimeout(() =>
  {
    overlay.classList.add('active');
  }, 100);
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