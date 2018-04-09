if (!process.env.VIPS_WARNING) process.env.VIPS_WARNING = "0";
var sharp = require('sharp');
var stream = require('stream');
var util = require('util');
var got = require('got');
var URL = require('url');
var MediaTyper = require('media-typer');
var XJ = require('xml-js');
var debug = require('debug')('sharpie');

var formats = (function(obj) {
	var map = {
		src: {},
		dst: {}
	};
	for (var format in obj) {
		if (obj[format].input.stream) map.src[format] = true;
		if (obj[format].output.stream) map.dst[format] = true;
	}
	return map;
})(sharp.format);

var ignoreHeaders = [
	"content-length",
	"connection",
	"keep-alive",
	"transfer-encoding",
	"upgrade",
	"server",
	"x-powered-by"
];

debug("Supported formats", formats);

module.exports = function(defaults) {
	defaults = Object.assign({
		rs: "w:2048,h:2048,max",
		q: 90,
		bg: false,
		flatten: false,
		param: 'url',
		format: false,
		hostnames: false,
		style: false,
		ratio: 'xMinYMin'
	}, defaults);
	defaults.signs = Object.assign({
		assignment: ':',
		separator: ','
	}, defaults.signs || {});

	return function(req, res, next) {
		var params = Object.assign({}, defaults, req.query);
		var url = req.params[defaults.param] || req.query[defaults.param];
		if (!url) return res.status(400).send("Missing url parameter");
		var resize = parseParams(defaults.signs, params.rs);
		var extract = parseParams(defaults.signs, params.ex);
		if (extract.x == null || extract.y == null || extract.w == null || extract.h == null) {
			extract = null;
		}
		var dstFormat = params.format;
		if (dstFormat && !(dstFormat in formats.dst)) {
			return res.type('text').status(400).send(`Unsupported image format ${dstFormat}`);
		}

		var urlObj = URL.parse(url);
		var curHost = req.get('Host');
		if (!urlObj.hostname) {
			url = URL.resolve(req.protocol + '://' + curHost + req.path, url);
		} else if (curHost != urlObj.hostname && !checkHostname(urlObj.hostname, defaults.hostnames)) {
			return res.status(403).send("Hostname not allowed: " + urlObj.hostname);
		}
		if (urlObj.protocol && urlObj.protocol != "http:" && urlObj.protocol != "https:") {
			return res.status(400).send("Unsupported protocol: " + urlObj.protocol);
		}
		debug("loading", url);

		var request = got.stream(url)
		.on('response', function(response) {
			var contentType = response.headers['content-type'];
			debug("got content type", contentType);
			var typeObj = MediaTyper.parse(contentType);
			if (typeObj.type != "image") {
				response.req.abort();
				return res.type('text').status(400).send(`Unexpected Content-Type ${contentType}`);
			}
			var srcFormat = typeObj.subtype;
			if (!dstFormat) {
				dstFormat = srcFormat;
			}

			Object.keys(response.headers).forEach(function(header) {
				if (ignoreHeaders.indexOf(header) >= 0) return;
				var nheader = header.split('-').map(function(s) {
					return s[0].toUpperCase() + s.substring(1);
				}).join('-');
				if (!res.get(nheader)) res.setHeader(nheader, response.headers[header]);
			});

			if (srcFormat in formats.src && dstFormat in formats.dst) {
				var formatOptions = {};
				if (params.q) {
					formatOptions.quality = parseInt(params.q);
				}

				res.setHeader('Content-Type', MediaTyper.format({
					type: 'image',
					subtype: dstFormat
				}));
				var pipeline = sharp();
				try {
					pipeline.metadata().then(function(meta) {
						var w = meta.width;
						var h = meta.height;
						if (extract) {
							var exOpts = normExtract(extract, w, h);
							w = exOpts.width;
							h = exOpts.height;
							debug("ex", exOpts);
							pipeline.extract(exOpts);
						}
						if (params.bg) {
							debug("bg", params.bg);
							pipeline.background(params.bg);
						}
						if (params.flatten) {
							debug("flatten", params.flatten);
							pipeline.flatten();
						}
						resize = normResize(resize, w, h);
						if (resize) {
							debug("resize", resize);
							pipeline.resize(resize.w, resize.h);
							if (!resize.enlarge) {
								debug("resize without enlargement");
								pipeline.withoutEnlargement();
							}
							if (params.crop) {
								debug("crop", params.crop);
								pipeline.crop(params.crop);
							}
							if (resize.max) {
								debug("max");
								pipeline.max();
							}
							if (resize.min) {
								debug("min");
								pipeline.min();
							}
						}
						return pipeline;
					}).then(function(pipeline) {
						pipeline.on('error', function(err) {
							res.type('text').status(500).send(`Response file error ${err.toString()}`);
						});
						pipeline.toFormat(dstFormat, formatOptions);
						pipeline.pipe(res);
					}).catch(next);
					request.pipe(pipeline);
				} catch(err) {
					return next(err);
				}
			} else {
				if (srcFormat == "svg" && dstFormat == "svg") {
					request.pipe(svgTransform(params, resize, extract)).pipe(res);
				} else {
					request.pipe(res);
				}
			}
		})
		.on('error', function(err) {
			err.status = err.statusCode;
			return next(err);
		});
	};
};

module.exports.sharp = sharp;

