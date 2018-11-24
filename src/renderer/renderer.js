import tippy from 'tippy.js';

import scroll from './scroll.js';
import { initOptions, initOptionsEvents } from './options.js';

/** @typedef { import('tippy.js').Instance } TippyInstance
*/

let resizeEndTimeout;

let menuIsCollapsed = false;

let rewindTime = 10;
let forwardTime = 30;

let seekTime = 0;

let currentVolume = 0.75;
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
const albumsWrapper = document.body.querySelector('.albums.wrapper');

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
const forwardButton = controlBar.querySelector('.forwardButton');

/**  @type { HTMLDivElement }
*/
const rewindTimeText = rewindButton.children[1];

/**  @type { HTMLDivElement }
*/
const forwardTimeText = forwardButton.children[1];

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
let rewindTimeTooltip;

/** @type { TippyInstance }
*/
let forwardTimeTooltip;

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
*/
function changeLocalSubPage(index)
{
  if ((index + 1) >= localIconsContainer.children.length)
    index = 0;
  else
    index = index + 1;
  
  selectedLocalIcon = localIconsContainer.children.item(index);
  selectedLocalSubPage = localSubPagesContainer.children.item(index);

  // smooth scroll to the sub-page and its icon
  scroll(selectedLocalIcon, { direction: 'vertical' });
  scroll(selectedLocalSubPage, { direction: 'vertical' });
}

/** @param { number } rewind
* @param { number } forward
*/
function changeRewindForwardTimings(rewind, forward)
{
  rewindTime = rewind;
  forwardTime = forward;

  // the icon text
  rewindTimeText.innerText = rewindTime;
  forwardTimeText.innerText = forwardTime;

  // the tooltip text
  rewindTimeTooltip.setContent(`Rewind ${rewindTime}s`);
  forwardTimeTooltip.setContent(`Forward ${forwardTime}s`);
}

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

  // menu collapsing events

  menu.onmouseenter = () =>
  {
    expandMenu();
  };

  albumsWrapper.onscroll = (event) =>
  {
    if (event.srcElement.scrollTop >= 20)
      collapseMenu();
    else
      expandMenu();
  };

  // controls events

  playButton.onclick = playPause;
  shuffleButton.onclick = shuffleMode;
  repeatButton.onclick = repeatMode;
  volumeButton.onclick = muteVolume;

  // sub-menu events

  document.body.querySelector('.submenu.playing').onclick = () =>
  {
    changePage(playingButton);
  };

  document.body.querySelector('.submenu.albums').onclick = () =>
  {
    changePage(localButton, () => changeLocalSubPage(-1));
  };

  document.body.querySelector('.submenu.tracks').onclick = () =>
  {
    changePage(localButton, () => changeLocalSubPage(0));
  };

  document.body.querySelector('.submenu.artists').onclick = () =>
  {
    changePage(localButton, () => changeLocalSubPage(1));
  };

  document.body.querySelector('.submenu.options').onclick = () =>
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
    content: document.body.querySelector('.submenu.container.playing'),
    placement: 'bottom',
    interactive: true,
    arrow: true
  }).instances[0];

  tippy(localButton, {
    content: document.body.querySelector('.submenu.container.local'),
    placement: 'bottom',
    interactive: true,
    arrow: true
  }).instances[0];

  tippy(optionsButton, {
    content: document.body.querySelector('.submenu.container.options'),
    placement: 'bottom',
    interactive: true,
    arrow: true
  }).instances[0];

  seekTooltip = tippy(seekBar, {
    content: 0,
    hideOnClick: false,
    placement: 'top',
    followCursor: 'horizontal',
    arrow: true
  }).instances[0];

  rewindTimeTooltip = tippy(rewindButton).instances[0];
  forwardTimeTooltip = tippy(forwardButton).instances[0];

  tippy(volumeButton, {
    content: volumeBar,
    interactive: true
  });
}

/** @param { HTMLDivElement } element
 * @param { (highlightedPercentage: number) => void } mousemove
* @param { (playedPercentage: number) => void } mousedown
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
  initOptions();

  initEvents();
  initOptionsEvents();

  initTippy();
}

function initPages()
{
  selectedPage = pagesContainer.children.item(2);
  selectedLocalIcon = localIconsContainer.children.item(0);
  selectedLocalSubPage = localSubPagesContainer.children.item(0);

  scroll(selectedPage, { duration: 0 });
}

/** scroll coordinates break on resizing the containers and need to be reset every time
*/
function resetPagesScroll()
{
  scroll(selectedLocalIcon, { duration: 0, direction: 'vertical', delay: 200 });
  scroll(selectedLocalSubPage, { duration: 0, direction: 'vertical' });
  scroll(selectedPage, { duration: 0 });
}

