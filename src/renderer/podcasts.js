import { remote } from 'electron';

import * as settings from '../settings.js';

import { homedir } from 'os';
import { join } from 'path';
import { readFile } from 'fs-extra';

import { searchPodcasts, getPodcastFeedUrl } from './apple-podcasts.js';

import request from 'request-promise-native';
import feedParse from 'davefeedread';

import {
  createElement, createIcon, createContextMenu,
  changePage, removeAllChildren, hideActiveOverlay,
  secondsToHms, millisecondsToTimeAgo, defaultPicture,
  
} from './renderer.js';

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
* @property { string } summary
* @property { string } date
* @property { { url: string }[] } enclosures
*/

const { mainWindow } = remote.require(join(__dirname, '../main/window.js'));

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
  // const enabled = settings.get('podcasts', false);
  // settings.onChange('podcasts', watchForPodcastsDisable);

  // searchPodcasts('The Vergecast').then((podcast) =>
  // {
  //   getPodcastFeedUrl(podcast.results[0].collectionId).then((feedUrl) =>
  //   {
  //     addPodcastToCollection(feedUrl);
  //   });
  // });

  // TODO load podcasts from the collection json

  // addPodcastToCollection('https://feeds.megaphone.fm/vergecast');
  // addPodcastToCollection(join(homedir(), 'Documents/vergecast.xml'));

  // updatePodcastElement(appendPodcastPlaceholder(), {
  //   picture: join(homedir(), 'Documents/why.jpeg'),
  //   title: 'Why\'d You Push That Button?',
  //   description: 'A Podcast About love and happiness',
  //   episodes:
  //   [
  //     {
  //       title: 'How to buy a phone?!',
  //       published: 1558130485221,
  //       duration: 120
  //     }
  //   ]
  // });

  // addPodcastToCollection({
  //   picture: join(homedir(), 'Documents/why.jpeg'),
  //   title: 'Why\'d You Push That Button?'
  // });
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
  const overlayBackground = createElement('.podcastOverlay.background');
  const overlayContainer = createElement('.podcastOverlay.container');

  const overlayCard = createElement('.podcastOverlay.card');

  const overlayCover = createElement('.podcastOverlay.cover');
  const overlayHide = createElement('.podcastOverlay.hide');
  const overlayDownward = createIcon('downward', '.podcastOverlay.downward');
  const overlayArtist = createElement('.podcastOverlay.artist');
  const overlayTitle = createElement('.podcastOverlay.title');

  const overlaydescription = createElement('.podcastOverlay.description');

  const podcastsText = createElement('.podcastOverlay.episodes.text');
  const podcastEpisodes = createElement('.podcastEpisodes.container');

  overlayHide.onclick = hideActiveOverlay;

  overlayHide.appendChild(overlayDownward);

  overlayCard.appendChild(overlayCover);
  overlayCard.appendChild(overlayHide);
  overlayCard.appendChild(overlayArtist);
  overlayCard.appendChild(overlayTitle);

  overlayContainer.appendChild(overlayCard);
  overlayContainer.appendChild(overlaydescription);

  overlayContainer.appendChild(podcastsText);
  overlayContainer.appendChild(podcastEpisodes);

  overlayWrapper.appendChild(overlayContainer);
  overlayWrapper.appendChild(overlayBackground);

  return overlayWrapper;
}

function createPodcastCollectionOverlay()
{
  const overlayWrapper = createElement('.podcastCollectionOverlay.wrapper');
  const overlayBackground = createElement('.podcastCollectionOverlay.background');
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
        addFromFiles(files);

        // hide the overlay and go to podcasts page
        // as a feedback that the process is done
        hideActiveOverlay();
        changePage(podcastsButton);
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
  overlayWrapper.appendChild(overlayBackground);

  return overlayWrapper;
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
* @param { { picture: string, title: string, buttonText: string } } options
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
}

