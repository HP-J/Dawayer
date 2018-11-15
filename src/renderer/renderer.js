// import { remote } from 'electron';

import tippy from 'tippy.js';

import scroll from './scroll.js';

/** @typedef { import('tippy.js').Instance } TippyInstance
*/

let isMenuCollapsed = false;

let resizeEndTimeout;

let rewindTime = 10;
let forwardTime = 30;

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
const seekBar = controlBar.querySelector('.seekBar.container');

/**  @type { HTMLDivElement }
*/
const rewindButton = controlBar.querySelector('.rewindButton');

/**  @type { HTMLDivElement }
*/
const forwardButton = controlBar.querySelector('.forwardButton');

/**  @type { HTMLDivElement }
*/
const volumeButton = controlBar.querySelector('.volumeButton');

/**  @type { HTMLDivElement }
*/
const volumeBar = document.body.querySelector('.volumeBar.container');

/**  @type { HTMLDivElement }
*/
const playingButton = menu.querySelector('.menuItem.playing');

/**  @type { HTMLDivElement }
*/
const localButton = menu.querySelector('.menuItem.local');

/**  @type { HTMLDivElement }
*/
const localIconsContainer = localButton.children[0];

/**  @type { HTMLDivElement }
*/
const optionsButton = menu.querySelector('.menuItem.options');

/**  @type { HTMLDivElement }
*/
const rewindTimeText = rewindButton.children[1];

/**  @type { HTMLDivElement }
*/
const forwardTimeText = forwardButton.children[1];

/**  @type { TippyInstance }
*/
let playingSubMenuTooltip;

/**  @type { TippyInstance }
*/
let localSubMenuTooltip;

/**  @type { TippyInstance }
*/
let optionsSubMenuTooltip;

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

    // the index of the button is the same the the page
    selectedPage = pagesContainer.children.item(pageIndex);
    
    // scroll to page
    scroll(selectedPage, { callback: callback });

    // callback
    onPageChange(pageIndex);

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

/** @param { HTMLDivElement } element
*/
function initBar(element)
{

}

/** @param { HTMLDivElement } element
* @param { number } current
* @param { number } max
*/
function changeBarPercentage(element, current, max)
{

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
  const normalDelay = [ 350, 25 ];
  const interactiveDelay = [ 150, 25 ];

  tippy.setDefaults({ a11y: false, delay: normalDelay });

  playingSubMenuTooltip = tippy(playingButton, {
    content: document.body.querySelector('.submenu.container.playing'),
    interactive: true,
    placement: 'bottom',
    arrow: true,
    delay: interactiveDelay
  }).instances[0];

  localSubMenuTooltip = tippy(localButton, {
    content: document.body.querySelector('.submenu.container.local'),
    placement: 'bottom',
    interactive: true,
    arrow: true,
    delay: interactiveDelay
  }).instances[0];

  optionsSubMenuTooltip = tippy(optionsButton, {
    content: document.body.querySelector('.submenu.container.options'),
    interactive: true,
    placement: 'bottom',
    arrow: true,
    delay: interactiveDelay
  }).instances[0];

  rewindTimeTooltip = tippy(rewindButton).instances[0];
  forwardTimeTooltip = tippy(forwardButton).instances[0];

  tippy(volumeButton, {
    content: volumeBar,
    interactive: true,
    delay: interactiveDelay
  });
}

function init()
{
  initEvents();

  initTippy();
}

function initPages()
{
  selectedPage = pagesContainer.children.item(1);
  selectedLocalIcon = localIconsContainer.children.item(0);
  selectedLocalSubPage = localSubPagesContainer.children.item(0);

  scroll(selectedPage, { duration: 0 });
}

/** @param { number } offset
*/
function stickyMenu(offset)
{
  const height = menu.getBoundingClientRect().height;
  const maxOffset = (height * 0.7);

  if (offset === undefined)
    offset = maxOffset;
  else
    offset = Math.min(maxOffset, offset);

  menu.style.top =  pagesContainer.style.top = `-${offset}px`;

  pagesContainer.style.height = `calc(100% + ${offset}px)`;
}

/** @param { number } pageIndex
*/
function collapseMenu(pageIndex)
{
  const collapsedMenuIndices = [ 0 ];

  if (collapsedMenuIndices.includes(pageIndex))
  {
    isMenuCollapsed = true;

    menu.onmouseenter =
    playingSubMenuTooltip.popper.onmouseenter =
    localSubMenuTooltip.popper.onmouseenter =
    optionsSubMenuTooltip.popper.onmouseenter =
    () => stickyMenu(0);

    menu.onmouseleave =
    playingSubMenuTooltip.popper.onmouseleave =
    localSubMenuTooltip.popper.onmouseleave =
    optionsSubMenuTooltip.popper.onmouseleave =
    () => stickyMenu();
  }
  else
  {
    isMenuCollapsed = false;

    menu.onmouseenter =
    playingSubMenuTooltip.popper.onmouseenter =
    localSubMenuTooltip.popper.onmouseenter =
    optionsSubMenuTooltip.popper.onmouseenter =
    menu.onmouseleave =
    playingSubMenuTooltip.popper.onmouseleave =
    localSubMenuTooltip.popper.onmouseleave =
    optionsSubMenuTooltip.popper.onmouseleave =
    undefined;
  }
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

function onload()
{
  initPages();
  resizeEnd();
  
  // stickyMenu();
  
  // set values
  changeRewindForwardTimings(rewindTime, forwardTime);
}

function onresize()
{
  // clear old resize-end timeout event
  if (resizeEndTimeout)
    clearTimeout(resizeEndTimeout);

  // stick the menu
  // stickyMenu();

  // reset scroll
  resetPagesScroll();

  // add no-motion class
  if (!document.body.classList.contains('fastforward'))
    document.body.classList.add('fastforward');

  // set a new resize-end timeout
  resizeEndTimeout = setTimeout(resizeEnd, 25);
}

/** @param { number } pageIndex
*/
function onPageChange(pageIndex)
{
  collapseMenu(pageIndex);
}

init();