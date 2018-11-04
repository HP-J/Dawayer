// import { remote } from 'electron';

import tippy from 'tippy.js';

/** @typedef { import('tippy.js').Instance } TippyInstance
*/

let resizeEndTimeout;

let rewindTime = 10;
let forwardTime = 30;

let localSubPageIndex = 0;

/**  @type { HTMLDivElement }
*/
const rewindButton = document.body.querySelector('.rewindButton');

/**  @type { HTMLDivElement }
*/
const forwardButton = document.body.querySelector('.forwardButton');

/**  @type { HTMLDivElement }
*/
const playingButton = document.body.querySelector('.menuItem.playing');

/**  @type { HTMLDivElement }
*/
const localButton = document.body.querySelector('.menuItem.local');

/**  @type { HTMLDivElement }
*/
const optionsButton = document.body.querySelector('.menuItem.options');

/**  @type { HTMLDivElement }
*/
const volumeButton = document.body.querySelector('.volumeButton');

/**  @type { HTMLDivElement }
*/
const rewindTimeText = rewindButton.children[1];

/**  @type { HTMLDivElement }
*/
const forwardTimeText = forwardButton.children[1];

/** @type { TippyInstance }
*/
let rewindTimeTooltip;

/** @type { TippyInstance }
*/
let forwardTimeTooltip;

function resizeEnd()
{
  // remove no-motion class
  document.body.classList.remove('fastforward');
}

function init()
{
  initTippy();
  initEvents();
}

function initTippy()
{
  // create and configure tooltips
  const normalDelay = [ 350, 50 ];
  const menuItemsDelay = [ 250, 50 ];
  const interactiveDelay = [ 150, 50 ];

  tippy.setDefaults({ a11y: false, delay: normalDelay });

  tippy(playingButton, {
    content: 'Playing Now',
    placement: 'bottom',
    arrow: true,
    delay: menuItemsDelay
  }).instances[0];

  tippy(localButton, {
    content: document.body.querySelector('.submenu.container.local'),
    placement: 'bottom',
    interactive: true,
    arrow: true,
    delay: interactiveDelay
  }).instances[0];

  tippy(optionsButton, {
    content: 'Options',
    placement: 'bottom',
    arrow: true,
    delay: menuItemsDelay
  }).instances[0];

  rewindTimeTooltip = tippy(rewindButton).instances[0];
  forwardTimeTooltip = tippy(forwardButton).instances[0];

  tippy(volumeButton, {
    content: document.body.querySelector('.volumeBar.container'),
    interactive: true,
    delay: interactiveDelay
  }).instances[0];
}

function initEvents()
{
  // menu events
  playingButton.onclick = () => changePage(playingButton);

  localButton.onclick = () =>
  {
    // only switch sub-page when the page is selected
    if (!changePage(localButton))
      localSubPageIndex = changeSubPage(localButton.children[0], localSubPageIndex);
  };

  optionsButton.onclick = () => changePage(optionsButton);

  // window events
  window.onload = onload;
  window.onresize = onresize;
}

/** @param { HTMLDivElement } element
*/
function changePage(element)
{
  const selected = document.querySelector('.menuItem.selected');

  if (selected !== element)
  {
    // const pageIndex = Array.prototype.indexOf.call(element.parentElement.children, element);

    selected.classList.remove('selected');
    element.classList.add('selected');

    return true;
  }
  else
  {
    return false;
  }
}

/** @param { HTMLDivElement } element
* @param { number } index
*/
function changeSubPage(element, index)
{
  if ((index + 1) >= element.children.length)
  {
    index = 0;
  }
  else
  {
    index = index + 1;
  }

  element.parentElement.scrollTop = 50;

  // scroll to icon
  requestAnimationFrame(() =>
  {
    element.children.item(index).scrollIntoView({
      behavior: 'smooth',
      inline: 'nearest',
      block: 'nearest'
    });
  });

  return index;
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

  // the tooltips text
  rewindTimeTooltip.setContent(`Rewind ${rewindTime}s`);
  forwardTimeTooltip.setContent(`Forward ${forwardTime}s`);
}

/** @param { HTMLDivElement } element
* @param { number } current
* @param { number } max
*/
function changeBarPercentage(element, current, max)
{

}

function onload()
{
  resizeEnd();

  // set values
  changeRewindForwardTimings(rewindTime, forwardTime);
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

init();