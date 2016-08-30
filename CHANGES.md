Version 1.1.0
=============

Default parameters have changed, now the image format
stays the same as the original, unless impossible or set otherwise;
and the background color is left untouched.

Version 1.2.0
=============

url are resolved against current request if they have no hostname.

Version 1.3.0
=============

rs supports 'enlarge' parameter.

Version 1.4.0
=============

Drop svg support and librsvg optional dep, replace by simply passing svg files
through.
Bump sharp to 0.15.1

Version 1.4.1
=============

Keep sharp at 0.12.2 until vips is up-to-date in fedora/debian.


Version 1.4.3
=============

Proxy safe HTTP headers (with a blacklist).


Version 2.0.0
=============

Call next() if status is 404, or next(err) if status >= 400.

Blacklist other hostnames by default, can be set through option.



