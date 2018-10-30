// import { remote } from 'electron';

import textFit from 'textfit';

let resizeEndTimeout;

window.onload = () =>
{
  resizeEnd();
};

window.onresize = () =>
{
  // clear old resize-end timeout event
  if (resizeEndTimeout)
    clearTimeout(resizeEndTimeout);

  // text that need to fit in container
  textFit(document.body.querySelector('.rewindTime'));

  // add no-motion class
  if (!document.body.classList.contains('noMotion'))
    document.body.classList.add('noMotion');

  // set a new resize-end timeout
  resizeEndTimeout = setTimeout(resizeEnd, 25);
};

function resizeEnd()
{
  // remove no-motion class
  document.body.classList.remove('noMotion');
}