// Originally written by (Zouhir Chahoud)[https://zouhir.org/] under MIT License

import jimp from 'jimp';
import Vibrant from 'node-vibrant';
import { sortBy } from 'lodash';

/** returns a Base64 image string with required formatting
* to work on the web (<img src=".." /> or in CSS url('..'))
* @param { { format: string, data: Buffer } } picture
*/
export function toBase64(picture)
{
  return `data:${picture.format};base64,${picture.data.toString('base64')}`;
}

/** takes a color swatch object, converts it to an array & returns
* only hex color
* @param swatch
* @returns { { palette: [] } }
*/
function toPalette(swatch)
{
  // get an array with relevant information
  // out of swatch object
  let palette = Object.keys(swatch).reduce((result, key) =>
  {
    if (swatch[key] !== null)
    {
      result.push({
        popularity: swatch[key].getPopulation(),
        hex: swatch[key].getHex()
      });
    }

    return result;
  }, []);

  // sort by least to most popular color
  // sortBy docs: https://lodash.com/docs/4.17.4#sortBy
  palette = sortBy(palette, [ 'popularity' ]);

  // we done with the popularity attribute
  // remove it with map & reverse the order
  // so it becomes from most to least popular
  palette = palette.map(color => color.hex).reverse();

  return palette;
}

/** @param { { format: string, data: Buffer } } picture
*/
export function base64(picture)
{
  return new Promise((resolve, reject) =>
  {
    return jimp
      .read(picture.data)
      .then(image => image.resize(24, jimp.AUTO))
      .then(image => image.blur(2))
      .then(image =>
        image.getBuffer(picture.format, (err, data) =>
        {
          if (err)
            return reject(err);

          if (data)
          {
            picture.data = data;

            // valid image Base64 string, ready to go as src or CSS background
            return resolve(toBase64(picture));
          }

          return reject(new Error('Unhandled promise rejection in base64 promise'));
        })
      )
      .catch(err => reject(err));
  });
}

/** @param { { format: string, data: Buffer } } picture
*/
export function palette(picture)
{
  return new Promise((resolve, reject) =>
  {
    // vibrant library was about 10-15% slower than
    // get-image-colors npm module but provided better
    // and more needed information
    const vibrant = new Vibrant(picture.data);

    vibrant
      .getPalette()
      .then(palette =>
      {
        if (palette)
          return resolve(toPalette(palette));
        
        return reject(new Error('Unhandled promise rejection in colorPalette', palette));
      })
      .catch(err => reject(err));
  });
}