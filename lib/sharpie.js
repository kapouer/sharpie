var sharp = require('sharp');
var stream = require('stream');
var util = require('util');
var Request = require('request');
var URL = require('url');
var MediaTyper = require('media-typer');
var debug = require('debug')('sharpie');

var Rsvg;
try {
	Rsvg = require('librsvg').Rsvg;
} catch(e) {
	debug("will not process svg files");
}

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
		format: false
	}, defaults);

	return function(req, res, next) {
		var params = Object.assign({}, defaults, req.query);
		var url = req.params[defaults.param] || req.query[defaults.param];
		var resize = parseParams(params.rs);
		var format = params.format;
		if (format && !(format in formats)) {
			return res.type('text').status(400).send(`Unsupported image format ${format}`);
			format = false;
		}

		var pipeline = sharp()
		.withoutEnlargement()
		.resize(resize.w, resize.h);

		if (params.bg) pipeline.background(params.bg);
		if (params.crop) pipeline.crop(params.crop);
		if (params.flatten) pipeline.flatten();
		if (resize.max) pipeline.max();
		if (resize.min) pipeline.min();

		pipeline.on('error', function(err) {
			res.type('text').status(500).send(`Response file error ${err.toString()}`);
		});

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
			pipeline.toFormat(format);
			if (typeObj.subtype == "svg") {
				if (!Rsvg) return res.type('text').status(400).send("SVG files not supported");
				var svg = new Rsvg();
				svg.on('finish', function() {
					var img = svg.render({
						width: resize.w,
						height: resize.h,
						format: 'png'
					});
					pipeline.write(img.data);
					pipeline.end();
				});
				request.pipe(svg);
			} else {
				request.pipe(pipeline);
			}
			res.setHeader('Content-Type', MediaTyper.format({
				type: 'image',
				subtype: format
			}));
			pipeline.pipe(res);
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

