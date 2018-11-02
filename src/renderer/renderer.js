// import { remote } from 'electron';

import tippy from 'tippy.js';

/** @typedef { import('tippy.js').Instance } TippyInstance
*/

let resizeEndTimeout;

let rewindTime = 10;
let forwardTime = 30;

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

/** @type { TippyInstance }
*/
let localTooltip;

/** @type { TippyInstance }
*/
let volumeTooltip;

function resizeEnd()
{
  // remove no-motion class
  document.body.classList.remove('noMotion');
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

  localTooltip = tippy(localButton, {
    content: 'Albums',
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

  volumeTooltip = tippy(volumeButton, {
    content: 'Volume',
    interactive: true,
    delay: interactiveDelay
  }).instances[0];
}

function initEvents()
{
  // menu events
  playingButton.onclick = changePage;
  localButton.onclick = changePage;
  optionsButton.onclick = changePage;

  // window events
  window.onload = onload;
  window.onresize = onresize;
}

/** @param { MouseEvent } event
*/
function changePage(event)
{
  document.querySelector('.menuItem.selected').classList.remove('selected');

  event.srcElement.classList.add('selected');
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
  if (!document.body.classList.contains('noMotion'))
    document.body.classList.add('noMotion');

  // set a new resize-end timeout
  resizeEndTimeout = setTimeout(resizeEnd, 25);
}

init();