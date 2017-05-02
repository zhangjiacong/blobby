export default (fileKey, srcHeaders, srcClient, dstClient, mode, cb) => {
  dstClient.fetchInfo(fileKey, (err, dstHeaders) => {
    if (err) return void cb(err);
    if (!dstHeaders) return void cb(new Error(`File ${fileKey} not found`));

    let isMatch = (
      (srcHeaders.ETag && dstHeaders.ETag) ? // use etag first if avail
      srcHeaders.ETag === dstHeaders.ETag :
      (srcHeaders.LastModified && dstHeaders.LastModified) ? // use last-modified 2nd if avail
      srcHeaders.LastModified.getTime() === dstHeaders.LastModified.getTime()
      : false /* default to false in headers mode if necessary headers are not available */
    );

    if (srcHeaders.Size && dstHeaders.Size && srcHeaders.Size !== dstHeaders.Size) {
      // Size differs, no match
      isMatch = false;
    }

    cb(null, isMatch, srcHeaders, dstHeaders);
  });
}
