import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'

const storefront=readFileSync(new URL('../src/main.jsx',import.meta.url),'utf8')
const styles=readFileSync(new URL('../src/styles.css',import.meta.url),'utf8')

test('Chinese manufacturer cards use an honest missing-image state, not a fake device render',()=>{
 const start=storefront.indexOf('function ProductArt(')
 const china=storefront.indexOf("if(isChina)return",start)
 const artificial=storefront.indexOf('const isCharger=',china)
 assert.ok(start>=0&&china>start&&artificial>china)
 const early=storefront.slice(china,artificial)
 assert.match(early,/manufacturer-photo-missing/)
 assert.match(early,/Ảnh nguồn chưa tải được/)
 assert.doesNotMatch(early,/device-display|device-head|POWER BANK/)
 assert.match(styles,/\.manufacturer-photo-missing/)
})
test('Manufacturer details link to official product photos when direct photos cannot load',()=>{
 assert.match(storefront,/function DetailPhoto\(/)
 assert.match(storefront,/Xem ảnh thật trên website chính hãng/)
 assert.match(storefront,/href=\{source_site\}/)
 assert.match(storefront,/Nguồn sản phẩm:/)
 assert.match(storefront,/Xem ảnh thật tại cuktech\.com/)
 assert.match(storefront,/Album ảnh nguồn Trung Quốc có thể bị giới hạn truy cập/)
})
test('The storefront keeps real photos for global catalog while China images are audited separately',()=>{
 assert.match(storefront,/source_market===.china./)
 assert.match(storefront,/className="catalog-photo"/)
 assert.match(storefront,/manufacturer-image/)
 const chinaBuilder=readFileSync(new URL('../scripts/build-china-catalog.js',import.meta.url),'utf8')
 const mediaCache=readFileSync(new URL('../scripts/cache-china-media.js',import.meta.url),'utf8')
 assert.match(chinaBuilder,/media_delivery:'external-source-unverified',media_verified:false/)
 assert.match(mediaCache,/p\.media_verified=images\.every\(src=>cached\.has\(src\)\)/)
})
