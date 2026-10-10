// Demo data shared by index.html and the examples-*.html pages (ported from the
// pure-admin palette demo). Everything here is plain JSON, as a server would send it.

export const products = [
  { id: 1, name: 'MacBook Pro 16"', sku: 'MBP-16-001', price: '$2,499.00', icon: '💻', status: 'In Stock' },
  { id: 2, name: 'iPhone 15 Pro', sku: 'IP15P-256', price: '$999.00', icon: '📱', status: 'New' },
  { id: 3, name: 'AirPods Pro', sku: 'APP-GEN2', price: '$249.00', icon: '🎧', status: 'Popular' },
  { id: 4, name: 'iPad Air', sku: 'IPAD-AIR-5', price: '$599.00', icon: '📱', status: 'In Stock' },
  { id: 5, name: 'Apple Watch Ultra', sku: 'AW-ULTRA', price: '$799.00', icon: '⌚', status: 'Limited' },
  { id: 6, name: 'Magic Keyboard', sku: 'MK-US', price: '$99.00', icon: '⌨️', status: 'In Stock' },
  { id: 7, name: 'Magic Mouse', sku: 'MM-BLK', price: '$79.00', icon: '🖱️', status: 'In Stock' },
  { id: 8, name: 'HomePod mini', sku: 'HPM-WHT', price: '$99.00', icon: '🔊', status: 'New' },
  { id: 9, name: 'Apple TV 4K', sku: 'ATV-4K-128', price: '$149.00', icon: '📺', status: 'In Stock' },
  { id: 10, name: 'AirTag 4 Pack', sku: 'AT-4PK', price: '$99.00', icon: '📍', status: 'Popular' },
  { id: 11, name: 'Studio Display', sku: 'SD-27-STD', price: '$1,599.00', icon: '🖥️', status: 'Premium' },
  { id: 12, name: 'Mac Studio', sku: 'MS-M2-MAX', price: '$1,999.00', icon: '💻', status: 'Pro' },
];

export const users = [
  { id: 1, name: 'John Doe', email: 'john.doe@example.com', role: 'Customer', status: 'Active' },
  { id: 2, name: 'Jane Smith', email: 'jane.smith@example.com', role: 'Admin', status: 'Active' },
  { id: 3, name: 'Bob Johnson', email: 'bob.johnson@example.com', role: 'Customer', status: 'Inactive' },
  { id: 4, name: 'Alice Williams', email: 'alice.w@example.com', role: 'Manager', status: 'Active' },
  { id: 5, name: 'Charlie Brown', email: 'charlie.b@example.com', role: 'Customer', status: 'Active' },
  { id: 6, name: 'Diana Prince', email: 'diana.p@example.com', role: 'VIP', status: 'Premium' },
  { id: 7, name: 'Eve Davis', email: 'eve.davis@example.com', role: 'Customer', status: 'Active' },
  { id: 8, name: 'Frank Miller', email: 'frank.m@example.com', role: 'Support', status: 'Active' },
  { id: 9, name: 'Grace Lee', email: 'grace.lee@example.com', role: 'Customer', status: 'New' },
  { id: 10, name: 'Henry Ford', email: 'henry.f@example.com', role: 'Customer', status: 'Active' },
];

export const orders = [
  { id: 1001, customer: 'John Doe', total: '$1,234.56', items: 2, status: 'Shipped' },
  { id: 1002, customer: 'Jane Smith', total: '$567.89', items: 1, status: 'Processing' },
  { id: 1003, customer: 'Bob Johnson', total: '$2,345.67', items: 5, status: 'Delivered' },
  { id: 1004, customer: 'Alice Williams', total: '$890.12', items: 3, status: 'Pending' },
  { id: 1005, customer: 'Charlie Brown', total: '$456.78', items: 2, status: 'Shipped' },
  { id: 1006, customer: 'Diana Prince', total: '$3,456.89', items: 7, status: 'Processing' },
  { id: 1007, customer: 'Eve Davis', total: '$123.45', items: 1, status: 'Cancelled' },
  { id: 1008, customer: 'Frank Miller', total: '$678.90', items: 4, status: 'Delivered' },
];

const variants = {
  'Active': 'success', 'In Stock': 'success', 'Delivered': 'success',
  'New': 'info', 'Shipped': 'info', 'Popular': 'info',
  'Premium': 'primary', 'Pro': 'primary',
  'Processing': 'warning', 'Limited': 'warning', 'Inactive': 'warning', 'Pending': 'warning',
  'Cancelled': 'danger',
};

