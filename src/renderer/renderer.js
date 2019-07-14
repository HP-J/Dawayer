import tippy from 'tippy.js';

import { platform } from 'os';
import { join } from 'path';

import TimeAgo from 'javascript-time-ago';
import en from 'javascript-time-ago/locale/en';

import * as settings from '../settings.js';

import scroll from './scroll.js';
import { initMPRISPlayer } from './mpris.js';

import { initStorage } from './storage.js';
import { initPodcasts } from './podcasts.js';
import { initOptions } from './options.js';

import {
  initPlayback, setVolume, setSeekTime,
  getSeekTime, getVolume, getPlayingMode, setPlayingMode,
  getShuffleMode, setShuffleMode, getRepeatMode, setRepeatMode,
  getDuration, nextInQueue, previouslyOnQueue,
  rewindBackwards, skipForward
} from './playback.js';

/** @typedef { import('tippy.js').Instance } TippyInstance
*/

// Variables

/** @type { TimeAgo }
*/
let timeAgo;

let resizeEndTimeout;

let lastRememberedVolume = 1;

/**  @type { HTMLDivElement }
*/
let selectedPage;

/**  @type { HTMLDivElement }
*/
let selectedLocalIcon;

/**  @type { HTMLDivElement }
*/
let selectedLocalSubPage;

/**  @type { HTMLDivElement }
*/
const menuContainer = document.body.querySelector('.menu.container');

/**  @type { HTMLDivElement }
*/
const controlBar = document.body.querySelector('.controlBar.container');

/**  @type { HTMLDivElement }
*/
const pagesContainer = document.body.querySelector('.pages.container');

/**  @type { HTMLDivElement }
*/
const localSubPagesContainer = document.body.querySelector('.page.extended.local');

/**  @type { HTMLDivElement }
*/
export const playingButton = menuContainer.children.item(0);

/**  @type { HTMLDivElement }
*/
export const localButton = menuContainer.children.item(1);

/**  @type { HTMLDivElement }
*/
const localIconsContainer = localButton.children[0];

/**  @type { HTMLDivElement }
*/
export const podcastsButton = menuContainer.children.item(2);

/**  @type { HTMLDivElement }
*/
export const optionsButton = menuContainer.children.item(3);

/**  @type { HTMLDivElement }
*/
const seekBar = controlBar.querySelector('.seekBar.container');

/**  @type { HTMLDivElement }
*/
const playButton = controlBar.querySelector('.playButton');

/**  @type { HTMLDivElement }
*/
const rewindButton = controlBar.querySelector('.rewindButton');

/**  @type { HTMLDivElement }
*/
const previousButton = controlBar.querySelector('.previousButton');

/**  @type { HTMLDivElement }
*/
const nextButton = controlBar.querySelector('.nextButton');

/**  @type { HTMLDivElement }
*/
const skipButton = controlBar.querySelector('.skipButton');

/**  @type { HTMLDivElement }
*/
export const rewindTimeText = rewindButton.children[1];

/**  @type { HTMLDivElement }
*/
export const skipTimeText = skipButton.children[1];

/**  @type { HTMLDivElement }
*/
const shuffleButton = controlBar.querySelector('.shuffleButton');

/**  @type { HTMLDivElement }
*/
const repeatButton = controlBar.querySelector('.repeatButton');

/**  @type { HTMLDivElement }
*/
const volumeButton = controlBar.querySelector('.volumeButton');

/**  @type { HTMLDivElement }
*/
const volumeBar = document.body.querySelector('.volumeBar.container');

/** @type { TippyInstance }
*/
let seekTooltip;

/** @type { TippyInstance }
*/
export let rewindTimeTooltip;

/** @type { TippyInstance }
*/
export let skipTimeTooltip;

/**  @type { string }
*/
export const defaultPicture = join(__dirname, '../../missing.png');

export let firstInteraction = false;

// Init

