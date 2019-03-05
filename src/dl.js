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

const request = require('request');
const fs = require('fs');
const path = require('path');
const os = require('os');

const defaultOption =
{
  dir: os.tmpdir(),
  filename: null,
  onDone: empty,
  onError: empty,
  onProgress: null
};

function empty()
{
  //
}

function download(url, filepath, onError, onDone, onProgress)
{
  const out = fs.createWriteStream(filepath);
  const req = request.get(url);

  let isAbort = false;

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
        onError({
          msg: 'The download was incomplete.',
          errcode: 'err_dlincomplete'
        });
      }
      else
      {
        if (onProgress)
          onProgress(totalSize, totalSize);
                    
        onDone({
          path: filepath,
          url: url,
          size: totalSize
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
      if (onProgress)
        onProgress(curSize, totalSize);
    });
  })
    .on('error', (err) =>
    {
      onError(err);
    })
    .pipe(out);

  return {
    request: req,
    abort: () =>
    {
      isAbort = true;

      this.request.abort();
    }
  };
}

module.exports = function(url, option = {})
{
  if (!option.filename)
    option.filename = path.basename(url) || ('tmp-' + Date.now());

  const filepath = path.join(option.dir || defaultOption.dir, option.filename);

  const onError = option.onError || defaultOption.onError;
  const onDone = option.onDone || defaultOption.onDone;
  const onProgress = option.onProgress || defaultOption.onProgress;

  return download(url, filepath, onError, onDone, onProgress);
};
