sharpie
=======

A simple express middleware for resizing images using sharp and pipes

Usage
-----

```
var express = require('express');
var app = express();
var sharpie = require('sharpie')({
	param: 'url',
	q: 90,
	rs: "w:320,h:240,max",
	format: 'jpeg',
	bg: 'white',
	crop: 'center',
	flatten: true,
	hostnames: false,
	ratio: 'minXMinY'
});

// will get the url through req.params[opts.param] – e.g /param/foo.jpg
app.get('/param:url(*)', sharpie);
// will get the url through req.query[opts.param] – e.g. /query?url=/foo.jpg
app.get('/query', sharpie);

app.listen();
```

It supports a limited subset of [sharp options](http://sharp.dimens.io)
that can be given as parameters or as defaults when initializing
the middleware:

* format  
  the destination format (jpeg, png, webp, raw)  
  defaults to format of the original image, or jpeg
* q  
  quality, default 90
* rs  
  w:452,h=123,min  
  w:452,h=123,max  
  w:452,enlarge
  z:55,enlarge
* bg  
  the background color  
  defaults to no background color
* crop  
  center, north, northeast, ...
* flatten  
  boolean
* style  
  new in version 2.3  
  appends a style tag with that content to the svg root
* ratio  
  new in version 2.4  
  sets preserveAspectRatio attribute, and if viewBox is missing, add it  
  (provided width and height attributes, and optionally x, y, are present).
* ex  
  new in version 2.5  
  extracts a region of the image, given center x, y, width and height in % of the
  image. This means `ex=x:50,y:50,w:100,h:100` extracts the full image.
* lqip  
  new in version 2.9  
  force jpeg output of very bad quality, to be used in lqip techniques.

Since version 1.4 svg support has been dropped and replaced by passing svg
through unmodified.
Since version 2.8 converting svg explicitely to another format is supported
(depending on how vips is built), and if when no other format is specified,
svg is returned.

Content-Type is set by sharpie middleware in the HTTP response header.

Since version 2.0 it is possible to pass a `hostnames` option to be able to whitelist
hostnames that sharpie can proxy. This option can be
- `function(hostname) -> boolean`
- `hostnames[hostname] -> boolean`
- an array of whitelisted hostnames
- `true` allowing all hostnames, or `false` rejecting all hostnames except current Host.

Since version 2.0 responses with statusCode >= 400
[pass control to next middleware](https://github.com/kapouer/sharpie/pull/4):
- next() when 404
- or next(err) with err.status = res.statusCode 


This module does not offer any kind of cache, and will stay as simple as
possible.