function initEvents()
{
  // menu events

  playingButton.onclick = () => changePage(playingButton);

  localButton.onclick = () =>
  {
    // only switch sub-page when the page is selected
    if (!changePage(localButton))
      changeLocalSubPage(Array.prototype.indexOf.call(localSubPagesContainer.children, selectedLocalSubPage));
  };

  podcastsButton.onclick = () => changePage(podcastsButton);

  optionsButton.onclick = () => changePage(optionsButton);

  // playback events

  playButton.onclick = switchPlayingMode;

  previousButton.onclick = previouslyOnQueue;
  nextButton.onclick = nextInQueue;

  rewindButton.onclick = rewindBackwards;
  skipButton.onclick = skipForward;

  shuffleButton.onclick = switchShuffleMode;
  repeatButton.onclick = switchRepeatMode;

  volumeButton.onclick = muteVolume;

  // sub-menu events

  document.body.querySelector('.submenuButton.playing').onclick = () =>
  {
    changePage(playingButton);
  };

  document.body.querySelector('.submenuButton.albums').onclick = () =>
  {
    changePage(localButton, () => changeLocalSubPage(-1));
  };

  document.body.querySelector('.submenuButton.tracks').onclick = () =>
  {
    changePage(localButton, () => changeLocalSubPage(0));
  };

  document.body.querySelector('.submenuButton.artists').onclick = () =>
  {
    changePage(localButton, () => changeLocalSubPage(1));
  };

  document.body.querySelector('.submenuButton.podcasts').onclick = () =>
  {
    changePage(podcastsButton);
  };

  document.body.querySelector('.submenuButton.options').onclick = () =>
  {
    changePage(optionsButton);
  };

  // disable on settings change
  
  settings.onChange('podcasts', togglePodcastsPage);

  // window events and first interaction protection

  window.addEventListener('keydown', (event) =>
  {
    firstInteraction = true;

    // escape button hides any active overlay
    if (event.key === 'Escape')
    {
      event.preventDefault();

      hideActiveOverlay();
    }
  
    // space button switches the playing mode
    if (event.key === ' ')
    {
      if (document.activeElement.tagName !== 'INPUT')
      {
        event.preventDefault();
        
        switchPlayingMode();
      }
    }
  });

  window.addEventListener('mousedown', () =>
  {
    firstInteraction = true;
  });

  window.addEventListener('contextmenu', () =>
  {
    firstInteraction = true;
  });

  window.onload = onload;
  window.onresize = onresize;
}

function initTippy()
{
  // create and configure tooltips

  tippy.setDefaults({
    a11y: false,
    delay: [ 200, 5 ],
    duration: [ 235, 200 ]
  });

  tippy(playingButton, {
    content: document.body.querySelector('.submenuContainer.playing'),
    placement: 'bottom',
    interactive: true,
    arrow: true
  });

  tippy(localButton, {
    content: document.body.querySelector('.submenuContainer.local'),
    placement: 'bottom',
    interactive: true,
    arrow: true
  });

  tippy(podcastsButton, {
    content: document.body.querySelector('.submenuContainer.podcasts'),
    placement: 'bottom',
    interactive: true,
    arrow: true
  });

  tippy(optionsButton, {
    content: document.body.querySelector('.submenuContainer.options'),
    placement: 'bottom',
    interactive: true,
    arrow: true
  });

  seekTooltip = tippy(seekBar, {
    duration: 0,
    content: 0,
    hideOnClick: false,
    placement: 'top',
    followCursor: 'horizontal',
    arrow: true
  });

  rewindTimeTooltip = tippy(rewindButton);
  skipTimeTooltip = tippy(skipButton);

  tippy(volumeButton, {
    content: volumeBar,
    interactive: true
  });
}

/** @param { HTMLDivElement } element
 * @param { (percentage: number) => void } mousemove
* @param { (percentage: number) => void } mousedown
*/
function initBar(element, mousemove, mousedown)
{
  /** @param { MouseEvent } event
  */
  function update(event)
  {
    const rect = element.getBoundingClientRect();

    const width = Math.round(rect.width);
    const left = Math.round(rect.left);

    const x = Math.max(Math.min(event.clientX - left, width), 0);

    if (mousemove)
      mousemove(x / width);

    if (element.mouseDown && mousedown)
      mousedown(x / width);
  }

  element.onmousedown = () =>
  {
    element.mouseDown = true;

    update(event);
  };

  element.onmouseup = element.onmouseleave = () =>
  {
    element.mouseDown = false;
  };

  element.onmousemove = (event) =>
  {
    update(event);
  };
}

