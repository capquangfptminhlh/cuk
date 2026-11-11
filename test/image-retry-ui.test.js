import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'

const main=readFileSync(new URL('../src/main.jsx',import.meta.url),'utf8')
const audit=readFileSync(new URL('../scripts/browser-all-images-qa.js',import.meta.url),'utf8')
const workflow=readFileSync(new URL('../.github/workflows/pages.yml',import.meta.url),'utf8')

test('All manufacturer image views retry once before falling back to another photo or an honest placeholder',()=>{
 assert.match(main,/function ResilientGalleryImage\(/)
 assert.match(main,/onGlobalImageError/)
 assert.match(main,/onHeroImageError/)
 assert.match(main,/onError=\{\(\)=>setAttempt\(n=>n\+1\)\}/)
 assert.match(main,/src=\{retriedPhotoUrl\(gallery\[fallbackIndex\],imageState\.retry\)\}/)
 assert.match(main,/src=\{retriedPhotoUrl\(image,imageState\.retry\)\}/)
 assert.match(main,/gallery-image-unavailable-'.mode/)
 assert.match(main,/mode="full" source_site=\{product\.source_site\}/)
 assert.doesNotMatch(main,/e\.currentTarget\.closest\('button'\)\.style\.display='none'/)
})
test('Image QA decodes every local product image with bounded pressure and tracks recovered network errors',()=>{
 assert.match(audit,/firstPassDecodeFailures/)
 assert.match(audit,/retriesRecovered/)
 assert.match(audit,/Array\.from\(\{length:2\},worker\)/)
 assert.match(workflow,/node scripts\/verify-media-origin\.js/)
 assert.match(workflow,/node scripts\/browser-all-images-qa\.js/)
})
