/* THREADS — what the homepage shows until the owner changes it in Admin → Homepage.
   Loaded by the store and by the admin, so both always agree. Image paths are site paths. */
window.HOME_DEFAULTS = {
  sections: { wall: true, promises: true, banner1: true, categories: true, brands: true, pick: true, banner2: true, how: true, visit: true, faq: true },
  promises: [
    { title: '100% original', text: 'Straight from Nike, adidas, On and The North Face. Never a copy, never a first copy.' },
    { title: 'Cash on delivery', text: 'Order in a minute, pay at your door. Anywhere in Lebanon, no card needed.' },
    { title: 'Try it on in store', text: 'Feel the fabric and find your size at the shop in Wadi Chahrour.' },
  ],
  // the shop wall, photographed in store for Instagram
  wall: [
    { image: '/instore/shorts-black-taupe.webp', caption: 'Black or taupe?', sku: 'ON-SHT-BLK' },
    { image: '/instore/on-coral-set.webp', caption: 'Colour that does not try too hard', sku: 'ON-SET-CRL' },
    { image: '/instore/nike-mint-top.webp', caption: 'Fresh fit, fresh energy', link: 'https://www.instagram.com/p/DeZEoxqli8w/' },
    { image: '/instore/tnf-lavender-set.webp', caption: 'Not your basic sportswear', sku: 'TNF-SET-LAV' },
    { image: '/instore/shorts-pink-white.webp', caption: 'Blush or classic white?', sku: 'ON-SHT-BLS' },
    { image: '/instore/adidas-set.webp', caption: 'Simple never gets old', link: 'https://www.instagram.com/p/DeZSqfdFpAf/' },
    { image: '/instore/nike-white-set.webp', caption: 'Two colours, one easy look', sku: 'NK-SET-WHT' },
    { image: '/instore/nike-marbled-tee.webp', caption: 'Stand out in every move', link: 'https://www.instagram.com/p/DeZYLelFmrj/' },
    { image: '/instore/shorts-olive.webp', caption: 'Olive, on repeat', sku: 'ON-SHT-OLV' },
  ],
  brands: [{ name: 'Nike' }, { name: 'Adidas' }, { name: 'On' }, { name: 'The North Face' }],
  categories: [{ name: 'Tracksuits' }, { name: 'Shorts' }, { name: 'Jackets' }, { name: 'Tops' }],
  faq: [
    { q: 'How do I pay?', a: 'In cash, when the order reaches you. You never enter a card on this site.' },
    { q: 'How much is delivery, and where do you deliver?', a: '{fee} anywhere in Lebanon{free}. We deliver to {cities} and the rest of the country.' },
    { q: 'What happens after I order?', a: 'We message you on WhatsApp to confirm the order and your address, then our driver brings it to you.' },
    { q: 'What if the size is wrong?', a: 'Message us on WhatsApp within a few days of delivery. If the piece is unworn with its tags on, we swap the size.' },
    { q: 'Are the products original?', a: 'Yes. Everything we sell is original, straight from the brands.' },
    { q: 'Can I see the pieces in person?', a: 'Yes. Come to THREADS at {address}. Try it on, find your size and take it home the same day.' },
    { q: 'Can I order on WhatsApp instead?', a: 'Yes. Send us the product name and your size on WhatsApp and we take it from there.' },
  ],
};
