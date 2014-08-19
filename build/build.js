
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
  this._scope = scope;
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

  if (!self.isRoot) return self.traverse(scope, {}, 0, self.path, fn);

  this._listeners['.'] = self.client(function(err, body, links) {
    if (err) return fn(err);
    links = links || {};
    self.traverse(body || scope, links, 1, self.path, fn);
  });

  return this;
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
  var path = this.path = str.split(this.delim);
  this.index = path[0];
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
 * TODO support JSON pointer with '#'
 *
 * @param {Any} parent
 * @param {Integer} i
 * @param {Function} cb
 * @api private
 */

Request.prototype.traverse = function(parent, links, i, path, cb) {
  var request = this;

  // We're done searching
  if (i >= path.length) return cb(null, normalizeTarget(parent));

  var key = path[i];
  var value = get(key, parent, links);

  // We couldn't find the property
  if (!isDefined(value)) {
    var collection = parent.collection || parent.data;
    if (collection && collection.hasOwnProperty(key)) return request.traverse(collection, links, i, path, cb);
    // We have a single hop path so we're going to try going up the prototype.
    // This is necessary for frameworks like Angular where they use prototypal
    // inheritance. The risk is getting a value that is on the root Object.
    // We can at least check that we don't return a function though.
    if (path.length === 1) value = parent[key];
    if (typeof value === 'function') value = void 0;
    return cb(null, value);
  }

  var next = i + 1;
  var nextProp = path[next];

  // We don't have a link to use or it's set locally on the object
  if (!value.href || value.hasOwnProperty(nextProp)) return request.traverse(value, links, next, path, cb);

  // We're just getting the link
  if (nextProp === 'href') return cb(null, value);

  // It's a link
  var href = value.href;

  var listener = request._listeners[href];
  request._listeners[href] = request.client.get(href, function(err, body, links) {
    if (err) return cb(err);
    if (!body && !links) return cb(null);
    links = links || {};

    // Be nice to APIs that don't set 'href'
    if (!body.href) body.href = href;

    var pointer = href.split('#')[1];
    if (!pointer) return request.traverse(body, links, i + 1, path, cb);

    pointer = pointer.split('/');
    if (pointer[0] === '') pointer.shift();

    request.traverse(body, links, 0, pointer, function(err, val) {
      if (err) return cb(err);
      request.traverse(val, links, i + 1, path, cb);
    });
  });

  // Unsubscribe and resubscribe if it was previously requested
  if (listener) listener();
}

/**
 * Get a value given a key/object
 *
 * @api private
 */

function get(key, parent, fallback) {
  if (!parent) return undefined;
  if (parent.hasOwnProperty(key)) return parent[key];
  if (fallback.hasOwnProperty(key)) return {href: fallback[key]};
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