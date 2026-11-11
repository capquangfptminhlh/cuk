import React, { useEffect, useState, useMemo, useRef, createContext, useContext } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Link, NavLink, useNavigate, useParams, useLocation } from 'react-router-dom'
import { Search, ShoppingBag, Menu, X, ArrowUpRight, ArrowRight, ArrowLeft, Plus, Minus, SlidersHorizontal, ChevronDown, Check, ShieldCheck, Truck, Headphones, Instagram, Facebook, Mail, LogOut, Package, LayoutDashboard, Save, Heart, Sparkles, Zap, ImageOff, ExternalLink } from 'lucide-react'
import './styles.css'
import {productPhotos,pickHomepageProducts} from './home-products.js'
import {loadStaticCatalog,photoCandidates} from './catalog-assets.js'

const Ctx=createContext(null)
const vn=(n)=>Number(n||0).toLocaleString('vi-VN')+'₫'
const categories=[{id:'all',label:'Tất cả sản phẩm'},{id:'powerbank',label:'Pin sạc dự phòng'},{id:'charger',label:'Củ sạc GaN'},{id:'cable',label:'Cáp & phụ kiện'},{id:'other',label:'Sản phẩm khác'}]
const categoryName=id=>categories.find(c=>c.id===id)?.label||'Sản phẩm'
// Preview catalog only: never treat prices or inventory as real before Worker deployment.
const FALLBACK_PRODUCTS=[
 ['demo-10','cuktech-10-mini','CUKTECH 10 Mini Power Bank','powerbank','mini','10000mAh','55W'],
 ['demo-air','cuktech-15-air','CUKTECH 15 Air Power Bank','powerbank','air','15000mAh','100W'],
 ['demo-20','cuktech-20-210w','CUKTECH 20 Power Bank','powerbank','powerbank','25000mAh','210W'],
 ['demo-gan','cuktech-gan-100w','CUKTECH No.10 GaN Charger','charger','charger','','100W'],
 ['demo-gan65','cuktech-gan-65w','CUKTECH 65W GaN Charger','charger','charger','','65W'],
 ['demo-station','cuktech-30-300w','CUKTECH 30 Power Bank','powerbank','station','40000mAh','300W'],
 ['demo-cable','cuktech-usbc-cable','CUKTECH USB-C Cable','cable','cable','','100W'],
 ['demo-charger','cuktech-gan-30w','CUKTECH GaN3 Charger','charger','charger','','30W']
].map(([id,slug,name,category,art,capacity,wattage])=>({
 id,slug,name,category,art,capacity,wattage,price:0,old_price:0,stock:0,
 featured:1,published:1,badge:'Bản xem trước',description:'Sản phẩm minh họa, chưa có giá và tồn kho để đặt hàng.',
 image_url:'',source_images:'[]'
}))
// GitHub Pages only hosts static assets. All customer and admin data stays in Cloudflare D1.
const API_URL=(import.meta.env.VITE_API_BASE_URL||'').replace(/\/$/,'')
const api=async(url,options={})=>{const r=await fetch(API_URL+url,{...options,headers:{'Content-Type':'application/json',...(options.headers||{})},credentials:'include'});const v=await r.json().catch(()=>({}));if(!r.ok)throw new Error(v.error||'Không kết nối được API cửa hàng');return v}
function useStore(){return useContext(Ctx)}
function StoreProvider({children}){
 const [products,setProducts]=useState([]),[demo,setDemo]=useState(true),[checkoutEnabled,setCheckoutEnabled]=useState(false),[loading,setLoading]=useState(true)
 const [cart,setCart]=useState(()=>{try{return JSON.parse(localStorage.getItem('cuktech-cart')||'[]')}catch{return[]}})
 const [drawer,setDrawer]=useState(false),[searchOpen,setSearchOpen]=useState(false)
 // The live storefront is an exact public cuktech.com catalog. Keep the separate
// China-only research feed out of the storefront: 88 additional China models
// are not part of the 40 products actually listed on cuktech.com.
// Public product photos are supplied by the static Pages deployment, not by
// api.cuktech.vn. If that unfinished API is offline, the homepage still loads.
const reload=async()=>{
 try {
  const staticProducts=await loadStaticCatalog()
  setProducts(staticProducts)
  return staticProducts
 }catch(e){
  console.error('CUKTECH static catalog unavailable:',e)
  setProducts([])
  return []
 }
}
 useEffect(()=>{
  let active=true
  reload().finally(()=>{if(active)setLoading(false)})
  // Real checkout is a separate, optional capability. Never block photos on it.
  api('/api/config',{signal:AbortSignal.timeout(2500)}).then(config=>{
   if(!active)return
   setDemo(config.demo)
   setCheckoutEnabled(config.checkoutEnabled===true)
   if(config.checkoutEnabled===true){
    api('/api/products',{signal:AbortSignal.timeout(4000)}).then(rows=>{
     if(!active||!Array.isArray(rows))return
     setProducts(current=>{
      const bySlug=new Map(rows.map(p=>[p.slug,p]))
      return current.map(p=>{
       const admin=bySlug.get(p.slug)
       return admin?{...p,
        price:Number.isInteger(admin.price)&&admin.price>0?admin.price:p.price,
        old_price:Number.isInteger(admin.old_price)?admin.old_price:p.old_price,
        stock:Number.isInteger(admin.stock)&&admin.stock>=0?admin.stock:p.stock,
        published:admin.published
       }:p
      })
     })
    }).catch(()=>setCheckoutEnabled(false))
   }
  }).catch(()=>{if(active){setDemo(true);setCheckoutEnabled(false)}})
  return ()=>{active=false}
 },[])
 useEffect(()=>localStorage.setItem('cuktech-cart',JSON.stringify(cart)),[cart])
 const add=(product,qty=1)=>{setCart(prev=>{const cur=prev.find(p=>p.id===product.id);return cur?prev.map(p=>p.id===product.id?{...p,qty:Math.min((product.stock||99),p.qty+qty)}:p):[...prev,{id:product.id,qty:Math.min(qty,product.stock||99)}]});setDrawer(true)}
 const qty=(id,newQty)=>setCart(prev=>prev.map(p=>p.id===id?{...p,qty:newQty}:p).filter(p=>p.qty>0))
 const detailed=cart.map(c=>({...c,product:products.find(p=>p.id===c.id)})).filter(c=>c.product)
 const total=detailed.reduce((sum,c)=>sum+c.product.price*c.qty,0)
 const value={products,loading,demo,checkoutEnabled,cart,drawer,setDrawer,searchOpen,setSearchOpen,add,qty,detailed,total,reload,clearCart:()=>setCart([])}
 return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}
