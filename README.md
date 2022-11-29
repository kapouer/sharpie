sharpie
=======

Express middleware for resizing images with sharp and short url query parameters.

Supports content negotiation, and http caches.

Usage
-----

```js
import express from 'express';
import Sharpie from 'sharpie';

const app = express();
const sharpie = Sharpie({
 param: 'url', // or an async function(req) that returns a file path
 q: 90,
 rs: "w:320,h:240,max",
 format: false, // negotiate format
 bg: 'white',
 crop: 'center',
 flatten: true,
 hostnames: false,
 ratio: 'minXMinY',
 sizes: '16,32,48', // sizes for ico format
 signs: {
  assignment: ':', // use ~ for better uri-encoding
  separator: ','  // use ! for better uri-encoding
 },
 https: {
   rejectUnauthorized: false
 }
});

// will get the url through req.params[opts.param] – e.g /param/foo.jpg
app.get('/param:url(*)', sharpie);
// will get the url through req.query[opts.param] – e.g. /query?url=/foo.jpg
app.get('/query', sharpie);

app.listen();
```

Query Options
-------------

It supports a limited subset of [sharp options](http://sharp.dimens.io) that can be given as parameters or as defaults when initializing the middleware:

* format
  force destination format (jpeg, png, webp, avif, raw, svg, ...)
  If false, defaults to format of the original image,
  or negotiate best format.
* q
  quality, renormalized, default 80
* rs
  w:452,h=123,min
  w:452,h=123,max
  w:452,enlarge
  z:55,enlarge
* bg
  the background color for flatten and resize
  defaults to no background color
* fg
  fill color for svg (simpler than using style)
* crop
  center, north, northeast, ...
* flatten
  boolean
* style
  appends a style tag with that content to the svg root
* ratio
  sets preserveAspectRatio attribute, and if viewBox is missing, add it
  (provided width and height attributes, and optionally x, y, are present).
* ex
  extracts a region of the image, given center x, y, width and height in % of the
  image. This means `ex=x:50,y:50,w:100,h:100` extracts the full image.
* mean
  the image has all pixels color set to the image average color.
  While this is not the "dominant" color, it can be useful as a placeholder.

Constructor options
-------------------

* param
  Key in req.params or req.query
  Or `async req => filepath` function.

* formats
  list of allowed formats for negotiation.
  Default to ['svg', 'png', 'jpeg', 'webp']
  To test avif encoding, pass formats: ['svg', 'png', 'jpeg', 'webp', 'avif'].

* hostnames
  whitelist of *other* hostnames that can be proxied. True for all, false for none.
  Or a function, a map, an array - anything taking a hostname and returning a boolean.

* sizes
  the sizes of the favicon in ico format, separated by a comma.
  defaults to 64,32,16.

Formats
-------

* jpeg: trellisQuantisation, overshootDeringing, and if image is > 10kb,
optimizeScans
* png: palette
* webp: nearLossless when converting from png
* avif: lossless when converting from png
* ico is supported, see sizes and bg options.
* svg: can be converted to another format, results may vary
  rs and ex are implemented if the root has viewBox, fg changes svg fill color.

Unrecognized types are proxied *as is* with a warning.
(Future versions might change that behavior).

Errors
------

All errors are HttpError instances, passed to next middleware.
