import { remote } from 'electron';

import * as settings from '../settings.js';

import { homedir } from 'os';
import { join } from 'path';
import { readFile } from 'fs-extra';

import { searchPodcasts, getPodcastFeedUrl } from './apple-podcasts.js';

import Parser from 'rss-parser';

import {
  createElement, createIcon, createContextMenu,
  changePage, removeAllChildren, hideActiveOverlay,
  secondsToHms, millisecondsToTimeAgo, defaultPicture,
  podcastsButton
} from './renderer.js';

import { queueTracks, audioUrlTypeRegex } from './playback.js';

/** @typedef { Object } FeedObject
* @property { FeedHead } head
* @property { FeedItem[] } items
*/

/** @typedef { Object } FeedHead
* @property { string } title
* @property { string } description
* @property { string } copyright
* @property { string } link
* @property { string } language
* @property { string[] } categories
* @property { { url: string, title: string } } image
*/

/** @typedef { Object } FeedItem
* @property { string } title
* @property { string } author
* @property { string } summary
* @property { string } date
* @property { { url: string }[] } enclosures
*/

const { mainWindow } = remote.require(join(__dirname, '../main/window.js'));

/** @type { Parser }
*/
let parser;

const podcastsContainer = document.body.querySelector('.podcasts.container');

/** @type { HTMLDivElement }
*/
const collectionOverlay = createPodcastCollectionOverlay();

const collectionContainer = collectionOverlay.querySelector('.podcastCollection.container');

/** @type { Object<string, { description: string, picture: string, element: HTMLElement, feedUrl: string }> }
*/
const collection = {};

export function initPodcasts()
{
  // in the future this info may be useful
  // const enabled = settings.get('podcasts', false);
  // settings.onChange('podcasts', watchForPodcastsDisable);

  // initialize the parser
  parser = new Parser({
    maxRedirects: 5
  });

  // TODO load podcasts from the collection json

  // addPodcastToCollection('https://feeds.megaphone.fm/vergecast');
  // addPodcastToCollection(join(homedir(), 'Documents/vergecast.xml'));
}

function appendPodcastPlaceholder()
{
  const placeholderWrapper = createElement('.podcast.wrapper.placeholder');

  const podcastContainer = createElement('.podcast.container');

  const cover = createElement('.podcast.cover');
  const artist = createElement('.podcast.artist');
  const title = createElement('.podcast.title');

  const episodesWrapper = createElement('.podcast.episodesWrapper');
  const episodeContainer = createElement('.podcast.episodeContainer');

  const episodeInfo = createElement('.podcast.episodeInfo');
  const episodeTitle = createElement('.podcast.episodeTitle');

  episodeContainer.classList.add('clear');

  episodeInfo.innerText = 'No episodes are available';

  placeholderWrapper.overlayElement = createPodcastOverlay();

  podcastContainer.onclick = () => showPodcastOverlay(placeholderWrapper.overlayElement);

  podcastContainer.appendChild(cover);
  podcastContainer.appendChild(artist);
  podcastContainer.appendChild(title);
  
  episodeContainer.appendChild(episodeInfo);
  episodeContainer.appendChild(episodeTitle);

  episodesWrapper.appendChild(episodeContainer);
  podcastContainer.appendChild(episodesWrapper);

  placeholderWrapper.appendChild(podcastContainer);

  podcastsContainer.appendChild(placeholderWrapper);

  return placeholderWrapper;
}

function createPodcastOverlay()
{
  const overlayWrapper = createElement('.podcastOverlay.wrapper');
  const overlayContainer = createElement('.podcastOverlay.container');

  const overlayCard = createElement('.podcastOverlay.card');

  const overlayCover = createElement('.podcastOverlay.cover');
  const overlayHide = createElement('.podcastOverlay.hide');
  const overlayDownward = createIcon('downward', '.podcastOverlay.downward');
  const overlayTitle = createElement('.podcastOverlay.title');

  const overlayDescription = createElement('.podcastOverlay.description');

  const podcastsText = createElement('.podcastOverlay.episodes.text');
  const podcastEpisodes = createElement('.podcastEpisodes.container');

  overlayHide.onclick = hideActiveOverlay;

  overlayHide.appendChild(overlayDownward);

  overlayCard.appendChild(overlayCover);
  overlayCard.appendChild(overlayHide);
  overlayCard.appendChild(overlayTitle);

  overlayContainer.appendChild(overlayCard);
  overlayContainer.appendChild(overlayDescription);

  overlayContainer.appendChild(podcastsText);
  overlayContainer.appendChild(podcastEpisodes);

  overlayWrapper.appendChild(overlayContainer);

  return overlayWrapper;
}

