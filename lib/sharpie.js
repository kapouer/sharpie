if (!process.env.VIPS_WARNING) process.env.VIPS_WARNING = "0";
var sharp = require('sharp');

var got = require('got').extend({retry: 0});
var URL = require('url');
var ContentType = require('content-type');
var MediaTyper = require('media-typer');
var stream = require('stream');

var debug = require('debug')('sharpie');

var helpers = require('./helpers');
var svg = require('./svg');
var favicon;

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
	var opts = defaults || {};
	opts = Object.assign({
		rs: "w:2048,h:2048,max",
		q: 90,
		bg: false,
		flatten: false,
		param: 'url',
		format: false,
		hostnames: false,
		style: false,
		ratio: 'xMinYMin',
		sizes: '64,32,16',
		mean: undefined
	}, opts);
	opts.signs = Object.assign({
		assignment: ':',
		separator: ','
	}, opts.signs || {});

	if (opts.im) {
		formats.dst.ico = true;
		favicon = require('./favicon')(opts);
	}
	return mw.bind({opts: opts});
};


function mw(req, res, next) {
	var opts = this.opts;
	var params = Object.assign({}, opts, req.query);
	var url = req.params[opts.param] || req.query[opts.param];
	if (!url) return res.status(400).send("Missing url parameter");
	var resize = helpers.params(opts.signs, params.rs);
	var extract = helpers.params(opts.signs, params.ex);
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
	} else if (curHost != urlObj.hostname && !helpers.hostname(urlObj.hostname, opts.hostnames)) {
		return res.status(403).send("Hostname not allowed: " + urlObj.hostname);
	}
	if (urlObj.protocol && urlObj.protocol != "http:" && urlObj.protocol != "https:") {
		return res.status(400).send("Unsupported protocol: " + urlObj.protocol);
	}
	debug("loading", url);
	var pipeline = stream.PassThrough();
	var request = got.stream(url)
	.on('response', function(response) {
		doPipe(pipeline, req, res, next, request, response, resize, extract, params);
	})
	.on('error', function(err) {
		err.status = err.statusCode;
		next(err);
	});
	request.pipe(pipeline);
}

function doPipe(pipeline, req, res, next, request, response, resize, extract, params) {
	var contentType = response.headers['content-type'];
	debug("got content type", contentType);
	var typeObj = getType(contentType);
	if (typeObj.type != "image") {
		// eslint-disable-next-line no-console
		console.warn("Sharpie is supposed to process images, not", contentType);
		pipeline.pipe(res);
		return;
	}
	var formatOptions = {};
	var srcFormat = typeObj.subtype;
	var dstFormat = params.format;

	if (!dstFormat) {
		var webpOk = req.get('Accept') && req.accepts(['image/png', 'image/jpeg', 'image/tiff', 'image/webp']) == "image/webp";
		res.setHeader('Vary', 'Accept');
		if (webpOk) {
			dstFormat = 'webp';
			if (srcFormat == "png") {
				formatOptions.nearLossless = true;
			}
		} else if (srcFormat == "webp") {
			dstFormat = "jpeg";
		} else {
			dstFormat = srcFormat;
		}
	}

	if (dstFormat == "jpeg") {
		var jpegLen = response.headers['content-length'];
		if (jpegLen && jpegLen < 10000) formatOptions.optimizeScans = false;
	}

	Object.keys(response.headers).forEach(function(header) {
		if (ignoreHeaders.indexOf(header) >= 0) return;
		var nheader = header.split('-').map(function(s) {
			return s[0].toUpperCase() + s.substring(1);
		}).join('-');
		if (!res.get(nheader)) res.setHeader(nheader, response.headers[header]);
	});
	if (srcFormat == "svg" && dstFormat == "svg") {
		pipeline.pipe(svg.transform(params, resize, extract)).pipe(res);
		return;
	}
	if (dstFormat == "ico") {
		res.setHeader('Content-Type', 'image/x-icon');
		favicon.transform(params, pipeline, res);
		return;
	}
	if (!(srcFormat in formats.src && dstFormat in formats.dst)) {
		pipeline.pipe(res);
		return;
	}


	if (params.q) {
		formatOptions.quality = parseInt(params.q);
	}

	res.setHeader('Content-Type', MediaTyper.format({
		type: 'image',
		subtype: dstFormat
	}));

	var sharpPipe = sharp();
	pipeline.pipe(sharpPipe);
	pipeline = sharpPipe;

	pipeline.metadata().then(function(meta) {
		var w = meta.width;
		var h = meta.height;
		var err;
		if (extract) {
			var exOpts = helpers.extract(extract, w, h);
			for (var k in exOpts) exOpts[k] = Math.round(exOpts[k]);
			w = exOpts.width;
			h = exOpts.height;
			if (!w || !h) {
				err = new Error("Bad extract parameters, width and height must be greater than zero");
				err.status = 400;
				throw err;
			}
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
		resize = helpers.resize(resize, w, h);
		if (resize && (resize.w == 0 || resize.h == 0 || resize.z == 0)) {
			err = new Error("Bad resize parameters, width and height must be greater than zero");
			err.status = 400;
			throw err;
		}
		if (params.mean !== undefined) {
			if (dstFormat == "png") {
				Object.assign(formatOptions, {
					palette: true,
					colors: 2,
					quality: 0
				});
			}
			return pipeline.stats().then(function(stats) {
				return sharp({
					create: {
						width: w,
						height: h,
						channels: 3,
						background: {
							r: stats.channels[0].mean,
							g: stats.channels[1].mean,
							b: stats.channels[2].mean
						}
					}
				});
			});
		} else {
			return pipeline;
		}
	}).then(function(pipeline) {
		if (resize) {
			debug("resize", resize);
			pipeline.resize({
				width: resize.w,
				height: resize.h,
				fit: resize.fit,
				withoutEnlargement: !resize.enlarge
			});
			if (params.crop) {
				debug("crop", params.crop);
				pipeline.crop(params.crop);
			}
		}

		pipeline.on('error', function(err) {
			res.type('text').status(500).send(`Response file error ${err.toString()}`);
		});

		if (dstFormat == "jpeg") {
			formatOptions = Object.assign({
				optimizeScans: true,
				overshootDeringing: true,
				trellisQuantisation: true
			}, formatOptions);
		} else if (dstFormat == "png") {
			formatOptions = Object.assign({
				palette: true
			}, formatOptions);
		}

		pipeline.toFormat(dstFormat, formatOptions);
		pipeline.pipe(res);
	}).catch(function(err) {
		response.req.abort();
		if (err.status) res.type('text').status(err.status).send(err.message);
		else next(err);
	});
}

function getType(header) {
	var obj = {};
	try {
		obj = ContentType.parse(header);
	} catch(ex) {
		// pass
	}
	if (!obj.type) return obj;
	return MediaTyper.parse(obj.type);
}

module.exports.formats = formats;
module.exports.sharp = sharp;

