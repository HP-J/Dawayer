// Originally written by (Zouhir Chahoud)[https://zouhir.org/] under MIT License

import sharp from 'sharp';
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
* @returns { Promise<string> }
*/
export function base64(picture)
{
  return new Promise((resolve, reject) =>
  {
    sharp(picture.data).resize({ width: 24 }).blur(1.85).toBuffer().then(data =>
    {
      picture.data = data;

      resolve(toBase64(picture))
    }).catch(err => reject(err));
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