function resizeEnd()
{
  // remove no-motion class
  document.body.classList.remove('fastforward');
}

function collapseMenu()
{
  if (!menuIsCollapsed)
  {
    const height = menu.getBoundingClientRect().height;
    const collapsedHeight = height * 0.65;

    menu.style.top = `-${collapsedHeight}px`;
    pagesContainer.style.top = `-${height}px`;
    pagesContainer.style.height = `calc(100% + ${height}px)`;

    setTimeout(() => menuIsCollapsed = true, 125);
  }
}

function expandMenu()
{
  if (menuIsCollapsed)
  {
    menu.style.setProperty('top', '');
    pagesContainer.style.setProperty('top', '');
    pagesContainer.style.setProperty('height', '');

    setTimeout(() => menuIsCollapsed = false, 125);
  }
}

function playPause()
{
  // pause playback
  if (playButton.classList.contains('playing'))
  {
    playButton.classList.remove('playing');
    playButton.classList.add('paused');
  }
  // resume playback
  else
  {
    playButton.classList.remove('paused');
    playButton.classList.add('playing');
  }
}

function shuffleMode()
{
  // turn off shuffling (play songs with their original indices)
  if (shuffleButton.classList.contains('shuffled'))
  {
    shuffleButton.classList.remove('shuffled');
    shuffleButton.classList.add('normal');
  }
  // turn on shuffling (play songs with shuffled indices)
  else
  {
    shuffleButton.classList.remove('normal');
    shuffleButton.classList.add('shuffled');
  }
}

function repeatMode()
{
  // turn on repeating (the same track on loop)
  if (repeatButton.classList.contains('looping'))
  {
    repeatButton.classList.remove('looping');
    repeatButton.classList.add('repeating');
  }
  // turn off repeating (stop playing when the current track ends)
  else if (repeatButton.classList.contains('repeating'))
  {
    repeatButton.classList.remove('repeating');
    repeatButton.classList.add('once');
  }
  // turn on looping (loop the playlist) (goes to play track [0] when the last track ends)
  else
  {
    repeatButton.classList.remove('once');
    repeatButton.classList.add('looping');
  }
}

/** @param { HTMLDivElement } element
* @param { number } playedPercentage
*/
function updateBarPercentage(element, playedPercentage)
{
  const remainingPercentage = 1 - playedPercentage;

  element.querySelector('.played').style.width = `${playedPercentage * 100}%`;
  element.querySelector('.remaining').style.width = `${remainingPercentage * 100}%`;
}

function muteVolume()
{
  if (!volumeButton.classList.contains('muted'))
    volumeControl(0);
  else
    volumeControl(lastRememberedVolume || 1);
}

/** @param { number } highlightedPercentage
*/
function seekShowTime(highlightedPercentage)
{
  seekTooltip.setContent(highlightedPercentage);
}

/** @param { number } playedPercentage
*/
function seekControl(playedPercentage)
{
  playedPercentage = playedPercentage || 0;

  seekTime = playedPercentage;

  updateBarPercentage(seekBar, playedPercentage);
}

/** @param { number } playedPercentage
*/
function volumeControl(playedPercentage)
{
  playedPercentage = playedPercentage || 0;

  if (playedPercentage !== 0)
  {
    if (volumeButton.classList.contains('muted'))
      volumeButton.classList.remove('muted');
  }
  else
  {
    if (!volumeButton.classList.contains('muted'))
      volumeButton.classList.add('muted');
  }

  lastRememberedVolume = currentVolume;
  currentVolume = playedPercentage;
  
  updateBarPercentage(volumeBar, currentVolume);
}

function onload()
{
  initPages();
  
  seekControl(seekTime);
  initBar(seekBar, seekShowTime, seekControl);

  volumeControl(currentVolume);
  initBar(volumeBar, undefined, volumeControl);

  resizeEnd();
  
  // set values
  changeRewindForwardTimings(rewindTime, forwardTime);
}

function onresize()
{
  // clear old resize-end timeout event
  if (resizeEndTimeout)
    clearTimeout(resizeEndTimeout);

  // reset scroll
  resetPagesScroll();

  // add no-motion class
  if (!document.body.classList.contains('fastforward'))
    document.body.classList.add('fastforward');

  // set a new resize-end timeout
  resizeEndTimeout = setTimeout(resizeEnd, 25);
}

init();