/** @param { HTMLDivElement } element
* @param { HTMLDivElement } element
* @param { { picture: string, title: string, description: string, episodes: { title: string, published: number, duration: number }[] } } options
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

  if (options.episodes)
  {
    const episodesText = element.overlayElement.querySelector('.episodes.text');

    const episodeContainer = element.querySelector('.podcast.episodeContainer');

    const episodeInfo = episodeContainer.querySelector('.podcast.episodeInfo');
    const episodeTitle = episodeContainer.querySelector('.podcast.episodeTitle');

    episodesText.innerText = '';

    episodeContainer.classList.add('clear');

    episodeInfo.innerText = 'No episodes are available';
    episodeTitle.innerText = '';

    episodeContainer.oncontextmenu = undefined;

    if (options.episodes && options.episodes.length > 0)
    {
      // overlay text label

      episodesText.innerText = 'Episodes';

      // show latest episode on the hover effect
  
      episodeContainer.classList.remove('clear');

      episodeInfo.innerText = `${millisecondsToTimeAgo(options.episodes[0].published)} · ${secondsToHms(options.episodes[0].duration)} left`;
      episodeTitle.innerText = options.episodes[0].title;
  
      episodeContainer.onclick = (event) =>
      {
        // TODO queue podcast
        event.stopPropagation();
      };

      // TODO queue podcast
      createContextMenu(episodeContainer, {
        'Play': () => {},
        'Add to Queue': () => {}
      }, element);

      // list all episodes in the overlay

      /**  @type { HTMLDivElement }
      */
      const episodesContainer = element.overlayElement.querySelector('.podcastEpisodes.container');

      // remove current episodes to add new ones
      removeAllChildren(episodesContainer);

      for (let i = 0; i < options.episodes.length; i++)
      {
        const episode = options.episodes[i];

        const episodeContainer = createElement('.podcastEpisode.container');
        const episodeInfo = createElement('.podcastEpisode.info');
        const episodeTitle = createElement('.podcastEpisode.title');

        episodeInfo.innerText = `${millisecondsToTimeAgo(episode.published)} · ${secondsToHms(episode.duration)} left`;
        episodeTitle.innerText = episode.title;

        episodeContainer.appendChild(episodeInfo);
        episodeContainer.appendChild(episodeTitle);

        episodesContainer.appendChild(episodeContainer);

        // TODO queue podcast
        createContextMenu(episodeContainer, {
          'Play': () => {},
          'Add to Queue': () => {}
        }, element);
      }
    }
  }
}

/** used by the files picker in the collection overlay
* to import multiple files in the same time
* @param { string[] } files
*/
function addFromFiles(files)
{
  for (let i = 0; i < files.length; i++)
  {
    addPodcastToCollection(files[i]);
  }
}

/** @param { FeedObject } feedUrl
*/
function addPodcastToCollection(url)
{
  const podcastElement = appendPodcastPlaceholder();
  const collectionElement = appendPodcastCollectionItemPlaceholder();
  
  /** process the url and returns a feed object
  * @param { string } url
  */
  function processFeed(url)
  {
    const regex = /https?:\/\/(www\.)?[-a-zA-Z0-9@:%._\+~#=]{2,256}\.[a-z]{2,6}\b([-a-zA-Z0-9@:%_\+.~#?&//=]*)/gi;

    // if url is a link
    if (regex.test(url))
      return readFeedLink(url);
    // else if it's a file
    else
      return readFeedFile(url);
  }

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
          title: feed.head.title,
          description: feed.head.description,
          picture: img.src
        });

        updatePodcastCollectionItem(collectionElement, {
          title: feed.head.title,
          picture: img.src,
          buttonText: 'Remove'
        });

        // removing the podcast from collection
        collectionElement.onclick = () =>
        {
          podcastsContainer.removeChild(podcastElement);
          collectionContainer.removeChild(collectionElement);

          // TODO remove podcast from collection json
        };
      };

      const picture = settings.cacheImage(feed.head.image.url);
      settings.receiveCachedImage(picture).then((imagePath) => img.src = imagePath);
    })
    .catch(() =>
    {
      // error ocurred during adding the podcast
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
    readFile(url, { encoding: 'utf8' })
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
* @returns { Promise<FeedObject> }
*/
function readFeedLink(url)
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

export function showPodcastCollectionOverlay()
{
  showPodcastOverlay(collectionOverlay);
}
