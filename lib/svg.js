const stream = require('stream');
const XJ = require('xml-js');

const helpers = require('./helpers');

exports.transform = function(params, resize, extract) {
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
					extract = helpers.extract(extract, w, h);
					x += extract.left;
					y += extract.top;
					w = extract.width;
					h = extract.height;
				}
				if (!isNaN(x) && !isNaN(y) && !isNaN(w) && !isNaN(h)) {
					atts.viewBox = `${x} ${y} ${w} ${h}`;
				}
				if (params.ratio) {
					atts.preserveAspectRatio = params.ratio;
				} else if (atts.preserveAspectRatio == null) {
					atts.preserveAspectRatio = 'xMinYMin';
				}

				resize = helpers.resize(resize, w, h);
				if (resize) {
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
				} else if (params.fg) {
					bufs.push(Buffer.from(svgStyle(`path { fill: ${params.fg} !important; }`)));
				}
				bufs.push(chunk.slice(stop + 1));
				chunk = Buffer.concat(bufs);
			} else {
				tagChunks.push(chunk);
			}
		}
		cb(null, chunk);
	}});
};

function svgStyle(str) {
	return `<style type="text/css"><![CDATA[
${str}
]]></style>`;
}
