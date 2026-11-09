import { runCatalogSync } from './catalog-sync.js'
try {
 const result=await runCatalogSync()
 console.log(JSON.stringify({ok:true,...result},null,2))
} catch (error) {
 console.error('Sync failed:',error.message)
 process.exitCode=1
}
