const { MicraStore } = require('./micra-store');
const stableStringify = require('json-stable-stringify');
const crypto = require('crypto');
const mung = require('express-mung');

class MicraCache {
  constructor({prefix = '', expire = 1000 * 60 * 60 * 24, maxExpire = 1000 * 60 * 60 * 24 * 30}) {
    this._micraStore = new MicraStore();
    this.prefix = prefix;
    this.expire = expire;
  }

  get r() {
    return this._micraStore.r;
  }

  store({key, data, expire, time}) {
    if (data === undefined || data === null) { return null; }
    time = (time === undefined || time === null) ? (new Date()).getTime() : Number(time);
    const maxExpire = time + this.maxExpire;
    const cacheObject = {
      data: data,
      expire: time + this.expire,
      time: time,
    };

    if (expire !== undefined && expire !== null) { cacheObject.expire = Number(expire); }
    if (cacheObject.expire > maxExpire) {
      cacheObject.expire = maxExpire;
    }

    if (cacheObject.expire > cacheObject.time) {
      const expireAtSeconds = Math.ceil(cacheObject.expire / 1000);
      const cacheKey = this.prefix + key;
      this.r
        .multi()
        .del(cacheKey)
        .hmset(cacheKey, cacheObject)
        .expireat(cacheKey, expireAtSeconds)
        .exec();
    }
    return cacheObject;
  }

  async retrieveTime(key) {
    const cacheKey = this.prefix + key;
    const cacheValue = await this.r.hgetAsync(cacheKey, 'time');
    return (cacheValue === null) ? null : Number(cacheValue);
  }

  async retrieveData(key) {
    const cacheKey = this.prefix + key;
    const cacheValue = await this.r.hgetAsync(cacheKey, 'data');
    return cacheValue;
  }

  async retrieveValid({key, time, now, small = false}) {
    if (now === null || now === undefined) { now = (new Date()).getTime(); }
    now = Number(now);
    time = Number(time);
    if (time > now) { return null; }
    if (time && !small) {
      const cachedTime = await this.retrieveTime(key);
      if (!cachedTime || time > cachedTime) { return null; }  
    }
    const cached = await this.retrieve(key);
    if (!cached || time > cached.time || now > cached.expire) { return null; }
    return cached;
  }

  async retrieve(key) {
    const cacheKey = this.prefix + key;
    const cacheObject = await this.r.hgetallAsync(cacheKey);
    if (!cacheObject) { return null; }
    cacheObject.expire = Number(cacheObject.expire);
    cacheObject.time = Number(cacheObject.time);
    return cacheObject;
  }
}

class MicraCacheHasher {
  constructor({includePaths = null, excludePaths = [], extractMap = {}, key = ''}) {
    this.includePaths = includePaths;
    this.excludePaths = excludePaths;
    this.extractMap = extractMap;
    this.key = key
  }

  extractPath(target, pathComponents) {
    if (target === undefined || target === null) {
      return null;
    }
    if (!pathComponents.length) {
      return target;
    }
    return this.extractPath(target[pathComponents[0]], pathComponents.slice(1));
  }

  deletePath(target, pathComponents) {
    if (target === undefined || target === null || !pathComponents.length) {
      return;
    }
    if (pathComponents.length === 1) {
      delete target[pathComponents[0]];
    }
    this.deletePath(target[pathComponents[0]], pathComponents.slice(1));
  }

  setPath(target, pathComponents, value) {
    if (target === undefined || target === null || !pathComponents.length) {
      return;
    }
    if (pathComponents.length === 1) {
      target[pathComponents[0]] = value;
    } else if (!Object.keys(target).includes(pathComponents[0])) {
      target[pathComponents[0]] = {};
    }
    this.setPath(target[pathComponents[0]], pathComponents.slice(1), value);
  }

  parsePath(path) {
    return path.split('.');
  }

  hash(target) {
    let hashTarget;
    if (this.includePaths === null) {
      hashTarget = JSON.parse(JSON.stringify(target));
    } else {
      hashTarget = {};
      const paths = this.includePaths.concat(Object.values(this.extractMap));
      paths.forEach(path => {
        const pathComponents = this.parsePath(path);
        this.setPath(hashTarget, pathComponents, JSON.parse(JSON.stringify(this.extractPath(target, pathComponents))));
      });
    }
    const extracted = {};
    Object.keys(this.extractMap).forEach(extract => {
      const pathComponents = this.parsePath(this.extractMap[extract]);
      extracted[extract] = this.extractPath(hashTarget, pathComponents);
      this.deletePath(hashTarget, pathComponents);
    });
    this.excludePaths.forEach(path => this.deletePath(hashTarget, this.parsePath(path)));
    hashTarget = stableStringify(hashTarget);
    const hash = crypto.createHmac('sha256', this.key).update(hashTarget).digest('hex');
    extracted.hash = hash;
    return extracted;
  }
}

function micraCacheMiddleWare({hasher = new MicraCacheHasher({}), cache = new MicraCache({}), timeKey = 'time', expireKey = 'expire'}) {
  return async (req, res, next) => {
    const now = (new Date()).getTime();
    const hash = hasher.hash(req);
    const cached = await cache.retrieveValid({
      key: hash.hash,
      now: now,
      time: hash[timeKey],
    });
    if (cached) {
      res.type('json');
      return res.send(cached.data);
    }
    const store = mung.json((body, req, res) => {
      cache.store({
        key: hash.hash,
        data: JSON.stringify(body),
        expire: hash[expireKey],
        time: now,
      });
    });
    store(req, res, next);
  };
}

module.exports.MicraCache = MicraCache;
module.exports.MicraCacheHasher = MicraCacheHasher;
module.exports.micraCacheMiddleWare = micraCacheMiddleWare;
