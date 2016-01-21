sharpie
=======

A simple express middleware that fetch and resize images using pipes.

Usage
-----

```
var express = require('express');
var app = express();
var sharpie = require('sharpie')({
	param: 'url',
	rs: "w:320,h:240,max",
	format: 'jpeg',
	bg: 'white',
	crop: 'center',
	flatten: true
});

// will get the url through req.param[opts.param]
app.get('/param/:url', sharpie);
// will get the url through req.query[opts.param]
app.get('/query', sharpie);

app.listen();
```

It supports a limited subset of [sharp options](http://sharp.dimens.io)
that can be given as parameters or as defaults when initializing
the middleware:

* format  
  png, jpeg, webp, raw
* rs  
  w:452,h=123,min
  w:452,h=123,max
* bg  
  the background color
* crop  
  center, north, northeast, ...
* flatten  
  boolean

There is optional support for svg rendering using librsvg.

This module does not offer any kind of cache, and will stay as simple as
possible.

