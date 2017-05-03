import { getConfigs } from '../config';
import getStorage from '../storage';
import getComparer from '../compare';
import Stats from '../stats';
import async from 'async';

export const command = 'compare <storage..>';
export const desc = 'Compare files between storage bindings and/or environments';
export const builder = {
  storage: {
    describe: 'Provide one or more storage bindings you wish to compare',
    type: 'array'
  }
};

export const handler = argv => {
  const stats = new Stats();

  const compareTasks = [];
  getConfigs(argv, (err, configs) => {
    if (err) return void console.error(err);

    let configStorages = {};
    // compare every config+storage combo against one another
    configs.forEach(config => {
      argv.storage.forEach(storage => {
        const configStorageId = `${config.id}.${storage}`;
        if (!configStorages[configStorageId]) {
          configStorages[configStorageId] = {
            id: configStorageId,
            config: config,
            storage: getStorage(config, storage)
          };
        }
      });
    });

    // turn hash into array
    configStorages = Object.keys(configStorages).map(id => configStorages[id]);

    configStorages.forEach(src => {
      if (argv.oneWay === true && src.storage.id !== argv.storage[0]) return; // do not create tasks for more than one source storage

      configStorages.forEach(dst => {
        if (src.id === dst.id) return; // do not create a task to compare itself, ignore

        compareTasks.push(getCompareTask(argv.mode, src, dst, stats));
      });
    });

    if (compareTasks.length === 0) return void console.error('No comparison tasks detected, see help');

    const statsTimer = setInterval(() => console.log(stats.toString() + '\nComparing...'), 500);
    statsTimer.unref();

    // process all comparisons
    async.series(compareTasks, (err, results) => {
      clearInterval(statsTimer);
      console.log(stats.toString());

      if (err) {
        console.error('File comparison has failed, aborting...', err);
      } else {
        console.log('Comparison complete');
      }
    });
    
  });
};

function getCompareTask(mode, src, dst, stats) {
  const statInfo = stats.getStats(src.config, src.storage, dst.config, dst.storage);
  return cb => {
    statInfo.running();
    compare(mode, src.config, src.storage, dst.config, dst.storage, statInfo, (err) => {
      statInfo.complete();
      cb(err);
    });
  };
}

function compare(mode, srcConfig, srcStorage, dstConfig, dstStorage, statInfo, cb) {
  const compareFiles = (err, files, dirs, lastKey) => {
    if (err) return void cb(err);

    const compareFileTasks = files.map(f => {
      return getCompareFileTask(f, mode, srcConfig, srcStorage, dstConfig, dstStorage, statInfo);
    });

    async.parallelLimit(compareFileTasks, 20, (err) => {
      if (err) return void cb(err);

      if (!lastKey) { // we're done, no more files to compare
        return void cb();
      }

      srcStorage.list('', { deepQuery: true, maxKeys: 5000, lastKey }, compareFiles);
    });
  };

  srcStorage.list('', { deepQuery: true, maxKeys: 5000 }, compareFiles);
}

function getCompareFileTask(file, mode, srcConfig, srcStorage, dstConfig, dstStorage, statInfo) {
  return cb => {
    getComparer(file.Key, file, srcStorage, dstStorage, mode, (err, isMatch, srcHeaders, dstHeaders) => {
      if (err || isMatch === false) {
        // errors are implied to be "not found", just track as difference
        statInfo.diff(file.Size);
      } else {
        // is match
        statInfo.match(file.Size);
      }

      cb();
    });
  };
}