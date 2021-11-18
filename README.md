sharpie
=======

A simple express middleware for resizing images using sharp and pipes.

When format parameter is not set and content negotiation allows it,
jpeg, png, and tiff images are converted to webp or avif images,
and Vary:Accept is set on the response headers.

sharpie (>= 4.6.0) needs sharp at any version compatible with your system,
and as such sharp is listed as a peer dependency.

Usage
-----

```js
const express = require('express');
const app = express();
const sharpie = require('sharpie')({
 param: 'url',
 q: 90,
 rs: "w:320,h:240,max",
 format: false, // negotiate format
 bg: 'white',
 crop: 'center',
 flatten: true,
 hostnames: false,
 ratio: 'minXMinY',
 sizes: '16,32,48',      // these two options for ico output format support
 im: '/usr/bin/convert', // since version 3.4.0
 signs: {
  assignment: ':', // use ~ for better uri-encoding
  separator: ','  // use ! for better uri-encoding
 }
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
  force destination format (jpeg, png, webp, avif, raw, svg, ...)
  If false, defaults to format of the original image,
  or negotiate best format (version 4.7).
* formats
  list of allowed formats for negotiation.
  Default to ['svg', 'png', 'jpeg', 'webp']
  To test avif encoding, pass formats: ['svg', 'png', 'jpeg', 'webp', 'avif'].
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
* mean
  new in version 3.5
  the image has all pixels color set to the image average color.
  While this is not the "dominant" color, it can be useful as a placeholder.

Since version 1.4 svg support has been dropped and replaced by passing svg
through unmodified.
Since version 2.8 converting svg explicitely to another format is supported
(depending on how vips is built), and if when no other format is specified,
svg is returned.
Since version 3.3 resize (rs) and extract (ex) apply to svg as well, provided
their root element has enough information to define a viewBox.
Since version 4.4 the foreground color (fg) can change svg fill color.

Content-Type is set by sharpie middleware in the HTTP response header.

Since version 2.0 it is possible to pass a `hostnames` option to be able to whitelist
hostnames that sharpie can proxy. This option can be

* `function(hostname) -> boolean`
* `hostnames[hostname] -> boolean`
* an array of whitelisted hostnames
* `true` allowing all hostnames, or `false` rejecting all hostnames except current Host.

Since version 2.0 responses with statusCode >= 400
[pass control to next middleware](https://github.com/kapouer/sharpie/pull/4):

* next() when 404
* or next(err) with err.status = res.statusCode

Since version 3.4 it is possible to use imagemagick to convert to ico file format:

* im
  path to im's convert executable. None is set by default.
* sizes
  the sizes of the favicon in ico format, separated by a comma.
  defaults to 64,32,16.
* bg
  the background color

Since version 4, default optimizations options are set:

* jpeg: trellisQuantisation, overshootDeringing, and if image is > 10kb,
optimizeScans
* png: palette
* webp: nearLossless when converting from png
* avif: lossless when converting from png

This module does not offer any kind of cache, and will stay as simple as
possible.

Since version 4.1, when content-type is not an image, a warning is logged
and the data is just passed on.
