
;(function(){

/**
 * Require the module at `name`.
 *
 * @param {String} name
 * @return {Object} exports
 * @api public
 */

function require(name) {
  var module = require.modules[name];
  if (!module) throw new Error('failed to require "' + name + '"');

  if (!('exports' in module) && typeof module.definition === 'function') {
    module.client = module.component = true;
    module.definition.call(this, module.exports = {}, module);
    delete module.definition;
  }

  return module.exports;
}

/**
 * Registered modules.
 */

require.modules = {};

/**
 * Register module at `name` with callback `definition`.
 *
 * @param {String} name
 * @param {Function} definition
 * @api private
 */

require.register = function (name, definition) {
  require.modules[name] = {
    definition: definition
  };
};

/**
 * Define a module's exports immediately with `exports`.
 *
 * @param {String} name
 * @param {Generic} exports
 * @api private
 */

require.define = function (name, exports) {
  require.modules[name] = {
    exports: exports
  };
};
require.register("hyper-path", function (exports, module) {
/**
 * Module dependencies
 */

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
}

/**
 * Set the root scope
 *
 * @param {Object} scope
 * @return {Request}
 */

Request.prototype.scope = function(scope) {
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
  var self = this;
  var scope = self._scope;
  fn = fn || self._fn;

  // Clear any previous listeners
  this.off();

  if (!self.isRoot) return self.traverse(scope, {}, 0, self.path, {}, true, fn);

  return this._listeners['.'] = self.client.root(function(err, body, links) {
    if (err) return fn(err);
    links = links || {};
    return self.traverse(body || scope, links, 1, self.path, body, true, fn);
  });
};

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
  for (var i = 0, listener; i < this._listeners; i++) {
    listener = this._listener[i];
    if (listener) listener();
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

  // we're done searching
  if (i >= path.length) return cb(null, normalize ? normalizeTarget(parent) : parent);

  var key = path[i];
  var value = get(key, parent, links);

  // we couldn't find the property
  if (!isDefined(value)) return self.handleUndefined(key, parent, links, i, path, parentDocument, normalize, cb);

  var next = i + 1;
  var nextProp = path[next];
  var href = value.href;

  // we don't have a link to use or it's set locally on the object
  if (!href || value.hasOwnProperty(nextProp)) return self.traverse(value, links, next, path, parentDocument, normalize, cb);

  // it's a local pointer
  if (href.charAt(0) === '#') return self.fetchJsonPath(parentDocument, links, href.slice(1), next, path, normalize, cb);

  // fetch the resource
  return self.fetchResource(href, next, path, normalize, cb);
}

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
  // check to make sure it's not on a "normalized" target
  var collection = normalizeTarget(parent);
  if (collection && collection.hasOwnProperty(key)) return this.traverse(collection, links, i, path, parentDocument, normalize, cb);

  // We have a single hop path so we're going to try going up the prototype.
  // This is necessary for frameworks like Angular where they use prototypal
  // inheritance. The risk is getting a value that is on the root Object.
  // We can at least check that we don't return a function though.
  var value;
  if (this.wrappedScope) value = parent[key];
  if (typeof value === 'function') value = void 0;
  return cb(null, value);
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
  var orig = href;
  var parts = orig.split('#');
  href = parts[0];

  var listener = self._listeners[orig];
  var res = self._listeners[orig] = self.client.get(href, function(err, body, links) {
    if (err) return cb(err);
    if (!body && !links) return cb(null);
    links = links || {};

    // Be nice to APIs that don't set 'href'
    if (!body.href) body.href = href;

    if (parts.length === 1) return self.traverse(body, links, i, path, body, normalize, cb);
    return self.fetchJsonPath(body, links, parts[1], i, path, normalize, cb);
  });

  // Unsubscribe and resubscribe if it was previously requested
  if (listener) listener();

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
  var pointer = href.split('/');

  if (pointer[0] === '') pointer.shift();

  return self.traverse(parentDocument, links, 0, pointer, parentDocument, false, function(err, val) {
    if (err) return cb(err);
    if (typeof val === 'object' && !val.href) val.href = parentDocument.href + '#' + href;
    return self.traverse(val, links, i, path, parentDocument, normalize, cb);
  });
};

/**
 * Get a value given a key/object
 *
 * @api private
 */

function get(key, parent, fallback) {
  if (!parent) return undefined;
  if (parent.hasOwnProperty(key)) return parent[key];
  if (typeof parent.get === 'function') return parent.get(key);
  if (fallback && fallback.hasOwnProperty(key)) return {href: fallback[key]};
  return void 0;
}

/**
 * If the final object is an collection, pass that back
 *
 * @api private
 */

function normalizeTarget(target) {
  if (typeof target !== 'object') return target;
  var href = target.href;
  target = target.collection || target.data || target; // TODO deprecate 'data'
  target.href = href;
  return target;
}

/**
 * Check if a value is defined
 *
 * @api private
 */

function isDefined(value) {
  return typeof value !== 'undefined' && value !== null;
}

});

if (typeof exports == "object") {
  module.exports = require("hyper-path");
} else if (typeof define == "function" && define.amd) {
  define([], function(){ return require("hyper-path"); });
} else {
  this["hyper-path"] = require("hyper-path");
}
})()
