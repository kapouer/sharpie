import { Transform } from 'stream';
import { xml2js } from 'xml-js';

import * as helpers from './helpers.js';

export function transform(params) {
	let begun = false;
	let ended = false;
	let tagChunks = [];
	return new Transform({transform: function(chunk, encoding, cb) {
		// this transform should work even if the start of the svg tag
		// is not in the same chunk as the end of the svg tag
		if (ended !== false) return cb(null, chunk);
		let start = 0;
		if (begun === false) {
			start = chunk.indexOf('<svg');
			if (start >= 0) {
				begun = start;
			}
		}
		if (begun !== false) {
			// if start of svg tag was found in previous chunk: 0; else `begun`
			const stop = chunk.indexOf('>', start);
			if (stop >= 0) {
				ended = true;
				const bufs = [chunk.slice(0, start), Buffer.from("<svg")];
				// get svg node as a string
				const begin = chunk.slice(start, stop + 1);
				tagChunks.push(begin);
				const selfClosed = begin.slice(-2) == '/>';
				if (!selfClosed) tagChunks.push(Buffer.from("</svg>"));
				const xml = Buffer.concat(tagChunks).toString();
				let root;
				try {
					root = xml2js(xml, {compact: true});
				} catch(ex) {
					console.warn("Unparsable svg root", xml, ex.toString());
				}
				tagChunks = null;
				if (!root) return cb(null, chunk);
				const atts = root.svg._attributes;
				if (!atts.xmlns) atts.xmlns = "http://www.w3.org/2000/svg";
				let x = parseFloat(atts.x) || 0;
				let y = parseFloat(atts.y) || 0;
				delete atts.x;
				delete atts.y;
				let w = parseFloat(atts.width);
				let h = parseFloat(atts.height);
				if (atts.viewBox) {
					const viewBoxList = atts.viewBox.trim().split(' ');
					if (viewBoxList.length == 4) {
						x = parseFloat(viewBoxList[0]);
						y = parseFloat(viewBoxList[1]);
						w = parseFloat(viewBoxList[2]);
						h = parseFloat(viewBoxList[3]);
					}
				}

				if (params.ex) {
					const extract = helpers.extract(params.ex, w, h);
					x += extract.left;
					y += extract.top;
					w = extract.width;
					h = extract.height;
				}
				if (!Number.isNaN(x) && !Number.isNaN(y) && !Number.isNaN(w) && !Number.isNaN(h)) {
					atts.viewBox = `${x} ${y} ${w} ${h}`;
				}
				if (params.ratio) {
					atts.preserveAspectRatio = params.ratio;
				} else if (atts.preserveAspectRatio == null) {
					atts.preserveAspectRatio = 'xMinYMin';
				}
				if (params.rs) {
					const resize = helpers.resize(params.rs, w, h);
					if (resize && (resize.max && w > resize.w || resize.min && w < resize.w || resize.z)
					&& atts.viewBox) {
						atts.width = resize.w;
					} else {
						delete atts.width;
					}
					if (resize && (resize.max && h > resize.h || resize.min && h < resize.h || resize.z)
					&& atts.viewBox) {
						atts.height = resize.h;
					} else {
						delete atts.height;
					}
				}
				const ordAtts = {
					xmlns: atts.xmlns,
					version: atts.version
				};
				delete atts.xmlns;
				delete atts.version;
				Object.assign(ordAtts, atts);
				for (const k in ordAtts) {
					if (ordAtts[k] != null) bufs.push(Buffer.from(` ${k}="${ordAtts[k]}"`));
				}
				bufs.push(chunk.slice(stop - (selfClosed ? 1 : 0), stop + 1));
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
}

function svgStyle(str) {
	return `<style type="text/css"><![CDATA[
${str}
]]></style>`;
}