function createPodcastCollectionOverlay()
{
  const overlayWrapper = createElement('.podcastCollectionOverlay.wrapper');
  const overlayContainer = createElement('.podcastCollectionOverlay.container');

  const overlayFile = createElement('.podcastCollectionOverlay.file');
  const overlayBrowse = createIcon('browse', '.podcastCollectionOverlay.browse');
  
  const overlayHide = createElement('.podcastCollectionOverlay.hide');
  const overlayDownward = createIcon('downward', '.podcastCollectionOverlay.downward');

  const overlaySearchBar = createElement('.podcastCollectionOverlay.searchBar', 'input');
  const overlayCollection = createElement('.podcastCollection.container');

  overlaySearchBar.placeholder = 'Search for Podcasts';

  overlayFile.onclick = () =>
  {
    remote.dialog.showOpenDialog(
      mainWindow, {
        title: 'Choose the podcast feed files',
        properties: [ 'openFile', 'multiSelections' ]
      }, (files) =>
      {
        if (addFromFiles(files))
        {
          // hide the overlay and go to podcasts page
          // as a feedback that the process is done
          hideActiveOverlay();
          changePage(podcastsButton);
        }
      }
    );
  };

  overlayHide.onclick = hideActiveOverlay;

  overlayFile.appendChild(overlayBrowse);
  overlayHide.appendChild(overlayDownward);

  overlayContainer.appendChild(overlayFile);
  overlayContainer.appendChild(overlayHide);

  overlayContainer.appendChild(overlaySearchBar);
  overlayContainer.appendChild(overlayCollection);

  overlayWrapper.appendChild(overlayContainer);

  return overlayWrapper;
}

/** @param { HTMLDivElement } element
* @param { HTMLDivElement } element
* @param { { picture: string, title: string, description: string } } options
*/
function updatePodcastElement(element, options)
{
  if (element.classList.contains('placeholder'))
    element.classList.remove('placeholder');

  if (options.picture)
  {
    element.querySelector('.podcast.cover').style.backgroundImage =
    element.overlayElement.querySelector('.podcastOverlay.cover').style.backgroundImage = `url(${options.picture})`;
  }

  if (options.title)
  {
    element.querySelector('.podcast.title').innerText =
    element.overlayElement.querySelector('.podcastOverlay.title').innerText = options.title;
  }

  if (options.description)
    element.overlayElement.querySelector('.podcastOverlay.description').innerText = options.description;
}

/** @param { HTMLDivElement } element
* @param { string } title
* @param { string } picture
* @param { FeedItem[] } episodes
*/
function updatePodcastEpisodes(element, title, picture, episodes)
{
  const episodesText = element.overlayElement.querySelector('.episodes.text');

  const latestEpisodeContainer = element.querySelector('.podcast.episodeContainer');
  const latestEpisodeInfo = latestEpisodeContainer.querySelector('.podcast.episodeInfo');
  const latestEpisodeTitle = latestEpisodeContainer.querySelector('.podcast.episodeTitle');

  episodesText.innerText = '';

  latestEpisodeContainer.classList.add('clear');

  latestEpisodeInfo.innerText = 'No episodes are available';
  latestEpisodeTitle.innerText = '';

  latestEpisodeContainer.oncontextmenu = undefined;

  if (episodes.length > 0)
  {
    // overlay text label
    episodesText.innerText = 'Episodes';

    // list all episodes in the overlay

    /**  @type { HTMLDivElement }
    */
    const episodesContainer = element.overlayElement.querySelector('.podcastEpisodes.container');

    // remove current episodes to add new ones
    removeAllChildren(episodesContainer);

    // TODO add a load more button to overlay

    for (let i = 0; i < Math.min(10, episodes.length); i++)
    {
      const episodeContainer = createElement('.podcastEpisode.container');
      const episodeInfo = createElement('.podcastEpisode.info');
      const episodeTitle = createElement('.podcastEpisode.title');

      // TODO when a podcast is played fetch it's duration and added to info
      // episodeInfo.innerText = `${millisecondsToTimeAgo(Date.parse(episodes[i].date))} · ${secondsToHms(${durationInSeconds})} left`;

      episodeInfo.innerText = millisecondsToTimeAgo(Date.parse(episodes[i].pubDate));
      episodeTitle.innerText = episodes[i].title;

      // latest episode on the hover effect
      if (i === 0)
      {
        latestEpisodeContainer.classList.remove('clear');

        latestEpisodeInfo.innerText = episodeInfo.innerText;
        latestEpisodeTitle.innerText = episodeTitle.innerText;
      }

      episodeContainer.appendChild(episodeInfo);
      episodeContainer.appendChild(episodeTitle);

      episodesContainer.appendChild(episodeContainer);

      const onclick = (event) =>
      {
        queuePodcast(episodes[i], title, picture, true);
        
        event.stopPropagation();
      };

      episodeContainer.onclick = onclick;

      // latest episode on the hover effect
      if (i === 0)
        latestEpisodeContainer.onclick = onclick;

      const contextMenu = {
        'Play': () => queuePodcast(episodes[i], title, picture, true),
        'Add to Queue': () => queuePodcast(episodes[i], title, picture, false)
      };

      createContextMenu(episodeContainer, contextMenu, episodeContainer);

      // latest episode on the hover effect
      if (i === 0)
        createContextMenu(latestEpisodeContainer, contextMenu, element);
    }
  }
}

