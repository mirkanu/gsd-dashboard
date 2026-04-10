/**
 * Copyright (c) 2014-2024 The xterm.js authors. All rights reserved.
 * @license MIT
 *
 * Copyright (c) 2012-2013, Christopher Jeffrey (MIT License)
 * @license MIT
 *
 * Originally forked from (with the author's permission):
 *   Fabrice Bellard's javascript vt100 for jslinux:
 *   http://bellard.org/jslinux/
 *   Copyright (c) 2011 Fabrice Bellard
 */var g=2,w=1;function _(t){var e;return(e=t==null?void 0:t.ownerDocument)!=null&&e.defaultView?t.ownerDocument.defaultView:window}function n(t){return _(t).getComputedStyle(t,null)}var f=class{activate(t){this._terminal=t}dispose(){}fit(){let t=this.proposeDimensions();!t||!this._terminal||isNaN(t.cols)||isNaN(t.rows)||(this._terminal.rows!==t.rows||this._terminal.cols!==t.cols)&&this._terminal.resize(t.cols,t.rows)}proposeDimensions(){var l,o;if(!this._terminal||!this._terminal.element||!this._terminal.element.parentElement)return;let t=this._terminal.dimensions;if(!t||t.css.cell.width===0||t.css.cell.height===0)return;let e=((l=this._terminal.options.scrollbar)==null?void 0:l.showScrollbar)??!0,a=this._terminal.options.scrollback===0||!e?0:((o=this._terminal.options.scrollbar)==null?void 0:o.width)??14,s=n(this._terminal.element.parentElement),h=parseInt(s.getPropertyValue("height")),m=Math.max(0,parseInt(s.getPropertyValue("width"))),r=n(this._terminal.element),i={top:parseInt(r.getPropertyValue("padding-top")),bottom:parseInt(r.getPropertyValue("padding-bottom")),right:parseInt(r.getPropertyValue("padding-right")),left:parseInt(r.getPropertyValue("padding-left"))},p=i.top+i.bottom,c=i.right+i.left,d=h-p,u=m-c-a;return{cols:Math.max(g,Math.floor(u/t.css.cell.width)),rows:Math.max(w,Math.floor(d/t.css.cell.height))}}};export{f as FitAddon};
//# sourceMappingURL=addon-fit-B680WlWd.js.map
