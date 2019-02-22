/** @typedef { Object } ScrollOptions
* @property { number } delay ms
* @property { number } duration ms
* @property { 'horizontal' | 'vertical' } direction
* @property { () => void } callback
*/

/** @param { HTMLElement } element
* @param { ScrollOptions } options
*/
export default function(element, options)
{
  options = options || {};

  options.delay = options.delay || 0;
  options.direction = options.direction || 'horizontal';

  if (options.duration === undefined)
    options.duration = 250;

  if (options.delay)
  {
    setTimeout(() =>
    {
      scrollTo(element, options);
    }, options.delay);
  }
  else
  {
    scrollTo(element, options);
  }
}

/** @param { number } a
* @param { number } b
* @param { number } amount
*/
function lerp(a, b, amount)
{
  amount = Math.max(Math.min(amount, 1), 0);

  return a + (b - a) * amount;
}

/** @param { HTMLElement } element
* @param { ScrollOptions } options
*/
function scrollTo(element, options)
{
  const parent = element.parentElement;

  if (parent.lastScroll && element.isEqualNode(parent.lastScroll.element))
    return;

  if (parent._cancelScroll)
  {
    cancelAnimationFrame(parent._cancelScroll);

    parent._cancelScroll = undefined;
  }

  // show all children that were blurred
  for (let i = 0; i < parent.children.length; i++)
  {
    parent.children[i].style.display = '';
  }

  // if their was a scroll before this one restore
  // the old scroll before going on a new one
  // because hiding the children resets the element scroll
  if (parent.lastScroll && parent.lastScroll.direction === options.direction)
  {
    if (options.direction === 'horizontal')
      parent.scrollLeft = parent.lastScroll.x;
    else
      parent.scrollTop = parent.lastScroll.y;
  }

  // calculate the end position
  
  const index = Array.prototype.indexOf.call(parent.children, element);
  
  let scrollLocation;
  let scrollDifference;
  
  let scrollStartPosition;
  let scrollEndPosition;
  
  if (options.direction === 'horizontal')
  {
    scrollLocation = Math.round(element.getBoundingClientRect().width) * index;
    
    scrollStartPosition = parent.scrollLeft;
  
    // the location of the element - the current scroll position
    scrollDifference = scrollLocation - scrollStartPosition;
  
    scrollEndPosition = parent.scrollLeft + scrollDifference;
  }
  else
  {
    scrollLocation = Math.round(element.getBoundingClientRect().height) * index;

    scrollStartPosition = parent.scrollTop;

    // the location of the element - the current scroll position
    scrollDifference = scrollLocation - scrollStartPosition;
  
    scrollEndPosition = parent.scrollTop + scrollDifference;
  }

  // store some information for the next scroll

  if (!parent.lastScroll)
    parent.lastScroll = {};

  parent.lastScroll.direction = options.direction;
  parent.lastScroll.element = element;

  if (options.direction === 'horizontal')
    parent.lastScroll.x = scrollEndPosition;
  else
    parent.lastScroll.y = scrollEndPosition;
  
  let elapsedTime = 0;
  let last;
  
  // start animation
  requestAnimationFrame(scroll);
  
  function scroll()
  {
    if (!last)
      last = Date.now();

    const now = Date.now();

    const delta = now - last;

    last = now;
    elapsedTime += delta;

    const lerpConst = lerp(scrollStartPosition, scrollEndPosition, elapsedTime / options.duration);

    if (options.direction === 'horizontal')
      parent.scrollLeft = lerpConst;
    else
      parent.scrollTop = lerpConst;

    if (scrollEndPosition === lerpConst)
    {
      parent._cancelScroll = undefined;
  
      done(element, options);
    }
    else
    {
      parent._cancelScroll = requestAnimationFrame(scroll);
    }
  }
}

/** @param { HTMLElement } element
* @param { ScrollOptions } options
*/
function done(element, options)
{
  const parent = element.parentElement;

  // hide blurred children to save performance
  for (let i = 0; i < parent.children.length; i++)
  {
    if (!parent.children[i].isEqualNode(element))
      parent.children[i].style.display = 'none';
  }

  // execute the callback
  if (options.callback)
    options.callback.call();
}