var sharp = require('sharp');
var stream = require('stream');
var util = require('util');
var Request = require('request');
var MediaTyper = require('media-typer');
var debug = require('debug')('sharpie');

var Rsvg;
try {
	Rsvg = require('librsvg').Rsvg;
} catch(e) {
	debug("will not process svg files");
}

module.exports = function(defaults) {
	defaults = Object.assign({
		rs: "w:2048,h:2048,max",
		bg: "white"
	}, defaults);

	return function(req, res, next) {
		var url = req.query.url;
		var params = Object.assign({}, defaults, req.query);
		var resize = parseParams(params.rs);

		var pipeline = sharp()
		.flatten()
		.withoutEnlargement()
		.resize(resize.w, resize.h)
		.crop('centre');
		.background(params.bg);

		if (resize.max) pipeline.max();
		if (resize.min) pipeline.min();
		if (params.format) pipeline.format(params.format);

		var request = Request(url)
		.on('response', function(response) {
			var contentType = response.headers['content-type'];
			var typeObj = MediaTyper.parse(contentType);
			if (typeObj.type != "image") {
				request.abort();
				return res.status(400).send(`Unexpected Content-Type ${contentType}`);
			}
			if (typeObj.subtype == "svg") {
				if (!Rsvg) return res.status(400).send("SVG files not supported");
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
			pipeline.pipe(res);
		})
		.on('error', function(err) {
			res.status(500).send(`Requested file error ${err.toString()}`);
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

