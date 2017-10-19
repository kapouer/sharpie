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
	var list = {};
	for (var format in obj) {
		if (obj[format].output.stream) list[format] = true;
	}
	return list;
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

	return function(req, res, next) {
		var params = Object.assign({}, defaults, req.query);
		var url = req.params[defaults.param] || req.query[defaults.param];
		if (!url) return res.status(400).send("Missing url parameter");
		var resize = parseParams(params.rs);
		if (!resize.w && !resize.h) resize = null;
		var extract = parseParams(params.ex);
		if (extract.x == null || extract.y == null || extract.w == null || extract.h == null) {
			extract = null;
		}
		var dstFormat = params.format;
		if (dstFormat && !(dstFormat in formats)) {
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
			if (!dstFormat && srcFormat in formats) {
				dstFormat = srcFormat;
			}

			Object.keys(response.headers).forEach(function(header) {
				if (ignoreHeaders.indexOf(header) >= 0) return;
				var nheader = header.split('-').map(function(s) {
					return s[0].toUpperCase() + s.substring(1);
				}).join('-');
				if (!res.get(nheader)) res.setHeader(nheader, response.headers[header]);
			});

			if (srcFormat in formats) {
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
							var exOpts = {
								left: Math.min(Math.max(0, Math.round((extract.x - extract.w / 2) * w / 100)), w),
								top: Math.min(Math.max(0, Math.round((extract.y - extract.h / 2) * h / 100)), h),
								width: Math.max(Math.min(Math.round(extract.w * w / 100), w), 0),
								height: Math.max(Math.min(Math.round(extract.h * h / 100), h), 0)
							};
							pipeline.extract(exOpts);
						}
						if (params.bg) pipeline.background(params.bg);
						if (params.flatten) pipeline.flatten();
						if (resize) {
							pipeline.resize(resize.w, resize.h);
							if (!resize.enlarge) pipeline.withoutEnlargement();
							if (params.crop) pipeline.crop(params.crop);
							if (resize.max) pipeline.max();
							if (resize.min) pipeline.min();
						}
						var formatOptions = {};
						if (params.q) formatOptions.quality = parseInt(params.q);
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
				if (srcFormat == "svg") {
					if (params.style || params.ratio) {
						request.pipe(svgTransform(params)).pipe(res);
					} else {
						request.pipe(res);
					}
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

function parseParams(str) {
	var obj = {};
	if (str) str.split(',').forEach(function(str) {
		var couple = str.trim().split(':');
		var val = couple.length == 2 ? parseInt(couple[1]) : true;
		obj[couple[0]] = val;
	});
	return obj;
}

function checkHostname(hostname, opt) {
	var type = typeof opt;
	if (type == 'function') opt = opt(hostname);
	else if (Array.isArray(opt)) opt = ~opt.indexOf(hostname);
	else if (type == 'object') opt = opt[hostname];
	else if (type != 'boolean') throw new Error("Unhandled `hostnames` option type " + type);
	return !!opt;
}

function svgTransform(params) {
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
				var bufs = [chunk.slice(0, stop)];
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
				var str = "";

				if (!atts.viewBox && atts.width != null && atts.height != null) {
					atts.viewBox = `${atts.x || 0} ${atts.y || 0} ${atts.width} ${atts.height}`;
					str += ` viewBox="${atts.viewBox}"`;
				}
				if (atts.viewBox && atts.preserveAspectRatio == null) {
					str += ` preserveAspectRatio="${params.ratio || 'xMinYMin'}"`;
				}
				if (str) bufs.push(Buffer.from(str));
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