function ProductArt({art='powerbank',dark=false,large=false,image_url='',source_market='',name='',source_images='',original_image_url='',original_source_images=''}) {
 const gallery=useMemo(()=>photoCandidates({image_url,source_images,original_image_url,original_source_images}),[image_url,source_images,original_image_url,original_source_images])
 const [fallbackIndex,setFallbackIndex]=useState(0)
 useEffect(()=>setFallbackIndex(0),[image_url,source_images,original_image_url,original_source_images])
 const [photoFailed,setPhotoFailed]=useState(false)
 useEffect(()=>setPhotoFailed(false),[image_url])
 const isChina=source_market==='china'
 // Never replace a failed manufacturer image with a fabricated battery. Every
 // product has an exact model name; the image slot must tell the truth.
 if(isChina)return <div className={'manufacturer-photo '+(large?'manufacturer-photo-large':'')}>
  {image_url&&!photoFailed&&<img className="catalog-photo manufacturer-image" src={image_url} alt={'Ảnh gốc '+name} loading="lazy" decoding="async" referrerPolicy="no-referrer" onError={()=>setPhotoFailed(true)} />}
  {(!image_url||photoFailed)&&<div className="manufacturer-photo-missing">
   <ImageOff size={large?40:31} strokeWidth={1.5}/>
   <strong>Ảnh nguồn chưa tải được</strong>
   <span>{name||'CUKTECH'}</span>
   <small>Chọn sản phẩm để xem ảnh trên trang hãng</small>
  </div>}
 </div>
 if(source_market==='global')return <div className={'manufacturer-photo '+(large?'manufacturer-photo-large':'')}>
  {gallery[fallbackIndex]&&<img className="catalog-photo manufacturer-image" src={gallery[fallbackIndex]} alt={'Ảnh thật '+name+' từ cuktech.com'} loading="lazy" decoding="async" referrerPolicy="no-referrer" onError={()=>setFallbackIndex(i=>i+1)}/>}
  {!gallery[fallbackIndex]&&<div className="manufacturer-photo-missing">
   <ImageOff size={large?40:31} strokeWidth={1.5}/>
   <strong>Ảnh sản phẩm đang cập nhật</strong>
   <span>{name||'CUKTECH'}</span>
   <small>Không dùng ảnh minh họa của sản phẩm khác</small>
  </div>}
 </div>

 const isCharger=art==='charger',isCable=art==='cable',isStation=art==='station'
 return <div className={'device-stage '+(large?'device-large ':'')+(dark?'device-on-dark':'')} aria-label="Hình minh họa sản phẩm">
  <div className={'device '+(isCharger?'device-charger':isCable?'device-cable':isStation?'device-station':'device-'+art)}>
   {!isCable&&<><div className="device-head"><span>CUKTECH</span>{!isCharger&&<div className="device-display"><strong>98</strong><small>%<i></i><i></i></small></div>}</div><div className="device-body"><span className="device-numeral">{art==='air'?'15':art==='mini'?'10':isStation?'30':isCharger?'GaN':'20'}</span>{!isCharger&&<small>POWER BANK</small>}</div></>}
   {isCable&&<><div className="cable-wire"/><div className="cable-plug first"/><div className="cable-plug second"/></>}
  </div>
  <div className="device-shadow"/>
  {image_url&&<img className="catalog-photo" alt="Hình sản phẩm CUKTECH" loading="lazy" referrerPolicy="no-referrer" src={image_url} onError={e=>{e.currentTarget.style.display='none'}}/>}
 </div>
}
function Header(){
 const {cart,setDrawer,searchOpen,setSearchOpen,demo,checkoutEnabled}=useStore(),[menu,setMenu]=useState(false),loc=useLocation()
 useEffect(()=>{setMenu(false);setSearchOpen(false);window.scrollTo({top:0,behavior:'instant'})},[loc.pathname,loc.search])
 return <><div className="announcement">KHÁM PHÁ SỨC MẠNH SẠC NHANH THẾ HỆ MỚI <ArrowRight size={12}/></div>
  <header className="header"><div className="nav-wrap">
   <button className="icon-btn mobile-only" aria-label="Mở menu" onClick={()=>setMenu(true)}><Menu/></button>
   <Link className="wordmark" to="/">CUKTECH<span className="brand-dot">.</span><small>VIETNAM STORE</small></Link>
   <nav className="main-nav"><NavLink to="/">Trang chủ</NavLink><NavLink to="/shop">Tất cả sản phẩm</NavLink><NavLink to="/shop?category=powerbank">Pin dự phòng</NavLink><NavLink to="/shop?category=charger">Củ sạc</NavLink><NavLink to="/shop?category=cable">Phụ kiện</NavLink></nav>
   <div className="nav-actions"><button className="icon-btn" aria-label="Tìm kiếm" onClick={()=>setSearchOpen(!searchOpen)}><Search size={21}/></button><button className="icon-btn cart-icon" aria-label="Giỏ hàng" onClick={()=>setDrawer(true)}><ShoppingBag size={21}/>{cart.length>0&&<span className="cart-count">{cart.reduce((a,b)=>a+b.qty,0)}</span>}</button></div>
  </div></header>
  {(!checkoutEnabled||demo)&&<div className="demo-warning">CỬA HÀNG ĐANG HOÀN THIỆN: Giá và tồn kho minh họa; hiện chưa nhận đơn hàng thật.</div>}
  {searchOpen&&<SearchOverlay close={()=>setSearchOpen(false)}/>}
  {menu&&<div className="overlay-layer" onClick={()=>setMenu(false)}><aside className="mobile-menu" onClick={e=>e.stopPropagation()}><div className="drawer-top"><b>CUKTECH.</b><button className="icon-btn" aria-label="Đóng menu" onClick={()=>setMenu(false)}><X/></button></div>{categories.map(c=><Link key={c.id} to={c.id==='all'?'/shop':'/shop?category='+c.id} onClick={()=>setMenu(false)}>{c.label}<ArrowUpRight size={18}/></Link>)}<Link to="/about" onClick={()=>setMenu(false)}>Giới thiệu<ArrowUpRight size={18}/></Link></aside></div>}
 </>
}
function SearchOverlay({close}){const [term,setTerm]=useState(''),{products}=useStore(),nav=useNavigate();const results=products.filter(p=>p.name.toLowerCase().includes(term.toLowerCase())).slice(0,5);return <div className="search-box"><div className="search-inner"><Search size={23}/><input autoFocus value={term} onChange={e=>setTerm(e.target.value)} onKeyDown={e=>{if(e.key==='Enter'){close();nav('/shop?q='+encodeURIComponent(term))}}} placeholder="Tìm kiếm sản phẩm CUKTECH..."/><button className="icon-btn" onClick={close} aria-label="Đóng"><X/></button></div>{term&&<div className="search-suggest">{results.length?results.map(p=><Link onClick={close} key={p.id} to={'/product/'+p.slug}><span>{p.name}</span><span>{vn(p.price)} <ArrowUpRight size={15}/></span></Link>):<p>Không tìm thấy sản phẩm</p>}</div>}</div>}
function CartDrawer(){const {drawer,setDrawer,detailed,total,qty,checkoutEnabled}=useStore(),nav=useNavigate();if(!drawer)return null;return <div className="overlay-layer" onMouseDown={()=>setDrawer(false)}><aside className="cart-drawer" onMouseDown={e=>e.stopPropagation()}><div className="drawer-top"><div><span className="overline">GIỎ HÀNG CỦA BẠN</span><h2>{detailed.length?`${detailed.length} sản phẩm`:'Giỏ hàng trống'}</h2></div><button className="icon-btn" onClick={()=>setDrawer(false)}><X/></button></div><div className="drawer-items">{detailed.length?detailed.map(c=><div className="drawer-item" key={c.id}><div className="tiny-art"><ProductArt art={c.product.art} image_url={c.product.image_url} name={c.product.name} source_market={c.product.source_market}/></div><div className="drawer-item-info"><Link onClick={()=>setDrawer(false)} to={'/product/'+c.product.slug}>{c.product.name}</Link><strong>{vn(c.product.price)}</strong><div className="stepper"><button onClick={()=>qty(c.id,c.qty-1)}>-</button><span>{c.qty}</span><button disabled={c.qty>=c.product.stock} onClick={()=>qty(c.id,c.qty+1)}>+</button></div></div></div>):<div className="empty-cart"><ShoppingBag size={43}/><p>Chưa có sản phẩm nào trong giỏ.</p><button className="btn btn-black" onClick={()=>{setDrawer(false);nav('/shop')}}>Khám phá sản phẩm <ArrowRight size={17}/></button></div>}</div>{detailed.length>0&&<div className="drawer-bottom"><div className="total-line"><span>Tạm tính</span><strong>{vn(total)}</strong></div><p>Phí giao hàng sẽ được xác nhận khi xử lý đơn.</p><button disabled={!checkoutEnabled} className="btn btn-black full" onClick={()=>{setDrawer(false);nav('/checkout')}}>{checkoutEnabled?'ĐẶT HÀNG NGAY':'CỬA HÀNG CHƯA MỞ NHẬN ĐƠN'} <ArrowRight size={17}/></button><button className="text-link" onClick={()=>setDrawer(false)}>Tiếp tục mua sắm</button></div>}</aside></div>}
/**
 * Homepage photography always comes from actual cuktech.com catalog records.
 * On a broken CDN image we try the next verified source photo, never show
 * the old artificial power-bank/cable/charger drawings.
 */