function init()
{
  // init variables

  const currentPlatform = platform();

  TimeAgo.addLocale(en);

  timeAgo = new TimeAgo('en-US');

  // init functions

  initEvents();
  initTippy();

  initPlayback();
  
  initOptions();

  initStorage();
  initPodcasts();

  // setup

  setSeekTimeWithUI(getSeekTime(), true);
  initBar(seekBar, showSeekTime, setSeekTimeWithUI);

  setVolumeWithUI(getVolume(), true);
  initBar(volumeBar, undefined, setVolumeWithUI);

  // they have default classes
  shuffleButton.classList.remove('shuffled');
  repeatButton.classList.remove('looping');

  shuffleButton.classList.add(getShuffleMode());
  repeatButton.classList.add(getRepeatMode());

  // enable MPRIS Player if on linux
  if (currentPlatform === 'linux')
    initMPRISPlayer();

  // setup UI elements

  setupPages();
}

function setupPages()
{
  // set the default pages
  // the pages the user first sees when they starts the application

  menuContainer.children.item(1).classList.add('selected');

  selectedPage = pagesContainer.children.item(1);
  selectedLocalIcon = localIconsContainer.children.item(0);
  selectedLocalSubPage = localSubPagesContainer.children.item(0);

  scroll(selectedLocalIcon, { duration: 0, direction: 'vertical' });
  scroll(selectedLocalSubPage, { duration: 0, direction: 'vertical' });
  scroll(selectedPage, { duration: 0 });
}

// Playback

export function switchPlayingMode()
{
  const modes =
  {
    paused: 'playing',
    playing: 'paused'
  };

  const playingMode = getPlayingMode();

  if (setPlayingMode(modes[playingMode]))
  {
    playButton.classList.remove(playingMode);
    playButton.classList.add(modes[playingMode]);
  }
}

/** @param { 'paused' | 'playing' } mode
*/
export function forcePlayingMode(mode)
{
  const playingMode = getPlayingMode();

  playButton.classList.remove(playingMode);

  setPlayingMode(mode);

  playButton.classList.add(mode);
}

function switchShuffleMode()
{
  const modes =
  {
    shuffled: 'normal',
    normal: 'shuffled'
  };

  const shuffleMode = getShuffleMode();

  if (setShuffleMode(modes[shuffleMode]))
  {
    shuffleButton.classList.remove(shuffleMode);
    shuffleButton.classList.add(modes[shuffleMode]);
  }
}

/** @param { 'shuffled' | 'normal' } mode
*/
export function forceShuffleMode(mode)
{
  const shuffleMode = getShuffleMode();

  shuffleButton.classList.remove(shuffleMode);

  setShuffleMode(mode);

  shuffleButton.classList.add(mode);
}

function switchRepeatMode()
{
  const modes =
  {
    looping: 'repeating',
    repeating: 'once',
    once: 'looping'
  };

  const repeatMode = getRepeatMode();

  if (setRepeatMode(modes[repeatMode]))
  {
    repeatButton.classList.remove(repeatMode);
    repeatButton.classList.add(modes[repeatMode]);
  }
}

/** @param { 'looping' | 'repeating' | 'once' } mode
*/
export function forceRepeatMode(mode)
{
  const repeatMode = getRepeatMode();

  repeatButton.classList.remove(repeatMode);

  setRepeatMode(mode);

  repeatButton.classList.add(mode);
}

function muteVolume()
{
  if (!volumeButton.classList.contains('muted'))
    setVolumeWithUI(0);
  else if (lastRememberedVolume === 0 || 0.15 >= lastRememberedVolume)
    setVolumeWithUI(0.15);
  else
    setVolumeWithUI(lastRememberedVolume);
}

/** @param { HTMLDivElement } element
* @param { number } playedPercentage
*/
function updateBarPercentage(element, playedPercentage)
{
  element.style.setProperty('--bar-percentage', (playedPercentage * 100) + '%');
}

/** @param { number } percentage
*/
function showSeekTime(percentage)
{
  const duration = getDuration();

  if (duration > -1)
  {
    seekTooltip.enable();

    seekTooltip.setContent(secondsToDuration(duration * percentage));
  }
  else
  {
    seekTooltip.disable();
  }
}

/** @param { number } percentage
* @param { boolean } visualOnly
*/
export function setSeekTimeWithUI(percentage, visualOnly)
{
  percentage = percentage || 0;

  if (setSeekTime(percentage, visualOnly, true))
  {
    updateBarPercentage(seekBar, percentage);
  }
}

/** @param { number } percentage
* @param { boolean } ignoreLock
*/
export function setVolumeWithUI(percentage, ignoreLock)
{
  percentage = percentage || 0;

  lastRememberedVolume = getVolume();

  if (ignoreLock || setVolume(percentage))
  {
    if (percentage !== 0)
    {
      if (volumeButton.classList.contains('muted'))
        volumeButton.classList.remove('muted');
    }
    else
    {
      if (!volumeButton.classList.contains('muted'))
        volumeButton.classList.add('muted');
    }
  
    updateBarPercentage(volumeBar, percentage);
  }
}

