/**
 * Configure Monaco Editor to load from local static files.
 * Avoids CDN (blocked by PiClaw's CSP: script-src 'self').
 * Files are copied to dist/monaco-vs/ by the postbuild script.
 */
import { loader } from '@monaco-editor/react'

loader.config({
  paths: { vs: '/static/drupalclaw/monaco-vs' },
})
