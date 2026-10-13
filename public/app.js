const API = "/api";
const state = { products: [], settings: {}, cart: JSON.parse(localStorage.getItem("shopnix-cart") || "[]"), user: JSON.parse(localStorage.getItem("shopnix-user") || "null"), token: localStorage.getItem("shopnix-token") || "", category: "All", query: "" };
const $ = (s) => document.querySelector(s);
const money = (n) => new Intl.NumberFormat("en-IN", { style:"currency", currency:"INR", maximumFractionDigits:2 }).format(n);
async function api(path, options={}) {
  const headers = { "content-type":"application/json", ...(options.headers||{}) };
  if (state.token) headers.authorization = `Bearer ${state.token}`;
  const res = await fetch(API + path, { ...options, headers });
  const data = await res.json().catch(()=>({error:"Unexpected server response"}));
  if (!res.ok) throw new Error(data.error || "Something went wrong.");
  return data;
}
let toastTimer;
function toast(message) { const el=$("#toast"); el.textContent=message; el.classList.add("show"); clearTimeout(toastTimer); toastTimer=setTimeout(()=>el.classList.remove("show"),2600); }
function saveCart(){localStorage.setItem("shopnix-cart",JSON.stringify(state.cart));renderCartCount();}
function renderCartCount(){$("#cartCount").textContent=state.cart.reduce((n,x)=>n+x.quantity,0);}
function openModal(html){$("#modalContent").innerHTML=html;$("#modal").classList.remove("hidden");}
function closeModal(){$("#modal").classList.add("hidden");}
function authForm(mode="login"){
 const isRegister=mode==="register";
 openModal(`<span class="eyebrow">WELCOME TO SHOPNIX</span><h2>${isRegister?"Create your account":"Welcome back"}</h2><p>${isRegister?"Join us and keep your favourite finds together.":"Sign in to manage orders and checkout."}</p><form id="authForm">${isRegister?'<div class="field"><label>Your name</label><input name="name" minlength="2" required placeholder="Full name"></div>':''}<div class="field"><label>Email address</label><input name="email" type="email" required placeholder="you@example.com"></div><div class="field"><label>Password</label><input name="password" type="password" minlength="8" required placeholder="At least 8 characters"></div><button class="primary full" type="submit">${isRegister?"Create account":"Sign in"}</button></form><a class="switch-auth" href="#" id="switchAuth">${isRegister?"Already have an account? Sign in":"New to Shopnix? Create an account"}</a>`);
 $("#switchAuth").onclick=e=>{e.preventDefault();authForm(isRegister?"login":"register");};
 $("#authForm").onsubmit=async e=>{e.preventDefault();const f=new FormData(e.currentTarget);const payload=Object.fromEntries(f.entries());try{const d=await api(isRegister?"/auth/register":"/auth/login",{method:"POST",body:JSON.stringify(payload)});state.token=d.token;state.user=d.user;localStorage.setItem("shopnix-token",state.token);localStorage.setItem("shopnix-user",JSON.stringify(state.user));closeModal();updateAuthButton();toast("Signed in successfully.");if(state.user.role==="admin")adminPanel();}catch(err){toast(err.message);}};
}
function updateAuthButton(){$("#loginOpen").textContent=state.user?state.user.name.split(" ")[0]:"Sign in";}
function renderProducts(){
 const categories=["All",...new Set(state.products.map(p=>p.category).filter(Boolean))];
 $("#categories").innerHTML=categories.map(c=>`<button class="category ${state.category===c?"active":""}" data-category="${esc(c)}">${esc(c)}</button>`).join("");
 $("#categories").querySelectorAll("button").forEach(b=>b.onclick=()=>{state.category=b.dataset.category;renderProducts();});
 const products=state.products.filter(p=>(state.category==="All"||p.category===state.category)&&(`${p.name} ${p.description} ${p.category}`.toLowerCase().includes(state.query.toLowerCase())));
 $("#productGrid").innerHTML=products.map(p=>`<article class="product-card"><div class="product-image"><img loading="lazy" src="${esc(p.imageUrl||"")}" alt="${esc(p.name)}" onerror="this.style.display='none'"><span class="product-tag">${esc(p.category||"Featured")}</span></div><div class="product-info"><h3>${esc(p.name)}</h3><p>${esc(p.description||"A thoughtful everyday find.")}</p><div class="product-bottom"><span class="price">${money(p.price)}</span><button class="add" data-add="${p.id}" ${p.stock<1?"disabled":""}>${p.stock<1?"Sold out":"+ Add to cart"}</button></div></div></article>`).join("");
 $("#empty").classList.toggle("hidden",products.length>0);
 $("#productGrid").querySelectorAll("[data-add]").forEach(b=>b.onclick=()=>addToCart(b.dataset.add));
}
function esc(s){return String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));}
function addToCart(productId){const p=state.products.find(x=>x.id===productId);if(!p)return;const item=state.cart.find(x=>x.productId===productId);if(item)item.quantity++;else state.cart.push({productId,quantity:1});saveCart();toast("Added to your cart.");}
function cartShow(){renderCart();$("#cartDrawer").classList.remove("hidden");$("#scrim").classList.remove("hidden");}
function cartHide(){$("#cartDrawer").classList.add("hidden");$("#scrim").classList.add("hidden");}
function renderCart(){
 const rows=state.cart.map(i=>({...i,product:state.products.find(p=>p.id===i.productId)})).filter(i=>i.product);
 $("#cartItems").innerHTML=rows.length?rows.map(i=>`<div class="cart-line"><div><b>${esc(i.product.name)}</b><small>${money(i.product.price)} each</small></div><div class="qty"><button data-dec="${i.productId}">−</button><span>${i.quantity}</span><button data-inc="${i.productId}">+</button></div></div>`).join(""):'<p style="color:var(--muted)">Your cart is empty. Find something lovely!</p>';
 $("#cartTotal").textContent=money(rows.reduce((sum,i)=>sum+i.product.price*i.quantity,0));
 $("#cartItems").querySelectorAll("[data-inc]").forEach(b=>b.onclick=()=>changeQty(b.dataset.inc,1));
 $("#cartItems").querySelectorAll("[data-dec]").forEach(b=>b.onclick=()=>changeQty(b.dataset.dec,-1));
}
function changeQty(id,delta){const item=state.cart.find(x=>x.productId===id);if(item)item.quantity+=delta;state.cart=state.cart.filter(x=>x.quantity>0);saveCart();renderCart();}
async function checkout(){
 if(!state.cart.length){toast("Your cart is empty.");return;}
 if(!state.user){cartHide();authForm();toast("Sign in to continue checkout.");return;}
 const html=`<span class="eyebrow">ONE LAST STEP</span><h2>Checkout details</h2><p>Submit your order, then contact the store on WhatsApp or Telegram to confirm it.</p><form id="checkoutForm"><div class="field"><label>Full name</label><input name="customerName" required value="${esc(state.user.name)}"></div><div class="field"><label>Phone number</label><input name="phone" required inputmode="tel" placeholder="Your contact number"></div><div class="field"><label>Delivery address</label><textarea name="address" required rows="3" placeholder="House, street, city, PIN code"></textarea></div><div class="field"><label>Note (optional)</label><input name="note" placeholder="Delivery instructions"></div><button class="primary full" type="submit">Place order · ${$("#cartTotal").textContent}</button></form>`;
 cartHide();openModal(html);
 $("#checkoutForm").onsubmit=async e=>{e.preventDefault();const f=new FormData(e.currentTarget);const data=Object.fromEntries(f.entries());data.items=state.cart.map(i=>({productId:i.productId,quantity:i.quantity}));try{const d=await api("/orders",{method:"POST",body:JSON.stringify(data)});state.cart=[];saveCart();closeModal();await loadProducts();contactStore(d.orderId,d.total,data);toast("Order submitted. Contact the store to confirm.");}catch(err){toast(err.message);}};
}
function contactStore(orderId,total,details){
 const msg=`Hello Shopnix! I placed order ${orderId}. Total: ${money(total)}. Name: ${details.customerName}. Phone: ${details.phone}. Please confirm my order.`;
 const wa=String(state.settings.whatsappNumber||"").replace(/\D/g,"");
 const tg=String(state.settings.telegramUsername||"").replace(/^@/,"");
 openModal(`<span class="eyebrow">ORDER SUBMITTED</span><h2>Thanks for shopping!</h2><p>Your order <b>${esc(orderId.slice(0,8))}</b> is pending until the store confirms it. Please contact the store below.</p>${wa?`<button class="primary full" id="whatsapp">Continue on WhatsApp ↗</button>`:""}${tg?`<button class="primary full" style="margin-top:10px" id="telegram">Open Telegram ↗</button>`:""}<p>If contact links are not configured yet, share your order ID with the store owner.</p><button class="ghost" id="copyOrder">Copy order ID</button>`);
 if(wa)$("#whatsapp").onclick=()=>window.open(`https://wa.me/${wa}?text=${encodeURIComponent(msg)}`,"_blank","noopener");
 if(tg)$("#telegram").onclick=()=>window.open(`https://t.me/${encodeURIComponent(tg)}`,"_blank","noopener");
 $("#copyOrder").onclick=async()=>{try{await navigator.clipboard.writeText(orderId);toast("Order ID copied.");}catch{toast(orderId);}};
}
function adminPanel(){
 if(!state.user||state.user.role!=="admin"){toast("Admin account required.");return;}
 openModal(`<span class="eyebrow">SHOPNIX CONTROL ROOM</span><h2>Admin panel</h2><p>Manage catalogue, orders and store contact details. This panel uses the live API.</p><div style="display:flex;gap:8px;flex-wrap:wrap;margin:20px 0"><button class="category active" id="tabProducts">Products</button><button class="category" id="tabOrders">Orders</button><button class="category" id="tabSettings">Store settings</button></div><div id="adminBody">Loading…</div>`);
 $("#tabProducts").onclick=()=>adminProducts();$("#tabOrders").onclick=()=>adminOrders();$("#tabSettings").onclick=()=>adminSettings();adminProducts();
}
async function adminProducts(){
 const target=$("#adminBody");if(!target)return;
 try{const d=await api("/products");target.innerHTML=`<h3>Products</h3><form id="productForm"><div class="field"><label>Product name</label><input name="name" required></div><div class="field"><label>Description</label><input name="description"></div><div class="field"><label>Category</label><input name="category" value="General"></div><div class="field"><label>Price (₹)</label><input name="price" type="number" min="0" step=".01" required></div><div class="field"><label>Stock</label><input name="stock" type="number" min="0" step="1" required></div><div class="field"><label>Image URL</label><input name="imageUrl" type="url"></div><button class="primary full">Add product</button></form><hr style="border-color:var(--line);margin:24px 0"><div>${d.products.map(p=>`<div class="cart-line"><div><b>${esc(p.name)}</b><small>${money(p.price)} · stock ${p.stock}</small></div><button class="ghost" data-del="${p.id}">Archive</button></div>`).join("")}</div>`;
 $("#productForm").onsubmit=async e=>{e.preventDefault();const b=Object.fromEntries(new FormData(e.currentTarget).entries());b.price=Number(b.price);b.stock=Number(b.stock);try{await api("/products",{method:"POST",body:JSON.stringify(b)});toast("Product added.");await loadProducts();adminProducts();}catch(err){toast(err.message);}};
 target.querySelectorAll("[data-del]").forEach(b=>b.onclick=async()=>{try{await api("/products/"+b.dataset.del,{method:"DELETE"});await loadProducts();adminProducts();toast("Product archived.");}catch(e){toast(e.message);}});
 }catch(e){target.innerHTML=`<p>${esc(e.message)}</p>`;}
}
async function adminOrders(){const target=$("#adminBody");try{const d=await api("/orders");target.innerHTML=`<h3>Recent orders</h3>${d.orders.length?d.orders.map(o=>`<div class="cart-line" style="display:block"><b>${esc(o.customerName)}</b><small>${esc(o.id)} · ${esc(o.phone)} · ${money(o.total)}</small><p style="color:var(--muted);font-size:12px">${o.items.map(i=>`${esc(i.name)} × ${i.quantity}`).join(", ")}</p><div style="display:flex;gap:8px"><select data-status="${o.id}" class="field" style="margin:0;padding:8px;background:#071322;color:white;border:1px solid var(--line);border-radius:8px">${["pending","confirmed","packed","shipped","delivered","cancelled"].map(s=>`<option ${o.status===s?"selected":""}>${s}</option>`).join("")}</select><button class="ghost" data-save-status="${o.id}">Save</button></div></div>`).join(""):"<p>No orders yet.</p>"}`;
 target.querySelectorAll("[data-save-status]").forEach(b=>b.onclick=async()=>{const sel=target.querySelector(`[data-status="${b.dataset.saveStatus}"]`);try{await api(`/orders/${b.dataset.saveStatus}/status`,{method:"PATCH",body:JSON.stringify({status:sel.value})});toast("Order status updated.");}catch(e){toast(e.message);}});
 }catch(e){target.innerHTML=`<p>${esc(e.message)}</p>`;}}