export function togglePodcastsPage(state)
{
  if (state)
  {
    menuContainer.insertBefore(podcastsButton, menuContainer.children[podcastsButton.index]);
    pagesContainer.insertBefore(podcastsButton.page, pagesContainer.children[podcastsButton.index]);
  }
  else
  {
    podcastsButton.index = Array.prototype.indexOf.call(menuContainer.children, podcastsButton);
    podcastsButton.page = pagesContainer.children[podcastsButton.index];

    menuContainer.removeChild(podcastsButton);
    pagesContainer.removeChild(podcastsButton.page);

    podcastsButton.page.style.display = 'none';
  }
}

/** @param { boolean } state
*/
export function toggleSeekBarLoading(state)
{
  const indicator = seekBar.querySelector('.indicator');

  if (state)
  {
    if (!indicator.classList.contains('loading'))
      indicator.classList.add('loading');
  }
  else
  {
    if (indicator.classList.contains('loading'))
      indicator.classList.remove('loading');
  }
}

/** @param { boolean } state
*/
export function toggleSeekBarBuffered(state)
{
  const indicator = seekBar.querySelector('.indicator');

  if (state)
  {
    if (!indicator.classList.contains('buffering'))
      indicator.classList.add('buffering');
  }
  else
  {
    if (indicator.classList.contains('buffering'))
      indicator.classList.remove('buffering');
  }
}

/** @param { number } progress
*/
export function setSeekBarBuffered(progress)
{
  const indicator = seekBar.querySelector('.indicator');

  indicator.style.setProperty('--bar-percentage', progress + '%');
}

// Callbacks

function resizeEnd()
{
  // remove no-motion class
  document.body.classList.remove('fastforward');
}

function onload()
{
  // remove fast-forward class from the html body
  resizeEnd();
}

function onresize()
{
  // clear old resize-end timeout event
  if (resizeEndTimeout)
    clearTimeout(resizeEndTimeout);

  // add no-motion class
  if (!document.body.classList.contains('fastforward'))
    document.body.classList.add('fastforward');

  // set a new resize-end timeout
  resizeEndTimeout = setTimeout(resizeEnd, 25);
}

// Page Transactions

/** @param { HTMLDivElement } element
* @param { () => void } callback
*/
export function changePage(element, callback)
{
  const selected = document.querySelector('.menuItem.selected');

  // hide any active tooltip
  // if the user clicked on a tooltip to change page
  // it shouldn't stick around after
  tippy.hideAll();

  if (selected !== element)
  {
    selected.classList.remove('selected');
    element.classList.add('selected');

    // get the index of the button
    const pageIndex = Array.prototype.indexOf.call(element.parentElement.children, element);

    // hide controls background in page is Now Playing
    if (pageIndex === 0)
    {
      controlBar.classList.add('extended');
    }
    else
    {
      if (controlBar.classList.contains('extended'))
        controlBar.classList.remove('extended');
    }

    // the index of the button is the same the the page
    selectedPage = pagesContainer.children.item(pageIndex);

    // scroll to the page
    scroll(selectedPage, { callback: callback });

    return true;
  }
  else
  {
    if (callback)
      callback();

    return false;
  }
}

/** @param { number } index
* @param { () => void } callback
*/
export function changeLocalSubPage(index, callback)
{
  if ((index + 1) >= localIconsContainer.children.length)
    index = 0;
  else
    index = index + 1;

  selectedLocalIcon = localIconsContainer.children.item(index);
  selectedLocalSubPage = localSubPagesContainer.children.item(index);

  // smooth scroll to the sub-page and its icon
  scroll(selectedLocalIcon, { direction: 'vertical' });
  scroll(selectedLocalSubPage, { direction: 'vertical', callback: callback });
}

// API

/** @param { string } classes
* @param { string } [tagName]
*/
export function createElement(classes, tagName)
{
  const element = document.createElement(tagName || 'div');

  if (classes)
  {
    const classesArray = classes.split('.');
    classesArray.shift();
  
    element.classList.add(...classesArray);
  }

  return element;
}