function HomeProductPhoto({product,variant='category',eager=false}) {
 const gallery=useMemo(()=>photoCandidates(product),[product])
 const [photoIndex,setPhotoIndex]=useState(0)
 useEffect(()=>setPhotoIndex(0),[product?.id])
 const image=gallery[photoIndex]
 return <div className={'home-real-photo home-real-photo-'+variant}>
  {image?<img className="home-real-img" src={image} alt={'Ảnh sản phẩm thật: '+product.name} decoding="async" loading={eager?'eager':'lazy'} fetchPriority={eager?'high':undefined} referrerPolicy="no-referrer" onError={()=>setPhotoIndex(i=>i+1)}/>:
   <div className="home-photo-unavailable"><ImageOff size={27} strokeWidth={1.6}/><span>{product?'Ảnh sản phẩm chưa tải được':'Đang cập nhật danh mục'}</span><small>{product?.name||'CUKTECH'}</small></div>}
 </div>
}
function Hero({product,loading}) {
 return <section className="hero hero-source-real">
  <div className="hero-copy">
   <div className="eyebrow"><span className="pulse-dot"/> SẢN PHẨM CHÍNH HÃNG TỪ CUKTECH.COM</div>
   <h1>Năng lượng.<br/><span>Đúng chuẩn.</span><br/>CUKTECH.</h1>
   <p>Khám phá sản phẩm CUKTECH với ảnh và thông tin lấy trực tiếp từ danh mục công khai của hãng. Giá và tồn kho Việt Nam được xác nhận riêng.</p>
   <div className="hero-actions">
    <Link className="btn btn-white" to={product?'/product/'+product.slug:'/shop'}>{product?'Xem sản phẩm nổi bật':'Khám phá sản phẩm'} <ArrowUpRight size={18}/></Link>
    <a className="hero-scroll" href="#featured">Xem ảnh thật <ArrowRight size={16}/></a>
   </div>
  </div>
  <div className="hero-visual hero-real-visual">
   <div className="hero-orbit orb-a"/><div className="hero-orbit orb-b"/>
   <HomeProductPhoto product={product} variant="hero" eager/>
   {product&&<Link className="hero-spec hero-source-product" to={'/product/'+product.slug}>
    <strong>{product.name}</strong><span>{[product.capacity,product.wattage].filter(Boolean).join(' · ')||'Xem thông số sản phẩm'} <ArrowUpRight size={14}/></span>
   </Link>}
   {loading&&<span className="hero-loading-label">Đang tải sản phẩm từ cuktech.com…</span>}
  </div>
  <div className="hero-index">CUKTECH <span>/ ORIGINAL PRODUCT PHOTOS</span></div>
 </section>
}
function SectionTitle({eyebrow,title,description,to='/shop'}){return <div className="section-heading"><div><span className="overline">{eyebrow}</span><h2>{title}</h2>{description&&<p>{description}</p>}</div><Link className="underlined-link" to={to}>Xem tất cả <ArrowUpRight size={16}/></Link></div>}
function ProductCard({product}){const {add}=useStore();return <div className="product-card"><Link className="product-visual" to={'/product/'+product.slug}>{product.badge&&<span className="product-badge">{product.badge}</span>}<ProductArt art={product.art} image_url={product.image_url} source_images={product.source_images} original_image_url={product.original_image_url} original_source_images={product.original_source_images} name={product.name} source_market={product.source_market}/><span className="quick-view">Xem chi tiết <ArrowUpRight size={15}/></span></Link><div className="product-meta"><span className="category-kicker">{categoryName(product.category)}</span><Link to={'/product/'+product.slug}><h3>{product.name}</h3></Link><div className="product-specs">{product.capacity} {product.capacity&&product.wattage?' · ':''}{product.wattage}</div><div className="product-price"><strong>{product.price>0?vn(product.price):'Liên hệ'}</strong>{product.old_price>product.price&&<del>{vn(product.old_price)}</del>}</div><button disabled={product.stock<=0||product.price<=0} className="add-card" aria-label={'Thêm '+product.name+' vào giỏ'} onClick={()=>add(product)}><Plus size={21}/></button></div></div>}
function Home(){
 const {products,loading}=useStore()
 const {hero,split,categoryCards,featured,chargers}=useMemo(()=>pickHomepageProducts(products),[products])
 const categoriesOnHome=[
  {category:'powerbank',index:'01 / POWER BANK',name:'Pin dự phòng',className:'cat-dark',product:categoryCards.powerbank},
  {category:'charger',index:'02 / CHARGER',name:'Củ sạc GaN',className:'cat-light',product:categoryCards.charger},
  {category:'cable',index:'03 / ACCESSORIES',name:'Cáp & phụ kiện',className:'cat-silver',product:categoryCards.cable}
 ]
 return <main>
  <Hero product={hero} loading={loading}/>
  <section className="section content-wrap" id="featured">
   <SectionTitle eyebrow="ẢNH THẬT TỪ CUKTECH.COM" title="Sản phẩm nổi bật" description="Hình ảnh và mã sản phẩm đúng theo danh mục công khai của hãng."/>
   {loading?<div className="skeleton-row">Đang tải sản phẩm...</div>:featured.length?
    <div className="product-grid">{featured.map(p=><ProductCard key={p.id} product={p}/>)}</div>:
    <p className="home-source-empty">Danh mục từ cuktech.com hiện chưa tải được. Không sử dụng ảnh hoặc sản phẩm minh họa thay thế.</p>}
  </section>
  <section className="split-feature">
   <div className="split-copy"><span className="overline">CUKTECH / POWER BANK</span>
    <h2>Nhẹ hơn.<br/>Mạnh hơn.<br/><em>Năng lượng thật.</em></h2>
    <p>Khám phá sản phẩm pin sạc dự phòng cùng ảnh chụp, model và thông số từ nguồn chính thức.</p>
    <Link className="btn btn-black" to={split?'/product/'+split.slug:'/shop?category=powerbank'}>
     {split?'Xem '+split.name:'Khám phá pin dự phòng'} <ArrowUpRight size={18}/>
    </Link>
   </div>
   <div className="split-art split-source-photo">
    <span className="giant-type" aria-hidden="true">POWER</span>
    <HomeProductPhoto product={split} variant="split"/>
    {split&&<span className="split-product-name">{split.name}</span>}
   </div>
  </section>
  <section className="section content-wrap">
   <SectionTitle eyebrow="CHỌN ĐÚNG SẢN PHẨM" title="Khám phá theo danh mục" to="/shop"/>
   <div className="category-grid">
    {categoriesOnHome.map(item=><Link key={item.category} className={'category-card home-category-real '+item.className} to={item.product?'/product/'+item.product.slug:'/shop?category='+item.category}>
     <div className="cat-label"><span>{item.index}</span><h3>{item.name}</h3><span className="cat-cta">{item.product?'Xem sản phẩm thật':'Xem danh mục'} <ArrowUpRight size={16}/></span></div>
     <HomeProductPhoto product={item.product} variant="category"/>
     {item.product&&<div className="home-category-model">{item.product.name}</div>}
    </Link>)}
   </div>
  </section>
  <section className="story-banner">
   <div><span className="overline">ĐÚNG NGUỒN · ĐÚNG HÌNH</span>
    <h2>Không phải ảnh mẫu.<br/>Là sản phẩm thật.</h2>
    <p>Toàn bộ ảnh sản phẩm trên trang chủ được chọn từ danh mục cuktech.com. Không dùng mô hình minh họa thay cho hàng thật.</p>
    <Link className="btn btn-white" to="/shop">Khám phá danh mục <ArrowUpRight size={18}/></Link>
   </div>
   {categoryCards.charger&&<div className="story-real-photo"><HomeProductPhoto product={categoryCards.charger} variant="story"/><span>{categoryCards.charger.name}</span></div>}
  </section>
  <section className="section content-wrap">
   <SectionTitle eyebrow="NGUỒN CUKTECH.COM" title="Sạc nhanh GaN" to="/shop?category=charger"/>
   {chargers.length?<div className="product-grid">{chargers.map(p=><ProductCard key={p.id} product={p}/>)}</div>:
    <p className="home-source-empty">Chưa có sản phẩm củ sạc có ảnh được xác minh trong danh mục nguồn.</p>}
  </section>
  <TrustStrip/><Newsletter/>
 </main>
}
function TrustStrip(){return <section className="trust-strip"><div className="content-wrap trust-inner"><div><Zap/><strong>Công nghệ sạc nhanh</strong><span>Hiệu năng tối ưu cho thiết bị tương thích</span></div><div><ShieldCheck/><strong>Thông tin minh bạch</strong><span>Kiểm tra thông số trước khi mua</span></div><div><Truck/><strong>Hỗ trợ giao hàng</strong><span>Xác nhận phí và thời gian sau khi đặt</span></div><div><Headphones/><strong>Hỗ trợ đơn hàng</strong><span>Liên hệ cửa hàng để được tư vấn</span></div></div></section>}
function Newsletter(){const [email,setEmail]=useState(''),[message,setMessage]=useState('');const submit=async e=>{e.preventDefault();try{await api('/api/newsletter',{method:'POST',body:JSON.stringify({email})});setMessage('Cảm ơn bạn đã đăng ký!');setEmail('')}catch(e){setMessage(e.message)}};return <section className="newsletter"><div className="content-wrap newsletter-inner"><div><span className="overline">LUÔN ĐI TRƯỚC MỘT BƯỚC</span><h2>Đừng bỏ lỡ điều mới.</h2><p>Cập nhật dòng sản phẩm và thông tin ưu đãi từ cửa hàng.</p></div><form onSubmit={submit}><div className="newsletter-input"><Mail size={20}/><input type="email" required value={email} onChange={e=>setEmail(e.target.value)} placeholder="Nhập email của bạn"/><button type="submit">Đăng ký <ArrowRight size={18}/></button></div>{message&&<small role="status">{message}</small>}</form></div></section>}
function Catalog(){const {products}=useStore(),loc=useLocation(),nav=useNavigate();const params=new URLSearchParams(loc.search),cat=params.get('category')||'all',q=params.get('q')||'',sort=params.get('sort')||'featured';const [query,setQuery]=useState(q);useEffect(()=>setQuery(q),[q]);const page=1,perPage=1000;const filtered=useMemo(()=>{let a=products.filter(p=>(cat==='all'||p.category===cat)&&(p.name+' '+(p.source_description||'')+' '+(p.source_model_codes||[]).join(' ')).toLocaleLowerCase('vi').includes(q.toLocaleLowerCase('vi')));return a.sort((a,b)=>sort==='price-asc'?a.price-b.price:sort==='price-desc'?b.price-a.price:sort==='name'?a.name.localeCompare(b.name):b.featured-a.featured)},[products,cat,q,sort]);const pages=Math.max(1,Math.ceil(filtered.length/perPage)),currentPage=Math.min(page,pages),pageProducts=filtered.slice((currentPage-1)*perPage,currentPage*perPage);const edit=(key,value)=>{const p=new URLSearchParams(loc.search);if(key!=='page')p.delete('page');value?p.set(key,value):p.delete(key);nav('/shop'+(p.toString()?'?'+p.toString():''))};return <main><div className="catalog-hero"><div className="content-wrap"><span className="overline">CUKTECH.COM / OFFICIAL PRODUCT CATALOG</span><h1>{cat==='all'?'Sản phẩm CUKTECH':categoryName(cat)}</h1><p>Danh mục sản phẩm và ảnh thật từ cuktech.com, không lẫn mẫu từ thị trường khác.</p></div></div><div className="content-wrap catalog-main"><div className="catalog-toolbar"><span>{filtered.length} sản phẩm</span><div className="toolbar-actions"><div className="catalog-search"><Search size={17}/><input value={query} placeholder="Tìm sản phẩm..." onChange={e=>setQuery(e.target.value)} onKeyDown={e=>{if(e.key==='Enter')edit('q',query)}}/><button onClick={()=>edit('q',query)} aria-label="Tìm"><ArrowRight size={16}/></button></div><label><SlidersHorizontal size={17}/><select value={sort} onChange={e=>edit('sort',e.target.value)}><option value="featured">Nổi bật</option><option value="price-asc">Giá thấp đến cao</option><option value="price-desc">Giá cao đến thấp</option><option value="name">Tên A–Z</option></select></label></div></div><p className="catalog-origin-notice">Danh mục chính thức từ <a href="https://cuktech.com/collections/all" target="_blank" rel="noopener noreferrer">cuktech.com</a>. Toàn bộ sản phẩm công khai, album ảnh và mô tả gốc được đồng bộ; giá và tồn kho Việt Nam sẽ được xác nhận riêng.</p><div className="category-tabs">{categories.map(c=><button key={c.id} className={cat===c.id?'active':''} onClick={()=>edit('category',c.id==='all'?'':c.id)}>{c.label}</button>)}</div>{filtered.length?<div className="product-grid catalog-grid">{pageProducts.map(p=><ProductCard key={p.id} product={p}/>)}</div>:<div className="no-results">Không có sản phẩm phù hợp. <button onClick={()=>nav('/shop')}>Xem tất cả</button></div>}{pages>1&&<nav className="pagination" aria-label="Phân trang sản phẩm"><button disabled={currentPage===1} onClick={()=>edit('page',String(currentPage-1))}>‹ Trang trước</button><span>Trang {currentPage} / {pages}</span><button disabled={currentPage===pages} onClick={()=>edit('page',String(currentPage+1))}>Trang sau ›</button></nav>}</div><Newsletter/></main>}
function DetailPhoto({src,name,art,source_market='',source_site=''}) {
 const [failed,setFailed]=useState(false)
 useEffect(()=>setFailed(false),[src])
 if(!src||failed)return source_market==='china'?
  <div className="manufacturer-detail-missing"><ImageOff size={45} strokeWidth={1.4}/><strong>Ảnh sản phẩm chưa tải được từ CUKTECH Trung Quốc</strong><p>{name}</p>
   {source_site&&<a className="official-photo-link" href={source_site} target="_blank" rel="noopener noreferrer">Xem ảnh thật trên website chính hãng <ExternalLink size={16}/></a>}
  </div>:<div className="manufacturer-detail-missing"><ImageOff size={45} strokeWidth={1.4}/><strong>Ảnh chính của sản phẩm hiện chưa tải được</strong><p>{name}</p>{source_site&&<a className="official-photo-link" href={source_site} target="_blank" rel="noopener noreferrer">Xem ảnh thật tại cuktech.com <ExternalLink size={16}/></a>}</div>
 return <img className="detail-real-photo" src={src} alt={name} loading="eager" decoding="async" referrerPolicy="no-referrer" onError={()=>setFailed(true)}/>
}
function Product(){const {slug}=useParams(),{products,loading,add}=useStore(),[amount,setAmount]=useState(1),[tab,setTab]=useState('description'),[photoIndex,setPhotoIndex]=useState(0);const product=products.find(p=>p.slug===slug);const photos=useMemo(()=>photoCandidates(product),[product]);useEffect(()=>{setAmount(1);setTab('description');setPhotoIndex(0)},[slug]);if(loading)return <div className="content-wrap page-space">Đang tải...</div>;if(!product)return <div className="content-wrap page-space"><h2>Không tìm thấy sản phẩm</h2><Link to="/shop">Quay lại cửa hàng</Link></div>;return <main><div className="content-wrap product-layout"><div className="product-gallery"><div className="product-photo">{photos.length?<DetailPhoto src={photos[Math.min(photoIndex,photos.length-1)]} name={product.name} art={product.art} source_market={product.source_market} source_site={product.source_site}/>:<ProductArt art={product.art} large/>}</div><div className="gallery-thumbs">{photos.length?photos.map((src,i)=><button type="button" key={src} className={photoIndex===i?"selected":""} onClick={()=>setPhotoIndex(i)} aria-label={'Xem ảnh sản phẩm '+(i+1)}><img src={src} loading="lazy" decoding="async" referrerPolicy="no-referrer" alt="" onError={e=>{e.currentTarget.closest('button').style.display='none'}} /></button>):<><div className="selected"><ProductArt art={product.art}/></div><div className="product-symbol">{product.wattage||'CUKTECH'}</div><div className="product-symbol">{product.capacity||'GaN'}</div></>}</div></div><div className="product-details"><div className="breadcrumbs"><Link to="/">Trang chủ</Link><span>/</span><Link to={'/shop?category='+product.category}>{categoryName(product.category)}</Link><span>/</span>{product.name}</div>{product.badge&&<span className="detail-badge">{product.badge}</span>}<h1>{product.name}</h1><p className="detail-lead">{(product.source_description||product.description||'').split('\n')[0].slice(0,250)}</p>{product.source_site&&<p className="product-source-note">Nguồn sản phẩm: <a href={product.source_site} target="_blank" rel="noopener noreferrer">{product.source_market==='china'?'CUKTECH Trung Quốc':'cuktech.com'} <ArrowUpRight size={13}/></a> · Giá và tồn kho tại Việt Nam đang được xác nhận.</p>}{product.media_delivery==='global-shopify-exact-model'&&<p className="product-source-note">Ảnh từ <a href={product.photo_source_site} target="_blank" rel="noopener noreferrer">cuktech.com <ArrowUpRight size={13}/></a>, đã đối chiếu chính xác mã model. Giá và tồn kho tại Việt Nam chưa được xác nhận.</p>}<div className="detail-price">{product.price>0?vn(product.price):'Liên hệ'}{product.old_price>product.price&&<del>{vn(product.old_price)}</del>}</div><div className="spec-pills">{product.capacity&&<span>{product.capacity}</span>}{product.wattage&&<span>Sạc nhanh {product.wattage}</span>}<span>{product.stock>0?'Còn '+product.stock+' sản phẩm':'Hết hàng'}</span></div><div className="detail-quantity"><span>Số lượng</span><div className="stepper big"><button onClick={()=>setAmount(a=>Math.max(1,a-1))}><Minus size={16}/></button><strong>{amount}</strong><button disabled={amount>=product.stock} onClick={()=>setAmount(a=>Math.min(product.stock,a+1))}><Plus size={16}/></button></div></div><button className="btn btn-black full product-add" disabled={!product.stock||!product.price} onClick={()=>add(product,amount)}>THÊM VÀO GIỎ HÀNG <ShoppingBag size={19}/></button><div className="detail-points"><p><Check size={17}/> Thanh toán khi nhận hàng (COD)</p><p><Check size={17}/> Hỗ trợ xác nhận đơn hàng</p><p><Check size={17}/> Thông số sản phẩm có thể thay đổi theo phiên bản</p></div></div></div><div className="content-wrap product-extra"><div className="tab-header"><button className={tab==='description'?'active':''} onClick={()=>setTab('description')}>Mô tả</button><button className={tab==='spec'?'active':''} onClick={()=>setTab('spec')}>Thông số kỹ thuật</button></div>{tab==='description'?<div className="original-product-description"><p>{product.source_description||product.description||'Nguồn chưa cung cấp mô tả sản phẩm.'}</p><small>Thông tin tham khảo từ trang sản phẩm CUKTECH. Giá bán và tồn kho Việt Nam được quản lý riêng.</small></div>:<div className="spec-table"><div><span>Model</span><b>{product.name}</b></div><div><span>Phân loại</span><b>{categoryName(product.category)}</b></div><div><span>Dung lượng</span><b>{product.capacity||'Không áp dụng'}</b></div><div><span>Công suất</span><b>{product.wattage||'Đang cập nhật'}</b></div>{product.source_model_codes?.length>0&&<div><span>Mã model từ nguồn</span><b>{product.source_model_codes.join(', ').toUpperCase()}</b></div>}{product.source_product_type&&<div><span>Loại sản phẩm gốc</span><b>{product.source_product_type}</b></div>}{Array.isArray(product.source_options)&&product.source_options.map((option,i)=><div key={i}><span>{option.name}</span><b>{option.values.join(' / ')}</b></div>)}{Array.isArray(product.source_variants)&&product.source_variants.length>0&&<div><span>Phiên bản từ nguồn</span><b>{product.source_variants.map(v=>v.title||v.sku).filter(Boolean).join(' / ')}</b></div>}</div>}</div>{product.source_market==='china'&&!['optimized-first-party-webp','global-shopify-exact-model'].includes(product.media_delivery)?
 <div className="content-wrap source-gallery-warning"><ImageOff size={22}/><p>Album ảnh nguồn Trung Quốc có thể bị giới hạn truy cập từ website khác. Không dùng ảnh minh họa thay cho hàng thật.</p>{product.source_site&&<a href={product.source_site} target="_blank" rel="noopener noreferrer">Xem album chính hãng <ExternalLink size={16}/></a>}</div>
 :photos.length>1&&<details className="full-gallery content-wrap"><summary>Xem toàn bộ {photos.length} ảnh sản phẩm và thông số từ nguồn</summary><div className="full-gallery-images">{photos.map((src,i)=><img src={src} key={src} alt={product.name+' — ảnh '+(i+1)} loading="lazy" decoding="async" referrerPolicy="no-referrer"/>)}</div></details>}<div className="section content-wrap"><SectionTitle eyebrow="DÀNH CHO BẠN" title="Khám phá thêm"/><div className="product-grid">{products.filter(p=>p.category===product.category&&p.id!==product.id).slice(0,4).map(p=><ProductCard product={p} key={p.id}/>)}</div></div></main>}