async function adminSettings(){const t=$("#adminBody");try{const s=await api("/settings");t.innerHTML=`<h3>Store settings</h3><form id="settingsForm"><div class="field"><label>Store name</label><input name="storeName" value="${esc(s.storeName)}"></div><div class="field"><label>Hero banner text</label><input name="banner" value="${esc(s.banner)}"></div><div class="field"><label>WhatsApp number (country code + number, digits only)</label><input name="whatsappNumber" value="${esc(s.whatsappNumber)}" placeholder="919876543210"></div><div class="field"><label>Telegram username (without @)</label><input name="telegramUsername" value="${esc(s.telegramUsername)}" placeholder="yourusername"></div><button class="primary full">Save settings</button></form>`;t.querySelector("#settingsForm").onsubmit=async e=>{e.preventDefault();const b=Object.fromEntries(new FormData(e.currentTarget).entries());try{await api("/settings",{method:"PATCH",body:JSON.stringify(b)});state.settings={...state.settings,...b};$("#banner").textContent=b.banner;toast("Settings saved.");}catch(err){toast(err.message);}};}catch(e){t.innerHTML=`<p>${esc(e.message)}</p>`;}}
async function loadProducts(){try{const [p,s]=await Promise.all([api("/products"),api("/settings")]);state.products=p.products;state.settings=s;$("#banner").textContent=s.banner;document.title=(s.storeName||"Shopnix")+" — Smart Shopping";renderProducts();renderCart();}catch(e){$("#productGrid").innerHTML=`<div class="loading">Could not connect to Shopnix API.<br><small>${esc(e.message)} — deploy the Worker and configure the API route.</small></div>`;}}
$("#search").addEventListener("input",e=>{state.query=e.target.value;renderProducts();});
$("#loginOpen").onclick=()=>state.user?adminPanel():authForm();
$("#cartOpen").onclick=cartShow;$("#cartClose").onclick=cartHide;$("#scrim").onclick=cartHide;$("#checkout").onclick=checkout;$("#modalClose").onclick=closeModal;$("#modal").onclick=e=>{if(e.target.id==="modal")closeModal();};
$("#year").textContent=new Date().getFullYear();renderCartCount();updateAuthButton();loadProducts();
