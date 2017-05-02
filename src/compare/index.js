import compareModes from './modes';

export default (fileKey, srcHeaders, srcClient, dstClient, mode, cb) => {
  const comparer = compareModes[mode];
  if (!comparer) {
    return void cb(new Error(`Compare mode ${mode} is not yet supported`));
  }

  comparer(fileKey, srcHeaders, srcClient, dstClient, mode, cb);
}
