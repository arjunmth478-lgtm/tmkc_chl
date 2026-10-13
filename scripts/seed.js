import { execFileSync } from "node:child_process";

const products = [
  { name: "Wireless Earbuds", category: "Electronics", description: "Compact everyday wireless earbuds.", price_paise: 129900, stock: 20, image_url: "https://images.unsplash.com/photo-1606220945770-b5b6c2c55bf1?auto=format&fit=crop&w=900&q=80" },
  { name: "Classic Backpack", category: "Fashion", description: "Minimal backpack for work, college and travel.", price_paise: 89900, stock: 15, image_url: "https://images.unsplash.com/photo-1553062407-98eeb64c6a62?auto=format&fit=crop&w=900&q=80" },
  { name: "Desk Lamp", category: "Home", description: "Warm light for focused evenings.", price_paise: 69900, stock: 12, image_url: "https://images.unsplash.com/photo-1507473885765-e6ed057f782c?auto=format&fit=crop&w=900&q=80" }
];

console.log("Seed through the API after deploying or run the SQL below using wrangler d1 execute.");
console.log("Use: npx wrangler d1 execute shopnix-db --local --command=\"...\" to add products.");
console.log(JSON.stringify(products, null, 2));
