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

// will get the url through req.params[opts.param]
app.get('/param:url(*)', sharpie);
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
  w:452,enlarge
* bg  
  the background color  
  defaults to no background color
* crop  
  center, north, northeast, ...
* flatten  
  boolean

Since version 1.4 svg support has been dropped and replaced by a passing svg
through unmodified.

Content-Type is set by sharpie middleware in the HTTP response header.

This module does not offer any kind of cache, and will stay as simple as
possible.