/**@param { string } name
* @param { string } classes
* @return {SVGSVGElement}
*/
export function createIcon(name, classes)
{
  const classesArray = classes.split('.');
  classesArray.shift();

  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  const use = document.createElementNS('http://www.w3.org/2000/svg', 'use');

  svg.classList.add('icon');
  svg.classList.add(...classesArray);

  use.setAttributeNS('http://www.w3.org/1999/xlink', 'xlink:href', `./icons.svg#${name}`);

  svg.appendChild(use);

  return svg;
}

/** @param { HTMLElement } element
* @param { Object<string, () => void> } menuItems
* @param { HTMLElement } parentElement
*/
export function createContextMenu(element, menuItems, parentElement)
{
  // if the element has a context menu already then remove it
  let contextMenuWrapper;
  let contextMenuElement;

  if (element._contextMenu)
  {
    contextMenuWrapper = element._contextMenu;
    contextMenuElement = element._contextMenu.children[0];
  }
  else
  {
    contextMenuWrapper = createElement('.contextMenu.wrapper');
    contextMenuElement = createElement('.contextMenu.container');

    contextMenuWrapper.appendChild(contextMenuElement);

    contextMenuWrapper.hidden = true;
  }

  // add the menu items to the context menu
  for (const title in menuItems)
  {
    const itemElement = createElement('.contextMenu.item');

    itemElement.innerText = title;
    itemElement.onclick = (event) =>
    {
      // stop propagation to the parent element event
      event.stopPropagation();

      // call the item's function
      menuItems[title].call(contextMenuElement);

      // remove the menu
      if (!contextMenuWrapper.hidden)
      {
        document.body.removeChild(contextMenuWrapper);

        element.classList.remove('contextHover');

        if (parentElement)
          parentElement.classList.remove('contextHover');

        contextMenuWrapper.hidden = true;
      }
    };

    contextMenuElement.appendChild(itemElement);
  }

  // shows the context menu when the user right-clicks
  // on a pre-selected element
  element.oncontextmenu = (event) =>
  {
    // stop propagation to the window event
    event.stopPropagation();

    // if there's any other opened context menu then remove it
    if (global.openedMenu && !global.openedMenu.contextMenuWrapper.hidden)
    {
      document.body.removeChild(global.openedMenu.contextMenuWrapper);

      global.openedMenu.element.classList.remove('contextHover');

      if (global.openedMenu.parentElement)
        global.openedMenu.parentElement.classList.remove('contextHover');

      global.openedMenu.contextMenuWrapper.hidden = true;
    }

    // set this menu as the current opened menu
    global.openedMenu = { contextMenuWrapper, element, parentElement };
    
    // wait for an animation frame to get the correct size of the menu
    requestAnimationFrame(() =>
    {
      // make sure the entire menu is visible inside the app
      const size = contextMenuWrapper.getBoundingClientRect();

      // if the menu won't fit then subtract the menu from the position
      if (event.pageX + size.width > window.innerWidth)
        contextMenuWrapper.style.left = (event.pageX - size.width) + 'px';
      // if it can fit then set the position as is
      else
        contextMenuWrapper.style.left = event.pageX + 'px';

      // if the menu won't fit then subtract the menu from the position
      if (event.pageY + size.height > window.innerHeight)
        contextMenuWrapper.style.top = (event.pageY - size.height) + 'px';
      // if it can fit then set the position as is
      else
        contextMenuWrapper.style.top = event.pageY + 'px';

      // append the menu
      if (contextMenuWrapper.hidden)
      {
        document.body.appendChild(contextMenuWrapper);

        element.classList.add('contextHover');

        if (parentElement)
          parentElement.classList.add('contextHover');
        
        contextMenuWrapper.hidden = false;
      }
    });
  };

  // gets called when the user right-clicks
  // on empty space
  window.addEventListener('contextmenu', () =>
  {
    // remove the menu
    if (!contextMenuWrapper.hidden)
    {
      document.body.removeChild(contextMenuWrapper);

      element.classList.remove('contextHover');

      if (parentElement)
        parentElement.classList.remove('contextHover');

      contextMenuWrapper.hidden = true;
    }
  });

  // gets called when the user left-clicks
  // on empty space
  window.addEventListener('click', () =>
  {
    // remove the menu
    if (!contextMenuWrapper.hidden)
    {
      document.body.removeChild(contextMenuWrapper);

      element.classList.remove('contextHover');

      if (parentElement)
        parentElement.classList.remove('contextHover');

      contextMenuWrapper.hidden = true;
    }
  });

  function waitThenHide()
  {
    setTimeout(() =>
    {
      if (!contextMenuWrapper.hidden &&
        !contextMenuWrapper.inside &&
        !contextMenuWrapper.insideParent
      )
      {
        document.body.removeChild(contextMenuWrapper);

        element.classList.remove('contextHover');

        if (parentElement)
          parentElement.classList.remove('contextHover');

        contextMenuWrapper.hidden = true;
      }
    }, 100);
  }

  // auto remove the menu when the mouse leaves the parent (or the parent gets blurred)
  if (parentElement)
  {
    contextMenuWrapper.onmouseenter = () =>
    {
      contextMenuWrapper.inside = true;
    };

    contextMenuWrapper.onmouseleave = () =>
    {
      contextMenuWrapper.inside = false;

      waitThenHide();
    };

    parentElement.addEventListener('mouseenter', () =>
    {
      contextMenuWrapper.insideParent = true;
    });

    parentElement.addEventListener('mouseleave', () =>
    {
      contextMenuWrapper.insideParent = false;

      waitThenHide();
    });
  }
}

