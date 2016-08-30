var sharp = require('sharp');
var stream = require('stream');
var util = require('util');
var Request = require('request');
var URL = require('url');
var MediaTyper = require('media-typer');
var debug = require('debug')('sharpie');

var formats = (function(obj) {
	var list = {};
	for (var format in obj) {
		if (obj[format].output.stream) list[format] = true;
	}
	return list;
})(sharp.format);

module.exports = function(defaults) {
	defaults = Object.assign({
		rs: "w:2048,h:2048,max",
		bg: false,
		flatten: false,
		param: 'url',
		format: false,
		domains: false
	}, defaults);

	return function(req, res, next) {
		var params = Object.assign({}, defaults, req.query);
		var url = req.params[defaults.param] || req.query[defaults.param];
		if (!url) return res.status(400).send("Missing url parameter");
		var resize = parseParams(params.rs);
		var format = params.format;
		if (format && !(format in formats)) {
			return res.type('text').status(400).send(`Unsupported image format ${format}`);
			format = false;
		}

		var urlObj = URL.parse(url);
		if (!urlObj.hostname) {
			url = URL.resolve(req.protocol + '://' + req.get('Host') + req.path, url);
		} else if (!checkDomains(urlObj.hostname, defaults.domains)) {
			return res.status(403).send("Domain not allowed: " + urlObj.hostname);
		}
		if (urlObj.protocol && urlObj.protocol != "http:" && urlObj.protocol != "https:") {
			return res.status(400).send("Unsupported protocol: " + urlObj.protocol);
		}
		debug("loading", url);

		var request = Request(url)
		.on('response', function(response) {
			var contentType = response.headers['content-type'];
			var typeObj = MediaTyper.parse(contentType);
			if (typeObj.type != "image") {
				request.abort();
				return res.type('text').status(400).send(`Unexpected Content-Type ${contentType}`);
			}
			if (!format && (typeObj.subtype in formats)) {
				format = typeObj.subtype;
			}
			if (!format) format = 'jpeg';

			Object.keys(response.headers).forEach(function(header) {
				if ({
					"content-length":1,
					"connection": 1,
					"keep-alive": 1,
					"transfer-encoding": 1,
					"upgrade": 1,
					"server": 1
				}[header]) return;
				var nheader = header.split('-').map(function(s) {
					return s[0].toUpperCase() + s.substring(1);
				}).join('-');
				res.setHeader(nheader, response.headers[header]);
			});

			res.setHeader('Content-Type', MediaTyper.format({
				type: 'image',
				subtype: format
			}));
			if (typeObj.subtype == "svg") {
				request.pipe(res);
			} else {
				var pipeline = sharp()
				.resize(resize.w, resize.h);

				if (!resize.enlarge) pipeline.withoutEnlargement();
				if (params.bg) pipeline.background(params.bg);
				if (params.crop) pipeline.crop(params.crop);
				if (params.flatten) pipeline.flatten();
				if (resize.max) pipeline.max();
				if (resize.min) pipeline.min();

				pipeline.on('error', function(err) {
					res.type('text').status(500).send(`Response file error ${err.toString()}`);
				});
				pipeline.toFormat(format);
				request.pipe(pipeline);
				pipeline.pipe(res);
			}
		})
		.on('error', function(err) {
			res.type('text').status(500).send(`Request file error ${err.toString()}`);
		});
	};
};

function parseParams(str) {
	var obj = {};
	str.split(',').forEach(function(str) {
		var couple = str.trim().split(':');
		var val = couple.length == 2 ? parseInt(couple[1]) : true;
		obj[couple[0]] = val;
	});
	return obj;
}

function checkDomain(domain, opt) {
	var type = typeof opt;
	if (type == 'function') opt = opt(domain);
	else if (type == 'object') opt = opt[domain];
	else if (type != 'boolean') throw new Error("Unhandled `domains` option type " + type);
	return opt;
}

