hyper-path [![Build Status](https://travis-ci.org/hypergroup/hyper-path.png)](https://travis-ci.org/hypergroup/hyper-path)
==========

Traverse a hyper api

Installation
------------

### Node

```sh
$ npm install hyper-path
```

### Component

```sh
$ component install hypergroup/hyper-path
```

Usage
-----

```js
var client = require('hyper-path');

/**
 * create a agent
 */

function agent(fn) {
  // make a request to the root of the api here and call
  // fn(err, body);
}

agent.get = function(href, fn) {
  // make a request to the href and call
  // fn(err, body);
}

client('.path.to.desired.property', agent)
  .on(function(err, property) {
    // property will be set to the value at the end of the passed path, deliminated with '.'
    // if any of the intermediate properties are undefined a short-circuit will occur and return `undefined`
  });
```

Agents can offer subscriptions and call `fn` anytime the data changes at the `href`. The methods should return an `unsubscribe` function so the request can clean itself up when calling `off`.

```js
function agent(fn) {
  // make a request here
  return function unsubscribe() {
    // implement me!
  }
}

agent.get = function(href, fn) {
  // make a request here
  return function unsubscribe() {
    // implement me!
  }
}

var req = client('.path.to.desired.property', agent)
  .on(function(err, property) {
    // this function will be called anytime any intermediate paths change
  });

// stop listening to api changes
req.off();
```

Clients can also use a scope for requests with the `scope` method.

```js
client('local.remote', agent)
  .scope({local: {href: '/path/to/resource'}})
  .on(function(err, remote) { });
```

The function passed to on will be refreshed anytime the scope is updated.

```js
var req = client('local.remote', agent)
  .on(function(err, remote) { });

req.scope({local: {href: '/new/path/to/other/resource'}});
```

Tests
-----

```sh
$ npm install
$ npm test
```
