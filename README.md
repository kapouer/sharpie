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
  jpeg, png, webp, raw  
  defaults to format of the original image, or jpeg
* rs  
  w:452,h=123,min  
  w:452,h=123,max
* bg  
  the background color  
  defaults to no background color
* crop  
  center, north, northeast, ...
* flatten  
  boolean

There is optional support for svg rendering using librsvg.

Content-Type is set by sharpie middleware in the HTTP response header.

This module does not offer any kind of cache, and will stay as simple as
possible.

