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
  secondsToHms, millisecondsToTimeAgo, podcastsButton
} from './renderer.js';

const { mainWindow } = remote.require(join(__dirname, '../main/window.js'));

const podcastsContainer = document.body.querySelector('.podcasts.container');

/** @type { HTMLDivElement }
*/
let collectionOverlay;

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

  collectionOverlay = createPodcastCollectionOverlay();

  // updatePodcastElement(appendPodcastPlaceholder(), {
  //   picture: join(homedir(), 'Documents/why.jpeg'),
  //   artist: 'The Verge',
  //   title: 'Why\'d You Push That Button?',
  //   summary: 'A Podcast About love and happiness',
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

  const overlaySummary = createElement('.podcastOverlay.summary');

  const podcastsText = createElement('.podcastOverlay.episodes.text');
  const podcastEpisodes = createElement('.podcastEpisodes.container');

  overlayHide.onclick = hideActiveOverlay;

  overlayHide.appendChild(overlayDownward);

  overlayCard.appendChild(overlayCover);
  overlayCard.appendChild(overlayHide);
  overlayCard.appendChild(overlayArtist);
  overlayCard.appendChild(overlayTitle);

  overlayContainer.appendChild(overlayCard);
  overlayContainer.appendChild(overlaySummary);

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

/** @param { HTMLDivElement } element
* @param { HTMLDivElement } element
* @param { { picture: string, artist: string, title: string, summary: string, episodes: { title: string, published: number, duration: number }[] } } options
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
    element.overlayElement.querySelector('.podcastOverlay.summary').innerText = options.summary;

  if (options.episodes)
  {
    const episodesText = element.overlayElement.querySelector('.episodes.text');

    const episodeContainer = element.querySelector('.podcast.episodeContainer');

    const episodeInfo = episodeContainer.querySelector('.podcast.episodeInfo');
    const episodeTitle = episodeContainer.querySelector('.podcast.episodeTitle');

    episodesText.innerText = '';

    episodeInfo.innerText = 'No episodes are available';
    episodeTitle.innerText = '';

    episodeContainer.oncontextmenu = undefined;

    if (options.episodes && options.episodes.length > 0)
    {
      // overlay text label

      episodesText.innerText = 'Episodes';

      // show latest episode on the hover effect
  
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

/** @param { string[] } files
*/
function addFromFiles(files)
{
  for (let i = 0; i < files.length; i++)
  {
    // read each file feed then add it to collection
    readFeedFile(files[i]).then((feed) => addPodcastToCollection(feed));
  }
}

/** @param { {} } feed
*/
function addPodcastToCollection(feed)
{
  // TODO add podcast to collection
  console.log(feed);
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

export function showPodcastCollectionOverlay()
{
  showPodcastOverlay(collectionOverlay);
}
