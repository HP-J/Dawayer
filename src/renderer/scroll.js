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
    options.duration = 50;

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
  if (element.parentElement._cancelScroll)
  {
    clearInterval(element.parentElement._cancelScroll);

    element.parentElement._cancelScroll = undefined;
  }

  const index = Array.prototype.indexOf.call(element.parentElement.children, element);

  let scrollLocation;
  let scrollDifference;

  let scrollStartPosition;
  let scrollEndPosition;

  if (options.direction === 'horizontal')
  {
    scrollLocation = element.scrollWidth * index;
    scrollStartPosition = element.parentElement.scrollLeft;

    // the location of the element - the current scroll position
    scrollDifference = scrollLocation - scrollStartPosition;

    scrollEndPosition = element.parentElement.scrollLeft + scrollDifference;
  }
  else
  {
    scrollLocation = element.scrollHeight * index;
    scrollStartPosition = element.parentElement.scrollTop;

    // the location of the element - the current scroll position
    scrollDifference = scrollLocation - scrollStartPosition;

    scrollEndPosition = element.parentElement.scrollTop + scrollDifference;
  }

  let elapsedTime = 0;

  element.parentElement._cancelScroll = setInterval(scroll, 1);

  scroll();

  function scroll()
  {
    elapsedTime += 1;

    if (elapsedTime >= options.duration)
    {
      clearInterval(element.parentElement._cancelScroll);

      element.parentElement._cancelScroll = undefined;

      if (options.callback)
        options.callback();
    }

    if (options.direction === 'horizontal')
      element.parentElement.scrollLeft = lerp(scrollStartPosition, scrollEndPosition, elapsedTime / options.duration);
    else
      element.parentElement.scrollTop = lerp(scrollStartPosition, scrollEndPosition, elapsedTime / options.duration);
  }
}