/** @param { HTMLElement } parent
*/
export function removeAllChildren(parent, fromIndex)
{
  if (fromIndex !== undefined)
  {
    const children = [ ...parent.children ];

    children.slice(fromIndex);

    for (let i = fromIndex; i < children.length; i++)
    {
      const child = children[i];
  
      parent.removeChild(child);
    }
  }
  else
  {
    while (parent.lastChild)
    {
      parent.removeChild(parent.lastChild);
    }
  }

}

export function hideActiveOverlay()
{
  /** @type { { overlayElement: HTMLElement, visibility: string, albumPlaceholders: HTMLElement[], trackPlaceholders: HTMLElement[] } }
  */
  const activeOverlayObject = window.activeOverlay;

  // if no overlay is currently active then return
  if (!activeOverlayObject)
    return;

  // hide the overlay from the user
  activeOverlayObject.overlayElement.classList.remove('active');

  setTimeout(() =>
  {
    const albumPlaceholders = activeOverlayObject.albumPlaceholders;
    
    if (albumPlaceholders)
    {
      const overlayAlbumsContainer = activeOverlayObject.overlayElement.querySelector('.albums.container');

      for (let i = 0; i < albumPlaceholders.length; i++)
      {
        albumPlaceholders[i].parentElement.replaceChild(overlayAlbumsContainer.firstChild, albumPlaceholders[i]);
      }
    }

    const trackPlaceholders = activeOverlayObject.trackPlaceholders;

    if (trackPlaceholders)
    {
      const overlayTracksContainer = activeOverlayObject.overlayElement.querySelector('.tracks.container');

      for (let i = 0; i < trackPlaceholders.length; i++)
      {
        trackPlaceholders[i].parentElement.replaceChild(overlayTracksContainer.firstChild, trackPlaceholders[i]);
      }
    }
  }, 100);
  
  // wait the transaction time (0.35s)
  // then return the rented element to their original places
  setTimeout(() =>
  {
    // remove the overlay from body
    document.body.removeChild(activeOverlayObject.overlayElement);

    // set the active overlay as null
    window.activeOverlay = undefined;
  }, 350);
}

/**@param { number } seconds
*/
export function secondsToDuration(seconds)
{
  const minutes = Math.floor(seconds / 60);

  seconds = Math.floor(seconds - minutes * 60).toString();

  if (seconds.length > 2)
    seconds.substring(0, 2);
  else if (seconds.length === 1)
    seconds = `0${seconds}`;

  return `${minutes}:${seconds}`;
}

/**@param { number } seconds
*/
export function secondsToHms(seconds)
{
  seconds = Number(seconds);

  const hs = Math.floor(seconds / 3600);
  const ms = Math.floor(seconds % 3600 / 60);
  const ss = Math.floor(seconds % 3600 % 60);

  const hoursString = hs > 0 ? hs + (hs == 1 ? ' hour' : ' hours') : '';
  const minutesString = ms > 0 ? ms + (ms == 1 ? ' minute' : ' minutes') : '';
  const secondsString = ss > 0 ? ss + (ss == 1 ? ' second' : ' seconds') : '';

  if (hoursString)
    return hoursString;
  else if (minutesString)
    return minutesString;
  else
    return secondsString;
}

/**@param { number } milliseconds
*/
export function millisecondsToTimeAgo(milliseconds)
{
  return timeAgo.format(milliseconds);
}

// initialize the app
init();