function Checkout(){const {detailed,total,clearCart,reload,checkoutEnabled}=useStore(),nav=useNavigate(),[form,setForm]=useState({customer:'',phone:'',address:'',note:''}),[error,setError]=useState(''),[sending,setSending]=useState(false),attempt=useRef(null);async function submit(e){e.preventDefault();if(!checkoutEnabled){setError('Cửa hàng chưa mở nhận đơn thật');return}setSending(true);setError('');try{const payload=JSON.stringify({...form,items:detailed.map(c=>({id:c.id,qty:c.qty}))});if(attempt.current?.payload!==payload)attempt.current={payload,key:globalThis.crypto?.randomUUID?.()||('ck-'+Date.now().toString(36)+'-'+Math.random().toString(36).slice(2))};const order=await api('/api/orders',{method:'POST',headers:{'Idempotency-Key':attempt.current.key},body:payload});attempt.current=null;clearCart();reload();nav('/success/'+order.id,{state:{total:order.total}})}catch(e){setError(e.message)}finally{setSending(false)}}return <main className="checkout-page"><div className="content-wrap"><div className="breadcrumbs"><Link to="/">Trang chủ</Link><span>/</span><Link to="/shop">Cửa hàng</Link><span>/</span>Thanh toán</div><h1>Thông tin đặt hàng</h1><div className="checkout-grid"><form className="checkout-form" onSubmit={submit}><h2>Thông tin nhận hàng</h2><label>Họ và tên *<input required minLength={2} maxLength={100} value={form.customer} onChange={e=>setForm({...form,customer:e.target.value})} placeholder="Nguyễn Văn A"/></label><label>Số điện thoại *<input required type="tel" value={form.phone} onChange={e=>setForm({...form,phone:e.target.value})} placeholder="09xxxxxxxx"/></label><label>Địa chỉ giao hàng đầy đủ *<textarea required minLength={12} maxLength={500} value={form.address} onChange={e=>setForm({...form,address:e.target.value})} placeholder="Số nhà, đường, phường/xã, tỉnh/thành phố"/></label><label>Ghi chú đơn hàng<textarea maxLength={1000} value={form.note} onChange={e=>setForm({...form,note:e.target.value})} placeholder="Yêu cầu giao hàng..."/></label><div className="payment-method"><Check size={17}/> Thanh toán khi nhận hàng (COD)</div>{!checkoutEnabled&&<p role="status" className="form-error">Đặt hàng tạm khóa. Website đang cấu hình giá bán và tồn kho thực tế.</p>}{error&&<p role="alert" className="form-error">{error}</p>}<button disabled={!checkoutEnabled||sending||!detailed.length} className="btn btn-black full">{sending?'Đang xử lý...':'XÁC NHẬN ĐẶT HÀNG'} <ArrowRight size={18}/></button><p className="form-note">Đơn hàng chưa thu tiền trực tuyến. Cửa hàng xác nhận phí vận chuyển trước khi giao.</p></form><aside className="checkout-summary"><h2>Đơn hàng của bạn</h2>{detailed.length?detailed.map(c=><div className="summary-item" key={c.id}><div className="tiny-art"><ProductArt art={c.product.art} image_url={c.product.image_url}/></div><div><b>{c.product.name}</b><small>SL: {c.qty}</small></div><strong>{vn(c.product.price*c.qty)}</strong></div>):<p>Giỏ hàng trống. <Link to="/shop">Mua sắm ngay</Link></p>}<div className="summary-total"><span>Tổng tạm tính</span><strong>{vn(total)}</strong></div><p className="form-note">Chưa bao gồm chi phí vận chuyển.</p></aside></div></div></main>}
function Success(){const {id}=useParams(),loc=useLocation();return <main className="success-page"><div className="success-mark"><Check size={52}/></div><span className="overline">ĐÃ GHI NHẬN ĐƠN HÀNG</span><h1>Cảm ơn bạn!</h1><p>Đơn hàng đã được ghi nhận. Cửa hàng sẽ liên hệ theo số điện thoại đã cung cấp để xác nhận.</p><div className="order-code">Mã đơn: <b>{id}</b></div>{loc.state?.total&&<div className="success-total">Tạm tính: {vn(loc.state.total)}</div>}<Link to="/shop" className="btn btn-black">Tiếp tục mua sắm <ArrowRight size={18}/></Link></main>}
function About(){return <main><section className="about-hero"><div className="content-wrap"><span className="overline">ABOUT CUKTECH</span><h1>Năng lượng để<br/>luôn tiến về phía trước.</h1><p>Khám phá lựa chọn phụ kiện sạc hiện đại dành cho cuộc sống năng động.</p></div><div className="about-glow"/></section><section className="content-wrap about-copy"><div><span className="overline">CỬA HÀNG CUKTECH VIỆT NAM</span><h2>Công nghệ thực tế.<br/>Trải nghiệm tinh gọn.</h2></div><div><p>CUKTECH VN là website giới thiệu và bán sản phẩm phụ kiện CUKTECH tại Việt Nam. Đây là dự án cửa hàng độc lập và chưa xác nhận tư cách nhà phân phối/đại lý được ủy quyền.</p><p>Thông tin địa chỉ pháp lý, chính sách giao hàng, đổi trả và bảo hành sẽ được chủ cửa hàng bổ sung trước khi chính thức kinh doanh.</p><Link className="btn btn-black" to="/shop">Xem sản phẩm <ArrowUpRight size={17}/></Link></div></section></main>}
function Policy(){return <main className="content-wrap policy-page"><span className="overline">THÔNG TIN CỬA HÀNG</span><h1>Chính sách & liên hệ</h1><div><h2>Thông tin liên hệ</h2><p>Đang cập nhật số điện thoại, địa chỉ và pháp nhân của cửa hàng.</p><h2>Đặt hàng & thanh toán</h2><p>Đơn hàng được tiếp nhận qua website và thanh toán COD. Nhân viên xác nhận thông tin và phí vận chuyển trước khi giao.</p><h2>Giao hàng, đổi trả & bảo hành</h2><p>Chính sách cụ thể cần được chủ cửa hàng thiết lập và công bố trước khi nhận đơn thực tế. Không áp dụng mặc định các cam kết trên website bên thứ ba.</p><h2>Quyền riêng tư</h2><p>Dữ liệu người nhận hàng chỉ dùng để tiếp nhận, xác nhận và xử lý đơn. Quản trị viên chịu trách nhiệm bảo mật hạ tầng và dữ liệu lưu trữ.</p></div></main>}
function Footer(){return <footer className="footer"><div className="content-wrap footer-main"><div className="footer-brand"><Link className="wordmark" to="/">CUKTECH<span className="brand-dot">.</span><small>VIETNAM STORE</small></Link><p>Sạc năng lượng.<br/>Mở mọi khả năng.</p><span>Website bán hàng độc lập. Thông tin pháp lý đang cập nhật.</span></div><div><h4>Sản phẩm</h4><Link to="/shop">Tất cả sản phẩm</Link><Link to="/shop?category=powerbank">Pin dự phòng</Link><Link to="/shop?category=charger">Củ sạc GaN</Link><Link to="/shop?category=cable">Cáp & phụ kiện</Link></div><div><h4>Hỗ trợ</h4><Link to="/policy">Thông tin giao hàng</Link><Link to="/policy">Đổi trả & bảo hành</Link><Link to="/policy">Chính sách riêng tư</Link><Link to="/policy">Liên hệ</Link></div><div><h4>Về chúng tôi</h4><Link to="/about">Giới thiệu</Link><Link to="/admin">Quản trị cửa hàng</Link><a href="https://cuktech.com" target="_blank" rel="noopener noreferrer">Tham khảo thương hiệu <ArrowUpRight size={13}/></a></div></div><div className="content-wrap footer-bottom"><span>© {new Date().getFullYear()} CUKTECH VN Store. All rights reserved.</span><span>DESIGNED FOR THE NEXT GENERATION OF POWER</span></div></footer>}
function Admin(){const [authed,setAuthed]=useState(false),[email,setEmail]=useState(''),[password,setPassword]=useState(''),[error,setError]=useState(''),[tab,setTab]=useState('orders'),[orders,setOrders]=useState([]),[products,setProducts]=useState([]),[busy,setBusy]=useState(false),[newProd,setNewProd]=useState(false),[syncStatus,setSyncStatus]=useState(null),[syncBusy,setSyncBusy]=useState(false);const refresh=async()=>{const [o,p]=await Promise.all([api('/api/admin/orders'),api('/api/admin/products')]);setOrders(o);setProducts(p)};const refreshSync=()=>api('/api/admin/catalog/status').then(setSyncStatus).catch(()=>{});const syncNow=async()=>{setSyncBusy(true);try{await api('/api/admin/catalog/sync',{method:'POST'});await refreshSync()}catch(e){alert(e.message)}finally{setSyncBusy(false)}};useEffect(()=>{api('/api/admin/me').then(()=>{setAuthed(true);refresh();refreshSync()}).catch(()=>{})},[]);const login=async e=>{e.preventDefault();setError('');try{await api('/api/admin/login',{method:'POST',body:JSON.stringify({email,password})});setAuthed(true);refresh();refreshSync()}catch(e){setError(e.message)}};async function patchProduct(id,fields){setBusy(true);try{await api('/api/admin/products/'+id,{method:'PATCH',body:JSON.stringify(fields)});await refresh()}catch(e){alert(e.message)}finally{setBusy(false)}};async function patchOrder(id,status){try{await api('/api/admin/orders/'+id,{method:'PATCH',body:JSON.stringify({status})});await refresh()}catch(e){alert(e.message)}};if(!authed)return <main className="admin-login"><form onSubmit={login}><span className="overline">CUKTECH VN / BACK OFFICE</span><h1>Quản trị cửa hàng</h1><p>Chỉ dành cho quản trị viên đã được cấp quyền.</p><label>Email<input type="email" required value={email} onChange={e=>setEmail(e.target.value)}/></label><label>Mật khẩu<input type="password" required value={password} onChange={e=>setPassword(e.target.value)}/></label>{error&&<p className="form-error" role="alert">{error}</p>}<button className="btn btn-black full">Đăng nhập <ArrowRight size={18}/></button></form></main>;return <main className="admin-panel content-wrap"><div className="admin-head"><div><span className="overline">CONTROL CENTER</span><h1>Quản trị cửa hàng</h1></div><button className="btn btn-outline" onClick={async()=>{await api('/api/admin/logout',{method:'POST'});setAuthed(false)}}>Đăng xuất <LogOut size={17}/></button></div><div className="admin-tabs"><button className={tab==='orders'?'active':''} onClick={()=>setTab('orders')}><Package size={18}/> Đơn hàng ({orders.length})</button><button className={tab==='products'?'active':''} onClick={()=>setTab('products')}><LayoutDashboard size={18}/> Sản phẩm ({products.length})</button><button className={tab==='sync'?'active':''} onClick={()=>{setTab('sync');refreshSync()}}><Zap size={18}/> Đồng bộ CUKTECH</button></div>{tab==='sync'?<div className="sync-panel"><h2>Đồng bộ danh mục từ cuktech.com</h2><p>Chỉ đọc dữ liệu công khai, tuân thủ robots.txt, không vượt chặn. Ảnh liên kết nguồn và mô tả cần được xác minh quyền sử dụng trước khi đăng bán.</p><p>Sản phẩm nhập mới được ẩn, giá 0đ và tồn kho 0; anh chỉnh giá VND và tồn kho thật trước khi bật hiển thị.</p><p><b>Danh mục công khai của nguồn:</b> {syncStatus?.audit?.sourceCount??'Chưa xác minh'} · <b>Đọc được:</b> {syncStatus?.audit?.fetched??'—'} · <b>Đã lưu D1:</b> {syncStatus?.audit?.stored??'—'}</p><p><b>Đang có trong kho:</b> {syncStatus?.imported?.active??0} · <b>Chờ duyệt:</b> {syncStatus?.imported?.drafts??0} · <b>Đang hiển thị:</b> {syncStatus?.imported?.visible??0} · <b>Không còn trong nguồn:</b> {syncStatus?.imported?.missing??0}</p><p><b>Đối chiếu:</b> {syncStatus?.complete?'Đã khớp số lượng nguồn và D1':'Chưa xác minh đủ sản phẩm'} · <b>Tự động:</b> {syncStatus?.autoEnabled?'Đang bật':'Chưa bật'}</p><p><b>Lần chạy cuối:</b> {syncStatus?.latest?.started_at||'Chưa chạy'} · {syncStatus?.latest?.status||''}</p><pre>{syncStatus?.latest?.summary||''}</pre><button className="btn btn-black" disabled={syncBusy||syncStatus?.running||!syncStatus?.autoEnabled} onClick={syncNow}>{syncStatus?.running?'Đang đồng bộ…':'Chạy đồng bộ ngay'} <ArrowRight size={17}/></button><button className="btn btn-outline" onClick={refreshSync}>Cập nhật trạng thái</button></div>:tab==='orders'?<><div className="admin-toolbar"><p>Xuất đơn để xử lý và đối soát.</p><a className="btn btn-outline" href={API_URL+"/api/admin/orders.csv"}>Tải đơn hàng CSV</a></div><div className="admin-table-wrap"><table className="admin-table"><thead><tr><th>Mã đơn</th><th>Khách hàng</th><th>SĐT</th><th>Địa chỉ</th><th>Sản phẩm</th><th>Tổng</th><th>Trạng thái</th></tr></thead><tbody>{orders.map(o=><tr key={o.id}><td><strong>{o.id}</strong><small>{o.created_at}</small></td><td>{o.customer}</td><td>{o.phone}</td><td>{o.address}</td><td>{o.items.map(i=>i.name+' × '+i.qty).join(', ')}</td><td>{vn(o.total)}</td><td><select value={o.status} onChange={e=>patchOrder(o.id,e.target.value)}><option value="new">Mới</option><option value="confirmed">Đã xác nhận</option><option value="shipping">Đang giao</option><option value="completed">Hoàn tất</option><option value="cancelled">Đã hủy</option></select></td></tr>)}</tbody></table>{!orders.length&&<p className="empty-admin">Chưa có đơn hàng.</p>}</div></>:<><div className="admin-toolbar"><p>Giá và tồn kho mẫu phải được xác thực trước khi bán thật.</p><button className="btn btn-black" onClick={()=>setNewProd(true)}>Thêm sản phẩm <Plus size={18}/></button></div><div className="admin-table-wrap"><table className="admin-table"><thead><tr><th>Sản phẩm</th><th>Giá (VND)</th><th>Tồn kho</th><th>Phân loại</th><th>Quyền ảnh</th><th>Hiển thị</th><th></th></tr></thead><tbody>{products.map(p=><AdminProductRow key={p.id} p={p} save={patchProduct} busy={busy}/>)}</tbody></table></div></>}{newProd&&<NewProductModal close={()=>setNewProd(false)} saved={refresh}/>}</main>}
function AdminProductRow({p,save,busy}){const [form,setForm]=useState({name:p.name,price:p.price,stock:p.stock,category:p.category,published:p.published,media_approved:p.media_approved||0});useEffect(()=>setForm({name:p.name,price:p.price,stock:p.stock,category:p.category,published:p.published,media_approved:p.media_approved||0}),[p]);return <tr><td><input value={form.name} onChange={e=>setForm({...form,name:e.target.value})}/><small>/{p.slug} {p.source_id?'· Nhập từ cuktech.com':''}</small></td><td><input type="number" min="0" value={form.price} onChange={e=>setForm({...form,price:Number(e.target.value)})}/></td><td><input type="number" min="0" value={form.stock} onChange={e=>setForm({...form,stock:Number(e.target.value)})}/></td><td><select value={form.category} onChange={e=>setForm({...form,category:e.target.value})}>{categories.slice(1).map(c=><option value={c.id} key={c.id}>{c.label}</option>)}</select></td><td>{p.source_id?<label className="admin-media-approval"><input type="checkbox" checked={form.media_approved===1} onChange={e=>setForm({...form,media_approved:e.target.checked?1:0})}/> Đã có quyền sử dụng ảnh</label>:<span>Ảnh của shop</span>}</td><td><select value={form.published} onChange={e=>setForm({...form,published:Number(e.target.value)})}><option value={1}>Bật</option><option value={0}>Ẩn</option></select></td><td><button disabled={busy} className="btn btn-outline btn-small" onClick={()=>save(p.id,form)}><Save size={15}/> Lưu</button></td></tr>}
function NewProductModal({close,saved}){const [form,setForm]=useState({slug:'',name:'',category:'powerbank',price:0,stock:0}),[error,setError]=useState('');async function submit(e){e.preventDefault();try{await api('/api/admin/products',{method:'POST',body:JSON.stringify(form)});await saved();close()}catch(e){setError(e.message)}}return <div className="overlay-layer admin-modal-layer" onClick={close}><form className="new-modal" onClick={e=>e.stopPropagation()} onSubmit={submit}><div className="drawer-top"><h2>Thêm sản phẩm</h2><button type="button" className="icon-btn" onClick={close}><X/></button></div><label>Tên<input required minLength={3} value={form.name} onChange={e=>setForm({...form,name:e.target.value})}/></label><label>Slug (không dấu)<input required pattern="[a-z0-9-]{3,80}" value={form.slug} onChange={e=>setForm({...form,slug:e.target.value})}/></label><label>Danh mục<select value={form.category} onChange={e=>setForm({...form,category:e.target.value})}>{categories.slice(1).map(c=><option key={c.id} value={c.id}>{c.label}</option>)}</select></label><label>Giá VND<input type="number" min="0" required value={form.price} onChange={e=>setForm({...form,price:Number(e.target.value)})}/></label><label>Tồn kho<input type="number" min="0" required value={form.stock} onChange={e=>setForm({...form,stock:Number(e.target.value)})}/></label>{error&&<p className="form-error">{error}</p>}<button className="btn btn-black full">Tạo sản phẩm <Plus size={17}/></button></form></div>}
function App(){return <BrowserRouter basename={window.location.hostname.endsWith('.github.io') ? '/cuk' : undefined}><StoreProvider><div className="site"><Header/><RoutesInner/><Footer/><CartDrawer/></div></StoreProvider></BrowserRouter>}
import { Routes, Route } from 'react-router-dom'
function RoutesInner(){return <Routes><Route path="/" element={<Home/>}/><Route path="/shop" element={<Catalog/>}/><Route path="/product/:slug" element={<Product/>}/><Route path="/checkout" element={<Checkout/>}/><Route path="/success/:id" element={<Success/>}/><Route path="/about" element={<About/>}/><Route path="/policy" element={<Policy/>}/><Route path="/admin" element={<Admin/>}/><Route path="*" element={<main className="content-wrap page-space"><h1>404</h1><p>Trang không tồn tại</p><Link className="btn btn-black" to="/">Về trang chủ</Link></main>}/></Routes>}
createRoot(document.getElementById('root')).render(<App/>)
