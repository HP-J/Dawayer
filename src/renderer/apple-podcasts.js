// MIT License

// Copyright (c) 2018 sungmin kim

// Permission is hereby granted, free of charge, to any person obtaining a copy
// of this software and associated documentation files (the "Software"), to deal
// in the Software without restriction, including without limitation the rights
// to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
// copies of the Software, and to permit persons to whom the Software is
// furnished to do so, subject to the following conditions:

// The above copyright notice and this permission notice shall be included in all
// copies or substantial portions of the Software.

// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
// IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
// FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
// AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
// LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
// OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
// SOFTWARE.

import axios from 'axios';

// apple will probably shutdown iTunes soon,
// however they will most likely keep this url working as a redirect
// we'll see
const instance = axios.create({
  baseURL: 'https://itunes.apple.com'
});

class SearchQuery
{
  constructor({ ...query })
  {
    if (query.limit && !isNaN(query.limit))
    {
      if (query.limit < 1)
        query.limit = 1;
      else if (query.limit > 200)
        query.limit = 200;
    }

    if (query.lang)
    {
      if ([ 'en_us', 'ja_jp' ].indexOf(query.lang) === -1)
        query.lang = 'en_us';
    }

    query.country = query.country || 'US';

    this.term = query.term;
    this.country = query.country;
    this.media = 'podcast';
    this.entry = query.entry;

    // this.attribute = query.attribute

    this.limit = query.limit;
    this.lang = query.lang;
  }
}

/** search for a podcast on apple podcasts using a term
* @param { string | { term: string, country: string, entry: string, lang: string, limit: number } } options
*/
export function searchPodcasts(options)
{
  options = options || {};

  if (typeof options === 'string')
  {
    options = {
      term: options
    };
  }

  const query = new SearchQuery(options);

  return instance.get('/search', { params: query }).then((response) =>
  {
    return Promise.resolve(response.data);
  });
}

/** using the collection id provided by search or elsewhere get the feed url for that specific podcast
* @returns { string } the feed url of the podcast owned by that collection id
* @param { number } collectionId
*/
export function getPodcastFeedUrl(collectionId)
{
  return instance.get('/lookup', { params: { id: collectionId } })
    .then((response) =>
    {
      const data = response.data;

      if (data.resultCount < 1)
        return Promise.reject('invalid itunes id');

      const podcast = data.results[0];

      return Promise.resolve(podcast);
    })
    .then((podcast) =>
    {
      const feedUrl = podcast.feedUrl;

      if (typeof feedUrl !== 'string')
        return Promise.reject('invalid itunes id');

      return feedUrl;
    });
}