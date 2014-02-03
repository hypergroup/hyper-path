/**
 * Module dependencies
 */

var each = require('each');

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

function Request(path, client) {
  if (!(this instanceof Request)) return new Request(path, client);

  // init client
  this.client = client;
  if (!this.client) throw new Error('hyper-path requires a client to be passed as the second argument');

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
  if (this._fn) this.refresh();
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
  this.refresh();
  return this;
};

/**
 * Refresh the data down the path
 *
 * @return {Request}
 */

Request.prototype.refresh = function() {
  var self = this;
  var scope = self._scope;
  var fn = self._fn;

  // Clear any previous listeners
  this.off();

  if (!self.isRoot) return self.traverse(scope, {}, 0, fn);

  this._listeners['.'] = self.client(function(err, body, links) {
    if (err) return fn(err);
    links = links || {};
    self.traverse(body || scope, links, 1, fn);
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
  var path = this.path = str.split('.');
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
  each(this._listeners, function(href, listener) {
    if (listener) listener();
  });
  return this;
};

/**
 * Traverse properties in the api
 *
 * @param {Any} parent
 * @param {Integer} i
 * @param {Function} cb
 * @api private
 */

Request.prototype.traverse = function(parent, links, i, cb) {
  var request = this;

  // We're done searching
  if (i === request.path.length) return cb(null, parent);

  var key = request.path[i];
  var value = parent[key] || (links[key] ? {href: links[key]} : undefined);

  // We couldn't find the property
  if (typeof value === 'undefined') return cb(null);

  // It's local
  if (!value.href || value[request.path[i + 1]]) return request.traverse(value, links, i + 1, cb);

  // We're just getting the link
  if (request.path[i + 1] === 'href') return cb(null, value);

  // It's a link
  var href = value.href;

  // Unsubscribe and resubscribe if it was previously requested
  if (request._listeners[href]) request._listeners[href]();

  request._listeners[href] = request.client.get(href, function(err, body, links) {
    if (err) return cb(err);
    if (!body && !links) return cb(null);
    links = links || {};

    var next = request.path[i + 1];

    // Return the resource without getting the key inside of the body
    if (next === '') return cb(null, body);

    // It's a collection
    if (body.data && !body[next] && !links[next]) {
      var data = body.data;
      data.href = body.href;
      return request.traverse(data, links, i + 1, cb);
    }

    // We're looking for another property
    request.traverse(body, links, i + 1, cb);
  });
}
