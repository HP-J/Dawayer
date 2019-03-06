import tippy from 'tippy.js';

import scroll from './scroll.js';

import { initStorage, secondsToDuration } from './storage.js';
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
const menu = document.body.querySelector('.menu.container');

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
const playingButton = menu.children.item(0);

/**  @type { HTMLDivElement }
*/
const localButton = menu.children.item(1);

/**  @type { HTMLDivElement }
*/
const localIconsContainer = localButton.children[0];

/**  @type { HTMLDivElement }
*/
const optionsButton = menu.children.item(2);

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

// Page Transactions

/** @param { HTMLDivElement } element
* @param { () => void } callback
*/
function changePage(element, callback)
{
  const selected = document.querySelector('.menuItem.selected');

  if (selected !== element)
  {
    selected.classList.remove('selected');
    element.classList.add('selected');

    // get the index of the button
    const pageIndex = Array.prototype.indexOf.call(element.parentElement.children, element);

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
function changeLocalSubPage(index, callback)
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

  document.body.querySelector('.submenuButton.options').onclick = () =>
  {
    changePage(optionsButton);
  };

  // window events

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
  initEvents();
  initTippy();
  
  initPlayback();
  
  initOptions();

  initStorage();

  seekTimeControl(getSeekTime(), true);
  initBar(seekBar, showSeekTime, seekTimeControl);

  volumeControl(getVolume(), true);
  initBar(volumeBar, undefined, volumeControl);

  // they have default classes
  shuffleButton.classList.remove('shuffled');
  repeatButton.classList.remove('looping');

  shuffleButton.classList.add(getShuffleMode());
  repeatButton.classList.add(getRepeatMode());
}

function initPages()
{
  // set the default pages
  // the pages the user first sees when they starts the application

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

function muteVolume()
{
  if (!volumeButton.classList.contains('muted'))
    volumeControl(0);
  else if (lastRememberedVolume === 0 || 0.15 >= lastRememberedVolume)
    volumeControl(0.15);
  else
    volumeControl(lastRememberedVolume);
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
export function seekTimeControl(percentage, visualOnly)
{
  if (setSeekTime(percentage, visualOnly, true))
  {
    updateBarPercentage(seekBar, percentage);
  }
}

/** @param { number } percentage
* @param { boolean } ignoreLock
*/
function volumeControl(percentage, ignoreLock)
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

// Callbacks

function resizeEnd()
{
  // remove no-motion class
  document.body.classList.remove('fastforward');
}

function onload()
{
  initPages();

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
    if (global.openedMenu && !global.openedMenu.hidden)
    {
      document.body.removeChild(global.openedMenu);

      global.openedMenu.hidden = true;
    }

    // set this menu as the current opened menu
    global.openedMenu = contextMenuWrapper;
    
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

    parentElement.addEventListener('mouseenter', () =>
    {
      contextMenuWrapper.insideParent = true;
    });

    contextMenuWrapper.onmouseleave = () =>
    {
      contextMenuWrapper.inside = false;

      waitThenHide();
    };

    parentElement.addEventListener('mouseleave', () =>
    {
      contextMenuWrapper.insideParent = false;

      waitThenHide();
    });
  }
}

// initialize the app
init();