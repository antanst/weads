// Package web holds the embedded frontend assets.
package web

import "embed"

// FS holds index.html, the script, the stylesheet, the favicon, and fonts.
//
//go:embed index.html app.css app.js favicon.svg fonts
var FS embed.FS
