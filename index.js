function noop() {}

/**
 * Expose the Request object
 */

module.exports = Request;

/**
 * Create a hyper-path request
 *
 * @param {String} path
 * @param {Client} client
 */

function Request(path, client, delim) {
  if (!(this instanceof Request)) return new Request(path, client);

  // init client
  this.client = client;
  if (!this.client) throw new Error('hyper-path requires a client to be passed as the second argument');

  this.delim = delim || '.';
  this.parse(path);

  this._listeners = {};
  this._scope = {};
  this._warnings = {};
}

/**
 * Set the root scope
 *
 * @param {Object} scope
 * @return {Request}
 */

Request.prototype.scope = function(scope) {
  this.trace('scope', arguments);
  this._scope = this.wrappedScope ? [scope] : scope;
  if (this._fn) this.get();
  return this;
};

/**
 * Call a function anytime the data changes in the request
 *
 * @param {Function} fn
 * @return {Request}
 */

Request.prototype.on = function(fn) {
  this.trace('on', arguments);
  this._fn = fn;
  this.get();
  return this;
};

/**
 * Refresh the data down the path
 *
 * @return {Request}
 */

Request.prototype.get =
Request.prototype.refresh = function(fn) {
  this.trace('get', arguments);
  var scope = this._scope;
  fn = fn || this._fn;

  // Clear any previous listeners
  this.off();

  return this.isRoot ?
    this.fetchRoot(scope, fn) :
    this.traverse(scope, {}, 0, this.path, {}, true, fn);
};

/**
 * Issue a warning once per request
 *
 * @param {String} str
 */

Request.prototype.warn = function(str) {
  if (this._warnings[str]) return;
  console.warn(str);
  this._warnings[str] = true;
  return this;
};

/**
 * Trace a request
 *
 * @param {String} method
 * @param {Array} args
 */

Request.prototype.trace = function(method, args) {};

/**
 * Parse the string with the following syntax
 *
 *   Start at this.scope['path']
 *
 *     path.to.my.name
 *
 *   Start at the client's root
 *
 *     .path.to.my.name
 *
 * @param {String} str
 * @api private
 */

Request.prototype.parse = function(str) {
  this.trace('parse', arguments);
  var path = this.path = Array.isArray(str) ? str.slice() : str.split(this.delim);
  this.index = path[0];
  if (path.length === 1) {
    this.wrappedScope = true;
    path.unshift(0);
  }
  this.isRoot = this.index === '';
  this.target = path[path.length - 1];
};

/**
 * unsubscribe from any emitters for a request
 *
 * @return {Request}
 */

Request.prototype.off = function() {
  this.trace('trace');

  for (var key in this._listeners) {
    this.replaceListener(key, null, this._fn);
  }

  return this;
};

/**
 * Traverse properties in the api
 *
 * @param {Any} parent
 * @param {Object} links
 * @param {Integer} i
 * @param {Array} path
 * @param {Object} parentDocument
 * @param {Boolean} normalize
 * @param {Function} cb
 * @api private
 */

Request.prototype.traverse = function(parent, links, i, path, parentDocument, normalize, cb) {
  var self = this;
  self.trace('traverse', arguments);

  // we're done searching
  if (i >= path.length) return cb(null, normalize ? self._normalizeTarget(parent) : parent, parentDocument);

  var key = path[i];
  var value = self._get(key, parent, links);

  // we couldn't find the property
  if (!isDefined(value)) return self.handleUndefined(key, parent, links, i, path, parentDocument, normalize, cb);

  var next = i + 1;
  var nextProp = path[next];
  var href = self._get('href', value);

  // we don't have a link to use or it's set locally on the object
  if (!href || value.hasOwnProperty(nextProp)) return self.traverse(value, links, next, path, parentDocument, normalize, cb);

  // fetch the resource
  return self.fetchResource(href, next, path, normalize, cb);
};

/**
 * Handle an undefined value
 *
 * @param {String} key
 * @param {Object|Array} parent
 * @param {Object} links
 * @param {Integer} i
 * @param {Array} path
 * @param {Object} parentDocument
 * @param {Boolean} normalize
 * @param {Function} cb
 */

Request.prototype.handleUndefined = function(key, parent, links, i, path, parentDocument, normalize, cb) {
  this.trace('handleUndefined', arguments);
  // check to make sure it's not on a "normalized" target
  var coll = this._normalizeTarget(parent);
  if (this._get(key, coll)) return this.traverse(coll, links, i, path, parentDocument, normalize, cb);

  // We have a single hop path so we're going to try going up the prototype.
  // This is necessary for frameworks like Angular where they use prototypal
  // inheritance. The risk is getting a value that is on the root Object.
  // We can at least check that we don't return a function though.
  var value = parent[key];
  if (typeof value === 'function') value = void 0;
  return cb(null, value, parentDocument);
};

/**
 * Fetch the root resource through the client
 *
 * @param {Object} scope
 * @param {Function} cb
 */

