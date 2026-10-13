const JSON_HEADERS = { "content-type": "application/json; charset=utf-8" };
const corsHeaders = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET,POST,PATCH,DELETE,OPTIONS",
  "access-control-allow-headers": "content-type,authorization",
  "access-control-max-age": "86400"
};

function response(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), { status, headers: { ...JSON_HEADERS, ...corsHeaders, ...headers, "x-content-type-options": "nosniff", "referrer-policy": "strict-origin-when-cross-origin" } });
}
function fail(message, status = 400) { return response({ error: message }, status); }
function id() { return crypto.randomUUID(); }
async function hashPassword(password, salt = crypto.getRandomValues(new Uint8Array(16))) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", salt, iterations: 210000, hash: "SHA-256" }, key, 256);
  return { hash: [...new Uint8Array(bits)].map(x => x.toString(16).padStart(2, "0")).join(""), salt: btoa(String.fromCharCode(...salt)) };
}
async function verifyPassword(password, saltB64, expected) {
  const salt = Uint8Array.from(atob(saltB64), c => c.charCodeAt(0));
  const result = await hashPassword(password, salt);
  return result.hash === expected;
}
async function sha256(value) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(buf)].map(x => x.toString(16).padStart(2, "0")).join("");
}
async function currentUser(request, env) {
  const auth = request.headers.get("authorization") || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  if (!token) return null;
  const tokenHash = await sha256(token);
  const row = await env.DB.prepare("SELECT u.id,u.name,u.email,u.role,u.blocked FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=? AND s.expires_at > datetime('now')").bind(tokenHash).first();
  if (!row || row.blocked) return null;
  return row;
}
async function admin(request, env) {
  const user = await currentUser(request, env);
  return user?.role === "admin" ? user : null;
}
async function body(request) {
  try { return await request.json(); } catch { return null; }
}
function validEmail(email) { return typeof email === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email); }
function safeProduct(row) {
  return { id: row.id, name: row.name, description: row.description, category: row.category, price: row.price_paise / 100, stock: row.stock, imageUrl: row.image_url, active: Boolean(row.active) };
}
async function listProducts(env, includeInactive = false) {
  const q = includeInactive ? "SELECT * FROM products ORDER BY created_at DESC" : "SELECT * FROM products WHERE active=1 ORDER BY created_at DESC";
  const { results = [] } = await env.DB.prepare(q).all();
  return results.map(safeProduct);
}
async function handle(request, env) {
  const url = new URL(request.url);
  const path = url.pathname;
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders });
  if (!path.startsWith("/api/")) return env.ASSETS ? env.ASSETS.fetch(request) : fail("Not found", 404);
  if (path === "/api/health" && request.method === "GET") return response({ ok: true, store: env.STORE_NAME || "Shopnix" });
  if (path === "/api/products" && request.method === "GET") {
    const isAdmin = await admin(request, env);
    return response({ products: await listProducts(env, Boolean(isAdmin)) });
  }
  if (path === "/api/settings" && request.method === "GET") {
    const rows = await env.DB.prepare("SELECT key,value FROM settings").all();
    const settings = Object.fromEntries((rows.results || []).map(r => [r.key, r.value]));
    return response({ storeName: settings.storeName || env.STORE_NAME || "Shopnix", banner: settings.banner || "Shopnix — Connected by Flipkart, Meesho, Amazon & Many More", whatsappNumber: settings.whatsappNumber || env.WHATSAPP_NUMBER || "", telegramUsername: settings.telegramUsername || env.TELEGRAM_USERNAME || "" });
  }
  if (path === "/api/auth/register" && request.method === "POST") {
    const b = await body(request);
    if (!b || typeof b.name !== "string" || b.name.trim().length < 2 || !validEmail(b.email) || typeof b.password !== "string" || b.password.length < 8) return fail("Name, valid email and password (at least 8 characters) are required.");
    const email = b.email.trim().toLowerCase();
    const exists = await env.DB.prepare("SELECT id FROM users WHERE email=?").bind(email).first();
    if (exists) return fail("An account with this email already exists.", 409);
    const pw = await hashPassword(b.password);
    const userId = id();
    const role = email === (env.ADMIN_EMAIL || "").trim().toLowerCase() ? "admin" : "customer";
    await env.DB.prepare("INSERT INTO users(id,name,email,password_hash,password_salt,role) VALUES(?,?,?,?,?,?)").bind(userId, b.name.trim().slice(0,100), email, pw.hash, pw.salt, role).run();
    const token = crypto.randomUUID() + crypto.randomUUID();
    await env.DB.prepare("INSERT INTO sessions(token_hash,user_id,expires_at) VALUES(?,?,datetime('now','+30 days'))").bind(await sha256(token), userId).run();
    return response({ token, user: { id: userId, name: b.name.trim(), email, role } }, 201);
  }
  if (path === "/api/auth/login" && request.method === "POST") {
    const b = await body(request);
    if (!b || !validEmail(b.email) || typeof b.password !== "string") return fail("Valid email and password are required.");
    const user = await env.DB.prepare("SELECT * FROM users WHERE email=?").bind(b.email.trim().toLowerCase()).first();
    if (!user || user.blocked || !(await verifyPassword(b.password, user.password_salt, user.password_hash))) return fail("Email or password is incorrect.", 401);
    const token = crypto.randomUUID() + crypto.randomUUID();
    await env.DB.prepare("INSERT INTO sessions(token_hash,user_id,expires_at) VALUES(?,?,datetime('now','+30 days'))").bind(await sha256(token), user.id).run();
    return response({ token, user: { id: user.id, name: user.name, email: user.email, role: user.role } });
  }
  if (path === "/api/auth/me" && request.method === "GET") {
    const user = await currentUser(request, env);
    return user ? response({ user }) : fail("Please sign in.", 401);
  }
  if (path === "/api/auth/logout" && request.method === "POST") {
    const token = (request.headers.get("authorization") || "").replace(/^Bearer /, "");
    if (token) await env.DB.prepare("DELETE FROM sessions WHERE token_hash=?").bind(await sha256(token)).run();
    return response({ ok: true });
  }
  if (path === "/api/orders" && request.method === "POST") {
    const user = await currentUser(request, env);
    if (!user) return fail("Sign in before placing an order.", 401);
    const b = await body(request);
    if (!b || !Array.isArray(b.items) || b.items.length < 1 || b.items.length > 50 || typeof b.customerName !== "string" || typeof b.phone !== "string") return fail("Order details are incomplete.");
    let total = 0; const items = [];
    for (const item of b.items) {
      const qty = Number(item.quantity);
      if (!Number.isInteger(qty) || qty < 1 || qty > 50) return fail("Invalid item quantity.");
      const product = await env.DB.prepare("SELECT * FROM products WHERE id=? AND active=1").bind(String(item.productId)).first();
      if (!product || product.stock < qty) return fail("A product is unavailable or has insufficient stock.", 409);
      total += product.price_paise * qty;
      items.push({ product, qty });
    }
    const orderId = id();
    await env.DB.prepare("INSERT INTO orders(id,user_id,customer_name,phone,address,note,total_paise) VALUES(?,?,?,?,?,?,?)").bind(orderId, user.id, b.customerName.trim().slice(0,100), b.phone.trim().slice(0,30), String(b.address || "").slice(0,500), String(b.note || "").slice(0,500), total).run();
    for (const item of items) {
      await env.DB.prepare("INSERT INTO order_items(id,order_id,product_id,product_name,price_paise,quantity) VALUES(?,?,?,?,?,?)").bind(id(), orderId, item.product.id, item.product.name, item.product.price_paise, item.qty).run();
      await env.DB.prepare("UPDATE products SET stock=stock-? WHERE id=?").bind(item.qty, item.product.id).run();
    }
    return response({ orderId, total: total / 100, status: "pending" }, 201);
  }
  if (path === "/api/orders" && request.method === "GET") {
    const user = await currentUser(request, env);
    if (!user) return fail("Please sign in.", 401);
    const isAdmin = user.role === "admin";
    const result = isAdmin
      ? await env.DB.prepare("SELECT * FROM orders ORDER BY created_at DESC LIMIT 200").all()
      : await env.DB.prepare("SELECT * FROM orders WHERE user_id=? ORDER BY created_at DESC").bind(user.id).all();
    const orders = [];
    for (const o of result.results || []) {
      const line = await env.DB.prepare("SELECT product_name,price_paise,quantity FROM order_items WHERE order_id=?").bind(o.id).all();
      orders.push({ id:o.id, customerName:o.customer_name, phone:o.phone, address:o.address, note:o.note, total:o.total_paise/100, status:o.status, createdAt:o.created_at, items:(line.results||[]).map(i=>({name:i.product_name,price:i.price_paise/100,quantity:i.quantity})) });
    }
    return response({ orders });
  }
  const statusMatch = path.match(/^\/api\/orders\/([^/]+)\/status$/);
  if (statusMatch && request.method === "PATCH") {
    if (!(await admin(request, env))) return fail("Admin access required.", 403);
    const b = await body(request);
    const allowed = ["pending","confirmed","packed","shipped","delivered","cancelled"];
    if (!b || !allowed.includes(b.status)) return fail("Invalid order status.");
    const result = await env.DB.prepare("UPDATE orders SET status=? WHERE id=?").bind(b.status, statusMatch[1]).run();
    return result.meta.changes ? response({ ok: true }) : fail("Order not found.", 404);
  }
  if (path === "/api/products" && request.method === "POST") {
    if (!(await admin(request, env))) return fail("Admin access required.", 403);
    const b = await body(request);
    if (!b || typeof b.name !== "string" || !b.name.trim() || !Number.isFinite(Number(b.price)) || Number(b.price) < 0 || !Number.isInteger(Number(b.stock)) || Number(b.stock) < 0) return fail("Product name, valid price and stock are required.");
    const productId = id();
    await env.DB.prepare("INSERT INTO products(id,name,description,category,price_paise,stock,image_url,active) VALUES(?,?,?,?,?,?,?,?)").bind(productId, b.name.trim().slice(0,150), String(b.description||"").slice(0,2000), String(b.category||"General").slice(0,80), Math.round(Number(b.price)*100), Number(b.stock), String(b.imageUrl||"").slice(0,2000), b.active === false ? 0 : 1).run();
    return response({ product: { id: productId } }, 201);
  }
  const productMatch = path.match(/^\/api\/products\/([^/]+)$/);
  if (productMatch && request.method === "PATCH") {
    if (!(await admin(request, env))) return fail("Admin access required.", 403);
    const b = await body(request); if (!b) return fail("Invalid JSON.");
    const old = await env.DB.prepare("SELECT * FROM products WHERE id=?").bind(productMatch[1]).first();
    if (!old) return fail("Product not found.",404);
    const name = typeof b.name === "string" ? b.name.trim().slice(0,150) : old.name;
    const price = b.price === undefined ? old.price_paise : Math.round(Number(b.price)*100);
    const stock = b.stock === undefined ? old.stock : Number(b.stock);
    if (!name || !Number.isFinite(price) || price < 0 || !Number.isInteger(stock) || stock < 0) return fail("Invalid product fields.");
    await env.DB.prepare("UPDATE products SET name=?,description=?,category=?,price_paise=?,stock=?,image_url=?,active=?,updated_at=CURRENT_TIMESTAMP WHERE id=?").bind(name, b.description === undefined ? old.description : String(b.description).slice(0,2000), b.category === undefined ? old.category : String(b.category).slice(0,80), price, stock, b.imageUrl === undefined ? old.image_url : String(b.imageUrl).slice(0,2000), b.active === undefined ? old.active : (b.active ? 1 : 0), productMatch[1]).run();
    return response({ ok: true });
  }
  if (productMatch && request.method === "DELETE") {
    if (!(await admin(request, env))) return fail("Admin access required.", 403);
    await env.DB.prepare("UPDATE products SET active=0 WHERE id=?").bind(productMatch[1]).run();
    return response({ ok: true });
  }
  if (path === "/api/settings" && request.method === "PATCH") {
    if (!(await admin(request, env))) return fail("Admin access required.",403);
    const b = await body(request); if (!b) return fail("Invalid JSON.");
    const entries = { storeName: b.storeName, banner: b.banner, whatsappNumber: b.whatsappNumber, telegramUsername: b.telegramUsername };
    for (const [key,value] of Object.entries(entries)) if (value !== undefined) await env.DB.prepare("INSERT INTO settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").bind(key, String(value).slice(0,1000)).run();
    return response({ ok:true });
  }
  return fail("Not found", 404);
}

export default {
  async fetch(request, env) {
    try { return await handle(request, env); }
    catch (error) {
      console.error("Shopnix API error", error);
      return response({ error: "Internal server error" }, 500);
    }
  }
};
