sharpie
=======

A simple connect middleware that fetch and resize images using pipes.

It supports a limited subset of [sharp options](http://sharp.dimens.io)
that can be given as query parameters or as defaults when initializing
the middleware:

* format  
  png, jpeg, webp, raw
* rs  
  w:452,h=123,min
  w:452,h=123,max
* bg  
  the background color

There is optional support for svg rendering using librsvg.

This module does not offer any kind of cache, and will stay as simple as
possible.

