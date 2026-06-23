const fs = require('fs');
const path = require('path');

const dirs = [
  path.join(__dirname, 'public', 'images'),
  path.join(__dirname, 'public', 'images', 'products')
];

dirs.forEach(d => {
  if (!fs.existsSync(d)) {
    fs.mkdirSync(d, { recursive: true });
  }
});

// Helper to write SVG files
function saveSVG(filepath, content) {
  fs.writeFileSync(filepath, content.trim(), 'utf8');
  console.log(`Generated SVG: ${filepath}`);
}

// 1. Hero Banners
saveSVG(path.join(__dirname, 'public', 'images', 'hero_ethnic.svg'), `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 520" width="100%" height="100%">
  <defs>
    <linearGradient id="g1" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#1E1B4B" />
      <stop offset="100%" stop-color="#4F46E5" />
    </linearGradient>
    <pattern id="indianPattern" x="0" y="0" width="40" height="40" patternUnits="userSpaceOnUse">
      <circle cx="20" cy="20" r="2" fill="#F59E0B" opacity="0.15"/>
      <path d="M 20 0 L 40 20 L 20 40 L 0 20 Z" fill="none" stroke="#F59E0B" stroke-width="0.5" opacity="0.15"/>
    </pattern>
  </defs>
  <rect width="100%" height="100%" fill="url(#g1)" />
  <rect width="100%" height="100%" fill="url(#indianPattern)" />
  <circle cx="950" cy="260" r="180" fill="#F59E0B" opacity="0.08" />
  <!-- stylized Kurta outline graphic in background -->
  <g transform="translate(850, 110) scale(0.6)" opacity="0.75" stroke="#F59E0B" stroke-width="4" fill="none">
    <path d="M150,50 L200,90 L230,220 L190,230 L170,140 L170,400 L80,400 L80,140 L60,230 L20,220 L50,90 Z" />
    <path d="M100,50 C100,70 150,70 150,50" />
    <line x1="125" y1="70" x2="125" y2="170" />
  </g>
</svg>
`);

saveSVG(path.join(__dirname, 'public', 'images', 'hero_western.svg'), `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 520" width="100%" height="100%">
  <defs>
    <linearGradient id="g2" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#0F766E" />
      <stop offset="100%" stop-color="#134E5E" />
    </linearGradient>
  </defs>
  <rect width="100%" height="100%" fill="url(#g2)" />
  <!-- Dress graphics in background -->
  <g transform="translate(850, 110) scale(0.7)" opacity="0.5" stroke="#FFFFFF" stroke-width="3" fill="none">
    <path d="M100,50 L150,50 L180,120 L150,150 L170,380 L80,380 L100,150 L70,120 Z" />
    <path d="M100,50 Q125,75 150,50" />
  </g>
</svg>
`);

saveSVG(path.join(__dirname, 'public', 'images', 'hero_kids.svg'), `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 520" width="100%" height="100%">
  <defs>
    <linearGradient id="g3" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#581C87" />
      <stop offset="100%" stop-color="#701A75" />
    </linearGradient>
  </defs>
  <rect width="100%" height="100%" fill="url(#g3)" />
  <!-- Cute star shapes -->
  <g fill="#F59E0B" opacity="0.3">
    <polygon points="900,100 905,115 920,115 908,125 912,140 900,130 888,140 892,125 880,115 895,115" />
    <polygon points="1050,300 1053,308 1062,308 1055,313 1057,322 1050,317 1043,322 1045,313 1038,308 1047,308" />
  </g>
</svg>
`);

// 2. Categories
const categories = [
  { name: 'cat_women', color: '#c084fc', text: 'WOMEN APPEL' },
  { name: 'cat_men', color: '#60a5fa', text: 'MEN apparel' },
  { name: 'cat_kids', color: '#f472b6', text: 'KIDS WARDROBE' },
  { name: 'cat_accessories', color: '#34d399', text: 'ACCESSORIES' }
];

categories.forEach(cat => {
  saveSVG(path.join(__dirname, 'public', 'images', `${cat.name}.svg`), `
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 350 450" width="100%" height="100%">
    <rect width="100%" height="100%" fill="${cat.color}" />
    <circle cx="175" cy="225" r="100" fill="#ffffff" opacity="0.15" />
    <text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle" fill="#ffffff" font-family="'Plus Jakarta Sans', sans-serif" font-weight="800" font-size="20" letter-spacing="2">${cat.text}</text>
  </svg>
  `);
});

