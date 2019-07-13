import { remote } from 'electron';

import * as settings from '../settings.js';

import { join } from 'path';
import { readFile, readJson, ensureDir, readdir, writeFile, unlink } from 'fs-extra';

import download from '../dl.js';

import { searchApplePodcasts } from './apple-podcasts.js';

import Parser from 'rss-parser';

import {
  createElement, createIcon, createContextMenu,
  changePage, removeAllChildren, hideActiveOverlay,
  secondsToHms, millisecondsToTimeAgo, defaultPicture,
  podcastsButton
} from './renderer.js';

import { queueTracks } from './playback.js';

/** @typedef { Object } FeedObject
* @property { string } title
* @property { string } description
* @property { string } copyright
* @property { string } feedUrl
* @property { string } link
* @property { string } language
* @property { { subtitle: string, author: string, categories: string[] } } itunes
* @property { { url: string, title: string } } image
* @property { FeedItem[] } items
*/

/** @typedef { Object } FeedItem
* @property { string } title
* @property { string } content
* @property { string } contentSnippet
* @property { string } guid
* @property { string } isoDate
* @property { string } pubDate
* @property { { subtitle: string, episode: string, duration: string } } itunes
* @property { { url: string } } enclosure
*/

const { mainWindow } = remote.require(join(__dirname, '../main/window.js'));

/** @type { Parser }
*/
let parser;

const podcastsContainer = document.body.querySelector('.podcasts.container');

/** @type { HTMLDivElement }
*/
const collectionOverlay = createPodcastCollectionOverlay();

/** @type { Object<string, boolean> }
*/
const collectionItems = {};

const overlaySearchBar = collectionOverlay.querySelector('.podcastCollectionOverlay.searchBar');
const collectionContainer = collectionOverlay.querySelector('.podcastCollection.container');

const collectionDir = join(settings.getDirectory(), 'Podcasts');

let podcastOverlaySearchDelay;

export function initPodcasts()
{
  // in the future this info may be useful
  // const enabled = settings.get('podcasts', false);
  // settings.onChange('podcasts', watchForPodcastsDisable);

  // initialize the parser
  parser = new Parser({
    maxRedirects: 5
  });

  // load podcasts from the collection

  // ensure the collection directory exists
  ensureDir(collectionDir).then(() =>
  {
    // read  the collection directory
    readdir(collectionDir).then((files) =>
    {
      for (let i = 0; i < files.length; i++)
      {
        // create a placeholder
        const podcastElement = appendPodcastPlaceholder();
        const collectionElement = appendPodcastCollectionItemPlaceholder();

        // read the podcast feed and update the placeholders
        readJson(join(collectionDir, files[i]))
          .then((feed) => addPodcastToUI(feed, podcastElement, collectionElement))
          .catch(() =>
          {
            // rollback anything that has been added before the error
            podcastsContainer.removeChild(podcastElement);
            collectionContainer.removeChild(collectionElement);
          });
      }
    });
  });

  // set the search bar oninput callback
  overlaySearchBar.oninput = podcastOverlaySearch;

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

  const overlayInfo = createElement('.podcastOverlay.info');
  const overlayAuthor = createElement('.podcastOverlay.author');
  const overlayTitle = createElement('.podcastOverlay.title');

  const overlayDescription = createElement('.podcastOverlay.description');

  const podcastsEpisodesText = createElement('.podcastOverlay.episodes.text');
  const podcastsEpisodesRefresh = createElement('.podcastOverlay.refresh.text');
  
  const podcastEpisodes = createElement('.podcastEpisodes.container');

  const podcastsEpisodesLoad = createElement('.podcastOverlay.load.text');

  overlayHide.onclick = hideActiveOverlay;

  overlayHide.appendChild(overlayDownward);

  overlayInfo.appendChild(overlayAuthor);
  overlayInfo.appendChild(overlayTitle);

  overlayCard.appendChild(overlayCover);
  overlayCard.appendChild(overlayHide);

  overlayCard.appendChild(overlayInfo);

  overlayContainer.appendChild(overlayCard);
  overlayContainer.appendChild(overlayDescription);

  overlayContainer.appendChild(podcastsEpisodesText);
  overlayContainer.appendChild(podcastsEpisodesRefresh);
  
  overlayContainer.appendChild(podcastEpisodes);

  overlayContainer.appendChild(podcastsEpisodesLoad);

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

          // clear the search bar the the results
          overlaySearchBar.value = '';
          removeAllChildren(collectionContainer);
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
* @param { { picture: string, author: string, title: string, description: string } } options
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

  if (options.author)
    element.overlayElement.querySelector('.podcastOverlay.author').innerText = options.author;

  if (options.description)
    element.overlayElement.querySelector('.podcastOverlay.description').innerText = options.description;
}

