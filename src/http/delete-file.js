import async from 'async';
import getStorage from '../storage';
import getConfig from '../config/get-config-by-id';

export default opts => {
  const { auth, storage, fileKey, req, res, contentType, urlInfo } = opts;
  const { headers } = req;

  if (!auth) { // auth required for delete's
    res.statusCode = 403;
    return void res.end();
  }

  const getReplicaTask = (replica) => {
    return cb => {
      writeToReplica(replica, fileKey, opts, cb);
    }
  }

  async.auto({
    authorize: cb => {
      auth(err => {
        if (err) {
          err.statusCode = 403; // specific status
          return void cb(err);
        }

        cb(); // OK
      });
    },
    writeMaster: ['authorize', (results, cb) => {
      storage.remove(fileKey, cb);
    }],
    writeReplicas: ['authorize', (results, cb) => { // write in parallel to master
      if (!Array.isArray(storage.config.replicas) || storage.config.replicas.length === 0) return void cb(); // no replicas to write to

      const doNotWaitForReplicaSuccess = urlInfo.query.waitForReplicas === '0';
      if (doNotWaitForReplicaSuccess) cb(); // do not wait, but do NOT return yet either

      const replicaTasks = storage.config.replicas.map(replica => getReplicaTask(replica));

      async.parallelLimit(replicaTasks, 5, err => {
        if (err) {
          if (!doNotWaitForReplicaSuccess) cb(err); // failure only if query param not set
          else console.error('writeReplicas failed:', err.stack || err); // if no error passed on, at least record to stderr
        } else if (!doNotWaitForReplicaSuccess) cb(); // success only if query param not set
      });
    }]
  }, (err, results) => {
    if (err) { // if any writes fail, we fail
      res.statusCode = err.statusCode || 404; // default to not found if none provided
      if (err.statusMessage) res.statusMessage = err.statusMessage;
      console.error(`DELETE ${storage.id}/${fileKey} failed with ${res.statusCode}, err: ${err.stack || err}`);
      return void res.end();
    }

    // todo
    res.statusCode = 204; // no body for successful deletes
    res.end();
  });

}

function writeToReplica(replica, fileKey, opts, cb) {
  const { argv, config } = opts;
  const replicaSplit = replica.split('::');
  const configId = replicaSplit.length > 1 ? replicaSplit[0] : null;
  const storageId = replicaSplit.length > 1 ? replicaSplit[1] : replicaSplit[0];

  async.auto({
    config: cb => {
      if (!configId) return void cb(null, opts.config); // if no explicit config is requested, use current config

      getConfig(configId, argv, cb);
    },
    storage: ['config', (results, cb) => {
      try {
        const storage = getStorage(results.config, storageId);
        cb(null, storage);
      } catch (ex) {
        cb(ex);
      }
    }],
    write: ['storage', (results, cb) => results.storage.remove(fileKey, cb)]
  }, cb);
}
