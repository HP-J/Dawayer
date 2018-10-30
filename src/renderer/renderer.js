// import { remote } from 'electron';

import textFit from 'textfit';

let resizeEndTimeout;

const rewindTimeText = document.body.querySelector('.rewindTime');
const forwardTimeText = document.body.querySelector('.forwardTime');

window.onload = () =>
{
  resizeEnd();
};

window.onresize = () =>
{
  // clear old resize-end timeout event
  if (resizeEndTimeout)
    clearTimeout(resizeEndTimeout);

  // add no-motion class
  if (!document.body.classList.contains('noMotion'))
    document.body.classList.add('noMotion');

  // set a new resize-end timeout
  resizeEndTimeout = setTimeout(resizeEnd, 25);
};

function resizeEnd()
{
  // text that need to fit in container
  const cached = [ rewindTimeText.innerText, forwardTimeText.innerText ];

  rewindTimeText.innerText = forwardTimeText.innerText = '00';
  
  textFit(
    [
      rewindTimeText,
      forwardTimeText
    ]);

  rewindTimeText.children[0].innerText = cached[0];
  forwardTimeText.children[0].innerText = cached[1];

  // remove no-motion class
  document.body.classList.remove('noMotion');
}