function parseParams(signs, str) {
	var obj = {};
	if (str) str.split(signs.separator).forEach(function(str) {
		var couple = str.trim().split(signs.assignment);
		var val = couple.length == 2 ? parseInt(couple[1]) : true;
		obj[couple[0]] = val;
	});
	return obj;
}

function normResize(resize, w, h) {
	if (!resize.w && !resize.h && !resize.z) {
		resize = null;
	} else if (resize.z) {
		// if one of the dimensions is set, don't set the other one
		var zw = Math.round((resize.w || w) * resize.z / 100);
		var zh = Math.round((resize.h || h) * resize.z / 100);
		if (resize.w == null && resize.h == null) {
			resize.w = zw;
			resize.h = zh;
		} else {
			if (resize.w != null) resize.w = zw;
			if (resize.h != null) resize.h = zh;
		}
	}
	return resize;
}

function normExtract(extract, w, h) {
	return {
		left: Math.min(Math.max(0, Math.round((extract.x - extract.w / 2) * w / 100)), w),
		top: Math.min(Math.max(0, Math.round((extract.y - extract.h / 2) * h / 100)), h),
		width: Math.max(Math.min(Math.round(extract.w * w / 100), w), 0),
		height: Math.max(Math.min(Math.round(extract.h * h / 100), h), 0)
	};
}

function checkHostname(hostname, opt) {
	var type = typeof opt;
	if (type == 'function') opt = opt(hostname);
	else if (Array.isArray(opt)) opt = ~opt.indexOf(hostname);
	else if (type == 'object') opt = opt[hostname];
	else if (type != 'boolean') throw new Error("Unhandled `hostnames` option type " + type);
	return !!opt;
}

function svgTransform(params, resize, extract) {
	var begun = false;
	var ended = false;
	var tagChunks = [];
	return new stream.Transform({transform: function(chunk, encoding, cb) {
		// this transform should work even if the start of the svg tag
		// is not in the same chunk as the end of the svg tag
		if (ended !== false) return cb(null, chunk);
		var start = 0;
		if (begun === false) {
			start = chunk.indexOf('<svg');
			if (start >= 0) {
				begun = start;
			}
		}
		if (begun !== false) {
			// if start of svg tag was found in previous chunk: 0; else `begun`
			var stop = chunk.indexOf('>', start);
			if (stop >= 0) {
				ended = true;
				var bufs = [chunk.slice(0, start), Buffer.from("<svg")];
				// get svg node as a string
				tagChunks.push(chunk.slice(start, stop + 1), Buffer.from("</svg>"));
				var xml = Buffer.concat(tagChunks).toString();
				var root;
				try {
					root = XJ.xml2js(xml, {compact: true});
				} catch(ex) {
					console.warn("Unparsable svg root", xml, ex.toString());
				}
				tagChunks = null;
				if (!root) return cb(null, chunk);
				var atts = root.svg._attributes;
				if (!atts.xmlns) atts.xmlns = "http://www.w3.org/2000/svg";
				var x = parseFloat(atts.x) || 0;
				var y = parseFloat(atts.y) || 0;
				delete atts.x;
				delete atts.y;
				var w = parseFloat(atts.width);
				var h = parseFloat(atts.height);
				if (atts.viewBox) {
					var viewBoxList = atts.viewBox.trim().split(' ');
					if (viewBoxList.length == 4) {
						x = parseFloat(viewBoxList[0]);
						y = parseFloat(viewBoxList[1]);
						w = parseFloat(viewBoxList[2]);
						h = parseFloat(viewBoxList[3]);
					}
				}

				if (extract) {
					extract = normExtract(extract, w, h);
					x += extract.left;
					y += extract.top;
					w = extract.width;
					h = extract.height;
				}
				if (!isNaN(x) && !isNaN(y) && !isNaN(w) && !isNaN(y)) {
					atts.viewBox = `${x} ${y} ${w} ${h}`;
				}
				if (params.ratio) {
					atts.preserveAspectRatio = params.ratio;
				} else if (atts.preserveAspectRatio == null) {
					atts.preserveAspectRatio = 'xMinYMin';
				}

				if (resize) {
					resize = normResize(resize, w, h);
					if ((resize.max && w > resize.w || resize.min && w < resize.w || resize.z)
					&& atts.viewBox) {
						atts.width = resize.w;
					} else {
						delete atts.width;
					}
					if ((resize.max && h > resize.h || resize.min && h < resize.h || resize.z)
					&& atts.viewBox) {
						atts.height = resize.h;
					} else {
						delete atts.height;
					}
				}
				var ordAtts = {
					xmlns: atts.xmlns,
					version: atts.version
				};
				delete atts.xmlns;
				delete atts.version;
				Object.assign(ordAtts, atts);
				for (var k in ordAtts) {
					if (ordAtts[k] != null) bufs.push(Buffer.from(` ${k}="${ordAtts[k]}"`));
				}
				bufs.push(chunk.slice(stop, stop + 1));
				if (params.style) {
					bufs.push(Buffer.from(svgStyle(params.style)));
				}
				bufs.push(chunk.slice(stop + 1));
				chunk = Buffer.concat(bufs);
			} else {
				tagChunks.push(chunk);
			}
		}
		cb(null, chunk);
	}});
}

function svgStyle(str) {
	return `<style type="text/css"><![CDATA[
${str}
]]></style>`;
}
