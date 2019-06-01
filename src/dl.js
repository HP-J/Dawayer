// The Star And Thank Author License (SATA)

// Copyright (c) 2016, hxsf <hxsf@ihxsf.cn>

// Project Url: https://github.com/hxsf/download-file-with-progressbar

// Permission is hereby granted, free of charge, to any person obtaining a copy
// of this software and associated documentation files (the "Software"), to deal
// in the Software without restriction, including without limitation the rights
// to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
// copies of the Software, and to permit persons to whom the Software is
// furnished to do so, subject to the following conditions:

// The above copyright notice and this permission notice shall be included in
// all copies or substantial portions of the Software.

import { createWriteStream, rename } from 'fs';
import { basename, join } from 'path';
import { tmpdir } from 'os';

import { EventEmitter } from 'events';
import request from 'request';

const busyPaths = {};

const tempDir = tmpdir();

function download(url, filepath, events, option)
{
  if (busyPaths[filepath])
  {
    if (option.onError)
      busyPaths[filepath].on('error', option.onError);

    if (option.onDone)
      busyPaths[filepath].on('done', option.onDone);

    if (option.onProgress)
      busyPaths[filepath].on('progress', option.onProgress);

    return;
  }
    
  // the file will have a temporary path during downloading
  const temppath = filepath + Date.now();

  const out = createWriteStream(temppath);
  const req = request.get(url);

  let isAbort = false;

  busyPaths[filepath] = events;

  req.on('response', (res) =>
  {
    out.on('finish', () =>
    {
      // Check if the download was aborted on purpose
      if (isAbort)
        return;
                
      const isFullDown = totalSize === curSize || totalSize === -1;
                
      // Check if the file was fully downloaded
      if (!isFullDown)
      {
        events.emit('error', 'The download was incomplete.', 'err_dlincomplete');

        delete busyPaths[filepath];
      }
      else
      {
        // rename/move the file to the correct place
        rename(temppath, filepath, (err) =>
        {
          if (err)
          {
            events.emit('error', 'The download was incomplete.', 'err_dlincomplete');

            delete busyPaths[filepath];
          }
          else
          {
            events.emit('progress', totalSize, totalSize);
            events.emit('done', filepath, url, totalSize);

            delete busyPaths[filepath];
          }
        });
      }
    });

    let totalSize = parseInt(res.headers['content-length'], 10); //文件大小的长度

    // Set the totalSize to -1 if the server doesn't report it
    if (isNaN(totalSize))
      totalSize = -1;
        
    // 文件接收大小
    let curSize = 0;

    res.on('data', (chunk) =>
    {
      curSize += chunk.length;
                
      // 判读是否显示进度条
      events.emit('progress', curSize, totalSize);
    });
  })
    .on('error', (err) =>
    {
      events.emit('error', err);
      
      delete busyPaths[filepath];
    })
    .pipe(out);

  return {
    request: req,
    abort: () =>
    {
      isAbort = true;

      req.abort();
    }
  };
}

module.exports = function(url, option = {})
{
  if (!option.filename)
    option.filename = basename(url) || ('tmp-' + Date.now());

  const filepath = join(option.dir || tempDir, option.filename);

  const events = new EventEmitter();

  if (option.onError)
    events.on('error', option.onError);

  if (option.onDone)
    events.on('done', option.onDone);

  if (option.onProgress)
    events.on('progress', option.onProgress);

  return download(url, filepath, events, option);
};
