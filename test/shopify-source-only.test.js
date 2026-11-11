import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'

const main=readFileSync(new URL('../src/main.jsx',import.meta.url),'utf8')
const workflow=readFileSync(new URL('../.github/workflows/pages.yml',import.meta.url),'utf8')
const source=readFileSync(new URL('../scripts/build-catalog-preview.js',import.meta.url),'utf8')

test('Storefront does not mix China-exclusive models with the 40 cuktech.com products',()=>{
 const reload=main.slice(main.indexOf('const reload=async()=>{'),main.indexOf(' useEffect(()=>{',main.indexOf('const reload=async()=>{')))
 assert.match(reload,/loadStaticCatalog\(\)/)
 assert.match(reload,/setProducts\(staticProducts\)/)
 assert.doesNotMatch(reload,/api\('/)
 assert.doesNotMatch(reload,/catalog\.china\.json/)
 assert.doesNotMatch(reload,/FALLBACK_PRODUCTS/)
 const catalog=main.slice(main.indexOf('function Catalog(){'),main.indexOf('function DetailPhoto('))
 assert.match(catalog,/Danh mục chính thức từ/)
 assert.doesNotMatch(catalog,/Trung Quốc \(88\)|Tất cả nguồn|source-tabs|source==='china'/)
})
test('Pages deployment only refreshes the public cuktech.com feed',()=>{
 assert.match(workflow,/node scripts\/build-catalog-preview\.js/)
 assert.match(workflow,/node scripts\/enrich-global-models\.js/)
 assert.doesNotMatch(workflow,/node scripts\/build-china-catalog\.js/)
 assert.doesNotMatch(workflow,/node scripts\/cache-china-media\.js/)
 assert.doesNotMatch(workflow,/node scripts\/match-global-photos\.js/)
})
test('Every catalog product keeps its complete source photo gallery and original product details',()=>{
 assert.match(source,/sourceDescription\(item\.body_html\)/)
 assert.match(source,/source_options:options,source_variants:variants/)
 assert.match(source,/source_images:JSON\.stringify\(photos\)/)
 assert.match(main,/className="original-product-description"/)
 assert.match(main,/Ảnh thật .* từ cuktech.com/)
})