function appendPodcastCollectionItemPlaceholder()
{
  const itemWrapper = createElement('.podcastCollection.itemWrapper.placeholder');
  const itemContainer = createElement('.podcastCollection.itemContainer');

  const cover = createElement('.podcastCollection.cover');
  const title = createElement('.podcastCollection.title');
  const button = createElement('.podcastCollection.button');

  itemContainer.appendChild(cover);
  itemContainer.appendChild(title);
  itemContainer.appendChild(button);

  itemWrapper.appendChild(itemContainer);

  collectionContainer.appendChild(itemWrapper);

  return itemWrapper;
}

/** @param { HTMLDivElement } element
* @param { { picture: string, title: string, buttonText: string, buttonCallback: () => void } } options
*/
function updatePodcastCollectionItem(element, options)
{
  if (element.classList.contains('placeholder'))
    element.classList.remove('placeholder');

  if (options.picture)
    element.querySelector('.podcastCollection.cover').style.backgroundImage = `url(${options.picture})`;

  if (options.title)
    element.querySelector('.podcastCollection.title').innerText = options.title;

  if (options.buttonText)
    element.querySelector('.podcastCollection.button').innerText = options.buttonText;

  if (options.buttonCallback)
    element.querySelector('.podcastCollection.button').onclick = options.buttonCallback;
}

/** used by the files picker in the collection overlay
* to import multiple files in the same time
* @param { string[] } files
*/
function addFromFiles(files)
{
  if (!files)
    return false;
  
  for (let i = 0; i < files.length; i++)
  {
    addPodcastToCollection(files[i]);
  }

  if (files.length > 0)
    return true;
  
  return false;
}

/** @param { string } feedUrl
*/
function addPodcastToCollection(url)
{
  /** process the url and returns a feed object
  * @param { string } url
  */
  function processFeed(url)
  {
    // if url is a link
    if (audioUrlTypeRegex.test(url))
      return readFeedLink(url);
    // else if it's a file
    else
      return readFeedFile(url);
  }

  const podcastElement = appendPodcastPlaceholder();
  const collectionElement = appendPodcastCollectionItemPlaceholder();
  
  // process the url and returns a feed object
  processFeed(url)
    .then((feed) =>
    {
      // TODO save the podcast to the podcast collection json
      // settings.set('collection', collection, 'podcasts');

      // update the placeholders with info from the feed head

      const img = new Image();

      img.src = defaultPicture;

      img.onload = () =>
      {
        updatePodcastElement(podcastElement, {
          title: feed.title,
          description: feed.description,
          picture: img.src
        });

        updatePodcastCollectionItem(collectionElement, {
          title: feed.title,
          picture: img.src,
          buttonText: 'Remove',
          buttonCallback: () =>
          {
            podcastsContainer.removeChild(podcastElement);
            collectionContainer.removeChild(collectionElement);
  
            // TODO remove podcast from collection json
          }
        });
      };

      // load podcast picture

      const picture = settings.cacheImage(feed.image.url);
      settings.receiveCachedImage(picture).then((imagePath) => img.src = imagePath);

      // load podcast episodes

      updatePodcastEpisodes(podcastElement, feed.title, picture, feed.items);
    })
    .catch((err) =>
    {
      // error ocurred during adding the podcast

      // log the error
      console.error(err);

      // rollback anything that has been added before the error
      podcastsContainer.removeChild(podcastElement);
      collectionContainer.removeChild(collectionElement);
    });
}

/** @param { string } url
* @returns { Promise<FeedObject> }
*/
function readFeedFile(url)
{
  return new Promise((resolve, reject) =>
  {
    readFile(url)
      .then((buffer) =>
      {
        parser.parseString(buffer.toString())
          .then((feed) => resolve(feed))
          .catch((err) => reject(err));
      })
      .catch((err) => reject(err));
  });
}

/** @param { string } url
* @returns { Promise<FeedObject> }
*/
function readFeedLink(url)
{
  return new Promise((resolve, reject) =>
  {
    parser.parseURL(url)
      .then((feed) => resolve(feed))
      .catch((err) => reject(err));
  });
}

/** @param { HTMLElement } overlay
*/
function showPodcastOverlay(overlay)
{
  // only one overlay is to be shown at once
  if (window.activeOverlay)
    return;
  
  window.activeOverlay = {
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

/** @param { FeedItem } episode
* @param { string } title
* @param { string } picture
* @param { boolean } clearQueue
*/
function queuePodcast(episode, title, picture, clearQueue)
{
  queueTracks(false, undefined, undefined, clearQueue, {
    url: episode.enclosure.url,
    title: episode.title,
    artists: [ title ],
    picture: picture
  });
}

export function showPodcastCollectionOverlay()
{
  showPodcastOverlay(collectionOverlay);
}