// 3. Products
const products = [
  { file: 'men_ethnic_kurta', color: '#f59e0b', stroke: '#1E1B4B', name: 'Silk Kurta' },
  { file: 'men_ethnic_kurta_alt1', color: '#d97706', stroke: '#ffffff', name: 'Silk Kurta Details' },
  { file: 'men_western_denim', color: '#1d4ed8', stroke: '#ffffff', name: 'Indigo Jeans' },
  { file: 'men_western_denim_alt1', color: '#1e3a8a', stroke: '#f59e0b', name: 'Jeans Details' },
  { file: 'women_ethnic_saree', color: '#047857', stroke: '#f59e0b', name: 'Banarasi Saree' },
  { file: 'women_ethnic_saree_alt1', color: '#065f46', stroke: '#ffffff', name: 'Saree Zari border' },
  { file: 'women_western_dress', color: '#db2777', stroke: '#ffffff', name: 'Summer Dress' },
  { file: 'women_western_dress_alt1', color: '#be185d', stroke: '#f59e0b', name: 'Dress Pattern' },
  { file: 'kids_dungaree', color: '#06b6d4', stroke: '#ffffff', name: 'Boy Dungaree' },
  { file: 'kids_dungaree_alt1', color: '#0891b2', stroke: '#f59e0b', name: 'Striped Shirt Set' },
  { file: 'kids_lehenga', color: '#ec4899', stroke: '#ffffff', name: 'Lehenga Choli' },
  { file: 'kids_lehenga_alt1', color: '#db2777', stroke: '#f59e0b', name: 'Mirror work' },
  { file: 'kids_romper', color: '#a855f7', stroke: '#ffffff', name: 'Baby Romper' },
  { file: 'kids_romper_alt1', color: '#9333ea', stroke: '#f59e0b', name: 'Baby Pack' },
  { file: 'acc_mojari', color: '#b45309', stroke: '#ffffff', name: 'Leather Mojari' },
  { file: 'acc_clutch', color: '#be185d', stroke: '#f59e0b', name: 'Ethnic Clutch' },
  { file: 'acc_giftset', color: '#1f2937', stroke: '#ffffff', name: 'Wallet & Belt Set' },
  { file: 'placeholder', color: '#9ca3af', stroke: '#ffffff', name: 'Little to Large' }
];

products.forEach(p => {
  saveSVG(path.join(__dirname, 'public', 'images', 'products', `${p.file}.svg`), `
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 350 450" width="100%" height="100%">
    <rect width="100%" height="100%" fill="${p.color}" />
    <circle cx="175" cy="180" r="80" fill="#ffffff" opacity="0.1" />
    <g transform="translate(135, 140) scale(0.4)" stroke="${p.stroke}" stroke-width="6" fill="none">
      <path d="M100,50 L150,50 L180,120 L150,150 L170,380 L80,380 L100,150 L70,120 Z" />
      <path d="M100,50 Q125,75 150,50" />
    </g>
    <rect x="20" y="320" width="310" height="110" rx="10" fill="#ffffff" />
    <text x="50%" y="360" dominant-baseline="middle" text-anchor="middle" fill="hsl(243, 75%, 19%)" font-family="'Plus Jakarta Sans', sans-serif" font-weight="800" font-size="16">${p.name}</text>
    <text x="50%" y="390" dominant-baseline="middle" text-anchor="middle" fill="hsl(16, 96%, 53%)" font-family="'Plus Jakarta Sans', sans-serif" font-weight="700" font-size="13">PREMIUM INDIAN SELECTION</text>
  </svg>
  `);
});

// Brand story background
saveSVG(path.join(__dirname, 'public', 'images', 'brand_story.svg'), `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 420" width="100%" height="100%">
  <rect width="100%" height="100%" fill="#a78bfa" />
  <circle cx="300" cy="210" r="120" fill="#ffffff" opacity="0.1" />
  <text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle" fill="#ffffff" font-family="'Plus Jakarta Sans', sans-serif" font-weight="800" font-size="28">HANDCRAFTED HERITAGE</text>
</svg>
`);

console.log("Image generation completed successfully.");
