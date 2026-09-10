# Packs

A pack is a single JSON file holding sets **and the bytes of every image they
use**, so it can be shared or imported with nothing missing. Import one from the
Packs panel in the host view.

## photo-packs.pack.json

Best Dog Breed, Best Pasta Shape, Best Musical Instrument, Best Sea Creature,
Best Footwear — a picture on all 80 entries.

## food-fights.pack.json

Best Vegetable, Best Way to Cook an Egg, Best Potato, Best Ice Cream Flavor,
Best Pizza Topping — another 80. Built to the same recipe as Best Fruit:
everyone has eaten all sixteen, they're directly comparable, and a few are
famously divisive.

**You don't need to import these.** Those sets are already in
[../data/sets/](../data/sets/); this pack exists to carry their images, which
are gitignored. The server restores anything missing from here on start, so a
fresh clone just works — `npm start` and the pictures are there. `npm run
restore` does the same by hand.

Every image came from [Wikimedia Commons](https://commons.wikimedia.org) and is
public domain or Creative Commons. Attribution for each is in
[photo-packs.credits.md](photo-packs.credits.md) and
[food-fights.credits.md](food-fights.credits.md), and the license is stored next
to each image inside the pack too.

## Why images aren't committed directly

`data/images/` is gitignored on purpose: it also holds anything you drop or
paste in yourself, which has unknown provenance and shouldn't be republished
under this project's license. Shipping the curated, freely-licensed ones inside
a pack keeps that line clear — and restore only writes images that a committed
set actually references, so a pack can't drop loose files into your tree.
