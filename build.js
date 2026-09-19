const fs = require('fs');
const path = require('path');

const srcDir = __dirname;
const distDir = path.join(__dirname, 'dist');

function copyRecursiveSync(src, dest) {
  if (!fs.existsSync(src)) return;
  const stats = fs.statSync(src);
  const isDirectory = stats.isDirectory();
  if (isDirectory) {
    if (!fs.existsSync(dest)) {
      fs.mkdirSync(dest, { recursive: true });
    }
    fs.readdirSync(src).forEach((childItemName) => {
      copyRecursiveSync(path.join(src, childItemName), path.join(dest, childItemName));
    });
  } else {
    fs.copyFileSync(src, dest);
  }
}

console.log('[Build] Generating production bundle in ./dist ...');

// 1. Ensure dist directories exist
['css', 'js', 'assets/categories', 'netlify/functions'].forEach(dir => {
  fs.mkdirSync(path.join(distDir, dir), { recursive: true });
});

// 2. Copy core HTML entry pages
fs.copyFileSync(path.join(srcDir, 'landing.html'), path.join(distDir, 'index.html'));
fs.copyFileSync(path.join(srcDir, 'landing.html'), path.join(distDir, 'landing.html'));
fs.copyFileSync(path.join(srcDir, 'login.html'), path.join(distDir, 'login.html'));
fs.copyFileSync(path.join(srcDir, 'index.html'), path.join(distDir, 'dashboard.html'));

// 3. Copy netlify.toml, vercel.json, and redirects
if (fs.existsSync(path.join(srcDir, 'netlify.toml'))) {
  fs.copyFileSync(path.join(srcDir, 'netlify.toml'), path.join(distDir, 'netlify.toml'));
}
if (fs.existsSync(path.join(srcDir, 'vercel.json'))) {
  fs.copyFileSync(path.join(srcDir, 'vercel.json'), path.join(distDir, 'vercel.json'));
}

// 4. Create _redirects and robots.txt in dist
const redirectsContent = `/api/*  /.netlify/functions/:splat  200\n/*      /index.html                 200\n`;
fs.writeFileSync(path.join(distDir, '_redirects'), redirectsContent, 'utf8');

const robotsContent = `User-agent: *\nAllow: /\n`;
fs.writeFileSync(path.join(distDir, 'robots.txt'), robotsContent, 'utf8');

// 5. Copy static assets, css, js, netlify functions, and api
copyRecursiveSync(path.join(srcDir, 'css'), path.join(distDir, 'css'));
copyRecursiveSync(path.join(srcDir, 'js'), path.join(distDir, 'js'));
copyRecursiveSync(path.join(srcDir, 'assets'), path.join(distDir, 'assets'));
copyRecursiveSync(path.join(srcDir, 'netlify'), path.join(distDir, 'netlify'));
if (fs.existsSync(path.join(srcDir, 'api'))) {
  copyRecursiveSync(path.join(srcDir, 'api'), path.join(distDir, 'api'));
// 6. Also mirror to public folder for seamless Vercel / zero-config compatibility
const publicDir = path.join(__dirname, 'public');
copyRecursiveSync(distDir, publicDir);

console.log('[Build] SUCCESS: All pages, assets, redirects, Vercel API and Netlify Functions bundled into ./dist and ./public!');
