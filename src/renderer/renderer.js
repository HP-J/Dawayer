// import { remote } from 'electron';

import textFit from 'textfit';
import tippy from 'tippy.js';

let resizeEndTimeout;

let rewindTime = 10;
let forwardTime = 30;

const rewindButton = document.body.querySelector('.rewindButton');
const forwardButton = document.body.querySelector('.forwardButton');

const rewindTimeText = rewindButton.children[1];
const forwardTimeText = forwardButton.children[1];

/** @typedef { import('tippy.js').Instance } TippyInstance
*/

/** @type { TippyInstance }
*/
let rewindTimeTooltip;

/** @type { TippyInstance }
*/
let forwardTimeTooltip;

/** @type { TippyInstance }
*/
let volumeTooltip;

const volumeButton = document.body.querySelector('.volumeButton');

function resizeEnd()
{
  // to force rewindTimeText amd forwardTimeText
  // to share the same new size
  rewindTimeText.innerText = forwardTimeText.innerText = '00';
  
  textFit(
    [
      rewindTimeText,
      forwardTimeText
    ]);

  // set text to the actual timings back
  rewindTimeText.children[0].innerText = rewindTime;
  forwardTimeText.children[0].innerText = forwardTime;

  // remove no-motion class
  document.body.classList.remove('noMotion');
}

function init()
{
  // create and configure tooltips
  tippy.setDefaults({ a11y: false, delay: [ 200, 50 ] });

  rewindTimeTooltip = tippy(rewindButton, { content: `Rewind ${rewindTime}s` }).instances[0];
  forwardTimeTooltip = tippy(forwardButton, { content: `Forward ${forwardTime}s` }).instances[0];

  volumeTooltip = tippy(volumeButton, { interactive: true, content: 'Volume' }).instances[0];

  // events
  window.onload = onload;
  window.onresize = onresize;
}

/** @param { number } rewind
* @param { number } forward
*/
function changeRewindForwardTimings(rewind, forward)
{
  rewindTime = rewind;
  forwardTime = forward;

  // the icon text
  rewindTimeText.children[0].innerText = rewindTime;
  forwardTimeText.children[0].innerText = forwardTime;

  // the tooltips text
  rewindTimeTooltip.setContent(`Rewind ${rewindTime}s`);
  forwardTimeTooltip.setContent(`Forward ${forwardTime}s`);
}

function onload()
{
  resizeEnd();
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