export const commands = [
  {
    id: 'deploy', shortcut: '/deploy', aliases: ['/d'], hotkey: 'g d', icon: '🚀',
    name: 'Deploy to Environment', description: 'Deploy a branch to an environment',
    steps: [
      { id: 'environment', prompt: ' to ', placeholder: 'Select environment…', options: [
        { id: 'prod', label: 'Production', description: 'Live servers', icon: '🔴', value: 'production' },
        { id: 'staging', label: 'Staging', description: 'Pre-production', icon: '🟡', value: 'staging' },
        { id: 'dev', label: 'Development', description: 'Dev servers', icon: '🟢', value: 'development' },
      ] },
      // Live step: options come from stepOptionsCallback per keystroke.
      { id: 'branch', prompt: ' branch ', placeholder: 'Select or type branch…', freeText: true, search: true },
    ],
  },
  {
    id: 'assign', shortcut: '/assign', aliases: ['/a'], hotkey: 'g a', icon: '👤',
    name: 'Assign to User', description: 'Assign an item to a team member',
    steps: [
      { id: 'item', placeholder: 'Select item…' },          // static, via stepOptionsCallback (fetched once)
      { id: 'user', prompt: ' to ', placeholder: 'Select user…' },
    ],
  },
  {
    id: 'go', shortcut: '/go', aliases: ['/g', '/nav'], hotkey: 'g g', icon: '🧭',
    name: 'Go to Page', description: 'Navigate to a page',
    steps: [{ id: 'page', placeholder: 'Type page name…', freeText: true, options: [
      { id: 'dashboard', label: 'Dashboard', description: 'Overview', icon: '📊', value: '/' },
      { id: 'products', label: 'Products', description: 'Catalog', icon: '📦', value: '/products' },
      { id: 'orders', label: 'Orders', description: 'Sales', icon: '🧾', value: '/orders' },
      { id: 'users', label: 'Users', description: 'Accounts', icon: '👥', value: '/users' },
      { id: 'settings', label: 'Settings', description: 'Configuration', icon: '⚙️', value: '/settings' },
    ] }],
  },
  {
    id: 'theme', shortcut: '/theme', aliases: ['/t'], hotkey: 'g t', icon: '🎨',
    name: 'Switch Theme', description: 'Change the visual theme',
    steps: [{ id: 'theme', placeholder: 'Select theme…', options: [
      { id: 'light', label: 'Light', icon: '☀️', value: 'light' },
      { id: 'dark', label: 'Dark', icon: '🌑', value: 'dark' },
    ] }],
  },
  { id: 'reload', shortcut: '/reload', hotkey: 'g r', icon: '🔄', name: 'Reload Data', description: 'Instant command (no steps)' },
];

export const contexts = [
  { id: 'products', shortcut: ':products', aliases: [':p', ':prod'], name: 'Products', description: 'Search products by name or SKU', icon: '📦' },
  { id: 'users', shortcut: ':users', aliases: [':u'], name: 'Users', description: 'Search users by name or email', icon: '👤' },
  { id: 'orders', shortcut: ':orders', aliases: [':o'], name: 'Orders', description: 'Search orders by number or customer', icon: '🧾' },
];

const has = (text, q) => String(text).toLowerCase().includes(q);

const productHit = (p) => ({ id: 'product-' + p.id, title: p.name, subtitle: `SKU: ${p.sku} • ${p.price}`, icon: p.icon, badge: p.status, badgeVariant: variants[p.status], href: `/products/${p.id}` });
const userHit = (u) => ({ id: 'user-' + u.id, title: u.name, subtitle: `${u.email} • ${u.role}`, icon: '👤', badge: u.status, badgeVariant: variants[u.status], href: `/users/${u.id}` });
const orderHit = (o) => ({ id: 'order-' + o.id, title: `Order #${o.id}`, subtitle: `${o.customer} • ${o.total} • ${o.items} items`, icon: '🧾', badge: o.status, badgeVariant: variants[o.status], href: `/orders/${o.id}` });

/** Simulated server search (latency + AbortSignal). */
export function searchCallback(scope, query, signal) {
  const q = query.toLowerCase();
  const find = {
    products: () => products.filter((p) => has(p.name, q) || has(p.sku, q)).map(productHit),
    users: () => users.filter((u) => has(u.name, q) || has(u.email, q)).map(userHit),
    orders: () => orders.filter((o) => has(o.customer, q) || has(o.id, q)).map(orderHit),
  };
  const results = scope === 'global'
    ? [...find.products().slice(0, 3), ...find.users().slice(0, 3), ...find.orders().slice(0, 3)]
    : find[scope.contextId]?.() ?? [];
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => resolve(results), 250);
    signal.addEventListener('abort', () => { clearTimeout(timer); reject(new DOMException('aborted', 'AbortError')); }, { once: true });
  });
}

const branches = ['main', 'develop', 'feature/new-ui', 'feature/palette', 'fix/login', 'release/2.0'];

/** Step options: static steps get their full list once; the live `branch` step is queried per keystroke. */
export async function stepOptionsCallback({ commandId, stepId, query }) {
  if (commandId === 'assign' && stepId === 'item') {
    return products.map((p) => ({ id: 'p-' + p.id, label: p.name, description: `SKU: ${p.sku}`, icon: p.icon, value: p.id }));
  }
  if (commandId === 'assign' && stepId === 'user') {
    return users.map((u) => ({ id: 'u-' + u.id, label: u.name, description: u.email, icon: '👤', value: u.id }));
  }
  if (commandId === 'deploy' && stepId === 'branch') {
    await new Promise((r) => setTimeout(r, 150));
    return branches.filter((b) => b.includes(query.toLowerCase())).map((b) => ({ id: b, label: b, icon: '🌿', value: b }));
  }
  return [];
}