Request.prototype.fetchRoot = function(scope, cb) {
  var self = this;
  self.trace('fetchRoot', arguments);

  var res = self.client.root(function handleRoot(err, body, links, href) {
    if (err) return cb(err);
    if (!body && !links) return cb(null);
    links = links || {};

    var bodyHref = self._get('href', body);
    href = href || bodyHref;

    if (!href) self.warn('root missing href: local JSON pointers will not function properly');
    else body = self._resolve(bodyHref, body);

    return self.traverse(body || scope, links, 1, self.path, body, true, cb);
  });

  return self.replaceListener('.', res, cb);
};

/**
 * Fetch a resource through the client
 *
 * @param {String} href
 * @param {Integer} i
 * @param {Array} path
 * @param {Boolean} normalize
 * @param {Function} cb
 */

Request.prototype.fetchResource = function(href, i, path, normalize, cb) {
  var self = this;
  self.trace('fetchResource', arguments);
  var orig = href;
  var parts = orig.split('#');
  href = parts[0];

  if (href === '') return cb(new Error('cannot request "' + orig + '" without parent document'));

  var res = self.client.get(href, function handleResource(err, body, links, hrefOverride) {
    if (err) return cb(err);
    if (!body && !links) return cb(null);
    links = links || {};

    // allow clients to override the href (usually because of a redirect)
    href = hrefOverride || href;

    // Be nice to APIs that don't set 'href'
    var bodyHref = self._get('href', body);
    if (!bodyHref) body = self._set('href', href, body);
    var resolved = self._resolve(bodyHref || href, body);

    if (parts.length === 1) return self.traverse(resolved, links, i, path, resolved, normalize, cb);
    return self.fetchJsonPath(resolved, links, parts[1], i, path, normalize, cb);
  });

  return self.replaceListener(orig, res, cb);
};

/**
 * Replace the listener for a key
 *
 * @param {String} key
 * @param {Any} res
 * @param {Function} cb
 * @return {Any}
 */

Request.prototype.replaceListener = function(key, res, cb) {
  this.trace('replaceListener', arguments);
  if (this._fn !== cb) return res;
  (this._listeners[key] || noop)();
  if (!res) delete this._listeners[key];
  else this._listeners[key] = typeof res === 'function' ? res : noop;
  return res;
};

/**
 * Traverse a JSON path
 *
 * @param {Object} parentDocument
 * @param {Object} links
 * @param {String} href
 * @param {Integer} i
 * @param {Array} path
 * @param {Boolean} normalize
 * @param {Function} cb
 */

Request.prototype.fetchJsonPath = function(parentDocument, links, href, i, path, normalize, cb) {
  var self = this;
  self.trace('fetchJsonPath', arguments);
  var pointer = href.split('/');
  var resolvedHref = parentDocument.href + '#' + href;

  if (pointer[0] === '') pointer.shift();

  return self.traverse(parentDocument, links, 0, pointer, parentDocument, false, function handleJsonPath(err, val) {
    if (err) return cb(err);
    if (!self._get('href', val)) val = self._set('href', resolvedHref, val);
    return self.traverse(val, links, i, path, parentDocument, normalize, cb);
  });
};

/**
 * Resolve any local JSON pointers
 *
 * @param {String} root
 * @param {Any} body
 * @return {Any}
 */

Request.prototype._resolve = function(root, body, type) {
  this.trace('_resolve', arguments);
  if (!body || (type || typeof body) !== 'object') return body;
  var obj = Array.isArray(body) ? [] : {};
  var value, childType;
  for (var key in body) {
    if (!body.hasOwnProperty(key)) continue;
    value = body[key];

    childType = typeof value;
    if (key === 'href' && childType === 'string' && value.charAt(0) === '#') {
      obj.href = root + value;
    } else {
      obj[key] = this._resolve(root, value, childType);
    }
  }
  return obj;
};

/**
 * Get a value given a key/object
 *
 * @api private
 */

Request.prototype._get = function(key, parent, fallback) {
  this.trace('_get', arguments);
  if (!parent) return undefined;
  if (parent.hasOwnProperty(key)) return parent[key];
  if (typeof parent.get === 'function') return parent.get(key);
  if (fallback && fallback.hasOwnProperty(key)) return {href: fallback[key]};
  return void 0;
}

/**
 * Set a value on an object
 *
 * @api private
 */

Request.prototype._set = function(key, value, obj) {
  this.trace('_set', arguments);
  if (!obj || typeof obj !== 'object') return obj;
  if (typeof obj.set === 'function') return obj.set(key, value);
  obj[key] = value;
  return obj;
}

/**
 * If the final object is an collection, pass that back
 *
 * @api private
 */

Request.prototype._normalizeTarget = function(target) {
  this.trace('_normalizeTarget', arguments);
  if (typeof target !== 'object' || !target) return target;
  var href = this._get('href', target);
  target = this._get('collection', target) || this._get('data', target) || target;
  return href ? this._set('href', href, target) : target;
}

/**
 * Check if a value is defined
 *
 * @api private
 */

function isDefined(value) {
  return typeof value !== 'undefined' && value !== null;
}
