import test from 'node:test'
import assert from 'node:assert/strict'
import { ordersToCsv } from '../server/order-export.js'
test('CSV exports orders with correct escaping and prevents formula execution in Excel',()=>{
 const csv=ordersToCsv([{id:'CK123',created_at:'2026-11-09 12:00:00',customer:'=HYPERLINK("evil")',phone:'+84901234567',address:'12, "Main" street',items:JSON.stringify([{name:'Power Bank',qty:2}]),total:300000,status:'new'}])
 assert.ok(csv.startsWith('\ufeff'))
 assert.ok(csv.includes('"\'=HYPERLINK(""evil"")"'))
 assert.ok(csv.includes('"\'+84901234567"'))
 assert.ok(csv.includes('"12, ""Main"" street"'))
 assert.ok(csv.includes('"Power Bank x 2"'))
})