/** @param { HTMLDivElement } element
* @param { string } title
* @param { string } feedUrl
* @param { string } picture
* @param { FeedItem[] } episodes
*/
function updatePodcastEpisodes(element, title, feedUrl, picture, episodes)
{
  const episodesText = element.overlayElement.querySelector('.episodes.text');
  const episodesRefresh = element.overlayElement.querySelector('.refresh.text');
  const episodesLoad = element.overlayElement.querySelector('.load.text');

  const latestEpisodeContainer = element.querySelector('.podcast.episodeContainer');
  const latestEpisodeInfo = latestEpisodeContainer.querySelector('.podcast.episodeInfo');
  const latestEpisodeTitle = latestEpisodeContainer.querySelector('.podcast.episodeTitle');

  episodesText.innerText =
  episodesRefresh.innerText =
  episodesLoad.innerText =  '';

  episodesRefresh.onclick =
  episodesLoad.onclick = undefined;

  latestEpisodeContainer.classList.add('clear');

  latestEpisodeInfo.innerText = 'No episodes are available';
  latestEpisodeTitle.innerText = '';

  latestEpisodeContainer.oncontextmenu = undefined;

  if (Array.isArray(episodes))
  {
    // overlay texts
    if (episodes[0] === 'refresh')
    {
      episodesText.innerText = 'Episodes are refreshing...';
    }
    else
    {
      episodesText.innerText = 'Episodes -';
      episodesRefresh.innerText = 'Refresh';
      episodesLoad.innerText = 'Load More';
    }

    episodesRefresh.onclick = () =>
    {
      // as a feed back to the user that the queue is refreshing
      updatePodcastEpisodes(element, title, feedUrl, picture, [ 'refresh' ]);

      processFeed(feedUrl)
        .then((feed) =>
        {
          // updated the episodes in the overlay
          updatePodcastEpisodes(element, title, feedUrl, picture, feed.items);

          // save new feed locally
          writeFile(join(collectionDir, title), JSON.stringify(feed));
        })
        .catch(() =>
        {
          // in case that the refresh fails we should re-add the episodes we have
          updatePodcastEpisodes(element, title, feedUrl, picture, episodes);
        });
    };

    // list all episodes in the overlay

    /**  @type { HTMLDivElement }
    */
    const episodesContainer = element.overlayElement.querySelector('.podcastEpisodes.container');

    // remove current episodes to add new ones
    removeAllChildren(episodesContainer);

    // TODO add a load more button to overlay

    for (let i = 0; i < Math.min(10, episodes.length); i++)
    {
      if (!episodes[i].title)
        continue;
      
      const episodeContainer = createElement('.podcastEpisode.container');
      const episodeInfo = createElement('.podcastEpisode.info');
      const episodeTitle = createElement('.podcastEpisode.title');

      if (episodes[i].itunes && episodes[i].itunes.duration)
        episodeInfo.innerText =
        `${millisecondsToTimeAgo(Date.parse(episodes[i].pubDate))} · ${secondsToHms(parseFloat(episodes[i].itunes.duration))}`;
      else
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

/** process the url and returns a feed object
* @param { string } url
*/
function processFeed(url)
{
  // if url is a link
  if (url.startsWith('http://') || url.startsWith('https://'))
    return readFeedLink(url);
  // else if it's a file
  else
    return readFeedFile(url);
}

/** @param { string } feedUrl
*/
function addPodcastToCollection(url)
{
  const podcastElement = appendPodcastPlaceholder();
  const collectionElement = appendPodcastCollectionItemPlaceholder();
  
  // process the url and returns a feed object
  processFeed(url)
    .then((feed) =>
    {
      // if the podcast is already added
      if (collectionItems[feed.feedUrl])
        throw new Error('this podcast is already added');
      
      // update the placeholders
      const picture = addPodcastToUI(feed, podcastElement, collectionElement);

      // load podcast episodes
      updatePodcastEpisodes(podcastElement, feed.title, feed.feedUrl, picture, feed.items);
      
      // save the podcast to collection
      return writeFile(join(collectionDir, feed.title), JSON.stringify(feed));
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

/** @param { FeedObject } feed
* @param { HTMLElement } podcastElement
* @param { HTMLElement } collectionElement
*/
function addPodcastToUI(feed, podcastElement, collectionElement)
{
  // update the placeholders with info from the feed head

  const img = new Image();

  img.src = defaultPicture;

  img.onload = () =>
  {
    updatePodcastElement(podcastElement, {
      author: (feed.itunes && feed.itunes.author) ? feed.itunes.author : undefined,
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
        // remove podcast from collection
        unlink(join(collectionDir, feed.title));

        // remove podcast from ui
        podcastsContainer.removeChild(podcastElement);
        
        collectionContainer.removeChild(collectionElement);
        // free the podcast feed url, so the user can add the same podcast again
        delete collectionItems[feed.feedUrl];
      }
    });

    // set the podcast feed url as busy, so the user can't add the same podcast more than once
    collectionItems[feed.feedUrl] = true;
  };

  // load podcast picture

  const picture = settings.cacheImage(feed.image.url);

  settings.receiveCachedImage(picture).then((imagePath) => img.src = imagePath);

  // load podcast episodes
  updatePodcastEpisodes(podcastElement, feed.title, feed.feedUrl, picture, feed.items);

  return picture;
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
    download(url, {
      onDone: (path) =>
      {
        readFile(path)
          .then((file) => parser.parseString(file.toString()))
          .then((feed) => resolve(feed))
          .catch((err) => reject(err));
      },
      onError: reject
    });
  });
}

/** @param { HTMLElement } overlay
* @param { HTMLElement } autofocus
*/
function showPodcastOverlay(overlay, autofocus)
{
  // only one overlay is to be shown at once
  if (window.activeOverlay)
    return;
  
  window.activeOverlay = {
    overlayElement: overlay
  };

  // add the overlay to the body
  document.body.appendChild(overlay);

  // auto focus on this item when the overlay is shown
  if (autofocus)
    autofocus.focus();

  // triggers the animation
  setTimeout(() =>
  {
    overlay.classList.add('active');
  }, 100);
}

function podcastOverlaySearch()
{
  const delay = 500;

  clearTimeout(podcastOverlaySearchDelay);

  podcastOverlaySearchDelay = setTimeout(() =>
  {
    /** @type { string }
    */
    const input = overlaySearchBar.value;

    for (let i = 0; i < collectionContainer.children.length; i++)
    {
      const child = collectionContainer.children[i];

      // remove all pervious search results items
      if (child.searchResult)
      {
        collectionContainer.removeChild(child);
      }
      // if search input is empty then show all collection items
      else if (input.length <= 0)
      {
        child.style.setProperty('display', '');
      }
      // if search input is not empty then show only collection items that fit the input
      else
      {
        const title = child.querySelector('.podcastCollection.title').innerText.toLowerCase();
        
        if (
          title.includes(input.toLowerCase()) ||
          input.toLowerCase().includes(title)
        )
          child.style.setProperty('display', '');
        else
          child.style.setProperty('display', 'none');
      }
    }

    // add all apple podcasts that fit the input
    searchApplePodcasts(input).then((response) =>
    {
      for (let i = 0; i < collectionContainer.children.length; i++)
      {
        const child = collectionContainer.children[i];

        // remove all pervious search results items
        if (child.searchResult)
          collectionContainer.removeChild(child);
      }

      for (let i = 0; i < Math.min(response.results.length, 16); i++)
      {
        const podcast = response.results[i];

        if (collectionItems[podcast.feedUrl])
          continue;
        
        const collectionElement = appendPodcastCollectionItemPlaceholder();

        collectionElement.searchResult = true;
        collectionElement.input = input;

        const img = new Image();

        img.src = defaultPicture;

        img.onload = () =>
        {
          updatePodcastCollectionItem(collectionElement, {
            title: podcast.collectionName,
            buttonText: 'Add',
            picture: img.src,
            buttonCallback: () =>
            {
              addPodcastToCollection(podcast.feedUrl);

              // hide the overlay and go to podcasts page
              // as a feedback that the process is done
              hideActiveOverlay();
              changePage(podcastsButton);

              // clear the search bar the the results
              overlaySearchBar.value = '';
              removeAllChildren(collectionContainer);
            }
          });
        };

        const picture = settings.cacheImage(podcast.artworkUrl100);
        settings.receiveCachedImage(picture).then((imagePath) => img.src = imagePath);
      }
    });
  }, delay);
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
  showPodcastOverlay(collectionOverlay, overlaySearchBar);
}
